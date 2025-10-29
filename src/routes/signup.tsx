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
      // Check for stored redirect URL (user might have been redirected here)
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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignupForm />
    </div>
  );
}
