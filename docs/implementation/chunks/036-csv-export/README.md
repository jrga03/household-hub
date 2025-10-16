# Chunk 036: CSV Export

## At a Glance

- **Time**: 1 hour
- **Milestone**: Multi-Device Sync (Backups - optional but recommended)
- **Prerequisites**: Working transaction/account/category data
- **Can Skip**: Yes - but recommended for data portability

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

## Picking Up from Chunk 002

This chunk **enhances the logout flow** from chunk 002 with data retention:

- Chunk 002 implemented basic logout (no data check)
- Now with sync queue (chunk 023) and export ready, we add Decision #84
- Before logout: Check for unsynced data
- Prompt user: "You have unsynced data. Export before logging out?"
- Offer immediate CSV export to prevent data loss

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
- **Original**: `docs/initial plan/DECISIONS.md` #84 (logout data retention)

---

**Ready?** → Open `instructions.md` to begin
