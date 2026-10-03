begin;
select plan(6);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq($$ select id from public.push_subscriptions $$, $$ values (tests.id('ps_a1')) $$,
  'user sees only own subscriptions');
select isnt_empty(
  $$ update public.push_subscriptions set auth = 'b' where id = tests.id('ps_a1') returning id $$,
  'user can update own subscription');
select throws_ok(
  $$ insert into public.push_subscriptions (user_id, device_id, endpoint, p256dh, auth)
     values (tests.id('user_a2'), 'device-a2', 'https://push.test/x', 'k', 'a') $$,
  '42501', null, 'user cannot subscribe someone else');
select is_empty(
  $$ update public.push_subscriptions set auth = 'x' where id = tests.id('ps_a2') returning id $$,
  'user cannot update another user''s subscription');
select is_empty($$ delete from public.push_subscriptions where id = tests.id('ps_a2') returning id $$,
  'user cannot delete another user''s subscription');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.push_subscriptions $$, '42501', null, 'anon has no access to push_subscriptions');

select * from finish();
rollback;
