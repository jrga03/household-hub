# Troubleshooting: CSV Export

---

## Problem: Excel shows garbled characters

**Solution**: Ensure UTF-8 BOM is included:

```typescript
const BOM = "\uFEFF";
return BOM + csvHeaders + "\n" + csvRows;
```

---

## Problem: Commas break columns

**Solution**: Escape values containing commas:

```typescript
if (value.includes(",")) {
  return `"${value}"`;
}
```

---

## Problem: Download doesn't trigger

**Solution**: Check blob creation and URL:

```typescript
const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
const url = URL.createObjectURL(blob);

// Don't forget to revoke!
URL.revokeObjectURL(url);
```

---

## Problem: Large exports crash browser

**Solution**: Use streaming or chunked export for >10k rows:

```typescript
// Process in batches
for (let i = 0; i < transactions.length; i += 1000) {
  const batch = transactions.slice(i, i + 1000);
  // Process batch...
}
```

---

---

## Problem: Logout prompt doesn't appear

**Symptoms**: Logout happens immediately without checking for unsynced data

**Solution**: Check sync queue setup:

```typescript
// In browser console
import { db } from "@/lib/dexie";
await db.syncQueue.count(); // Should work

// Check authStore imports
import { db } from "@/lib/dexie"; // Must be imported
```

If `db.syncQueue` is undefined, complete chunk 023 first.

---

## Problem: clearIndexedDB fails

**Solution**: Add error handling:

```typescript
async function clearIndexedDB(): Promise<void> {
  try {
    await db.delete();
    await db.open(); // Recreate empty database
  } catch (error) {
    console.error("Failed to clear IndexedDB:", error);
    // Continue with logout even if clear fails
  }
}
```

---

## Problem: CSV has currency symbol (₱1,500.50)

**Symptoms**: Exported CSV shows `₱1,500.50` instead of `1500.50`

**Solution**: You're using `formatPHP()` - DON'T!

```typescript
// ❌ WRONG
formatPHP(t.amount_cents)(
  // → "₱1,500.50"

  // ✓ CORRECT
  t.amount_cents / 100
).toFixed(2); // → "1500.50"
```

This violates the CSV format contract in `docs/initial plan/FEATURES.md` lines 340-356.

---

## Problem: Missing columns in CSV

**Symptoms**: CSV only has 8 columns, expected 10

**Solution**: Add missing fields to row mapping:

```typescript
const rows = transactions.map((t) => [
  t.date,
  t.type,
  this.escapeCsv(t.description || ""),
  (t.amount_cents / 100).toFixed(2),
  t.category_id || "",
  t.account_id || "",
  t.status,
  this.escapeCsv(t.notes || ""),
  t.created_at, // Missing?
  t.created_by_user_id || "", // Missing? Note: Use created_by_USER_ID
]);
```

---

## Problem: created_by column is empty

**Symptoms**: CSV 'created_by' column has no values (empty strings)

**Cause**: Field name mismatch between CSV contract and database schema

**Solution**: The database schema uses `created_by_user_id`, but CSV contract specifies `created_by`:

```typescript
// ❌ WRONG - field doesn't exist
t.created_by || "";

// ✓ CORRECT - maps schema field to CSV column
t.created_by_user_id || "";
```

**Explanation**: The CSV column is NAMED 'created_by' (per FEATURES.md), but it gets its VALUE from the schema field `created_by_user_id`.

Test in browser console:

```javascript
import { db } from "@/lib/dexie";
const tx = await db.transactions.limit(1).first();
console.log("created_by" in tx); // false
console.log("created_by_user_id" in tx); // true
```

---

## Quick Fixes

```javascript
// Test CSV generation
const csv = await csvExporter.exportTransactions();
console.log(csv.substring(0, 500)); // Preview first 500 chars

// Check escape function
csvExporter["escapeCsv"]('Test, "quotes"');

// Test logout data check
import { db } from "@/lib/dexie";
const count = await db.syncQueue
  .where("status")
  .anyOf(["draft", "queued", "syncing", "failed"])
  .count();
console.log(`Unsynced items: ${count}`);
```
