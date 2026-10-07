# Phase 2c-1 Data-Layer Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Outside the data layer, entity rows can only be read; one test proves every data-layer mutation writes its row and outbox item atomically; the shipped Dexie schema history is frozen; `asCents` stays in the currency module and validation schemas.

**Architecture:** A type-level `readDb` facade (the same Dexie instance, read-only through tables, where-clauses and collections) replaces the writable `db` for every importer outside `src/lib/{offline,debts,sync,dexie}`, enforced by a `no-restricted-imports` entry. The three legitimate writers outside those directories move into them. A glob-driven invariant test classifies every exported data-layer function and runs two checks per mutation. A typed fixture pins every Dexie version's `stores()` argument.

**Tech Stack:** TypeScript, Dexie 4.2 (fake-indexeddb in vitest), ESLint 9 flat config, vitest.

**Spec:** `docs/plans/2026-10-07-phase-2c1-data-guards-design.md` (approved 2026-10-07).

## Global Constraints

- No runtime behavior change and no migration. Relocations are renames plus import updates.
- Writable `db` (value import of `db` from `@/lib/dexie/db`) only under `src/lib/offline/**`, `src/lib/debts/**`, `src/lib/sync/**`, `src/lib/dexie/**` and test files. Type-only imports from `@/lib/dexie/db` stay allowed everywhere.
- `asCents` importable only from `src/lib/currency.ts`, `src/lib/validations/**` and test files.
- `nanoid` stays banned under `src/lib/debts/**` and `src/lib/offline/**`; new ids use `crypto.randomUUID()`.
- Every `no-restricted-imports` ESLint block covers a disjoint file set, so no block can silently replace another's restrictions.
- No `any`. No `!` in production code under `tsconfig.strict.json` (`src/lib/{sync,offline,debts}`); narrow with a guard.
- Conventional Commits; never add Co-Authored-By or Claude Session lines.
- Gates: `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.tests.json`, `npx tsc --noEmit -p tsconfig.strict.json`, `npm run lint`, `npx vitest run`, `npm run build`, `npm run size` (355 KB gz budget), `npm run test:e2e:smoke`.

## File Structure

| File                                                                                        | Responsibility                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/lib/debts/ledgerView.ts`, `src/lib/debts/payments.ts`                                  | Balances held as `Cents`; no `asCents`                                              |
| `eslint.config.js`                                                                          | Disjoint `no-restricted-imports` blocks: supabase, `asCents`, writable `db`, nanoid |
| `src/lib/__tests__/architecture-lint.test.ts`                                               | Lint cases for each restriction                                                     |
| `src/lib/sync/realtime.ts` (moved from `src/lib/realtime-sync.ts`)                          | Realtime pull and catch-up                                                          |
| `src/lib/offline/importDrafts.ts` (moved from `src/lib/import-drafts.ts`)                   | Local-only import drafts                                                            |
| `src/lib/dexie/reset.ts` (new)                                                              | `resetLocalDatabase()` for sign-out                                                 |
| `src/lib/dexie/readDb.ts` (new)                                                             | `readDb` and its read-only types                                                    |
| 9 reader files (Task 5)                                                                     | Import `readDb` instead of `db`                                                     |
| `src/lib/dexie/schemaHistory.fixture.ts` (new), `src/lib/dexie/schemaHistory.test.ts` (new) | Frozen Dexie version history                                                        |
| `src/lib/offline/outbox.invariant.test.ts` (new)                                            | Exhaustive outbox invariant test                                                    |

## Progress

- [x] Task 0: Branch and baseline
- [x] Task 1: Narrow `asCents`; disjoint import-restriction blocks
- [x] Task 2: Move realtime sync into `src/lib/sync`
- [x] Task 3: Move import drafts into `src/lib/offline`; `resetLocalDatabase`
- [x] Task 4: `readDb` facade
- [x] Task 5: Readers use `readDb`; restrict the writable `db`
- [x] Task 6: Dexie schema history
- [x] Task 7: Outbox invariant test
- [x] Task 8: Acceptance, docs, merge

---

### Task 0: Branch and baseline

- [ ] **Step 1:** `git status -sb` (expect `main`, clean), then `git switch -c phase-2c1-data-guards`.
- [ ] **Step 2:** Record baselines:

```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npx tsc --noEmit -p tsconfig.json; echo "tsc app $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "tsc strict $?"
npm run build >/dev/null 2>&1 && npm run size 2>&1 | grep TOTAL
```

Expected at `69e036a`+docs: 92 files passed + 1 skipped, 1131 tests + 1 skipped; tsc 0/0; 354.6 KB gz.

---

### Task 1: Narrow `asCents`; disjoint import-restriction blocks

**Files:**

- Modify: `src/lib/debts/ledgerView.ts`, `src/lib/debts/payments.ts`
- Modify: `eslint.config.js` (constants near line 30; the blocks at about lines 470-515)
- Test: `src/lib/__tests__/architecture-lint.test.ts`

**Interfaces:**

- Produces: `DebtLedgerView.balance(kind, id): Promise<Cents>`, `DebtLedgerView.recordPayment(id: string, amountCents: Cents): void`. ESLint constants `restrictSupabase`, `restrictAsCents`, `restrictNanoid`, `dataLayer`, `asCentsAllowed` (Task 5 adds `restrictWritableDb`).

- [ ] **Step 1: Failing lint cases.** Append to the `cases` array:

```ts
  {
    rule: "no-restricted-imports",
    code: 'import { asCents } from "@/lib/currency";\nexport const total = asCents(1);\n',
    flagged: "src/lib/debts/probe.ts",
    allowed: "src/lib/validations/probe.ts",
  },
```

and add standalone cases below the existing ones:

```ts
it("no-restricted-imports flags asCents in src/lib/offline", async () => {
  const code = 'import { asCents } from "@/lib/currency";\nexport const total = asCents(1);\n';
  expect(await ruleIds(code, "src/lib/offline/probe.ts")).toContain("no-restricted-imports");
});

it("no-restricted-imports flags asCents in src/lib/sync", async () => {
  const code = 'import { asCents } from "@/lib/currency";\nexport const total = asCents(1);\n';
  expect(await ruleIds(code, "src/lib/sync/probe.ts")).toContain("no-restricted-imports");
});

it("no-restricted-imports still bans nanoid in src/lib/debts alongside asCents", async () => {
  const code = 'import { nanoid } from "nanoid";\nexport const id = nanoid();\n';
  expect(await ruleIds(code, "src/lib/debts/probe.ts")).toContain("no-restricted-imports");
});
```

- [ ] **Step 2: Run them.** `npx vitest run src/lib/__tests__/architecture-lint.test.ts`. Expected: the debts/offline/sync `asCents` cases FAIL (those directories are in `asCentsAllowed`).

- [ ] **Step 3: Balances as `Cents`.** In `ledgerView.ts`:

```ts
import { diffCents, type Cents } from "@/lib/currency";
// ...
  private readonly balances = new Map<string, Cents>();
