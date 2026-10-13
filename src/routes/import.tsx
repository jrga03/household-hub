import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { ReadStatement } from "@/components/import/ReadStatement";

export const Route = createFileRoute("/import")({
  component: ImportPage,
});

function ImportPage() {
  return (
    <div className="bg-background">
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold">Import statement</h1>
          <p className="text-sm text-muted-foreground">
            Read a card statement on this device. The file and its password never leave it.
          </p>
        </div>
      </div>

      <PageShell variant="centered">
        <ReadStatement />
      </PageShell>
    </div>
  );
}
