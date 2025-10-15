# Glossary of Terms

## Core Concepts

### Transaction

A single financial entry recording money movement. Contains amount (always positive in cents), type (income/expense/transfer), description, date, category, account, and metadata. Transactions are the fundamental data unit.

**Related Terms**: Event, Transfer, Entry
**Database Table**: `transactions`
**Typical Usage**: "Create a transaction for groceries"

### Event

An immutable record of a state change in the event sourcing system. Each transaction operation (create/update/delete) generates events stored with vector clocks for conflict resolution.

**Related Terms**: Event Sourcing, Vector Clock, Audit Trail
**Database Table**: `transaction_events`
**Typical Usage**: "Sync engine processes events from the queue"

### Vector Clock

A per-entity conflict resolution mechanism tracking operation counters per device. Format: `{ device_id: counter }`. Used to determine which device made the most recent change.

**Related Terms**: Lamport Clock, Conflict Resolution, Device ID
**Database Column**: `vector_clock` (JSONB)
**Typical Usage**: "Vector clock shows device-1 at counter 5"

---

## Financial Concepts

### Budget Target

A reference spending goal for a category in a specific month. NOT a balance or envelope. Budgets track variance (actual vs target) rather than mathematical rollover.

**NOT Called**: Budget Balance, Envelope, Allocation
**Database Table**: `budget_targets`
**Typical Usage**: "Set grocery budget target to 10,000 PHP"
**Related Feature**: FEATURES.md Section 2.1

### Transfer

A paired transaction representing money movement between accounts. Creates two linked transactions: one expense from source account, one income to destination account. Both share the same `transfer_group_id`.

**Key Characteristic**: Must be excluded from analytics using `WHERE transfer_group_id IS NULL`
**Database Column**: `transfer_group_id` (UUID)
**Typical Usage**: "Create a transfer from checking to savings"
**Related Feature**: FEATURES.md Section 1.3

### Reconciliation

The process of matching transactions against bank statements and marking them as cleared. Tracks cleared vs pending balance. Can lock cleared transactions for audit trail.

**Status Values**: `pending` → `cleared`
**Database Column**: `status`
**Typical Usage**: "Reconcile checking account against statement"
**Related Feature**: FEATURES.md Section 1.4

### Amount (Cents)

All monetary values stored as **positive integers** in cents (not decimal). PHP currency: max 999,999,999 cents (9,999,999.99 PHP). Transaction type determines income vs expense semantics.

**Database Type**: `BIGINT` (not NUMERIC/DECIMAL)
**Format**: Always positive, never negative
**Typical Usage**: "Store 1,500.50 PHP as 150050 cents"
**Related Spec**: DATABASE.md Section 8

---

## User Concepts

### Household

A group of users sharing financial data. Users belong to exactly one household (for MVP). All transactions, accounts, categories, and budgets exist within household context.

**Database Column**: `household_id` (UUID, NOT NULL)
**Typical Usage**: "User belongs to household ABC"
**Related Spec**: RLS-POLICIES.md

### Visibility

Access control for transactions, accounts, and categories. Two values:

- **household**: All household members can view/edit
- **personal**: Only creator can view/edit (or tagged users)

**Database Column**: `visibility` (ENUM)
**Default**: `household`
**Typical Usage**: "Set transaction visibility to personal"
**Related Feature**: FEATURES.md Section 3.1

### Tagged Users

Users mentioned in a transaction via `tagged_user_ids` array. Grants read access to personal transactions when tagged. Similar to @mentions in social apps.

**Database Column**: `tagged_user_ids` (UUID[])
**Database Index**: GIN index for array queries
**Typical Usage**: "@mention user in shared expense"
**Related Spec**: RLS-POLICIES.md Section 3.1.1

---

## Sync Concepts

### Device ID

A unique identifier for each client device/browser. Generated on first launch and stored persistently. Used in vector clocks and event tracking.

**Format**: 16-character alphanumeric string
**Storage**: Dexie `meta` table
**Typical Usage**: "Device ABC123 creates transaction"
**Related Spec**: SYNC-ENGINE.md Section 3.2

### Sync Queue

A local queue of pending operations waiting to sync to server. Processes in order with exponential backoff on failure. Persisted in IndexedDB.

**Database Table**: `sync_queue` (Dexie)
**States**: `queued` → `syncing` → `synced` / `failed`
**Typical Usage**: "10 items in sync queue"
**Related Spec**: SYNC-ENGINE.md Section 5

### Conflict Resolution

