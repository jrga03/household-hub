import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";

export const Route = createFileRoute("/analytics")({
  component: Analytics,
});

function Analytics() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Financial Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Deep insights into your spending patterns and financial health
        </p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
