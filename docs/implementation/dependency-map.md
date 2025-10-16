# Chunk Dependency Map

> **Purpose**: Visual guide showing which chunks depend on each other, what can be done in parallel, and what's safe to skip.

## Table of Contents

- [Critical Path (Must Follow Order)](#critical-path-must-follow-order)
- [Dependency Diagram](#dependency-diagram)
- [Parallel Tracks After Chunk 008](#parallel-tracks-after-chunk-008)
- [Optional vs Required Chunks](#optional-vs-required-chunks)
- [Skip Safety Matrix](#skip-safety-matrix)
- [Prerequisite Quick Reference](#prerequisite-quick-reference)

---

## Critical Path (Must Follow Order)

These chunks MUST be completed in order - each depends on the previous:

```
001 (Project Setup)
  ↓
002 (Auth Flow)
  ↓
003 (Routing Foundation)
  ↓
004 (Accounts Schema)
  ↓
005 (Accounts UI)
  ↓
006 (Currency System) ──┐
  ↓                     │ (Can do in parallel)
007 (Categories Setup) ─┘
  ↓
008 (Transactions Schema)
  ↓
009 (Transactions Form)
  ↓
010 (Transactions List)
```

**⚠️ Warning**: Skipping or reordering these will break the application.

---

## Dependency Diagram

### Milestone 1: Foundation (Sequential)

```
001-project-setup
   ↓
002-auth-flow
   ↓
003-routing-foundation
```

### Milestone 2: MVP (Mixed)

```
004-accounts-schema
   ↓
005-accounts-ui
   ↓
006-currency-system ──┐
   ↓                  │ (Can parallel)
007-categories-setup ─┘
   ↓
008-transactions-schema
   ↓
009-transactions-form
   ↓
010-transactions-list
   ↓
┌──┴──┬──────────┬──────────┐
│     │          │          │
011   012        013        014
Bal   Cat        Dash       Budget
│     │          │          │
└──┬──┴──────────┴──────────┘
   ↓
   ├── 015-budgets-schema ──→ 016-budgets-ui
   └── 017-transfers-schema → 018-transfers-ui

(011-014 can be done in ANY order after chunk 010)
(015-018 are OPTIONAL, can skip entirely)
```

### Milestone 3: Offline (Sequential with Parallel Segment)

```
019-dexie-setup
   ↓
020-offline-reads ──┐
   ↓                │ (Can parallel)
021-offline-writes ─┘
   ↓
022-sync-queue-schema
   ↓
023-offline-writes-queue
   ↓
024-sync-processor ──┐
   ↓                 │ (Can parallel)
025-sync-ui-indicators ─┘
```

### Milestone 4: Sync Engine (Complex Dependencies)

```
026-device-hybrid-id
   ↓
027-devices-table
   ↓
028-events-schema
   ↓
029-idempotency-keys
   ↓
030-event-generation
   ↓
031-vector-clocks
   ↓
032-conflict-detection
   ↓
033-conflict-resolution
   ↓
034-sync-realtime
   ↓
035-event-compaction

PARALLEL BRANCH (Optional Backups):
036-csv-export ───┐ (No dependency on sync)
   ↓              │
037-csv-import    │
                  │
038-r2-setup ─────┤ (Needs 026 for device ID)
   ↓              │
039-backup-encryption
   ↓              │
040-backup-worker ┘
```

### Milestone 5: Production (Parallel + Sequential)

```
┌─────────────────┬─────────────────┐
│                 │                 │
041-pwa-manifest  044-analytics-dashboard
│                 (OPTIONAL)
042-service-worker
│
043-push-notifications
│
└─────────────────┴─────────────────┘
   ↓
045-e2e-tests
   ↓
046-deployment
```

---

## Parallel Tracks After Chunk 008

Once you complete **chunk 010 (Transactions List)**, you can work on these in ANY order:

### Track A: Analytics & Balances

- **011-account-balances** (1hr) - Calculate running totals
- **012-category-totals** (1hr) - Monthly spending by category

### Track B: Dashboard

- **013-basic-dashboard** (1.5hr) - Summary cards + charts
- **014-budgets-basic** (1hr) - Basic budget display

### Track C: Optional Features (Can Skip)

- **015-budgets-schema** (30min) → **016-budgets-ui** (1.5hr)
- **017-transfers-schema** (45min) → **018-transfers-ui** (1hr)

**Strategy Tip**: Complete tracks A + B first for a functional MVP, then optionally add track C features.

---

## Optional vs Required Chunks

### ✅ Always Required (Foundation)

| Chunk Range | Purpose                                        | Can Skip? |
| ----------- | ---------------------------------------------- | --------- |
| 001-003     | Foundation setup                               | ❌ NEVER  |
| 004-010     | Core CRUD (accounts, categories, transactions) | ❌ NEVER  |

### 🔀 Required for MVP (but flexible order)

| Chunk | Purpose          | Can Skip?          | Impact if Skipped    |
| ----- | ---------------- | ------------------ | -------------------- |
| 011   | Account balances | ⚠️ Not recommended | No balance display   |
| 012   | Category totals  | ⚠️ Not recommended | No spending analysis |
| 013   | Dashboard        | ⚠️ Not recommended | No summary view      |
| 014   | Basic budgets    | ✅ YES             | No budget features   |

### 🎁 Completely Optional

| Chunk Range | Purpose             | Can Skip?                       | Impact if Skipped             |
| ----------- | ------------------- | ------------------------------- | ----------------------------- |
| 015-016     | Advanced budgets    | ✅ YES                          | No budget tracking            |
| 017-018     | Transfers           | ✅ YES                          | Can't track account transfers |
| 019-025     | Offline support     | ✅ YES                          | App requires internet         |
| 026-035     | Multi-device sync   | ✅ YES                          | Single device only            |
| 036-037     | CSV import/export   | ✅ YES                          | No data portability           |
| 038-040     | R2 backups          | ✅ YES                          | No cloud backups              |
| 041-043     | PWA features        | ✅ YES                          | Not installable               |
| 044         | Analytics dashboard | ✅ YES                          | No advanced analytics         |
| 045         | E2E tests           | ⚠️ Not recommended              | No automated testing          |
| 046         | Deployment          | ❌ NEVER (if you want live app) | Can't deploy                  |

---

## Skip Safety Matrix

### "I want to skip offline support" (Milestone 3)

**Can skip**: Chunks 019-025 entirely

**Dependencies broken**: None for MVP

**Can still complete**:

- ✅ Milestone 2 (MVP)
- ✅ Milestone 5 (PWA + Deploy)
- ❌ Milestone 4 (Sync needs offline foundation)

**Recommendation**: Complete MVP (Milestone 2) first, deploy it, then decide if you need offline later.

---

### "I want to skip multi-device sync" (Milestone 4)

**Can skip**: Chunks 026-040 entirely

**Dependencies broken**: None

**Can still complete**:

- ✅ Milestone 2 (MVP)
- ✅ Milestone 3 (Offline)
- ✅ Milestone 5 (PWA + Deploy)

**Recommendation**: Offline + PWA + Deploy is a great combination for single-device users.

---

### "I want to skip budgets"

**Can skip**: Chunks 014-016

**Dependencies broken**: None

**Can still complete**: Everything else

**Recommendation**: Skip for MVP, add later if users request it.

---

### "I want to skip transfers"

**Can skip**: Chunks 017-018

**Dependencies broken**: None

**Can still complete**: Everything else

**Note**: Users can still manually create "transfer" transactions by making two separate transactions (one expense, one income). They just won't be linked.

---

### "I want to skip cloud backups"

**Can skip**: Chunks 036-040

**Dependencies broken**: None

**Can still complete**: Everything else

**Note**: Users can still manually export CSV (chunk 036) for backups.

---

## Prerequisite Quick Reference

### By Chunk Number

| Chunk | Prerequisites | Can Start After                 |
| ----- | ------------- | ------------------------------- |
| 001   | None          | Immediately                     |
| 002   | 001           | Project setup complete          |
| 003   | 002           | Auth working                    |
| 004   | 003           | Routing working                 |
| 005   | 004           | Accounts schema exists          |
| 006   | 005           | Accounts UI exists              |
| 007   | 006           | Currency utilities exist        |
| 008   | 007           | Categories schema exists        |
| 009   | 008           | Transactions schema exists      |
| 010   | 009           | Transaction form works          |
| 011   | 010           | Transaction list works          |
| 012   | 010           | Transaction list works          |
| 013   | 010           | Transaction list works          |
| 014   | 010           | Transaction list works          |
| 015   | 010           | Transaction list works          |
| 016   | 015           | Budget schema exists            |
| 017   | 010           | Transaction list works          |
| 018   | 017           | Transfer schema exists          |
| 019   | 010           | Core CRUD complete              |
| 020   | 019           | Dexie setup complete            |
| 021   | 020           | Offline reads working           |
| 022   | 021           | Offline writes working          |
| 023   | 022           | Sync queue schema exists        |
| 024   | 023           | Queue writes working            |
| 025   | 024           | Sync processor exists           |
| 026   | 002           | Auth working (for user context) |
| 027   | 026           | Device ID working               |
| 028   | 027           | Devices table exists            |
| 029   | 028           | Events schema exists            |
| 030   | 029           | Idempotency keys working        |
| 031   | 030           | Event generation working        |
| 032   | 031           | Vector clocks working           |
| 033   | 032           | Conflict detection working      |
| 034   | 033           | Conflict resolution working     |
| 035   | 034           | Realtime sync working           |
| 036   | 010           | Core CRUD complete              |
| 037   | 036           | CSV export working              |
| 038   | 026           | Device ID for upload signing    |
| 039   | 038           | R2 setup complete               |
| 040   | 039           | Backup encryption working       |
| 041   | 010           | Core app working                |
| 042   | 041           | PWA manifest exists             |
| 043   | 042           | Service worker exists           |
| 044   | 013           | Basic dashboard exists          |
| 045   | 046           | App structure stable            |
| 046   | 010 (minimum) | Deployable features ready       |

---

## Dependency Checklist for Each Milestone

### Before Starting Milestone 2

- [x] Milestone 1 complete (chunks 001-003)
- [x] Can log in and navigate
- [x] Supabase connected

### Before Starting Milestone 3

- [x] Milestone 2 complete (chunks 004-010 minimum)
- [x] Core CRUD working
- [x] Transactions display correctly

### Before Starting Milestone 4

- [x] Milestone 3 complete (chunks 019-025)
- [x] Offline reads/writes working
- [x] Sync queue operational

### Before Starting Milestone 5

- [x] Milestone 2 complete (minimum)
- [x] App features stable
- [x] Core functionality tested

---

## Visual Summary

```
REQUIRED PATH (Never Skip):
001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010

RECOMMENDED FOR MVP (Flexible Order):
011, 012, 013, 014

OPTIONAL FEATURES:
015-016 (Budgets)
017-018 (Transfers)

OPTIONAL CAPABILITIES:
019-025 (Offline)
026-035 (Sync)
036-040 (Backups)
041-046 (Production)
```

---

## Common Dependency Questions

**Q: Can I do chunks 011-014 before 010?**
A: No, they all need the transaction list infrastructure from chunk 010.

**Q: Can I do offline (019-025) before finishing MVP (011-014)?**
A: Yes technically, but not recommended. MVP should work online first.

**Q: Do I need offline (Milestone 3) to do sync (Milestone 4)?**
A: Yes absolutely. Sync requires the offline storage infrastructure.

**Q: Can I do PWA (041-043) without offline support?**
A: Yes! PWA manifest + service worker work fine for online-only apps.

**Q: What's the absolute minimum to deploy?**
A: Chunks 001-010 + 046 (deployment). That's 11 chunks total for a basic deployed app.

---

## Recommended Learning Paths

### Path 1: Fastest MVP (20 hours)

```
001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010
→ 011 → 012 → 013 → 046
```

**Outcome**: Deployable financial tracker, no offline, no sync

### Path 2: MVP + Offline (28 hours)

```
[Path 1] + 019 → 020 → 021 → 022 → 023 → 024 → 025
```

**Outcome**: Works offline, single device

### Path 3: Full Featured (38 hours)

```
[Path 2] + 026 → 027 → 028 → 029 → 030 → 031 → 032 → 033 → 034 → 035
```

**Outcome**: Multi-device sync, offline, conflict resolution

### Path 4: Production Ready (45 hours)

```
[Path 3] + 041 → 042 → 043 → 045 → 046
```

**Outcome**: Everything, tested, deployed, installable

---

## Using This Map

### When Starting a Chunk

1. Check "Prerequisite Quick Reference" table
2. Verify dependencies complete
3. Proceed with chunk

### When Skipping a Chunk

1. Check "Skip Safety Matrix"
2. Understand downstream impacts
3. Mark as skipped in progress-tracker.md

### When Stuck

1. Check if prerequisites are truly complete
2. Run checkpoints for prerequisite chunks
3. Review troubleshooting guides

---

**Last Updated**: 2025-01-15
**Based On**: 46 chunks in docs/implementation/chunks/

**Quick Commands**:

```
# Check dependencies for chunk 015
grep "^| 015 |" dependency-map.md

# View recommended path
grep -A 10 "Path 1: Fastest MVP" dependency-map.md
```
