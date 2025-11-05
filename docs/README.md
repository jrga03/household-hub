# Project Documentation (`/docs/`)

## Purpose

Central documentation hub for **Household Hub** - an offline-first Progressive Web App for household financial management. Contains architectural specifications, implementation plans, feature documentation, and user guides.

## Directory Structure

```
docs/
├── README.md                    # This file - Documentation navigation hub
├── CUSTOM-AGENTS.md            # Claude Code custom agent definitions
├── USER-GUIDE.md               # End-user application guide
├── features/                   # Feature-specific documentation
│   └── debts/                 # Debt tracking feature specs
│       ├── DEBTS.md
│       ├── DEBT-DECISIONS.md
│       ├── DEBT-VALIDATION.md
│       └── debt-implementation.md
└── initial plan/              # Architectural foundation documents
    ├── README.md              # Initial plan navigation
    ├── ARCHITECTURE.md        # System architecture overview
    ├── ARCHITECTURE-SUMMARY.md # Quick architecture reference
    ├── DATABASE.md            # Database schema & query patterns
    ├── SYNC-ENGINE.md         # Offline-first sync architecture
    ├── RLS-POLICIES.md        # Row-level security policies
    ├── DECISIONS.md           # Architectural decision log (ADR)
    ├── IMPLEMENTATION-PLAN.md # 15-day build timeline
    ├── FEATURES.md            # Feature list & priorities
    ├── TESTING-PLAN.md        # Testing strategy
    ├── DEPLOYMENT.md          # Deployment infrastructure
    ├── SECURITY.md            # Security considerations
    ├── PERFORMANCE-BUDGET.md  # Performance targets
    ├── PWA-MANIFEST.md        # Progressive Web App configuration
    ├── R2-BACKUP.md           # Backup strategy (Cloudflare R2)
    ├── SYNC-FALLBACKS.md      # Sync failure handling
    ├── MIGRATION.md           # Data migration patterns
    ├── GLOSSARY.md            # Technical terminology
    ├── QUICK-START.md         # Developer quick start guide
    └── DOCUMENTATION-RESTRUCTURE.md # Documentation organization plan
```

## Documentation Categories

### 1. Quick Reference

**For developers joining the project or needing quick answers:**

- **[CLAUDE.md](/CLAUDE.md)** - Project quick reference (root directory)
  - Tech stack overview
  - Key commands
  - Architecture principles
  - Common development tasks

- **[initial plan/QUICK-START.md](initial%20plan/QUICK-START.md)** - Developer onboarding
  - Environment setup
  - Local development workflow
  - Database setup
  - Common issues

- **[initial plan/GLOSSARY.md](initial%20plan/GLOSSARY.md)** - Technical terminology
  - Event sourcing terms
  - Sync engine concepts
  - Database patterns

### 2. Architecture & Design

**For understanding system design and technical decisions:**

- **[initial plan/ARCHITECTURE.md](initial%20plan/ARCHITECTURE.md)** - Comprehensive architecture
  - Three-layer state model (Zustand → IndexedDB → Supabase)
  - Event sourcing implementation
  - Offline-first patterns
  - Sync conflict resolution

- **[initial plan/ARCHITECTURE-SUMMARY.md](initial%20plan/ARCHITECTURE-SUMMARY.md)** - Quick overview
  - High-level system diagram
  - Key components
  - Data flow

- **[initial plan/DECISIONS.md](initial%20plan/DECISIONS.md)** - Architectural Decision Records
  - 83+ documented decisions
  - Rationale for major choices
  - Trade-offs and alternatives considered
  - **Critical reading** for understanding "why" behind implementation

- **[initial plan/SYNC-ENGINE.md](initial%20plan/SYNC-ENGINE.md)** - Sync architecture
  - Event sourcing patterns
  - Idempotency keys
  - Vector clock conflict resolution
  - Retry strategies

### 3. Database & Backend

**For database schema, queries, and backend logic:**

- **[initial plan/DATABASE.md](initial%20plan/DATABASE.md)** - **Essential reading**
  - Complete schema (8 core tables)
  - Currency handling (PHP cents pattern)
  - Transfer representation (paired transactions)
  - Query patterns with indexes
  - **Lines 1005-1160:** Currency specification
  - **Lines 441-501:** Transfer exclusion patterns

- **[initial plan/RLS-POLICIES.md](initial%20plan/RLS-POLICIES.md)** - Security policies
  - Row-level security rules
  - Household vs personal data access
  - Policy definitions for all tables

