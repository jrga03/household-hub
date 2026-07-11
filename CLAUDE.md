# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Household Hub** is an offline-first Progressive Web App for household financial management built with privacy and resilience in mind. The app uses event sourcing from day one to provide complete audit trails and conflict-free multi-device sync.

**Core Philosophy**: Offline-first, event-sourced, privacy-focused, and optimized for free-tier infrastructure.

## Tech Stack

### Frontend

- **React 19** with TypeScript 5.9
- **TanStack Router** (NOT react-router-dom - type-safe routing)
- **TanStack Query** for server state
- **TanStack Table** + **TanStack Virtual** for large datasets (10k+ transactions)
- **Zustand** for lightweight client state
- **shadcn/ui** + Tailwind CSS v4
- **React Hook Form** + Zod for validation
- **Sonner** for toasts (NOT react-hot-toast)

### Data & Offline

- **Dexie.js** (IndexedDB wrapper) for offline-first storage
- **Supabase** (PostgreSQL + Auth + Realtime)
- **FingerprintJS** for device identification with hybrid fallback

### Build & Development

- **Vite 7** with SWC plugin for fast builds
- **ESLint** (flat config) with strict TypeScript rules
- **Prettier** for formatting
- **Husky** git hooks (pre-commit: eslint --fix + format; pre-push: lint + test)

## Development Commands

```bash
# Development
npm run dev          # Start dev server on port 3000
npm run build        # TypeScript check + production build
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix ESLint issues
npm run format       # Format with Prettier

# Testing
npm test             # Run unit tests (Vitest)
npm run test:e2e     # Run E2E tests (Playwright)
npm run test:e2e:ui  # Run E2E tests with UI
```

## Architecture Principles

### 1. Offline-First (Phase A MVP)

- **Three-layer state**: Zustand (UI) → IndexedDB (persistent) → Supabase (cloud truth)
- **Local outbox**: every mutation writes its entity AND a sync-queue item into
  IndexedDB in ONE Dexie transaction (`buildSyncQueueItem` + `db.syncQueue`).
  Enqueueing never touches the network, so mutations succeed fully offline. The
  sync processor (`lib/sync/processor.ts`) drains the local queue to Supabase.
- **Client-generated UUIDs**: `crypto.randomUUID()` at creation, so local ID ==
  server ID. There are no temp IDs and no ID remapping.
- **Reads**: TanStack Query with a Dexie fallback (`lib/offline/reads.ts`) when
  the network is unreachable; sync badges read the local queue via `useLiveQuery`.
- **Conflict strategy (Phase A)**: timestamp Last-Write-Wins (newer `updated_at`
  wins), applied by both realtime `handleUpdate` and the reconnection catch-up.
  Lamport clocks are retained for idempotency keys only.
- **Phase B (not yet built)**: per-entity vector clocks + field-level conflict
  resolution. The earlier Phase-B stack was removed as unreachable; reintroduce
  it end-to-end (server columns + payload clocks + resolution) when Phase B starts.
- **Debt ledger**: balances are a signed sum — `original - SUM(all payment rows)`
  — where reversals are stored NEGATIVE and always linked via
  `reverses_payment_id` (uniform at any cascade depth). See `lib/debts/balance.ts`.

### 2. Currency Handling (CRITICAL)

- **PHP (Philippine Peso) only** for MVP
- **Amount storage**: BIGINT cents (1 PHP = 100 cents)
- **Always positive amounts** with explicit `type` field ('income' | 'expense')
- **Utilities required**: `formatPHP(cents)`, `parsePHP(input)`, `validateAmount(cents)`
- See DATABASE.md lines 1005-1160 for complete spec

### 3. Transaction Date Strategy

