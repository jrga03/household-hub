-- The rest of the household lifecycle: leaving, removal, handing over
-- ownership, and replacing the Household Code. Each function locks the
-- household row first, so membership changes in one household happen one at a
-- time (and an accept that races a dissolve fails on the deleted household).

-- A Personal event outlives the household it was recorded in (ADR 0002), so a
-- dissolved household's id stays on its Personal events.
alter table public.events drop constraint events_household_id_fkey;

-- A Personal change made offline names the household it was made in, which
-- may be one its owner has since left. It goes out once they belong to a
-- household again: membership is still required, the household match isn't.
drop policy "members append Household events and their own Personal events" on public.events;

create policy "members append Household events and their own Personal events"
  on public.events for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and (select public.current_household_id()) is not null
    and (
      (visibility = 'household' and household_id = (select public.current_household_id()))
      or (visibility = 'personal' and owner_user_id = (select auth.uid()))
    )
  );

-- The caller's household, locked, or null if they belong to none.
create function public.lock_my_household()
returns public.households
language sql
security definer
set search_path = ''
as $$
  select households.*
  from public.households
  join public.household_members on household_members.household_id = households.id
  where household_members.user_id = auth.uid()
  for update of households
$$;

revoke execute on function public.lock_my_household() from public, anon, authenticated;

-- The caller's household, locked, after checking they are its Owner.
create function public.lock_household_as_owner(refusal text)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  household public.households := public.lock_my_household();
begin
  if household.id is null or household.owner_user_id <> auth.uid() then
    raise exception '%', refusal;
  end if;
  return household;
end
$$;

revoke execute on function public.lock_household_as_owner(text) from public, anon, authenticated;

-- Members can't read auth.users, so their emails come through here.
create function public.list_household_members()
returns table (user_id uuid, email text, is_owner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select members.user_id, users.email::text, members.user_id = households.owner_user_id
  from public.household_members as members
  join public.households on households.id = members.household_id
  join auth.users as users on users.id = members.user_id
  where members.household_id = public.current_household_id()
  order by members.joined_at, users.email
$$;

revoke execute on function public.list_household_members() from public, anon;

-- The Owner hands over ownership first, unless they are the last Member: then
-- leaving dissolves the household, keeping everyone's Personal events.
create function public.leave_household()
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
  delete from public.events where household_id = household.id and visibility = 'household';
  delete from public.households where id = household.id;
end
$$;

revoke execute on function public.leave_household() from public, anon;

-- A removed Member is treated as one who left.
create function public.remove_member(member_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  household public.households :=
    public.lock_household_as_owner('Only the Owner can remove a Member');
begin
  if member_user_id = household.owner_user_id then
    raise exception 'You can''t remove yourself. Leave the household instead.';
  end if;
  delete from public.household_members
  where household_id = household.id and user_id = member_user_id;
  if not found then
    raise exception 'They aren''t a Member of your household';
  end if;
end
$$;

revoke execute on function public.remove_member(uuid) from public, anon;

create function public.hand_over_ownership(new_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  household public.households :=
    public.lock_household_as_owner('Only the Owner can hand over ownership');
begin
  if not exists (
    select 1 from public.household_members
    where household_id = household.id and user_id = new_owner_user_id
  ) then
    raise exception 'They aren''t a Member of your household';
  end if;
  update public.households set owner_user_id = new_owner_user_id where id = household.id;
end
$$;

revoke execute on function public.hand_over_ownership(uuid) from public, anon;

-- The old code stops finding the household; Join Requests already sent stay.
create function public.replace_household_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  household public.households :=
    public.lock_household_as_owner('Only the Owner can replace the Household Code');
  replacement text;
begin
  for attempt in 1..5 loop
    begin
      update public.households set code = public.generate_household_code()
      where id = household.id
      returning code into replacement;
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;
  return replacement;
end
$$;

revoke execute on function public.replace_household_code() from public, anon;
