-- Fix transaction_events RLS policies and cleanup function
-- Addresses code review P0 issues from chunk 028

-- ============================================================================
-- P0 FIX #1: Replace overly permissive RLS policies with household-scoped policies
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view events for their household" ON transaction_events;
DROP POLICY IF EXISTS "Users can create events" ON transaction_events;

-- SELECT: Scope to user's household using helper function
CREATE POLICY "Users can view events for their household"
  ON transaction_events FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id());

-- INSERT: Ensure events can only be created for user's household
CREATE POLICY "Users can create events"
  ON transaction_events FOR INSERT
  TO authenticated
  WITH CHECK (household_id = get_user_household_id());

-- UPDATE/DELETE: Still prohibited (events are immutable)
-- No policies needed - default deny

COMMENT ON POLICY "Users can view events for their household" ON transaction_events IS
  'Users can only view events for their household. Uses get_user_household_id() helper function for consistency with other tables.';

COMMENT ON POLICY "Users can create events" ON transaction_events IS
  'Users can only create events for their household. Ensures event isolation across households for Phase 2 multi-household support.';

-- ============================================================================
-- P0 FIX #2: Replace dangerous cleanup function with safe per-entity retention
-- ============================================================================

-- Drop existing function first (return type is changing from void to table)
DROP FUNCTION IF EXISTS cleanup_old_events();

-- Recreate with safe per-entity logic
CREATE FUNCTION cleanup_old_events()
RETURNS TABLE(deleted_count BIGINT) AS $$
DECLARE
  retention_cutoff TIMESTAMPTZ := NOW() - INTERVAL '90 days';
  entity RECORD;
  entity_deleted_count INT := 0;
  total_deleted BIGINT := 0;
BEGIN
  -- Iterate through entities with events older than cutoff
  FOR entity IN
    SELECT DISTINCT entity_type, entity_id
    FROM transaction_events
    WHERE created_at < retention_cutoff
  LOOP
    -- Delete old events but ALWAYS keep the last 10 for each entity
    -- This prevents orphaning entities and maintains audit trail continuity
    DELETE FROM transaction_events
    WHERE entity_type = entity.entity_type
      AND entity_id = entity.entity_id
      AND created_at < retention_cutoff
      AND id NOT IN (
        -- Keep the 10 most recent events per entity (by lamport_clock)
        SELECT id FROM transaction_events
        WHERE entity_type = entity.entity_type
          AND entity_id = entity.entity_id
        ORDER BY lamport_clock DESC
        LIMIT 10
      );

    GET DIAGNOSTICS entity_deleted_count = ROW_COUNT;
    total_deleted := total_deleted + entity_deleted_count;

    IF entity_deleted_count > 0 THEN
      RAISE NOTICE 'Deleted % old events for % %',
        entity_deleted_count, entity.entity_type, entity.entity_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Event cleanup completed: % total events deleted at %',
    total_deleted, NOW();

  RETURN QUERY SELECT total_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_events IS
  'Remove events older than 90 days while ALWAYS preserving the last 10 events per entity.
   This prevents orphaning entities and maintains audit trail. Returns count of deleted events.
   Run periodically via cron (e.g., weekly). Phase B will add snapshot creation before deletion.

   SAFETY: Uses per-entity retention logic - never deletes all events for an entity.
   PERFORMANCE: Processes entities one at a time to avoid blocking. For >100k events,
   consider adding LIMIT clause to batch deletions.';

-- ============================================================================
-- P1 FIX: Optimize entity index to include household_id as leading column
-- ============================================================================

-- Drop existing entity index
DROP INDEX IF EXISTS idx_events_entity;

-- Recreate with household_id as leading column for better query performance
-- This aligns with RLS filtering and supports future multi-household queries
CREATE INDEX idx_events_entity ON transaction_events(
  household_id,
  entity_type,
  entity_id,
  lamport_clock
);

COMMENT ON INDEX idx_events_entity IS
  'Optimized compound index for entity timeline queries. Leading with household_id
   aligns with RLS policy filtering and improves query planner efficiency. Supports:
   - Entity event history (SELECT WHERE entity_id = $1 ORDER BY lamport_clock)
   - Household event queries (SELECT WHERE household_id = $1 AND entity_type = $2)
   - Multi-household event aggregation (Phase 2)';

-- ============================================================================
-- Verification queries (run manually to confirm fixes)
-- ============================================================================

-- Verify RLS policies updated
-- Expected: 2 policies with household_id filters, NOT (true)
-- SELECT polname, polcmd, qual::text
-- FROM pg_policy
-- WHERE polrelid = 'transaction_events'::regclass;

-- Verify cleanup function is safe
-- Expected: Function contains "LIMIT 10" and "NOT IN" clauses
-- SELECT prosrc
-- FROM pg_proc
-- WHERE proname = 'cleanup_old_events';

-- Verify index updated
-- Expected: idx_events_entity has household_id as first column
-- SELECT indexdef
-- FROM pg_indexes
-- WHERE tablename = 'transaction_events' AND indexname = 'idx_events_entity';
