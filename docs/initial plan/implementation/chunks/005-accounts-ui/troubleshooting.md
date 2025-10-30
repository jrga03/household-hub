# Troubleshooting: Accounts UI

Common issues and solutions for chunk 005.

---

## Issue: "Cannot find module '@tanstack/react-query'"

**Symptom**: Import error for TanStack Query

**Cause**: Package not installed

**Solution**:

```bash
npm install @tanstack/react-query
```

Verify:

```bash
npm list @tanstack/react-query
# Should show version 5.x+
```

**Reference**: `instructions.md` Step 3

---

## Issue: "QueryClient is not defined"

**Symptom**: Error when trying to use query hooks

**Cause**: QueryClientProvider not wrapping app

**Solution**:

1. Check `src/main.tsx`:

   ```typescript
   import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

   const queryClient = new QueryClient();

   <QueryClientProvider client={queryClient}>
     <AuthProvider>
       <App />
     </AuthProvider>
   </QueryClientProvider>
   ```

2. Ensure correct import order (QueryClientProvider outside AuthProvider)

**Reference**: `instructions.md` Step 3

---

## Issue: Accounts not loading / empty list

**Symptom**: Accounts page shows empty state despite seed data

**Cause**: RLS blocking query or no accounts in database

**Solution**:

**Check 1: Verify seed data**:

```sql
-- In Supabase Dashboard → SQL Editor
SELECT * FROM accounts WHERE is_active = true;
```

If empty, re-run seed:

```bash
npx supabase db reset
```

**Check 2: Check RLS policies**:

```sql
-- Check if RLS is blocking
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
-- Try fetching again
-- Then re-enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
```

**Check 3: Check auth state**:

```typescript
// In browser console
useAuthStore.getState().user; // Should return user object
```

**Reference**: `instructions.md` Step 2, Chunk 004

---

## Issue: "Cannot read properties of null (reading 'id')"

**Symptom**: Error when opening create form

**Cause**: User not authenticated or user state not loaded

**Solution**:

1. Verify user is logged in:

   ```typescript
   const user = useAuthStore((state) => state.user);
   console.log("User:", user);
   ```

2. Add loading check in AccountFormDialog:

   ```typescript
   if (!user) {
     return <div>Loading...</div>;
   }
   ```

3. Ensure AuthProvider initialized:
   ```typescript
   const initialized = useAuthStore((state) => state.initialized);
   if (!initialized) return <div>Loading...</div>;
   ```

**Reference**: `instructions.md` Step 5, Chunk 002

---

## Issue: Currency formats incorrectly

**Symptom**: Shows "₱NaN" or wrong format

**Cause**: parsePHP receiving invalid input or formatPHP getting non-number

**Solution**:

**Debug the input**:

```typescript
// In src/lib/currency.ts
export function parsePHP(input: string | number): number {
  console.log("parsePHP input:", input, typeof input);
  // ... rest of function
}
```

**Common issues**:

```typescript
// ❌ Passing undefined
parsePHP(undefined); // Returns 0

// ❌ Passing object
parsePHP({ amount: 100 }); // NaN

// ✅ Correct usage
parsePHP("1,500.50"); // 150050
parsePHP(1500.5); // 150050
```

**Fix display**:

```typescript
// Always validate before formatting
const balance = account.initial_balance_cents;
if (typeof balance === "number" && !isNaN(balance)) {
  return formatPHP(balance);
}
return "₱0.00";
```

**Reference**: `instructions.md` Step 1

---

## Issue: Form validation not working

**Symptom**: Can submit form with invalid data

**Cause**: Zod schema not applied or resolver missing

**Solution**:

1. Check Zod installed:

   ```bash
   npm list zod
   ```

2. Verify resolver in useForm:

   ```typescript
   import { zodResolver } from "@hookform/resolvers/zod";

   const form = useForm<AccountFormData>({
     resolver: zodResolver(accountSchema), // Must be present
   });
   ```

3. Check schema definition:

   ```typescript
   const accountSchema = z.object({
     name: z.string().min(1, "Name is required"),
     type: z.enum(["bank", "credit_card", "cash", "e-wallet", "investment"]),
     // ... rest
   });
   ```

