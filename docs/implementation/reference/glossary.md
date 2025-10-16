# Technical Glossary

> **Purpose**: Quick definitions of technical terms used throughout the Household Hub documentation.

## Table of Contents

- [Architecture & Design](#architecture--design)
- [Currency & Financial](#currency--financial)
- [Database & Storage](#database--storage)
- [Event Sourcing & Sync](#event-sourcing--sync)
- [Frontend & React](#frontend--react)
- [Offline & PWA](#offline--pwa)
- [Infrastructure](#infrastructure)

---

## Architecture & Design

### Event Sourcing

**What**: Architectural pattern where all changes are stored as immutable events, not state mutations.
**Example**: Instead of `UPDATE transactions SET amount=500`, create event `{type: 'update', field: 'amount', value: 500}`.
**Used in**: Milestone 4 (sync engine)
**Why**: Enables audit trail, conflict resolution, and time-travel debugging.

### Offline-First

**What**: Architecture pattern prioritizing offline functionality over online.
**Example**: App loads from IndexedDB first, syncs in background.
**Used in**: Milestone 3 (offline support)
**Why**: Works on flaky connections, instant load times, better UX.

### Three-Layer State

**What**: Household Hub's state management pattern.
**Layers**:

1. **UI State** (Zustand) - ephemeral, optimistic updates
2. **IndexedDB** (Dexie) - persistent, truth when offline
3. **Supabase** (PostgreSQL) - canonical truth

**Used in**: All milestones
**Why**: Separates concerns, enables offline, provides fallbacks.

### Row-Level Security (RLS)

**What**: PostgreSQL feature enforcing data access rules at database level.
**Example**: `POLICY household_select USING (visibility = 'household')`
**Used in**: All database operations
**Why**: Security enforced in database, not just application code.

---

## Currency & Financial

### BIGINT Cents

**What**: Storing currency as integer cents instead of decimal pesos.
**Example**: ₱1,500.50 stored as `150050` (BIGINT)
**Used in**: All financial data
**Why**: Avoids floating-point precision errors, exact calculations.

### formatPHP()

**What**: Utility function converting cents to formatted string.
**Signature**: `formatPHP(cents: number): string`
**Example**: `formatPHP(150050)` → `"₱1,500.50"`
**Used in**: All currency display
**Implementation**: chunks/006-currency-system

### parsePHP()

**What**: Utility function converting user input to cents.
**Signature**: `parsePHP(input: string | number): number`
**Example**: `parsePHP("1,500.50")` → `150050`
**Used in**: All currency input forms
**Implementation**: chunks/006-currency-system

### validateAmount()

**What**: Validates amount is within acceptable range.
**Range**: 0 to 999,999,999 cents (₱0.00 to ₱9,999,999.99)
**Example**: `validateAmount(150050)` → `true`
**Used in**: All currency validation
**Implementation**: chunks/006-currency-system

### Transfer

**What**: Money movement between accounts, represented as TWO linked transactions.
**Structure**:

- One expense (from account)
- One income (to account)
- Same `transfer_group_id`
- Same `amount_cents`
  **Used in**: chunks/017-018 (transfers)
  **Critical Rule**: Always exclude from analytics with `WHERE transfer_group_id IS NULL`

### Transfer Group ID

**What**: UUID linking two transactions that form a transfer.
**Example**: Transaction A (expense) and Transaction B (income) share `transfer_group_id = 'uuid-123'`
**Used in**: Transfer transactions
**Why**: Enables transfer integrity validation, analytics exclusion.

---

## Database & Storage

### Dexie

**What**: TypeScript wrapper for IndexedDB, provides typed database API.
**Example**: `db.transactions.where('date').above('2025-01-01').toArray()`
**Used in**: Milestone 3 (offline support)
**Why**: IndexedDB API is complex, Dexie simplifies with promises and types.

### IndexedDB

**What**: Browser's client-side database for large structured data.
**Capacity**: ~50% of available disk space
**Used in**: Offline storage
**Why**: Much larger than localStorage (5MB limit), supports indexes and transactions.

### Supabase

**What**: Open-source Firebase alternative, provides PostgreSQL + Auth + Realtime + Storage.
**Components**:

- **Auth**: User authentication with JWT
- **Database**: PostgreSQL with RLS
- **Realtime**: WebSocket subscriptions for live updates
  **Used in**: All backend operations
  **Why**: Generous free tier, PostgreSQL power, instant GraphQL API.

### PostgreSQL

**What**: Open-source relational database, Supabase backend.
**Used in**: Server-side storage
**Why**: ACID compliance, RLS support, powerful query capabilities.

### Migration

**What**: SQL script defining incremental database schema changes.
**Example**: `20250115_add_tagged_users.sql`
**Used in**: All schema changes
**Why**: Versioned, repeatable, trackable schema evolution.

### RLS Policy

**What**: Rule defining who can access which rows in a table.
**Example**: `USING (owner_user_id = auth.uid())`
**Used in**: All tables
**Why**: Enforces security at database level, prevents data leaks.

---

## Event Sourcing & Sync

### Idempotency Key

**What**: Unique identifier preventing duplicate event creation.
**Format**: `${deviceId}-${entityType}-${entityId}-${lamportClock}`
**Example**: `fp-abc123-transaction-uuid-42`
**Used in**: Event sourcing (Milestone 4)
**Why**: Distributed systems may retry operations, idempotency prevents duplicates.

### Lamport Clock

**What**: Monotonic counter tracking logical time per entity on each device.
**Example**: Device A edits transaction 3 times → lamport clock = 3
**Used in**: Event ordering, idempotency keys
**Why**: Provides ordering without relying on wall-clock time.

### Vector Clock

**What**: Per-entity map of lamport clocks for all devices that modified it.
**Structure**: `{ "device1": 5, "device2": 3 }`
**Used in**: Conflict detection (Milestone 4)
**Why**: Detects concurrent edits (clocks diverge) vs sequential edits (one clock > other).

### LWW (Last-Write-Wins)

**What**: Conflict resolution strategy where most recent timestamp wins.
**Implementation**: Field-level (not entity-level) using server canonical timestamp.
**Example**: Device A updates `amount` at 10:00, Device B updates `description` at 10:01 → both changes merge.
**Used in**: Conflict resolution (Milestone 4)
**Why**: Automatic resolution without user intervention, deterministic.

### Event Compaction

**What**: Process of replacing many events with a single snapshot.
**Trigger**: 100 events per entity OR monthly
**Example**: 101 edit events → 1 snapshot with final state + delete events
**Used in**: Event sourcing optimization
**Why**: Prevents unbounded event log growth, faster replay.

### Sync Queue

**What**: Local queue of operations waiting to sync to server.
**States**: `draft` → `queued` → `syncing` → `acked` → `confirmed` (or `failed`)
**Used in**: Offline writes (Milestone 3)
**Why**: Ensures offline changes eventually reach server.

### Conflict

**What**: Situation where two devices edited same entity offline, then synced.
**Detection**: Vector clocks diverged
**Resolution**: Field-level LWW or DELETE wins
**Used in**: Multi-device sync (Milestone 4)
**Example**: Device A updates amount, Device B updates description simultaneously.

---

## Frontend & React

### TanStack Router

**What**: Type-safe routing library for React.
**Example**: `<Route path="/transactions/:id" component={TransactionDetail} />`
**Used in**: All navigation (chunks/003-routing-foundation)
**Why**: Type-safe, file-based routing, automatic code splitting.

### TanStack Query

**What**: Async state management for React (formerly React Query).
**Example**: `useQuery({ queryKey: ['transactions'], queryFn: fetchTransactions })`
**Used in**: All server state
**Why**: Automatic caching, refetching, optimistic updates, offline support.

### TanStack Table

**What**: Headless table library for complex data grids.
**Example**: Sortable, filterable transaction lists
**Used in**: Transaction list (chunks/010-transactions-list)
**Why**: Virtual scrolling, column management, performance with 10k+ rows.

### TanStack Virtual

**What**: Virtualization library for rendering only visible rows.
**Example**: Render 50 of 10,000 transactions at a time
**Used in**: Transaction list
**Why**: Smooth scrolling, low memory usage with large datasets.

### Zustand

**What**: Lightweight state management for React.
**Example**: `const user = useAuthStore(state => state.user)`
**Used in**: Auth state, UI state
**Why**: Simple API, TypeScript support, minimal boilerplate.

### React Hook Form

**What**: Form state management with validation.
**Example**: `const { register, handleSubmit } = useForm()`
**Used in**: All forms
**Why**: Minimal re-renders, integrates with Zod for validation.

### Zod

**What**: TypeScript-first schema validation library.
**Example**: `z.object({ amount: z.number().positive() })`
**Used in**: Form validation
**Why**: Type inference, runtime validation, great error messages.

### shadcn/ui

**What**: Copy-paste React component library built on Radix UI + Tailwind.
**Example**: `<Button variant="outline">Click me</Button>`
**Used in**: All UI components
**Why**: Accessible, customizable, no npm package bloat.

### Sonner

**What**: Toast notification library for React.
**Example**: `toast.success('Transaction created')`
**Used in**: All notifications
**Why**: Beautiful, accessible, simple API.

---

## Offline & PWA

### PWA (Progressive Web App)

**What**: Web app that's installable, works offline, and feels native.
**Requirements**: HTTPS, manifest, service worker
**Used in**: Milestone 5 (production)
**Why**: Better UX, home screen icon, push notifications.

### Service Worker

**What**: JavaScript that runs in background, intercepts network requests.
**Use Cases**: Cache assets, offline fallback, push notifications
**Used in**: chunks/042-service-worker
**Why**: Enables offline capability, instant load times.

### Web App Manifest

**What**: JSON file describing PWA metadata.
**Example**: `{ "name": "Household Hub", "icons": [...] }`
**Used in**: chunks/041-pwa-manifest
**Why**: Enables "Add to Home Screen", defines app appearance.

### Workbox

**What**: Google's service worker library with caching strategies.
**Strategies**: Cache-first, Network-first, Stale-while-revalidate
**Used in**: Service worker implementation
**Why**: Simplifies complex caching logic, best practices built-in.

### Background Sync

**What**: Browser API for deferring actions until network available.
**Example**: Queue transaction offline, sync when reconnected
**Used in**: Sync queue (Milestone 3)
**Limitation**: Not supported on iOS Safari

### Push Notifications

**What**: Browser notifications sent from server.
**Example**: "Budget exceeded for Groceries"
**Used in**: chunks/043-push-notifications
**Limitation**: Not supported on iOS Safari
**Requires**: Service worker, VAPID keys, user permission

### VAPID Keys

**What**: Public/private key pair for Web Push authentication.
**Generation**: `web-push generate-vapid-keys`
**Used in**: Push notifications
**Why**: Identifies app to push service, prevents spam.

---

## Infrastructure

### Cloudflare Pages

**What**: Static site hosting with global CDN.
**Features**: Auto-deploy from Git, preview deployments, custom domains
**Used in**: Production deployment (chunks/046-deployment)
**Why**: Free tier generous, fast global CDN, simple setup.

### Cloudflare R2

**What**: S3-compatible object storage.
**Use Case**: Encrypted database backups
**Used in**: chunks/038-040 (backups)
**Why**: No egress fees, cheaper than S3.

### Cloudflare Worker

**What**: Serverless JavaScript at the edge.
**Use Case**: R2 upload proxy with JWT validation
**Used in**: chunks/040-backup-worker
**Why**: Fast, global, integrates with R2.

### FingerprintJS

**What**: Browser fingerprinting library for device identification.
**Example**: Generates stable ID based on browser attributes
**Used in**: Device ID hybrid strategy (chunks/026-device-hybrid-id)
**Why**: Fallback when IndexedDB/localStorage cleared.

### Vite

**What**: Modern build tool and dev server.
**Features**: Fast HMR, ES modules, optimized builds
**Used in**: Build process
**Why**: 10-100x faster than Webpack, simple config.

### TypeScript

**What**: JavaScript with static types.
**Example**: `function add(a: number, b: number): number`
**Used in**: All code
**Why**: Catch errors at compile time, better IDE support.

### ESLint

**What**: JavaScript linter finding code issues.
**Example**: Detects unused variables, type errors
**Used in**: Code quality checks
**Why**: Enforces code standards, prevents bugs.

### Prettier

**What**: Opinionated code formatter.
**Example**: Auto-formats on save
**Used in**: Code formatting
**Why**: Consistent style, no debates, auto-fix.

---

## Abbreviations

| Term      | Full Name                         | Meaning                      |
| --------- | --------------------------------- | ---------------------------- |
| **CRUD**  | Create, Read, Update, Delete      | Basic database operations    |
| **RLS**   | Row-Level Security                | PostgreSQL access control    |
| **JWT**   | JSON Web Token                    | Authentication token format  |
| **UUID**  | Universally Unique Identifier     | 128-bit unique ID            |
| **LWW**   | Last-Write-Wins                   | Conflict resolution strategy |
| **PWA**   | Progressive Web App               | Installable web application  |
| **HMR**   | Hot Module Replacement            | Update code without refresh  |
| **CDN**   | Content Delivery Network          | Global asset distribution    |
| **API**   | Application Programming Interface | Software interface           |
| **UI**    | User Interface                    | Visual layer                 |
| **UX**    | User Experience                   | User interaction quality     |
| **MVP**   | Minimum Viable Product            | Basic functional product     |
| **E2E**   | End-to-End                        | Testing full user flows      |
| **SQL**   | Structured Query Language         | Database query language      |
| **JSON**  | JavaScript Object Notation        | Data interchange format      |
| **HTTPS** | HTTP Secure                       | Encrypted HTTP               |
| **GIN**   | Generalized Inverted Index        | PostgreSQL array index type  |
| **CORS**  | Cross-Origin Resource Sharing     | Browser security policy      |
| **CSP**   | Content Security Policy           | Web security header          |

---

## Context-Specific Terms

### Household vs Personal

**What**: Two visibility models for data access.

- **Household**: Shared data, all users can see (e.g., shared accounts, categories)
- **Personal**: Private data, only owner can see (e.g., personal accounts, transactions)
  **Used in**: RLS policies
  **Implementation**: `visibility` field + RLS policies

### Tagged Users

**What**: Array of user IDs mentioned in transaction using @mentions.
**Example**: Transaction with `@john` has `tagged_user_ids = ['john-uuid']`
**Used in**: Transaction collaboration
**Storage**: `uuid[]` with GIN index

### Initial Balance

**What**: Account's starting balance before any transactions.
**Example**: Account created with ₱5,000 already in it
**Used in**: Account balance calculations
**Stored as**: `initial_balance_cents` BIGINT

### Cleared vs Pending

**What**: Transaction status indicating bank confirmation.

- **Cleared**: Posted to account, confirmed
- **Pending**: Not yet confirmed by bank
  **Used in**: Account balance split views
  **Future**: Currently all transactions assumed cleared

### Month Key

**What**: String representing a specific month for budget tracking.
**Format**: `YYYY-MM` (e.g., "2025-01")
**Used in**: Budget table grouping
**Why**: Simpler than date ranges for monthly budgets.

---

## Performance Terms

### FCP (First Contentful Paint)

**What**: Time until first content renders on screen.
**Target**: <1.5s
**Used in**: Performance budgets
**Measured by**: Lighthouse

### TTI (Time to Interactive)

**What**: Time until page is fully interactive.
**Target**: <3.5s
**Used in**: Performance budgets
**Measured by**: Lighthouse

### LCP (Largest Contentful Paint)

**What**: Time until largest element renders.
**Target**: <2.5s
**Used in**: Core Web Vitals
**Measured by**: Lighthouse, Chrome UX Report

### CLS (Cumulative Layout Shift)

**What**: Visual stability metric (unexpected layout shifts).
**Target**: <0.1
**Used in**: Core Web Vitals
**Measured by**: Lighthouse

### TBT (Total Blocking Time)

**What**: Time main thread is blocked.
**Target**: <200ms
**Used in**: Performance budgets
**Measured by**: Lighthouse

---

## Related Documentation

- **Full technical specs**: `docs/initial plan/`
- **Database schema**: `docs/initial plan/DATABASE.md`
- **Sync engine**: `docs/initial plan/SYNC-ENGINE.md`
- **Decisions rationale**: `docs/initial plan/DECISIONS.md`
- **Quick patterns**: `docs/implementation/reference/database-cheatsheet.md`
- **Troubleshooting**: `docs/implementation/reference/troubleshooting-guide.md`

---

**Last Updated**: 2025-01-15
**Need more detail?** Search the term in `docs/initial plan/` for comprehensive explanations.
