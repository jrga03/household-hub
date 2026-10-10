-- The event log (ADR 0001): the only synced record data. Append-only: clients
-- insert (a push ignores ids it already has) and read through pull_events;
-- nobody updates or deletes.

create sequence public.events_sequence_seq as bigint;

create table public.events (
  id uuid primary key,
  -- Always assigned by events_assign_sequence; the placeholder default keeps it
  -- out of the client's insert.
  sequence bigint not null unique default 0,
  household_id uuid not null references public.households (id) on delete cascade,
  visibility text not null check (visibility in ('household', 'personal')),
  owner_user_id uuid references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type <> ''),
  entity_id uuid not null,
  event_type text not null check (event_type <> ''),
  event_version integer not null check (event_version > 0),
  hlc text not null,
  device_id text not null,
  actor_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  constraint events_personal_has_owner check ((visibility = 'personal') = (owner_user_id is not null))
);

alter sequence public.events_sequence_seq owned by public.events.sequence;

create index events_household_sequence on public.events (household_id, sequence);

-- A pull trusts that nothing below its cursor commits later. A default would
-- draw the sequence before the insert commits, so two concurrent pushes could
-- become visible out of order and a device would skip the slower one forever.
-- Drawing it under a per-household lock held to commit keeps sequence order
-- equal to commit order for everyone reading that household.
create function public.events_assign_sequence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.household_id::text, 0));
  new.sequence := nextval('public.events_sequence_seq');
  return new;
end
$$;

revoke execute on function public.events_assign_sequence() from public, anon, authenticated;

create trigger events_assign_sequence
  before insert on public.events
  for each row execute function public.events_assign_sequence();

alter table public.events enable row level security;

-- Supabase grants sequence usage to clients by default; a client setval would
-- rewind every device's cursor.
revoke all on sequence public.events_sequence_seq from anon, authenticated;
revoke all on public.events from anon, authenticated;
grant select on public.events to authenticated;
grant insert (
  id, household_id, visibility, owner_user_id, entity_type, entity_id,
  event_type, event_version, hlc, device_id, payload
) on public.events to authenticated;

-- Household events only for now; Personal visibility arrives with #22.
create policy "members read their household's events"
  on public.events for select to authenticated
  using (
    household_id = (select public.current_household_id())
    and visibility = 'household'
  );

create policy "members append their household's events"
  on public.events for insert to authenticated
  with check (
    household_id = (select public.current_household_id())
    and visibility = 'household'
    and actor_user_id = (select auth.uid())
  );

create function public.pull_events(after_sequence bigint, batch_size integer)
returns setof public.events
language sql
stable
set search_path = ''
as $$
  select * from public.events
  where sequence > after_sequence
  order by sequence
  limit batch_size
$$;

revoke execute on function public.pull_events(bigint, integer) from public, anon;
