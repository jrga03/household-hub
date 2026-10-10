begin;
select plan(10);
select tests.seed();

-- A reversal of pay_h1, as the ledger holds it after an edit
insert into public.debt_payments
  (id, household_id, debt_id, transaction_id, amount_cents, payment_date, device_id,
   is_reversal, reverses_payment_id)
values
  (tests.id('rev_h1'), tests.household('h1'), tests.id('debt_h1'), tests.id('tx_h1'), -1000,
   current_date, 'device-a1', true, tests.id('pay_h1'));

select tests.authenticate_as('a1');

-- Gap 5: deleting a linked transaction keeps both ledger rows, unlinked
select isnt_empty(
  $$ delete from public.transactions where id = tests.id('tx_h1') returning id $$,
  'the creator can delete a debt-linked transaction');
select set_eq(
  $$ select id, transaction_id from public.debt_payments where debt_id = tests.id('debt_h1') $$,
  $$ values (tests.id('pay_h1'), null::uuid), (tests.id('rev_h1'), null::uuid) $$,
  'the payment and its reversal survive with the link cleared');
select is_empty(
  $$ update public.debt_payments set transaction_id = null where id = tests.id('pay_h1') returning id $$,
  'clients still cannot update ledger rows');

-- Gap 2: one reversal per payment
select throws_ok(
  $$ insert into public.debt_payments
       (household_id, debt_id, transaction_id, amount_cents, payment_date, device_id,
        is_reversal, reverses_payment_id)
     values (tests.household('h1'), tests.id('debt_h1'), null, -1000, current_date, 'device-a1',
             true, tests.id('pay_h1')) $$,
  '23505', null, 'a payment can be reversed only once');

-- Gap 4b: duplicate active names are allowed
select lives_ok(
  $$ insert into public.debts (household_id, name, original_amount_cents)
     values (tests.household('h1'), 'H1 loan', 5000) $$,
  'two active debts can share a name');

-- Gap 1 and catch-up: the server owns these timestamps
update public.debts set name = 'Renamed', updated_at = '2000-01-01' where id = tests.id('debt_h1');
select ok(
  (select updated_at > '2000-01-02' from public.debts where id = tests.id('debt_h1')),
  'an update sets debts.updated_at to server time');
insert into public.debts (id, household_id, name, original_amount_cents, updated_at)
values (tests.id('debt_h1_new'), tests.household('h1'), 'New', 5000, '2000-01-01');
select ok(
  (select updated_at > '2000-01-02' from public.debts where id = tests.id('debt_h1_new')),
  'an insert sets debts.updated_at to server time');
update public.internal_debts set name = 'Renamed IOU', updated_at = '2000-01-01'
where id = tests.id('idebt_h1');
select ok(
  (select updated_at > '2000-01-02' from public.internal_debts where id = tests.id('idebt_h1')),
  'an update sets internal_debts.updated_at to server time');
insert into public.internal_debts
  (id, household_id, name, original_amount_cents, from_type, from_id, from_display_name,
   to_type, to_id, to_display_name, updated_at)
values (tests.id('idebt_h1_new'), tests.household('h1'), 'New IOU', 5000, 'member',
        tests.id('user_a1'), 'A1', 'member', tests.id('user_a2'), 'A2', '2000-01-01');
select ok(
  (select updated_at > '2000-01-02' from public.internal_debts where id = tests.id('idebt_h1_new')),
  'an insert sets internal_debts.updated_at to server time');
insert into public.debt_payments
  (id, household_id, debt_id, transaction_id, amount_cents, payment_date, device_id, created_at)
values (tests.id('pay_h1_late'), tests.household('h1'), tests.id('debt_h1_new'),
        tests.id('tx_h1_personal_a1'), 500, current_date, 'device-a1', '2000-01-01');
select ok(
  (select created_at > '2000-01-02' from public.debt_payments where id = tests.id('pay_h1_late')),
  'an insert sets debt_payments.created_at to server time');

select * from finish();
rollback;
