begin;
select plan(13);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.transactions order by id $$,
  $$ select unnest(array[tests.id('tx_h1'), tests.id('tx_h1_personal_a1'),
       tests.id('tx_h1_transfer_out'), tests.id('tx_h1_transfer_in')]) order by 1 $$,
  'creator sees household rows and own personal rows');
select isnt_empty(
  $$ delete from public.transactions where id = tests.id('tx_h1_personal_a1') returning id $$,
  'creator can delete own transaction');

select tests.authenticate_as('a2');
select results_eq(
  $$ select id from public.transactions order by id $$,
  $$ select unnest(array[tests.id('tx_h1'), tests.id('tx_h1_transfer_out'),
       tests.id('tx_h1_transfer_in')]) order by 1 $$,
  'member sees household rows, not another member''s personal rows');
select isnt_empty(
  $$ update public.transactions set description = 'Edited' where id = tests.id('tx_h1') returning id $$,
  'member can edit a household transaction');
select throws_ok(
  $$ update public.transactions set visibility = 'personal' where id = tests.id('tx_h1') $$,
  'P0001', 'Only the creator can change transaction visibility',
  'only the creator can change visibility (pin_transaction_ownership trigger)');
select is_empty(
  $$ delete from public.transactions where id = tests.id('tx_h1_transfer_in') returning id $$,
  'only the creator can delete a household transaction');
select lives_ok(
  $$ insert into public.transactions (household_id, date, description, amount_cents, type, created_by_user_id)
     values (tests.household('h1'), current_date, 'A2 coffee', 150, 'expense', tests.id('user_a2')) $$,
  'member can create a transaction as self');
select throws_ok(
  $$ insert into public.transactions (household_id, date, description, amount_cents, type, created_by_user_id)
     values (tests.household('h1'), current_date, 'Spoof', 150, 'expense', tests.id('user_a1')) $$,
  '42501', null, 'member cannot create a transaction as another user');

select tests.authenticate_as('b1');
select results_eq($$ select id from public.transactions $$, $$ values (tests.id('tx_h2')) $$,
  'other household sees only its own transactions');
select throws_ok(
  $$ insert into public.transactions (household_id, date, description, amount_cents, type, created_by_user_id)
     values (tests.household('h1'), current_date, 'x', 1, 'expense', tests.id('user_b1')) $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.transactions set description = 'x' where id = tests.id('tx_h1') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.transactions where id = tests.id('tx_h1') returning id $$,
  'other household cannot delete');

select tests.authenticate_as_anon();
select throws_ok($$ select id from public.transactions $$, '42501', null, 'anon has no access to transactions');

select * from finish();
rollback;
