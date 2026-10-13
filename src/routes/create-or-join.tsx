import { createFileRoute } from "@tanstack/react-router";
import { CreateOrJoinChoices } from "@/components/households/CreateOrJoin";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { signOutWithToast } from "@/lib/sign-out";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/create-or-join")({
  component: CreateOrJoinPage,
});

function CreateOrJoinPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <PageShell
      variant="centered"
      className="flex min-h-dvh max-w-md flex-col gap-6 pt-[calc(1.5rem+var(--safe-area-top))] pr-[calc(1rem+var(--safe-area-right))] pb-[calc(0.5rem+var(--safe-area-bottom))] pl-[calc(1rem+var(--safe-area-left))]"
    >
      <PageShell.Main className="flex-1 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <span className="text-xs font-bold">HH</span>
            </div>
            <h1 className="text-lg font-semibold">Welcome to Household Hub</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Everything you record belongs to a household. Start your own, or join one a member
            shares with you. Alone? A household of one works the same.
          </p>
        </div>

        {user && <CreateOrJoinChoices userId={user.id} />}
      </PageShell.Main>

      <footer className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">Signed in as {user?.email}</span>
        <span aria-hidden="true">·</span>
        <Button
          variant="link"
          className="min-h-11 shrink-0 px-1 text-muted-foreground"
          onClick={() => void signOutWithToast()}
        >
          Sign Out
        </Button>
      </footer>
    </PageShell>
  );
}
