import { createFileRoute, redirect } from "@tanstack/react-router";
import { AssistantView } from "@/components/assistant/AssistantView";
import { PageShell } from "@/components/layout/PageShell";
import { useHousehold } from "@/hooks/useHousehold";
import { ASSISTANT_URL } from "@/lib/assistant/config";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/assistant")({
  staticData: { title: "Assistant" },
  beforeLoad: () => {
    if (!ASSISTANT_URL) throw redirect({ to: "/" });
  },
  component: AssistantPage,
});

function AssistantPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);

  return (
    <PageShell variant="centered">
      <PageShell.Main>
        {household && userId && <AssistantView actor={{ householdId: household.id, userId }} />}
      </PageShell.Main>
    </PageShell>
  );
}
