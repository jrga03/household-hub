import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AnalyticsDashboard,
  type AnalyticsFilters,
} from "@/components/analytics/AnalyticsDashboard";
import { FilterPanel } from "@/components/analytics/FilterPanel";
import { AnalyticsFilterSheet } from "@/components/analytics/AnalyticsFilterSheet";
import { LoadingSpinner } from "@/components/LoadingScreen";
import { BarChart3, TrendingUp, PieChart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

// Lazy import for category analytics (simulates code splitting benefit)
import { CategoryAnalyticsContent } from "@/components/analytics/CategoryAnalyticsContent";
import { PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/analytics/")({
  component: Analytics,
});

function Analytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
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
          {/* Single @container so the TabsList row, the Filters trigger, and
              the overview grid all query the SAME width — split containers
              left a dead zone where both filter mounts were hidden (R8). */}
          <div className="@container">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="mb-6 flex items-center justify-between gap-2">
                {/* Text labels stay visible at every width (icon-only tabs are
                    unnamed for screen readers, R33); icons hide on narrow
                    containers instead — "By Category" is tight at ~110px. */}
                <TabsList className="grid w-full max-w-md grid-cols-3">
                  <TabsTrigger value="overview" className="flex items-center gap-2">
                    <BarChart3 className="hidden h-4 w-4 @[480px]:block" />
                    <span>Overview</span>
                  </TabsTrigger>
                  <TabsTrigger value="categories" className="flex items-center gap-2">
                    <PieChart className="hidden h-4 w-4 @[480px]:block" />
                    <span>By Category</span>
                  </TabsTrigger>
                  <TabsTrigger value="trends" className="flex items-center gap-2">
                    <TrendingUp className="hidden h-4 w-4 @[480px]:block" />
                    <span>Trends</span>
                  </TabsTrigger>
                </TabsList>
                {/* Below @[1100px] the inline FilterPanel is hidden (it landed
                    after ~10 cards of dashboard, R8); this sheet trigger is the
                    filter entry point there. Only the overview tab is filtered. */}
                {activeTab === "overview" && (
                  <AnalyticsFilterSheet
                    open={filterSheetOpen}
                    onOpenChange={setFilterSheetOpen}
                    triggerClassName="@[1100px]:hidden"
                    // FilterPanel seeds its drafts from initialValues and emits
                    // the COMPLETE filter set, so applied state is REPLACED —
                    // merging ({...prev, ...next}) would let the all-keys
                    // payload (accountId: undefined, …) wipe nothing here, but
                    // replacement is what makes Clear actually clear.
                    onFilterChange={setFilters}
                    initialValues={filters}
                    accounts={accounts}
                    categories={categories}
                  />
                )}
              </div>

              <TabsContent value="overview" className="mt-0">
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-96">
                      <div className="flex flex-col items-center gap-3">
                        <LoadingSpinner size="large" label="Loading overview" />
                        <p className="text-sm text-muted-foreground" aria-hidden="true">
                          Loading overview...
                        </p>
                      </div>
                    </div>
                  }
                >
                  <div className="grid gap-6 @[1100px]:grid-cols-[1fr_320px] @[1500px]:grid-cols-[1fr_380px]">
                    <div className="min-w-0">
                      <AnalyticsDashboard filters={filters} />
                    </div>
                    <div className="hidden min-w-0 @[1100px]:block @[1100px]:sticky @[1100px]:top-4 @[1100px]:self-start">
                      {/* Same seeding as the sheet mount: drafts re-seed from
                          the applied filters, so filters applied via the sheet
                          before resizing up show here too. */}
                      <FilterPanel
                        onFilterChange={setFilters}
                        initialValues={filters}
                        accounts={accounts}
                        categories={categories}
                      />
                    </div>
                  </div>
                </Suspense>
              </TabsContent>

              <TabsContent value="categories" className="mt-0">
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-96">
                      <div className="flex flex-col items-center gap-3">
                        <LoadingSpinner size="large" label="Loading category analytics" />
                        <p className="text-sm text-muted-foreground" aria-hidden="true">
                          Loading category analytics...
                        </p>
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
          </div>
        </PageShell.Main>
      </PageShell>
    </div>
  );
}
