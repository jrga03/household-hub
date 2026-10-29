# Lib Utilities (`/src/lib/utils/`)

Small helpers shared by lib modules that don't belong to one domain. General-purpose helpers used across the whole app (such as `cn`) live in [`../utils.ts`](../utils.ts).

## Contents

- **`dates.ts`** - Local calendar dates and months: `parseLocalDate`, `localDate`, `todayLocalDate`, `localMonth`, `monthOfDate`, `shiftMonth`, `monthLabel`. Never parse "yyyy-MM-dd" with `new Date()`.
- **`download.ts`** - `downloadJson` and `downloadCsv` for exports.
- **`sort.ts`** - `byName`: sort by name, then id, so equal names keep the same order on every device.
- **`uuid.ts`** - `uuidV5`: deterministic IDs from a namespace and a name.

## Related Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
