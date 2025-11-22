import { useActionState } from "react";
import { AuthError } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface SignupState {
  error: string | null;
  success: boolean;
}

export function SignupForm() {
  const { signUp } = useAuthStore();

  const [state, submitAction, isPending] = useActionState(
    async (_prevState: SignupState, formData: FormData): Promise<SignupState> => {
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;
      const confirmPassword = formData.get("confirmPassword") as string;

      // Client-side validation
      if (password !== confirmPassword) {
        return { error: "Passwords do not match", success: false };
      }

      if (password.length < 6) {
        return { error: "Password must be at least 6 characters", success: false };
      }

      try {
        await signUp(email, password);
        return { error: null, success: true };
      } catch (err) {
        const error = err as AuthError;
        return { error: error.message || "Failed to sign up", success: false };
      }
    },
    { error: null, success: false }
  );

  if (state.success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Check Your Email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            We&apos;ve sent you a confirmation email. Click the link to verify your account.
          </p>
          <Link to="/login" className="mt-4 block">
            <Button className="w-full">Go to Login</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={submitAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              disabled={isPending}
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              disabled={isPending}
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm Password
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              disabled={isPending}
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {state.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <SubmitButton className="w-full" pendingText="Creating account...">
            Sign Up
          </SubmitButton>

          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Log in
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