// ...
  async balance(kind: DebtKind, id: string): Promise<Cents> {
// ... (body unchanged)
  /** Signed ledger: a reversal's negative amount raises the balance. */
  recordPayment(id: string, amountCents: Cents): void {
    const current = this.balances.get(id);
    if (current === undefined) {
      throw new Error(`Balance for debt ${id} was not loaded before recording a payment`);
    }
    this.balances.set(id, diffCents(current, amountCents));
  }
```

In `payments.ts` change the currency import to `{ ZERO_CENTS, diffCents }` and the overpayment branch to `diffCents(data.amount_cents, currentBalance)`.

- [ ] **Step 4: Disjoint blocks.** In `eslint.config.js`:

Replace the `asCentsAllowed` constant with

```js
const asCentsAllowed = ["src/lib/currency.ts", "src/lib/validations/**"];

const dataLayer = ["src/lib/offline/**", "src/lib/debts/**", "src/lib/sync/**", "src/lib/dexie/**"];

const restrictSupabase = {
  group: ["**/lib/supabase", "**/lib/supabase.ts"],
  message:
    "Routes and components fetch through a hook or @/lib/supabaseQueries so reads get the Dexie offline fallback and shared query keys.",
};

const restrictNanoid = {
  name: "nanoid",
  message: "Use crypto.randomUUID(): local ids are server ids and the columns are uuid.",
};
```

Replace the three existing `no-restricted-imports` blocks (routes/components; `src/**` minus allow-list; the nanoid block for debts/offline) with these four, each covering a disjoint file set (the comment explains why):

```js
  // no-restricted-imports: one block per disjoint file set. A later block's
  // no-restricted-imports replaces an earlier one for the same file, so the
  // sets must never overlap.
  {
    files: ["src/routes/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": ["error", { patterns: [restrictSupabase, restrictAsCents] }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...srcTestFiles,
      ...asCentsAllowed,
      ...dataLayer,
      "src/routes/**",
      "src/components/**",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [restrictAsCents] }],
    },
  },
  {
    files: ["src/lib/debts/**/*.ts", "src/lib/offline/**/*.ts"],
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [restrictNanoid], patterns: [restrictAsCents] },
      ],
    },
  },
  {
    files: ["src/lib/sync/**/*.ts", "src/lib/dexie/**/*.ts"],
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": ["error", { patterns: [restrictAsCents] }],
    },
  },
```

(`asCentsAllowed` files get no `no-restricted-imports` block yet; Task 5 adds one for the writable `db`.)

- [ ] **Step 5: Verify.**

```bash
npx vitest run src/lib/__tests__/architecture-lint.test.ts src/lib/debts
npm run lint
npx tsc --noEmit -p tsconfig.strict.json; echo "strict $?"
grep -rln "asCents" src | grep -E "\.tsx?$" | grep -v -e "\.test\." -e __tests__ -e src/test/
```

Expected: PASS; lint 0 errors; strict 0; the grep prints only `src/lib/currency.ts` and files under `src/lib/validations/`.

- [ ] **Step 6: Commit** `refactor(lint): narrow asCents to currency and validations`

---

### Task 2: Move realtime sync into `src/lib/sync`

**Files:**

- Move: `src/lib/realtime-sync.ts` → `src/lib/sync/realtime.ts`; `src/lib/__tests__/realtime-sync.test.ts` → `src/lib/sync/__tests__/realtime.test.ts`
- Modify imports: `src/App.tsx`, `src/lib/sync/autoSync.ts`, `src/lib/sync/__tests__/autoSync.test.ts` (its `vi.mock("@/lib/realtime-sync", ...)`)

- [ ] **Step 1: Move with history.**

```bash
git mv src/lib/realtime-sync.ts src/lib/sync/realtime.ts
git mv src/lib/__tests__/realtime-sync.test.ts src/lib/sync/__tests__/realtime.test.ts
grep -rln "realtime-sync" src
```

- [ ] **Step 2:** Replace every `@/lib/realtime-sync` import and `vi.mock` path with `@/lib/sync/realtime` in the files the grep lists (code and tests). Inside `realtime.ts`, keep `@/` alias imports as they are. In comments and JSDoc examples, update `@/lib/realtime-sync` to `@/lib/sync/realtime`.

- [ ] **Step 3: Verify.**

```bash
grep -rn "realtime-sync" src            # expect no import paths; prose mentions of "realtime-sync" as a subsystem name (e.g. reportError subsystem strings) stay unchanged
npx tsc --noEmit -p tsconfig.json; echo "tsc $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "strict $?"
npx vitest run src/lib/sync
npm run lint
```

Expected: tsc 0 and strict 0 (the file now sits in the strict program; a probe at planning time showed 0 errors); tests PASS; lint 0. Do not rename the `"realtime-sync"` Sentry subsystem string.

- [ ] **Step 4: Commit** `refactor(sync): move realtime sync into src/lib/sync`

---

### Task 3: Move import drafts into `src/lib/offline`; `resetLocalDatabase`

**Files:**

- Move: `src/lib/import-drafts.ts` → `src/lib/offline/importDrafts.ts`; `src/lib/import-drafts.test.ts` → `src/lib/offline/importDrafts.test.ts`
- Modify imports: `src/components/layout/AppSidebar.tsx`, `src/components/layout/MobileNav.tsx`, `src/components/layout/MobileNav.test.tsx` (`vi.mock` path), `src/components/pdf-import/PDFImportPage.tsx`, `src/routes/drafts.tsx`
- Create: `src/lib/dexie/reset.ts`
- Modify: `src/stores/authStore.ts` (`clearIndexedDB`), `src/stores/__tests__/authStore.test.ts`

**Interfaces:**

- Produces: `resetLocalDatabase(): Promise<void>` from `@/lib/dexie/reset`.

- [ ] **Step 1: Move.**

```bash
git mv src/lib/import-drafts.ts src/lib/offline/importDrafts.ts
git mv src/lib/import-drafts.test.ts src/lib/offline/importDrafts.test.ts
grep -rln "import-drafts" src
```

Replace `@/lib/import-drafts` with `@/lib/offline/importDrafts` everywhere listed. In `importDrafts.ts`, change `import { createOfflineTransactionsBatch } from "@/lib/offline/transactions";` to `from "./transactions"`, remove `import { nanoid } from "nanoid";`, and replace both `nanoid()` calls with `crypto.randomUUID()` (session id and draft ids; existing ids are opaque strings, so old drafts still load).

- [ ] **Step 2: Sign-out reset.** Create:

```ts
// src/lib/dexie/reset.ts
import { db } from "./db";

