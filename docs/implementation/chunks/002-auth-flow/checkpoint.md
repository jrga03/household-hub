# Checkpoint: Auth Flow

Run these checks to verify chunk 002 is complete.

## Automated Checks

### 1. TypeScript Compiles

```bash
npx tsc --noEmit
```

**Expected**: No errors

**Status**: [ ] Pass / [ ] Fail

---

### 2. Dev Server Starts

```bash
npm run dev
```

**Expected**: Server starts on http://localhost:5173

**Status**: [ ] Pass / [ ] Fail

---

### 3. Environment Variables Set

```bash
cat .env.local
```

**Expected**: Contains both:

```
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Status**: [ ] Pass / [ ] Fail

---

## Functional Checks

### 1. Signup Flow Works

**Steps**:

1. Visit http://localhost:5173
2. Click "Sign up"
3. Enter email: `test-user@example.com`
4. Enter password: `test123456`
5. Confirm password: `test123456`
6. Click "Sign Up"

**Expected**:

- [ ] No console errors
- [ ] Either shows "Check Your Email" message (if confirmation enabled)
- [ ] Or logs you in immediately (if confirmation disabled)

**Status**: [ ] Pass / [ ] Fail

---

### 2. User Created in Supabase

**Steps**:

1. Go to Supabase Dashboard
2. Navigate to **Authentication → Users**
3. Look for your test user

**Expected**:

- [ ] User appears in list
- [ ] Email matches what you entered
- [ ] Has UUID assigned

**Status**: [ ] Pass / [ ] Fail

---

### 3. Login Flow Works

**Steps**:

1. If logged in, sign out first
2. Enter email: `test-user@example.com`
3. Enter password: `test123456`
4. Click "Sign In"

**Expected**:

- [ ] No console errors
- [ ] Redirects to welcome screen
- [ ] Shows "Logged in as: test-user@example.com"

**Status**: [ ] Pass / [ ] Fail

---

### 4. Session Persists

**Steps**:

1. Log in successfully
2. Refresh the page (F5 or Cmd+R)

**Expected**:

- [ ] Still logged in
- [ ] No flicker/redirect to login
- [ ] User email still displayed

**Status**: [ ] Pass / [ ] Fail

---

### 5. Logout Works

**Steps**:

1. While logged in, click "Sign Out" button

**Expected**:

- [ ] Returns to login screen
- [ ] No errors in console
- [ ] Can log in again successfully

**Status**: [ ] Pass / [ ] Fail

---

### 6. Invalid Credentials Handled

**Steps**:

1. Try to log in with wrong password

**Expected**:

- [ ] Shows error message
- [ ] Error is user-friendly (not raw JSON)
- [ ] Form doesn't clear
- [ ] Can retry without refresh

**Status**: [ ] Pass / [ ] Fail

---

### 7. Auth State Reactive

**Steps**:

1. Open React DevTools
2. Find AuthProvider component
3. Check Zustand store state

**Expected**:

- [ ] `user` object present when logged in
- [ ] `user` is `null` when logged out
- [ ] `session` updates correctly
- [ ] `loading` state toggles during auth operations

**Status**: [ ] Pass / [ ] Fail

---

### 8. Test User Cleanup (Optional)

**Steps**:

1. Go to Supabase Dashboard → **Authentication → Users**
2. Find test users you created (e.g., test-user@example.com)
3. Click on user → Delete (if desired)

**Note**: This is optional. Test users don't affect functionality.

**Status**: [ ] Pass / [ ] Skipped

---

## Code Quality Checks

### 1. No Hardcoded Credentials

```bash
grep -r "password" src/ --include="*.ts" --include="*.tsx"
```

**Expected**: No actual passwords in code (only form inputs)

**Status**: [ ] Pass / [ ] Fail

---

### 2. Error Handling Present

```bash
grep -r "try.*catch" src/stores/authStore.ts
```

**Expected**: All async operations wrapped in try/catch

**Status**: [ ] Pass / [ ] Fail

---

### 3. Loading States Implemented

```bash
grep -r "loading" src/stores/authStore.ts
```

**Expected**: `loading` flag used for all auth operations

**Status**: [ ] Pass / [ ] Fail

---

## Manual Code Review

### Check `src/stores/authStore.ts`

- [ ] Has `signUp` function
- [ ] Has `signIn` function
- [ ] Has `signOut` function
- [ ] Has `initialize` function
- [ ] Uses `onAuthStateChange` listener
- [ ] Sets loading states correctly

---

### Check `src/lib/supabase.ts`

- [ ] Reads from environment variables
- [ ] Throws error if env vars missing
- [ ] Has auth config with `persistSession: true`

---

### Check `src/components/AuthProvider.tsx`

- [ ] Calls `initialize()` on mount
- [ ] Shows loading spinner while initializing
- [ ] Renders children when ready

---

### Check Form Components

**LoginForm.tsx**:

- [ ] Has email and password inputs
- [ ] Has submit button
- [ ] Disables inputs during loading
- [ ] Shows error messages
- [ ] Links to signup

**SignupForm.tsx**:

- [ ] Has email, password, and confirm password
- [ ] Validates passwords match
- [ ] Shows success state after signup
- [ ] Links to login

---

## Security Checks

### 1. Passwords Not Logged

```bash
grep -r "console.log.*password" src/
```

**Expected**: No password logging

**Status**: [ ] Pass / [ ] Fail

---

### 2. Env File in .gitignore

```bash
grep ".env.local" .gitignore
```

**Expected**: `.env.local` listed in .gitignore

**Status**: [ ] Pass / [ ] Fail

---

### 3. No API Keys in Git

```bash
git log --all -p | grep "VITE_SUPABASE"
```

**Expected**: No API keys in git history (if repo initialized)

**Status**: [ ] Pass / [ ] Fail

---

## Pass Criteria

All checks above must pass:

- ✅ TypeScript compiles without errors
- ✅ Can sign up new user
- ✅ User appears in Supabase dashboard
- ✅ Can log in with credentials
- ✅ Session persists on refresh
- ✅ Logout works correctly
- ✅ Error handling works
- ✅ No security issues found

---

## If Any Check Fails

1. Check `troubleshooting.md` for that specific issue
2. Review `instructions.md` step-by-step
3. Verify `.env.local` has correct values
4. Check Supabase dashboard settings
5. Look at browser console for errors

---

## When All Checks Pass

1. Update `progress-tracker.md`:
   - Mark chunk 002 as complete `[x]`
   - Update time invested

2. Commit your work:

```bash
git add .
git commit -m "feat: complete chunk 002-auth-flow"
```

3. Move to next chunk:
   - `chunks/003-routing-foundation/`

---

**Checkpoint Status**: **\_\_** (Pass / Fail / In Progress)
**Time Taken**: **\_\_** minutes
**Issues Encountered**: **\_\_**
**Notes**: **\_\_**