The process of merging concurrent edits from multiple devices. Uses **Last-Write-Wins (LWW)** with vector clocks. Applies field-level merge for non-conflicting fields.

**Strategy**: Last-Write-Wins (LWW) per-field
**Mechanism**: Vector clock comparison
**Typical Usage**: "Resolve conflict between device edits"
**Related Spec**: SYNC-ENGINE.md Section 8

### Offline Mode

Application state when network is unavailable. All operations continue locally, queued for sync when online. Full CRUD operations supported offline.

**Indicator**: Shown in UI when `navigator.onLine === false`
**Storage**: IndexedDB via Dexie
**Typical Usage**: "App works offline, syncs when reconnected"
**Related Feature**: FEATURES.md Section 8

---

## Technical Concepts

### Event Sourcing

Architecture pattern storing all changes as immutable events rather than overwriting state. Enables complete audit trail and time-travel debugging.

**Implementation**: `transaction_events` table
**Benefits**: Audit trail, conflict resolution, sync reliability
**Typical Usage**: "Replay events to reconstruct state"
**Related Spec**: SYNC-ENGINE.md Section 1.1

### Row Level Security (RLS)

PostgreSQL feature enforcing data access at database level. Ensures users only access their household's data, even with leaked credentials.

**Implementation**: Supabase RLS policies
**Policy Example**: `household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())`
**Typical Usage**: "RLS blocks cross-household access"
**Related Spec**: RLS-POLICIES.md

### Dexie

TypeScript wrapper for IndexedDB, used for offline storage. Provides schema versioning, migrations, and transaction support.

**Purpose**: Offline-first local database
**Schema Versions**: Incremental migrations (v1 → v2 → v3...)
**Typical Usage**: "Dexie stores transactions offline"
**Related Spec**: SYNC-ENGINE.md Section 6

### Service Worker

Background script enabling PWA features: offline caching, push notifications, background sync. Installed on first visit.

**File**: `public/sw.js`
**Strategy**: Network-first for data, cache-first for assets
**Typical Usage**: "Service worker caches app for offline use"
**Related Spec**: DEPLOYMENT.md Section 5

---

## Database Terms

### DATE vs TIMESTAMPTZ

**Decision**: Use `DATE` for transaction dates, not `TIMESTAMPTZ`. User's local date is canonical. Avoids timezone conversion issues (e.g., expense on Dec 31 showing as Jan 1).

**Rationale**: Transactions are date-specific, not timestamp-specific
**Database Column**: `date DATE NOT NULL`
**Typical Usage**: "Transaction on 2024-01-15 (no timezone)"
**Related Decision**: DATABASE.md Section 10.2

### Compound Index

Multiple-column database index for efficient queries. Preferred over materialized views per Decision #64 for simplicity and real-time accuracy.

**Example**: `CREATE INDEX idx_tx_household_date ON transactions(household_id, date DESC)`
**Purpose**: Optimize frequent query patterns
**Typical Usage**: "Compound index speeds up transaction list"
**Related Decision**: ARCHITECTURE.md Section 6.3

### GIN Index

PostgreSQL Generalized Inverted Index, used for array and JSONB columns. Required for efficient array membership queries.

**Example**: `CREATE INDEX idx_tagged_users ON transactions USING GIN (tagged_user_ids)`
**Purpose**: Fast array element queries
**Typical Usage**: "GIN index finds @mentioned transactions"
**Related Spec**: DATABASE.md Section 1.1

---

## Currency Terms

### PHP (Philippine Peso)

The only supported currency for MVP. Symbol: ₱. Max value: 9,999,999.99 PHP (999,999,999 cents).

**Currency Code**: `PHP` (ISO 4217)
**Format**: `₱1,500.50` (symbol + grouped decimals)
**Typical Usage**: "Format 150050 cents as ₱1,500.50"
**Related Spec**: DATABASE.md Section 8

### Cents Storage

Monetary values stored as **positive integers** in cents to avoid floating-point precision errors. Never store negative amounts; use transaction type instead.

**Database Type**: `BIGINT`
**Range**: 0 to 999,999,999 (9,999,999.99 PHP)
**Typical Usage**: "Store 1,500.50 as 150050"
**Related Spec**: DATABASE.md Section 8

### Currency Utilities

Functions for converting between cents (integer) and display format (₱1,500.50):

- `formatPHP(cents: number): string` - Convert 150050 to "₱1,500.50"
- `parsePHP(input: string | number): number` - Convert "1,500.50" to 150050

