begin;
select plan(8);
select tests.seed();

select col_not_null('public', 'categories', 'color', 'categories.color is NOT NULL (every reader assumes a colour)');

select tests.authenticate_as('a2');
select results_eq(
  $$ select id from public.categories order by id $$,
  $$ select unnest(array[tests.id('cat_h1_parent'), tests.id('cat_h1_child')]) order by 1 $$,
  'member sees household categories');
select isnt_empty(
  $$ update public.categories set name = 'Food' where id = tests.id('cat_h1_parent') returning id $$,
  'member can update a household category');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.categories $$, $$ values (tests.id('cat_h2')) $$,
  'other household sees only its own categories');
select throws_ok(
  $$ insert into public.categories (household_id, name) values (tests.household('h1'), 'x') $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.categories set name = 'x' where id = tests.id('cat_h1_child') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.categories where id = tests.id('cat_h1_child') returning id $$,
  'other household cannot delete');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.categories $$, 'anon sees no categories');

select * from finish();
rollback;
