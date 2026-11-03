import { createFileRoute } from "@tanstack/react-router";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { CategoriesView } from "@/components/categories/CategoriesView";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/categories")({
  staticData: { title: "Categories" },
  validateSearch: readOpenItem,
  component: CategoriesPage,
});

function CategoriesPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);

  return (
    <PageShell variant="list-detail">
      {household && userId && <CategoriesView actor={{ householdId: household.id, userId }} />}
    </PageShell>
  );
}
