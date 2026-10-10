-- Milestone 1 baseline: households and membership. They are server-authoritative
-- relational state (the access boundary RLS reads), not events. Clients only
-- read them; every membership change goes through a function below.

-- Postgres grants EXECUTE on new functions to PUBLIC, which includes anon.
-- Revoke that for everything postgres creates from here on; authenticated and
-- service_role get it back through the schema default.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  owner_user_id uuid not null references auth.users (id),
  code text not null unique check (code ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$'),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- The Owner is always a Member of their household. Deferred so a household and
-- its first member can be inserted in one transaction.
alter table public.households
  add constraint households_owner_is_member
  foreign key (id, owner_user_id) references public.household_members (household_id, user_id)
  deferrable initially deferred;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

revoke all on public.households, public.household_members from anon, authenticated;
grant select on public.households, public.household_members to authenticated;

-- The caller's household, read past RLS so policies on household_members can
-- use it without recursing into themselves.
create function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

revoke execute on function public.current_household_id() from public, anon;

create policy "members read their household"
  on public.households for select to authenticated
  using (id = (select public.current_household_id()));

create policy "members read their household's members"
  on public.household_members for select to authenticated
  using (household_id = (select public.current_household_id()));

-- Six characters from an alphabet without look-alikes (0/O, 1/I/L, U), so the
-- code survives being read aloud. The modulo bias is harmless: a code grants
-- no access on its own.
create function public.generate_household_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', get_byte(random_bytes, position) % 30 + 1, 1), '')
  from extensions.gen_random_bytes(6) as random_bytes,
       generate_series(0, 5) as position
$$;

revoke execute on function public.generate_household_code() from public, anon, authenticated;

create function public.create_household(household_name text)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  trimmed_name text := btrim(household_name);
  created public.households;
begin
  if caller is null then
    raise exception 'Sign in to create a household' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_members where user_id = caller) then
    raise exception 'You already belong to a household';
  end if;
  if trimmed_name is null or trimmed_name = '' then
    raise exception 'A household needs a name';
  end if;
  if char_length(trimmed_name) > 60 then
    raise exception 'A household name can be at most 60 characters';
  end if;

  -- Retry the rare Household Code collision with a fresh code.
  for attempt in 1..5 loop
    begin
      insert into public.households (name, owner_user_id, code)
      values (trimmed_name, caller, public.generate_household_code())
      returning * into created;
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  -- A concurrent create by the same person loses here, on the one-household rule.
  begin
    insert into public.household_members (household_id, user_id) values (created.id, caller);
  exception when unique_violation then
    raise exception 'You already belong to a household';
  end;
  return created;
end
$$;

revoke execute on function public.create_household(text) from public, anon;