/** Deletes every local table and reopens an empty database (sign-out). */
export async function resetLocalDatabase(): Promise<void> {
  await db.delete();
  await db.open();
}
```

In `authStore.ts`, import `{ resetLocalDatabase } from "@/lib/dexie/reset"` and make `clearIndexedDB`'s `try` body `await resetLocalDatabase();` (keep the doc comment and the catch). Leave the `db.syncQueue` read for Task 5.

In `authStore.test.ts`, add `vi.mock("@/lib/dexie/reset", () => ({ resetLocalDatabase: vi.fn().mockResolvedValue(undefined) }));`, remove `delete`/`open` from the `@/lib/dexie/db` mock, and change any assertion on `db.delete`/`db.open` to assert `resetLocalDatabase` was called (import it from `@/lib/dexie/reset`).

- [ ] **Step 3: Verify.**

```bash
grep -rn "import-drafts\|nanoid" src/lib/offline src/components/layout src/routes/drafts.tsx src/components/pdf-import/PDFImportPage.tsx
npx vitest run src/lib/offline src/stores src/components/layout
npx tsc --noEmit -p tsconfig.json; echo "tsc $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "strict $?"
npm run lint
```

Expected: the grep prints nothing; tests PASS; tsc 0 / strict 0; lint 0. If a draft test asserted a nanoid-shaped id, assert a UUID instead.

- [ ] **Step 4: Commit** `refactor(offline): move import drafts into the data layer, add resetLocalDatabase`

---

### Task 4: `readDb` facade

**Files:**

- Create: `src/lib/dexie/readDb.ts`
- Test: `src/lib/dexie/readDb.test.ts`

**Interfaces:**

- Produces: `readDb: ReadDb`; types `ReadTable<T, TKey>`, `ReadCollection<T, TKey>`, `ReadWhereClause<T, TKey>`, `ReadDb`.

- [ ] **Step 1: Failing test.**

```ts
// src/lib/dexie/readDb.test.ts
import { describe, expect, it } from "vitest";
import { db } from "./db";
import { readDb } from "./readDb";

