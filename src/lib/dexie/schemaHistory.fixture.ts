/**
 * Every shipped Dexie version's stores() argument, in order. Never edit an
 * entry: add a new version in db.ts and append it here.
 */
export const SCHEMA_HISTORY: { version: number; stores: Record<string, string | null> }[] = [
  {
    version: 1,
    stores: {
      transactions:
        "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, [account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
      accounts: "id, name, visibility, household_id",
      categories: "id, parent_id, name, household_id",
      syncQueue:
        "id, status, entity_type, entity_id, device_id, created_at, [status+device_id], [device_id+created_at]",
      events: "id, entity_id, lamport_clock, timestamp, device_id",
      meta: "key",
      logs: "id, timestamp, level, device_id",
    },
  },
  {
    version: 2,
    stores: {
      transactions:
        "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, [account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
      accounts: "id, name, visibility, household_id",
      categories: "id, parent_id, name, household_id",
      syncQueue:
        "id, status, entity_type, entity_id, device_id, created_at, [status+device_id], [device_id+created_at]",
      events: "id, entity_id, lamport_clock, timestamp, device_id",
      meta: "key",
      logs: "id, timestamp, level, device_id",
      syncIssues: "id, entityId, issueType, timestamp",
    },
  },
  {
    version: 3,
    stores: {
      transactions:
        "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, [account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
      accounts: "id, name, visibility, household_id",
      categories: "id, parent_id, name, household_id",
      syncQueue:
        "id, status, entity_type, entity_id, device_id, created_at, [status+device_id], [device_id+created_at]",
      events: "id, entity_id, lamport_clock, timestamp, device_id",
      meta: "key",
      logs: "id, timestamp, level, device_id",
      syncIssues: "id, entityId, issueType, timestamp",
      conflicts:
        "id, entity_id, resolution, detected_at, [entity_id+resolution], [resolution+detected_at]",
    },
  },
  {
    version: 4,
    stores: {
      transactions:
        "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, [account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
      accounts: "id, name, visibility, household_id",
      categories: "id, parent_id, name, household_id",
      syncQueue:
        "id, status, entity_type, entity_id, device_id, created_at, [status+device_id], [device_id+created_at]",
      events: "id, entity_id, lamport_clock, timestamp, device_id",
      meta: "key",
      logs: "id, timestamp, level, device_id",
      syncIssues: "id, entityId, issueType, timestamp",
      conflicts:
        "id, entity_id, resolution, detected_at, [entity_id+resolution], [resolution+detected_at]",
      debts: "id, household_id, status, created_at, [household_id+status+updated_at]",
      internalDebts:
        "id, household_id, from_type, from_id, to_type, to_id, status, created_at, [household_id+status+updated_at]",
      debtPayments:
        "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, [debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]",
    },
  },
  {
    version: 5,
    stores: {
      transactions:
        "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, [account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
      accounts: "id, name, visibility, household_id",
      categories: "id, parent_id, name, household_id",
      syncQueue:
        "id, status, entity_type, entity_id, device_id, created_at, [status+device_id], [device_id+created_at]",
      events: "id, entity_id, lamport_clock, timestamp, device_id",
      meta: "key",
      logs: "id, timestamp, level, device_id",
      syncIssues: "id, entityId, issueType, timestamp",
      conflicts:
        "id, entity_id, resolution, detected_at, [entity_id+resolution], [resolution+detected_at]",
      debts: "id, household_id, status, created_at, [household_id+status+updated_at]",
      internalDebts:
        "id, household_id, from_type, from_id, to_type, to_id, status, created_at, [household_id+status+updated_at]",
      debtPayments:
        "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, reverses_payment_id, [debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]",
    },
  },
  {
    version: 6,
    stores: {
      transactions:
        "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, debt_id, internal_debt_id, [account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
      accounts: "id, name, visibility, household_id",
      categories: "id, parent_id, name, household_id",
      syncQueue:
        "id, status, entity_type, entity_id, device_id, created_at, [status+device_id], [device_id+created_at]",
      events: "id, entity_id, lamport_clock, timestamp, device_id",
      meta: "key",
      logs: "id, timestamp, level, device_id",
      syncIssues: "id, entityId, issueType, timestamp",
      conflicts:
        "id, entity_id, resolution, detected_at, [entity_id+resolution], [resolution+detected_at]",
      debts: "id, household_id, status, created_at, [household_id+status+updated_at]",
      internalDebts:
        "id, household_id, from_type, from_id, to_type, to_id, status, created_at, [household_id+status+updated_at]",
      debtPayments:
        "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, reverses_payment_id, [debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]",
    },
  },
  {
    version: 7,
    stores: {
      transactions:
        "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, debt_id, internal_debt_id, [account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
      accounts: "id, name, visibility, household_id",
      categories: "id, parent_id, name, household_id",
      syncQueue:
        "id, status, entity_type, entity_id, device_id, created_at, [status+device_id], [device_id+created_at]",
      events: "id, entity_id, lamport_clock, timestamp, device_id, idempotency_key",
      meta: "key",
      logs: "id, timestamp, level, device_id",
      syncIssues: "id, entityId, issueType, timestamp",
      conflicts:
        "id, entity_id, resolution, detected_at, [entity_id+resolution], [resolution+detected_at]",
      debts: "id, household_id, status, created_at, [household_id+status+updated_at]",
      internalDebts:
        "id, household_id, from_type, from_id, to_type, to_id, status, created_at, [household_id+status+updated_at]",
      debtPayments:
        "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, reverses_payment_id, [debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]",
    },
  },
  {
    version: 8,
    stores: {
      transactions:
        "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, debt_id, internal_debt_id, [account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
      accounts: "id, name, visibility, household_id",
      categories: "id, parent_id, name, household_id",
      syncQueue:
        "id, status, entity_type, entity_id, device_id, created_at, [status+device_id], [device_id+created_at]",
      events: "id, entity_id, lamport_clock, timestamp, device_id, idempotency_key",
      meta: "key",
      logs: "id, timestamp, level, device_id",
      syncIssues: "id, entityId, issueType, timestamp",
      conflicts:
        "id, entity_id, resolution, detected_at, [entity_id+resolution], [resolution+detected_at]",
      debts: "id, household_id, status, created_at, [household_id+status+updated_at]",
      internalDebts:
        "id, household_id, from_type, from_id, to_type, to_id, status, created_at, [household_id+status+updated_at]",
      debtPayments:
        "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, reverses_payment_id, [debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]",
      importDrafts:
        "id, importSessionId, draft_status, account_id, import_key, created_at, [importSessionId+draft_status]",
      importSessions: "id, source_bank, created_at",
    },
  },
  {
    version: 9,
    stores: {
      conflicts: null,
    },
  },
  {
    version: 10,
    stores: {
      budgets: "id, month, category_id, [month+category_id]",
    },
  },
];
