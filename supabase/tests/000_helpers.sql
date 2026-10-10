-- Shared helpers for the pgTAP suite. This file sorts first and COMMITS, so the
-- `tests` schema exists for every later file. Test-only: never put it in a migration.
begin;
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Deterministic UUID per fixture label, e.g. tests.id('user_a').
create or replace function tests.id(label text) returns uuid
language sql immutable as $$ select md5(label)::uuid $$;

-- Insert fixture users into auth.users. Call as postgres, before switching role.
create or replace function tests.create_users(variadic user_labels text[]) returns void
language sql as $$
  insert into auth.users (id, email, aud, role)
  select tests.id('user_' || label), label || '@test.local', 'authenticated', 'authenticated'
  from unnest(user_labels) as label
$$;

-- Switch to the authenticated role as a fixture user ('a', 'b').
create or replace function tests.authenticate_as(user_label text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', tests.id('user_' || user_label), 'role', 'authenticated')::text,
    true
  );
end
$$;

-- Back to postgres to set up fixtures mid-test.
create or replace function tests.clear_authentication() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end
$$;

grant execute on all functions in schema tests to anon, authenticated;

select plan(1);
select has_function('tests', 'authenticate_as', array['text'], 'pgTAP helpers are installed');
select * from finish();
commit;
