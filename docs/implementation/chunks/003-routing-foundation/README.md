# Chunk 003: Routing Foundation

## At a Glance

- **Time**: 70 minutes
- **Milestone**: Foundation (3 of 3)
- **Prerequisites**: Chunks 001 (Project Setup), 002 (Auth Flow)
- **Can Skip**: No - routes are needed for all features

## Picking Up from Chunk 002

Chunk 002 implemented **basic auth gating** (conditional rendering in App.tsx). This chunk builds on that foundation by adding:

- Proper TanStack Router integration
- URL-based navigation with type safety
- Protected route guards that redirect to /login
- Layout components shared across routes
- Authentication-aware navigation

## What You're Building

A complete routing system with:

- TanStack Router configured with type safety
- Route tree structure (/, /login, /dashboard)
- Protected route guards (upgraded from chunk 002's basic gating)
- Layout components with navigation (inline in routes)
- Loading states

**Note on Error Handling:** TanStack Router provides built-in error handling. Comprehensive error boundaries with logging (Sentry integration) will be added in a later chunk focused on production readiness.

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
│   ├── __root.tsx          # Root route with Outlet
│   ├── index.tsx            # Landing page (/)
│   ├── login.tsx            # Login page (/login)
│   ├── signup.tsx           # Signup page (/signup)
│   └── dashboard.tsx        # Protected dashboard (/dashboard)
└── routeTree.gen.ts         # Auto-generated route tree (do not edit)
```

**Note:** Auth guards and layout components (header, navigation) are implemented **inline** within route components, not as separate files. This keeps the routing foundation simple and focused.

## What You'll Learn

- TanStack Router file-based routing
- Type-safe navigation with Link component
- Protected routes with auth guards
- Layout components and nested routes
- Route loading states

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 3 - Routing portion only (lines 133-183)
  - Note: Day 3 covers multiple features; chunk 003 focuses solely on TanStack Router setup
- **Decisions**: Decision #3 - TanStack Router choice (superior TypeScript support)
- **Architecture**: `docs/initial plan/ARCHITECTURE.md` Routing section (lines 752-763)

## Routing Strategy

- **File-based**: Routes defined by file structure
- **Type-safe**: TypeScript validates all route names
- **Lazy loaded**: Code splitting for better performance
- **Protected**: Auth guards redirect unauthenticated users

---

**Ready?** → Open `instructions.md` to begin
