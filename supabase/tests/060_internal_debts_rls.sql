begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.internal_debts $$, $$ values (tests.id('idebt_h1')) $$,
  'member sees household internal_debts');
select isnt_empty(
  $$ update public.internal_debts set name = 'Renamed' where id = tests.id('idebt_h1') returning id $$,
  'member can update household internal_debts');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.internal_debts $$, $$ values (tests.id('idebt_h2')) $$,
  'other household sees only its own internal_debts');
select throws_ok(
  $$ insert into public.internal_debts (household_id, name, original_amount_cents, from_type, from_id, from_display_name, to_type, to_id, to_display_name) values (tests.household('h1'), 'x', 100, 'member', tests.id('user_b1'), 'B1', 'member', tests.id('user_a1'), 'A1') $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.internal_debts set name = 'x' where id = tests.id('idebt_h1') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.internal_debts where id = tests.id('idebt_h1') returning id $$,
  'other household cannot delete');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.internal_debts $$, 'anon sees no internal_debts');

select * from finish();
rollback;
