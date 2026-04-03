import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { BarChart3, TrendingUp, PieChart } from "lucide-react";

// Lazy import for category analytics (simulates code splitting benefit)
import { CategoryAnalyticsContent } from "@/components/analytics/CategoryAnalyticsContent";

export const Route = createFileRoute("/analytics")({
  component: Analytics,
});

function Analytics() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="min-h-dvh bg-background">
      {/* Page Header */}
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold">Financial Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Deep insights into your spending patterns and financial health
          </p>
        </div>
      </div>

      <main className="container mx-auto max-w-7xl px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              <span className="hidden sm:inline">By Category</span>
            </TabsTrigger>
            <TabsTrigger value="trends" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Trends</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-96">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Loading overview...</p>
                  </div>
                </div>
              }
            >
              <AnalyticsDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="categories" className="mt-0">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-96">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Loading category analytics...</p>
                  </div>
                </div>
              }
            >
              <CategoryAnalyticsContent />
            </Suspense>
          </TabsContent>

          <TabsContent value="trends" className="mt-0">
            <div className="flex flex-col items-center justify-center h-96 text-center space-y-4">
              <TrendingUp className="h-16 w-16 text-muted-foreground/50" />
              <div>
                <h3 className="text-lg font-semibold">Trends Coming Soon</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Advanced spending trends and predictions will be available here
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