describe("readDb", () => {
  it("is the app database, typed read-only", async () => {
    expect(readDb).toBe(db);
    await db.meta.put({ key: "readDbProbe", value: 1 });
    expect((await readDb.meta.get("readDbProbe"))?.value).toBe(1);
    expect(await readDb.meta.where("key").equals("readDbProbe").count()).toBe(1);
  });

  it("does not expose writes (compile-time checks)", () => {
    const neverRuns = false as boolean;
    if (neverRuns) {
      // @ts-expect-error tables have no put
      void readDb.transactions.put;
      // @ts-expect-error tables have no add
      void readDb.accounts.add;
      // @ts-expect-error tables have no update
      void readDb.categories.update;
      // @ts-expect-error tables have no delete
      void readDb.debts.delete;
      // @ts-expect-error tables have no clear
      void readDb.syncQueue.clear;
      // @ts-expect-error tables have no bulkPut
      void readDb.budgets.bulkPut;
      // @ts-expect-error where-clause collections have no modify
      void readDb.transactions.where("status").equals("cleared").modify;
      // @ts-expect-error filtered collections have no delete
      void readDb.transactions.filter(() => true).delete;
      // @ts-expect-error ordered collections have no modify
      void readDb.transactions.orderBy("date").reverse().modify;
      // @ts-expect-error collections have no delete
      void readDb.accounts.toCollection().delete;
    }
    expect(neverRuns).toBe(false);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/dexie/readDb.test.ts` → FAIL (cannot resolve `./readDb`).

- [ ] **Step 3: Implement.**

```ts
// src/lib/dexie/readDb.ts
/**
 * Read-only view of the app database for code outside the data layer.
 * Same Dexie instance as `db`; the types drop every write, including
 * Collection.modify/delete, so an entity write can only be expressed in
 * src/lib/{offline,debts,sync,dexie}, where it enqueues its sync item.
 */
import type { Collection, IndexableType, Table, WhereClause } from "dexie";
import { db, type HouseholdHubDB } from "./db";

type CollectionRead =
  | "toArray"
  | "first"
  | "last"
  | "count"
  | "sortBy"
  | "each"
  | "keys"
  | "primaryKeys";

export type ReadCollection<T, TKey> = Pick<Collection<T, TKey>, CollectionRead> & {
  filter(fn: (row: T) => boolean): ReadCollection<T, TKey>;
  and(fn: (row: T) => boolean): ReadCollection<T, TKey>;
  reverse(): ReadCollection<T, TKey>;
  limit(n: number): ReadCollection<T, TKey>;
  offset(n: number): ReadCollection<T, TKey>;
};

type WhereMethod =
  | "equals"
  | "notEqual"
  | "anyOf"
  | "noneOf"
  | "between"
  | "above"
  | "aboveOrEqual"
  | "below"
  | "belowOrEqual"
  | "startsWith"
  | "startsWithAnyOf"
  | "equalsIgnoreCase"
  | "anyOfIgnoreCase"
  | "startsWithIgnoreCase"
  | "inAnyRange";

export type ReadWhereClause<T, TKey> = {
  [M in WhereMethod]: (...args: Parameters<WhereClause<T, TKey>[M]>) => ReadCollection<T, TKey>;
};

export interface ReadTable<T, TKey>
  extends Pick<Table<T, TKey>, "get" | "bulkGet" | "count" | "toArray" | "each"> {
  where(index: string | string[]): ReadWhereClause<T, TKey>;
  filter(fn: (row: T) => boolean): ReadCollection<T, TKey>;
  orderBy(index: string | string[]): ReadCollection<T, TKey>;
  toCollection(): ReadCollection<T, TKey>;
}

type TableName =
  | "transactions"
  | "accounts"
  | "categories"
  | "budgets"
  | "debts"
  | "internalDebts"
  | "debtPayments"
  | "syncQueue"
  | "events"
  | "meta"
  | "logs"
  | "syncIssues"
  | "importDrafts"
  | "importSessions";

export type ReadDb = {
  readonly [K in TableName]: HouseholdHubDB[K] extends Table<infer T, infer TKey>
    ? ReadTable<T, TKey extends IndexableType ? TKey : never>
    : never;
};

export const readDb: ReadDb = db;
```

If `export const readDb: ReadDb = db;` does not type-check because Dexie's overloads do not structurally match one of the read-only signatures, narrow that signature to the overload the app uses (record the change in the report). Do not cast `db` to `ReadDb`: the assignment is what proves the facade is a true subset.

- [ ] **Step 4: Verify.** `npx vitest run src/lib/dexie/readDb.test.ts` (PASS), `npx tsc --noEmit -p tsconfig.json` (0; an unused `@ts-expect-error` would fail here, which is how the write checks are enforced), `npm run lint`.

- [ ] **Step 5: Commit** `feat(dexie): read-only readDb facade`

---

### Task 5: Readers use `readDb`; restrict the writable `db`

**Files:**

- Modify (`db` → `readDb`, import from `@/lib/dexie/readDb`): `src/components/CompactionMonitor.tsx`, `src/components/pdf-import/steps/AccountMapStep.tsx`, `src/components/TransactionList.tsx`, `src/components/ui/category-selector.tsx`, `src/hooks/useSyncStatus.ts`, `src/lib/csv-exporter.ts`, `src/lib/pdf-import-duplicates.ts`, `src/routes/drafts.tsx`, `src/stores/authStore.ts`
- Modify tests that mock `@/lib/dexie/db` for those files (at planning time: `src/stores/__tests__/authStore.test.ts`): mock `@/lib/dexie/readDb` exporting `readDb` instead
- Modify: `eslint.config.js`, `src/lib/__tests__/architecture-lint.test.ts`

- [ ] **Step 1: Failing lint cases.**

```ts
  {
    rule: "no-restricted-imports",
    code: 'import { db } from "@/lib/dexie/db";\nexport const count = () => db.transactions.count();\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/offline/probe.ts",
  },
```

(appended to `cases`), plus:

```ts
it("no-restricted-imports allows type-only imports from the database module", async () => {
  const code =
    'import type { LocalTransaction } from "@/lib/dexie/db";\nexport type Row = LocalTransaction;\n';
  expect(await ruleIds(code, "src/components/probe.tsx")).not.toContain("no-restricted-imports");
});

it("no-restricted-imports flags the writable db in validations and routes", async () => {
  const code =
    'import { db } from "@/lib/dexie/db";\nexport const count = () => db.transactions.count();\n';
  expect(await ruleIds(code, "src/lib/validations/probe.ts")).toContain("no-restricted-imports");
  expect(await ruleIds(code, "src/routes/probe.tsx")).toContain("no-restricted-imports");
});
```

Run `npx vitest run src/lib/__tests__/architecture-lint.test.ts` → the `db` cases FAIL.

- [ ] **Step 2: Rule.** In `eslint.config.js` add

```js
const restrictWritableDb = {
  group: ["@/lib/dexie/db", "**/lib/dexie/db", "**/dexie/db"],
  importNames: ["db"],
  message:
    "Read through readDb from @/lib/dexie/readDb. The writable db belongs to src/lib/{offline,debts,sync,dexie}, where an entity write enqueues its sync item in the same transaction.",
};
```

add `restrictWritableDb` to the `patterns` of the routes/components block and of the general `src/**` block, and add a fifth disjoint block for the `asCents` allow-list:

```js
  {
    files: asCentsAllowed,
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": ["error", { patterns: [restrictWritableDb] }],
    },
  },
```

- [ ] **Step 3: Switch readers.** In each listed file replace `import { db } from "@/lib/dexie/db";` with `import { readDb } from "@/lib/dexie/readDb";` (keep any type-only imports from `@/lib/dexie/db`) and rename `db.` uses to `readDb.`. In `authStore.test.ts` change the `@/lib/dexie/db` mock to `vi.mock("@/lib/dexie/readDb", () => ({ readDb: { syncQueue: { where: vi.fn(() => ({ anyOf: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) })) })) } } }))` and its `db.syncQueue.where` references to `readDb.syncQueue.where`. Run `grep -rln 'vi.mock("@/lib/dexie/db"' src` and update any other mock whose subject file now imports `readDb`.

- [ ] **Step 4: Verify.**

```bash
grep -rlE "import \{[^}]*\bdb\b[^}]*\} from \"@/lib/dexie/db\"" src | grep -E "\.tsx?$" | grep -v -e "\.test\." -e __tests__ -e src/test/ -e src/lib/offline/ -e src/lib/debts/ -e src/lib/sync/ -e src/lib/dexie/
npm run lint
npx tsc --noEmit -p tsconfig.json; echo "tsc $?"
npx vitest run
```

Expected: the grep prints nothing; lint 0 errors (it now enforces the restriction); tsc 0; full vitest PASS.

- [ ] **Step 5: Commit** `refactor(dexie): read through readDb outside the data layer`

---

### Task 6: Dexie schema history

**Files:**

- Create: `src/lib/dexie/schemaHistory.fixture.ts`, `src/lib/dexie/schemaHistory.test.ts`

- [ ] **Step 1: Write the test (fails: fixture missing).**

```ts
// src/lib/dexie/schemaHistory.test.ts
import { describe, expect, it } from "vitest";
import { db } from "./db";
import { SCHEMA_HISTORY } from "./schemaHistory.fixture";

interface DeclaredVersion {
  version: number;
  stores: Record<string, string | null>;
}

/**
 * Dexie has no public "stores of version N" API; read its internal version
 * list, failing loudly if that shape changes rather than comparing nothing.
 */
function declaredVersions(): DeclaredVersion[] {
  const versions: unknown = Reflect.get(db, "_versions");
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error("Dexie internals changed: db._versions is not a non-empty array");
  }
  return versions
    .map((version: unknown): DeclaredVersion => {
      const cfg: unknown =
        typeof version === "object" && version !== null ? Reflect.get(version, "_cfg") : undefined;
      const number: unknown =
        typeof cfg === "object" && cfg !== null ? Reflect.get(cfg, "version") : undefined;
      const stores: unknown =
        typeof cfg === "object" && cfg !== null ? Reflect.get(cfg, "storesSource") : undefined;
      if (typeof number !== "number" || typeof stores !== "object" || stores === null) {
        throw new Error("Dexie internals changed: version._cfg has no version/storesSource");
      }
      return { version: number, stores: stores as Record<string, string | null> };
    })
    .sort((a, b) => a.version - b.version);
}

describe("Dexie schema history", () => {
  it("matches every shipped version's stores() exactly", () => {
    expect(declaredVersions()).toEqual(SCHEMA_HISTORY);
  });

  it("adds versions only by appending", () => {
    const versions = SCHEMA_HISTORY.map((entry) => entry.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });
});
```

- [ ] **Step 2: Generate the fixture once.** Create a temporary file `src/lib/dexie/schemaHistory.generate.test.ts`:

```ts
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { db } from "./db";

it("writes the schema history fixture", () => {
  const versions = (
    Reflect.get(db, "_versions") as {
      _cfg: { version: number; storesSource: Record<string, string | null> };
    }[]
  )
    .map((v) => ({ version: v._cfg.version, stores: v._cfg.storesSource }))
    .sort((a, b) => a.version - b.version);
  const body = `/**\n * Every shipped Dexie version's stores() argument, in order. Never edit an\n * entry: add a new version in db.ts and append it here.\n */\nexport const SCHEMA_HISTORY: { version: number; stores: Record<string, string | null> }[] = ${JSON.stringify(versions, null, 2)};\n`;
  writeFileSync("src/lib/dexie/schemaHistory.fixture.ts", body);
});
```

Run `npx vitest run src/lib/dexie/schemaHistory.generate.test.ts`, then delete the generator (`rm src/lib/dexie/schemaHistory.generate.test.ts`). Format with `npx prettier --write src/lib/dexie/schemaHistory.fixture.ts`.

- [ ] **Step 3: Check the fixture against `db.ts` by eye.** It must have one entry per `this.version(N)` in `src/lib/dexie/db.ts` (11 at planning time), each `stores` object equal to that version's `.stores({...})` argument, with `null` where a version drops a table (v9 drops `conflicts`). Record the count in the report.

- [ ] **Step 4: Verify.** `npx vitest run src/lib/dexie` (PASS); then prove the guard bites: temporarily edit one index string in an old version in `db.ts`, rerun (FAIL), revert (`git diff --stat src/lib/dexie/db.ts` empty). `npx tsc --noEmit -p tsconfig.json`, `npm run lint`.

- [ ] **Step 5: Commit** `test(dexie): freeze the shipped schema history`

---

### Task 7: Outbox invariant test

**Files:**

- Create: `src/lib/offline/outbox.invariant.test.ts`

**Interfaces:**

- Consumes: the public functions of `src/lib/offline/*` and `src/lib/debts/*` (classification below), `createTestPayment` from `src/lib/debts/__tests__/test-utils.ts`.

- [ ] **Step 1: Write the test.**

```ts
// src/lib/offline/outbox.invariant.test.ts
/**
 * Cross-cutting outbox guard: every exported data-layer function is
 * classified, and every mutation (a) enqueues sync items for what it writes
 * and (b) writes nothing when the outbox write fails, which proves the row
 * and its queue item share one Dexie transaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";
import { cents } from "@/test/cents";
import type { EntityType } from "@/types/sync";
import * as accounts from "./accounts";
import * as budgets from "./budgets";
import * as categories from "./categories";
import * as importDrafts from "./importDrafts";
import * as transactions from "./transactions";
import * as transfers from "./transfers";
import type { OfflineOperationResult, TransactionInput } from "./types";
import * as debtCrud from "@/lib/debts/crud";
import * as debtPayments from "@/lib/debts/payments";
import * as debtReversals from "@/lib/debts/reversals";
import * as debtStatus from "@/lib/debts/status";
import { createTestPayment } from "@/lib/debts/__tests__/test-utils";

vi.mock("@/lib/supabase", () => {
  const supabase = {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  };
  return { supabase, untypedSupabase: supabase };
});

const USER = "12345678-1234-5678-1234-567812345678";
const MONTH = new Date(2026, 9, 1);

const modules = {
  ...import.meta.glob(["./*.ts", "!./*.test.ts"], { eager: true }),
  ...import.meta.glob(["../debts/*.ts", "!../debts/*.test.ts"], { eager: true }),
} as Record<string, Record<string, unknown>>;

function exportedFunctionNames(): string[] {
  const names = new Set<string>();
  for (const moduleExports of Object.values(modules)) {
    for (const [name, value] of Object.entries(moduleExports)) {
      if (typeof value === "function") names.add(name);
    }
  }
  return [...names].sort();
}

const READS = [
  "budgetMonthKey",
  "hasMirroredBudgets",
  "getLocalBudgetGroups",
  "hasLocalFinancialData",
  "getLocalDashboardData",
  "duplicateAccountNameError",
  "duplicateCategoryNameError",
  "isOfflineError",
  "isLikelyNetworkError",
  "applyTransactionFilters",
  "getLocalTransactionsWithRelations",
  "getUnsyncedLocalTransactionsWithRelations",
  "getPendingTransactionDeleteIds",
  "overlayLocalTransactions",
  "mergeTransactionPages",
  "getLocalTransactionsFilterSummary",
  "getLocalActiveAccounts",
  "getLocalActiveCategories",
  "getPendingQueueItems",
  "getOutstandingQueueItems",
  "getQueueCount",
  "getFailedCount",
  "groupTransferLegs",
  "getLocalTransfers",
  "getPendingDrafts",
  "getPendingDraftCount",
  "resolveCategoryName",
  "calculateDebtBalance",
  "calculateDebtBalanceWithDetails",
  "calculateMultipleBalances",
  "getDebt",
  "getDebtWithBalance",
  "listDebts",
  "searchDebtsByName",
  "getDebtsWithBalances",
  "calculateDelta",
  "eventExists",
  "getDebtEvents",
  "getPaymentEvents",
  "getDebtEventsInRange",
  "toDebtInsert",
  "toInternalDebtInsert",
  "toDebtPaymentInsert",
  "getDebtPayments",
  "getPayment",
  "getPaymentsByTransaction",
  "isTransactionLinkedToDebt",
  "isPaymentReversed",
  "getPaymentReversals",
  "nextDebtStatus",
  "getExpectedStatus",
  "isValidStatusTransition",
  "getSyncStatusForDebt",
  "getPendingDebtSyncCount",
  "validateAmount",
  "validateDebtName",
  "validateEntityExists",
  "getEntityDisplayName",
  "validateDebtCreation",
  "validateInternalDebtCreation",
  "validateDebtDeletion",
  "isDebtNameUnique",
  "parseAmountInput",
  "formatAmountInput",
];

const QUEUE_MAINTENANCE = "sync queue maintenance; these items are the outbox itself";
const BUILDING_BLOCK = "outbox building block; covered through the mutations that use it";
const DRAFTS = "local-only import draft tables; drafts never sync";

const EXEMPT: Record<string, string> = {
  afterOutboxWrite: "starts a sync drain after a write; writes nothing itself",
  mirrorBudgetsForMonth: "caches server budgets locally; nothing to sync",
  ensureLocalRow: "hydrates a server row into Dexie; nothing to sync",
  buildSyncQueueItem: QUEUE_MAINTENANCE,
  addToSyncQueue: QUEUE_MAINTENANCE,
  resetStaleSyncingItems: QUEUE_MAINTENANCE,
  requeueOwnerColumnFailures: QUEUE_MAINTENANCE,
  cleanupCompletedItems: QUEUE_MAINTENANCE,
  retrySyncQueueItem: QUEUE_MAINTENANCE,
  retryAllFailedItems: QUEUE_MAINTENANCE,
  discardSyncQueueItem: QUEUE_MAINTENANCE,
  clearCompletedItems: QUEUE_MAINTENANCE,
  createImportSession: DRAFTS,
  updateDraft: DRAFTS,
  discardDraft: DRAFTS,
  restoreDrafts: DRAFTS,
  restoreDraft: DRAFTS,
  emptyWriteSet: BUILDING_BLOCK,
  mergeWriteSets: BUILDING_BLOCK,
  prepareDebtCreate: BUILDING_BLOCK,
  prepareDebtUpdate: BUILDING_BLOCK,
  prepareDebtDelete: BUILDING_BLOCK,
  preparePaymentAdd: BUILDING_BLOCK,
  debtWriteTables: BUILDING_BLOCK,
  applyDebtWriteSet: BUILDING_BLOCK,
  commitDebtWriteSet: BUILDING_BLOCK,
  prepareDebtPayment: BUILDING_BLOCK,
  prepareReversal: BUILDING_BLOCK,
  prepareTransactionEdit: BUILDING_BLOCK,
  prepareTransactionDelete: BUILDING_BLOCK,
  DebtLedgerView: "working copy for prepares; writes nothing",
  repairLegacyDebtIds: "one-shot legacy repair; covered by debts/__tests__/repair.test.ts",
  OfflineError: "error class",
};

interface Scenario {
  /** entity_type values the mutation may enqueue */
  entityTypes: readonly EntityType[];
  /** Sets up fixtures, returns the call under test */
  prepare: () => Promise<() => Promise<unknown>>;
}

function must<T>(result: OfflineOperationResult<T>): T {
  if (!result.success || result.data === undefined) {
    throw new Error(result.error ?? "fixture setup failed");
  }
  return result.data;
}

async function account(name = `Wallet ${crypto.randomUUID()}`) {
  return must(
    await accounts.createOfflineAccount(
      { name, type: "cash", visibility: "household", initial_balance_cents: cents(0) },
      USER
    )
  );
}

async function category(name = `Food ${crypto.randomUUID()}`) {
  return must(await categories.createOfflineCategory({ name }, USER));
}

function transactionInput(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    date: "2026-10-07",
    description: "Lunch",
    amount_cents: cents(2500),
    type: "expense",
    status: "cleared",
    visibility: "household",
    ...overrides,
  };
}

async function transaction(overrides: Partial<TransactionInput> = {}) {
  return must(await transactions.createOfflineTransaction(transactionInput(overrides), USER));
}

async function debt(amount = 10000) {
  return debtCrud.createExternalDebt(
    {
      name: `Loan ${crypto.randomUUID()}`,
      original_amount_cents: cents(amount),
      household_id: DEFAULT_HOUSEHOLD_ID,
    },
    USER
  );
}

async function budget() {
  const { id } = await category();
  return must(
    await budgets.createOfflineBudget(
      { categoryId: id, month: MONTH, amountCents: cents(50000) },
      USER
    )
  );
}

/** A debt whose stored status lags its balance (paid in full, still active). */
async function debtNeedingStatusFlip() {
  const lagging = await debt(2500);
  await db.debtPayments.add(
    createTestPayment({
      debt_id: lagging.id,
      amount_cents: cents(2500),
      household_id: DEFAULT_HOUSEHOLD_ID,
    })
  );
  return lagging;
}

const MUTATIONS: Record<string, Scenario> = {
  createOfflineAccount: {
    entityTypes: ["account"],
    prepare: async () => () =>
      accounts.createOfflineAccount(
        { name: "Cash", type: "cash", visibility: "household", initial_balance_cents: cents(0) },
        USER
      ),
  },
  updateOfflineAccount: {
    entityTypes: ["account"],
    prepare: async () => {
      const { id } = await account();
      return () =>
        accounts.updateOfflineAccount(id, { name: `Renamed ${crypto.randomUUID()}` }, USER);
    },
  },
  deactivateOfflineAccount: {
    entityTypes: ["account"],
    prepare: async () => {
      const { id } = await account();
      return () => accounts.deactivateOfflineAccount(id, USER);
    },
  },
  createOfflineCategory: {
    entityTypes: ["category"],
    prepare: async () => () => categories.createOfflineCategory({ name: "Groceries" }, USER),
  },
  updateOfflineCategory: {
    entityTypes: ["category"],
    prepare: async () => {
      const { id } = await category();
      return () =>
        categories.updateOfflineCategory(id, { name: `Renamed ${crypto.randomUUID()}` }, USER);
    },
  },
  deactivateOfflineCategory: {
    entityTypes: ["category"],
    prepare: async () => {
      const { id } = await category();
      return () => categories.deactivateOfflineCategory(id, USER);
    },
  },
  createOfflineBudget: {
    entityTypes: ["budget"],
    prepare: async () => {
      const { id } = await category();
      return () =>
        budgets.createOfflineBudget(
          { categoryId: id, month: MONTH, amountCents: cents(50000) },
          USER
        );
    },
  },
  updateOfflineBudget: {
    entityTypes: ["budget"],
    prepare: async () => {
      const { id } = await budget();
      return () => budgets.updateOfflineBudget(id, cents(60000), USER);
    },
  },
  deleteOfflineBudget: {
    entityTypes: ["budget"],
    prepare: async () => {
      const { id } = await budget();
      return () => budgets.deleteOfflineBudget(id, USER);
    },
  },
  copyOfflineBudgets: {
    entityTypes: ["budget"],
    prepare: async () => {
      await budget();
      return () => budgets.copyOfflineBudgets(MONTH, new Date(2026, 10, 1), USER);
    },
  },
  createOfflineTransaction: {
    entityTypes: ["transaction"],
    prepare: async () => () => transactions.createOfflineTransaction(transactionInput(), USER),
  },
  updateOfflineTransaction: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const { id } = await transaction();
      return () => transactions.updateOfflineTransaction(id, { description: "Dinner" }, USER);
    },
  },
  updateOfflineTransactionsStatus: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const { id } = await transaction();
      return () => transactions.updateOfflineTransactionsStatus([id], "pending", USER);
    },
  },
  deleteOfflineTransaction: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const { id } = await transaction();
      return () => transactions.deleteOfflineTransaction(id, USER);
    },
  },
  createOfflineTransactionsBatch: {
    entityTypes: ["transaction"],
    prepare: async () => () =>
      transactions.createOfflineTransactionsBatch(
        [transactionInput(), transactionInput({ description: "Snack" })],
        USER
      ),
  },
  createOfflineTransfer: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const from = await account();
      const to = await account();
      return () =>
        transfers.createOfflineTransfer(
          {
            from_account_id: from.id,
            to_account_id: to.id,
            from_account_name: from.name,
            to_account_name: to.name,
            amount_cents: cents(1000),
            date: "2026-10-07",
          },
          USER
        );
    },
  },
  confirmDrafts: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const { id } = await account();
      const { drafts } = await importDrafts.createImportSession(
        "statement.pdf",
        "bdo",
        [
          {
            date: "2026-10-01",
            description: "Coffee",
            amount: "150.00",
            type: "expense",
            confidence: 1,
            rawText: "Coffee 150.00",
          },
        ],
        id
      );
      return () =>
        importDrafts.confirmDrafts(
          drafts.map((draft) => draft.id),
          USER
        );
    },
  },
  createExternalDebt: {
    entityTypes: ["debt"],
    prepare: async () => () => debt(),
  },
  createInternalDebt: {
    entityTypes: ["internal_debt"],
    prepare: async () => {
      const from = await account();
      const to = await account();
      return () =>
        debtCrud.createInternalDebt(
          {
            name: `IOU ${crypto.randomUUID()}`,
            original_amount_cents: cents(5000),
            household_id: DEFAULT_HOUSEHOLD_ID,
            from_type: "account",
            from_id: from.id,
            to_type: "account",
            to_id: to.id,
          },
          USER
        );
    },
  },
  updateDebtName: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debt();
      return () => debtCrud.updateDebtName(id, "external", `Renamed ${crypto.randomUUID()}`, USER);
    },
  },
  archiveDebt: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debt();
      return () => debtCrud.archiveDebt(id, "external", USER);
    },
  },
  unarchiveDebt: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debt();
      await debtCrud.archiveDebt(id, "external", USER);
      return () => debtCrud.unarchiveDebt(id, "external", USER);
    },
  },
  deleteDebt: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debt();
      return () => debtCrud.deleteDebt(id, "external", USER);
    },
  },
  processDebtPayment: {
    entityTypes: ["debt_payment", "debt"],
    prepare: async () => {
      const { id } = await debt();
      return () =>
        debtPayments.processDebtPayment(
          {
            transaction_id: crypto.randomUUID(),
            amount_cents: cents(2500),
            payment_date: "2026-10-07",
            debt_id: id,
            household_id: DEFAULT_HOUSEHOLD_ID,
          },
          USER
        );
    },
  },
  reverseDebtPayment: {
    entityTypes: ["debt_payment", "debt"],
    prepare: async () => {
      const { id } = await debt();
      const { payment } = await debtPayments.processDebtPayment(
        {
          transaction_id: crypto.randomUUID(),
          amount_cents: cents(2500),
          payment_date: "2026-10-07",
          debt_id: id,
          household_id: DEFAULT_HOUSEHOLD_ID,
        },
        USER
      );
      return () =>
        debtReversals.reverseDebtPayment({ payment_id: payment.id, reason: "test" }, USER);
    },
  },
  handleTransactionEdit: {
    entityTypes: ["debt_payment", "debt"],
    prepare: async () => {
      const { id: debtId } = await debt();
      const { id } = await transaction({ debt_id: debtId });
      return () =>
        debtReversals.handleTransactionEdit(
          {
            transaction_id: id,
            new_amount_cents: cents(4000),
            new_debt_id: debtId,
            payment_date: "2026-10-07",
          },
          USER
        );
    },
  },
  handleTransactionDelete: {
    entityTypes: ["debt_payment", "debt"],
    prepare: async () => {
      const { id: debtId } = await debt();
      const { id } = await transaction({ debt_id: debtId });
      return () => debtReversals.handleTransactionDelete({ transaction_id: id }, USER);
    },
  },
  updateDebtStatusFromBalance: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debtNeedingStatusFlip();
      return () => debtStatus.updateDebtStatusFromBalance(id, "external", USER);
    },
  },
  updateMultipleDebtStatuses: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debtNeedingStatusFlip();
      return () => debtStatus.updateMultipleDebtStatuses([id], "external", USER);
    },
  },
  recoverInvalidDebtStates: {
    entityTypes: ["debt"],
    prepare: async () => {
      await debtNeedingStatusFlip();
      return () => debtStatus.recoverInvalidDebtStates("external", USER);
    },
  },
};

