import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/app/Button";
import { SectionHeader } from "@/components/app/SectionHeader";
import { cn, errorMessage } from "@/lib/utils";

/** A "Retired" header that shows or hides its rows; nothing when `count` is zero. */
export function RetiredSection({
  count,
  label,
  level,
  className,
  children,
}: {
  count: number;
  /** The list's accessible name. */
  label: string;
  level?: 2 | 3;
  /** Classes for the list. */
  className?: string;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  if (count === 0) return null;

  return (
    <section className="space-y-1">
      <SectionHeader
        level={level}
        title="Retired"
        action={
          <Button
            variant="link"
            className="h-auto p-0"
            aria-expanded={shown}
            onClick={() => setShown(!shown)}
          >
            {shown ? "Hide retired" : `Show retired (${count})`}
          </Button>
        }
      />
      {shown && (
        <ul aria-label={label} className={cn("divide-y border-y", className)}>
          {children}
        </ul>
      )}
    </section>
  );
}

/** Runs actions on retired rows one at a time; `unretire` announces the result. */
export function useRetiredActions() {
  const [busy, startAction] = useTransition();
  const unretire = (name: string, action: () => Promise<void>) =>
    startAction(async () => {
      try {
        await action();
        toast.success(`${name} is back in use`);
      } catch (caught) {
        toast.error(errorMessage(caught, `Couldn't unretire ${name}.`));
      }
    });
  return { busy, startAction, unretire };
}
