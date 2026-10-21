import { createRootRoute, Link, redirect } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useAuthStore } from "@/stores/authStore";
import { enforceHouseholdGate } from "@/lib/households";
import { useEventSync } from "@/hooks/useEventSync";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { SectionHeader } from "@/components/app/SectionHeader";

function RootComponent() {
  useEventSync();

  return (
    <>
      <AppLayout />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  );
}

/**
 * Styled not-found fallback for bad deep links (e.g. stale PWA shortcuts or
 * OS-cached manifest URLs). Renders inside the app shell in place of the
 * route outlet, replacing TanStack Router's bare default text.
 */
function NotFoundComponent() {
  return (
    <PageShell>
      <PageShell.Main>
        <SectionHeader title="Page not found" />
        <EmptyState
          action={
            <Button asChild>
              <Link to="/">Go to Home</Link>
            </Button>
          }
        >
          This page doesn’t exist or may have moved.
        </EmptyState>
      </PageShell.Main>
    </PageShell>
  );
}

/** Routes reachable without a session */
const PUBLIC_ROUTES = ["/login", "/signup"];

export const Route = createRootRoute({
  // Pre-render auth guard: every protected route is checked here BEFORE its
  // component mounts, replacing the old per-route effects that rendered a
  // frame and then navigated away (review UI-07). initialize() is idempotent
  // and resolves instantly once the session is restored.
  beforeLoad: async ({ location }) => {
    if (PUBLIC_ROUTES.includes(location.pathname)) return;

    await useAuthStore.getState().initialize();

    const user = useAuthStore.getState().user;
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }

    // A person must belong to a household before reaching anything else.
    await enforceHouseholdGate(location.pathname, user.id);
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});
