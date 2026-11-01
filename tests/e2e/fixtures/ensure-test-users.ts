import { createClient } from "@supabase/supabase-js";
import { householdlessUser, testUsers } from "./test-users";

const EMAIL_EXISTS_CODE = "email_exists";
const FIXTURE_HOUSEHOLD_NAME = "Test household";
const ALREADY_IN_HOUSEHOLD = "You already belong to a household";
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);
// The address signUpNewPerson gives each fresh person.
const SIGN_UP_EMAIL = /^test-\d+-[a-z0-9]+@example\.com$/;
// Longer than a whole run, so another worktree's run keeps its people.
const STALE_AFTER_MS = 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 50;
const LIST_PAGE_SIZE = 1000;

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

export function isStaleSignUp(user: { email?: string; created_at: string }, now: number) {
  return SIGN_UP_EMAIL.test(user.email ?? "") && now - Date.parse(user.created_at) > STALE_AFTER_MS;
}

/**
 * Deletes the people earlier runs signed up, so the shared local stack does not keep
 * their households and pending Join Requests forever.
 */
export async function deleteStaleSignUps(supabaseUrl: string, serviceRoleKey: string) {
  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to delete E2E sign-ups on ${hostnameOf(supabaseUrl) ?? supabaseUrl}: ` +
        "sign-ups are only deleted on a local Supabase"
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = Date.now();
  const staleIds: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: LIST_PAGE_SIZE,
    });
    if (error) throw new Error(`Failed to list E2E sign-ups: ${error.message}`);
    staleIds.push(...data.users.filter((user) => isStaleSignUp(user, now)).map((user) => user.id));
    if (data.users.length < LIST_PAGE_SIZE) break;
  }

  for (let start = 0; start < staleIds.length; start += DELETE_BATCH_SIZE) {
    const batch = staleIds.slice(start, start + DELETE_BATCH_SIZE);
    // households.owner_user_id does not cascade, so an Owner's household goes first.
    const { error } = await adminClient.from("households").delete().in("owner_user_id", batch);
    if (error) throw new Error(`Failed to delete E2E sign-ups' households: ${error.message}`);
    // One at a time: parallel deletes exhaust the auth container's ports.
    for (const id of batch) {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);
      if (deleteError) {
        throw new Error(`Failed to delete E2E sign-up ${id}: ${deleteError.message}`);
      }
    }
  }
  console.log(`[global-setup] deleted ${staleIds.length} stale E2E sign-ups`);
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

  const fixtureUsers = [
    ...Object.values(testUsers).map((user) => ({ ...user, inHousehold: true })),
    { ...householdlessUser, inHousehold: false },
  ];
  for (const { email, password, inHousehold } of fixtureUsers) {
    const { error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error && error.code !== EMAIL_EXISTS_CODE) {
      throw new Error(`Failed to create E2E fixture user ${email}: ${error.message}`);
    }
    console.log(`[global-setup] fixture user ${email}: ${error ? "already present" : "created"}`);
    if (inHousehold) await ensureHousehold(supabaseUrl, serviceRoleKey, email, password);
  }
}

// Signed-in specs expect a member; create_household reads auth.uid(), so call it
// as the fixture user rather than with the service role.
async function ensureHousehold(
  supabaseUrl: string,
  apiKey: string,
  email: string,
  password: string
) {
  const userClient = createClient(supabaseUrl, apiKey, { auth: { persistSession: false } });
  const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Failed to sign in E2E fixture user ${email}: ${signInError.message}`);
  }
  const { error } = await userClient.rpc("create_household", {
    household_name: FIXTURE_HOUSEHOLD_NAME,
  });
  if (error && error.message !== ALREADY_IN_HOUSEHOLD) {
    throw new Error(`Failed to create a household for ${email}: ${error.message}`);
  }
}
