import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { PageShell } from "@/components/layout/PageShell";
import { DistributeMoney } from "@/components/budgets/DistributeMoney";
import { useHousehold } from "@/hooks/useHousehold";
import { isLocalDate } from "@/lib/transactions/events";
import { useAuthStore } from "@/stores/authStore";

interface DistributeSearch {
  /** The source account; the first one that holds envelopes when left out. */
  account?: string;
  /** The income to split, as typed ("40000.00"); the source's Unassigned when left out. */
  amount?: string;
  /** "yyyy-MM-dd"; today when left out. */
  date?: string;
  /** Splits the opening balance: blank lines, every one kept in the source. */
  mode?: "opening";
}

export const Route = createFileRoute("/distribute")({
  staticData: { title: "Distribute money", parent: "/categories" },
  validateSearch: (search: Record<string, unknown>): DistributeSearch => ({
    ...(typeof search.account === "string" && { account: search.account }),
    ...(typeof search.amount === "string" && { amount: search.amount }),
    ...(isLocalDate(search.date) && { date: search.date }),
    ...(search.mode === "opening" && { mode: "opening" }),
  }),
  component: DistributePage,
});

function DistributePage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const opening = search.mode === "opening";

  return (
    <PageShell variant="centered">
      {household && userId && (
        <DistributeMoney
          actor={{ householdId: household.id, userId }}
          mode={opening ? "opening" : "income"}
          initialAccountId={search.account}
          initialAmount={search.amount}
          initialDate={search.date ?? format(new Date(), "yyyy-MM-dd")}
          onDone={() => void navigate({ to: "/categories" })}
        />
      )}
    </PageShell>
  );
}
