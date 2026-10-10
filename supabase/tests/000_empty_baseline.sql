-- Until the milestone 1 baseline (#15) lands, the public schema holds nothing:
-- auth is the only schema in use. #15 replaces this file with its RLS tests.
begin;
select plan(1);

select is_empty(
  $$ select table_name from information_schema.tables where table_schema = 'public' $$,
  'the public schema has no tables'
);

select * from finish();
rollback;