- **Transaction `date` field**: Stored as `DATE` (user's local date is canonical)
- **Audit timestamps**: `created_at`/`updated_at` as `TIMESTAMPTZ` (UTC)
- **Month boundaries**: Use user's timezone from `profiles.timezone`
- **Rationale**: Financial transactions are date-based in user's context (see DATABASE.md lines 932-1004)

### 4. Transfer Representation

- **Implementation**: Two linked transactions with `transfer_group_id`
- **One expense** (from account) + **one income** (to account)
- **Critical**: Always exclude transfers from analytics/budgets (`WHERE transfer_group_id IS NULL`)
- See DATABASE.md lines 441-501 for query patterns

### 5. Budget System

- **Budgets are reference targets only** (not balances)
- **No rollover**: Actual spending always calculated from transactions
- Can copy previous month's targets forward
- See DECISIONS.md #12, #79

## Key Implementation Details

### Device Identification (Hybrid Strategy)

```typescript
// Priority order:
// 1. IndexedDB stored device ID
// 2. localStorage backup
// 3. FingerprintJS as fallback
// Always store in BOTH IndexedDB and localStorage for redundancy
// Register device in devices table on first use
```

See SYNC-ENGINE.md lines 1123-1303, DECISIONS.md #52, #75

### Event Structure (Phase A)

```typescript
interface TransactionEvent {
  id: string;
  entityType: "transaction" | "account" | "category" | "budget";
  entityId: string; // Which entity this event modifies
  op: "create" | "update" | "delete";
  payload: any; // Changed fields only for updates

  // Idempotency (CRITICAL)
  idempotencyKey: string; // Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}

  // Ordering / idempotency. lamportClock is per-entity and drives the
  // idempotency key. vectorClock is Phase B only and is NOT currently minted.
  lamportClock: number;
  vectorClock?: VectorClock;

  // Tracking
  actorUserId: string;
  deviceId: string;
  timestamp: number;
}
```

### Sync Queue States (local Dexie outbox)

```
queued → syncing → completed
      ↓ (retryable error: next_retry_at scheduled with exponential backoff)
queued
      ↓ (non-retryable, or retries exhausted)
failed   (terminal; surfaced in the sync UI, re-enters only via user retry)
```

Crash recovery: items stranded in `syncing` are reset to `queued` at the start
of each processing session (`resetStaleSyncingItems`).

### Conflict Resolution

- **Phase A (current)**: record-level timestamp LWW (newer `updated_at` wins).
  A newer local unsynced edit is preserved over an older remote echo.
- **Phase B (planned, not built)**: per-entity vector clocks + field-level LWW
  with server timestamps, DELETE-wins. Requires clock columns on entity tables
  and clocks in sync payloads before the resolution engine can be re-enabled.
- See SYNC-ENGINE.md, DECISIONS.md #77, and
  `docs/reviews/2026-07-02-architecture-review.md` (SYNC-05).

## Database Schema Highlights

### Core Tables

- `profiles` - User profiles extending Supabase Auth
- `devices` - Multi-device registry (promoted to MVP per Decision #82)
- `accounts` - Bank/financial accounts (household or personal)
- `categories` - Two-level hierarchy (parent → child)
- `transactions` - Main transaction table (date as DATE, amounts as cents)
- `transaction_events` - Event sourcing audit log
- `budgets` - Monthly spending targets (reference only)
- `sync_queue` - Offline changes waiting to sync

### Critical Indexes

Database uses **indexes instead of materialized views** for MVP (Decision #64):

- Compound indexes for common query patterns (account+date, category+date)
- GIN index on `tagged_user_ids` array for @mentions
- Month key index for budget queries
  See DATABASE.md lines 1161-1346 for query-to-index mappings

### RLS Policies

- **Household data**: Visible to all authenticated users
- **Personal data**: Scoped to `owner_user_id`
- **Sync queue**: User can only see their device's queue
- See RLS-POLICIES.md for complete policy definitions

## Code Organization

```
src/
├── components/       # React components (shadcn/ui based)
├── lib/             # Utilities, Dexie DB setup, currency helpers
├── stores/          # Zustand stores (auth, UI state)
├── routes/          # TanStack Router pages
├── hooks/           # Custom React hooks
├── types/           # TypeScript type definitions
├── App.tsx          # Root component
├── main.tsx         # Entry point
└── index.css        # Global styles + Tailwind
```

## Important Patterns

### 0. PageShell layout primitive

Every route uses `<PageShell variant="…">` from `src/components/layout/PageShell.tsx`.
Variants: `centered` (default), `rail`, `split`, `nav-content`, `triple`. Responsive
collapse is driven by Tailwind container queries on the outer `@container` wrapper,
not viewport media queries — the global sidebar can collapse and shift the content
area, so reacting to the actual page region is more reliable.

When embedding components inside narrow regions (rails, sheets, master-detail panes),
prefer container queries (`@[600px]:grid-cols-5`) over viewport breakpoints
(`md:grid-cols-5`) so the component adapts to its host rather than the window.

See `docs/plans/2026-05-30-wide-screen-layout-design.md` for the full design and
`docs/plans/2026-05-31-wide-screen-layout-implementation.md` for migration history.

### 1. State Management

```typescript
// Server state: TanStack Query
const { data, isLoading } = useQuery({
  queryKey: ["transactions", filters],
  queryFn: fetchTransactions,
  staleTime: 5 * 60 * 1000, // 5 min
});

// Client state: Zustand (minimal)
const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  signIn: async (email, password) => {
    /* ... */
  },
}));
```

### 2. Offline Storage (Dexie)

```typescript
// Event sourcing from Phase A
class HouseholdHubDB extends Dexie {
  transactions!: Table<Transaction>;
  accounts!: Table<Account>;
  categories!: Table<Category>;
  events!: Table<TransactionEvent>; // Event log
  syncQueue!: Table<SyncQueueItem>; // Offline changes
  meta!: Table<{ key: string; value: any }>; // Device ID, etc.
}
```

### 3. Currency Formatting

```typescript
// Always use these utilities
import { formatPHP, parsePHP, validateAmount } from "@/lib/currency";

// Display: cents → formatted string
formatPHP(150050); // "₱1,500.50"

// Input: string/number → cents
parsePHP("1,500.50"); // 150050

// Validation
validateAmount(150050); // true (0 to 999,999,999)
```

### 4. Transfer Exclusion Pattern

```typescript
// CRITICAL: Always exclude transfers from analytics
const spendingQuery = `
  SELECT SUM(amount_cents)
  FROM transactions
  WHERE type = 'expense'
    AND transfer_group_id IS NULL  -- Exclude transfers!
    AND DATE_TRUNC('month', date) = $1
`;
```

## Testing Strategy

### Unit Tests (Vitest)

- Currency utilities (`formatPHP`, `parsePHP`)
- Conflict resolution logic
- Event idempotency key generation
- Date handling and timezone logic

### E2E Tests (Playwright)

- Offline transaction creation + sync
- Multi-device conflict scenarios
- Transfer creation and integrity
- Budget vs actual calculations
- Accessibility (axe-core)

### Performance Tests

- 10k+ transaction rendering (TanStack Virtual)
- Sync queue processing (1000 items)
- Large CSV imports (50k rows)

## Phase Implementation Status

### Phase A (Days 1-7): Core MVP ✅ IN PROGRESS

- Basic CRUD operations
- Simple event sourcing with LWW
- Manual export (CSV/JSON)
- Offline support with IndexedDB
- Device fingerprinting with hybrid fallback

### Phase B (Days 8-12): Enhanced Sync 🔜 PLANNED

- Vector clocks (per-entity)
- Advanced field-level conflict resolution
- Automated R2 backups with encryption
- Event compaction (100 events OR monthly)
- CSV import with deduplication

### Phase C (Days 13-15): PWA & Polish 🔜 PLANNED

- PWA manifest + service worker
- Push notifications (budget alerts)
- Analytics dashboard
- Final accessibility polish

## Critical Architectural Decisions

Reference these when making implementation choices:

1. **#62**: Event sourcing from Phase A (simplified LWW, vector clocks in Phase B)
2. **#64**: Use indexes NOT materialized views for MVP performance
3. **#75**: Hybrid device ID (IndexedDB → localStorage → FingerprintJS)
4. **#77**: Deterministic field-level conflict resolution
5. **#80**: Budgets are reference targets only (no balance rollover)
6. **#82**: Devices table promoted to MVP (no migration pain)
7. **#83**: Defer automated R2 backups to Phase B (security-first)

See docs/initial plan/DECISIONS.md for complete rationale.

## Common Development Tasks

### Adding a New Transaction Field

1. Update `transactions` table schema with migration
2. Add field to TypeScript `Transaction` interface
3. Update Dexie schema version with `.upgrade()` function
4. Add to event payload structure
5. Update conflict resolution rules if needed
6. Add to CSV export/import logic

### Creating a Sync-Enabled Entity

1. Add table to database with `household_id`, `device_id`, timestamps
2. Create TypeScript interface
3. Add to Dexie schema
4. Implement event creation on mutations
5. Add to sync queue processor
6. Define RLS policies
7. Set up realtime subscription (Phase B)

### Adding a New View/Route

1. Create route file in `src/routes/` (TanStack Router)
2. Use TanStack Query for data fetching
3. Implement TanStack Virtual for large lists
4. Add filters with URL search params
5. Ensure offline fallback (read from Dexie)
6. Add E2E test for critical paths

## Known Constraints & Limitations

### MVP Constraints

- **PHP currency only** (multi-currency in Phase 2)
- **Single household** (multi-household architecture ready, not active)
- **No automated cloud backups** in Phase A (manual export only)
- **Simple LWW conflicts** (vector clocks in Phase B)

### Browser Compatibility

- **iOS Safari**: Background Sync API not supported
  - Fallback: Manual sync button + sync-on-focus
- **Storage quota**: Monitor with `navigator.storage.estimate()`
  - Warn at 80%, prune at 95%

### Free Tier Limits

- **Supabase**: 500MB database (sufficient for years)
- **Cloudflare Pages**: Unlimited bandwidth
- **Cloudflare R2**: 10GB storage (Phase B)

## Performance Budgets

- **Initial bundle**: <200KB (core transaction CRUD)
- **FCP**: <1.5s on 3G
- **TTI**: <3.5s on 3G
- **Lighthouse Score**: >90
- **Transaction list**: Handle 10k+ items smoothly with virtual scrolling

## Security Considerations

### Authentication

- Supabase Auth (email/password for MVP)
- JWT-based session management
- Device registration on first login

### Data Access

- Row-Level Security enforced at database
- Household data shared across users
- Personal data scoped to owner
- Sync queue scoped to device

### Backup Encryption (Phase B)

- Client-side AES-GCM encryption
- Auth-derived key from Supabase JWT
- WebCrypto API for key derivation
- Optional passphrase encryption (future)

## Documentation References

Essential reading for deep dives:

- **DATABASE.md** - Complete schema, currency spec, query patterns
- **SYNC-ENGINE.md** - Event sourcing, conflict resolution, device ID
- **DECISIONS.md** - All architectural decisions with rationale
- **IMPLEMENTATION-PLAN.md** - 15-day timeline and deliverables
- **RLS-POLICIES.md** - Row-level security rules
- **R2-BACKUP.md** - Backup strategy (Phase B)

## ESLint & Code Style

### Strict Rules

- `@typescript-eslint/no-explicit-any`: **error** (proper typing enforced)
- `@typescript-eslint/no-unused-vars`: warn (with `_` prefix ignore)
- `react-hooks/exhaustive-deps`: enforced (prevent memory leaks)

### Formatting

- Prettier runs on pre-commit via lint-staged
- ESLint auto-fix on pre-push
- Unit tests required to pass before push

## Path Aliases

```typescript
import { formatPHP } from "@/lib/currency"; // → ./src/lib/currency
import { Button } from "@/components/ui/button"; // → ./src/components/ui/button
```

## Git Workflow

### Pre-commit Hook

- Runs `eslint --fix` then Prettier on staged files via lint-staged (auto-fixes
  are staged, so the committed code is what passed lint)

### Pre-push Hook

- VERIFIES, never mutates: `npm run lint` then `npx vitest run` (must pass)

## Quick Reference: Key Files

- `src/lib/dexie.ts` - IndexedDB schema and version migrations
- `src/lib/currency.ts` - PHP formatting utilities (MUST EXIST)
- `src/stores/authStore.ts` - Authentication state
- `vite.config.ts` - Build config (TanStack Router plugin, path aliases)
- `eslint.config.js` - Flat config with TypeScript + React rules
- `.prettierrc` - Code formatting rules
- `package.json` - Dependencies and scripts

## When in Doubt

1. **Currency**: Always use cents (BIGINT), always positive with `type` field
2. **Transfers**: Always exclude from analytics (`WHERE transfer_group_id IS NULL`)
3. **Dates**: Transaction `date` is DATE type (user's local), timestamps are TIMESTAMPTZ (UTC)
4. **Routing**: Use TanStack Router (NOT react-router-dom)
5. **Toasts**: Use Sonner (NOT react-hot-toast)
6. **State**: Server state in TanStack Query, client state in Zustand
7. **Offline**: Read from Dexie first, sync in background
8. **Events**: Generate idempotency keys for all mutations

## Known Infrastructure Issues

Check this list BEFORE debugging any test/CLI failure you did not cause. To confirm a failure is pre-existing: `git stash` (or checkout main) and re-run — if it still fails, it is infrastructure debt, not your regression.

Rules:

- Do NOT root-cause a listed issue mid-task. Cite the entry, use its documented workaround, and move on.
- If you hit a NEW pre-existing failure, add an entry here in the SAME commit as any workaround/exclusion. Unlogged "temporary" exclusions are forbidden.
- When an issue is fixed, delete its entry and re-enable whatever was disabled (grep for TEMPORARY, test.skip, test.fixme).
- Scripts must parse `supabase status -o env` (machine-readable), never the human-readable `supabase status` output — it breaks on CLI upgrades (bit this repo at CLI v2.105.0).

Current entries:

- `scripts/supabase-lifecycle.mjs` hardcodes `HEALTH_URL` to port 54321, but `supabase/config.toml` sets the API port to 54331. The post-start health poll in `startSupabase()` therefore targets the wrong port and will time out (60s) whenever the script itself has to start the stack. Workaround: start the stack manually (`supabase start`) before running dev/E2E scripts; the fix is to poll the `API_URL` from `supabase status -o env` instead of a hardcoded URL.
- The Playwright E2E suite has ~40 pre-existing failures per browser project (verified 2026-07-10: `main` and `mobile-ux-remediation` produce IDENTICAL failure sets — 40 failed / 28 passed / 26 skipped on chromium). Root-cause hints, not yet fixed: `Authentication > should sign up/sign in` fail in ~5s and cascade into every authenticated spec; test cleanup helpers reference a `budgets.notes` column that does not exist in the schema (error `42703` during fixture cleanup); many downstream failures are 30s timeouts waiting on UI that never loads without auth. Layout-baseline render tests also fail identically on main: firefox/webkit/Mobile Safari abort navigation with `page.goto: NS_BINDING_ABORTED` / `NS_ERROR_FAILURE` (verified identical on main 2026-07-10); only chromium/Mobile Chrome layout baselines are trustworthy (snapshots regenerated 2026-07-10 on the mobile-ux-remediation branch). Treat these as the baseline: a spec failing on YOUR branch is a regression only if it passes on main (compare with `npx playwright test --project=chromium --reporter=list` on both). Fix path starts with the auth specs + fixture schema drift.
- The Vitest unit suite has ONE pre-existing failure on `main`: `src/__tests__/transactions-route.test.tsx` — "transactions route on narrow layouts (R14/R38) > shows the filtered In/Out totals inline (loaded-page fallback while the summary loads)" (CI surfaces it as `TestingLibraryElementError: Unable to find an element with the text: Track your income and expenses` at `transactions-route.test.tsx:200`). Verified 2026-07-11: `main` and unrelated branches both produce `1 failed | 840 passed (841)` with the SAME test, so it is NOT a dependency/Node regression. This is what makes `main`'s **CI** `Run unit tests` step fail — and because that step fails first, the downstream `Build application` and `Check bundle size budget` steps are SKIPPED, so CI provides no build/bundle baseline. Not yet root-caused. Workaround: treat as baseline — a unit-test failure on YOUR branch is a regression only if that test passes on `main` (`npx vitest run` on both).

## Support & Resources

- GitHub: Issues and PRs
- Supabase Docs: https://supabase.com/docs
- TanStack Docs: https://tanstack.com
- Dexie Docs: https://dexie.org
- shadcn/ui: https://ui.shadcn.com

---

**Remember**: This is an offline-first, privacy-focused household app. Data integrity and user trust are paramount. When implementing features, always consider: "What happens offline?" and "What happens when two devices edit the same data?"
