# Chunk 002: Auth Flow

## At a Glance

- **Time**: 90 minutes
- **Milestone**: Foundation (2 of 3)
- **Prerequisites**: Chunk 001 (Project Setup)
- **Can Skip**: No - required for all user-specific features

## What You're Building

A complete authentication system with:

- Supabase Auth integration
- Email/password signup and login
- Session management with Zustand
- Basic auth gating (show LoginForm when logged out)
- Logout with data retention prompt (enhanced in chunk 036)
- Auth state persistence

**Note**: Full route protection with TanStack Router guards added in chunk 003.

## Why This Matters

Authentication is the gateway to the app. Everything else (accounts, transactions, budgets) requires knowing _who_ the user is. Get this right now and you won't need to retrofit auth later.

## Before You Start

Make sure you have:

- **Chunk 001 completed**, specifically:
  - ✅ shadcn/ui CLI initialized (`npx shadcn-ui@latest init`)
  - ✅ Components installed: `button`, `card`, `input`
  - ✅ Path aliases working (`@/*` resolves to `./src/*`)
  - ✅ TypeScript compiling without errors (`npx tsc --noEmit`)
  - ✅ Dev server runs successfully (`npm run dev`)
- A Supabase account (free tier is fine)
- Email address for testing

**Verify Components Exist**:

```bash
# These files should exist from chunk 001:
ls src/components/ui/button.tsx
ls src/components/ui/card.tsx
ls src/components/ui/input.tsx
```

If any components are missing, install them:

```bash
npx shadcn-ui@latest add button card input
```

## What Happens Next

After this chunk:

- Users can sign up and create accounts
- Login persists across page refreshes
- Basic auth gating (logged-out users see login form)
- You can test with real user sessions
- **Next**: Chunk 003 adds proper route protection with TanStack Router
- Ready to add user-specific data (accounts, transactions)

## Key Files Created

```
src/
├── stores/
│   └── authStore.ts          # Zustand store for auth state
├── lib/
│   └── supabase.ts            # Supabase client instance
├── components/
│   ├── AuthProvider.tsx       # Session wrapper
│   ├── LoginForm.tsx          # Login UI
│   └── SignupForm.tsx         # Signup UI
└── routes/
    ├── login.tsx              # Login page route
    └── signup.tsx             # Signup page route
```

## What You'll Learn

- Supabase Auth API basics
- Zustand for lightweight state management
- React Hook Form + Zod for form validation
- Session persistence patterns
- Protected route implementation

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 3 (lines 133-183)
- **Decisions**:
  - Decision #84: Logout data retention prompt (implemented in chunk 036)
  - Decision #75: Hybrid device ID strategy (implemented in chunk 026)
- **Architecture**: `docs/initial plan/ARCHITECTURE.md` Auth section

## Security Notes

- Passwords never stored in app code
- Session tokens managed by Supabase
- RLS policies protect user data
- Device fingerprinting added in chunk 026 (Device Hybrid ID)

---

**Ready?** → Open `instructions.md` to begin
