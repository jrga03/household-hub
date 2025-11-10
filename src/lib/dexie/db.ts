/**
 * Dexie Database Setup for Household Hub
 *
 * IndexedDB database using Dexie.js for offline-first functionality.
 * Implements three-layer state architecture: Zustand → IndexedDB → Supabase
 *
 * Schema Versioning:
 * - Version 1: Initial schema with 7 tables
 * - Version 2: Added syncIssues table for conflict tracking
 * - Future versions: Add new indexes/fields with .upgrade() functions
 * - NEVER remove fields (mark deprecated instead)
 * - ALWAYS provide default values in upgrade functions
 *
 * See ARCHITECTURE.md (Three-Layer State) and SYNC-ENGINE.md (Dexie Schema Versioning)
 *
 * @module dexie/db
 */

import Dexie, { Table } from "dexie";
import { hasSentry } from "@/types/sentry";
import type { Debt, InternalDebt, DebtPayment } from "@/types/debt";

// ============================================================================
// TypeScript Interfaces
// ============================================================================
// Interfaces match Supabase schema structure for consistency

/**
 * Local transaction record stored in IndexedDB.
 * Mirrors the transactions table in Supabase with additions for offline sync.
 */
export interface LocalTransaction {
  id: string;
  household_id: string;
  date: string; // ISO date string (DATE type in Supabase)
  description: string;
  amount_cents: number; // BIGINT cents (always positive)
  type: "income" | "expense";
  currency_code: string; // 'PHP' only for MVP
  account_id?: string;
  category_id?: string;
  transfer_group_id?: string; // Links paired transfer transactions
  status: "pending" | "cleared";
  visibility: "household" | "personal";
  owner_user_id?: string; // Owner for personal visibility (null for household)
  created_by_user_id: string;
  tagged_user_ids: string[]; // Array for @mentions
  notes?: string;
  import_key?: string; // SHA-256 hash for duplicate detection
  device_id: string;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * Local account record cached from Supabase.
 */
export interface LocalAccount {
  id: string;
  household_id: string;
  name: string;
  type: "bank" | "investment" | "credit_card" | "cash";
  initial_balance_cents: number;
  currency_code: string; // 'PHP' only for MVP (Phase 2: multi-currency)
  visibility: "household" | "personal";
  owner_user_id?: string;
  color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Local category record cached from Supabase.
 * Supports two-level hierarchy (parent → child).
 */
export interface LocalCategory {
  id: string;
  household_id: string;
  parent_id?: string; // null for parent categories
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Sync queue item for offline changes waiting to sync.
 */
export interface SyncQueueItem {
  id: string;
  household_id: string;
  entity_type: "transaction" | "account" | "category" | "budget";
  entity_id: string;
  operation: {
    op: "create" | "update" | "delete";
    payload: unknown;
  };
  device_id: string;
  status: "queued" | "syncing" | "completed" | "failed";
  retry_count: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Transaction event for event sourcing audit log.
 * Used for conflict resolution and sync.
 */
export interface TransactionEvent {
  id: string;
  household_id: string;
  entity_type: "transaction" | "account" | "category" | "budget";
  entity_id: string;
  op: "create" | "update" | "delete" | "snapshot"; // "snapshot" added for event compaction
  payload: unknown; // Changed fields only for updates
  idempotency_key: string; // Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
  event_version: number; // Schema version for forward compatibility
  actor_user_id: string;
  device_id: string;
  lamport_clock: number; // Per-entity counter
  vector_clock: Record<string, number>; // {deviceId: clockValue} scoped to entity
  timestamp: string; // ISO timestamp
}

/**
 * Key-value storage for metadata (device ID, last sync time, etc.).
 */
export interface MetaEntry {
  key: string;
  value: unknown; // Flexible value type (string, number, object, etc.)
}

/**
 * Debug log entry for observability.
 */
export interface LogEntry {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context?: unknown;
  device_id: string;
}

/**
 * Sync issue record for tracking conflicts and errors.
 * Used to surface issues to users for manual resolution when automatic resolution fails.
 */
export interface SyncIssueRecord {
  id: string;
  entityType: string; // "transaction" | "account" | "category" | "budget"
  entityId: string; // Which entity has the conflict
  issueType: string; // "conflict" | "validation_error" | "network_error" | "unknown"
  message: string; // Human-readable description
  localValue?: unknown; // Local version (optional)
  remoteValue?: unknown; // Remote version (optional)
  resolvedValue?: unknown; // Resolution if auto-resolved (optional)
  timestamp: string; // ISO timestamp string (NOT Date object for IndexedDB)
  canRetry: boolean; // Whether the issue can be retried automatically
}

/**
 * Conflict record for tracking concurrent edits detected via vector clocks.
 * Stored in IndexedDB for conflict resolution and audit trail.
 */
export interface Conflict {
  id: string;
  entity_type: string; // "transaction" | "account" | "category" | "budget"
  entity_id: string; // Which entity has the conflict
  detected_at: string; // ISO timestamp when conflict was detected
  local_event: unknown; // Full local TransactionEvent object
  remote_event: unknown; // Full remote TransactionEvent object
  resolution: string; // "pending" | "resolved" | "manual"
  resolved_value: unknown | null; // Final resolved value (null if pending)
  resolved_at: string | null; // ISO timestamp when resolved (null if pending)
}

// ============================================================================
// Dexie Database Class
// ============================================================================

/**
 * HouseholdHubDB - IndexedDB database for offline-first functionality.
 *
 * Schema Design:
 * - Primary keys are always "id" except meta table (uses "key")
 * - Indexes define queryable fields (IndexedDB has no query optimizer)
 * - Compound indexes for efficient common query patterns
 * - Multi-entry indexes (*prefix) for array fields like tagged_user_ids
 *
 * Version Strategy:
 * - Start at version 1 with all tables
 * - Increment version for schema changes (add fields, modify indexes)
 * - Never remove fields (mark deprecated with comments)
 * - Always provide .upgrade() function with default values
 *
 * Auto-open:
 * - Database opens automatically on module import
 * - Handles migration between versions transparently
 *
 * @example
 * import { db } from '@/lib/dexie/db';
 *
 * // Add transaction
 * await db.transactions.add(transaction);
 *
 * // Query with index
 * const recent = await db.transactions
 *   .where('date')
 *   .above('2024-01-01')
 *   .limit(100)
 *   .toArray();
 */
export class HouseholdHubDB extends Dexie {
  // Table declarations with TypeScript typing
  transactions!: Table<LocalTransaction, string>;
  accounts!: Table<LocalAccount, string>;
  categories!: Table<LocalCategory, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  events!: Table<TransactionEvent, string>;
  meta!: Table<MetaEntry, string>;
  logs!: Table<LogEntry, string>;
  syncIssues!: Table<SyncIssueRecord, string>;
  conflicts!: Table<Conflict, string>;

