begin;
select plan(18);

select tests.create_users('a', 'b', 'c');

select is(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.households'::regclass, 'public.household_members'::regclass)),
  true,
  'RLS is enabled on households and household_members'
);

-- Creating a household
select tests.authenticate_as('a');
select lives_ok(
  $$ select public.create_household('  Acido home  ') $$,
  'a person with no household can create one'
);

select results_eq(
  $$ select name, owner_user_id from public.households $$,
  $$ values ('Acido home'::text, tests.id('user_a')) $$,
  'the creator is the Owner of the trimmed-name household'
);

select results_eq(
  $$ select user_id from public.household_members $$,
  $$ values (tests.id('user_a')) $$,
  'the creator is a Member'
);

select matches(
  (select code from public.households),
  '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$',
  'the Household Code is six characters with no look-alikes (0/O, 1/I/L, U)'
);

select throws_ok(
  $$ select public.create_household('Second home') $$,
  'P0001',
  'You already belong to a household',
  'a second create by the same person fails'
);

select results_eq(
  $$ select count(*)::int from public.households $$,
  $$ values (1) $$,
  'the failed second create left nothing behind'
);

-- Reading
select tests.authenticate_as('b');
select is_empty($$ select id from public.households $$, 'a non-member cannot read the household');
select is_empty($$ select user_id from public.household_members $$, 'a non-member cannot read its members');

select throws_ok(
  $$ select public.create_household('   ') $$,
  'P0001',
  'A household needs a name',
  'a blank name is rejected'
);

select lives_ok($$ select public.create_household('B home') $$, 'another person creates their own household');
select results_eq(
  $$ select name from public.households $$,
  $$ values ('B home'::text) $$,
  'each Owner reads only their own household'
);
select col_is_unique('public', 'households', 'code', 'Household Codes are unique');

-- A second member (joining arrives with Join Requests; insert directly here)
select tests.clear_authentication();
insert into public.household_members (household_id, user_id)
select id, tests.id('user_c') from public.households where owner_user_id = tests.id('user_a');

select tests.authenticate_as('c');
select results_eq(
  $$ select name from public.households $$,
  $$ values ('Acido home'::text) $$,
  'a member reads their own household'
);
select results_eq(
  $$ select user_id from public.household_members order by user_id $$,
  $$ select unnest(array[tests.id('user_a'), tests.id('user_c')]) order by 1 $$,
  'a member reads every member of their household'
);

-- Writes only go through functions
select throws_ok(
  $$ insert into public.households (name, owner_user_id) values ('Sneaky', tests.id('user_c')) $$,
  '42501',
  null,
  'clients cannot insert households directly'
);
select throws_ok(
  $$ insert into public.household_members (household_id, user_id)
     select id, tests.id('user_b') from public.households $$,
  '42501',
  null,
  'clients cannot add members directly'
);

select tests.clear_authentication();
select ok(
  not has_function_privilege('anon', 'public.create_household(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.generate_household_code()', 'execute'),
  'anon cannot create a household, and nobody calls the code generator directly'
);

select * from finish();
rollback;
