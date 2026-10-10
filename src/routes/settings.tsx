import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Monitor, Moon, Sun } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { SettingsNav } from "@/components/settings/SettingsNav";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    // Wait one frame so layout settles before scrolling.
    window.requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <div className="bg-background">
      {/* Page Header */}
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your application settings</p>
        </div>
      </div>

      <PageShell variant="nav-content">
        <PageShell.LeftAside>
          <SettingsNav />
        </PageShell.LeftAside>
        <PageShell.Main className="space-y-6 mx-auto w-full max-w-2xl">
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
                  <span className="text-xs font-medium">Light</span>
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="h-5 w-5" />
                  <span className="text-xs font-medium">Dark</span>
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  onClick={() => setTheme("system")}
                >
                  <Monitor className="h-5 w-5" />
                  <span className="text-xs font-medium">System</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </PageShell.Main>
      </PageShell>
    </div>
  );
}
