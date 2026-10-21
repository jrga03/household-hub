import { useActionState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { ActionForm } from "@/components/app/ActionForm";
import { Button } from "@/components/app/Button";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { Input } from "@/components/app/Input";
import { SubmitButton } from "@/components/app/SubmitButton";
import { AuthPage } from "@/components/AuthPage";
import { useFocusFirstProblem } from "@/hooks/useFocusFirstProblem";
import { errorMessage } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 6;

interface SignupState {
  problems: Partial<Record<"email" | "password" | "confirmPassword" | "form", string>>;
  signedUp: boolean;
}

export function SignupForm() {
  const { signUp } = useAuthStore();

  const [state, submitAction] = useActionState(
    async (_previous: SignupState, formData: FormData): Promise<SignupState> => {
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      const confirmPassword = String(formData.get("confirmPassword") ?? "");
      const problems: SignupState["problems"] = {};
      if (!email) problems.email = "Enter your email.";
      if (password.length < MIN_PASSWORD_LENGTH) {
        problems.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      } else if (password !== confirmPassword) {
        problems.confirmPassword = "Passwords don’t match.";
      }
      if (Object.keys(problems).length > 0) return { problems, signedUp: false };

      try {
        await signUp(email, password);
        return { problems: {}, signedUp: true };
      } catch (caught) {
        return {
          problems: { form: errorMessage(caught, "Couldn’t create the account. Try again.") },
          signedUp: false,
        };
      }
    },
    { problems: {}, signedUp: false }
  );
  const { problems } = state;
  const formRef = useFocusFirstProblem(problems);

  if (state.signedUp) {
    return (
      <AuthPage title="Check your email">
        <p className="text-body text-muted-foreground">
          We sent you a confirmation email. Open its link to verify your account, then log in.
        </p>
        <Button asChild className="w-full">
          <Link to="/login">Go to login</Link>
        </Button>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Create an account">
      <ActionForm ref={formRef} action={submitAction} noValidate className="space-y-4">
        <Field label="Email" error={problems.email}>
          <Input name="email" type="email" autoComplete="email" enterKeyHint="next" />
        </Field>
        <Field
          label="Password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={problems.password}
        >
          <Input name="password" type="password" autoComplete="new-password" enterKeyHint="next" />
        </Field>
        <Field label="Confirm password" error={problems.confirmPassword}>
          <Input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            enterKeyHint="done"
          />
        </Field>
        <FormError>{problems.form ?? null}</FormError>
        <SubmitButton className="w-full" pendingText="Creating account…">
          Sign up
        </SubmitButton>
      </ActionForm>
      <p className="text-center text-body text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthPage>
  );
}
