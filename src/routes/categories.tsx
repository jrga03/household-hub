import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { CategoriesView } from "@/components/categories/CategoriesView";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);

  return (
    <div className="bg-background">
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Groups of envelopes your money sits in. Amounts arrive with transactions.
          </p>
        </div>
      </div>

      <PageShell variant="centered">
        <PageShell.Main className="space-y-4">
          {household && userId && <CategoriesView actor={{ householdId: household.id, userId }} />}
        </PageShell.Main>
      </PageShell>
    </div>
  );
}
