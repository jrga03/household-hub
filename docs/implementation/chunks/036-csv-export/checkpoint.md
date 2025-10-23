# Checkpoint: CSV Export

---

## 1. Unit Tests Pass ✓

```bash
npm test src/lib/csv-exporter.test.ts
```

**Expected**: All CSV export tests pass

---

## 2. CSV Downloads Correctly ✓

- Click "Export Transactions" button
- File downloads with name `household-hub-transactions-YYYY-MM-DD.csv`
- Open in Excel/Sheets - data displays correctly

---

## 3. Amount Format Correct (CRITICAL) ✓

Check exported CSV - amounts MUST be decimal WITHOUT currency symbol:

```
date,type,description,amount,category,account,status,notes,created_at,created_by
2024-01-01,expense,Groceries,1500.50,groceries,checking,cleared,...
```

**Critical**: Amounts should be `1500.50` (NOT `₱1,500.50`)

This matches the CSV format contract in `docs/initial plan/FEATURES.md` lines 340-356.

---

## 4. Special Characters Handled ✓

Export transactions with:

- Commas in description → Wrapped in quotes
- Quotes in description → Escaped with double quotes
- Newlines in notes → Preserved

---

## 5. Filters Work ✓

Test filtered export:

- Date range filter
- Account filter
- Category filter

---

## 6. Logout Data Retention Works (Decision #84) ✓

Test the enhanced logout flow:

1. Create an offline transaction (while offline or before it syncs)
2. Check sync queue has pending items: `await db.syncQueue.count()`
3. Click logout button
4. **Expected**: Prompt appears: "You have unsynced offline data..."
5. Click "OK" to export
6. **Expected**: CSV downloads automatically
7. **Expected**: Logout completes after download

Test negative case:

1. Ensure all data is synced (empty sync queue)
2. Click logout
3. **Expected**: No prompt, logout immediate

---

## Success Criteria

- [ ] CSV downloads successfully
- [ ] Amount format is decimal (NO ₱ symbol)
- [ ] Column order matches FEATURES.md spec
- [ ] All 10 columns present (including created_at, created_by)
- [ ] Special characters escaped
- [ ] Filters apply correctly
- [ ] UTF-8 BOM included (Excel compatibility)
- [ ] Logout prompts when unsynced data exists
- [ ] CSV exports correctly from logout prompt
- [ ] Logout proceeds without prompt when queue is empty

---

**Congratulations!** You've completed chunk 036 with full CSV export + logout data retention!

**Next**: Move to chunk 037 (CSV Import) or Phase C (PWA & Polish)
