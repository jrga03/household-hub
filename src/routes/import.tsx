import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { ImportView } from "@/components/import/ImportView";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/import")({
  staticData: { title: "Import statement" },
  component: ImportPage,
});

function ImportPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);

  return (
    <PageShell variant="list-detail">
      {household && userId && <ImportView actor={{ householdId: household.id, userId }} />}
    </PageShell>
  );
}
