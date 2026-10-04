import { createClient } from "@supabase/supabase-js";
import { testUsers } from "./test-users";

const EMAIL_EXISTS_CODE = "email_exists";

export async function ensureTestUsers(supabaseUrl: string, serviceRoleKey: string) {
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