**Location**: `@/utils/currency`
**Typical Usage**: "Format amount for display"
**Related Spec**: DATABASE.md Section 8.3

---

## Authentication Terms

### JWT (JSON Web Token)

Supabase authentication token stored in localStorage. Auto-refreshes before expiration. Sent in Authorization header for API requests.

**Storage**: `localStorage` (key: `supabase.auth.token`)
**Lifetime**: 1 hour (auto-refreshes)
**Typical Usage**: "JWT authorizes API requests"
**Related Spec**: ARCHITECTURE.md Section 3.1

### Session

User's authenticated state managed by Supabase Auth. Persisted across page reloads via localStorage. No server-side session storage.

**Management**: Client-side via Supabase client
**Persistence**: localStorage with auto-refresh
**Typical Usage**: "Session expires after 30 days"
**Related Spec**: ARCHITECTURE.md Section 3.1

### Profile

User metadata stored in `profiles` table. Contains household membership, preferences, and settings. Created automatically on signup via trigger.

**Database Table**: `profiles`
**Key Columns**: `id` (matches auth.users), `household_id`, `display_name`
**Typical Usage**: "Profile links user to household"
**Related Spec**: DATABASE.md Section 4

---

## Deployment Terms

### Cloudflare Pages

Static site hosting for the React frontend. Serves assets via global CDN with edge caching.

**URL**: `https://household-hub.pages.dev`
**Build Command**: `npm run build`
**Typical Usage**: "Deploy frontend to Cloudflare Pages"
**Related Spec**: DEPLOYMENT.md Section 2

### Cloudflare Workers

Serverless functions for API endpoints, file uploads, and background jobs. Runs on Cloudflare edge network.

**Use Cases**: File uploads to R2, scheduled cleanups, push notifications
**Typical Usage**: "Worker handles receipt upload to R2"
**Related Spec**: DEPLOYMENT.md Section 3

### Supabase

Backend-as-a-service providing PostgreSQL database, authentication, realtime subscriptions, and storage. Used for all structured data.

**Components**: Database (PostgreSQL), Auth, Realtime, Storage
**Region**: Singapore (closest to Philippines)
**Typical Usage**: "Supabase stores all transactions"
**Related Spec**: ARCHITECTURE.md Section 1

### R2 Storage

Cloudflare object storage for files (receipts, backups). S3-compatible API. Cheaper egress than S3.

**Purpose**: Receipt attachments, backup exports
**Access**: Signed URLs via Cloudflare Workers
**Typical Usage**: "Store receipt image in R2"
**Related Spec**: DEPLOYMENT.md Section 4.2

---

## Testing Terms

### Playwright

End-to-end testing framework for browser automation. Tests user workflows across Chrome, Firefox, Safari.

**Config**: `playwright.config.ts`
**Test Location**: `tests/e2e/`
**Typical Usage**: "Playwright tests offline sync flow"
**Related Spec**: TESTING-PLAN.md Section 3

### Vitest

Unit testing framework for TypeScript/JavaScript. Fast, with built-in TypeScript support and Vite integration.

**Config**: `vite.config.ts`
**Test Location**: `tests/unit/`
**Typical Usage**: "Vitest tests currency formatting"
**Related Spec**: TESTING-PLAN.md Section 1

### Axe Accessibility

Automated accessibility testing tool for WCAG compliance. Integrated with Playwright via @axe-core/playwright.

**Pass Criteria**: Lighthouse ≥ 95, Axe violations = 0
**Test Location**: `tests/accessibility/`
**Typical Usage**: "Axe scan finds no violations"
**Related Spec**: TESTING-PLAN.md Section 7

---

## Feature Terms

### Category System

Hierarchical organization for transactions. Two levels: parent category (e.g., "Food") and subcategory (e.g., "Groceries"). Used for budgeting and reporting.

**Database Table**: `categories`
**Structure**: Parent → Children (via `parent_id`)
**Typical Usage**: "Food > Groceries > Vegetables"
**Related Feature**: FEATURES.md Section 5

### Account

A financial account (bank, cash, credit card). Tracks balance based on transaction history. Supports multiple account types.

**Database Table**: `accounts`
**Types**: `checking`, `savings`, `credit`, `cash`
**Typical Usage**: "BDO Checking Account"
**Related Feature**: FEATURES.md Section 4

### Report

Pre-built or custom financial analysis view. Examples: Income Statement, Cash Flow, Budget Variance, Category Analysis.

