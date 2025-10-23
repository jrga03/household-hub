# Checkpoint: CSV Import

Run these verifications to ensure everything works correctly.

---

## 1. Dependencies Installed ✓

```bash
npm list papaparse
```

**Expected**: `papaparse@5.x.x` listed without errors

---

## 2. Unit Tests Pass ✓

```bash
npm test src/lib/csv-importer.test.ts
```

**Expected**:

```
✓ detectColumnMappings (3 tests)
✓ generateFingerprint (3 tests)
✓ validateTransaction (4 tests)

Test Files  1 passed (1)
     Tests  10 passed (10)
```

---

## 3. Type Checking Passes ✓

```bash
npm run type-check
```

**Expected**: No TypeScript errors in:

- `src/lib/csv-importer.ts`
- `src/lib/duplicate-detector.ts`
- `src/stores/importStore.ts`
- `src/components/ColumnMapper.tsx`
- `src/components/DuplicateResolver.tsx`
- `src/routes/import.tsx`

---

## 4. Import Route Accessible ✓

Navigate to http://localhost:3000/import

**Visual checks**:

- [ ] Page loads without errors
- [ ] File upload drop zone visible
- [ ] "Click to select CSV file" text present
- [ ] Drag-and-drop area styled correctly

---

## 5. CSV Parsing Works ✓

**Test CSV** (`test-import.csv`):

```csv
Description,Amount,Date,Account,Category
Groceries,150.50,2025-01-15,Checking,Food
Gas,75.00,2025-01-14,Credit Card,Transport
Salary,5000.00,2025-01-15,Checking,Income
```

**Steps**:

1. Visit `/import`
2. Upload `test-import.csv`
3. Wait for parsing to complete

**Expected**:

- [ ] File uploads without errors
- [ ] Progress to "Map Columns" step automatically
- [ ] Headers detected: Description, Amount, Date, Account, Category
- [ ] 3 data rows parsed

---

## 6. Column Mapping Auto-Detection ✓

**Test with standard headers**:

Using the test CSV above:

**Expected Mappings**:

- [ ] Description → Column 1 (auto-detected)
- [ ] Amount → Column 2 (auto-detected)
- [ ] Date → Column 3 (auto-detected)
- [ ] Account → Column 4 (auto-detected)
- [ ] Category → Column 5 (auto-detected)

**Visual checks**:

- [ ] All required fields (\*) have mappings
- [ ] Select dropdowns show correct column names
- [ ] Preview table shows first 3 rows correctly
- [ ] "Continue" button enabled

---

## 7. Column Mapping Manual Override ✓

**Steps**:

1. Change "Description" mapping to "Not mapped"
2. Observe "Continue" button state
3. Re-map to correct column

**Expected**:

- [ ] "Continue" button disables when required field unmapped
- [ ] "Continue" button re-enables when remapped
- [ ] Preview table updates when mappings change
- [ ] No console errors during changes

---

## 8. Duplicate Detection Works ✓

**Setup**:

1. Create a transaction manually:
   - Description: "Groceries"
   - Amount: ₱150.50
   - Date: 2025-01-15

2. Import CSV with matching row:
   ```csv
   Description,Amount,Date
   Groceries,150.50,2025-01-15
   ```

**Expected**:

- [ ] Import progresses to "Resolve Duplicates" step
- [ ] Shows "1 found" in header
- [ ] Displays side-by-side comparison
- [ ] Shows all 3 action options (Skip | Keep Both | Replace)
- [ ] Default action is "Skip"

---

## 9. Duplicate Resolution UI ✓

**Test all actions**:

1. Select "Skip" → Verify transaction won't be imported
2. Select "Keep Both" → Verify will create duplicate
3. Select "Replace" → Verify will update existing

**Bulk actions**:

1. Click "Skip All" → All actions set to "Skip"
2. Click "Keep All" → All actions set to "Keep Both"

**Expected**:

- [ ] Radio buttons work correctly
- [ ] Bulk actions update all rows
- [ ] "Continue" button shows count
- [ ] No console errors

---

## 10. Validation Detects Errors ✓

**Test CSV with errors** (`test-errors.csv`):

```csv
Description,Amount,Date
,150.50,2025-01-15
Valid Transaction,-100.00,2025-01-16
Another Valid,500.00,invalid-date
Good Transaction,1000.00,2025-01-17
```

**Expected validation errors**:

- [ ] Row 1: Description is required
- [ ] Row 2: Invalid amount (negative)
- [ ] Row 3: Invalid date format
- [ ] Row 4: No errors (valid)

**Visual checks**:

- [ ] Warning toast shows error count
- [ ] Only valid row (row 4) imported
- [ ] Import completes successfully
- [ ] Error details accessible

---

## 11. Import Progress Indicator ✓

**Test with larger CSV** (create 500 rows):

**Steps**:

1. Import CSV with 500 valid rows
2. Observe progress during import

**Expected**:

- [ ] Progress bar appears
- [ ] Percentage updates smoothly
- [ ] UI remains responsive
- [ ] No freezing or blocking
- [ ] Completes without errors

---

## 12. Import Results Summary ✓

After successful import:

**Expected display**:

- [ ] "Import Complete" heading
- [ ] Green card showing imported count
- [ ] Yellow card showing skipped count (from duplicates)
- [ ] Red card showing failed count
- [ ] "Import Another File" button visible
- [ ] Success toast notification

---

## 13. Large File Handling ✓

**Test with 10,000 rows**:

Generate a large CSV:

```javascript
// In browser console
const rows = [["Description", "Amount", "Date"]];
for (let i = 0; i < 10000; i++) {
  rows.push([`Transaction ${i}`, `${i * 10 + 100}.50`, "2025-01-15"]);
}
const csv = rows.map((r) => r.join(",")).join("\n");
const blob = new Blob([csv], { type: "text/csv" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "large-test.csv";
a.click();
```

