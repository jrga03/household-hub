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
          <p className="mt-4 text-muted-foreground">Welcome back, {user.email}</p>
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
        <p className="mt-4 text-muted-foreground">Track your household finances with ease</p>
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
