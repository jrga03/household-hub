begin;
select plan(30);

-- a owns the household, m is a Member, r requests to join.
select tests.create_users('a', 'm', 'r');
select tests.authenticate_as('a');
select public.create_household('Acido home');
select tests.clear_authentication();
insert into public.household_members (household_id, user_id)
select id, tests.id('user_m') from public.households where owner_user_id = tests.id('user_a');

create temporary table household_code on commit drop as
  select code from public.households where owner_user_id = tests.id('user_a');
grant select on household_code to authenticated;

-- Requesting
select tests.authenticate_as('r');
select lives_ok(
  $$ select public.request_to_join(lower(' ' || (select code from household_code) || ' ')) $$,
  'a person requests to join with a Household Code, in any case and with stray spaces'
);
select results_eq(
  $$ select status from public.my_join_request() $$,
  $$ values ('pending'::text) $$,
  'the requester sees their request pending'
);
select is_empty(
  $$ select id from public.households union all select household_id from public.household_members $$,
  'a pending requester reads no household data'
);
select is_empty($$ select id from public.join_requests $$, 'the requester cannot read the request row itself');

select throws_ok(
  $$ select public.request_to_join((select code from household_code)) $$,
  'P0001',
  'You already have a pending request',
  'a person can have at most one pending request'
);

select tests.clear_authentication();
select tests.create_users('x');
select tests.authenticate_as('x');
select throws_ok(
  $$ select public.request_to_join('ZZZZZZ') $$,
  'P0001',
  'No household with that code',
  'an unknown code is rejected'
);
select is_empty($$ select status from public.my_join_request() $$, 'an unknown code creates no request');

select tests.authenticate_as('m');
select throws_ok(
  $$ select public.request_to_join((select code from household_code)) $$,
  'P0001',
  'You already belong to a household',
  'a Member cannot request to join'
);

-- Answering
select tests.clear_authentication();
create temporary table r_request on commit drop as
  select id from public.join_requests where requester_user_id = tests.id('user_r');
grant select on r_request to authenticated;

select tests.authenticate_as('m');
select is_empty($$ select id from public.join_requests $$, 'a Member who is not the Owner reads no join requests');
select throws_ok(
  $$ select public.accept_join_request((select id from r_request)) $$,
  'P0001',
  'Only the Owner can answer join requests',
  'a Member who is not the Owner cannot accept'
);
select throws_ok(
  $$ select public.decline_join_request((select id from r_request)) $$,
  'P0001',
  'Only the Owner can answer join requests',
  'a Member who is not the Owner cannot decline'
);

select tests.authenticate_as('r');
select throws_ok(
  $$ select public.accept_join_request((select id from r_request)) $$,
  'P0001',
  'Only the Owner can answer join requests',
  'the requester cannot accept their own request'
);

select tests.authenticate_as('a');
select results_eq(
  $$ select requester_email, status from public.join_requests $$,
  $$ values ('r@test.local'::text, 'pending'::text) $$,
  'the Owner reads pending requests with who sent each'
);
select lives_ok($$ select public.accept_join_request((select id from r_request)) $$, 'the Owner accepts');
select is_empty($$ select id from public.join_requests $$, 'an accepted request is gone');

select tests.authenticate_as('r');
select results_eq(
  $$ select name from public.households $$,
  $$ values ('Acido home'::text) $$,
  'accepting makes the requester a Member'
);

-- Declining and dismissing
select tests.authenticate_as('x');
select public.request_to_join((select code from household_code));
select tests.clear_authentication();
create temporary table x_request on commit drop as
  select id from public.join_requests where requester_user_id = tests.id('user_x');
grant select on x_request to authenticated;

select tests.authenticate_as('a');
select lives_ok($$ select public.decline_join_request((select id from x_request)) $$, 'the Owner declines');
select is_empty($$ select id from public.join_requests $$, 'the Owner no longer sees a declined request');
select throws_ok(
  $$ select public.accept_join_request((select id from x_request)) $$,
  'P0001',
  'That request is no longer pending',
  'a declined request cannot be accepted'
);

select tests.authenticate_as('x');
select results_eq(
  $$ select status from public.my_join_request() $$,
  $$ values ('declined'::text) $$,
  'the requester sees their request declined'
);
select is_empty($$ select id from public.households $$, 'a declined requester reads no household data');
select lives_ok($$ select public.dismiss_join_request((select id from x_request)) $$, 'the requester dismisses the decline');
select is_empty($$ select status from public.my_join_request() $$, 'a dismissed decline is gone');

-- Cancelling
select public.request_to_join((select code from household_code));
select tests.clear_authentication();
truncate x_request;
insert into x_request select id from public.join_requests where requester_user_id = tests.id('user_x');

select tests.authenticate_as('a');
select throws_ok(
  $$ select public.cancel_join_request((select id from x_request)) $$,
  'P0001',
  'No pending request to cancel',
  'only the requester can cancel, not the Owner'
);

select tests.authenticate_as('x');
select lives_ok($$ select public.cancel_join_request((select id from x_request)) $$, 'the requester cancels');
select is_empty($$ select status from public.my_join_request() $$, 'a cancelled request is gone');

select tests.authenticate_as('a');
select throws_ok(
  $$ select public.accept_join_request((select id from x_request)) $$,
  'P0001',
  'That request is no longer pending',
  'the Owner answering a cancelled request is told it is no longer pending'
);

-- Writes only go through functions
select throws_ok(
  $$ insert into public.join_requests (household_id, requester_user_id, requester_email)
     select id, tests.id('user_x'), 'x@test.local' from public.households $$,
  '42501',
  null,
  'clients cannot insert join requests directly'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.join_requests'::regclass),
  true,
  'RLS is enabled on join_requests'
);

select tests.clear_authentication();
select ok(
  not has_function_privilege('anon', 'public.request_to_join(text)', 'execute')
    and not has_function_privilege('anon', 'public.my_join_request()', 'execute')
    and not has_function_privilege('authenticated', 'public.pending_join_request_for_owner(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.clear_join_requests_of_new_member()', 'execute'),
  'anon cannot request or read requests, and nobody calls the internal helpers'
);

select * from finish();
rollback;
