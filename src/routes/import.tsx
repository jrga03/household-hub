import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { ImportView } from "@/components/import/ImportView";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/import")({
  component: ImportPage,
});

function ImportPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);

  return (
    <div className="bg-background">
      <div className="border-b">
        {/* Aligned with the rail layout below, which drops its max width from 1100px. */}
        <div className="@container">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 @[1100px]:max-w-none">
            <h1 className="text-xl font-bold">Import statement</h1>
            <p className="text-sm text-muted-foreground">
              Turn a card statement into transactions. Lines wait as drafts on this device until you
              save or discard them.
            </p>
          </div>
        </div>
      </div>

      <PageShell variant="rail">
        {household && userId && <ImportView actor={{ householdId: household.id, userId }} />}
      </PageShell>
    </div>
  );
}