const ENTITY_TABLES = [
  "transactions",
  "accounts",
  "categories",
  "budgets",
  "debts",
  "internalDebts",
  "debtPayments",
  "events",
] as const;

async function dumpEntityTables() {
  const dump: Record<string, unknown[]> = {};
  for (const name of ENTITY_TABLES) {
    const rows = (await db.table(name).toArray()) as { id: string }[];
    dump[name] = rows.sort((a, b) => a.id.localeCompare(b.id));
  }
  return dump;
}

function rejectOutboxWrites() {
  for (const method of ["add", "bulkAdd", "put", "bulkPut"] as const) {
    vi.spyOn(db.syncQueue, method).mockRejectedValue(new Error("outbox write rejected"));
  }
}

async function callFails(call: () => Promise<unknown>): Promise<boolean> {
  try {
    const result = await call();
    return (
      typeof result === "object" &&
      result !== null &&
      "success" in result &&
      result.success === false
    );
  } catch {
    return true;
  }
}

describe("outbox invariant", () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
  afterEach(() => vi.restoreAllMocks());

  it("classifies every exported data-layer function", () => {
    const classified = new Set([...READS, ...Object.keys(EXEMPT), ...Object.keys(MUTATIONS)]);
    const unclassified = exportedFunctionNames().filter((name) => !classified.has(name));
    expect(unclassified, "classify these as READS, EXEMPT (with a reason) or MUTATIONS").toEqual(
      []
    );

    const exported = new Set(exportedFunctionNames());
    const stale = [...classified].filter((name) => !exported.has(name));
    expect(stale, "these classified names are no longer exported").toEqual([]);

    const lists = [READS, Object.keys(EXEMPT), Object.keys(MUTATIONS)];
    const duplicates = [...classified].filter(
      (name) => lists.filter((list) => list.includes(name)).length > 1
    );
    expect(duplicates, "classify each name once").toEqual([]);
  });

  describe.each(Object.entries(MUTATIONS))("%s", (_name, scenario) => {
    it("enqueues sync items for what it writes", async () => {
      const call = await scenario.prepare();
      await db.syncQueue.clear();
      await call();
      const items = await db.syncQueue.toArray();
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(scenario.entityTypes).toContain(item.entity_type);
      }
    });

    it("writes nothing when the outbox write fails", async () => {
      const call = await scenario.prepare();
      await db.syncQueue.clear();
      const before = await dumpEntityTables();
      rejectOutboxWrites();
      expect(await callFails(call)).toBe(true);
      vi.restoreAllMocks();
      expect(await dumpEntityTables()).toEqual(before);
    });
  });
});
```

- [ ] **Step 2: Run and triage.** `npx vitest run src/lib/offline/outbox.invariant.test.ts`.

- Classification failures list names: add each to `READS`, `EXEMPT` (with a reason) or `MUTATIONS` (with a scenario). A name that writes entity rows must be a mutation.
- A scenario whose fixture setup fails because of a real precondition (e.g. a validation rule): adjust the fixture, not the assertion, and note it in the report.
- A real invariant failure (a mutation that writes an entity row outside the queue's transaction, or enqueues nothing) is a finding: report it with the scenario name and output as DONE_WITH_CONCERNS. Do not weaken the assertions or move the name to `EXEMPT` to make it pass.

- [ ] **Step 3: Prove it bites.** Temporarily move `await db.syncQueue.add(queueItem);` out of the `db.transaction` in `createOfflineAccount` (after the transaction), run the test (the `createOfflineAccount` "writes nothing" case FAILS), revert (`git diff --stat src/lib/offline/accounts.ts` empty). Temporarily add `export function probeWrite() {}` to `src/lib/offline/accounts.ts`, run (classification FAILS naming `probeWrite`), revert.

- [ ] **Step 4: Verify.** `npx vitest run src/lib/offline src/lib/debts`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.strict.json`, `npm run lint`.

