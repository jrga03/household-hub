# Chunk 003: Routing Foundation

## At a Glance

- **Time**: 60 minutes
- **Milestone**: Foundation (3 of 3)
- **Prerequisites**: Chunks 001 (Project Setup), 002 (Auth Flow)
- **Can Skip**: No - routes are needed for all features

## What You're Building

A complete routing system with:

- TanStack Router configured with type safety
- Route tree structure (/, /login, /dashboard)
- Protected route guards
- Layout components with navigation
- Loading states and error boundaries

## Why This Matters

Routing lets users navigate between pages without full page reloads. TanStack Router provides type-safe navigation, making it impossible to link to non-existent routes.

## Before You Start

Make sure you have:

- Chunk 001 completed (project setup)
- Chunk 002 completed (auth flow)
- Development server running

## What Happens Next

After this chunk:

- Clean URL-based navigation
- Auth-protected dashboard route
- Shared layout with header/nav
- Type-safe route params and search
- Ready to add feature pages (accounts, transactions)

## Key Files Created

```
src/
├── routes/
│   ├── __root.tsx          # Root route with layout
│   ├── index.tsx            # Landing page (/)
│   ├── login.tsx            # Login page (/login)
│   ├── signup.tsx           # Signup page (/signup)
│   └── dashboard.tsx        # Protected dashboard (/dashboard)
├── components/
│   ├── Layout.tsx           # Main layout wrapper
│   ├── Header.tsx           # Navigation header
│   └── ProtectedRoute.tsx   # Auth guard wrapper
└── routeTree.gen.ts         # Auto-generated route tree (do not edit)
```

## What You'll Learn

- TanStack Router file-based routing
- Type-safe navigation with Link component
- Protected routes with auth guards
- Layout components and nested routes
- Route loading states

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 3 (lines 133-183)
- **Decisions**: TanStack Router choice (superior TypeScript support)
- **Architecture**: `docs/initial plan/ARCHITECTURE.md` Routing section

## Routing Strategy

- **File-based**: Routes defined by file structure
- **Type-safe**: TypeScript validates all route names
- **Lazy loaded**: Code splitting for better performance
- **Protected**: Auth guards redirect unauthenticated users

---

**Ready?** → Open `instructions.md` to begin
