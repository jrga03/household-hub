begin;
select plan(3);
select tests.seed();

select lives_ok($$ select * from public.check_budget_thresholds() $$,
  'check_budget_thresholds runs (its result type matches its declaration)');
select results_eq(
  $$ select user_id, spent_cents, percentage from public.check_budget_thresholds()
     where id = tests.id('bud_h1') order by user_id $$,
  $$ select u, 10000::bigint, 100 from unnest(array[tests.id('user_a1'), tests.id('user_a2')]) u order by 1 $$,
  'a budget at 80% or more is returned once per household member, counting household rows only, transfers excluded');
select ok(
  not has_function_privilege('authenticated', 'public.check_budget_thresholds()', 'execute'),
  'only service_role may call it');

select * from finish();
rollback;
