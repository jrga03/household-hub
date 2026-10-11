import type { Session } from "@supabase/supabase-js";

export const AUTH_STORAGE_KEY = "household-hub-auth";

const isStoredSession = (value: unknown): value is Session =>
  typeof value === "object" &&
  value !== null &&
  "user" in value &&
  typeof value.user === "object" &&
  value.user !== null &&
  "id" in value.user &&
  typeof value.user.id === "string";

/** The session auth-js keeps in storage, even after a refresh that failed offline. */
export function readStoredSession(): Session | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? "null");
    return isStoredSession(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** auth-js keeps the session when sign-out can't reach the server. */
export function forgetStoredSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
}
