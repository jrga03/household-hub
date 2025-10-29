import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "@/components/AuthProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initSentry } from "@/lib/sentry";

// Initialize Sentry error tracking FIRST (before app render)
// This ensures all errors are captured from the start
initSentry();

// Create query client for server state management
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
