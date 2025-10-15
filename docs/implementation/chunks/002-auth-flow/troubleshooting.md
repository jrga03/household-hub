# Troubleshooting: Auth Flow

Common issues and solutions for chunk 002.

---

## Issue: "Missing Supabase environment variables"

**Symptom**: App crashes with error about missing environment variables

**Cause**: `.env.local` not created or values incorrect

**Solution**:

1. Verify `.env.local` exists in project root (not in `src/`)
2. Check values are correct:
   ```bash
   cat .env.local
   ```
3. Restart dev server:
   ```bash
   # Stop server (Ctrl+C)
   npm run dev
   ```
4. Verify env vars load:
   ```typescript
   // Add to src/lib/supabase.ts temporarily
   console.log("URL:", import.meta.env.VITE_SUPABASE_URL);
   ```

**Reference**: `instructions.md` Step 1

---

## Issue: "Invalid API key" or "JWT expired"

**Symptom**: Auth operations fail with API key error

**Cause**: Wrong API key or using wrong Supabase project

**Solution**:

1. Go to Supabase Dashboard → **Settings → API**
2. Copy the **anon public** key (not service_role!)
3. Update `.env.local` with correct key
4. Restart dev server
5. Clear browser cache and localStorage:
   ```javascript
   // In browser console
   localStorage.clear();
   location.reload();
   ```

**Warning**: Never use the `service_role` key in frontend code!

**Reference**: `instructions.md` Step 1

---

## Issue: CORS Error

**Symptom**:

```
Access to fetch at 'https://xxx.supabase.co' has been blocked by CORS policy
```

**Cause**: Localhost not added to allowed origins

**Solution**:

1. Supabase Dashboard → **Authentication → URL Configuration**
2. Add to **Site URL**: `http://localhost:5173`
3. Add to **Redirect URLs**: `http://localhost:5173/**`
4. Save and wait ~30 seconds for changes to propagate
5. Refresh your app

**Reference**: `instructions.md` Step 8

---

## Issue: "User already registered" but can't log in

**Symptom**: Signup says email taken, but login fails

**Cause**: User created but email not confirmed

**Solution**:

**Option A (Quick - Disable Confirmation)**:

1. Supabase Dashboard → **Authentication → Settings**
2. Toggle OFF "Enable email confirmations"
3. Delete the test user from **Authentication → Users**
4. Try signup again

**Option B (Proper - Confirm Email)**:

1. Check your email inbox (and spam folder)
2. Click confirmation link
3. Wait for redirect
4. Try logging in again

**Reference**: `instructions.md` Step 8

---

## Issue: Session doesn't persist on refresh

**Symptom**: Logs out every time you refresh the page

**Cause**: localStorage not working or auth config wrong

**Solution**:

1. Check browser doesn't block localStorage (Privacy settings)
2. Verify `src/lib/supabase.ts` has:
   ```typescript
   auth: {
     persistSession: true,
     autoRefreshToken: true,
   }
   ```
3. Check browser console for errors
4. Try clearing all site data:
   - Chrome: DevTools → Application → Clear storage
   - Firefox: DevTools → Storage → Clear all
5. Log in again

**Reference**: `instructions.md` Step 2

---

## Issue: "onAuthStateChange" not triggering

**Symptom**: Login works but UI doesn't update

**Cause**: Auth listener not set up correctly

**Solution**:

1. Verify `src/stores/authStore.ts` has `onAuthStateChange` in `initialize()`
2. Check listener is called:
   ```typescript
   supabase.auth.onAuthStateChange((event, session) => {
     console.log("Auth event:", event, session);
     // ... rest of code
   });
   ```
3. Ensure `AuthProvider` calls `initialize()` on mount
4. Check React DevTools for component updates

**Reference**: `instructions.md` Step 3

---

## Issue: TypeScript errors in auth store

**Symptom**:

```
Property 'user' does not exist on type 'AuthState'
```

**Cause**: Wrong import or type definition incomplete

**Solution**:

1. Verify imports:
   ```typescript
   import { User, Session } from "@supabase/supabase-js";
   ```
2. Check Supabase version:
   ```bash
   npm list @supabase/supabase-js
   ```
3. If version mismatch, update:
   ```bash
   npm install @supabase/supabase-js@latest
   ```
4. Restart TypeScript server in VS Code:
   - Cmd+Shift+P → "TypeScript: Restart TS Server"

**Reference**: `instructions.md` Step 3

---

## Issue: Password validation not working

