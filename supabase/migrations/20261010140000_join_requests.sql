-- Join Requests: a person asks to join by Household Code and the Owner answers.
-- Relational and server-authoritative like membership (ADR 0004). Only pending
-- and declined requests are kept: accepting or cancelling deletes the row, and
-- a declined one stays until the requester has seen it.

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  requester_user_id uuid not null references auth.users (id) on delete cascade,
  -- Snapshot for the Owner's list: clients can't read auth.users.
  requester_email text not null,
  status text not null default 'pending' check (status in ('pending', 'declined')),
  created_at timestamptz not null default now()
);

create unique index join_requests_one_pending_per_person
  on public.join_requests (requester_user_id)
  where status = 'pending';

create index join_requests_household_id_idx on public.join_requests (household_id);

alter table public.join_requests enable row level security;

revoke all on public.join_requests from anon, authenticated;
grant select on public.join_requests to authenticated;

-- The requester reads their own request through my_join_request(), which
-- leaves out the household.
create policy "the Owner reads their household's pending join requests"
  on public.join_requests for select to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from public.households
      where households.id = join_requests.household_id
        and households.owner_user_id = (select auth.uid())
    )
  );

-- Once a person is a Member anywhere, their requests are moot.
create function public.clear_join_requests_of_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.join_requests where requester_user_id = new.user_id;
  return new;
end
$$;

revoke execute on function public.clear_join_requests_of_new_member() from public, anon, authenticated;

create trigger clear_join_requests_of_new_member
  after insert on public.household_members
  for each row execute function public.clear_join_requests_of_new_member();

-- The pending request the caller may answer as its household's Owner, locked
-- so a concurrent cancel can't slip in before the answer lands.
create function public.pending_join_request_for_owner(request_id uuid)
returns public.join_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.join_requests;
begin
  select * into request from public.join_requests where id = request_id for update;
  if request.id is null then
    raise exception 'That request is no longer pending';
  end if;
  if not exists (
    select 1 from public.households
    where id = request.household_id and owner_user_id = auth.uid()
  ) then
    raise exception 'Only the Owner can answer join requests';
  end if;
  if request.status <> 'pending' then
    raise exception 'That request is no longer pending';
  end if;
  return request;
end
$$;

revoke execute on function public.pending_join_request_for_owner(uuid) from public, anon, authenticated;

create function public.request_to_join(household_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  requested_household_id uuid;
begin
  if caller is null then
    raise exception 'Sign in to join a household' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_members where user_id = caller) then
    raise exception 'You already belong to a household';
  end if;

  select id into requested_household_id
  from public.households
  where code = upper(regexp_replace(household_code, '\s', '', 'g'));
  if requested_household_id is null then
    raise exception 'No household with that code';
  end if;

  -- Asking again replaces a declined request the requester has not dismissed.
  delete from public.join_requests where requester_user_id = caller and status = 'declined';
  begin
    insert into public.join_requests (household_id, requester_user_id, requester_email)
    select requested_household_id, caller, email from auth.users where id = caller;
  exception when unique_violation then
    raise exception 'You already have a pending request';
  end;
end
$$;

revoke execute on function public.request_to_join(text) from public, anon;

-- The caller's request, without the household: a code alone reveals nothing.
create function public.my_join_request()
returns table (id uuid, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select id, status
  from public.join_requests
  where requester_user_id = auth.uid()
  order by created_at desc
  limit 1
$$;

revoke execute on function public.my_join_request() from public, anon;

create function public.accept_join_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.join_requests := public.pending_join_request_for_owner(request_id);
begin
  begin
    insert into public.household_members (household_id, user_id)
    values (request.household_id, request.requester_user_id);
  exception when unique_violation then
    raise exception 'They already belong to another household';
  end;
end
$$;

revoke execute on function public.accept_join_request(uuid) from public, anon;

create function public.decline_join_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.join_requests := public.pending_join_request_for_owner(request_id);
begin
  update public.join_requests set status = 'declined' where id = request.id;
end
$$;

revoke execute on function public.decline_join_request(uuid) from public, anon;

create function public.cancel_join_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.join_requests
  where id = request_id and requester_user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending request to cancel';
  end if;
end
$$;

revoke execute on function public.cancel_join_request(uuid) from public, anon;

-- The requester has seen the decline; they're back to create-or-join.
create function public.dismiss_join_request(request_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.join_requests
  where id = request_id and requester_user_id = auth.uid() and status = 'declined'
$$;

revoke execute on function public.dismiss_join_request(uuid) from public, anon;
