import type { ReactNode } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { AppMark } from "@/components/app/AppMark";

/** A signed-out page: the app mark and a title over one narrow column, no chrome. */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PageShell className="flex min-h-dvh max-w-md flex-col justify-center pt-[calc(1.5rem+var(--safe-area-top))] pr-[calc(1rem+var(--safe-area-right))] pb-[calc(1.5rem+var(--safe-area-bottom))] pl-[calc(1rem+var(--safe-area-left))]">
      <PageShell.Main className="space-y-6">
        <div className="flex items-center gap-3">
          <AppMark />
          <h1 className="text-title">{title}</h1>
        </div>
        {children}
      </PageShell.Main>
    </PageShell>
  );
}
