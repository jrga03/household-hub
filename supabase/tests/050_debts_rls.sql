begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.debts $$, $$ values (tests.id('debt_h1')) $$,
  'member sees household debts');
select isnt_empty(
  $$ update public.debts set name = 'Renamed' where id = tests.id('debt_h1') returning id $$,
  'member can update household debts');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.debts $$, $$ values (tests.id('debt_h2')) $$,
  'other household sees only its own debts');
select throws_ok(
  $$ insert into public.debts (household_id, name, original_amount_cents) values (tests.household('h1'), 'x', 100) $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.debts set name = 'x' where id = tests.id('debt_h1') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.debts where id = tests.id('debt_h1') returning id $$,
  'other household cannot delete');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.debts $$, '42501', null, 'anon has no access to debts');

select * from finish();
rollback;