**Symptom**: Can submit form with short password

**Cause**: HTML validation bypassed or wrong attribute

**Solution**:

1. Verify input has `minLength={6}`:
   ```typescript
   <Input
     type="password"
     minLength={6}
     required
   />
   ```
2. Add extra validation in submit handler:
   ```typescript
   if (password.length < 6) {
     setError("Password must be at least 6 characters");
     return;
   }
   ```

**Reference**: `instructions.md` Step 6

---

## Issue: Error messages not showing

**Symptom**: Auth fails silently, no error displayed

**Cause**: Error state not rendering or catch block missing

**Solution**:

1. Check error is being caught:
   ```typescript
   try {
     await signIn(email, password);
   } catch (err: any) {
     console.log("Login error:", err);
     setError(err.message || "Failed to sign in");
   }
   ```
2. Verify error rendering in JSX:
   ```typescript
   {error && (
     <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
       {error}
     </div>
   )}
   ```
3. Check `error` state is defined:
   ```typescript
   const [error, setError] = useState("");
   ```

**Reference**: `instructions.md` Steps 5 & 6

---

## Issue: "Loading..." screen never goes away

**Symptom**: App stuck on auth initialization

**Cause**: `initialize()` failing or never completing

**Solution**:

1. Add error handling:
   ```typescript
   try {
     const { data } = await supabase.auth.getSession();
     // ...
   } catch (error) {
     console.error("Init error:", error);
     set({ initialized: true }); // Still mark as initialized
   }
   ```
2. Check browser console for errors
3. Verify Supabase project is running (not paused)
4. Test connection:
   ```typescript
   // In browser console
   const { data, error } = await supabase.auth.getSession();
   console.log(data, error);
   ```

**Reference**: `instructions.md` Steps 3 & 4

---

## Issue: Can't import shadcn components

**Symptom**:

```
Cannot find module '@/components/ui/button'
```

**Cause**: shadcn components not installed

**Solution**:

1. Install missing components:
   ```bash
   npx shadcn-ui@latest add button
   npx shadcn-ui@latest add card
   npx shadcn-ui@latest add input
   ```
2. Verify path alias in `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "baseUrl": ".",
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```
3. Restart TypeScript server

**Reference**: Chunk 001 Step 4

---

## Issue: Supabase project paused

**Symptom**: All requests timeout or fail

**Cause**: Free tier project auto-paused after inactivity

**Solution**:

1. Go to Supabase Dashboard
2. Click "Resume project" button
3. Wait ~2 minutes for project to wake up
4. Try auth operation again

**Note**: Free tier projects pause after 7 days of inactivity

---

## Issue: Multiple signOut calls failing

**Symptom**: "Already signed out" error

**Cause**: Calling signOut when already logged out

**Solution**:

1. Check auth state before calling signOut:

   ```typescript
   const user = useAuthStore((state) => state.user);

   if (user) {
     await signOut();
   }
   ```

2. Disable button during logout:
   ```typescript
   <button disabled={loading} onClick={signOut}>
     {loading ? "Signing out..." : "Sign Out"}
   </button>
   ```

---

## Issue: Email confirmation link not working

**Symptom**: Clicking link shows error or doesn't log you in

**Cause**: Redirect URL mismatch

**Solution**:

1. Supabase Dashboard → **Authentication → URL Configuration**
2. Verify **Redirect URLs** includes:
   - `http://localhost:5173/**`
   - Your production URL (if deployed)
3. Check confirmation email link format
4. Try manual confirmation in Dashboard:
   - **Authentication → Users**
   - Click on user
   - Set "Email Confirmed" to Yes

**Reference**: `instructions.md` Step 8

---

## Still Stuck?

1. **Check Supabase Logs**:
   - Dashboard → **Logs** → Filter by "auth"

2. **Check Browser Console**:
   - Look for network errors
   - Check localStorage contents

3. **Verify Supabase Status**:
   - https://status.supabase.com

4. **Compare with Working Example**:
   - https://github.com/supabase/supabase/tree/master/examples/auth

5. **Ask for Help**:
   - Supabase Discord: https://discord.supabase.com
   - Include error message and relevant code

---

## Prevention Tips

- ✅ Always use `.env.local` for secrets
- ✅ Restart dev server after changing env vars
- ✅ Test auth flow after every change
- ✅ Keep Supabase project active (login weekly)
- ✅ Check browser console for errors
- ✅ Use descriptive error messages

---

**Last Updated**: 2025-01-15
