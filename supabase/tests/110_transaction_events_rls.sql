begin;
select plan(8);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.transaction_events $$, $$ values (tests.id('ev_h1')) $$,
  'member sees household events');
select lives_ok(
  $$ insert into public.transaction_events (household_id, entity_id, op, payload, actor_user_id,
       device_id, idempotency_key, lamport_clock, vector_clock, checksum)
     values (tests.household('h1'), tests.id('tx_h1'), 'update', '{}', tests.id('user_a2'),
       'device-a2', 'ev-a2', 2, '{}', 'c') $$,
  'member can log an event as self from own device');
select throws_ok(
  $$ insert into public.transaction_events (household_id, entity_id, op, payload, actor_user_id,
       device_id, idempotency_key, lamport_clock, vector_clock, checksum)
     values (tests.household('h1'), tests.id('tx_h1'), 'update', '{}', tests.id('user_a1'),
       'device-a2', 'ev-spoof', 2, '{}', 'c') $$,
  '42501', null, 'member cannot log an event as another user');
select throws_ok(
  $$ insert into public.transaction_events (household_id, entity_id, op, payload, actor_user_id,
       device_id, idempotency_key, lamport_clock, vector_clock, checksum)
     values (tests.household('h1'), tests.id('tx_h1'), 'update', '{}', tests.id('user_a2'),
       'device-a1', 'ev-device', 2, '{}', 'c') $$,
  '42501', null, 'member cannot log an event from another user''s device');
select is_empty(
  $$ update public.transaction_events set checksum = 'x' where id = tests.id('ev_h1') returning id $$,
  'events are append-only: no update');
select is_empty($$ delete from public.transaction_events where id = tests.id('ev_h1') returning id $$,
  'events are append-only: no delete');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.transaction_events $$, $$ values (tests.id('ev_h2')) $$,
  'other household sees only its own events');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.transaction_events $$, '42501', null, 'anon has no access to transaction_events');

select * from finish();
rollback;
