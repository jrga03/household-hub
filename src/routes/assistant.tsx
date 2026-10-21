import { useEffect } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AssistantView } from "@/components/assistant/AssistantView";
import { PageShell } from "@/components/layout/PageShell";
import { useHousehold } from "@/hooks/useHousehold";
import { ASSISTANT_URL } from "@/lib/assistant/config";
import { useAssistantStore } from "@/stores/assistantStore";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/assistant")({
  // The composer is pinned to the bottom edge instead.
  staticData: { title: "Assistant", bottomChrome: false },
  beforeLoad: () => {
    if (!ASSISTANT_URL) throw redirect({ to: "/" });
  },
  component: AssistantPage,
});

function AssistantPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const openChat = useAssistantStore((state) => state.open);

  useEffect(() => {
    if (userId) void openChat(userId);
  }, [userId, openChat]);

  return (
    <PageShell className="pb-0">
      <PageShell.Main>
        {household && userId && <AssistantView actor={{ householdId: household.id, userId }} />}
      </PageShell.Main>
    </PageShell>
  );
}
