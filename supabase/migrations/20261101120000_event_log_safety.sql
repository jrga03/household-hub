-- Keeps the event log's order and shared history safe in four edge cases (#291).

-- Pushes and dissolves in one household take this lock, held to commit.
create function public.lock_household_events(household_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(household_id::text, 0))
$$;

revoke execute on function public.lock_household_events(uuid) from public, anon, authenticated;

-- A Personal event can name a household its owner has left. Locking on that id
-- would let it commit out of sequence order with the owner's current household's
-- events, and a device whose cursor passed it would never pull it. So every
-- push locks the caller's current household.
-- A push that waited on a dissolve's lock still passes RLS on its older
-- snapshot; this statement's fresh snapshot sees the household is gone.
create or replace function public.events_assign_sequence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_household_events(coalesce(public.current_household_id(), new.household_id));
  if new.visibility = 'household'
    and not exists (select 1 from public.households where id = new.household_id) then
    raise exception 'This household no longer exists';
  end if;
  new.sequence := nextval('public.events_sequence_seq');
  return new;
end
$$;

-- A deleted user's Household events stay shared history; only the actor goes.
alter table public.events alter column actor_user_id drop not null;
alter table public.events drop constraint events_actor_user_id_fkey;
alter table public.events add constraint events_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users (id) on delete set null;

-- Matches HLC_PATTERN in src/lib/events/hlc.ts, where . never matches a line break.
alter table public.events add constraint events_hlc_format
  check (hlc ~ '^[0-9]{15}-[0-9]{6}-[^\n\r]+$');

-- Without this the delete fails on the household's owner key with a raw error.
create function public.refuse_owner_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.households where owner_user_id = old.id) then
    raise exception 'Hand over ownership first';
  end if;
  return old;
end
$$;

revoke execute on function public.refuse_owner_deletion() from public, anon, authenticated;

create trigger refuse_owner_deletion
  before delete on auth.users
  for each row execute function public.refuse_owner_deletion();

-- The Owner hands over ownership first, unless they are the last Member: then
-- leaving dissolves the household, keeping everyone's Personal events. The
-- event lock comes before the delete, so a racing push can't leave an orphan.
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  household public.households := public.lock_my_household();
begin
  if household.id is null then
    raise exception 'You don''t belong to a household';
  end if;

  if household.owner_user_id <> caller then
    delete from public.household_members where household_id = household.id and user_id = caller;
    return;
  end if;

  if exists (
    select 1 from public.household_members where household_id = household.id and user_id <> caller
  ) then
    raise exception 'Hand ownership to another Member before leaving';
  end if;
  perform public.lock_household_events(household.id);
  delete from public.events where household_id = household.id and visibility = 'household';
  delete from public.households where id = household.id;
end
$$;

create or replace function public.pull_events(after_sequence bigint, batch_size integer)
returns setof public.events
language sql
stable
set search_path = ''
as $$
  select * from public.events
  where sequence > after_sequence
  order by sequence
  limit least(greatest(coalesce(batch_size, 500), 1), 1000)
$$;
