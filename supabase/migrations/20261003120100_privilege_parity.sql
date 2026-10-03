-- Privilege parity with a fresh database built from migrations.
-- Older supabase/postgres images (production, 17.6.1.063) granted every privilege on
-- public tables to anon, authenticated and service_role, and installed default
-- privileges doing the same for future tables, sequences and functions. Newer images
-- do not. TRUNCATE bypasses RLS, so authenticated must hold DML only, and objects
-- added by later migrations must stay unexposed until a migration grants them.
-- Default privileges owned by supabase_admin cannot be altered by the postgres
-- migration role and are left as they are.

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
from authenticated;

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

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
