import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  isCI,
  isSupabaseInstalled,
  isSupabaseRunning,
  startSupabase,
  stopSupabase,
} from "./supabase-lifecycle.mjs";

let weStartedIt = false;
let viteProcess = null;
let isShuttingDown = false;

function runVite() {
  viteProcess = spawn("npx", ["vite"], {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  viteProcess.on("close", (code) => {
    if (!isShuttingDown) {
      process.exit(code ?? 0);
    }
  });
}

async function promptStopSupabase() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("\nStop Supabase? (Y/n): ", (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "" || normalized === "y" || normalized === "yes");
    });
  });
}

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Wait for Vite to exit cleanly before prompting
  if (viteProcess && !viteProcess.killed) {
    await new Promise((resolve) => {
      let exited = false;
      viteProcess.once("close", () => {
        exited = true;
        resolve();
      });
      viteProcess.kill("SIGTERM");
      // Force-kill after 5s if Vite hasn't exited
      setTimeout(() => {
        if (!exited) viteProcess.kill("SIGKILL");
        resolve();
      }, 5000);
    });
  }

  if (weStartedIt) {
    try {
      const shouldStop = await promptStopSupabase();
      if (shouldStop) {
        stopSupabase();
      } else {
        console.log("Supabase still running. Stop with: npx supabase stop");
      }
    } catch {
      // stdin closed (e.g. piped input) — stop by default
      stopSupabase();
    }
  }

  process.exit(0);
}

// Register handlers early so they're active during Supabase startup
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// --- Main ---

if (isCI()) {
  runVite();
} else {
  if (!isSupabaseInstalled()) {
    console.error("Supabase CLI not found. Install with: brew install supabase/tap/supabase");
    console.error("Or skip Supabase: npm run dev:vite");
    process.exit(1);
  }

  if (isSupabaseRunning()) {
    console.log("[supabase] Already running — skipping start");
  } else {
    try {
      startSupabase();
      weStartedIt = true;
    } catch (error) {
      console.error(`\n${error.message}`);
      console.error("\nTo skip Supabase: npm run dev:vite");
      process.exit(1);
    }
  }

  runVite();
}
