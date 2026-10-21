import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { FinancesSection } from "@/components/finances/FinancesSection";
import { OpeningChecklist } from "@/components/opening/OpeningChecklist";
import { ReviewBanner } from "@/components/review/ReviewBanner";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/")({
  staticData: { title: "Home" },
  component: HomePage,
});

function HomePage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);

  return (
    <PageShell>
      <PageShell.Main className="space-y-4">
        {/* Home's sections, top to bottom. */}
        {household && <ReviewBanner />}
        {household && <OpeningChecklist key={household.id} householdId={household.id} />}
        {household && userId && <FinancesSection userId={userId} />}
      </PageShell.Main>
    </PageShell>
  );
}
