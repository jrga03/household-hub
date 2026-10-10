-- Debts UI spec (docs/plans/2026-10-10-debts-ui-design.md), section 1: close the
-- cross-device gaps that become reachable once debts are creatable.

-- Gap 1: the server owns debts.updated_at. Inserts too: a debt created offline
-- must sort by arrival, or another device's catch-up mark skips it.
drop trigger if exists debts_set_updated_at on public.debts;
create trigger debts_set_updated_at
  before insert or update on public.debts
  for each row execute function update_updated_at_column();

drop trigger if exists internal_debts_set_updated_at on public.internal_debts;
create trigger internal_debts_set_updated_at
  before insert or update on public.internal_debts
  for each row execute function update_updated_at_column();

-- Catch-up pulls debt_payments on created_at; a late insert from an offline
-- device must sort by arrival too.
create or replace function public.set_created_at_now()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  return new;
end
$$;

drop trigger if exists debt_payments_set_created_at on public.debt_payments;
create trigger debt_payments_set_created_at
  before insert on public.debt_payments
  for each row execute function public.set_created_at_now();

-- Gap 5: deleting a transaction keeps its ledger rows and clears their link.
-- Referential actions bypass RLS, so debt_payments stays append-only for clients.
alter table public.debt_payments alter column transaction_id drop not null;
alter table public.debt_payments drop constraint debt_payments_transaction_id_fkey;
alter table public.debt_payments
  add constraint debt_payments_transaction_id_fkey
  foreign key (transaction_id) references public.transactions(id) on delete set null;

-- Gap 2: a payment is reversed at most once, whichever device gets there first.
create unique index debt_payments_reverses_payment_id_unique
  on public.debt_payments (reverses_payment_id)
  where reverses_payment_id is not null;

-- Gap 4b: ids are the identity; a duplicate display name must not strand an
-- offline create and every payment queued behind it.
drop index if exists public.idx_debts_household_name_unique;
drop index if exists public.idx_internal_debts_household_name_unique;
