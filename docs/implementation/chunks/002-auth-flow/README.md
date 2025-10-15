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
- Protected route guards
- Logout with data retention prompt
- Auth state persistence

## Why This Matters

Authentication is the gateway to the app. Everything else (accounts, transactions, budgets) requires knowing _who_ the user is. Get this right now and you won't need to retrofit auth later.

## Before You Start

Make sure you have:

- Chunk 001 completed (project setup)
- A Supabase account (free tier is fine)
- Email address for testing

## What Happens Next

After this chunk:

- Users can sign up and create accounts
- Login persists across page refreshes
- Protected routes redirect unauthenticated users
- You can test with real user sessions
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
  - Decision #84: Logout data retention prompt
  - Decision #75: Hybrid device ID strategy (fingerprinting comes later)
- **Architecture**: `docs/initial plan/ARCHITECTURE.md` Auth section

## Security Notes

- Passwords never stored in app code
- Session tokens managed by Supabase
- RLS policies protect user data
- Device fingerprinting added in chunk 006 (event sourcing)

---

**Ready?** → Open `instructions.md` to begin
