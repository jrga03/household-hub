-- Personal visibility (ADR 0002). A Personal event is readable only by its
-- owner, wherever their membership stands, so a Personal account goes with
-- them when they leave. Appending still needs current membership, and only
-- the owner can append their own Personal events.

drop policy "members read their household's events" on public.events;
drop policy "members append their household's events" on public.events;

create policy "members read Household events, owners read their Personal events"
  on public.events for select to authenticated
  using (
    (visibility = 'household' and household_id = (select public.current_household_id()))
    or (visibility = 'personal' and owner_user_id = (select auth.uid()))
  );

create policy "members append Household events and their own Personal events"
  on public.events for insert to authenticated
  with check (
    household_id = (select public.current_household_id())
    and actor_user_id = (select auth.uid())
    and (visibility = 'household' or owner_user_id = (select auth.uid()))
  );

create index events_owner_sequence on public.events (owner_user_id, sequence)
  where owner_user_id is not null;
