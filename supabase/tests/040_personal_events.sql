begin;
select plan(10);

-- a owns the household and b is a Member.
select tests.create_users('a', 'b');
select tests.authenticate_as('a');
select public.create_household('Acido home');
select tests.clear_authentication();
insert into public.household_members (household_id, user_id)
select id, tests.id('user_b') from public.households where owner_user_id = tests.id('user_a');

-- Read past RLS, so a test can aim an insert at a household the caller can't see.
create function tests.household_of(user_label text) returns uuid
language sql security definer as $$
  select id from public.households where owner_user_id = tests.id('user_' || user_label)
$$;

-- owner_label is null for a Household event.
create function tests.account_created(event_label text, owner_label text) returns void
language sql as $$
  insert into public.events
    (id, household_id, visibility, owner_user_id, entity_type, entity_id, event_type,
     event_version, hlc, device_id, payload)
  values (tests.id(event_label), tests.household_of('a'),
          case when owner_label is null then 'household' else 'personal' end,
          case when owner_label is null then null else tests.id('user_' || owner_label) end,
          'account', tests.id('entity_' || event_label), 'account.created', 1,
          '000001760000000:00000:device', 'device',
          '{"name": "Cash", "type": "cash", "startingBalanceCents": 0}'::jsonb)
$$;
grant execute on function tests.account_created(text, text), tests.household_of(text) to authenticated;

select tests.authenticate_as('b');
select lives_ok($$ select tests.account_created('b-personal', 'b') $$, 'a member pushes a Personal event they own');
select lives_ok($$ select tests.account_created('b-household', null) $$, 'a member pushes a Household event');
select throws_ok(
  $$ select tests.account_created('b-as-a', 'a') $$,
  '42501',
  null,
  'a Personal event owned by someone other than the actor is rejected'
);

select results_eq(
  $$ select id from public.pull_events(0, 100) $$,
  $$ values (tests.id('b-personal')), (tests.id('b-household')) $$,
  'the owner pulls their Personal event and the Household one'
);

select tests.authenticate_as('a');
select results_eq(
  $$ select id from public.pull_events(0, 100) $$,
  $$ values (tests.id('b-household')) $$,
  'another member pulls only the Household event'
);
select is_empty(
  $$ select id from public.events where visibility = 'personal' $$,
  'another member reads no Personal events'
);
select lives_ok($$ select tests.account_created('a-personal', 'a') $$, 'the other member pushes their own Personal event');

-- b's membership ends.
select tests.clear_authentication();
delete from public.household_members where user_id = tests.id('user_b');

select tests.authenticate_as('b');
select results_eq(
  $$ select id from public.pull_events(0, 100) $$,
  $$ values (tests.id('b-personal')) $$,
  'after leaving, the owner still pulls their Personal events and nothing else'
);
select throws_ok(
  $$ select tests.account_created('b-after', 'b') $$,
  '42501',
  null,
  'after leaving, a former member cannot push into the household'
);

select tests.authenticate_as('a');
select results_eq(
  $$ select id from public.pull_events(0, 100) $$,
  $$ values (tests.id('b-household')), (tests.id('a-personal')) $$,
  'a Household event stays readable by the remaining members'
);

select * from finish();
rollback;
