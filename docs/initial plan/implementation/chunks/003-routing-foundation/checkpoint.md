# Checkpoint: Routing Foundation

Run these checks to verify chunk 003 is complete.

## Automated Checks

### 1. TypeScript Compiles

```bash
npx tsc --noEmit
```

**Expected**: No errors (route types should be recognized)

**Status**: [ ] Pass / [ ] Fail

---

### 2. Route Tree Generated

```bash
ls src/routeTree.gen.ts
```

**Expected**: File exists

**Status**: [ ] Pass / [ ] Fail

---

### 3. Dev Server Starts

```bash
npm run dev
```

**Expected**: No errors, server starts on http://localhost:5173

**Status**: [ ] Pass / [ ] Fail

---

## Route Navigation Checks

### 1. Landing Page Works

**Steps**:

1. Visit http://localhost:5173
2. Should see landing page

**Expected** (when NOT logged in):

- [ ] "Household Hub" heading displayed
- [ ] "Track your household finances" text visible
- [ ] Login button present
- [ ] Sign Up button present

**Expected** (when logged in):

- [ ] "Welcome back, [email]" message
- [ ] "Go to Dashboard" link present

**Status**: [ ] Pass / [ ] Fail

---

### 2. Login Route Works

**Steps**:

1. Visit http://localhost:5173/login
2. Check page loads

**Expected** (when NOT logged in):

- [ ] Login form visible
- [ ] Email and password inputs present
- [ ] Sign Up link visible

**Expected** (when logged in):

- [ ] Redirects to /dashboard automatically

**Status**: [ ] Pass / [ ] Fail

---

### 3. Signup Route Works

**Steps**:

1. Visit http://localhost:5173/signup
2. Check page loads

**Expected** (when NOT logged in):

- [ ] Signup form visible
- [ ] Email, password, and confirm password inputs present
- [ ] Login link visible

**Expected** (when logged in):

- [ ] Redirects to /dashboard automatically

**Status**: [ ] Pass / [ ] Fail

---

### 4. Dashboard Route Protected

**Steps**:

1. Sign out if logged in
2. Visit http://localhost:5173/dashboard

**Expected**:

- [ ] Redirects to /login
- [ ] URL changes to /login

**Status**: [ ] Pass / [ ] Fail

---

### 5. Dashboard Accessible When Logged In

**Steps**:

1. Log in successfully
2. Visit http://localhost:5173/dashboard

**Expected**:

- [ ] Dashboard page loads
- [ ] Header shows user email
- [ ] "Sign Out" button present
- [ ] Three feature cards visible (Accounts, Transactions, Budgets)
- [ ] No redirect to login

**Status**: [ ] Pass / [ ] Fail

---

### 6. Navigation Links Work

**Steps**:

1. On landing page (not logged in), click "Login" button
2. Check URL changes to /login
3. Click "Sign up" link
4. Check URL changes to /signup

**Expected**:

- [ ] Navigation instant (no full page reload)
- [ ] URL updates correctly
- [ ] Browser back button works
- [ ] No page flicker

**Status**: [ ] Pass / [ ] Fail

---

### 7. Auth Flow Integration

**Steps**:

1. From landing page, click "Login"
2. Enter credentials and log in
3. Should redirect to /dashboard
4. Click "Sign Out"
5. Should redirect to / (landing)

**Expected**:

- [ ] Login redirects to dashboard
- [ ] Logout redirects to landing page
- [ ] No broken links
- [ ] Auth state syncs with routes

**Status**: [ ] Pass / [ ] Fail

---

## TypeScript Type Safety Checks

### 1. Link Type Safety

Add this to any route file temporarily:

```typescript
import { Link } from "@tanstack/react-router";

// This should show TypeScript error
<Link to="/fake-route">Test</Link>
```

**Expected**:

- [ ] TypeScript error: `/fake-route` is not a valid route
- [ ] Autocomplete shows valid routes: `/`, `/login`, `/signup`, `/dashboard`

Delete test code after verification.

**Status**: [ ] Pass / [ ] Fail

