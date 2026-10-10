/** The message a form shows when submitting it failed; renders nothing without one. */
export function FormError({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {children}
    </div>
  );
}