- **[initial plan/MIGRATION.md](initial%20plan/MIGRATION.md)** - Data migration
  - Migration patterns
  - Version upgrade paths
  - Data transformation scripts

### 4. Implementation & Planning

**For understanding project timeline and deliverables:**

- **[initial plan/IMPLEMENTATION-PLAN.md](initial%20plan/IMPLEMENTATION-PLAN.md)** - 15-day timeline
  - Phase A (Days 1-7): Core MVP
  - Phase B (Days 8-12): Enhanced Sync
  - Phase C (Days 13-15): PWA & Polish
  - Daily deliverables

- **[initial plan/FEATURES.md](initial%20plan/FEATURES.md)** - Feature catalog
  - MVP features (Phase A)
  - Enhanced features (Phase B)
  - Polish features (Phase C)
  - Future roadmap

- **[features/README.md](features/README.md)** - Feature-specific documentation hub
  - Links to detailed feature specs
  - Implementation guides

### 5. Testing & Quality

**For testing strategy and quality assurance:**

- **[initial plan/TESTING-PLAN.md](initial%20plan/TESTING-PLAN.md)** - Testing strategy
  - Unit test patterns
  - E2E test scenarios
  - Performance testing
  - Accessibility testing (WCAG 2.1 AA)

- **[initial plan/PERFORMANCE-BUDGET.md](initial%20plan/PERFORMANCE-BUDGET.md)** - Performance targets
  - Bundle size budgets
  - Load time targets
  - Lighthouse score goals

### 6. Deployment & Operations

**For deployment infrastructure and operational concerns:**

- **[initial plan/DEPLOYMENT.md](initial%20plan/DEPLOYMENT.md)** - Deployment strategy
  - Cloudflare Pages setup
  - Supabase configuration
  - Environment variables
  - CI/CD pipeline

- **[initial plan/R2-BACKUP.md](initial%20plan/R2-BACKUP.md)** - Backup strategy (Phase B)
  - Cloudflare R2 integration
  - Automated backups
  - Encryption approach
  - Restoration process

- **[initial plan/SECURITY.md](initial%20plan/SECURITY.md)** - Security considerations
  - Authentication flow
  - Data encryption
  - RLS enforcement
  - Attack surface analysis

- **[initial plan/SYNC-FALLBACKS.md](initial%20plan/SYNC-FALLBACKS.md)** - Failure handling
  - Network error recovery
  - Conflict resolution edge cases
  - Degraded mode behavior

### 7. PWA & Frontend

**For Progressive Web App setup and frontend architecture:**

- **[initial plan/PWA-MANIFEST.md](initial%20plan/PWA-MANIFEST.md)** - PWA configuration
  - Manifest file setup
  - Service worker architecture
  - Push notifications
  - Icon generation

### 8. User-Facing Documentation

**For end users and feature documentation:**

- **[USER-GUIDE.md](USER-GUIDE.md)** - End-user application guide
  - How to use core features
  - Common workflows
  - Tips and best practices

- **[features/debts/](features/debts/)** - Debt tracking feature
  - DEBTS.md - Feature overview
  - DEBT-DECISIONS.md - Design decisions
  - DEBT-VALIDATION.md - Validation rules
  - debt-implementation.md - Implementation guide

### 9. Development Tools

**For development workflow and tooling:**

- **[CUSTOM-AGENTS.md](CUSTOM-AGENTS.md)** - Claude Code agent definitions
  - Custom agent specifications
  - Agent usage patterns
  - Integration with Claude Code

- **[initial plan/DOCUMENTATION-RESTRUCTURE.md](initial%20plan/DOCUMENTATION-RESTRUCTURE.md)** - Documentation organization
  - Restructuring plan
  - File organization principles

## Key Documents for Common Tasks

### Starting Development

1. **[CLAUDE.md](/CLAUDE.md)** - Quick reference
2. **[initial plan/QUICK-START.md](initial%20plan/QUICK-START.md)** - Environment setup
3. **[initial plan/DATABASE.md](initial%20plan/DATABASE.md)** - Schema reference

### Understanding Architecture

1. **[initial plan/ARCHITECTURE-SUMMARY.md](initial%20plan/ARCHITECTURE-SUMMARY.md)** - High-level overview
2. **[initial plan/ARCHITECTURE.md](initial%20plan/ARCHITECTURE.md)** - Deep dive
3. **[initial plan/DECISIONS.md](initial%20plan/DECISIONS.md)** - Why decisions were made

