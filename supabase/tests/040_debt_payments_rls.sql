begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.debt_payments $$, $$ values (tests.id('pay_h1')) $$,
  'member sees household debt payments');
select lives_ok(
  $$ insert into public.debt_payments (household_id, debt_id, transaction_id, amount_cents, payment_date, device_id)
     values (tests.household('h1'), tests.id('debt_h1'), tests.id('tx_h1'), 500, current_date, 'device-a2') $$,
  'member can record a payment');
select is_empty(
  $$ update public.debt_payments set amount_cents = 1 where id = tests.id('pay_h1') returning id $$,
  'payments are append-only: no update');
select is_empty($$ delete from public.debt_payments where id = tests.id('pay_h1') returning id $$,
  'payments are append-only: no delete (reverse with a negative row instead)');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.debt_payments $$, $$ values (tests.id('pay_h2')) $$,
  'other household sees only its own payments');
select throws_ok(
  $$ insert into public.debt_payments (household_id, debt_id, transaction_id, amount_cents, payment_date, device_id)
     values (tests.household('h1'), tests.id('debt_h1'), tests.id('tx_h1'), 500, current_date, 'device-b1') $$,
  '42501', null, 'other household cannot insert');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.debt_payments $$, '42501', null, 'anon has no access to debt_payments');

select * from finish();
rollback;
