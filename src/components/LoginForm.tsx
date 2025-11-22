import { useActionState } from "react";
import { AuthError } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function LoginForm() {
  const { signIn } = useAuthStore();

  const [state, submitAction, isPending] = useActionState(
    async (_prevState: { error: string | null }, formData: FormData) => {
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;

      try {
        await signIn(email, password);
        return { error: null };
      } catch (err) {
        const error = err as AuthError;
        return { error: error.message || "Failed to sign in" };
      }
    },
    { error: null }
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Login to Household Hub</CardTitle>
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
              autoComplete="current-password"
            />
          </div>

          {state.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <SubmitButton className="w-full" pendingText="Signing in...">
            Sign In
          </SubmitButton>

          <div className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
