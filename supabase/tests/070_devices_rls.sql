begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq($$ select id from public.devices $$, $$ values ('device-a1') $$,
  'user sees only own devices, not a household member''s');
select isnt_empty(
  $$ update public.devices set name = 'Renamed' where id = 'device-a1' returning id $$,
  'user can update own device');
select throws_ok(
  $$ insert into public.devices (id, user_id, household_id, name, platform, fingerprint)
     values ('device-x', tests.id('user_a2'), tests.household('h1'), 'x', 'web', 'x') $$,
  '42501', null, 'user cannot register a device for someone else');
select is_empty($$ update public.devices set name = 'x' where id = 'device-a2' returning id $$,
  'user cannot update another user''s device');
select is_empty($$ delete from public.devices where id = 'device-a2' returning id $$,
  'user cannot delete another user''s device');
select lives_ok(
  $$ insert into public.devices (id, user_id, household_id, name, platform, fingerprint)
     values ('device-a1-2', tests.id('user_a1'), tests.household('h1'), 'A1 tablet', 'web', 'device-a1-2') $$,
  'user can register own device');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.devices $$, '42501', null, 'anon has no access to devices');

select * from finish();
rollback;
