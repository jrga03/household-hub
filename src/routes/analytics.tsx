import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AnalyticsDashboard,
  type AnalyticsFilters,
} from "@/components/analytics/AnalyticsDashboard";
import { FilterPanel } from "@/components/analytics/FilterPanel";
import { BarChart3, TrendingUp, PieChart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

// Lazy import for category analytics (simulates code splitting benefit)
import { CategoryAnalyticsContent } from "@/components/analytics/CategoryAnalyticsContent";
import { PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/analytics")({
  component: Analytics,
});

function Analytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const [filters, setFilters] = useState<AnalyticsFilters>({
    startDate: startOfMonth(subMonths(new Date(), 5)),
    endDate: endOfMonth(new Date()),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .is("parent_id", null)
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="bg-background">
      {/* Page Header */}
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold">Financial Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Deep insights into your spending patterns and financial health
          </p>
        </div>
      </div>

      <PageShell variant="centered">
        <PageShell.Main>
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
                <div className="@container">
                  <div className="grid gap-6 @[1100px]:grid-cols-[1fr_320px] @[1500px]:grid-cols-[1fr_380px]">
                    <div className="min-w-0">
                      <AnalyticsDashboard filters={filters} />
                    </div>
                    <div className="min-w-0 @[1100px]:sticky @[1100px]:top-4 @[1100px]:self-start">
                      <FilterPanel
                        onFilterChange={(next) => setFilters({ ...filters, ...next })}
                        accounts={accounts}
                        categories={categories}
                      />
                    </div>
                  </div>
                </div>
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
        </PageShell.Main>
      </PageShell>
    </div>
  );
}
