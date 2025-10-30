# Chunk 045: E2E Tests

## At a Glance

- **Time**: 2 hours
- **Milestone**: Production (5 of 6)
- **Prerequisites**:
  - **Chunk 002** (auth-flow) - Auth system for login/signup tests
  - **Chunk 008** (accounts-ui) - Account CRUD operations
  - **Chunk 010** (transactions-list) - Transaction CRUD operations
  - **Chunk 020** (dexie-setup) - IndexedDB for offline tests
  - **Chunk 024** (sync-processor) - Sync engine for multi-device tests (optional, skip sync tests if not implemented)
- **Can Skip**: No - critical for production confidence

## What You're Building

Comprehensive end-to-end test suite with Playwright:

- Critical path coverage (auth, transactions, sync)
- Offline/online transition tests
- Multi-device sync scenarios
- Accessibility tests with axe-core
- Load tests (10k+ transactions)
- Visual regression tests
- CI/CD integration

## Why This Matters

E2E tests provide **production confidence**:

- **Prevent regressions**: Catch bugs before users
- **Document behavior**: Tests as living documentation
- **Refactoring safety**: Change code confidently
- **Cross-browser**: Test Chrome, Firefox, Safari
- **Accessibility**: Automated a11y checks
- **CI integration**: Auto-test on every push

Per Day 15 implementation plan, this ensures quality before deployment.

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 523-531
- **External**: [Playwright Docs](https://playwright.dev/)
- **External**: [axe-core](https://github.com/dequelabs/axe-core)

## Key Files Created

```
tests/e2e/
├── auth.spec.ts              # Auth flow tests
├── transactions.spec.ts      # Transaction CRUD
├── offline.spec.ts           # Offline mode
├── sync.spec.ts              # Multi-device sync
├── pwa.spec.ts               # PWA installation tests
├── accessibility.spec.ts     # A11y tests
├── keyboard-nav.spec.ts      # Keyboard navigation
├── performance.spec.ts       # Load tests
└── fixtures/
    ├── test-users.ts
    └── test-data.ts
playwright.config.ts           # Playwright config
.github/workflows/
└── test.yml                   # CI pipeline
```

## Test Coverage

### Critical Paths ✓

- Sign up / Sign in / Sign out
- Create / Edit / Delete transaction
- Account balances calculation
- Category totals
- Budget vs actual (exclude transfers!)

### Offline Scenarios ✓

- Create transaction offline
- Edit transaction offline
- Queue syncs when back online
- Conflict resolution

### Multi-Device ✓

- Concurrent edits
- Vector clock comparison
- Last-write-wins resolution

### Accessibility ✓

- Keyboard navigation
- Screen reader compatibility
- ARIA labels
- Color contrast
- Focus management

### Performance ✓

- 10k transactions load time
- Virtual scrolling
- Cache effectiveness
- Bundle size

---

**Ready?** → Open `instructions.md` to begin
