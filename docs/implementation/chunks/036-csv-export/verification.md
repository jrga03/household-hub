# Verification: CSV Export

Run these checks **BEFORE** starting implementation.

---

## Prerequisites Verification

Check that all dependencies are in place:

### From Chunk 006 (Currency System)

```bash
# Check currency utilities exist
cat src/lib/currency.ts | grep "export function formatPHP"
```

**Expected**: Function signature visible

### From Chunk 019 (Dexie Setup)

```bash
# Check Dexie database exists
cat src/lib/dexie/db.ts | grep "class.*extends Dexie"
```

**Expected**: Dexie class definition visible

Test IndexedDB tables:

```typescript
// In browser console
import { db } from "@/lib/dexie";
await db.transactions.count(); // Should return number
await db.accounts.count(); // Should return number
await db.categories.count(); // Should return number

// Verify Transaction interface has required fields
const sampleTx = await db.transactions.limit(1).first();
console.log({
  has_created_by_user_id: "created_by_user_id" in sampleTx,
  has_created_at: "created_at" in sampleTx,
  date_format: sampleTx.date, // Should be YYYY-MM-DD
});
```

### From Chunk 023 (Offline Writes Queue)

```bash
# Check sync queue exists
cat src/lib/dexie/db.ts | grep "syncQueue"
```

**Expected**: `syncQueue` table in schema

Test sync queue:

```typescript
// In browser console
import { db } from "@/lib/dexie";
await db.syncQueue.count(); // Should return number (0 or more)
```

---

## Test Data Setup

Before testing, ensure you have sample data:

```typescript
// Create test transaction (in browser console or test file)
await db.transactions.add({
  id: crypto.randomUUID(),
  date: new Date().toISOString().split("T")[0],
  type: "expense",
  description: "Test transaction",
  amount_cents: 150050, // ₱1,500.50
  account_id: "test-account",
  category_id: "test-category",
  status: "cleared",
  notes: "Test notes",
  created_at: new Date().toISOString(),
  created_by: "test-user",
});
```

---

## Post-Implementation Verification

After completing all steps, verify:

### 1. CSV Exporter Class

```bash
# Check file exists
ls -la src/lib/csv-exporter.ts
```

**Expected**: File exists with ~180 lines

### 2. CSV Format Contract

Open exported CSV and verify:

```
✓ First character is BOM (U+FEFF) - may be invisible
✓ Headers: date,type,description,amount,category,account,status,notes,created_at,created_by
✓ Amount format: 1500.50 (NOT ₱1,500.50)
✓ Special characters escaped (commas, quotes, newlines)
```

### 3. Settings Page Integration

```bash
# Check settings route/page exists
ls -la src/routes/settings.tsx
# OR
ls -la src/pages/settings.tsx
```

**Expected**: File contains `exportAndDownload` function

### 4. Unit Tests

```bash
npm test src/lib/csv-exporter.test.ts
```

**Expected**: All tests pass, including:

- `escapeCsv` tests (commas, quotes, newlines)
- `generateCsv` tests (BOM, headers, rows)
- CSV format contract tests
- Edge case tests

### 5. Decision #84 - Logout Data Retention

Check `src/stores/authStore.ts` has:

```typescript
✓ checkUnsyncedData() function
✓ clearIndexedDB() function
✓ Enhanced signOut with prompt
```

Manual test:

1. Create offline transaction
2. Logout
3. **Expected**: Prompt appears
4. Click OK
5. **Expected**: CSV downloads

---

## Common Issues

### Issue: formatPHP not found

**Solution**: Complete chunk 006 first, or install currency utilities

### Issue: db.transactions undefined

**Solution**: Complete chunk 019 (Dexie setup)

### Issue: db.syncQueue undefined

**Solution**: Complete chunk 023 (sync queue schema)

### Issue: CSV has ₱ symbol in amounts

**Solution**: You used `formatPHP()` instead of `(amount_cents / 100).toFixed(2)`

---

## Ready to Start?

- [ ] All prerequisites verified
- [ ] Test data available
- [ ] Unit tests can run
- [ ] Browser console can access db

If all checkboxes are ✓, proceed to `instructions.md`
