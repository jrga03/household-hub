begin;
select plan(14);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.accounts order by id $$,
  $$ select unnest(array[tests.id('acc_h1'), tests.id('acc_h1_personal_a1')]) order by 1 $$,
  'owner sees household and own personal accounts'
);
select tests.authenticate_as('a2');
select results_eq($$ select id from public.accounts $$, $$ values (tests.id('acc_h1')) $$,
  'member sees household accounts, not another member''s personal account');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.accounts $$, $$ values (tests.id('acc_h2')) $$,
  'other household sees only its own accounts');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.accounts $$, '42501', null, 'anon has no access to accounts');

select tests.authenticate_as('a2');
select lives_ok(
  $$ insert into public.accounts (household_id, name, type) values (tests.household('h1'), 'A2 new', 'bank') $$,
  'member can insert into own household');
select throws_ok(
  $$ insert into public.accounts (household_id, name, type, visibility, owner_user_id)
     values (tests.household('h1'), 'Planted', 'cash', 'personal', tests.id('user_a1')) $$,
  '42501', null, 'member cannot create a personal account owned by someone else');
select lives_ok(
  $$ insert into public.accounts (household_id, name, type, visibility, owner_user_id)
     values (tests.household('h1'), 'A2 wallet', 'cash', 'personal', tests.id('user_a2')) $$,
  'member can create their own personal account');
select is_empty(
  $$ update public.accounts set name = 'x' where id = tests.id('acc_h1_personal_a1') returning id $$,
  'member cannot update another member''s personal account');
select is_empty(
  $$ delete from public.accounts where id = tests.id('acc_h1_personal_a1') returning id $$,
  'member cannot delete another member''s personal account');
select isnt_empty(
  $$ update public.accounts set name = 'Renamed' where id = tests.id('acc_h1') returning id $$,
  'member can update a household account');

select tests.authenticate_as('a1');
select isnt_empty(
  $$ update public.accounts set name = 'Mine' where id = tests.id('acc_h1_personal_a1') returning id $$,
  'owner can update own personal account');

select tests.authenticate_as('b1');
select throws_ok(
  $$ insert into public.accounts (household_id, name, type) values (tests.household('h1'), 'x', 'bank') $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.accounts set name = 'x' where id = tests.id('acc_h1') returning id $$,
  'other household cannot update');
select is_empty(
  $$ delete from public.accounts where id = tests.id('acc_h1') returning id $$,
  'other household cannot delete');

select * from finish();
rollback;
