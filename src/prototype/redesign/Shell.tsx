/* eslint-disable arch/no-direct-primitive-import -- prototype (#194), throwaway branch */
// PROTOTYPE (#194): a rough stand-in for AppLayout, without the router or auth.
import type { ReactNode } from "react";
import {
  ClipboardCheck,
  FileUp,
  Home,
  Layers,
  Menu,
  PiggyBank,
  Plus,
  Receipt,
  Settings,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REVIEW_COUNT } from "./fixtures";
import type { ScreenKey } from "./screens";

const DAILY = [
  { screen: "home", label: "Home", icon: Home },
  { screen: "transactions", label: "Transactions", icon: Receipt },
  { screen: "budget", label: "Budget", icon: PiggyBank },
  { screen: null, label: "Review", icon: ClipboardCheck, count: REVIEW_COUNT },
  { screen: null, label: "Assistant", icon: Sparkles },
] as const;

const MANAGE = [
  { label: "Accounts", icon: Wallet },
  { label: "Import", icon: FileUp },
  { label: "Categories", icon: Layers },
  { label: "Settings", icon: Settings },
] as const;

interface ShellProps {
  screen: ScreenKey;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Shell({ screen, title, actions, children }: ShellProps) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r bg-card p-3 md:flex">
        <p className="px-2 pt-1 text-heading">Household Hub</p>
        <nav className="flex flex-col gap-0.5">
          {DAILY.map((item) => (
            <span
              key={item.label}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-2 text-body font-medium text-muted-foreground",
                item.screen === screen && "bg-accent text-foreground"
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
              {"count" in item && (
                <span className="ml-auto rounded-full bg-secondary px-2 text-caption text-secondary-foreground">
                  {item.count}
                </span>
              )}
            </span>
          ))}
        </nav>
        <p className="px-2 text-caption text-muted-foreground">Manage</p>
        <nav className="flex flex-col gap-0.5">
          {MANAGE.map((item) => (
            <span
              key={item.label}
              className="flex h-9 items-center gap-3 rounded-md px-2 text-body font-medium text-muted-foreground"
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </span>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-4">
          <Button variant="ghost" size="icon" className="-ml-2 md:hidden" aria-label="Menu">
            <Menu />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-title">{title}</h1>
          {actions}
          <Button className="hidden md:inline-flex">
            <Plus />
            Add transaction
          </Button>
        </header>

        <main className="@container min-w-0 flex-1 pb-[calc(var(--tab-bar-height)+2rem)] md:pb-8">
          {children}
        </main>
      </div>

      <Button
        size="icon"
        aria-label="Add transaction"
        className="fixed right-4 bottom-[calc(var(--tab-bar-height)+1rem)] z-40 size-14 rounded-full shadow-float md:hidden"
      >
        <Plus className="size-6" />
      </Button>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[var(--tab-bar-height)] grid-cols-2 border-t bg-background md:hidden">
        {DAILY.slice(0, 2).map((tab) => (
          <span
            key={tab.label}
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-caption font-medium leading-none text-muted-foreground",
              tab.screen === screen && "text-primary"
            )}
          >
            <tab.icon className="size-5" aria-hidden />
            {tab.label}
          </span>
        ))}
      </nav>
    </div>
  );
}
