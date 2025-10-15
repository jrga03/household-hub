# Instructions: Routing Foundation

Follow these steps in order. Estimated time: 60 minutes.

---

## Step 1: Configure TanStack Router Plugin (5 min)

Update `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite(), // Add this plugin
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**Verify**: No errors when restarting dev server

---

## Step 2: Create Root Route (10 min)

Create `src/routes/__root.tsx`:

```typescript
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  ),
});
```

This is the top-level route that wraps all other routes.

**Note**: The router devtools only appear in development mode.

---

## Step 3: Create Landing Page (5 min)

Create `src/routes/index.tsx`:

```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const user = useAuthStore((state) => state.user);

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Household Hub</h1>
          <p className="mt-4 text-muted-foreground">
            Welcome back, {user.email}
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Household Hub</h1>
        <p className="mt-4 text-muted-foreground">
          Track your household finances with ease
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            to="/login"
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Login
          </Link>
          <Link
            to="/signup"
            className="rounded-md border border-input bg-background px-6 py-3 text-sm font-medium hover:bg-accent"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 4: Create Login Route (5 min)

Create `src/routes/login.tsx`:

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoginForm } from "@/components/LoginForm";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate({ to: "/dashboard" });
    }
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <LoginForm />
    </div>
  );
}
```

---

## Step 5: Create Signup Route (5 min)

Create `src/routes/signup.tsx`:

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SignupForm } from "@/components/SignupForm";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

export const Route = createFileRoute("/signup")({
  component: Signup,
});

function Signup() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate({ to: "/dashboard" });
    }
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignupForm />
    </div>
  );
}
```

---

## Step 6: Create Protected Dashboard Route (10 min)

Create `src/routes/dashboard.tsx`:

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Household Hub</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <button
              onClick={signOut}
              className="rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="mt-2 text-muted-foreground">
          Welcome to your financial dashboard. Features coming soon!
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-6">
            <h3 className="font-semibold">Accounts</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage your bank accounts and balances
            </p>
            <p className="mt-4 text-2xl font-bold text-muted-foreground">
              Coming in Chunk 005
            </p>
          </div>

          <div className="rounded-lg border p-6">
            <h3 className="font-semibold">Transactions</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Track income and expenses
            </p>
            <p className="mt-4 text-2xl font-bold text-muted-foreground">
              Coming in Chunk 007
            </p>
          </div>

          <div className="rounded-lg border p-6">
            <h3 className="font-semibold">Budgets</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Set spending targets by category
            </p>
            <p className="mt-4 text-2xl font-bold text-muted-foreground">
              Coming in Chunk 009
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
```

---

## Step 7: Update Main App Entry (10 min)

Replace `src/App.tsx` with router setup:

```typescript
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Create router instance
const router = createRouter({ routeTree });

// Type augmentation for router (enables autocomplete)
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return <RouterProvider router={router} />;
}

export default App;
```

---

## Step 8: Generate Route Tree (5 min)

The TanStack Router plugin automatically generates the route tree when you save files.

Check if `src/routeTree.gen.ts` was created:

```bash
ls -la src/routeTree.gen.ts
```

If not, restart dev server:

```bash
# Stop server (Ctrl+C)
npm run dev
```

**Verify**: File exists and contains generated types

**⚠️ Important**: Never edit `routeTree.gen.ts` manually - it's auto-generated!

---

## Step 9: Install Router Devtools (5 min)

```bash
npm install @tanstack/router-devtools
```

The devtools are already imported in `__root.tsx` (Step 2).

When you visit any page, you should see a small TanStack Router icon in the bottom-left corner (dev mode only).

---

## Step 10: Test All Routes (10 min)

```bash
npm run dev
```

Visit each route:

1. **/** → Should show landing page with login/signup buttons
2. **/login** → Should show login form
3. **/signup** → Should show signup form
4. **/dashboard** → Should redirect to /login if not authenticated

After logging in:

- **/** → Should show "Welcome back" with link to dashboard
- **/dashboard** → Should show dashboard with header
- **/login** → Should redirect to dashboard
- **/signup** → Should redirect to dashboard

---

## Done!

When all routes work and navigation is smooth, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Type Safety**:

```typescript
// ✅ Type-safe navigation
navigate({ to: "/dashboard" });

// ❌ TypeScript error: route doesn't exist
navigate({ to: "/invalid" });
```

**Link Component**:

```typescript
// ✅ Type-safe Link
<Link to="/dashboard">Dashboard</Link>

// ❌ TypeScript error
<Link to="/fake-route">Broken</Link>
```

**Route Params** (for later):

```typescript
// Will use in future chunks
const { transactionId } = Route.useParams();
```

**Search Params** (for later):

```typescript
// Will use for filters
const { category, month } = Route.useSearch();
```