  // Debt tracking tables (added in version 4)
  debts!: Table<Debt, string>;
  internalDebts!: Table<InternalDebt, string>;
  debtPayments!: Table<DebtPayment, string>;

  constructor() {
    super("HouseholdHubDB");

    // ========================================================================
    // Version 1: Initial schema with all 7 tables
    // ========================================================================
    this.version(1).stores({
      // Transactions: Core transaction storage with compound indexes for common queries
      // Single indexes: id (primary), date, account_id, category_id, status, type, household_id, created_at, transfer_group_id
      // Compound indexes: [account_id+date], [category_id+date], [household_id+date] for efficient range queries
      // Multi-entry indexes: *tagged_user_ids (for @mention queries)
      transactions:
        "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, " +
        "[account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",

      // Accounts: Bank/financial account cache
      // Indexes: id (primary), name, visibility, household
      accounts: "id, name, visibility, household_id",

      // Categories: Category hierarchy cache
      // Indexes: id (primary), parent_id (for tree queries), name, household
      categories: "id, parent_id, name, household_id",

      // Sync Queue: Pending sync operations with compound indexes for queue filtering
      // Single indexes: id (primary), status, entity_type, entity_id, device_id, created_at
      // Compound indexes: [status+device_id] for queue filtering, [device_id+created_at] for history
      syncQueue:
        "id, status, entity_type, entity_id, device_id, created_at, " +
        "[status+device_id], [device_id+created_at]",

      // Events: Event sourcing log
      // Indexes: id (primary), entity_id, lamport_clock, timestamp, device_id
      events: "id, entity_id, lamport_clock, timestamp, device_id",

      // Meta: Key-value storage (device ID, last sync time, etc.)
      // Primary key: key (not id)
      meta: "key",

      // Logs: Debug and observability logs
      // Indexes: id (primary), timestamp, level, device_id
      logs: "id, timestamp, level, device_id",
    });

    // ========================================================================
    // Version 2: Add syncIssues table for conflict tracking
    // ========================================================================
    this.version(2)
      .stores({
        // IMPORTANT: Must repeat ALL version 1 table definitions (Dexie requirement)
        transactions:
          "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, " +
          "[account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
        accounts: "id, name, visibility, household_id",
        categories: "id, parent_id, name, household_id",
        syncQueue:
          "id, status, entity_type, entity_id, device_id, created_at, " +
          "[status+device_id], [device_id+created_at]",
        events: "id, entity_id, lamport_clock, timestamp, device_id",
        meta: "key",
        logs: "id, timestamp, level, device_id",

        // NEW: Sync Issues table for tracking conflicts and errors
        // Indexes: id (primary), entityId (find issues for entity), issueType (filter by type), timestamp (sort chronologically)
        syncIssues: "id, entityId, issueType, timestamp",
      })
      .upgrade((_tx) => {
        // Migration: Add syncIssues table (no data migration needed for new table)
        console.log("[Dexie Migration v1→v2] Adding syncIssues table for conflict tracking");
        return Promise.resolve();
      });

    // ========================================================================
    // Version 3: Add conflicts table for vector clock conflict detection
    // ========================================================================
    this.version(3)
      .stores({
        // IMPORTANT: Must repeat ALL previous version table definitions (Dexie requirement)
        transactions:
          "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, " +
          "[account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
        accounts: "id, name, visibility, household_id",
        categories: "id, parent_id, name, household_id",
        syncQueue:
          "id, status, entity_type, entity_id, device_id, created_at, " +
          "[status+device_id], [device_id+created_at]",
        events: "id, entity_id, lamport_clock, timestamp, device_id",
        meta: "key",
        logs: "id, timestamp, level, device_id",
        syncIssues: "id, entityId, issueType, timestamp",

        // NEW: Conflicts table for vector clock-based conflict detection
        // Single indexes: id (primary), entity_id, resolution, detected_at
        // Compound indexes: [entity_id+resolution] (optimize hasPendingConflicts queries), [resolution+detected_at] (sort pending by time)
        conflicts:
          "id, entity_id, resolution, detected_at, [entity_id+resolution], [resolution+detected_at]",
      })
      .upgrade((_tx) => {
        // Migration: Add conflicts table (no data migration needed for new table)
        console.log(
          "[Dexie Migration v2→v3] Adding conflicts table for vector clock conflict detection"
        );
        return Promise.resolve();
      });

    // ========================================================================
    // Version 4: Add debt tracking tables
    // ========================================================================
    // CRITICAL: Explicit version number to prevent infinite version loops
    const DEBT_MIGRATION_VERSION = 4;

    this.version(DEBT_MIGRATION_VERSION)
      .stores({
        // IMPORTANT: Must repeat ALL version 3 table definitions (Dexie requirement)
        transactions:
          "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, " +
          "[account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
        accounts: "id, name, visibility, household_id",
        categories: "id, parent_id, name, household_id",
        syncQueue:
          "id, status, entity_type, entity_id, device_id, created_at, " +
          "[status+device_id], [device_id+created_at]",
        events: "id, entity_id, lamport_clock, timestamp, device_id",
        meta: "key",
        logs: "id, timestamp, level, device_id",
        syncIssues: "id, entityId, issueType, timestamp",
        conflicts:
          "id, entity_id, resolution, detected_at, [entity_id+resolution], [resolution+detected_at]",

        // NEW: Debt Tracking Tables
        // External debts (loans from outside household)
        // Single indexes: id (primary), household_id, status, created_at
        // Compound index: [household_id+status+updated_at] for efficient filtered sorting
        // NOTE: No current_balance_cents - balance is ALWAYS calculated from payments
        debts: "id, household_id, status, created_at, [household_id+status+updated_at]",

        // Internal debts (borrowing between household entities)
        // Single indexes: id (primary), household_id, from_type, from_id, to_type, to_id, status, created_at
        // Compound index: [household_id+status+updated_at] for efficient filtered sorting
        // Entity type indexes enable filtering by category/account/member
        internalDebts:
          "id, household_id, from_type, from_id, to_type, to_id, status, created_at, " +
          "[household_id+status+updated_at]",

        // Debt payments (immutable audit trail)
        // Single indexes: id (primary), debt_id, internal_debt_id, transaction_id, payment_date, is_reversal
        // Compound indexes: [debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]
        // Enables efficient payment history queries with secondary sort by created_at
        debtPayments:
          "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, " +
          "[debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]",
      })
      .upgrade(async (tx) => {
        console.log(`[Dexie Migration v3→v${DEBT_MIGRATION_VERSION}] Adding debt tracking tables`);

        // Initialize lamport clock if not exists
        // Used for idempotency key generation: ${deviceId}-${entityType}-${entityId}-${lamportClock}
        const meta = tx.table("meta");
        const existingClock = await meta.get("lamport_clock");

        if (!existingClock) {
          await meta.put({ key: "lamport_clock", value: 0 });
          console.log(`[Dexie Migration v${DEBT_MIGRATION_VERSION}] Initialized lamport_clock = 0`);
        } else {
          console.log(
            `[Dexie Migration v${DEBT_MIGRATION_VERSION}] Lamport clock already exists:`,
            existingClock.value
          );
        }

        // Check for any debt-linked transactions (unlikely in fresh migration)
        // These would have debt_id or internal_debt_id fields set
        const transactions = tx.table("transactions");
        const debtLinkedCount = await transactions
          .filter((t: LocalTransaction) => {
            // TypeScript workaround: transactions table doesn't have debt fields yet in types
            const txWithDebt = t as LocalTransaction & {
              debt_id?: string;
              internal_debt_id?: string;
            };
            return Boolean(txWithDebt.debt_id || txWithDebt.internal_debt_id);
          })
          .count();

        if (debtLinkedCount > 0) {
          console.warn(
            `[Dexie Migration v${DEBT_MIGRATION_VERSION}] Found ${debtLinkedCount} existing debt-linked transactions`
          );
          console.warn(
            `[Dexie Migration v${DEBT_MIGRATION_VERSION}] Payment records should be created via sync`
          );
        }

        console.log(`[Dexie Migration v${DEBT_MIGRATION_VERSION}] Migration complete ✓`);
      });

    // ========================================================================
    // Version 5: Add reverses_payment_id index for reversal queries
    // ========================================================================
    this.version(5)
      .stores({
        // IMPORTANT: Must repeat ALL version 4 table definitions (Dexie requirement)
        transactions:
          "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, " +
          "[account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
        accounts: "id, name, visibility, household_id",
        categories: "id, parent_id, name, household_id",
        syncQueue:
          "id, status, entity_type, entity_id, device_id, created_at, " +
          "[status+device_id], [device_id+created_at]",
        events: "id, entity_id, lamport_clock, timestamp, device_id",
        meta: "key",
        logs: "id, timestamp, level, device_id",
        syncIssues: "id, entityId, issueType, timestamp",
        conflicts:
          "id, entity_id, resolution, detected_at, [entity_id+resolution], [resolution+detected_at]",
        debts: "id, household_id, status, created_at, [household_id+status+updated_at]",
        internalDebts:
          "id, household_id, from_type, from_id, to_type, to_id, status, created_at, " +
          "[household_id+status+updated_at]",

        // UPDATED: Added reverses_payment_id index for reversal queries
        debtPayments:
          "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, reverses_payment_id, " +
          "[debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]",
      })
      .upgrade((_tx) => {
        console.log(
          "[Dexie Migration v4→v5] Adding reverses_payment_id index for reversal queries"
        );
        // No data migration needed - just adding an index
        return Promise.resolve();
      });

    // ========================================================================
    // Future Versions: Examples
    // ========================================================================
    // Example of how to add a new version with migration:
    //
    // this.version(6)
    //   .stores({
    //     // Add new field or index
    //     transactions:
    //       "id, date, account_id, category_id, status, type, household_id, created_at, *tagged_user_ids, new_field",
    //   })
    //   .upgrade((tx) => {
    //     // Migration logic: Initialize missing field with default value
    //     return tx
    //       .table("transactions")
    //       .toCollection()
    //       .modify((transaction) => {
    //         if (!transaction.new_field) {
    //           transaction.new_field = "default_value";
    //         }
    //       });
    //   });

    // ========================================================================
    // Migration Testing Notes
    // ========================================================================
    // When adding new versions:
    // 1. Test migration from v1 → vN with realistic data (10k+ records)
    // 2. Verify default values are applied correctly
    // 3. Check indexes work as expected (use .where() queries)
    // 4. Measure migration performance (<5s for typical datasets)
    // 5. Keep all migration code forever (users may skip versions)
    //
    // See tests/dexie/migrations.test.ts for examples
  }
}

// ============================================================================
// Singleton Instance & Auto-open
// ============================================================================

/**
 * Singleton database instance.
 * Automatically opens when imported.
 *
 * @example
 * import { db } from '@/lib/dexie/db';
 * await db.transactions.add(newTransaction);
 */
export const db = new HouseholdHubDB();

// Auto-open database on module import
// Handles version migrations transparently
db.open().catch((err) => {
  console.error("Failed to open IndexedDB database:", err);
  // Log to observability system if available
  if (typeof window !== "undefined" && hasSentry(window)) {
    window.Sentry.captureException(err, {
      tags: { subsystem: "dexie-db" },
    });
  }
});

// ============================================================================
// Developer Notes
// ============================================================================

// Storage Quota Management:
// - Monitor with navigator.storage.estimate()
// - Warn at 80%, prune at 95%
// - See SYNC-ENGINE.md lines 2341-2520 for quota management strategy

// Idempotency:
// - Event idempotency_key format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
// - Prevents duplicate event processing in distributed sync
// - See SYNC-ENGINE.md lines 227-277 for implementation

// Device ID Strategy:
// - Priority: IndexedDB (meta table) → localStorage → crypto.randomUUID()
// - Already implemented in src/lib/device.ts using localStorage + crypto API
// - Future: Add FingerprintJS fallback for continuity across cache clears
// - See SYNC-ENGINE.md lines 1123-1303 for full hybrid strategy

// Query Performance:
// - Use .where() with indexed fields for fast queries
// - Compound indexes for common filter combinations
// - Avoid .filter() on large tables (scans all records)
// - Use .limit() to prevent loading thousands of records

// Testing:
// - Unit tests: Currency utilities, conflict resolution
// - Migration tests: v1 → v2, v2 → v3 with data preservation
// - Performance tests: 10k+ transaction rendering, sync queue processing
// - See tests/dexie/migrations.test.ts for examples