---

### 2. Navigate Type Safety

Add this to any route temporarily:

```typescript
import { useNavigate } from "@tanstack/react-router";

const navigate = useNavigate();

// This should show TypeScript error
navigate({ to: "/nonexistent" });
```

**Expected**:

- [ ] TypeScript error on invalid route
- [ ] Autocomplete works for `to` parameter

Delete test code after verification.

**Status**: [ ] Pass / [ ] Fail

---

## Manual Code Review

### Check Route Files Exist

- [ ] `src/routes/__root.tsx`
- [ ] `src/routes/index.tsx`
- [ ] `src/routes/login.tsx`
- [ ] `src/routes/signup.tsx`
- [ ] `src/routes/dashboard.tsx`

---

### Check `src/routes/__root.tsx`

- [ ] Has `createRootRoute`
- [ ] Renders `<Outlet />`
- [ ] Includes router devtools in dev mode

---

### Check `src/routes/index.tsx`

- [ ] Uses `createFileRoute("/")`
- [ ] Shows different content based on auth state
- [ ] Has links to login/signup (when logged out)
- [ ] Has link to dashboard (when logged in)

---

### Check `src/routes/dashboard.tsx`

- [ ] Uses `createFileRoute("/dashboard")`
- [ ] Checks for user and redirects if not authenticated
- [ ] Shows loading state during redirect
- [ ] Has header with email and sign out button

---

### Check `src/App.tsx`

- [ ] Imports `RouterProvider` and `createRouter`
- [ ] Creates router with `routeTree`
- [ ] Has TypeScript module augmentation
- [ ] Renders `<RouterProvider />`

---

## Devtools Check

### 1. Router Devtools Visible

**Steps**:

1. Visit any page in dev mode
2. Look for TanStack Router icon in bottom-left

**Expected**:

- [ ] Icon present in dev mode
- [ ] Click icon shows route tree
- [ ] Shows current route highlighted
- [ ] Shows route params/search state

**Status**: [ ] Pass / [ ] Fail

---

## Performance Checks

### 1. No Full Page Reloads

**Steps**:

1. Open Network tab in DevTools
2. Navigate between routes using links
3. Check for HTML document requests

**Expected**:

- [ ] Only initial page load fetches HTML
- [ ] Route changes don't reload page
- [ ] Navigation feels instant

**Status**: [ ] Pass / [ ] Fail

---

### 2. No Console Errors

**Steps**:

1. Open browser console
2. Navigate through all routes
3. Check for errors or warnings

**Expected**:

- [ ] No errors in console
- [ ] No React warnings
- [ ] No router-related warnings

**Status**: [ ] Pass / [ ] Fail

---

## Pass Criteria

All checks above must pass:

- ✅ TypeScript compiles with route types
- ✅ Route tree auto-generated
- ✅ All routes accessible at correct URLs
- ✅ Dashboard protected (redirects when logged out)
- ✅ Auth redirects work (login → dashboard)
- ✅ Navigation links work without page reload
- ✅ Type safety enforced for invalid routes
- ✅ Router devtools visible in dev mode

---

## If Any Check Fails

1. Check `troubleshooting.md` for that specific issue
2. Review `instructions.md` step-by-step
3. Verify TanStack Router plugin in vite.config.ts
4. Check route file naming (must match pattern)
5. Restart dev server to regenerate route tree

---

## When All Checks Pass

1. Update `progress-tracker.md`:
   - Mark chunk 003 as complete `[x]`
   - Update time invested

2. Commit your work:

```bash
git add .
git commit -m "feat: complete chunk 003-routing-foundation"
```

3. Move to next chunk:
   - `chunks/004-accounts-schema/`

4. **Milestone 1 Complete! 🎉**
   - Foundation (chunks 001-003) finished
   - Starting Milestone 2 (MVP features)

---

**Checkpoint Status**: **\_\_** (Pass / Fail / In Progress)
**Time Taken**: **\_\_** minutes
**Issues Encountered**: **\_\_**
**Notes**: **\_\_**
