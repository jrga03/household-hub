-- accounts_update only checked the household on the new row, so a member
-- could reassign a household account to another member. Pin owner_user_id
-- to the caller, as accounts_insert does since 20261004120100. USING is
-- unchanged.
drop policy if exists "accounts_update" on public.accounts;

create policy "accounts_update"
  on public.accounts for update
  to authenticated
  using (
    household_id = get_user_household_id()
    and (visibility = 'household' or owner_user_id = auth.uid())
  )
  with check (
    household_id = get_user_household_id()
    and (owner_user_id is null or owner_user_id = auth.uid())
  );

comment on policy "accounts_update" on public.accounts is
  'Users can update household accounts or their own personal accounts; a personal account can only be owned by the caller';
