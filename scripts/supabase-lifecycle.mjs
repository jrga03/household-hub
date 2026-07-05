import { execFileSync, execSync } from "node:child_process";

const POLL_INTERVAL_MS = 2000;
const HEALTH_TIMEOUT_MS = 60_000;

/**
 * Resolve the local API base URL from `supabase status` instead of assuming
 * the default 54321. This project moved the API port (config.toml [api] port
 * = 54331), so the hardcoded default could never succeed and every cold
 * start burned the full 60s timeout (review INFRA-05).
 */
function getHealthUrl() {
  try {
    const status = execSync("supabase status", { stdio: "pipe", cwd: process.cwd() }).toString();
    const match = status.match(/API URL:\s*(\S+)/i);
    if (match) {
      // /auth/v1/health needs no apikey, so `curl -sf` (fails on non-2xx)
      // won't false-negative on the 401 that /rest/v1/ returns unauthenticated
      return `${match[1].replace(/\/$/, "")}/auth/v1/health`;
    }
  } catch {
    // status not available yet (Supabase still starting) - fall through
  }
  return "http://127.0.0.1:54331/auth/v1/health";
}

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

  // Health-check polling (URL resolved now that `supabase start` has run)
  const healthUrl = getHealthUrl();
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      execSync(`curl -sf ${healthUrl}`, { stdio: "pipe" });
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

function parseStatusEnvOutput(output) {
  const env = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/);
    if (match) {
      env[match[1]] = match[2];
    }
  }
  return env;
}

export function getSupabaseCredentials() {
  // Parse the machine-readable env output (KEY="value" lines) — never the
  // human-readable `supabase status` output, which breaks on CLI upgrades.
  let output;
  try {
    output = execSync("supabase status -o env", {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
  } catch (error) {
    throw new Error(`Failed to get Supabase status. Is Supabase running?\n${error.message}`);
  }

  const env = parseStatusEnvOutput(output);

  const creds = {
    apiUrl: env.API_URL ?? null,
    anonKey: env.ANON_KEY ?? null,
    serviceRoleKey: env.SERVICE_ROLE_KEY ?? null,
    dbUrl: env.DB_URL ?? null,
    studioUrl: env.STUDIO_URL ?? null,
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
