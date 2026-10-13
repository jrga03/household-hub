import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { ReadStatement } from "@/components/import/ReadStatement";

export const Route = createFileRoute("/import")({
  staticData: { title: "Import statement" },
  component: ImportPage,
});

function ImportPage() {
  return (
    <PageShell variant="centered">
      <ReadStatement />
    </PageShell>
  );
}
