/**
 * Database Cleanup for E2E Tests
 *
 * Uses Supabase admin client (service role) to clean up test data.
 * All test-created data uses the "[E2E]" prefix for reliable identification.
 *
 * Environment variables required in .env.test:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.test from project root
dotenv.config({ path: path.resolve(__dirname, "../../../.env.test") });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "⚠️ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.test — DB cleanup disabled"
  );
}

/**
 * Admin Supabase client that bypasses RLS.
 * Only used for cleanup — never in production code.
 */
const adminClient =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      })
    : null;

/**
 * Delete test transactions (description contains "[E2E]")
 */
export async function cleanupTestTransactions(userId?: string) {
  if (!adminClient) return;
  const query = adminClient.from("transactions").delete().ilike("description", "%[E2E]%");
  if (userId) query.eq("created_by_user_id", userId);
  const { error } = await query;
  if (error) console.error("Failed to cleanup test transactions:", error);
}

/**
 * Delete test budgets (notes contain "[E2E]")
 */
export async function cleanupTestBudgets(userId?: string) {
  if (!adminClient) return;
  const query = adminClient.from("budgets").delete().ilike("notes", "%[E2E]%");
  if (userId) query.eq("created_by_user_id", userId);
  const { error } = await query;
  if (error) console.error("Failed to cleanup test budgets:", error);
}

/**
 * Delete test transfers by finding paired transactions with "[E2E]" prefix
 */
export async function cleanupTestTransfers(userId?: string) {
  if (!adminClient) return;
  // Find transfer_group_ids from test transactions
  const query = adminClient
    .from("transactions")
    .select("transfer_group_id")
    .ilike("description", "%[E2E]%")
    .not("transfer_group_id", "is", null);
  if (userId) query.eq("created_by_user_id", userId);

  const { data } = await query;
  if (!data?.length) return;

  const groupIds = [...new Set(data.map((t) => t.transfer_group_id))];
  for (const groupId of groupIds) {
    await adminClient.from("transactions").delete().eq("transfer_group_id", groupId);
  }
}

/**
 * Delete test categories (name starts with "[E2E]" or "Test Category")
 */
export async function cleanupTestCategories() {
  if (!adminClient) return;
  const { error } = await adminClient
    .from("categories")
    .delete()
    .or("name.ilike.%[E2E]%,name.ilike.Test Category%");
  if (error) console.error("Failed to cleanup test categories:", error);
}

/**
 * Full cleanup of all test data
 */
export async function cleanupAll(userId?: string) {
  await cleanupTestTransfers(userId);
  await cleanupTestTransactions(userId);
  await cleanupTestBudgets(userId);
  await cleanupTestCategories();
}

/**
 * Look up user ID by email for cleanup scoping
 */
export async function getTestUserId(email: string): Promise<string | null> {
  if (!adminClient) return null;
  const { data } = await adminClient.from("profiles").select("id").eq("email", email).single();
  return data?.id ?? null;
}
