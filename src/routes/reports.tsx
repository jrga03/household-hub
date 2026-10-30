import { createFileRoute } from "@tanstack/react-router";
import { Notice } from "@/components/app/Notice";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { ReportsView } from "@/components/reports/ReportsView";
import { useCategoryList } from "@/hooks/useCategories";
import { useSpendingGrids } from "@/hooks/useSpendingGrids";
import { readReportsSearch, type ReportsSearch } from "@/lib/reports/search";
import { todayLocalDate } from "@/lib/utils/dates";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/reports")({
  staticData: { title: "Reports" },
  validateSearch: (search: Record<string, unknown>) => ({
    ...readReportsSearch(search),
    ...readOpenItem(search),
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const userId = useAuthStore((state) => state.user?.id);

  return <PageShell variant="list-detail">{userId && <Reports userId={userId} />}</PageShell>;
}

function Reports({ userId }: { userId: string }) {
  const today = todayLocalDate();
  const grids = useSpendingGrids(userId, today);
  const categories = useCategoryList();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // Each change pushes an entry, so back restores the view before it.
  const change = (patch: ReportsSearch) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch }), resetScroll: false });

  if (grids === null) {
    return (
      <PageShell.List>
        <Notice tone="warning">Couldn’t add up Spending. Reload the page to try again.</Notice>
      </PageShell.List>
    );
  }
  if (!grids || !categories) return null;
  return (
    <ReportsView
      grids={grids}
      categories={categories}
      search={search}
      today={today}
      onSearchChange={change}
    />
  );
}
