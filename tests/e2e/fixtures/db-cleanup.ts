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
 * Delete only the transactions a test created, by exact description. Specs run
 * fully parallel, so a pattern-wide delete would remove a sibling's rows.
 */
export async function deleteTestTransactions(descriptions: string[]) {
  if (!adminClient || descriptions.length === 0) return;
  const { error } = await adminClient.from("transactions").delete().in("description", descriptions);
  if (error) console.error("Failed to delete test transactions:", error);
}

export interface TestCategory {
  parentId: string;
  childId: string;
  name: string;
}

/**
 * Create a uniquely named [E2E] parent/child category pair (the picker only
 * offers child categories). Unique per call so parallel specs never share or
 * delete each other's category, and budgets on it never collide with user
 * data (budgets are UNIQUE(household_id, category_id, month)).
 */
export async function createTestCategory(label: string): Promise<TestCategory | null> {
  if (!adminClient) return null;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { data: parent, error: parentError } = await adminClient
    .from("categories")
    .insert({ name: `[E2E] ${label} Parent ${suffix}` })
    .select("id")
    .single();
  if (parentError || !parent) {
    console.error("Failed to create test parent category:", parentError);
    return null;
  }
  const name = `[E2E] ${label} ${suffix}`;
  const { data: child, error } = await adminClient
    .from("categories")
    .insert({ name, parent_id: parent.id })
    .select("id")
    .single();
  if (error || !child) {
    console.error("Failed to create test category:", error);
    return null;
  }
  return { parentId: parent.id, childId: child.id, name };
}

/** Delete one test category pair; the child and its budgets cascade. */
export async function deleteTestCategory(category: TestCategory | null) {
  if (!adminClient || !category) return;
  const { error } = await adminClient.from("categories").delete().eq("id", category.parentId);
  if (error) console.error("Failed to delete test category:", error);
}

export interface TestAccount {
  id: string;
  name: string;
}

/** Uniquely named [E2E] account so specs never depend on pre-existing data. */
export async function createTestAccount(label: string): Promise<TestAccount | null> {
  if (!adminClient) return null;
  const name = `[E2E] ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { data, error } = await adminClient
    .from("accounts")
    .insert({ name, type: "bank" })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Failed to create test account:", error);
    return null;
  }
  return { id: data.id, name };
}

/** Transactions reference accounts ON DELETE SET NULL, so delete them first. */
export async function deleteTestAccount(account: TestAccount | null) {
  if (!adminClient || !account) return;
  const { error } = await adminClient.from("accounts").delete().eq("id", account.id);
  if (error) console.error("Failed to delete test account:", error);
}

export async function getTestBudget(categoryId: string) {
  if (!adminClient) return null;
  const { data, error } = await adminClient
    .from("budgets")
    .select("amount_cents")
    .eq("category_id", categoryId)
    .maybeSingle();
  if (error) console.error("Failed to read test budget:", error);
  return data;
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
