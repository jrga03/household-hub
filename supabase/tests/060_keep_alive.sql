begin;
select plan(8);

select function_returns('public', 'keep_alive', array[]::text[], 'boolean', 'keep_alive returns a boolean');
select isnt_definer('public', 'keep_alive', array[]::text[], 'keep_alive runs with the caller''s privileges');
select function_privs_are(
  'public', 'keep_alive', array[]::text[], 'authenticated', array[]::text[],
  'signed-in clients cannot call keep_alive; only the cron needs it'
);

set local role anon;
select is(public.keep_alive(), true, 'the anon key calls keep_alive and gets a constant');
select throws_ok($$ select id from public.households $$, '42501', null, 'the anon key cannot read households');
select throws_ok(
  $$ select household_id from public.household_members $$, '42501', null, 'the anon key cannot read members'
);
select throws_ok($$ select id from public.join_requests $$, '42501', null, 'the anon key cannot read join requests');
select throws_ok($$ select id from public.events $$, '42501', null, 'the anon key cannot read events');

select * from finish();
rollback;
