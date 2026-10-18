import { createFileRoute } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Monitor, Moon, Sun } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { HouseholdSettings } from "@/components/households/HouseholdSettings";
import { ExportCard } from "@/components/settings/ExportCard";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { useHousehold } from "@/hooks/useHousehold";
import { useScrollToHash } from "@/hooks/useScrollToHash";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/settings")({
  staticData: { title: "Settings" },
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { household, isOwner } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  useScrollToHash();

  return (
    <PageShell variant="nav-content">
      <PageShell.LeftAside>
        <SettingsNav />
      </PageShell.LeftAside>
      <PageShell.Main className="space-y-6 mx-auto w-full max-w-2xl">
        {household && userId && (
          <HouseholdSettings household={household} userId={userId} isOwner={isOwner} />
        )}
        <Card id="appearance" className="scroll-mt-4">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how Household Hub looks to you</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                className="flex flex-col items-center gap-2 h-auto py-4"
                onClick={() => setTheme("light")}
              >
                <Sun className="h-5 w-5" />
                <span className="text-label">Light</span>
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                className="flex flex-col items-center gap-2 h-auto py-4"
                onClick={() => setTheme("dark")}
              >
                <Moon className="h-5 w-5" />
                <span className="text-label">Dark</span>
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                className="flex flex-col items-center gap-2 h-auto py-4"
                onClick={() => setTheme("system")}
              >
                <Monitor className="h-5 w-5" />
                <span className="text-label">System</span>
              </Button>
            </div>
          </CardContent>
        </Card>
        <ExportCard />
      </PageShell.Main>
    </PageShell>
  );
}
