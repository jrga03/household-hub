begin;
select plan(11);

-- a owns household A with Member m; b owns household B; d owns household D alone.
select tests.create_users('a', 'b', 'd', 'm');
select tests.authenticate_as('a');
select public.create_household('A home');
select tests.authenticate_as('b');
select public.create_household('B home');
select tests.authenticate_as('d');
select public.create_household('D home');
select tests.clear_authentication();
insert into public.household_members (household_id, user_id)
select id, tests.id('user_m') from public.households where owner_user_id = tests.id('user_a');

create function tests.household_of(user_label text) returns uuid
language sql security definer as $$
  select id from public.households where owner_user_id = tests.id('user_' || user_label)
$$;

create function tests.add_account(event_label text, household_id uuid, owner_label text, hlc text)
returns void
language sql as $$
  insert into public.events
    (id, household_id, visibility, owner_user_id, entity_type, entity_id, event_type,
     event_version, hlc, device_id, payload)
  values (tests.id(event_label), household_id,
          case when owner_label is null then 'household' else 'personal' end,
          case when owner_label is null then null else tests.id('user_' || owner_label) end,
          'account', tests.id('entity_' || event_label), 'account.created', 1,
          hlc, 'device', '{"name": "Cash", "type": "cash", "startingBalanceCents": 0}'::jsonb)
$$;

-- Whether this transaction holds public.lock_household_events for a household.
create function tests.holds_event_lock(household_id uuid) returns boolean
language sql as $$
  select exists (
    select 1 from pg_locks
    where locktype = 'advisory' and pid = pg_backend_pid() and objsubid = 1
      and ((classid::bigint << 32) | objid::bigint) = hashtextextended(household_id::text, 0)
  )
$$;

grant execute on function tests.household_of(text), tests.add_account(text, uuid, text, text),
  tests.holds_event_lock(uuid) to authenticated;

-- A Personal event naming a household its owner has left locks the owner's current one
select tests.authenticate_as('b');
select tests.add_account('b-old-personal', tests.household_of('a'), 'b', '000001760000000-000000-device');
select ok(
  tests.holds_event_lock(tests.household_of('b')),
  'a Personal event with an old household id takes the lock of its owner''s current household'
);
select ok(
  not tests.holds_event_lock(tests.household_of('a')),
  'a Personal event with an old household id does not take the old household''s lock'
);

-- Dissolving takes the household's event lock before deleting its events
create temporary table dissolved on commit drop as select tests.household_of('d') as id;
grant select on dissolved to authenticated;
select tests.authenticate_as('d');
select public.leave_household();
select ok(
  tests.holds_event_lock((select id from dissolved)),
  'dissolving a household takes its event lock'
);

select tests.clear_authentication();
select throws_ok(
  $$ select tests.add_account('orphan', (select id from dissolved), null, '000001760000000-000000-device') $$,
  'P0001',
  'This household no longer exists',
  'a Household event for a dissolved household is refused'
);
select throws_ok(
  $$ select tests.add_account('newline-hlc', tests.household_of('a'), null, E'000001760000000-000000-dev\nice') $$,
  '23514',
  null,
  'an hlc with a line break is refused'
);

-- Deleting a user keeps the Household events they made
select tests.authenticate_as('m');
select tests.add_account('m-household', tests.household_of('a'), null, '000001760000000-000000-device');
select tests.clear_authentication();
delete from auth.users where id = tests.id('user_m');
select results_eq(
  $$ select actor_user_id from public.events where id = tests.id('m-household') $$,
  $$ values (null::uuid) $$,
  'a deleted Member''s Household events stay, with no actor'
);

select throws_ok(
  $$ delete from auth.users where id = tests.id('user_a') $$,
  'P0001',
  'Hand over ownership first',
  'an Owner''s user cannot be deleted'
);

-- pull_events clamps the batch size to 1..1000, 500 when null
insert into public.events
  (id, household_id, visibility, entity_type, entity_id, event_type, event_version, hlc, device_id, payload)
select gen_random_uuid(), tests.household_of('a'), 'household', 'account', gen_random_uuid(),
       'account.created', 1, '000001760000000-000000-device', 'device', '{}'::jsonb
from generate_series(1, 1001);

select tests.authenticate_as('a');
select results_eq(
  $$ select count(*)::int from public.pull_events(0, null) $$,
  $$ values (500) $$,
  'a null batch size pulls 500'
);
select results_eq(
  $$ select count(*)::int from public.pull_events(0, 0) $$,
  $$ values (1) $$,
  'a zero batch size pulls 1'
);
select results_eq(
  $$ select count(*)::int from public.pull_events(0, 2000000000) $$,
  $$ values (1000) $$,
  'a huge batch size pulls 1000'
);

select throws_ok(
  $$ select tests.add_account('bad-hlc', tests.household_of('a'), null, '000001760000000:00000:device') $$,
  '23514',
  null,
  'an event with a malformed hlc is refused'
);

select * from finish();
rollback;