4. Display validation errors:
   ```typescript
   {form.formState.errors.name && (
     <p className="text-sm text-destructive">
       {form.formState.errors.name.message}
     </p>
   )}
   ```

**Reference**: `instructions.md` Step 5

---

## Issue: "Mutation failed" error

**Symptom**: Create/update account fails with generic error

**Cause**: Supabase query error or constraint violation

**Solution**:

**Check browser console for detailed error**:

```typescript
// In src/lib/supabaseQueries.ts
export function useCreateAccount() {
  return useMutation({
    mutationFn: async (account: AccountInsert) => {
      console.log("Creating account:", account);
      const { data, error } = await supabase.from("accounts").insert(account).select().single();

      console.log("Response:", { data, error });
      if (error) throw error;
      return data;
    },
    // ...
  });
}
```

**Common errors**:

```
- "duplicate key value" → Account name already exists
- "violates foreign key" → owner_user_id invalid
- "violates check constraint" → Invalid type/visibility/currency
- "permission denied" → RLS policy blocking
```

**Fix accordingly**:

- Duplicate: Change account name
- Foreign key: Ensure owner_user_id is valid UUID or null
- Check constraint: Use valid enum values
- RLS: Check user is authenticated

**Reference**: `instructions.md` Steps 2, 5

---

## Issue: Edit form shows wrong data

**Symptom**: Edit form pre-fills with data from different account

**Cause**: editingId not matching or accounts state stale

**Solution**:

1. Verify editingId passed correctly:

   ```typescript
   // In accounts.tsx
   console.log('Editing ID:', editingId);

   <AccountFormDialog
     editingId={editingId}  // Make sure this is correct
     // ...
   />
   ```

2. Check accounts data:

   ```typescript
   // In AccountFormDialog
   useEffect(() => {
     console.log("Editing ID:", editingId);
     console.log("Accounts:", accounts);

     if (editingId && accounts) {
       const account = accounts.find((a) => a.id === editingId);
       console.log("Found account:", account);
     }
   }, [editingId, accounts]);
   ```

3. Ensure form resets when closing:
   ```typescript
   const onClose = () => {
     form.reset(); // Reset to default values
     setEditingId(null);
     setIsFormOpen(false);
   };
   ```

**Reference**: `instructions.md` Steps 5-6

---

## Issue: Dialog doesn't close after submit

**Symptom**: Form submits successfully but dialog stays open

**Cause**: onClose not called or error thrown

**Solution**:

1. Check onSubmit calls onClose:

   ```typescript
   const onSubmit = async (data: AccountFormData) => {
     try {
       await createAccount.mutateAsync(accountData);
       form.reset();
       onClose(); // Must be called after success
     } catch (error) {
       console.error("Failed to save:", error);
       // Don't close on error - let user fix
     }
   };
   ```

2. Verify onClose callback works:

   ```typescript
   // In accounts.tsx
   const onClose = () => {
     console.log("Closing form");
     setIsFormOpen(false);
     setEditingId(null);
   };
   ```

3. Check for thrown errors:
   ```typescript
   // If parsePHP throws, wrap in try/catch
   try {
     const cents = parsePHP(data.initial_balance);
   } catch (error) {
     form.setError("initial_balance", { message: "Invalid amount" });
     return; // Don't close
   }
   ```

**Reference**: `instructions.md` Step 5

---

## Issue: Archive button doesn't work

**Symptom**: Clicking archive does nothing or throws error

**Cause**: Mutation not set up or missing account ID

**Solution**:

1. Check mutation usage:

   ```typescript
   const archiveAccount = useArchiveAccount();

   <Button
     onClick={() => {
       console.log('Archiving:', account.id);
       if (confirm(`Archive "${account.name}"?`)) {
         archiveAccount.mutate(account.id);
       }
     }}
   >
     Archive
   </Button>
   ```

2. Verify mutation definition:

   ```typescript
   export function useArchiveAccount() {
     const queryClient = useQueryClient();

     return useMutation({
       mutationFn: async (id: string) => {
         const { error } = await supabase
           .from("accounts")
           .update({ is_active: false })
           .eq("id", id);

         if (error) throw error;
       },
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ["accounts"] });
       },
     });
   }
   ```

