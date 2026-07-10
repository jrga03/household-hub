-- ============================================================================
-- transactions_filter_summary RPC
-- Mobile UX review R10 (docs/reviews/2026-07-07-mobile-ux-review.md), plan
-- item 7.1, decision 4 (RPC over PostgREST aggregates, which are disabled by
-- default on Supabase).
--
-- The transactions list is paged (useInfiniteQuery), so the client can no
-- longer count rows or sum In/Out totals from what it has loaded: past the
-- first page those numbers silently under-report. This function answers the
-- filter-header question ("N transactions", In/Out totals) over the WHOLE
-- filtered set in one round trip.
--
-- Filter parameters mirror the client's TransactionFilters exactly
-- (src/types/transactions.ts + buildTransactionsListQuery in
-- src/lib/supabaseQueries.ts). NULL means "filter not applied".
--   p_date_from          DATE     inclusive lower bound on transactions.date
--   p_date_to            DATE     inclusive upper bound on transactions.date
--   p_account_id         UUID     exact account match
--   p_category_id        UUID     exact category match
--   p_status             TEXT     'pending' | 'cleared'
--   p_type               TEXT     'income' | 'expense'
--   p_amount_min         BIGINT   inclusive lower bound on amount_cents
--   p_amount_max         BIGINT   inclusive upper bound on amount_cents
--   p_search             TEXT     ILIKE '%search%' on description OR notes,
--                                 matching the client's .or(ilike) clause
--   p_exclude_transfers  BOOLEAN  default TRUE: transfer legs are account
--                                 movements, not income/expense — excluding
--                                 them (transfer_group_id IS NULL) is the
--                                 repo-wide analytics rule
--
-- Returns exactly one row:
--   txn_count        BIGINT  rows matching the filters
--   total_in_cents   BIGINT  SUM(amount_cents) of matching income rows
--   total_out_cents  BIGINT  SUM(amount_cents) of matching expense rows
--
-- SECURITY INVOKER (explicit): runs under the caller's RLS, so the summary
-- covers exactly the rows the user could have listed themselves.
-- ============================================================================

CREATE OR REPLACE FUNCTION transactions_filter_summary(
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_account_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_amount_min BIGINT DEFAULT NULL,
  p_amount_max BIGINT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_exclude_transfers BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  txn_count BIGINT,
  total_in_cents BIGINT,
  total_out_cents BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::BIGINT AS txn_count,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0)::BIGINT
      AS total_in_cents,
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0)::BIGINT
      AS total_out_cents
  FROM transactions t
  WHERE (p_date_from IS NULL OR t.date >= p_date_from)
    AND (p_date_to IS NULL OR t.date <= p_date_to)
    AND (p_account_id IS NULL OR t.account_id = p_account_id)
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_status IS NULL OR t.status = p_status)
    AND (p_type IS NULL OR t.type = p_type)
    AND (p_amount_min IS NULL OR t.amount_cents >= p_amount_min)
    AND (p_amount_max IS NULL OR t.amount_cents <= p_amount_max)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR t.description ILIKE '%' || p_search || '%'
      OR t.notes ILIKE '%' || p_search || '%'
    )
    -- CRITICAL: exclude transfers unless explicitly included
    AND (NOT p_exclude_transfers OR t.transfer_group_id IS NULL)
$$;

REVOKE ALL ON FUNCTION transactions_filter_summary(
  DATE, DATE, UUID, UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT, BOOLEAN
) FROM PUBLIC;
REVOKE ALL ON FUNCTION transactions_filter_summary(
  DATE, DATE, UUID, UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT, BOOLEAN
) FROM anon;
GRANT EXECUTE ON FUNCTION transactions_filter_summary(
  DATE, DATE, UUID, UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT, BOOLEAN
) TO authenticated;

COMMENT ON FUNCTION transactions_filter_summary(
  DATE, DATE, UUID, UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT, BOOLEAN
) IS
  'Exact count + income/expense totals (integer cents) for the transactions filter header, computed server-side under the caller''s RLS. Params mirror the client TransactionFilters; transfers excluded by default (transfer_group_id IS NULL). See mobile UX review R10.';