### Implementing New Features

1. **[initial plan/FEATURES.md](initial%20plan/FEATURES.md)** - Feature catalog
2. **[initial plan/SYNC-ENGINE.md](initial%20plan/SYNC-ENGINE.md)** - Sync patterns
3. **[initial plan/DATABASE.md](initial%20plan/DATABASE.md)** - Database patterns
4. **[features/README.md](features/README.md)** - Feature-specific docs

### Working with Database

1. **[initial plan/DATABASE.md](initial%20plan/DATABASE.md)** - Schema & queries
2. **[initial plan/RLS-POLICIES.md](initial%20plan/RLS-POLICIES.md)** - Security policies
3. **[initial plan/MIGRATION.md](initial%20plan/MIGRATION.md)** - Migration patterns

### Debugging Sync Issues

1. **[initial plan/SYNC-ENGINE.md](initial%20plan/SYNC-ENGINE.md)** - Sync architecture
2. **[initial plan/SYNC-FALLBACKS.md](initial%20plan/SYNC-FALLBACKS.md)** - Failure handling
3. **[initial plan/DECISIONS.md](initial%20plan/DECISIONS.md)** - #62, #75, #77 (sync decisions)

### Deploying to Production

1. **[initial plan/DEPLOYMENT.md](initial%20plan/DEPLOYMENT.md)** - Deployment guide
2. **[initial plan/SECURITY.md](initial%20plan/SECURITY.md)** - Security checklist
3. **[initial plan/R2-BACKUP.md](initial%20plan/R2-BACKUP.md)** - Backup setup (Phase B)

## Critical Architectural Concepts

### 1. Offline-First

**Core principle:** App works fully offline, syncs when online

**Key documents:**

- [ARCHITECTURE.md](initial%20plan/ARCHITECTURE.md) - Three-layer state model
- [SYNC-ENGINE.md](initial%20plan/SYNC-ENGINE.md) - Event sourcing patterns

**Implementation:**

- Zustand for UI state
- IndexedDB (Dexie) for persistent local storage
- Supabase for cloud truth and multi-device sync

### 2. Event Sourcing

**Core principle:** All changes stored as immutable events, not state updates

**Key documents:**

- [SYNC-ENGINE.md](initial%20plan/SYNC-ENGINE.md) - Event structure and processing
- [DECISIONS.md](initial%20plan/DECISIONS.md) - #62 (Event sourcing from Phase A)

**Implementation:**

- Every mutation creates a transaction_event
- Idempotency keys prevent duplicate processing
- Vector clocks resolve conflicts (Phase B)

### 3. Currency Handling

**Core principle:** Store as integer cents, display as formatted PHP

**Key documents:**

- [DATABASE.md](initial%20plan/DATABASE.md) - Lines 1005-1160 (comprehensive spec)

**Rules:**

- BIGINT storage (1 PHP = 100 cents)
- Always positive amounts with explicit `type` field
- `formatPHP(cents)` and `parsePHP(input)` utilities

### 4. Transfer Representation

**Core principle:** Transfers are paired transactions, must exclude from analytics

**Key documents:**

- [DATABASE.md](initial%20plan/DATABASE.md) - Lines 441-501 (transfer patterns)
- [DECISIONS.md](initial%20plan/DECISIONS.md) - Transfer design rationale

**Implementation:**

- Two transactions with same `transfer_group_id`
- One expense (from account) + one income (to account)
- **CRITICAL:** Always filter `WHERE transfer_group_id IS NULL` in analytics

### 5. Budgets as Reference Targets

**Core principle:** Budgets are aspirational goals, not rolling balances

**Key documents:**

- [DECISIONS.md](initial%20plan/DECISIONS.md) - #80 (Budget philosophy)

**Implementation:**

- No rollover of unused budget
- Actual spending calculated fresh from transactions each month
- Can copy previous month's targets for consistency

## Documentation Maintenance

### Adding New Documentation

**Feature documentation:**

1. Create directory in `docs/features/{feature-name}/`
2. Add overview doc: `{FEATURE-NAME}.md`
3. Add implementation guide: `{feature-name}-implementation.md`
4. Update `docs/features/README.md` with links

**Architectural decisions:**

1. Add entry to `docs/initial plan/DECISIONS.md`
2. Include: Problem, Decision, Alternatives, Rationale, Consequences
3. Reference in related docs (DATABASE.md, ARCHITECTURE.md, etc.)

**Database changes:**

