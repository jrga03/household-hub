# Architecture Summary

## 🎯 Quick Overview

Household Hub is an offline-first PWA for household financial management, built with privacy and resilience in mind.

**Core Philosophy**: Simple, reliable, and works offline. No external dependencies, no tracking, just your data.

## 🏗 Architecture at a Glance

```
User Device → PWA → IndexedDB ←→ Sync Engine → Supabase
                ↓                      ↓
           Service Worker      Cloudflare Workers
                               (Auth, Backups, Push)
```

## 🔑 Key Architectural Decisions

### Data & State

- **[Decision #62]**: Multi-household ready (but single household for now)
- **[Decision #63]**: Event sourcing from Day 1 (no migration pain later)
- **[Decision #78]**: Field-level LWW conflict resolution (automatic, no user intervention)
- **[Decision #80]**: Budgets are reference targets only (not balances)

### Offline & Sync

- **[Decision #76]**: Hybrid device ID (IndexedDB → localStorage → Fingerprint)
- **[Decision #77]**: Event compaction after 100 events OR monthly
- **[Decision #65]**: Progressive sync fallbacks for iOS Safari
- **[Decision #67]**: Deterministic idempotency keys prevent duplicates

### User Experience

- **[Decision #81]**: Infinite scroll with virtualization (no pagination UI)
- **[Decision #56]**: TanStack Virtual for smooth 1000+ item lists
- **[Decision #57]**: Dark/light theme with system detection + manual override
- **[Decision #82]**: Smart import deduplication with SHA-256 hashing

### Infrastructure

- **[Decision #5]**: Supabase (PostgreSQL + Auth + Realtime)
- **[Decision #6]**: Cloudflare Pages + Workers + R2 for edge computing
- **[Decision #70]**: Auth-derived encryption for backups (Phase B)
- **[Decision #64]**: Direct queries with indexes (no materialized views in MVP)

## 🔄 Data Flow

### 1. Transaction Creation

```
User Input → Zustand (optimistic) → IndexedDB → Sync Queue → Supabase
                     ↓                              ↓
                  Instant UI                  Background Sync
```

### 2. Multi-Device Sync

```
Device A → Event → Supabase → Realtime → Device B
             ↓                              ↓
        Vector Clock                  Conflict Resolution
```

### 3. Offline Recovery

```
Offline Changes → IndexedDB Queue → Online Detection → Batch Sync → Merge
```

## 📦 Technology Map

| Component           | Technology            | Purpose                  |
| ------------------- | --------------------- | ------------------------ |
| **UI Framework**    | React 18 + TypeScript | Component architecture   |
| **Routing**         | TanStack Router       | Type-safe routing        |
| **UI State**        | Zustand               | Lightweight client state |
| **Server State**    | React Query           | Cache & sync management  |
| **Offline Storage** | Dexie.js (IndexedDB)  | Persistent local data    |
| **Virtualization**  | TanStack Virtual      | Handle 10k+ items        |
| **Forms**           | React Hook Form + Zod | Validation & submission  |
| **Backend**         | Supabase              | Database, auth, realtime |
| **Edge Functions**  | Cloudflare Workers    | Auth proxy, backups      |
| **Object Storage**  | Cloudflare R2         | Backup snapshots         |
| **Styling**         | Tailwind + shadcn/ui  | Consistent design system |

## 🚀 Implementation Phases

### Phase A: Core MVP (Days 1-7)

✅ Basic CRUD operations
✅ Simple event sourcing (LWW only)
✅ Manual export/import
✅ Offline support with IndexedDB

### Phase B: Enhanced Sync (Days 8-12)

🔄 Vector clocks for better conflicts
🔄 R2 backup integration
🔄 Automated snapshots
🔄 Auth-derived encryption

### Phase C: Polish (Days 13-15)

📱 Push notifications
📊 Analytics dashboard
✨ Performance optimization
🧪 E2E testing

## 🏛 Core Principles

1. **Offline-First**: Everything works offline, sync when possible
2. **Event Sourced**: Never lose data, complete audit trail
3. **Privacy-Focused**: Private household app, no external tracking
4. **Free Tier Optimized**: Stay within Supabase/Cloudflare free limits
5. **Progressive Enhancement**: Core features work everywhere, enhance when possible

## 🔐 Security & Privacy

- **Row-Level Security**: Database-enforced access control
- **Household Isolation**: Complete data separation between households
- **Device Fingerprinting**: Resilient identification (privacy not a concern for private app)
- **Client Encryption**: Future support for attachment encryption
- **No External APIs**: No bank connections, no third-party services

## 📊 Performance Targets

| Metric               | Target       | Strategy                     |
| -------------------- | ------------ | ---------------------------- |
| **Initial Load**     | <200KB       | Code splitting, lazy loading |
| **FCP**              | <1.5s on 3G  | Progressive rendering        |
| **TTI**              | <3.5s on 3G  | Critical path optimization   |
| **Lighthouse**       | >90          | Automated testing            |
| **Transaction List** | 10k+ items   | Virtual scrolling            |
| **Offline Storage**  | 50MB warning | Quota monitoring             |

## 🗺 Navigation Guide

### Start Here

1. **[DECISIONS.md](./DECISIONS.md)** - All architectural decisions with rationale
2. **[DATABASE.md](./DATABASE.md)** - Schema and data model
3. **[IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)** - 15-day sprint plan

### Deep Dives

- **[SYNC-ENGINE.md](./SYNC-ENGINE.md)** - Offline sync architecture
- **[RLS-POLICIES.md](./RLS-POLICIES.md)** - Security policies
- **[R2-BACKUP.md](./R2-BACKUP.md)** - Backup system design

### Implementation

- **[TESTING-PLAN.md](./TESTING-PLAN.md)** - Test strategy
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment
- **[MIGRATION.md](./MIGRATION.md)** - Data migration from Google Sheets

## 🚦 Current Status

**Documentation Phase**: Complete ✅
**Implementation Phase**: Ready to start
**Deployment Target**: 15 days from start

## 💡 Key Insights

1. **Event sourcing from start** avoids painful migrations later
2. **Hybrid device ID** handles cache-clearing browsers gracefully
3. **Budgets as references** simplifies logic (no balance math)
4. **Direct queries over materialized views** keeps it simple for MVP
5. **Three-layer state** enables true offline-first architecture

## 🔗 Quick Links

- [All Decisions](./DECISIONS.md#decision-log-template)
- [Database Schema](./DATABASE.md#core-tables)
- [Sync Architecture](./SYNC-ENGINE.md#core-concepts)
- [Security Policies](./RLS-POLICIES.md#core-principles)
- [Implementation Timeline](./IMPLEMENTATION-PLAN.md#phase-a-core-mvp-days-1-7)

---

_This document provides a high-level overview. For detailed information, refer to the specific documentation files linked above._
