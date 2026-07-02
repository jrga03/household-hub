-- ============================================================================
-- Security hardening migration
-- Addresses findings from the 2026-07-02 architecture review
-- (docs/reviews/2026-07-02-architecture-review.md):
--   SEC-01: transactions RLS lacked household scoping and WITH CHECK
--   SEC-02: budgets RLS was USING (true)
--   SEC-03: SECURITY DEFINER functions callable by anon/authenticated
--   SEC-05: transaction_events deletable via CASCADE, spoofable on insert
--   SEC-06: debt_payments RLS allowed UPDATE/DELETE on "immutable" history
--   INFRA-02: budget threshold month matching off by one day
--   INFRA-03: transfer pair invariant enforced by race-prone counting trigger
--   DATA-03: deleting one transfer leg converted the survivor to real spend
--   DATA-02: server-side balance aggregation RPC (replaces unbounded fetches)
-- ============================================================================

-- ============================================================================
-- 1. SEC-01: Transactions policies - household scoping + WITH CHECK
-- ============================================================================

DROP POLICY IF EXISTS "View transactions" ON transactions;
DROP POLICY IF EXISTS "Create transactions" ON transactions;
DROP POLICY IF EXISTS "Update transactions" ON transactions;
DROP POLICY IF EXISTS "Delete transactions" ON transactions;

CREATE POLICY "View transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    household_id = get_user_household_id()
    AND (visibility = 'household' OR created_by_user_id = auth.uid())
  );

CREATE POLICY "Create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = get_user_household_id()
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY "Update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    household_id = get_user_household_id()
    AND (created_by_user_id = auth.uid() OR visibility = 'household')
  )
  WITH CHECK (
    household_id = get_user_household_id()
    AND (created_by_user_id = auth.uid() OR visibility = 'household')
  );

CREATE POLICY "Delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (
    household_id = get_user_household_id()
    AND created_by_user_id = auth.uid()
  );

COMMENT ON POLICY "View transactions" ON transactions IS
  'Household-scoped: members see household-visible rows plus their own personal rows';
COMMENT ON POLICY "Update transactions" ON transactions IS
  'Household-scoped; WITH CHECK prevents moving rows out of the household. Ownership pinning enforced by pin_transaction_ownership trigger';

-- Ownership pinning: RLS WITH CHECK cannot reference OLD, so a trigger
-- prevents rewriting authorship or hiding another member''s row.
CREATE OR REPLACE FUNCTION pin_transaction_ownership()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.created_by_user_id IS NOT NULL
     AND NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'created_by_user_id is immutable';
  END IF;

  IF NEW.visibility IS DISTINCT FROM OLD.visibility
     AND OLD.created_by_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the creator can change transaction visibility';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS pin_transaction_ownership_trigger ON transactions;
CREATE TRIGGER pin_transaction_ownership_trigger
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION pin_transaction_ownership();

-- ============================================================================
-- 2. SEC-02: Budgets policies - replace USING (true)
-- ============================================================================

DROP POLICY IF EXISTS "Manage budgets" ON budgets;

CREATE POLICY "Manage budgets"
  ON budgets FOR ALL
  TO authenticated
  USING (household_id = get_user_household_id())
  WITH CHECK (household_id = get_user_household_id());

COMMENT ON POLICY "Manage budgets" ON budgets IS
  'Household members manage their household''s budgets only';

-- ============================================================================
-- 3. SEC-06: debt_payments - append-only (SELECT + INSERT, no UPDATE/DELETE)
-- ============================================================================

DROP POLICY IF EXISTS debt_payments_household_access ON debt_payments;

CREATE POLICY debt_payments_select
  ON debt_payments FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id());

CREATE POLICY debt_payments_insert
  ON debt_payments FOR INSERT
  TO authenticated
  WITH CHECK (household_id = get_user_household_id());

COMMENT ON POLICY debt_payments_select ON debt_payments IS
  'Payment history is append-only; corrections use compensating reversal rows';

-- ============================================================================
-- 4. SEC-05: transaction_events - pin authorship, protect from cascades
-- ============================================================================

DROP POLICY IF EXISTS "Users can create events" ON transaction_events;

CREATE POLICY "Users can create events"
  ON transaction_events FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = get_user_household_id()
    AND actor_user_id = auth.uid()
    AND device_id IN (SELECT id FROM devices WHERE user_id = auth.uid())
  );

COMMENT ON POLICY "Users can create events" ON transaction_events IS
  'Events must name the authenticated user as actor and one of their registered devices';

-- Audit log must survive device/profile deletion (was ON DELETE CASCADE)
ALTER TABLE transaction_events
  DROP CONSTRAINT IF EXISTS transaction_events_actor_user_id_fkey;
ALTER TABLE transaction_events
  ADD CONSTRAINT transaction_events_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE RESTRICT;

ALTER TABLE transaction_events
  DROP CONSTRAINT IF EXISTS transaction_events_device_id_fkey;
ALTER TABLE transaction_events
  ADD CONSTRAINT transaction_events_device_id_fkey
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT;

