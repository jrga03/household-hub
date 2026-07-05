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
      navigate({ to: "/" });
    }
  }, [user, navigate]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <SignupForm />
    </div>
  );
}
