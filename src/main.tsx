import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "@/components/AuthProvider";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { initSentry } from "@/lib/sentry";

// Initialize Sentry error tracking FIRST (before app render)
// This ensures all errors are captured from the start
initSentry();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element missing from index.html");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