**Import the file**:

**Expected**:

- [ ] File parses without errors
- [ ] Progress updates throughout import
- [ ] Completes in <30 seconds
- [ ] No browser tab freezing
- [ ] All 10,000 rows imported successfully

---

## 14. Error Recovery ✓

**Test invalid CSV**:

1. Create file with invalid format (e.g., malformed quotes)
2. Attempt import

**Expected**:

- [ ] Error toast displays
- [ ] Helpful error message
- [ ] Can try again with different file
- [ ] No crash or undefined state

---

## 15. State Reset Works ✓

**Steps**:

1. Start import
2. Progress to mapping step
3. Click "Cancel"

**Expected**:

- [ ] Returns to upload step
- [ ] All state cleared
- [ ] Can start new import
- [ ] No leftover data from previous attempt

---

## 16. Fingerprint Consistency ✓

**Test in browser console**:

```javascript
import { generateFingerprint } from "@/lib/duplicate-detector";

const txn = {
  description: "Test",
  amount_cents: 10000,
  date: "2025-01-15",
};

const fp1 = generateFingerprint(txn);
const fp2 = generateFingerprint(txn);

console.log(fp1 === fp2); // true
```

**Expected**: `true` (fingerprints are deterministic)

---

## 17. Memory Management ✓

**Test with large file**:

1. Import 50,000 row CSV
2. Monitor memory in DevTools

**Expected**:

- [ ] Memory usage stays reasonable (<500MB)
- [ ] No memory leaks after import
- [ ] Garbage collection works properly
- [ ] Browser responsive throughout

---

## 18. Accessibility Check ✓

**Keyboard Navigation**:

- [ ] Can tab to file input
- [ ] Can tab through form fields
- [ ] Can navigate column mapper with keyboard
- [ ] Radio buttons accessible via keyboard
- [ ] All buttons have focus states

**Screen Reader** (optional):

- [ ] File input announced correctly
- [ ] Progress updates announced
- [ ] Validation errors announced
- [ ] Success message announced

---

## 19. Round-Trip Guarantee ✓

**Test export → import data preservation** (FEATURES.md lines 378-384):

**Steps**:

1. Create 3 transactions manually with different `created_by` values
2. Export to CSV
3. Delete all transactions
4. Import the CSV

**Expected**:

- [ ] All fields preserved: description, amount, date, account, category, type, status, notes
- [ ] Metadata preserved: `created_at` and `created_by` fields match original
- [ ] No data loss or transformation
- [ ] Transaction count matches (3 imported)

---

## 20. Import Key Storage ✓

**Test fingerprint persistence** (Decision #81):

**Steps**:

1. Import a CSV with 5 transactions
2. Query database: `await db.transactions.toArray()`
3. Inspect each transaction object

**Expected**:

- [ ] Each transaction has `import_key` field populated
- [ ] `import_key` format: fingerprint hash string (e.g., "1a2b3c")
- [ ] Keys are deterministic (same data = same key)
- [ ] Re-importing same CSV detects all 5 as duplicates

---

## 21. Replace Action Works ✓

**Test "Replace" duplicate resolution**:

**Steps**:

1. Create transaction: "Groceries" ₱500.00 2025-01-15 Account: Cash
2. Import CSV with duplicate but different amount:
   ```csv
   Description,Amount,Date,Account
   Groceries,750.00,2025-01-15,Cash
   ```
3. Choose "Replace" action
4. Complete import

**Expected**:

- [ ] Existing transaction amount updated to ₱750.00
- [ ] No duplicate created
- [ ] Transaction ID remains the same
- [ ] Only 1 transaction in database after import

---

## 22. Row-by-Row Feedback ✓

**Test progress display** (IMPLEMENTATION-PLAN.md line 429):

**Steps**:

1. Import CSV with 100 rows
2. Watch import progress screen

**Expected**:

- [ ] Shows "Processing row X of 100"
- [ ] Updates in real-time as rows process
- [ ] Percentage and row count both visible
- [ ] UI remains responsive during import

---

## Success Criteria

- [ ] All unit tests pass
- [ ] Type checking passes
- [ ] CSV parsing works for various formats
- [ ] Column mapping auto-detects correctly (includes created_at/created_by)
- [ ] Manual mapping override functional
- [ ] Duplicate detection accurate (includes account in fingerprint)
- [ ] Duplicate resolution UI works (all 3 actions: Skip | Keep Both | Replace)
- [ ] Validation catches errors
- [ ] Progress indicator smooth with row-by-row feedback
- [ ] Import completes successfully
- [ ] Large files handled efficiently
- [ ] Error recovery graceful
- [ ] State management correct
- [ ] Accessibility requirements met
- [ ] Round-trip guarantee preserved (export → import = identical data)
- [ ] Import keys stored for duplicate prevention across imports
- [ ] Replace action updates existing transactions correctly

---

## Common Issues

### Issue: PapaParse not parsing correctly

**Solution**: Check CSV encoding (should be UTF-8) and line endings

### Issue: Column detection fails

**Solution**: Verify header row exists and has recognizable names

### Issue: Duplicate detection missing matches

**Solution**: Check that fingerprint logic matches existing data format

### Issue: Import slow for large files

**Solution**: Verify batch processing is working (100 rows per batch)

---

## Next Steps

Once all checkpoints pass:

1. Test with real-world CSV files from various sources
2. Document common CSV formats you support
3. Move to **Chunk 038: R2 Setup**

---

**Estimated Time**: 20-25 minutes to verify all checkpoints
