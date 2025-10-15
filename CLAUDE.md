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
- **Husky** git hooks (pre-commit: format, pre-push: lint + test)

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

### 1. Offline-First with Event Sourcing (Phase A MVP)

- **Three-layer state**: Zustand (UI) → IndexedDB (persistent) → Supabase (cloud truth)
- **Event sourcing from start**: All changes stored as immutable events
- **Simple LWW** (Last-Write-Wins) in Phase A
- **Vector clocks** added in Phase B for advanced conflict resolution

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

  // Conflict resolution (Phase B)
  lamportClock: number; // Per-entity counter
  vectorClock: VectorClock; // Scoped to specific entity

  // Tracking
  actorUserId: string;
  deviceId: string;
  timestamp: number;
}
```

### Sync Queue States

```
draft → queued → syncing → acked → confirmed
              ↓ (on error)
            failed (with retry + exponential backoff)
```

### Conflict Resolution (Phase B)

- **Per-entity vector clocks** (NOT global)
- **Field-level Last-Write-Wins** with server canonical timestamps
- **DELETE always wins** over UPDATE
- **Deterministic**: Higher lamport clock wins, tie-break with deviceId
- See SYNC-ENGINE.md lines 365-511, DECISIONS.md #77

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

- Runs Prettier on staged files (TS, JS, JSON, MD, YAML)

### Pre-push Hook

- Runs `npm run lint:fix` (auto-fix issues)
- Runs `npm test` (all unit tests must pass)

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

## Support & Resources

- GitHub: Issues and PRs
- Supabase Docs: https://supabase.com/docs
- TanStack Docs: https://tanstack.com
- Dexie Docs: https://dexie.org
- shadcn/ui: https://ui.shadcn.com

---

**Remember**: This is an offline-first, privacy-focused household app. Data integrity and user trust are paramount. When implementing features, always consider: "What happens offline?" and "What happens when two devices edit the same data?"
