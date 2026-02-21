import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE_FILE = join(tmpdir(), "playwright-supabase-state.json");

async function globalTeardown() {
  const { isCI, stopSupabase } = await import("../../scripts/supabase-lifecycle.mjs");

  if (isCI()) {
    console.log("[global-teardown] CI detected — skipping Supabase stop");
    return;
  }

  // Only stop Supabase if we started it
  let startedByPlaywright = false;
  try {
    if (existsSync(STATE_FILE)) {
      const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      startedByPlaywright = state.startedByPlaywright === true;
      unlinkSync(STATE_FILE);
    }
  } catch {
    // State file missing or corrupt — default to not stopping
  }

  if (startedByPlaywright) {
    console.log("[global-teardown] Stopping Supabase (started by Playwright)");
    stopSupabase();
  } else {
    console.log("[global-teardown] Leaving Supabase running (was already running before tests)");
  }
}

export default globalTeardown;
