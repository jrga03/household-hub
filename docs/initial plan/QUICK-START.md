# 🚀 Quick Start Guide

## If You Only Have 15 Minutes

Read these three documents in order to understand the entire system:

1. **[ARCHITECTURE-SUMMARY.md](./ARCHITECTURE-SUMMARY.md)** _(5 min)_
   - One-page technical overview
   - Key architectural decisions
   - Technology stack

2. **[DECISIONS.md#key-decisions](./DECISIONS.md)** _(5 min)_
   - Jump to decisions #76-82 for latest updates
   - Review #53 (Device ID), #63 (Event Sourcing), #80 (Budgets)
   - Understand trade-offs made

3. **[IMPLEMENTATION-PLAN.md#phase-a](./IMPLEMENTATION-PLAN.md)** _(5 min)_
   - 15-day sprint timeline
   - Phase A deliverables (MVP)
   - Daily breakdown

## Starting Development

### Day 1: Environment Setup

```bash
# 1. Clone and setup
git clone <repository-url>
cd household-hub
npm install

# 2. Read these first:
- IMPLEMENTATION-PLAN.md → Day 1 tasks
- DATABASE.md → Core schema
- ARCHITECTURE-SUMMARY.md → Tech stack

# 3. Setup Supabase
- Create account at supabase.com
- Follow DATABASE.md for schema setup
```

### Essential Documentation by Role

#### 🏗️ **If You're Building Features**

1. [DATABASE.md](./DATABASE.md) - Understand the schema
2. [SYNC-ENGINE.md](./SYNC-ENGINE.md) - Offline-first patterns
3. [TESTING-PLAN.md](./TESTING-PLAN.md) - Test requirements

#### 🎨 **If You're Working on UI**

1. [FEATURES.md](./FEATURES.md) - User requirements
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - State management
3. [PWA-MANIFEST.md](./PWA-MANIFEST.md) - PWA setup

#### 🔒 **If You're Handling Security**

1. [RLS-POLICIES.md](./RLS-POLICIES.md) - Row-level security
2. [R2-BACKUP.md](./R2-BACKUP.md) - Backup encryption
3. [DECISIONS.md#security](./DECISIONS.md) - Security decisions

#### 🚢 **If You're Deploying**

1. [DEPLOYMENT.md](./DEPLOYMENT.md) - Production setup
2. [PERFORMANCE-BUDGET.md](./PERFORMANCE-BUDGET.md) - Performance targets
3. [R2-BACKUP.md](./R2-BACKUP.md) - Backup configuration

## Core Concepts in 2 Minutes

### 1. **Offline-First Architecture**

- Everything works offline
- IndexedDB for local storage
- Sync when online
- No data loss ever

### 2. **Three-Layer State**

```
UI State (Zustand) → Cache (React Query) → Persistent (Dexie/IndexedDB)
```

### 3. **Event Sourcing**

- Every change is an event
- Events sync between devices
- Automatic conflict resolution
- Complete audit trail

### 4. **Key Technologies**

- **Frontend**: React + TypeScript + Vite
- **State**: Zustand + React Query + Dexie
- **Backend**: Supabase (PostgreSQL + Auth)
- **Deployment**: Cloudflare Pages + Workers + R2

### 5. **Budgets Are References**

- Not balances or envelopes
- Just spending targets
- Actual spending from transactions
- No complex rollover math

## Common Tasks

### Creating a Transaction (Offline)

```typescript
// 1. Optimistic UI update (Zustand)
// 2. Save to IndexedDB (Dexie)
// 3. Queue for sync (Event)
// 4. Background sync to Supabase
```

### Handling Conflicts

```typescript
// Automatic resolution:
// - Field-level Last-Write-Wins
// - Server timestamps canonical
// - DELETE always wins
// - No user intervention needed
```

### Device Identification

```typescript
// Hybrid approach for cache-clearing browsers:
// 1. Check IndexedDB
// 2. Check localStorage
// 3. Use FingerprintJS
// All stored redundantly
```

## Implementation Phases

### ✅ **Phase A** (Days 1-7): Core MVP

- Basic CRUD operations
- Simple offline support
- Manual export/import
- Event sourcing foundation

### 🔄 **Phase B** (Days 8-12): Enhanced Sync

- Vector clocks
- R2 backups
- Automated snapshots
- Conflict resolution

### 📱 **Phase C** (Days 13-15): Polish

- Push notifications
- Analytics
- Performance optimization
- Final testing

## Gotchas & Important Notes

⚠️ **Privacy**: This is a private household app - no external tracking

⚠️ **Currency**: PHP (Philippine Peso) only for MVP

⚠️ **Single Household**: Multi-household ready but single for now

⚠️ **Free Tier**: Optimized for Supabase/Cloudflare free tiers

⚠️ **Browser Cache**: User clears cache on close - device ID strategy handles this

## Need More Detail?

### Deep Dives

- **Sync Architecture**: [SYNC-ENGINE.md](./SYNC-ENGINE.md)
- **All Decisions**: [DECISIONS.md](./DECISIONS.md)
- **Database Design**: [DATABASE.md](./DATABASE.md)
- **Security Model**: [RLS-POLICIES.md](./RLS-POLICIES.md)

### Getting Help

- **Setup Issues**: See [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)
- **Architecture Questions**: See [ARCHITECTURE-SUMMARY.md](./ARCHITECTURE-SUMMARY.md)
- **Design Rationale**: See [DECISIONS.md](./DECISIONS.md)

## Ready to Code?

1. ✅ Read this guide
2. ✅ Review [ARCHITECTURE-SUMMARY.md](./ARCHITECTURE-SUMMARY.md)
3. ✅ Check [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) Day 1
4. 🚀 Start building!

---

_Last updated: 2024-10-15 | Reading time: 5 minutes_
