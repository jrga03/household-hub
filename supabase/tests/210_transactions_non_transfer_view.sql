begin;
select plan(8);
select tests.seed();

select has_view('public', 'transactions_non_transfer', 'transfer-excluding view exists');
select results_eq(
  $$ select column_name::text, data_type::text from information_schema.columns
     where table_schema = 'public' and table_name = 'transactions_non_transfer' order by ordinal_position $$,
  $$ select column_name::text, data_type::text from information_schema.columns
     where table_schema = 'public' and table_name = 'transactions' order by ordinal_position $$,
  'view columns match transactions (recreate the view after adding a column)');

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.transactions_non_transfer order by id $$,
  $$ select unnest(array[tests.id('tx_h1'), tests.id('tx_h1_personal_a1')]) order by 1 $$,
  'creator sees own non-transfer rows, transfers excluded');
select tests.authenticate_as('a2');
select results_eq($$ select id from public.transactions_non_transfer $$, $$ values (tests.id('tx_h1')) $$,
  'RLS applies through the view (security_invoker): personal rows hidden');
select throws_ok(
  $$ insert into public.transactions_non_transfer (household_id, date, description, amount_cents, type)
     values (tests.household('h1'), current_date, 'x', 1, 'expense') $$,
  '42501', null, 'the view is read-only for clients');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.transactions_non_transfer $$, $$ values (tests.id('tx_h2')) $$,
  'other household sees only its own rows');
select is_empty(
  $$ select id from public.transactions_non_transfer where transfer_group_id is not null $$,
  'no transfer legs');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.transactions_non_transfer $$, '42501', null,
  'anon has no access to the view');

select * from finish();
rollback;