- [ ] **Step 5: Commit** `test(offline): exhaustive outbox invariant over data-layer mutations`

---

### Task 8: Acceptance, docs, merge

- [ ] **Step 1: Gates.**

```bash
npx tsc --noEmit -p tsconfig.json; echo "tsc app $?"
npx tsc --noEmit -p tsconfig.tests.json; echo "tsc tests $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "tsc strict $?"
npm run lint
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npm run build; echo "build $?"
npm run size
PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke
```

Expected: 0/0/0, lint 0 errors, vitest all pass (count above the Task 0 baseline), build 0, size ≤ 355 KB gz, smoke 11/11.

- [ ] **Step 2: Whole-branch review** (superpowers:requesting-code-review on `main..phase-2c1-data-guards`); fix Critical/Important; record declined Minor items below.
- [ ] **Step 3: Docs.** Fill Acceptance results, tick Progress, append a Resume state bullet to the roadmap, tick the roadmap's Phase 2 checkbox "`readDb` facade, outbox invariant test, Dexie schema snapshot test (4.5)".
- [ ] **Step 4: Merge.** `git switch main && git merge --ff-only phase-2c1-data-guards && git branch -d phase-2c1-data-guards`; ask the user to run `! git push origin main`; confirm CI with `gh run list --limit 4`.