-- ============================================================================
-- 5. SEC-03 + INFRA-02: check_budget_thresholds
--    - restrict execution to service_role (was PUBLIC-executable DEFINER)
--    - fix month matching: t.date is already the canonical local DATE, so
--      "AT TIME ZONE 'Asia/Manila'" shifted 1st-of-month rows into the
--      previous month. Compare via month_key instead.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_budget_thresholds()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  category_id UUID,
  category_name TEXT,
  amount_cents BIGINT,
  spent_cents BIGINT,
  percentage INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH budget_spending AS (
    SELECT
      b.id,
      b.household_id,
      b.category_id,
      b.amount_cents,
      c.name AS category_name,
      COALESCE(SUM(
        CASE
          WHEN t.type = 'expense' AND t.transfer_group_id IS NULL
          THEN t.amount_cents
          ELSE 0
        END
      ), 0) AS spent_cents
    FROM budgets b
    INNER JOIN categories c ON b.category_id = c.id
    LEFT JOIN transactions t ON
      t.category_id = b.category_id
      -- t.date is a DATE in the user's local calendar (Decision #71);
      -- compare year-month directly against the budget's generated month_key
      AND (EXTRACT(YEAR FROM t.date) * 100 + EXTRACT(MONTH FROM t.date))::INT = b.month_key
      AND t.transfer_group_id IS NULL
    WHERE
      b.month >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila'))::DATE
    GROUP BY b.id, b.household_id, b.category_id, b.amount_cents, c.name
  )
  SELECT
    bs.id,
    p.id AS user_id,
    bs.category_id,
    bs.category_name,
    bs.amount_cents,
    bs.spent_cents,
    CASE
      WHEN bs.amount_cents > 0
      THEN ((bs.spent_cents * 100) / bs.amount_cents)::INTEGER
      ELSE 0
    END AS percentage
  FROM budget_spending bs
  CROSS JOIN profiles p
  WHERE
    p.household_id = bs.household_id
    AND bs.amount_cents > 0
    AND ((bs.spent_cents * 100) / bs.amount_cents) >= 80
  ORDER BY percentage DESC;
END;
$$;

REVOKE ALL ON FUNCTION check_budget_thresholds() FROM PUBLIC;
REVOKE ALL ON FUNCTION check_budget_thresholds() FROM anon;
REVOKE ALL ON FUNCTION check_budget_thresholds() FROM authenticated;
GRANT EXECUTE ON FUNCTION check_budget_thresholds() TO service_role;

COMMENT ON FUNCTION check_budget_thresholds() IS
  'SECURITY DEFINER, service_role only: returns cross-household budget alerts for the budget-alerts edge function. Do not grant to anon/authenticated (data leak).';

-- SEC-03: cleanup_old_sync_queue deletes across users; cron/service only
REVOKE ALL ON FUNCTION cleanup_old_sync_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION cleanup_old_sync_queue() FROM anon;
REVOKE ALL ON FUNCTION cleanup_old_sync_queue() FROM authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_sync_queue() TO service_role;

-- ============================================================================
-- 6. INFRA-03 + DATA-03: transfer integrity
-- ============================================================================

-- Enforce the pair invariant at the storage layer: at most one income and
-- one expense leg per transfer group, immune to concurrent-insert races that
-- the counting trigger cannot see.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transfer_group_leg_type
  ON transactions(transfer_group_id, type)
  WHERE transfer_group_id IS NOT NULL;

COMMENT ON INDEX uniq_transfer_group_leg_type IS
  'A transfer group has exactly one income and one expense leg; enforced here rather than by trigger counting so concurrent inserts cannot violate it';

-- Deleting one leg previously nullified the survivor''s transfer_group_id,
-- converting it into real income/expense that polluted analytics (DATA-03).
-- Delete the sibling instead; pg_trigger_depth() guards the recursive fire.
CREATE OR REPLACE FUNCTION handle_transfer_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.transfer_group_id IS NOT NULL AND pg_trigger_depth() = 1 THEN
    DELETE FROM transactions
    WHERE transfer_group_id = OLD.transfer_group_id
      AND id != OLD.id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

COMMENT ON FUNCTION handle_transfer_deletion() IS
  'Deleting one transfer leg deletes its pair. Both legs share a creator, so the creator-only DELETE policy admits the cascading delete.';

-- ============================================================================
-- 7. DATA-02: server-side balance aggregation
--    Replaces client-side aggregation over unbounded row fetches, which
--    PostgREST silently truncates at max-rows (1,000 by default).
--    NOT SECURITY DEFINER: runs under the caller''s RLS, so results cover
--    exactly the rows the user could have fetched themselves.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_account_balances(p_account_ids UUID[] DEFAULT NULL)
RETURNS TABLE (
  account_id UUID,
  cleared_delta_cents BIGINT,
  pending_delta_cents BIGINT,
  cleared_count BIGINT,
  pending_count BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    t.account_id,
    COALESCE(SUM(
      CASE WHEN t.status = 'cleared'
        THEN CASE WHEN t.type = 'income' THEN t.amount_cents ELSE -t.amount_cents END
        ELSE 0
      END
    ), 0)::BIGINT AS cleared_delta_cents,
    COALESCE(SUM(
      CASE WHEN t.status <> 'cleared'
        THEN CASE WHEN t.type = 'income' THEN t.amount_cents ELSE -t.amount_cents END
        ELSE 0
      END
    ), 0)::BIGINT AS pending_delta_cents,
    COUNT(*) FILTER (WHERE t.status = 'cleared') AS cleared_count,
    COUNT(*) FILTER (WHERE t.status <> 'cleared') AS pending_count
  FROM transactions t
  WHERE t.account_id IS NOT NULL
    AND (p_account_ids IS NULL OR t.account_id = ANY (p_account_ids))
  GROUP BY t.account_id
$$;

REVOKE ALL ON FUNCTION get_account_balances(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_account_balances(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION get_account_balances(UUID[]) TO authenticated;

COMMENT ON FUNCTION get_account_balances(UUID[]) IS
  'Per-account balance deltas in integer cents, computed server-side under the caller''s RLS. Transfers are intentionally INCLUDED (they move money between accounts).';
