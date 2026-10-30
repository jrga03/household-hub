import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { FinancesSection } from "@/components/finances/FinancesSection";
import { OpeningChecklist } from "@/components/opening/OpeningChecklist";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/")({
  staticData: { title: "Home", floatingAdd: true },
  component: HomePage,
});

function HomePage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);

  return (
    <PageShell variant="supporting-pane">
      {household && userId && (
        <FinancesSection userId={userId}>
          <OpeningChecklist key={household.id} householdId={household.id} />
        </FinancesSection>
      )}
    </PageShell>
  );
}
