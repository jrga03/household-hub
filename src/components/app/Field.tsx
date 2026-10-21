import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { Label } from "./Label";

interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

type FieldChild =
  ReactElement<{ "aria-describedby"?: string }> | ((control: FieldControlProps) => ReactNode);

/**
 * A labelled form control with an optional hint and error. Pass the control as the child,
 * or a function that spreads the wiring onto a control nested deeper (a Select trigger).
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: FieldChild;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function controlProps(existingDescription?: string): FieldControlProps {
    const describedBy = [existingDescription, hint && hintId, error && errorId]
      .filter(Boolean)
      .join(" ");
    return {
      id,
      "aria-describedby": describedBy || undefined,
      "aria-invalid": error ? true : undefined,
    };
  }

  const control =
    typeof children === "function"
      ? children(controlProps())
      : cloneElement(children, controlProps(children.props["aria-describedby"]));

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
