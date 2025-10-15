# Milestone 1: Foundation

**Goal**: Get a working React app with authentication and basic routing
**Time**: 6 hours total
**Status**: Foundation for everything else

## What You'll Have After This Milestone

✅ Vite + React + TypeScript project running
✅ Supabase authentication working (signup/login/logout)
✅ Protected routes (dashboard requires auth)
✅ Basic UI with shadcn/ui components
✅ TanStack Router configured
✅ Database connected with profiles table

## Chunks in This Milestone

### 001: Project Setup (45 minutes)

**What**: Initialize Vite project, install dependencies, configure tooling
**Outcome**: `npm run dev` shows "Hello World"

### 002: Auth Flow (1.5 hours)

**What**: Supabase authentication with login/signup pages
**Outcome**: Can create account and log in

### 003: Routing Foundation (1 hour)

**What**: TanStack Router with protected routes
**Outcome**: Dashboard requires login, redirects work

## Why This Order?

1. **Project first** - Need working dev environment
2. **Auth second** - Everything else needs user context
3. **Routing last** - Needs auth to protect routes

## Success Criteria

### Technical Checklist

- [ ] `npm run dev` starts without errors
- [ ] Can access http://localhost:3000
- [ ] Can sign up new user via `/signup`
- [ ] Can log in via `/login`
- [ ] Unauthenticated users redirected from `/dashboard`
- [ ] Authenticated users see dashboard skeleton
- [ ] Can log out and get redirected to login

### Database Checklist

- [ ] Supabase project created
- [ ] `profiles` table exists
- [ ] RLS policies active on profiles
- [ ] New user creates profile record automatically

### Code Quality

- [ ] TypeScript compiles without errors
- [ ] ESLint shows no warnings
- [ ] All environment variables in `.env.local`
- [ ] Git repository initialized with `.gitignore`

## Common Issues & Solutions

### Issue: Supabase connection fails

**Symptom**: Auth doesn't work, console shows network errors
**Solution**: Check `.env.local` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### Issue: Routes always redirect to login

**Symptom**: Even after login, dashboard redirects
**Solution**: Check Zustand authStore is persisting session correctly

### Issue: TypeScript errors on shadcn components

**Symptom**: Red squiggly lines on `<Button>`
**Solution**: Run `npx shadcn-ui@latest add button` to install missing components

## Time Breakdown

| Chunk      | Activity                        | Time         |
| ---------- | ------------------------------- | ------------ |
| 001        | Project init, deps install      | 45min        |
| 002        | Supabase setup, auth UI         | 1.5hr        |
| 003        | Router config, protected routes | 1hr          |
| **Buffer** | Troubleshooting, breaks         | 1hr          |
| **Total**  |                                 | **~6 hours** |

## What Comes Next?

After completing this milestone, you'll start **Milestone 2: MVP** which builds the actual financial tracker features.

**Next chunk**: 004-accounts-schema (30 minutes)

## Verification Command

After completing all 3 chunks, run this to verify:

```bash
# 1. Dev server runs
npm run dev

# 2. TypeScript compiles
npm run build

# 3. Tests pass (if you added any)
npm test
```

Then manually verify:

1. Visit http://localhost:3000
2. Click "Sign Up" → Create account
3. Should redirect to /dashboard
4. Log out → Should redirect to /login
5. Try accessing /dashboard without login → Should redirect

## References

- Original: `docs/initial plan/IMPLEMENTATION-PLAN.md` Days 1-3
- Architecture: `docs/initial plan/ARCHITECTURE.md`
- Auth decisions: `docs/initial plan/DECISIONS.md` #39, #84

---

**Ready to start?** → `chunks/001-project-setup/README.md`
