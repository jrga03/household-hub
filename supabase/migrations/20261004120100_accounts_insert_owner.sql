-- accounts_insert only checked the household, so a member could create a
-- personal account owned by another member. Pin owner_user_id to the caller;
-- household accounts (owner_user_id NULL) are unaffected.
DROP POLICY IF EXISTS "accounts_insert" ON public.accounts;

CREATE POLICY "accounts_insert"
  ON public.accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = get_user_household_id()
    AND (owner_user_id IS NULL OR owner_user_id = auth.uid())
  );

COMMENT ON POLICY "accounts_insert" ON public.accounts IS
  'Users can create household accounts, or personal accounts they own, in their household';
