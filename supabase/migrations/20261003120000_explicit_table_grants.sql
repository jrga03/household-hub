-- Explicit table privileges for the public schema.
-- Older supabase/postgres images (production, 17.6.1.063) set default privileges that
-- grant anon, authenticated and service_role full access in public. Newer images
-- (17.6.1.143) do not, so a fresh database was unusable by the app. Naming the grants
-- here makes every database behave the same. On production this is a no-op except
-- that anon loses its table access; RLS stays the row-level gate for authenticated.

grant select, insert, update, delete on table
  public.accounts,
  public.budgets,
  public.categories,
  public.debt_payments,
  public.debts,
  public.devices,
  public.internal_debts,
  public.profiles,
  public.push_subscriptions,
  public.sync_queue,
  public.transaction_events,
  public.transactions
to authenticated;

grant all on table
  public.accounts,
  public.budgets,
  public.categories,
  public.debt_payments,
  public.debts,
  public.devices,
  public.internal_debts,
  public.profiles,
  public.push_subscriptions,
  public.sync_queue,
  public.transaction_events,
  public.transactions
to service_role;

revoke all on table
  public.accounts,
  public.budgets,
  public.categories,
  public.debt_payments,
  public.debts,
  public.devices,
  public.internal_debts,
  public.profiles,
  public.push_subscriptions,
  public.sync_queue,
  public.transaction_events,
  public.transactions
from anon;

grant usage, select on all sequences in schema public to authenticated, service_role;
