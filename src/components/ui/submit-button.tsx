import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import * as React from "react";

interface SubmitButtonProps extends Omit<React.ComponentProps<typeof Button>, "type"> {
  /**
   * Text to display when the form is idle (not submitting)
   */
  children: React.ReactNode;
  /**
   * Text to display when the form is submitting
   * @default "Submitting..."
   */
  pendingText?: React.ReactNode;
  /**
   * Whether to show a loading spinner when pending
   * @default true
   */
  showSpinner?: boolean;
}

/**
 * A submit button that automatically reflects form submission state using React 19's useFormStatus().
 *
 * MUST be used as a child of a <form> element to work correctly.
 *
 * Features:
 * - Automatically disables during form submission
 * - Shows custom pending text and spinner
 * - Includes proper ARIA attributes for accessibility
 * - Combines with any other Button props
 *
 * @example
 * <form action={submitAction}>
 *   <input name="email" type="email" />
 *   <SubmitButton>Sign In</SubmitButton>
 * </form>
 *
 * @example
 * <form action={submitAction}>
 *   <input name="username" />
 *   <SubmitButton pendingText="Creating account..." showSpinner={false}>
 *     Sign Up
 *   </SubmitButton>
 * </form>
 */
export function SubmitButton({
  children,
  pendingText = "Submitting...",
  showSpinner = true,
  disabled,
  className,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      aria-busy={pending}
      className={className}
      {...props}
    >
      {pending && showSpinner && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {pending ? pendingText : children}
    </Button>
  );
}
