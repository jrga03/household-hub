import { createRootRoute, Link, redirect } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useAuthStore } from "@/stores/authStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function RootComponent() {
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
    <div className="flex min-h-[60dvh] items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
          <CardDescription>This page doesn&apos;t exist or may have moved.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/">Go to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
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

    if (!useAuthStore.getState().user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});
