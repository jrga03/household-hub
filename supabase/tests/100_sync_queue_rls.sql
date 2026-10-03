begin;
select plan(9);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.sync_queue order by id $$,
  $$ select unnest(array[tests.id('sq_a1'), tests.id('sq_a1_done')]) order by 1 $$,
  'user sees own queue items across devices (per user, not per device; see 2a design)');
select isnt_empty(
  $$ update public.sync_queue set status = 'syncing' where id = tests.id('sq_a1') returning id $$,
  'user can update own queue item');
select is_empty($$ delete from public.sync_queue where id = tests.id('sq_a1') returning id $$,
  'queued items cannot be deleted');
select isnt_empty($$ delete from public.sync_queue where id = tests.id('sq_a1_done') returning id $$,
  'completed items can be deleted');
select throws_ok(
  $$ insert into public.sync_queue (household_id, entity_type, entity_id, operation, device_id, user_id)
     values (tests.household('h1'), 'transaction', 'tx', '{}', 'device-a2', tests.id('user_a2')) $$,
  '42501', null, 'user cannot enqueue for someone else');
select is_empty(
  $$ update public.sync_queue set status = 'failed' where id = tests.id('sq_a2') returning id $$,
  'user cannot update a household member''s queue item');
select is_empty($$ delete from public.sync_queue where id = tests.id('sq_a2') returning id $$,
  'user cannot delete a household member''s queue item');
select tests.authenticate_as('b1');
select is_empty($$ select id from public.sync_queue $$, 'other household sees no queue items');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.sync_queue $$, 'anon sees no queue items');

select * from finish();
rollback;