## Acceptance results

Measured at `23226e6` on branch `phase-2c1-data-guards` (2026-10-07):

- `npx tsc --noEmit` app / tests / strict: exit 0 / 0 / 0. `npm run lint`: exit 0.
- `npx vitest run`: 95 files passed, 1 skipped; 1218 tests passed, 1 skipped (baseline at `5bf5267`: 92 + 1 files, 1131 + 1 tests). The outbox invariant test alone: 70 tests.
- `npm run build`: exit 0. `npm run size`: 354.7 KB gz of 355 (baseline 354.6).
- `npm run test:e2e:smoke` (chromium): 11 passed.
- Guards proven to bite (temporary edits, reverted): an edited shipped Dexie version fails the schema history test; an entity write outside its queue transaction, a dropped queue item, and an unclassified export each fail the outbox invariant test; a batch that queues only its first row fails check (a).
- Reviews: every task reviewed; fix rounds on Task 7 (user-approved strengthening); whole-branch review "ready after fixes", fixes in `b38f442` (`.ts`-extension and `HouseholdHubDB` lint gaps) and `23226e6` (docs, CLAUDE.md `readDb` sentence).
- Not run: full (non-smoke) E2E, non-chromium browsers.

## Decisions & Deferrals

Planning decisions (2026-10-07):

