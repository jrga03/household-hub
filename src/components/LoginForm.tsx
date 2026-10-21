import { useActionState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { ActionForm } from "@/components/app/ActionForm";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { Input } from "@/components/app/Input";
import { SubmitButton } from "@/components/app/SubmitButton";
import { AuthPage } from "@/components/AuthPage";
import { useFocusFirstProblem } from "@/hooks/useFocusFirstProblem";
import { errorMessage } from "@/lib/utils";

type LoginProblems = Partial<Record<"email" | "password" | "form", string>>;

export function LoginForm() {
  const { signIn } = useAuthStore();

  const [problems, submitAction] = useActionState(
    async (_previous: LoginProblems, formData: FormData): Promise<LoginProblems> => {
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      const fields: LoginProblems = {};
      if (!email) fields.email = "Enter your email.";
      if (!password) fields.password = "Enter your password.";
      if (Object.keys(fields).length > 0) return fields;

      try {
        await signIn(email, password);
        return {};
      } catch (caught) {
        return { form: errorMessage(caught, "Couldn’t log in. Try again.") };
      }
    },
    {}
  );
  const formRef = useFocusFirstProblem(problems);

  return (
    <AuthPage title="Log in to Household Hub">
      <ActionForm ref={formRef} action={submitAction} noValidate className="space-y-4">
        <Field label="Email" error={problems.email}>
          <Input name="email" type="email" autoComplete="email" enterKeyHint="next" />
        </Field>
        <Field label="Password" error={problems.password}>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            enterKeyHint="done"
          />
        </Field>
        <FormError>{problems.form ?? null}</FormError>
        <SubmitButton className="w-full" pendingText="Logging in…">
          Log in
        </SubmitButton>
      </ActionForm>
      <p className="text-center text-body text-muted-foreground">
        Don’t have an account?{" "}
        <Link to="/signup" className="text-primary underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </AuthPage>
  );
}
