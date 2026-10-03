-- Transfer exclusion in the schema (roadmap 4.6). security_invoker runs the view
-- with the caller's rights, so the transactions RLS policies still apply.
-- Postgres expands * when the view is created: after adding a column to
-- transactions, recreate this view (supabase/tests/210_* fails until you do).
CREATE VIEW public.transactions_non_transfer
  WITH (security_invoker = true) AS
  SELECT * FROM public.transactions WHERE transfer_group_id IS NULL;

-- Supabase's default privileges grant new relations to anon and authenticated.
-- Clients only read this view; writes stay on transactions.
REVOKE ALL ON public.transactions_non_transfer FROM anon, authenticated;
GRANT SELECT ON public.transactions_non_transfer TO authenticated;
