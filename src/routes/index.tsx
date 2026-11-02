import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { FinancesSection } from "@/components/finances/FinancesSection";
import { OpeningChecklist } from "@/components/opening/OpeningChecklist";
import { useHousehold } from "@/hooks/useHousehold";
import { useOpeningSteps } from "@/hooks/useOpeningSteps";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/")({
  staticData: { title: "Home", floatingAdd: true },
  component: HomePage,
});

function HomePage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const openingSteps = useOpeningSteps();

  return (
    <PageShell variant="supporting-pane">
      {/* The checklist leads the page, so the page waits for it rather than move down under it. */}
      {household && userId && openingSteps && (
        <FinancesSection actor={{ householdId: household.id, userId }}>
          <OpeningChecklist key={household.id} householdId={household.id} steps={openingSteps} />
        </FinancesSection>
      )}
    </PageShell>
  );
}
