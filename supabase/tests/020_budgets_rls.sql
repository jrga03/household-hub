begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.budgets $$, $$ values (tests.id('bud_h1')) $$,
  'member sees household budgets');
select isnt_empty(
  $$ update public.budgets set amount_cents = 20000 where id = tests.id('bud_h1') returning id $$,
  'member can update a household budget');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.budgets $$, $$ values (tests.id('bud_h2')) $$,
  'other household sees only its own budgets');
select throws_ok(
  $$ insert into public.budgets (household_id, category_id, month) values
     (tests.household('h1'), tests.id('cat_h1_parent'), date '2026-01-01') $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.budgets set amount_cents = 1 where id = tests.id('bud_h1') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.budgets where id = tests.id('bud_h1') returning id $$,
  'other household cannot delete');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.budgets $$, '42501', null, 'anon has no access to budgets');

select * from finish();
rollback;
