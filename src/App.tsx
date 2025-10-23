import { useAuthStore } from "@/stores/authStore";
import { LoginForm } from "@/components/LoginForm";

function App() {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoginForm />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Welcome!</h1>
        <p className="mt-2 text-muted-foreground">Logged in as: {user.email}</p>
        <button
          onClick={() => useAuthStore.getState().signOut()}
          className="mt-4 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default App;