3. Check query filters out archived:
   ```typescript
   // In useAccounts
   .eq("is_active", true)  // Must filter out archived
   ```

**Reference**: `instructions.md` Steps 2, 4

---

## Issue: Colors not applying correctly

**Symptom**: Account cards all show same color or wrong color

**Cause**: Inline style not applied or color value wrong

**Solution**:

1. Check inline style syntax:

   ```typescript
   <div
     style={{
       borderLeftWidth: "4px",
       borderLeftColor: account.color, // Make sure this is valid hex
     }}
   >
   ```

2. Verify color value in database:

   ```sql
   SELECT name, color FROM accounts;
   -- Should show #3B82F6, #10B981, etc.
   ```

3. Check color picker sets value:
   ```typescript
   <button
     onClick={() => {
       console.log('Setting color:', color.value);
       form.setValue("color", color.value);
     }}
   >
   ```

**Reference**: `instructions.md` Step 5

---

## Issue: TypeScript error on Account type

**Symptom**:

```
Property 'initial_balance_cents' does not exist on type 'Account'
```

**Cause**: Types not generated or outdated

**Solution**:

1. Regenerate types:

   ```bash
   npx supabase gen types typescript --linked > src/types/database.types.ts
   ```

2. Check type helper exists:

   ```typescript
   // src/types/accounts.ts
   export type Account = Database["public"]["Tables"]["accounts"]["Row"];
   ```

3. Verify import:

   ```typescript
   import { Account } from "@/types/accounts";
   ```

4. Restart TypeScript server:
   - VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"

**Reference**: Chunk 004 Step 8-9

---

## Issue: Can't import shadcn components

**Symptom**:

```
Cannot find module '@/components/ui/dialog'
```

**Cause**: Component not installed

**Solution**:

```bash
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add select
npx shadcn-ui@latest add label
```

List installed components:

```bash
ls src/components/ui/
```

**Reference**: `instructions.md` Step 5

---

## Issue: TanStack Query devtools not showing

**Symptom**: Can't see query state for debugging

**Cause**: Devtools not installed or not imported

**Solution**:

1. Install devtools:

   ```bash
   npm install @tanstack/react-query-devtools
   ```

2. Add to app:

   ```typescript
   import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

   <QueryClientProvider client={queryClient}>
     <AuthProvider>
       <App />
     </AuthProvider>
     {import.meta.env.DEV && <ReactQueryDevtools />}
   </QueryClientProvider>
   ```

3. Look for icon in bottom-left corner

**Reference**: TanStack Query docs

---

## Issue: Balance not updating after edit

**Symptom**: Edit balance but list shows old value

**Cause**: Cache not invalidating or optimistic update issue

**Solution**:

1. Check mutation invalidates cache:

   ```typescript
   export function useUpdateAccount() {
     return useMutation({
       // ...
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ["accounts"] });
       },
     });
   }
   ```

2. Force refetch:

   ```typescript
   // In accounts.tsx after successful update
   queryClient.refetchQueries({ queryKey: ["accounts"] });
   ```

3. Check staleTime not too long:
   ```typescript
   useQuery({
     queryKey: ["accounts"],
     staleTime: 5 * 60 * 1000, // 5 min (not too long)
   });
   ```

**Reference**: `instructions.md` Step 2

---

## Still Stuck?

1. **Check Browser Console**:
   - Look for errors (red text)
   - Check network tab for failed requests

2. **Check TanStack Query Devtools**:
   - View query state
   - Check if queries are loading/error/success
   - See cached data

3. **Verify Database State**:
   - Supabase Dashboard → Table Editor → accounts
   - Check data matches expectations

4. **Test RLS Policies**:

   ```sql
   -- In SQL Editor
   SELECT * FROM accounts;
   -- Should return accounts based on RLS
   ```

5. **Simplify and Test**:
   - Comment out complex parts
   - Test with minimal data
   - Add console.logs everywhere

---

## Prevention Tips

- ✅ Always check browser console
- ✅ Use TanStack Query devtools
- ✅ Test with real data (not just seed)
- ✅ Validate currency inputs
- ✅ Handle errors gracefully
- ✅ Log mutations before sending
- ✅ Keep cache invalidation consistent

---

**Last Updated**: 2025-01-15
