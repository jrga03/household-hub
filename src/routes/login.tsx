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
      // Check for stored redirect URL
      const redirectUrl = sessionStorage.getItem("redirectUrl");

      if (redirectUrl && redirectUrl !== "/login" && redirectUrl !== "/signup") {
        // Clear the stored URL
        sessionStorage.removeItem("redirectUrl");
        // Navigate to the intended destination
        navigate({ to: redirectUrl });
      } else {
        // Default to dashboard
        navigate({ to: "/" });
      }
    }
  }, [user, navigate]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <LoginForm />
    </div>
  );
}