1. Update schema in `docs/initial plan/DATABASE.md`
2. Document query patterns and indexes
3. Update `docs/initial plan/RLS-POLICIES.md` if RLS changes

### Documentation Standards

**File naming:**

- ALL_CAPS.md for major architectural docs (DECISIONS.md, DATABASE.md)
- kebab-case.md for feature implementations (debt-implementation.md)
- README.md for directory overviews

**Internal links:**

- Use relative paths: `[CLAUDE.md](../CLAUDE.md)`
- Encode spaces in paths: `initial%20plan/QUICK-START.md`
- Link to specific sections: `#heading-name`

**Code examples:**

- Use triple backticks with language specifier
- Include comments explaining non-obvious logic
- Show complete, runnable examples when possible

## Related Documentation

### Root-Level Documentation

- [/CLAUDE.md](../CLAUDE.md) - **Start here** for project overview
- [/README.md](../README.md) - Project README with setup instructions
- [/CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines (if exists)

### Implementation Documentation

- [/src/README.md](../src/README.md) - Source code overview
- [/src/lib/README.md](../src/lib/README.md) - Core business logic
- [/supabase/README.md](../supabase/README.md) - Backend infrastructure

### Configuration

- [/package.json](../package.json) - Dependencies and scripts
- [/tsconfig.json](../tsconfig.json) - TypeScript configuration
- [/vite.config.ts](../vite.config.ts) - Build configuration

## Documentation Philosophy

### 1. Single Source of Truth

**Avoid duplication:**

- Link to canonical documentation instead of copying
- Update in one place, reference everywhere
- Code examples should live in actual codebase when possible

### 2. Layered Detail

**Progressive disclosure:**

- Quick Start → Summary → Comprehensive → Detailed
- CLAUDE.md → ARCHITECTURE-SUMMARY.md → ARCHITECTURE.md → DATABASE.md

### 3. Decision Documentation

**Always document "why":**

- Every major decision recorded in DECISIONS.md
- Alternatives considered and why rejected
- Trade-offs acknowledged

### 4. Living Documentation

**Documentation evolves with code:**

- Update docs alongside code changes
- Deprecate outdated docs clearly
- Mark future plans as "Planned (Phase X)"

## Getting Started

**New to the project?**

1. Read [CLAUDE.md](../CLAUDE.md) for quick reference (5 min)
2. Read [initial plan/ARCHITECTURE-SUMMARY.md](initial%20plan/ARCHITECTURE-SUMMARY.md) for system overview (10 min)
3. Follow [initial plan/QUICK-START.md](initial%20plan/QUICK-START.md) for environment setup (30 min)
4. Skim [initial plan/FEATURES.md](initial%20plan/FEATURES.md) to understand scope (10 min)
5. Deep dive into [initial plan/ARCHITECTURE.md](initial%20plan/ARCHITECTURE.md) as needed

**Implementing a feature?**

1. Check [initial plan/FEATURES.md](initial%20plan/FEATURES.md) for context
2. Review [features/README.md](features/README.md) for existing patterns
3. Study [initial plan/SYNC-ENGINE.md](initial%20plan/SYNC-ENGINE.md) for sync patterns
4. Reference [initial plan/DATABASE.md](initial%20plan/DATABASE.md) for schema

**Debugging an issue?**

1. Check [initial plan/DECISIONS.md](initial%20plan/DECISIONS.md) for relevant decisions
2. Review [initial plan/SYNC-FALLBACKS.md](initial%20plan/SYNC-FALLBACKS.md) for sync issues
3. Consult [initial plan/DATABASE.md](initial%20plan/DATABASE.md) for query patterns

## Further Reading

- **Official Documentation:**
  - [React 19](https://react.dev) - UI framework
  - [TanStack Router](https://tanstack.com/router) - Type-safe routing
  - [TanStack Query](https://tanstack.com/query) - Server state management
  - [Supabase](https://supabase.com/docs) - Backend platform
  - [Dexie.js](https://dexie.org) - IndexedDB wrapper

- **Architectural Patterns:**
  - [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) - Martin Fowler
  - [Offline First](https://www.offlinefirst.org/) - Design philosophy
  - [Conflict-Free Replicated Data Types](https://crdt.tech/) - CRDT patterns

- **Best Practices:**
  - [The Twelve-Factor App](https://12factor.net/) - Application architecture
  - [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) - Accessibility guidelines
  - [Web.dev](https://web.dev) - Progressive Web Apps
