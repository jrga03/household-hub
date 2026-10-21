import { createFileRoute } from "@tanstack/react-router";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { SettingsView } from "@/components/settings/SettingsView";
import { useHousehold } from "@/hooks/useHousehold";
import { useScrollToHash } from "@/hooks/useScrollToHash";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/settings")({
  staticData: { title: "Settings" },
  validateSearch: readOpenItem,
  component: SettingsPage,
});

function SettingsPage() {
  const { household, isOwner } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const ready = household !== null && userId !== undefined;
  useScrollToHash(ready);

  return (
    <PageShell variant="list-detail">
      {household && userId && (
        <SettingsView household={household} userId={userId} isOwner={isOwner} />
      )}
    </PageShell>
  );
}
