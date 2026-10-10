begin;
select plan(13);

select tests.create_users('a', 'b', 'c');

-- a and c share a household; b has their own.
select tests.authenticate_as('a');
select public.create_household('Acido home');
select tests.authenticate_as('b');
select public.create_household('B home');
select tests.clear_authentication();
insert into public.household_members (household_id, user_id)
select id, tests.id('user_c') from public.households where owner_user_id = tests.id('user_a');

-- Read past RLS, so a test can aim an insert at a household the caller can't see.
create function tests.household_of(user_label text) returns uuid
language sql security definer as $$
  select id from public.households where owner_user_id = tests.id('user_' || user_label)
$$;

create function tests.account_created(event_label text, household_label text) returns void
language sql as $$
  insert into public.events
    (id, household_id, visibility, entity_type, entity_id, event_type, event_version, hlc, device_id, payload)
  values (tests.id(event_label), tests.household_of(household_label), 'household', 'account',
          tests.id('entity_' || event_label), 'account.created', 1, '000001760000000:00000:device',
          'device', '{"name": "Cash", "type": "cash", "startingBalanceCents": 0}'::jsonb)
  on conflict (id) do nothing
$$;
grant execute on function tests.account_created(text, text), tests.household_of(text) to authenticated;

select is(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  true,
  'RLS is enabled on events'
);

-- Push: an insert that ignores duplicates
select tests.authenticate_as('a');
select lives_ok($$ select tests.account_created('e1', 'a') $$, 'a member pushes an event');
select lives_ok($$ select tests.account_created('e1', 'a') $$, 'pushing the same event again succeeds');
select results_eq(
  $$ select count(*)::int from public.events where id = tests.id('e1') $$,
  $$ values (1) $$,
  'the same event id pushed twice keeps one row'
);

select results_eq(
  $$ select actor_user_id from public.events where id = tests.id('e1') $$,
  $$ values (tests.id('user_a')) $$,
  'the actor is the pushing member'
);

select throws_ok(
  $$ select tests.account_created('e-elsewhere', 'b') $$,
  '42501',
  null,
  'a member cannot push into another household'
);

-- Pull: events after sequence N, in sequence order
select tests.account_created('e2', 'a');
select tests.authenticate_as('c');
select tests.account_created('e3', 'a');

select results_eq(
  $$ select id from public.pull_events(
       (select sequence from public.events where id = tests.id('e1')), 100) $$,
  $$ values (tests.id('e2')), (tests.id('e3')) $$,
  'pull after N returns only later events, in sequence order'
);
select results_eq(
  $$ select id from public.pull_events(0, 2) $$,
  $$ values (tests.id('e1')), (tests.id('e2')) $$,
  'pull returns at most the batch size'
);

-- Reading is limited to the reader's household
select tests.authenticate_as('b');
select is_empty($$ select id from public.pull_events(0, 100) $$, 'a non-member pulls nothing');
select is_empty($$ select id from public.events $$, 'a non-member reads nothing');

-- Append-only
select tests.authenticate_as('a');
select throws_ok(
  $$ update public.events set payload = '{}'::jsonb $$,
  '42501',
  null,
  'events cannot be updated'
);
select throws_ok(
  $$ delete from public.events $$,
  '42501',
  null,
  'events cannot be deleted'
);

select tests.clear_authentication();
select ok(
  not has_sequence_privilege('authenticated', 'public.events_sequence_seq', 'usage')
    and not has_sequence_privilege('authenticated', 'public.events_sequence_seq', 'update'),
  'clients cannot draw or reset the event sequence'
);

select * from finish();
rollback;
