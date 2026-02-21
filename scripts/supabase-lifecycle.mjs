import { execFileSync, execSync } from "node:child_process";

const HEALTH_URL = "http://127.0.0.1:54321/rest/v1/";
const POLL_INTERVAL_MS = 2000;
const HEALTH_TIMEOUT_MS = 60_000;

function log(message) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${message}`);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function isCI() {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI
  );
}

export function isSupabaseInstalled() {
  try {
    execFileSync("supabase", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function isSupabaseRunning() {
  try {
    execSync("supabase status", { stdio: "pipe", cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

export function startSupabase() {
  if (isSupabaseRunning()) {
    log("Supabase already running — skipping start");
    return;
  }

  log("Starting Supabase...");

  try {
    execSync("supabase start", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch (error) {
    const message = error.stderr?.toString() ?? error.message;
    if (/docker/i.test(message)) {
      throw new Error(
        "Docker is not running. Start Docker Desktop and retry, or use `npm run dev:vite` to skip Supabase."
      );
    }
    if (/port.*already in use|address already in use/i.test(message)) {
      console.error("\nPort conflict detected. Current status:");
      try {
        execSync("supabase status", { stdio: "inherit", cwd: process.cwd() });
      } catch {
        // ignore
      }
      throw new Error(
        "Port conflict — another Supabase instance may be running. Try: npx supabase stop --no-backup"
      );
    }
    throw error;
  }

  // Health-check polling
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      execSync(`curl -sf ${HEALTH_URL}`, { stdio: "pipe" });
      log("Supabase is healthy");
      return;
    } catch {
      log("Waiting for Supabase to be ready...");
      sleepSync(POLL_INTERVAL_MS);
    }
  }

  console.error("\nHealth check timed out. Diagnostic info:");
  try {
    execSync("supabase status", { stdio: "inherit", cwd: process.cwd() });
  } catch {
    // ignore
  }
  throw new Error(`Supabase health check timed out after ${HEALTH_TIMEOUT_MS / 1000}s`);
}

export function stopSupabase() {
  log("Stopping Supabase...");
  try {
    execSync("supabase stop", { stdio: "inherit", cwd: process.cwd() });
    log("Supabase stopped");
  } catch (error) {
    console.error("Failed to stop Supabase:", error.message);
  }
}

export function getSupabaseCredentials() {
  let output;
  try {
    output = execSync("supabase status", {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
  } catch (error) {
    throw new Error(`Failed to get Supabase status. Is Supabase running?\n${error.message}`);
  }

  const extract = (label) => {
    const match = output.match(new RegExp(`${label}:\\s+(.+)`));
    return match?.[1]?.trim() ?? null;
  };

  const creds = {
    apiUrl: extract("API URL"),
    anonKey: extract("anon key"),
    serviceRoleKey: extract("service_role key"),
    dbUrl: extract("DB URL"),
    studioUrl: extract("Studio URL"),
  };

  const required = ["apiUrl", "serviceRoleKey"];
  const missing = required.filter((key) => !creds[key]);
  if (missing.length > 0) {
    throw new Error(
      `Failed to extract Supabase credentials (missing: ${missing.join(", ")}).\n` +
        `Raw output:\n${output}`
    );
  }

  return creds;
}
