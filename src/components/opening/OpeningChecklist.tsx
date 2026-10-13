import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Get started</CardTitle>
        <CardDescription>Three steps to set up your household&apos;s money.</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss the opening checklist"
            onClick={dismiss}
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol aria-label="Opening checklist" className="@container divide-y rounded-md border">
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
            description="Move each account's starting money out of Unassigned."
            action={
              <Link
                to="/distribute"
                search={{
                  mode: "opening",
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
            action={<Link to="/categories">Set budgets</Link>}
          />
        </ol>
      </CardContent>
    </Card>
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
    <li className="flex items-start gap-3 px-3 py-2">
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
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild variant={done ? "ghost" : "outline"} size="sm" className="shrink-0">
          {action}
        </Button>
      </div>
    </li>
  );
}
