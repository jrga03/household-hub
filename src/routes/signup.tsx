import { createFileRoute, useRouter } from "@tanstack/react-router";
import { SignupForm } from "@/components/SignupForm";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

export const Route = createFileRoute("/signup")({
  component: Signup,
});

function Signup() {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();

  // Depends on the stable router, not useNavigate(): navigate changes with the
  // location, so the household gate's redirect would re-fire this effect in a loop.
  useEffect(() => {
    if (user) {
      void router.navigate({ to: "/" });
    }
  }, [user, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <SignupForm />
    </div>
  );
}
