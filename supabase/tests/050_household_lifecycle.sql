begin;
select plan(32);

-- a owns the household; b and c are Members; x belongs nowhere.
select tests.create_users('a', 'b', 'c', 'x');
select tests.authenticate_as('a');
select public.create_household('Acido home');
select tests.clear_authentication();
insert into public.household_members (household_id, user_id)
select id, tests.id('user_' || member) from public.households, unnest(array['b', 'c']) as member
where owner_user_id = tests.id('user_a');

create temporary table household on commit drop as
  select id, code from public.households where owner_user_id = tests.id('user_a');
grant select on household to authenticated;

-- An account created by the caller in their current household; owner_label is null for a Household event.
create function tests.add_account(event_label text, owner_label text) returns void
language sql as $$
  insert into public.events
    (id, household_id, visibility, owner_user_id, entity_type, entity_id, event_type,
     event_version, hlc, device_id, payload)
  values (tests.id(event_label), (select id from household),
          case when owner_label is null then 'household' else 'personal' end,
          case when owner_label is null then null else tests.id('user_' || owner_label) end,
          'account', tests.id('entity_' || event_label), 'account.created', 1,
          '000001760000000:00000:device', 'device',
          '{"name": "Cash", "type": "cash", "startingBalanceCents": 0}'::jsonb)
$$;
grant execute on function tests.add_account(text, text) to authenticated;

select tests.authenticate_as('b');
select tests.add_account('b-household', null);
select tests.add_account('b-personal', 'b');
select tests.authenticate_as('c');
select tests.add_account('c-personal', 'c');

-- Everyone sees who belongs
select tests.authenticate_as('b');
select results_eq(
  $$ select email, is_owner from public.list_household_members() order by email $$,
  $$ values ('a@test.local'::text, true), ('b@test.local', false), ('c@test.local', false) $$,
  'a Member lists the household''s Members and its Owner'
);

-- Only the Owner controls membership
select throws_ok(
  $$ select public.remove_member(tests.id('user_c')) $$,
  'P0001', 'Only the Owner can remove a Member',
  'a Member cannot remove another Member'
);
select throws_ok(
  $$ select public.hand_over_ownership(tests.id('user_b')) $$,
  'P0001', 'Only the Owner can hand over ownership',
  'a Member cannot take ownership'
);
select throws_ok(
  $$ select public.replace_household_code() $$,
  'P0001', 'Only the Owner can replace the Household Code',
  'a Member cannot replace the Household Code'
);

select tests.authenticate_as('a');
select throws_ok(
  $$ select public.leave_household() $$,
  'P0001', 'Hand ownership to another Member before leaving',
  'the Owner cannot leave while other Members remain'
);
select throws_ok(
  $$ select public.remove_member(tests.id('user_a')) $$,
  'P0001', 'You can''t remove yourself. Leave the household instead.',
  'the Owner cannot remove themselves'
);
select throws_ok(
  $$ select public.remove_member(tests.id('user_x')) $$,
  'P0001', 'They aren''t a Member of your household',
  'the Owner cannot remove someone outside the household'
);
select throws_ok(
  $$ select public.hand_over_ownership(tests.id('user_x')) $$,
  'P0001', 'They aren''t a Member of your household',
  'ownership only goes to a Member'
);

-- Replacing the code
create temporary table new_code on commit drop as select public.replace_household_code() as code;
grant select on new_code to authenticated;
select ok(
  (select code from new_code) <> (select code from household)
    and (select code from public.households) = (select code from new_code),
  'the Owner replaces the Household Code'
);
select tests.authenticate_as('x');
select throws_ok(
  $$ select public.request_to_join((select code from household)) $$,
  'P0001', 'No household with that code',
  'the old code no longer finds the household'
);
select lives_ok(
  $$ select public.request_to_join((select code from new_code)) $$,
  'the new code finds it'
);

-- Removing
select tests.authenticate_as('a');
select lives_ok($$ select public.remove_member(tests.id('user_b')) $$, 'the Owner removes a Member');

select tests.authenticate_as('b');
select is_empty($$ select id from public.households $$, 'a removed Member reads no household');
select results_eq(
  $$ select id from public.pull_events(0, 100) $$,
  $$ values (tests.id('b-personal')) $$,
  'a removed Member pulls their Personal events and no Household ones'
);
select throws_ok(
  $$ select tests.add_account('b-after-removal', null) $$,
  '42501', null,
  'a removed Member cannot push Household events'
);
select throws_ok(
  $$ select public.leave_household() $$,
  'P0001', 'You don''t belong to a household',
  'a removed Member has nothing to leave'
);

select tests.authenticate_as('a');
select results_eq(
  $$ select id from public.events where visibility = 'household' $$,
  $$ values (tests.id('b-household')) $$,
  'Household records a departed Member created stay visible to the rest'
);

-- Handing over
select lives_ok($$ select public.hand_over_ownership(tests.id('user_c')) $$, 'the Owner hands ownership to a Member');
select results_eq(
  $$ select owner_user_id from public.households $$,
  $$ values (tests.id('user_c')) $$,
  'the Member is now the Owner'
);
select throws_ok(
  $$ select public.replace_household_code() $$,
  'P0001', 'Only the Owner can replace the Household Code',
  'the former Owner lost the Owner''s controls'
);
select lives_ok($$ select public.leave_household() $$, 'the former Owner, now a Member, leaves');
select is_empty($$ select id from public.households $$, 'a Member who left reads no household');

-- Dissolving
select tests.authenticate_as('c');
select results_eq(
  $$ select email, is_owner from public.list_household_members() $$,
  $$ values ('c@test.local'::text, true) $$,
  'the new Owner is the last Member'
);
select lives_ok($$ select public.leave_household() $$, 'the last Member leaves');

select tests.clear_authentication();
select is_empty(
  $$ select id from public.households where id = (select id from household) $$,
  'the last Member leaving dissolves the household'
);
select is_empty(
  $$ select id from public.events where visibility = 'household' and household_id = (select id from household) $$,
  'dissolving deletes the household''s Household events'
);
select is_empty($$ select id from public.join_requests $$, 'dissolving clears its join requests');

select tests.authenticate_as('c');
select results_eq(
  $$ select id from public.pull_events(0, 100) $$,
  $$ values (tests.id('c-personal')) $$,
  'the last Member keeps their Personal events after dissolving'
);
select tests.authenticate_as('b');
select results_eq(
  $$ select id from public.pull_events(0, 100) $$,
  $$ values (tests.id('b-personal')) $$,
  'an earlier Member keeps their Personal events after dissolving'
);

-- b made a Personal change offline in the household they were removed from.
select throws_ok(
  $$ select tests.add_account('b-personal-offline', 'b') $$,
  '42501', null,
  'someone in no household cannot push, not even a Personal event'
);
select public.create_household('B home');
select lives_ok(
  $$ select tests.add_account('b-personal-offline', 'b') $$,
  'once in a household again, they push a Personal event made in the old one'
);

select tests.clear_authentication();
select ok(
  not has_function_privilege('anon', 'public.leave_household()', 'execute')
    and not has_function_privilege('anon', 'public.remove_member(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.hand_over_ownership(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.replace_household_code()', 'execute')
    and not has_function_privilege('anon', 'public.list_household_members()', 'execute'),
  'anon cannot call the membership functions'
);

select * from finish();
rollback;
