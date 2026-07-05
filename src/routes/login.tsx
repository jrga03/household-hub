import { createFileRoute, useRouter } from "@tanstack/react-router";
import { LoginForm } from "@/components/LoginForm";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  // The root beforeLoad guard sends unauthenticated visitors here with
  // ?redirect=<original href> so login can return them where they were going.
  // The key is genuinely optional so plain <Link to="/login"> still typechecks.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  component: Login,
});

function Login() {
  const user = useAuthStore((state) => state.user);
  const { redirect } = Route.useSearch();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      // history.push takes the raw href captured by the root guard
      const target = redirect && !["/login", "/signup"].includes(redirect) ? redirect : "/";
      router.history.push(target);
    }
  }, [user, redirect, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <LoginForm />
    </div>
  );
}
