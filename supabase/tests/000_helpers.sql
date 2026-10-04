-- Shared helpers for the pgTAP suite. This file sorts first and COMMITS, so the
-- `tests` schema exists for every later file. Test-only: never put it in a migration.
begin;
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Deterministic UUID per fixture label, e.g. tests.id('acc_h1').
create or replace function tests.id(label text) returns uuid
language sql immutable as $$ select md5(label)::uuid $$;

-- Fresh household ids, never the profiles.household_id default, so local dev
-- rows in the default household stay invisible to fixture users.
create or replace function tests.household(label text) returns uuid
language sql immutable as $$ select md5('household_' || label)::uuid $$;

-- Switch to the authenticated role as a fixture user ('a1', 'a2', 'b1').
create or replace function tests.authenticate_as(user_label text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', tests.id('user_' || user_label), 'role', 'authenticated')::text,
    true
  );
end
$$;

create or replace function tests.authenticate_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end
$$;

-- Fixture: households h1 (users a1, a2) and h2 (user b1), one device each, and
-- rows in every table for both households. Call as postgres, before switching role.
create or replace function tests.seed() returns void
language plpgsql as $$
declare
  h1 uuid := tests.household('h1');
  h2 uuid := tests.household('h2');
  this_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date;
begin
  insert into auth.users (id, email, aud, role) values
    (tests.id('user_a1'), 'a1@test.local', 'authenticated', 'authenticated'),
    (tests.id('user_a2'), 'a2@test.local', 'authenticated', 'authenticated'),
    (tests.id('user_b1'), 'b1@test.local', 'authenticated', 'authenticated');
  update public.profiles set household_id = h1 where id in (tests.id('user_a1'), tests.id('user_a2'));
  update public.profiles set household_id = h2 where id = tests.id('user_b1');

  insert into public.devices (id, user_id, household_id, name, platform, fingerprint) values
    ('device-a1', tests.id('user_a1'), h1, 'A1 laptop', 'web', 'device-a1'),
    ('device-a2', tests.id('user_a2'), h1, 'A2 phone', 'web', 'device-a2'),
    ('device-b1', tests.id('user_b1'), h2, 'B1 laptop', 'web', 'device-b1');

  insert into public.accounts (id, household_id, name, type, visibility, owner_user_id) values
    (tests.id('acc_h1'), h1, 'H1 joint', 'bank', 'household', null),
    (tests.id('acc_h1_personal_a1'), h1, 'A1 wallet', 'cash', 'personal', tests.id('user_a1')),
    (tests.id('acc_h2'), h2, 'H2 joint', 'bank', 'household', null);

  insert into public.categories (id, household_id, name, parent_id) values
    (tests.id('cat_h1_parent'), h1, 'H1 Food', null),
    (tests.id('cat_h1_child'), h1, 'H1 Groceries', tests.id('cat_h1_parent')),
    (tests.id('cat_h2'), h2, 'H2 Food', null);

  insert into public.transactions
    (id, household_id, date, description, amount_cents, type, account_id, category_id,
     visibility, created_by_user_id, transfer_group_id) values
    (tests.id('tx_h1'), h1, this_month, 'H1 groceries', 10000, 'expense',
     tests.id('acc_h1'), tests.id('cat_h1_child'), 'household', tests.id('user_a1'), null),
    (tests.id('tx_h1_personal_a1'), h1, this_month, 'A1 personal', 2000, 'expense',
     tests.id('acc_h1_personal_a1'), tests.id('cat_h1_child'), 'personal', tests.id('user_a1'), null),
    (tests.id('tx_h1_transfer_out'), h1, this_month, 'H1 transfer out', 5000, 'expense',
     tests.id('acc_h1'), tests.id('cat_h1_child'), 'household', tests.id('user_a1'), tests.id('tg_h1')),
    (tests.id('tx_h1_transfer_in'), h1, this_month, 'H1 transfer in', 5000, 'income',
     tests.id('acc_h1_personal_a1'), null, 'household', tests.id('user_a1'), tests.id('tg_h1')),
    (tests.id('tx_h2'), h2, this_month, 'H2 groceries', 3000, 'expense',
     tests.id('acc_h2'), tests.id('cat_h2'), 'household', tests.id('user_b1'), null);

  insert into public.budgets (id, household_id, category_id, month, amount_cents) values
    (tests.id('bud_h1'), h1, tests.id('cat_h1_child'), this_month, 10000),
    (tests.id('bud_h2'), h2, tests.id('cat_h2'), this_month, 100000);

  insert into public.debts (id, household_id, name, original_amount_cents) values
    (tests.id('debt_h1'), h1, 'H1 loan', 100000),
    (tests.id('debt_h2'), h2, 'H2 loan', 100000);

  insert into public.internal_debts
    (id, household_id, name, original_amount_cents, from_type, from_id, from_display_name,
     to_type, to_id, to_display_name) values
    (tests.id('idebt_h1'), h1, 'H1 IOU', 5000, 'member', tests.id('user_a1'), 'A1',
     'member', tests.id('user_a2'), 'A2'),
    (tests.id('idebt_h2'), h2, 'H2 IOU', 5000, 'account', tests.id('acc_h2'), 'H2 joint',
     'category', tests.id('cat_h2'), 'H2 Food');

  insert into public.debt_payments
    (id, household_id, debt_id, transaction_id, amount_cents, payment_date, device_id) values
    (tests.id('pay_h1'), h1, tests.id('debt_h1'), tests.id('tx_h1'), 1000, this_month, 'device-a1'),
    (tests.id('pay_h2'), h2, tests.id('debt_h2'), tests.id('tx_h2'), 1000, this_month, 'device-b1');

  insert into public.sync_queue
    (id, household_id, entity_type, entity_id, operation, device_id, user_id, status) values
    (tests.id('sq_a1'), h1, 'transaction', 'tx', '{"op":"create"}', 'device-a1', tests.id('user_a1'), 'queued'),
    (tests.id('sq_a1_done'), h1, 'transaction', 'tx', '{"op":"create"}', 'device-a1', tests.id('user_a1'), 'completed'),
    (tests.id('sq_a2'), h1, 'transaction', 'tx', '{"op":"create"}', 'device-a2', tests.id('user_a2'), 'queued');

  insert into public.transaction_events
    (id, household_id, entity_id, op, payload, actor_user_id, device_id, idempotency_key,
     lamport_clock, vector_clock, checksum) values
    (tests.id('ev_h1'), h1, tests.id('tx_h1'), 'create', '{}', tests.id('user_a1'), 'device-a1',
     'ev-h1', 1, '{}', 'c1'),
    (tests.id('ev_h2'), h2, tests.id('tx_h2'), 'create', '{}', tests.id('user_b1'), 'device-b1',
     'ev-h2', 1, '{}', 'c2');

  insert into public.push_subscriptions (id, user_id, device_id, endpoint, p256dh, auth) values
    (tests.id('ps_a1'), tests.id('user_a1'), 'device-a1', 'https://push.test/a1', 'k', 'a'),
    (tests.id('ps_a2'), tests.id('user_a2'), 'device-a2', 'https://push.test/a2', 'k', 'a');
end
$$;

select plan(1);
select has_function('tests', 'seed', 'pgTAP helpers are installed');
select * from finish();
commit;
