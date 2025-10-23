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
