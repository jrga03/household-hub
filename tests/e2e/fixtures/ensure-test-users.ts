import { createClient } from "@supabase/supabase-js";
import { testUsers } from "./test-users";

const EMAIL_EXISTS_CODE = "email_exists";
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isLocalSupabaseUrl(url: string): boolean {
  const hostname = hostnameOf(url);
  return hostname !== null && LOCAL_HOSTNAMES.has(hostname);
}

export async function ensureTestUsers(supabaseUrl: string, serviceRoleKey: string) {
  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to create E2E fixture users on ${hostnameOf(supabaseUrl) ?? supabaseUrl}: ` +
        "fixture users are only created on a local Supabase"
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (const { email, password } of Object.values(testUsers)) {
    const { error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error && error.code !== EMAIL_EXISTS_CODE) {
      throw new Error(`Failed to create E2E fixture user ${email}: ${error.message}`);
    }
    console.log(`[global-setup] fixture user ${email}: ${error ? "already present" : "created"}`);
  }
}
