# Chunk 037: CSV Import

## At a Glance

- **Time**: 3-4 hours
- **Milestone**: Multi-Device Sync (Backups - optional but recommended)
- **Prerequisites**: Chunks 006, 019, 036 (see detailed list below)
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

## Prerequisites

Before starting, verify these chunks are complete:

### Required Chunks

- [ ] **Chunk 006** (Currency System): `formatPHP`, `parsePHP`, `validateAmount` functions
  - Verify: `import { formatPHP, parsePHP, validateAmount } from '@/lib/currency'` works
  - Test: `formatPHP(150050)` returns `"₱1,500.50"`

- [ ] **Chunk 019** (Dexie Setup): IndexedDB schema with tables
  - Verify: `import { db } from '@/lib/dexie'` works
  - Tables exist: `db.transactions`, `db.accounts`, `db.categories`
  - Transaction interface has: `id`, `description`, `amount_cents`, `date`, `account_id`, `category_id`, `type`, `status`, `created_at`, `created_by_user_id`

- [ ] **Chunk 036** (CSV Export): Export functionality working
  - Verify: Can export transactions to CSV
  - CSV contains all fields: date, type, description, amount, category, account, status, notes, created_at, created_by

- [ ] **Chunk ???** (Transactions CRUD): Transaction create/read operations functional
  - Verify: Can create and query transactions via `db.transactions.add()` and `db.transactions.toArray()`

- [ ] **Chunk ???** (Accounts CRUD): Account management functional
  - Verify: `db.accounts.toArray()` returns list of accounts with `id` and `name` fields

- [ ] **Chunk ???** (Categories CRUD): Category management functional
  - Verify: `db.categories.toArray()` returns list of categories with `id` and `name` fields

### Framework Dependencies (should already exist)

- shadcn/ui components: Button, Select, RadioGroup, Progress, Label
- Zustand for state management
- TanStack Router for routing
- Sonner for toast notifications

**How to verify**: Run `npm test` - if chunk 006 tests pass and Dexie imports work, you're ready.

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

- Hash fingerprinting (description + amount + date + account) per Decision #81
- Configurable threshold (exact match or fuzzy)
- Visual duplicate comparison
- Bulk actions (Skip All | Keep All)
- Individual per-duplicate actions (Skip | Keep Both | Replace)

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
- **Original**: `docs/initial plan/FEATURES.md` lines 315-384 (Import/Export specification, Round-Trip Guarantee)
- **Decisions**:
  - #81: Import deduplication UX (hash-based fingerprinting with account field)
  - #84: Data retention on logout (provides context for CSV as Phase A backup strategy)
  - #57: CSV import strategy (reject entire import on error)
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
// Per Decision #81: Include account to prevent false duplicates
// Example: "Groceries ₱500 2025-01-15" in Cash vs Credit Card are DIFFERENT transactions
function generateFingerprint(transaction: Partial<Transaction>): string {
  const key = `${transaction.description}-${transaction.amount_cents}-${transaction.date}-${transaction.account_id}`;
  return hashCode(key);
}
```

**Important**: Accounts/categories can be matched by either ID or name:

- CSV can use IDs: `"acc_123"` or `"cat_456"`
- CSV can use names: `"Checking Account"` or `"Food & Dining"`
- Validation will find by either field

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