- **The schema history fixture is a typed `.ts` module, not JSON.** Why: `tsconfig.json` has no `resolveJsonModule`, and a `.ts` constant is typed. The spec's intent (a checked-in file compared with `toEqual`, never auto-updated) is unchanged.
- **The fixture is generated once by a throwaway test, then reviewed against `db.ts` by eye.** Why: eleven versions of index strings are error-prone to copy by hand; the generator reads exactly what Dexie declares.
- **ESLint `no-restricted-imports` blocks are disjoint by file set.** Why: a later block's options replace an earlier block's for the same file; disjoint sets make every file's restrictions readable in one place.
- **`readDb` is assigned, not cast.** Why: `export const readDb: ReadDb = db` makes the compiler prove the facade is a subset of Dexie's real API.
- **Invariant test failure injection rejects `add`, `bulkAdd`, `put` and `bulkPut` on `syncQueue`.** Why: the data layer enqueues with `add` (offline modules) and `bulkAdd` (write sets, batches); `put` covers any future path. Queue items are built before the transaction, so stubbing `buildSyncQueueItem` would not prove atomicity.

Execution decisions and deferrals (2026-10-07):

- **`event-compactor.ts` moved to `src/lib/sync/eventCompactor.ts` (Task 5).** It writes Dexie (`events`, `meta`) and imported `db` relatively, which the plan's grep missed; relocated per the spec's "writers are relocated" decision.
- **Dexie declares 10 versions, not 11.** The planning count included a comment.
- **Invariant check (a) requires every written synced row to be queued (user-approved).** The plan's check only required "some queue item of an allowed type"; a mutation writing two rows but queueing one would have passed. Four debt-linked transaction variants were added, check (b) asserts the rejected outbox write was actually hit, and production logging is silenced in that file.
- **Writable-db restriction covers `.ts`-suffixed imports and `HouseholdHubDB` (final review).** `allowImportingTsExtensions` let `@/lib/dexie/db.ts` bypass it, and `new HouseholdHubDB()` gave a writable instance anywhere.
- **Deferred bypasses, none used in code today:** dynamic `import("@/lib/dexie/db")`, a raw `import Dexie from "dexie"` outside the data layer, and the exported `debtWriteTables()` / `applyDebtWriteSet()` building blocks. Revisit: if any appears outside the data layer, add a `no-restricted-syntax` / import restriction.
- **`import type { db }` is flagged** (core `no-restricted-imports` has no `allowTypeImports`). No use case; `typeof readDb` covers type needs.
- **The schema history freezes `stores()` strings only;** an edit to a shipped `.upgrade()` callback is not caught. Revisit: if an upgrade callback is ever edited after release.
- **`confirmDrafts` marks drafts confirmed in a separate transaction after the transactions batch (pre-existing).** A failure between them leaves drafts pending with their transactions created, and the batch does not dedupe on `import_key`. Revisit: its own follow-up (roadmap).
- **Kept as Minor:** a duplicate nanoid lint case; `ReadDb`'s hand-maintained table list (a missing table fails loudly on first use); the invariant snapshot keys rows by id only; `db.upgrade.test.ts` still hand-copies the v9 stores.

From the spec (section 9), unchanged: 2c split into 2c-1/2c-2; writers relocated, not allow-listed; `readDb` read-only through collections; schema history uses Dexie internals behind a shape guard.
