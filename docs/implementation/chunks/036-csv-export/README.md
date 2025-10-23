# Chunk 036: CSV Export

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: Multi-Device Sync (Backups - optional but recommended)
- **Prerequisites**:
  - Chunk 006 (currency system) - formatPHP utility required
  - Chunk 019 (Dexie setup) - IndexedDB access required
  - Chunk 023 (offline writes queue) - Required for Decision #84 logout check
- **Can Skip**: Yes - but recommended for data portability and user trust

## What You're Building

CSV export functionality for manual backups:

- Export transactions with all fields
- Export accounts and categories
- Filter-based export (date range, account, category)
- Download trigger with proper filename
- PHP currency formatting in export
- Character encoding (UTF-8 with BOM for Excel compatibility)

## Why This Matters

CSV export is **critical for user trust**. It enables:

- **Manual backups**: Users control their data
- **Data portability**: Move to other apps if needed
- **Spreadsheet analysis**: Use Excel/Sheets for custom reports
- **Compliance**: Required for data export regulations
- **Trust**: Users feel secure knowing they can export anytime

Per Decision #84, this is the Phase A backup strategy (R2 backups in Phase B).

## Prerequisites Verification

Before starting, verify these are complete:

### From Chunk 006 (Currency System)

- [ ] `formatPHP(cents: number): string` function exists in `src/lib/currency.ts`
- [ ] Can import: `import { formatPHP } from '@/lib/currency'`

### From Chunk 019 (Dexie Setup)

- [ ] Dexie db instance exists in `src/lib/dexie/db.ts`
- [ ] Can import: `import { db } from '@/lib/dexie'`
- [ ] Tables exist: `db.transactions`, `db.accounts`, `db.categories`
- [ ] Transaction interface has required fields:
  - `created_by_user_id?: string` (maps to CSV 'created_by')
  - `created_at: string` (TIMESTAMPTZ)
  - `date: string` (DATE in YYYY-MM-DD format)

### From Chunk 023 (Offline Writes Queue)

- [ ] `db.syncQueue` table exists
- [ ] Sync queue has data (check with: `await db.syncQueue.count()`)

**How to verify**: Run `npm test` - if chunk 006 tests pass and Dexie imports work, you're ready.

---

## Picking Up from Chunk 002

This chunk **enhances the logout flow** from chunk 002 with data retention (Decision #84):

- Chunk 002 implemented basic logout (no data check)
- Now with sync queue (chunk 023) and export ready, we add Decision #84
- Before logout: Check for unsynced data
- Prompt user: "You have unsynced data. Export before logging out?"
- Offer immediate CSV export to prevent data loss

This prevents users from accidentally losing offline changes when logging out.

## Key Files Created/Modified

```
src/
├── lib/
│   ├── csv-exporter.ts         # CSV generation logic
│   └── csv-exporter.test.ts    # Unit tests
├── components/
│   └── ExportButton.tsx         # Export UI component
└── stores/
    └── authStore.ts            # MODIFIED: Enhanced logout with data check
```

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 262-287 (CSV export)
- **Original**: `docs/initial plan/FEATURES.md` lines 338-375 (CSV format specification)
- **Original**: `docs/initial plan/DECISIONS.md` #84 (logout data retention)
- **Original**: `docs/initial plan/DECISIONS.md` #83 (backup timing - manual export in Phase A)
- **Original**: `docs/initial plan/DECISIONS.md` #25 (export formats)

---

**Ready?** → Open `instructions.md` to begin