**Types**: Standard (built-in) and Custom (user-defined)
**Date Range**: User-selectable period
**Typical Usage**: "Generate monthly income statement"
**Related Feature**: FEATURES.md Section 7

### Export

Feature to download transaction data in CSV, Excel (XLSX), or PDF format. Supports custom date ranges and filters.

**Formats**: CSV, XLSX, PDF
**Guarantee**: Round-trip integrity (export → import)
**Typical Usage**: "Export January transactions as CSV"
**Related Feature**: FEATURES.md Section 6.2

---

## UI/UX Terms

### PWA (Progressive Web App)

Web application installable to home screen with native-like features (offline, push notifications, app shortcuts).

**Requirements**: Service worker, manifest.json, HTTPS
**Install**: "Add to Home Screen" browser prompt
**Typical Usage**: "Install PWA to home screen"
**Related Feature**: FEATURES.md Section 10

### Virtual Scrolling

Performance technique rendering only visible list items. Enables smooth scrolling through 10,000+ transactions.

**Library**: TanStack Virtual (React)
**Performance Target**: 60 FPS with 10k items
**Typical Usage**: "Virtual scroll handles large transaction list"
**Related Spec**: TESTING-PLAN.md Section 5

### Toast Notification

Temporary, non-blocking message shown after user actions. Auto-dismisses after 3-5 seconds.

**Types**: Success, Error, Warning, Info
**Position**: Bottom-right corner
**Typical Usage**: "Show toast: Transaction saved"
**Related Pattern**: UI feedback for CRUD operations

### Skeleton Loader

Placeholder UI shown while content loads. Improves perceived performance by showing structure immediately.

**Appearance**: Gray animated rectangles matching content layout
**Duration**: Until data loads
**Typical Usage**: "Show skeleton while loading transactions"
**Related Pattern**: Loading states

---

## Common Acronyms

- **CRUD**: Create, Read, Update, Delete (basic data operations)
- **LWW**: Last-Write-Wins (conflict resolution strategy)
- **RLS**: Row Level Security (PostgreSQL feature)
- **JWT**: JSON Web Token (authentication token)
- **UUID**: Universally Unique Identifier (ID format)
- **PHP**: Philippine Peso (currency)
- **MVP**: Minimum Viable Product (first release)
- **SPA**: Single Page Application (React app type)
- **CDN**: Content Delivery Network (edge caching)
- **E2E**: End-to-End (testing type)
- **WCAG**: Web Content Accessibility Guidelines
- **PWA**: Progressive Web App
- **IndexedDB**: Browser database for offline storage
- **JSONB**: PostgreSQL JSON binary format
- **GIN**: Generalized Inverted Index (PostgreSQL)

---

## Canonical Term Decisions

Use these terms consistently across all documentation and code:

| ✅ Use This    | ❌ Not This                          |
| -------------- | ------------------------------------ |
| Budget Target  | Budget Balance, Envelope, Allocation |
| Cents          | Centavos, Pennies                    |
| Transaction    | Entry, Record, Line Item             |
| Transfer       | Move, Shift, Reallocate              |
| Household      | Family, Group, Team                  |
| Tagged Users   | Mentioned Users, @mentions           |
| Device ID      | Client ID, Browser ID                |
| Sync Queue     | Pending Queue, Upload Queue          |
| Vector Clock   | Version Vector, Logical Clock        |
| Event Sourcing | Event Log, Audit Trail               |
| Reconciliation | Matching, Verification               |
| Cleared        | Reconciled, Confirmed                |
| Pending        | Uncleared, Unconfirmed               |

---

## Context-Specific Usage

### In Code

- Use precise technical terms: `vector_clock`, `transfer_group_id`, `amount_cents`
- Follow TypeScript naming: `camelCase` for variables, `PascalCase` for types
- Database columns: `snake_case` (PostgreSQL convention)

### In Documentation

- Use full terms on first mention: "Row Level Security (RLS)"
- Prefer clarity over brevity: "transaction date" vs "tx date"
- Include examples for ambiguous terms

### In UI

- Use user-friendly language: "Balance" instead of "Account Balance Calculated"
- Avoid jargon: "Offline" instead of "Network Disconnected State"
- Keep it conversational: "Sync pending" instead of "Synchronization queue populated"

---

## Related Documentation

- **FEATURES.md**: Feature specifications with user-facing terms
- **DATABASE.md**: Database schema with technical terms
- **ARCHITECTURE.md**: System design concepts and patterns
- **SYNC-ENGINE.md**: Sync terminology and algorithms
- **RLS-POLICIES.md**: Security and access control terms
