begin;
select plan(8);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ select unnest(array[tests.id('user_a1'), tests.id('user_a2')]) order by 1 $$,
  'user sees profiles in own household');
select isnt_empty(
  $$ update public.profiles set full_name = 'A1' where id = tests.id('user_a1') returning id $$,
  'user can update own profile');
select is_empty(
  $$ update public.profiles set full_name = 'x' where id = tests.id('user_a2') returning id $$,
  'user cannot update another member''s profile');
select throws_ok(
  $$ update public.profiles set household_id = tests.household('h2') where id = tests.id('user_a1') $$,
  '42501', null,
  'user cannot move self into another household (the updated row fails the SELECT policy)');
select is_empty($$ delete from public.profiles where id = tests.id('user_a2') returning id $$,
  'no profile delete policy');
select throws_ok(
  $$ insert into public.profiles (id, email) values (tests.id('user_b1'), 'x@test.local') $$,
  '42501', null, 'no profile insert policy (profiles come from the signup trigger)');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.profiles $$, $$ values (tests.id('user_b1')) $$,
  'other household sees only its own profiles');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.profiles $$, 'anon sees no profiles');

select * from finish();
rollback;
