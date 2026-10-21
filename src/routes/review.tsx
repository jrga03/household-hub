import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { ReviewView } from "@/components/review/ReviewView";

export const Route = createFileRoute("/review")({
  staticData: { title: "Review" },
  component: ReviewPage,
});

function ReviewPage() {
  return (
    <PageShell>
      <PageShell.Main>
        <ReviewView />
      </PageShell.Main>
    </PageShell>
  );
}
