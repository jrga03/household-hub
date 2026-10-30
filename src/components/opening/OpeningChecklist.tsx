import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Button } from "@/components/app/Button";
import { SectionHeader } from "@/components/app/SectionHeader";
import { useOpeningSteps } from "@/hooks/useOpeningSteps";
import { dismissOpeningChecklist, isOpeningChecklistDismissed } from "@/lib/opening/dismissal";

/** Shown on home until every step is done or the member dismisses it on this device. */
export function OpeningChecklist({ householdId }: { householdId: string }) {
  const steps = useOpeningSteps();
  const [dismissed, setDismissed] = useState(() => isOpeningChecklistDismissed(householdId));

  if (dismissed || !steps) return null;
  if (steps.startingBalances && steps.distributed && steps.budgets) return null;

  function dismiss() {
    dismissOpeningChecklist(householdId);
    setDismissed(true);
  }

  return (
    <section className="space-y-2">
      <SectionHeader
        title="Get started"
        action={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss the opening checklist"
            onClick={dismiss}
          >
            <X />
          </Button>
        }
        className="items-center"
      />
      <p className="text-body text-muted-foreground">
        Three steps to set up your household’s money.
      </p>
      <ol aria-label="Opening checklist" className="@container divide-y border-y">
        <Step
          done={steps.startingBalances}
          title="Set starting balances"
          description="Add each account with what it holds today."
          action={
            <Link to="/accounts" hash="add-account">
              Add an account
            </Link>
          }
        />
        <Step
          done={steps.distributed}
          title="Distribute them into categories"
          description="Move each account’s starting money out of Unassigned."
          action={
            <Link
              to="/assign-money"
              search={{
                distribute: "opening",
                ...(steps.distributeAccountId && { account: steps.distributeAccountId }),
              }}
            >
              Distribute
            </Link>
          }
        />
        <Step
          done={steps.budgets}
          title="Set budgets"
          description="Give each category a monthly target."
          action={<Link to="/set-budgets">Set budgets</Link>}
        />
      </ol>
    </section>
  );
}

function Step({
  done,
  title,
  description,
  action,
}: {
  done: boolean;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      {done ? (
        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
      ) : (
        <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 @[480px]:flex-row @[480px]:items-center @[480px]:justify-between">
        <div className="min-w-0">
          <p className={done ? "font-medium text-muted-foreground line-through" : "font-medium"}>
            {title}
            <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
          </p>
          <p className="text-body text-muted-foreground">{description}</p>
        </div>
        {!done && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            {action}
          </Button>
        )}
      </div>
    </li>
  );
}
