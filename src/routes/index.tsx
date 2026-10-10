import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="bg-background">
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold">Home</h1>
        </div>
      </div>

      <PageShell variant="centered">
        <PageShell.Main>
          <Card>
            <CardHeader>
              <CardTitle>Nothing here yet</CardTitle>
              <CardDescription>
                Household Hub is being rebuilt. Your households and accounts will show up here.
              </CardDescription>
            </CardHeader>
          </Card>
        </PageShell.Main>
      </PageShell>
    </div>
  );
}
