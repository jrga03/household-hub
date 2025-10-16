# Chunk 037: CSV Import

## At a Glance

- **Time**: 2 hours
- **Milestone**: Multi-Device Sync (Backups - optional but recommended)
- **Prerequisites**: Chunk 036 (CSV export working)
- **Can Skip**: Yes - but recommended for data portability

## What You're Building

CSV import functionality with intelligent deduplication:

- CSV file parsing with PapaParse library
- Column mapping UI (auto-detect + manual override)
- Hash-based duplicate detection
- Per-duplicate action (Skip | Keep Both | Replace)
- Row-by-row validation with error reporting
- Progress indicator with batch processing
- Downloadable error report
- Large dataset handling (50k+ rows)

## Why This Matters

CSV import is **critical for data portability**. It enables:

- **Migration**: Move data from spreadsheets or other apps
- **Bulk operations**: Add hundreds of transactions at once
- **Data recovery**: Restore from CSV backups
- **Collaboration**: Share data with household members
- **Trust**: Users feel secure knowing they can import/export freely

Per Decision #81, this includes a comprehensive deduplication UX to prevent duplicate entries.

## Before You Start

Make sure you have:

- Chunk 036 completed (CSV export working)
- Transaction/account/category CRUD functional
- Currency utilities (formatPHP, parsePHP) working
- Basic understanding of hash-based fingerprinting

## What Happens Next

After this chunk:

- Users can import CSV files from any source
- Duplicate detection prevents double-entry
- Column mapping handles various CSV formats
- Validation ensures data integrity
- Ready for R2 backup setup (chunk 038)

## Key Files Created

```
src/
├── lib/
│   ├── csv-importer.ts           # CSV parsing and validation
│   ├── csv-importer.test.ts      # Unit tests
│   └── duplicate-detector.ts     # Hash-based deduplication
├── components/
│   ├── ImportButton.tsx          # Import trigger
│   ├── ColumnMapper.tsx          # Column mapping UI
│   └── DuplicateResolver.tsx     # Duplicate resolution UI
└── routes/
    └── import.tsx                # Import workflow page
```

## Features Included

### Column Mapping

- Auto-detection based on header names
- Confidence scores for matches
- Manual override dropdowns
- Preview of mapped data
- Required field validation

### Duplicate Detection

- Hash fingerprinting (description + amount + date)
- Configurable threshold (exact match or fuzzy)
- Visual duplicate comparison
- Bulk actions (Skip All | Keep All)
- Individual per-duplicate actions

### Validation

- Amount validation (PHP format)
- Date parsing (multiple formats)
- Required fields check
- Foreign key validation (accounts/categories)
- Row-by-row error reporting

### Progress & Feedback

- Upload progress bar
- Parsing progress indicator
- Import progress with row count
- Success/error summary
- Downloadable error report CSV

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 410-432 (CSV import)
- **Decisions**:
  - #81: Import deduplication UX
  - #84: Data retention on logout
- **Technical**: PapaParse library documentation

## Technical Stack

- **PapaParse**: CSV parsing library
- **React Hook Form**: Multi-step form state
- **TanStack Table**: Preview and error display
- **Zustand**: Import workflow state
- **Dexie**: Bulk insert with transactions

## Design Patterns

### Hash-Based Fingerprinting

```typescript
function generateFingerprint(transaction: Partial<Transaction>): string {
  const key = `${transaction.description}-${transaction.amount_cents}-${transaction.date}`;
  return hashCode(key);
}
```

### Column Mapping Strategy

```typescript
// Auto-detect with confidence scores
const mappings = detectColumns(headers);
// { amount: { index: 2, confidence: 0.95 }, ... }
```

### Bulk Import Pattern

```typescript
// Process in batches to avoid UI blocking
for (const batch of chunks(validRows, 100)) {
  await db.transaction("rw", db.transactions, async () => {
    await db.transactions.bulkAdd(batch);
  });
  updateProgress(batch.length);
}
```

## Import Flow

```
1. User selects CSV file
   ↓
2. Parse CSV with PapaParse
   ↓
3. Auto-detect column mappings
   ↓
4. User confirms/adjusts mappings
   ↓
5. Detect duplicates via hash
   ↓
6. User resolves duplicates
   ↓
7. Validate all rows
   ↓
8. Bulk insert to IndexedDB
   ↓
9. Trigger sync to Supabase
   ↓
10. Show success summary + error report
```

## Error Handling

### Parse Errors

- Invalid CSV format
- Encoding issues (UTF-8 with BOM)
- Empty file
- Missing headers

### Validation Errors

- Invalid amounts (non-numeric, negative)
- Invalid dates (unparseable formats)
- Missing required fields
- Non-existent accounts/categories

### Import Errors

- Quota exceeded
- Transaction failures
- Network errors during sync

## Performance Considerations

- **Streaming**: Process large files in chunks
- **Web Workers**: Parse CSV in background thread (optional)
- **Batch inserts**: Insert 100 rows at a time
- **Progress throttling**: Update UI every 100ms max
- **Memory management**: Clear processed chunks

## Accessibility

- File input with keyboard access
- Progress announced to screen readers
- Error messages linked to fields
- Table navigation with arrow keys
- Skip links for large result sets

---

**Ready?** → Open `instructions.md` to begin
