-- Transaction Events table for event sourcing
-- All mutations stored as immutable events for audit trail and sync

CREATE TABLE transaction_events (
  -- Event identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,

  -- What changed
  entity_type TEXT NOT NULL DEFAULT 'transaction' CHECK (
    entity_type IN ('transaction', 'account', 'category', 'budget')
  ),
  entity_id UUID NOT NULL,           -- ID of the specific entity
  op TEXT NOT NULL CHECK (
    op IN ('create', 'update', 'delete')
  ),
  payload JSONB NOT NULL,            -- Changed data (full for create, delta for update)

  -- When and by whom
  actor_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,

  -- Idempotency and versioning
  idempotency_key TEXT UNIQUE NOT NULL,
  event_version INT DEFAULT 1 NOT NULL,

  -- Conflict resolution (per-entity clocks)
  lamport_clock BIGINT NOT NULL,     -- Logical timestamp for this entity
  vector_clock JSONB NOT NULL,       -- Per-device clocks: { device_id: clock_value }

  -- Data integrity
  checksum TEXT NOT NULL,            -- SHA-256 hash of payload

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for common query patterns
-- Query events for household
CREATE INDEX idx_events_household ON transaction_events(household_id);

-- Query events for specific entity in chronological order
CREATE INDEX idx_events_entity ON transaction_events(entity_type, entity_id, lamport_clock);

-- Query events from specific device
CREATE INDEX idx_events_device ON transaction_events(device_id, created_at);

-- Query events by timestamp (for sync and retention)
CREATE INDEX idx_events_created_at ON transaction_events(created_at);

-- Query events by actor (audit trail)
CREATE INDEX idx_events_actor ON transaction_events(actor_user_id, created_at);

-- Lamport clock lookups for next value
CREATE INDEX idx_events_lamport ON transaction_events(entity_id, lamport_clock DESC);

-- Row Level Security
ALTER TABLE transaction_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- SELECT: All authenticated household members can view events
-- Audit trail is visible to everyone in the household for transparency
CREATE POLICY "Users can view events for their household"
  ON transaction_events FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Users can create events (via app logic, not direct inserts)
CREATE POLICY "Users can create events"
  ON transaction_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE/DELETE: Prohibited (events are immutable)
-- No policies needed - default deny

-- Comments for documentation
COMMENT ON TABLE transaction_events IS 'Immutable event log for event sourcing. Every mutation generates an event for audit trail and multi-device sync.';
COMMENT ON COLUMN transaction_events.household_id IS 'Household this event belongs to. Default UUID for MVP single-household mode.';
COMMENT ON COLUMN transaction_events.entity_type IS 'Type of entity being modified (transaction, account, category, budget).';
COMMENT ON COLUMN transaction_events.entity_id IS 'UUID of the specific entity. Scopes lamport_clock and vector_clock to this entity.';
COMMENT ON COLUMN transaction_events.op IS 'Operation type: create (full record), update (changed fields only), delete (mark as deleted).';
COMMENT ON COLUMN transaction_events.payload IS 'JSONB payload. For create: full record. For update: only changed fields. For delete: deletion metadata.';
COMMENT ON COLUMN transaction_events.actor_user_id IS 'Profile ID of user who performed the action. References profiles table, not auth.users directly.';
COMMENT ON COLUMN transaction_events.idempotency_key IS 'Unique key to prevent duplicate event processing. Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}';
COMMENT ON COLUMN transaction_events.lamport_clock IS 'Logical timestamp scoped to this entity. Increments with each event for the entity. Used for ordering and conflict resolution.';
COMMENT ON COLUMN transaction_events.vector_clock IS 'Per-device clock values for this entity. Format: {"device-abc": 5, "device-xyz": 3}. Used in Phase B for advanced conflict detection.';
COMMENT ON COLUMN transaction_events.checksum IS 'SHA-256 hash of payload for data integrity verification.';

-- Event retention function (for future use)
CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS void AS $$
BEGIN
  -- Keep events from last 90 days
  DELETE FROM transaction_events
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_events IS 'Remove events older than 90 days. Run periodically via cron. Phase B will implement smarter compaction strategy.';
