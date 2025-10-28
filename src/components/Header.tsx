import { Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { SyncStatus } from "@/components/SyncStatus";
import { SyncButton } from "@/components/SyncButton";

export function Header() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <header className="border-b">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="text-xl font-bold hover:text-primary">
            Household Hub
          </Link>
          <nav className="flex gap-4">
            <Link
              to="/accounts"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Accounts
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <SyncStatus />
          <SyncButton />
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
