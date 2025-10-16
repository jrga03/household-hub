# Design Decisions

## Overview

This document captures all key decisions made during the planning of Household Hub, providing rationale and context for future reference.

## Table of Contents

### Core Categories

- [Architecture Decisions](#architecture-decisions) - State management, routing, offline storage
- [Data Model Decisions](#data-model-decisions) - Transaction structure, budgets, accounts
- [Technical Decisions](#technical-decisions) - Formulas, snapshots, sync, PWA
- [UI/UX Decisions](#ui-ux-decisions) - Views, colors, notifications
- [Data Management Decisions](#data-management-decisions) - Export, backup, audit trails
- [Project Management Decisions](#project-management-decisions) - Timeline, documentation
- [Business Decisions](#business-decisions) - User model, free tier strategy
- [Future Considerations](#future-considerations) - Scalability, priorities
- [Security Decisions](#security-decisions) - Authentication, data access
- [Performance Decisions](#performance-decisions) - Caching, pagination, bundles
- [Maintenance Decisions](#maintenance-decisions) - Updates, monitoring
- [Architectural Decisions (Post-Feedback)](#architectural-decisions-post-feedback) - Transfers, multi-household, event sourcing

### Quick Reference (Key Decisions)

- #12, #79: [Budget System](#12-budget-system-clarified) - Reference targets only
- #52, #75: [Device Identification](#75-device-identification-strategy-hybrid) - Hybrid approach
- #62: [Event Sourcing](#62-event-sourcing-timing) - From Phase A
- #60: [Transfer Representation](#60-transfer-representation) - Linked pairs
- #63: [Materialized Views](#63-materialized-views-strategy) - Skip for MVP
- #69: [Backup Encryption](#69-backup-encryption-strategy) - Auth-derived keys
- #77: [Conflict Resolution](#77-conflict-resolution-matrix) - Deterministic field-level LWW

---

## Architecture Decisions

### 1. Single App vs Monorepo

**Decision**: Single app architecture  
**Rationale**:

- Single household dashboard = single app scope
- Monorepo overhead isn't worth it until you have truly separate apps/services
- Can refactor to monorepo later if needed
- KISS principle applies

### 2. State Management

**Decision**: Zustand + TanStack Query  
**Rationale**:

- TanStack Query handles server state beautifully (most of your data)
- Zustand for lightweight client state (UI preferences, filters, etc.)
- Avoided Redux as it's overkill for this project
- Three-layer state architecture for offline support

### 3. Router Choice

**Decision**: TanStack Router ONLY (removed React Router)
**Rationale**:

- Better TypeScript support
- Built-in search params state management (crucial for dashboard filters)
- Lighter weight (~12KB vs ~40KB)
- Pairs perfectly with TanStack Query
- Type-safe routing prevents bugs
  **Note**: Do NOT install react-router-dom

### 4. Offline Storage

**Decision**: IndexedDB via Dexie.js (not localStorage)  
**Rationale**:

- localStorage has 5-10MB limit, insufficient for 100+ transactions/month
- IndexedDB offers unlimited storage
- Dexie provides excellent TypeScript support and React hooks
- Better performance for large datasets

### 5. Database & Backend

**Decision**: Supabase (PostgreSQL + Auth + Realtime)  
**Rationale**:

- Free tier sufficient for years (500MB database)
- Built-in authentication
- Real-time subscriptions for multi-device sync
- Row-level security out of the box
- No need to maintain separate backend

### 6. Hosting

**Decision**: Cloudflare Pages + Cloudflare R2  
**Rationale**:

- Better than Netlify for PWAs
- Unlimited bandwidth on free tier
- R2 provides 10GB free storage for snapshots
- Global CDN included
- Workers for edge computing

### 7. Sync Strategy

**Decision**: Event Sourcing with CRDT-style merge
**Rationale**:

- No data loss ever
- Complete audit trail
- Natural conflict resolution
- Handles offline perfectly
- Can replay events to any point
  **Note**: See Decision #62 for phased implementation approach (simplified in Phase A, vector clocks in Phase B)

## Data Model Decisions

### 8. Transaction Status Field

**Decision**: Simplified to 'cleared' and 'pending' status
**Context**: Simplifies the original "Paid/Not Paid/OK" system
**Implementation**: Direct status field in database
**Rationale**: Clearer semantics and easier to understand

### 9. Transaction Amount Storage

**Decision**: Positive amounts with explicit type field
**Implementation**: amount_cents (BIGINT) + type ('income'/'expense')
**Context**: Clearer than signed amounts for UX
**Benefits**: No confusion about negative numbers, clean data model
**Rationale**: Database invariant prevents sign errors, all docs must align on this

### 10. Account Types

**Decision**: Support both joint and personal accounts  
**Rationale**:

- Joint management of household finances
- Personal expense tracking for individual use
- Flexibility without complexity

### 11. Category Hierarchy

**Decision**: Two-level hierarchy (Parent Category → Category)  
**Rationale**:

- Matches existing Google Sheets structure
- Parent categories for budget tracking and color coding
- Categories for specific expense classification
- Admin-editable, not hard-coded

### 12. Budget System (Clarified)

**Decision**: Monthly budgets as reference targets only
**Date**: 2024-10-14 (Clarified 2024-10-15)
**Context**: Budgets are spending goals, not actual account balances
**Features**:

- Reference targets for spending categories
- No mathematical balance rollover (transactions are source of truth)
- Variance tracking against targets
- Alert system for threshold breaches
- Previous month's targets can be copied forward
  **Rationale**: Simplifies system - budgets guide spending but don't affect actual balances

## Technical Decisions

### 13. Formula Migration

**Decision**: Hybrid approach
**Details**:

- Database: Core aggregations using indexes (NOT materialized views per Decision #63)
- Frontend: Dynamic filters and custom calculations for flexibility
- Edge Functions: Complex reports needing heavy computation
  **Note**: Originally planned materialized views, but Decision #63 uses indexes instead for MVP simplicity

### 14. Snapshot System

**Decision**: 5-minute auto-snapshots during editing with smart retention  
**Retention Policy**:

- Real-time: 5-min during active editing
- Recent: Hourly for last 24 hours
- Week: Daily for 1-7 days old
- Month: Weekly for 8-30 days old
- Archive: Monthly for 30+ days old

### 15. Compression

**Decision**: Brotli via WASM in Web Workers  
**Rationale**:

- Best compression ratio for JSON data (70-90% reduction)
- Client-side processing preserves privacy
- Web Workers prevent UI blocking
- WASM for performance

### 16. Data Migration

**Decision**: One-time migration from CSV/JSON export  
**Rationale**:

- Clean break from Google Sheets
- No ongoing sync complexity
- Fresh start with new system
- Preserve all historical data structure

### 17. Historical Data

**Decision**: Start fresh (not migrating old data)  
**Context**: User wants to start fresh rather than import years of history  
**Note**: Migration tools still built for future use or others

### 18. Multi-Device Sync

**Decision**: Event sourcing with vector clocks  
**Benefits**:

- Handles concurrent edits
- No data loss
- Natural audit trail
- Conflict resolution without user intervention

### 19. PWA Features

**Decision**: Full PWA with offline support and push notifications  
**Includes**:

- Installable app
- Offline functionality
- Push notifications for all mentioned use cases
- Background sync
- Share target API

### 20. Encryption

**Decision**: No encryption for financial tracker  
**Context**: Not needed for financial data in this use case  
**Future**: May implement for insurance documents module

## UI/UX Decisions

### 21. Views to Implement

**Decision**: Replicate ALL Google Sheets views  
**List**:

- Dump View (all transactions)
- Filtered by Month
- Filtered by Category
- Filtered by Account
- Filtered by "To Pay"
- Custom totals
- Summaries

### 22. Color Coding

**Decision**: Extract from current sheet but make editable  
**Implementation**:

- Store colors in database per category
- Admin settings to modify
- Use parent category colors for visual grouping

### 23. Mobile vs Desktop

**Decision**: Responsive design with different interaction patterns  
**Details**:

- Mobile: Primarily viewing, touch-optimized
- Desktop: Full editing capabilities
- Both: Core functionality available

### 24. Notification Types

**Decision**: Implement all mentioned notification types  
**Includes**:

- Budget alerts (threshold-based)
- Bill due dates from "To Pay" items
- User mentions/tags in transactions
- Daily/weekly summaries

## Data Management Decisions

### 25. Export Formats

**Decision**: Support Excel and CSV export  
**Rationale**:

- User specifically requested these formats
- Maintains compatibility with existing workflows
- Easy data portability

### 26. Backup Strategy

**Decision**: Multi-tier backup approach  
**Implementation**:

- Cloudflare R2 for snapshot storage
- Client-side compression before upload
- Incremental snapshots (deltas) with guaranteed rollback
- Free tier optimization

### 27. Audit Trail

**Decision**: Complete event logging for all changes  
**Implementation**:

- Separate transaction_events table
- Tracks CREATE, UPDATE, DELETE operations
- Includes user, timestamp, device fingerprint
- Never delete audit records

### 28. Data Integrity

**Decision**: Multiple verification layers
**Includes**:

- Checksums for snapshots
- Vector clocks for ordering
- Indexed queries for calculations (not materialized views per Decision #63)
- Regular integrity checks

## Project Management Decisions

### 29. Development Approach

**Decision**: 15-day sprint plan  
**Phases**:

1. Foundation (Days 1-3)
2. Transaction Core (Days 4-6)
3. Advanced Features (Days 7-9)
4. PWA & Mobile (Days 10-12)
5. Polish & Launch (Days 13-15)

### 30. Documentation First

**Decision**: Create comprehensive docs before implementation  
**Rationale**:

- Clear roadmap for development
- Decisions captured for future reference
- Easier onboarding if help needed
- Reduces rework

### 31. Focus Area

**Decision**: Financial tracker first, modular expansion later  
**Order**:

1. Financial tracking (Phase 1)
2. Document management (Phase 2)
3. Home management features (Phase 3)

### 32. Testing Strategy

**Decision**: Balanced testing approach  
**Includes**:

- Unit tests for critical functions
- Integration tests for sync
- E2E tests for financial calculations
- Manual testing for UX

## Business Decisions

### 33. User Model

**Decision**: Multi-user with similar permissions (no RBAC)  
**Context**: "logins have similar permissions"  
**Implementation**: Simple user model with joint/personal distinction

### 34. Free Tier Commitment

**Decision**: Strict adherence to free tier limits  
**Strategy**:

- Optimize data storage
- Client-side compression
- Efficient sync strategies
- Monitor usage closely

### 35. Import Strategy

**Decision**: One-time import tool, not ongoing sync  
**Rationale**:

- Cleaner architecture
- No sync complexity
- Clear migration point
- Reduces maintenance

## Future Considerations

### 36. Scalability Path

**Decision**: Design for growth but implement for current needs  
**Path**:

1. Single household (current)
2. Database optimization as needed
3. Move to paid tier if required
4. Self-hosting option available

### 37. Feature Priorities

**Decision**: Core financial features complete before expansion
**Must Have**:

- Transaction management
- Budget target tracking (not rollover - see Decision #79)
- Multi-user support
- Offline functionality
- Data import/export

**Nice to Have** (Phase 2+):

- Insurance repository
- Maintenance tracking
- Inventory management
- Advanced analytics

### 38. Integration Strategy

**Decision**: No external API integrations initially  
**Context**:

- No bank API connections
- No calendar integration
- No email receipt parsing
- Keep it simple and secure

## Security Decisions

### 39. Authentication

**Decision**: Supabase Auth with email/password  
**Future**: May add 2FA support

### 40. Data Access

**Decision**: Row-level security with clear policies  
**Rules**:

- Joint data accessible by all authenticated users
- Personal data scoped to user_id
- Audit trail for all changes

## Performance Decisions

### 41. Caching Strategy

**Decision**: Multi-level caching
**Implementation**:

- TanStack Query: 5-min stale time
- Service Worker: Network-first for API
- IndexedDB: Persistent local storage
- Indexed queries: Database aggregations (not materialized views per Decision #63)

### 42. Pagination

**Decision**: Implement for all large datasets  
**Thresholds**:

- Transactions: 50 per page
- Virtual scrolling for 1000+ items
- Lazy loading for charts

### 43. Bundle Size

**Decision**: Code splitting and lazy loading  
**Strategy**:

- Route-based splitting
- Lazy load heavy components
- Dynamic imports for charts
- Minimize initial bundle

## Maintenance Decisions

### 44. Update Strategy

**Decision**: Progressive enhancement  
**Approach**:

- Auto-update service worker
- Database migrations via CI/CD
- Feature flags for gradual rollout
- Backward compatibility maintained

### 45. Monitoring

**Decision**: Comprehensive observability
**Tools**:

- Sentry for error tracking (free tier)
- Cloudflare Analytics (built-in)
- Custom performance metrics
- Health check endpoints

### 46. Toast Library Choice

**Decision**: Sonner (removed react-hot-toast)
**Rationale**:

- Smaller bundle (3KB vs 14KB)
- Built on Radix UI primitives
- Better accessibility out of the box
- Cleaner API
- Works well with shadcn/ui

### 47. Vector Clock Scope

**Decision**: Per-entity vector clocks
**Rationale**:

- Smaller state footprint
- Simpler conflict resolution
- Better performance at scale
- Easier to reason about conflicts
  **Implementation**: Each entity tracks its own vector clock

### 48. R2 Upload Architecture

**Decision**: Cloudflare Worker as upload proxy
**Rationale**:

- Can't expose R2 credentials in client
- Better latency (runs at edge)
- Native R2 integration
- Consistent with existing CF infrastructure
  **Flow**: Client → CF Worker (auth check) → Signed URL → R2

### 49. E2E Testing Framework

**Decision**: Playwright
**Rationale**:

- Better cross-browser support
- Faster execution
- Better for PWA testing
- Native mobile browser testing capabilities

### 50. Development Phasing

**Decision**: Three-phase approach instead of continuous 15-day
**Phases**:

- Phase A (Days 1-7): Core CRUD, basic offline, manual export
- Phase B (Days 8-12): Event sourcing, R2 backups, proper sync
- Phase C (Days 13-15): Notifications, analytics, polish
  **Rationale**: Reduces risk, ensures working MVP early

### 51. Currency Choice

**Decision**: PHP (Philippine Peso) as default
**Context**: User requirement for Philippine household
**Implementation**:

- All amounts in cents to avoid decimal issues
- currency_code field locked to 'PHP' for MVP
- Future: Can add multi-currency support

### 52. Device Identification (Implemented)

**Decision**: Hybrid approach - FingerprintJS with fallbacks + devices table registration
**Date**: 2024-10-14 (Updated 2024-10-15)
**Context**: User clears browser cache on close but privacy not a concern
**Implementation**:

- Primary: Check IndexedDB for stored device ID
- Secondary: Check localStorage as backup
- Tertiary: Use FingerprintJS as final fallback
- Always store ID in both IndexedDB and localStorage
- Register device in `devices` table (Decision #82) on first use
- Update `last_seen` timestamp on each app load
  **Rationale**:
- Provides resilience against cache clearing
- FingerprintJS fallback ensures continuity
- No privacy concerns for private household app
- Device registration enables multi-device management from day one
  **Note**: See Decision #75 for full hybrid implementation details. See DATABASE.md for `devices` table schema.
  **Related**: Decision #82 (devices table promotion to MVP)

### 53. Household Model

**Decision**: Single household, all users belong to it
**Context**: App serves one household, not multiple
**Implementation**:

- No complex household table
- All users implicitly in same household
- Visibility is 'household' or 'personal' only

### 54. Category Structure

**Decision**: Hierarchical with parent/child only
**Implementation**:

- Parent categories for grouping/reports
- Child categories for transaction assignment
- Users only select child categories when creating transactions
  **Rationale**: Matches existing spreadsheet mental model

### 55. List Virtualization

**Decision**: TanStack Virtual for transaction lists
**Rationale**:

- Handles 1000+ transactions smoothly
- Better performance than pagination alone
- Seamless scrolling experience
- Works well with TanStack Table

### 56. Theme System

**Decision**: Both system preference + manual toggle with persistence
**Implementation**:

- Detect system preference by default
- Allow manual override
- Persist choice in localStorage and DB
  **Rationale**: Best user experience

### 57. CSV Import Strategy

**Decision**: Reject entire import on error with clear feedback
**Rationale**:

- Prevents partial/corrupt data
- Clear error messages with row numbers
- User can fix and retry
  **Alternative considered**: Best-effort with warnings (rejected for data integrity)

### 58. Push Notification Infrastructure

**Decision**: Cloudflare Worker for Web Push
**Rationale**:

- Free tier sufficient (100k req/day)
- Consistent with R2 architecture
- Better edge performance
  **Note**: iOS Safari limitations documented, email fallback for unsupported

### 59. Data Generation for Testing

**Decision**: Synthetic test data generator
**Rationale**:

- No privacy concerns
- Reproducible tests
- Can generate edge cases
  **Implementation**: Seed script with realistic patterns

## Architectural Decisions (Post-Feedback)

### 60. Transfer Representation

**Decision**: Implement as linked transaction pairs with transfer_group_id
**Date**: 2024-10-14
**Context**: Need clear way to represent money moving between accounts
**Options Considered**:

- Option A: Two linked transactions with transfer_group_id
- Option B: Special type='transfer' with from/to account fields
  **Rationale**: Option A works with existing schema, allows different dates/statuses per leg
  **Trade-offs**: More complex deletion logic, but more flexible
  **Implementation**: Add transfer_group_id UUID field to transactions table

### 61. Multi-Household Architecture

**Decision**: Build with household_id from start (hardcoded default)
**Date**: 2024-10-14
**Context**: Future-proof architecture without current complexity
**Rationale**: Prevents major refactoring later with minimal extra work now
**Implementation**: Add household_id to all core tables with default UUID
**Trade-offs**: Slight complexity now for major savings later

### 62. Event Sourcing Timing

**Decision**: Implement event sourcing from Phase A (simplified)
**Date**: 2024-10-14
**Context**: Migration from state-based to event-based is complex
**Options Considered**:

- Option A: Start simple (outbox + LWW), migrate later
- Option B: Event sourcing from start
  **Rationale**: Avoid painful migration by starting with events
  **Implementation**: Phase A with simple LWW, add vector clocks in Phase B
  **Trade-offs**: More initial complexity but no migration pain

### 63. Materialized Views Strategy

**Decision**: Skip materialized views, use indexes for MVP
**Date**: 2024-10-14
**Context**: Performance optimization for aggregations
**Rationale**: Indexes sufficient for < 100k transactions, simpler to maintain
**Implementation**: Create compound indexes on common query patterns
**Revisit**: When query performance degrades with large datasets

### 64. Background Sync Fallbacks

**Decision**: Progressive enhancement with manual fallbacks
**Date**: 2024-10-14
**Context**: Background Sync API has poor iOS Safari support
**Implementation**:

- Try Background Sync API where available
- Fall back to sync-on-focus/visibility
- Manual sync button always available
- Clear sync status indicators
  **Trade-offs**: More implementation work for better compatibility

### 65. JWT Verification in Workers

**Decision**: Full JWT verification in Cloudflare Workers
**Date**: 2024-10-14
**Context**: Security boundary for R2 access
**Implementation**:

- Fetch JWKS from Supabase
- Cache keys in KV for 24 hours
- Verify with jose library
- Check aud, exp, sub claims
  **Rationale**: Critical security requirement

### 66. Idempotency Strategy

**Decision**: Deterministic idempotency keys for all events
**Date**: 2024-10-14
**Context**: Prevent duplicate event processing
**Implementation**: Generate from deviceId-entityType-entityId-lamportClock
**Rationale**: Required for reliable distributed system

### 67. Vector Clock Compaction

**Decision**: Drop entries for devices inactive > 30 days
**Date**: 2024-10-14
**Context**: Vector clocks can grow unbounded
**Implementation**: Background job compacts old device entries
**Rationale**: Prevents metadata bloat

### 68. Conflict Resolution Policy

**Decision**: Deterministic automatic resolution
**Date**: 2024-10-14
**Context**: Users don't want manual conflict resolution
**Implementation**:

1. Higher Lamport clock wins
2. Tie-break with deviceId lexical order
3. Log conflicts for optional review
   **Rationale**: Predictable behavior builds trust

### 69. Backup Encryption Strategy

**Decision**: Auth-derived key encryption with future passphrase option
**Date**: 2025-10-14
**Context**: Need to encrypt backups at rest in R2 storage
**Options Considered**:

- Option A: Server-side encryption only
- Option B: User passphrase encryption
- Option C: Auth-derived key now, passphrase later
  **Rationale**: Option C balances security with usability. Auth-derived key provides automatic encryption without user friction
  **Implementation**:
- Use WebCrypto API for AES-GCM encryption
- Derive key from Supabase JWT claims
- Store key derivation params in backup metadata
  **Trade-offs**: Less secure than user passphrase but more convenient
  **Future**: Add optional passphrase-based encryption in Phase 2

### 70. Month Attribution for Budgets

**Decision**: UTC storage with local timezone display
**Date**: 2025-10-14
**Context**: Need consistent month boundaries for budgets and reporting
**Options Considered**:

- Option A: Always use UTC months
- Option B: User's local timezone months
- Option C: Household-configurable timezone
  **Rationale**: Store timestamps in UTC for consistency, but always display and calculate month boundaries in user's local timezone
  **Implementation**:
- Transaction dates stored as DATE type (user's local date is canonical)
- Audit timestamps (created_at/updated_at) stored as TIMESTAMPTZ in UTC
- Use profiles.timezone for display/calculation
- Month attribution uses user's timezone for boundaries
- Budget periods calculated in local timezone
  **Trade-offs**: Slight complexity in timezone handling for better UX
  **Note**: See DATABASE.md Section 10.2 for full DATE vs TIMESTAMPTZ rationale

### 71. Performance Budget Strategy

**Decision**: Progressive loading with core bundle <200KB
**Date**: 2025-10-14
**Context**: Need fast initial load on mobile networks
**Options Considered**:

- Option A: Strict 200KB total bundle
- Option B: 400KB with code-splitting
- Option C: Progressive enhancement
  **Rationale**: Core transaction functionality loads fast, enhanced features load on-demand
  **Implementation**:
- Core bundle: <200KB (transaction entry, basic views)
- Lazy chunks: Charts (~100KB), Analytics (~50KB), Admin (~75KB)
- Route-based code splitting
- Dynamic imports for heavy components
  **Performance Targets**:
- FCP: <1.5s on 3G
- TTI: <3.5s on 3G
- Lighthouse Score: >90

### 72. Observability Strategy

**Decision**: Structured logging with correlation IDs
**Date**: 2025-10-14
**Context**: Need to debug sync issues across devices
**Implementation**:

- Correlation ID format: `${deviceId}-${timestamp}-${random}`
- Structured log format with fields:
  - correlationId
  - deviceId
  - entityId
  - operation
  - syncState
  - errorCode
- Metrics to track:
  - Sync queue length
  - Time-to-consistency
  - Conflict rate
  - Retry count
    **Rationale**: Essential for debugging distributed sync issues

### 73. Browser Storage Quota Handling

**Decision**: Graceful degradation with user notification
**Date**: 2025-10-14
**Context**: IndexedDB has browser-specific quotas
**Implementation**:

- Monitor storage usage via navigator.storage.estimate()
- Warn at 80% capacity
- At 95%: Prune old cached data (keep last 3 months)
- If write fails: Show manual export option
- Fallback: Essential data only mode
  **Rationale**: Prevents data loss while maintaining functionality

### 74. Accessibility Testing Strategy

**Decision**: Automated a11y testing in CI
**Date**: 2025-10-14
**Context**: Ensure app is accessible to all users
**Implementation**:

- Add axe-core to Playwright tests
- Enforce WCAG 2.1 Level AA compliance
- Test keyboard navigation paths
- Verify screen reader compatibility
- Color contrast validation for category colors
  **Gates**:
- No critical a11y violations
- All interactive elements keyboard accessible
- Form labels and ARIA roles present
  **Rationale**: Accessibility is a requirement, not a feature

### 75. Device Identification Strategy (Hybrid)

**Decision**: Three-tier fallback system for device ID persistence
**Date**: 2024-10-15
**Context**: User clears browser cache on close, needs resilient device identification for sync
**Options Considered**:

- Option A: Pure FingerprintJS (privacy concerns, can change)
- Option B: Generated UUID only (lost on cache clear)
- Option C: Hybrid approach with fallbacks
  **Rationale**: Option C provides best resilience for cache-clearing scenario
  **Implementation**:

```typescript
// Try IndexedDB → localStorage → FingerprintJS
// Store in multiple places for redundancy
```

**Trade-offs**: Slightly more complex but ensures continuity

### 76. Event Compaction Policy

**Decision**: Snapshot after 100 events OR monthly, whichever comes first
**Date**: 2024-10-15
**Context**: Need explicit boundaries to prevent unbounded event log growth
**Options Considered**:

- Option A: Time-based only (monthly)
- Option B: Count-based only (every N events)
- Option C: Hybrid (count OR time)
  **Rationale**: Option C balances performance with predictable storage
  **Implementation**:
- Retain raw events for 90 days
- Keep snapshots indefinitely
- Compact old device entries from vector clocks after 30 days inactive
  **Trade-offs**: More complex compaction logic but optimal storage usage

### 77. Conflict Resolution Matrix

**Decision**: Deterministic field-level LWW with server canonical timestamps
**Date**: 2024-10-15
**Context**: Need clear rules for conflict resolution in distributed system
**Implementation**:

- Server assigns canonical timestamps
- Field-level Last-Write-Wins within entities
- DELETE operations always win over UPDATE
- Higher lamport clock wins, tie-break with device ID lexical order
  **Rationale**: Predictable, automatic resolution without user intervention
  **Trade-offs**: May lose some concurrent edits but maintains consistency

### 78. Household Timezone Strategy

**Decision**: Store timezone in profiles, use for all financial calculations (single-household assumption for MVP)
**Date**: 2024-10-15
**Context**: Need consistent month boundaries for budgets across household
**Options Considered**:

- Option A: User's individual timezone
- Option B: Household-level timezone
- Option C: Always UTC
  **Rationale**: Start with profile timezone, can add household_timezone field later
  **Implementation**:
- Store all timestamps as UTC in database
- Use profiles.timezone for display and month boundaries
- Budget periods calculated in user's local timezone
- **MVP Assumption**: Single household in Asia/Manila timezone (see DATABASE.md line 20-22)
- All household members expected to use same timezone for consistent budget calculations
  **Future**: Phase B will add households table with household_timezone field for multi-household support
  **Related**: Decision #83 (backup timing), DATABASE.md profiles table

### 79. Budget Reference Model

**Decision**: Budgets are spending targets only, no balance mathematics
**Date**: 2024-10-15
**Context**: User clarified budgets are reference values, not actual balances
**Implementation**:

- Budgets store target amounts per category per month
- No mathematical rollover or balance carryforward
- Actual vs budget always computed from transaction data
- Can copy previous month's targets as starting point
  **Rationale**: Simpler, clearer separation of concerns
  **Trade-offs**: Less sophisticated than envelope budgeting but matches user needs

### 80. Infinite Scroll Implementation

**Decision**: TanStack Virtual with React Query infinite queries
**Date**: 2024-10-15
**Context**: User prefers infinite scroll over pagination UI
**Implementation**:

```typescript
// Use useInfiniteQuery for data fetching
// Use useVirtualizer for DOM virtualization
// Load more when scrolling near bottom
// No visible pagination controls
```

**Rationale**: Better UX for continuous browsing of transactions
**Performance**: Virtual scrolling handles 10k+ items smoothly

### 81. Import Deduplication Strategy

**Decision**: Hash-based duplicate detection during CSV import
**Date**: 2024-10-15
**Context**: Prevent accidental duplicate imports from CSV/Excel files
**Implementation**:

```typescript
// Generate deterministic key: sha256(date|amount|description|account)
// Store as import_key field
// Check for duplicates, show UI for user decision
```

**Rationale**: Prevents data corruption from repeated imports
**User Control**: Show potential duplicates, let user decide action

### 82. Devices Table Promotion to MVP

**Decision**: Move devices table from Phase B to Phase A (MVP)
**Date**: 2024-10-15
**Context**: Feedback review highlighted multi-device support needed from day one to avoid painful migration
**Options Considered**:

- Option A: Keep devices table in Phase B (original plan)
- Option B: Promote to MVP-light with headless registration
- Option C: Hybrid - table in MVP, UI in Phase B
  **Rationale**: RLS policies already reference devices table (see RLS-POLICIES.md lines 286-329). Implementing now prevents:
- Future schema migration pain
- RLS policy refactoring
- Multi-device testing blockers in MVP
  **Implementation**:
- Add devices table to Phase A schema (DATABASE.md lines 43-68)
- Automatic device registration on app load (SYNC-ENGINE.md lines 1208-1281)
- RLS policies use devices.user_id for sync_queue access
- No UI management required in Phase A (can manually query table)
- Device management UI deferred to Phase B
  **Cost**: ~4 hours additional MVP work
  **Benefit**: Clean multi-device support, no migration needed
  **Related**:
- DATABASE.md - devices table schema
- RLS-POLICIES.md - devices table policies (lines 365-411)
- SYNC-ENGINE.md - device registration flow
- SECURITY.md - device identification security

### 83. Backup Timing Strategy

**Decision**: Defer automated R2 backups to Phase B; manual export only in Phase A
**Date**: 2024-10-15
**Context**: Feedback review highlighted risk of unencrypted financial data in cloud backups
**Options Considered**:

- Option A: Defer automated backups until encryption ready (chosen)
- Option B: Implement encryption now in Phase A
- Option C: Use server-side encryption only
  **Rationale**: Security-first approach. Encryption (Decision #69) specifies auth-derived keys, which requires:
- JWT-based key derivation (R2-BACKUP.md lines 559-640)
- Secure key management
- Recovery procedures
  Adding this to MVP would extend timeline by 1-2 days without significant user benefit
  **Implementation**:
- **Phase A**: Manual CSV/JSON export → user-controlled local backups
- **Phase B**: Automated R2 backups with client-side AES-GCM encryption
  **Trade-offs**:
- Con: No automated cloud backups in MVP
- Pro: No exposure risk of unencrypted financial data
- Pro: Users retain full control of backup schedule in Phase A
- Pro: Cleaner separation allows proper encryption implementation
  **User Impact**: Users can export data anytime via Settings → Export (MIGRATION.md covers implementation)
  **Related**:
- R2-BACKUP.md - Phase A/B distinction added at top
- SECURITY.md - Data exfiltration threats
- MIGRATION.md - Manual export functionality
- DECISIONS.md #69 - Backup encryption strategy

### 84. IndexedDB Data Retention on Logout

**Decision**: Prompt user before clearing IndexedDB data on logout
**Date**: 2025-01-15
**Context**: Feedback review identified gap in offline data handling when user logs out
**Options Considered**:

- Option A: Always clear IndexedDB on logout (secure but loses offline data)
- Option B: Keep encrypted IndexedDB (complex, requires encryption setup)
- Option C: Prompt user with export option (chosen)

**Rationale**: Balance security with user experience

- Users may have unsynced offline changes
- Automatic deletion causes data loss
- Prompt gives user control: "You have offline data. Export before logout?"

**Implementation** (Phased across chunks):

**Chunk 002 (Auth Flow)**: Basic logout without data check

```typescript
signOut: async () => {
  // TODO: Enhanced in chunk 036 with data retention check
  await supabase.auth.signOut();
  set({ user: null, session: null });
};
```

**Chunk 036 (CSV Export)**: Add logout data retention prompt

```typescript
async function handleLogout() {
  const hasOfflineData = await checkUnsyncedData(); // Requires chunk 023

  if (hasOfflineData) {
    const shouldExport = await confirm(
      "You have unsynced offline data. Export before logging out?"
    );

    if (shouldExport) {
      await exportToCSV(); // From chunk 036
    }
  }

  await clearIndexedDB();
  await supabase.auth.signOut();
}
```

**Rationale**: Logout data retention requires:

- Sync queue to check for unsynced data (chunk 023)
- CSV export functionality (chunk 036)
- Both dependencies not available in chunk 002

**Trade-offs**:

- Pro: Prevents accidental data loss
- Pro: User maintains control
- Con: Extra step in logout flow
- Con: User might ignore prompt (acceptable - their choice)

**Related**:

- IMPLEMENTATION-PLAN.md Day 3 - Auth flow initialization
- Chunk 002 - Basic auth flow
- Chunk 023 - Sync queue (enables unsynced data check)
- Chunk 036 - CSV export (full implementation of logout data retention)
- SYNC-ENGINE.md - Offline data management

### 85. Property-Based Testing Strategy

**Decision**: Run property-based sync tests nightly only, not on every PR
**Date**: 2025-01-15
**Context**: Feedback recommended property-based testing but warned of slow CI times
**Options Considered**:

- Option A: Run on every PR (thorough but slow ~5-10 min)
- Option B: Nightly on main branch + feature flag (chosen)
- Option C: Skip for MVP (risky for sync correctness)

**Rationale**: Property-based tests are valuable for sync convergence but too slow for PR feedback loop

**Implementation**:

```typescript
// vitest.config.ts
const runPropertyTests = process.env.RUN_PROPERTY_TESTS === "1";

export default defineConfig({
  test: {
    include: runPropertyTests
      ? ["**/*.test.ts"] // All tests including property-based
      : ["**/*.test.ts", "!**/*property*.test.ts"], // Exclude property tests
  },
});
```

**Schedule**:

- PR CI: Unit + integration + E2E (fast feedback ~3 min)
- Nightly on main: All tests including property-based (~15 min)
- Manual trigger: `RUN_PROPERTY_TESTS=1 npm test`

**Coverage**: Property tests verify:

1. Sync convergence regardless of event order (1000 runs)
2. Deterministic conflict resolution (1000 runs)
3. Transfer integrity across sync (500 runs)
4. No data loss under concurrent modifications (100 runs)

**Trade-offs**:

- Pro: Fast PR feedback loop maintained
- Pro: Still get thorough sync testing nightly
- Con: Sync bugs might not be caught until nightly run (acceptable - rare)

**Related**:

- TESTING-PLAN.md - Property-based testing section (lines 467-679)
- SYNC-ENGINE.md - Convergence guarantees
- .github/workflows/nightly-tests.yml (to be created)

### 86. Field-Level Merge Deferral

**Decision**: Defer field-level merge to Phase C or "when needed"
**Date**: 2025-01-15
**Context**: Feedback review recommended staged sync approach to reduce Phase B risk
**Previous**: Decision #77 originally specified field-level merge in Phase B

**Revised Phase B Scope**:

- ✅ Per-entity vector clocks
- ✅ Event compaction (100 events OR monthly)
- ✅ R2 backups with encryption
- ✅ CSV import
- ❌ Field-level merge (deferred to Phase C)

**Rationale**: Phase B is already complex with 4 major features

- Vector clocks + R2 + encryption + import = substantial work
- Field-level merge adds significant complexity
- Real multi-party edit conflicts rare in household finance app
- Record-level LWW sufficient for MVP and Phase B

**Implementation**:

- **Phase A**: Simple LWW with server timestamps
- **Phase B**: Vector clocks for conflict detection, still use LWW for resolution
- **Phase C**: Implement field-level merge if conflicts emerge in usage

**When to implement field-level merge**:

1. User reports losing edits due to LWW
2. Analytics show >5% conflict rate
3. Multi-user concurrent editing becomes common pattern

**Code Impact**: Field-level merge logic remains documented in SYNC-ENGINE.md lines 365-511 for future implementation, but not built in Phase B

**Trade-offs**:

- Pro: Simpler Phase B implementation (reduced risk)
- Pro: Focus on encryption and backups (higher user value)
- Con: Some edits might be overwritten by LWW (rare in practice)

**Related**:

- SYNC-ENGINE.md - Phase C implementation note added at line 367
- IMPLEMENTATION-PLAN.md - Days 8-9 scope adjusted
- Decision #77 - Original conflict resolution matrix (still valid for Phase C)

## Key Trade-offs Made

1. **Complexity vs Simplicity**: Chose simpler single-app architecture over microservices
2. **Features vs Timeline**: Focused on core features for 15-day timeline
3. **Perfect vs Practical**: Implemented practical offline sync over perfect CRDT
4. **Cost vs Convenience**: Optimized for free tier over paid conveniences
5. **Security vs Usability**: Balanced security with user experience

## Decisions NOT Made

These areas were discussed but left for future consideration:

1. Receipt OCR/scanning functionality
2. Bank API integration approach
3. Tax preparation features
4. Investment tracking details
5. Cryptocurrency support
6. AI-powered insights implementation

## Rationale Summary

All decisions were made with these principles in mind:

1. **User Needs First**: Based on actual Google Sheets usage
2. **Simplicity**: Avoid over-engineering
3. **Cost-Effective**: Stay within free tiers
4. **Future-Proof**: Extensible architecture
5. **Data Integrity**: Never lose user data
6. **Performance**: Responsive user experience
7. **Offline-First**: Work anywhere, sync later

## Decision Log Template

For future decisions, use this template:

```markdown
### [Decision Number]. [Decision Title]

**Decision**: [What was decided]  
**Date**: [When decided]  
**Context**: [Why this came up]  
**Options Considered**:

- Option A: [Description]
- Option B: [Description]
  **Rationale**: [Why this option was chosen]  
  **Trade-offs**: [What we gave up]  
  **Revisit**: [When to reconsider]
```

---

_This document represents the state of decisions as of the initial planning phase. As implementation proceeds, new decisions will be added and existing ones may be revisited based on learnings._
