# Phase 1b: Strict tsconfig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `tsconfig.strict.json` (`noUncheckedIndexedAccess` over `src/lib/{sync,offline,debts}`), fix all 190 errors it reports, and enforce it in CI, the Stop hook, and a reworked pre-push hook.

**Architecture:** A second TypeScript program extends the base config and checks only the three directories plus everything they import. It is committed unwired so `npx tsc --noEmit -p tsconfig.strict.json` counts progress; enforcement is wired in one commit once the count is 0. Pre-push becomes a Node script that mirrors CI's gates in parallel.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Node 26 / npm 11, Husky 9, bash (Stop hook), Playwright (chromium).

**Spec:** `docs/plans/2026-10-02-phase-1b-strict-tsconfig-design.md`

## Global Constraints

- Node 26 (`.nvmrc`). In Claude's shell, prefix commands with `source ~/.nvm/nvm.sh && nvm use 26 >/dev/null &&` (the shell default is still 22).
- Production code: no new `!` non-null assertions and no new helper module. Tests may use `!` after an existing length/definedness assertion.
- UI render sites skip (`return null`); data-integrity sites throw an `Error` naming what is missing; parse functions keep their existing "invalid" result (`null`).
- Every commit passes `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.tests.json`, `npm run lint`, and `npx vitest run`. Each fix commit message ends with `Strict count: N` (the remaining `noUncheckedIndexedAccess` errors).
- Commit messages: no `Co-Authored-By` or session lines (user rule).
- Bundle stays within 355 KB gz (352.5 before 1b): `npm run build && npm run size`.
- `git push` hangs from Claude's shell (SSH passphrase). Ask the user to run `! git push ...`.
- `$SCRATCH` means the session scratchpad directory (never the repo); set it with `SCRATCH=<scratchpad path>` in each shell command that uses it.
- Count command, used throughout: `npx tsc --noEmit -p tsconfig.strict.json | grep -c "error TS"`

## Progress

- [x] Task 0: E2E baseline on `main` (chromium: 37 passed / 33 failed / 24 skipped)
- [x] Task 1: Branch and `tsconfig.strict.json` (190)
- [x] Task 2: Pre-push rework
- [x] Task 3: Stop hook gaps
- [x] Task 4: lib production sites (190 → 171)
- [x] Task 5: bdo-credit-card parser (171 → 153)
- [x] Task 6: UI components and hooks (153 → 143)
- [x] Task 7: TransactionList (143 → 84)
- [x] Task 8: Test files (84 → 0)
- [x] Task 9: Wire enforcement
- [ ] Task 10: Acceptance

---

### Task 0: E2E baseline on `main`

**Files:**

- Create: `docs/plans/2026-10-02-phase-1b-e2e-baseline.txt`

**Interfaces:**

- Produces: the baseline file, one line per chromium test: `<✓|✘|-> <spec path> › <title path>`, sorted. Task 10 diffs against it.

- [ ] **Step 1: Confirm preconditions**

Run: `git status -sb | head -1 && git log --oneline -1 && supabase status -o env | grep -c API_URL`
Expected: `## main...origin/main` (not `ahead`; if ahead, ask the user to run `! git push origin main` and wait), HEAD is the 1b plan commit or later, and `1` (Supabase running; if `0`, run `supabase start` first, see CLAUDE.md Known Infrastructure Issues).

- [ ] **Step 2: Run the full chromium suite**

Run (timeout 10 min; `pretest:e2e` rebuilds `dist/`):

```bash
source ~/.nvm/nvm.sh && nvm use 26 >/dev/null && PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e -- --project=chromium --reporter=list > "$SCRATCH/e2e-main.txt" 2>&1; echo exit=$?; tail -6 "$SCRATCH/e2e-main.txt"
```

Expected: a non-zero exit is normal (pre-existing failures); the tail shows `N passed`, `N failed`, `N skipped`. Record those three numbers.

- [ ] **Step 3: Normalize to per-test lines**

```bash
perl -ne 'print "$1 $2 › $3\n" if /^\s*(✓|✘|-)\s+\d+\s+\[chromium\]\s+›\s+(\S+?):\d+:\d+\s+›\s+(.*?)(?:\s+\(\d[\d.]*m?s\))?\s*$/' "$SCRATCH/e2e-main.txt" | sort -u > docs/plans/2026-10-02-phase-1b-e2e-baseline.txt
wc -l < docs/plans/2026-10-02-phase-1b-e2e-baseline.txt; cut -c1 docs/plans/2026-10-02-phase-1b-e2e-baseline.txt | sort | uniq -c
```

Expected: the line count equals passed + failed + skipped from Step 2, and the per-symbol counts match them. If they do not match, read `$SCRATCH/e2e-main.txt` for the list reporter's real line format and fix the regex before continuing.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-10-02-phase-1b-e2e-baseline.txt
git commit -m "test(e2e): record chromium baseline on main for Phase 1b"
```

Add the counts to this plan's Progress line for Task 0 and check it off in the same commit.

---

### Task 1: Branch and `tsconfig.strict.json`

**Files:**

- Create: `tsconfig.strict.json`

**Interfaces:**

- Produces: `tsconfig.strict.json`, the program every later task counts with.

- [ ] **Step 1: Branch**

Run: `git switch -c phase-1b-strict-tsconfig`

- [ ] **Step 2: Create the config**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/lib/sync", "src/lib/offline", "src/lib/debts", "src/vite-env.d.ts"]
}
```

- [ ] **Step 3: Count**

Run: `npx tsc --noEmit -p tsconfig.strict.json | grep -c "error TS"`
Expected: `190`

- [ ] **Step 4: Commit**

```bash
git add tsconfig.strict.json
git commit -m "build(ts): add tsconfig.strict.json (unwired)

Strict count: 190"
```

---

### Task 2: Pre-push rework

**Files:**

- Create: `scripts/pre-push.mjs`
- Create: `scripts/pre-push.test.mjs`
- Modify: `.husky/pre-push` (whole file)
- Modify: `.husky/README.md` (pre-push description)

**Interfaces:**

- Produces: `CHECKS` (array of `{ name, command, args }`), `isDocsOnly(files: string[]): boolean`, `parsePushedRefs(stdin: string): Array<{ localRef, localSha, remoteRef, remoteSha }>`, `shouldSkipChecks(refs, listFiles: (ref) => string[] | null): boolean`. Task 9 appends the strict program to `CHECKS`.

- [ ] **Step 1: Write the failing test**

`scripts/pre-push.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { isDocsOnly, parsePushedRefs, shouldSkipChecks } from "./pre-push.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const ZERO = "0".repeat(40);

describe("isDocsOnly", () => {
  it.each([[["docs/plans/x.md"]], [["README.md", "CLAUDE.md"]], [["docs/plans/baseline.txt"]]])(
    "is true for %j",
    (files) => {
      expect(isDocsOnly(files)).toBe(true);
    }
  );

  it.each([
    [["src/lib/a.ts"]],
    [["docs/plans/x.md", "package.json"]],
    [["scripts/README.md", "scripts/pre-push.mjs"]],
    [[]],
  ])("is false for %j", (files) => {
    expect(isDocsOnly(files)).toBe(false);
  });
});

describe("parsePushedRefs", () => {
  it("parses one ref per line and ignores blank lines", () => {
    const stdin = `refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}\n\n`;
    expect(parsePushedRefs(stdin)).toEqual([
      {
        localRef: "refs/heads/main",
        localSha: SHA_A,
        remoteRef: "refs/heads/main",
        remoteSha: SHA_B,
      },
    ]);
  });
});

describe("shouldSkipChecks", () => {
  const ref = {
    localRef: "refs/heads/x",
    localSha: SHA_A,
    remoteRef: "refs/heads/x",
    remoteSha: SHA_B,
  };

  it("skips when every ref changes only docs", () => {
    expect(shouldSkipChecks([ref, ref], () => ["docs/a.md"])).toBe(true);
  });

  it("runs when any ref changes code", () => {
    const files = [["docs/a.md"], ["src/a.ts"]];
    expect(shouldSkipChecks([ref, ref], () => files.shift())).toBe(false);
  });

  it("runs when there are no refs", () => {
    expect(shouldSkipChecks([], () => ["docs/a.md"])).toBe(false);
  });

  it("runs when a ref cannot be classified", () => {
    expect(shouldSkipChecks([{ ...ref, localSha: ZERO }], () => null)).toBe(false);
    expect(
      shouldSkipChecks([ref], () => {
        throw new Error("unknown sha");
      })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/pre-push.test.mjs`
Expected: FAIL, `Failed to load url ./pre-push.mjs` (or "Cannot find module").

- [ ] **Step 3: Write the script**

`scripts/pre-push.mjs`:

```js
#!/usr/bin/env node
// Git pre-push: runs CI's lint, unit-test, and type-check gates in parallel.
// Pushes that change only Markdown files or docs/ skip the checks.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ZERO_SHA = /^0+$/;

export const CHECKS = [
  { name: "lint", command: "npm", args: ["run", "lint"] },
  { name: "unit tests", command: "npx", args: ["vitest", "run", "--allowOnly=false"] },
  { name: "tsc src", command: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.json"] },
  { name: "tsc tests", command: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.tests.json"] },
];

export function isDocsOnly(files) {
  return (
    files.length > 0 && files.every((file) => file.endsWith(".md") || file.startsWith("docs/"))
  );
}

export function parsePushedRefs(stdin) {
  return stdin
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 4)
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({
      localRef,
      localSha,
      remoteRef,
      remoteSha,
    }));
}

export function shouldSkipChecks(refs, listFiles) {
  if (refs.length === 0) return false;
  for (const ref of refs) {
    let files;
    try {
      files = listFiles(ref);
    } catch {
      return false;
    }
    if (!files || !isDocsOnly(files)) return false;
  }
  return true;
}

function changedFiles({ localSha, remoteSha }) {
  if (ZERO_SHA.test(localSha)) return null; // deleting a remote ref
  const base = ZERO_SHA.test(remoteSha)
    ? execFileSync("git", ["merge-base", "origin/main", localSha], { encoding: "utf8" }).trim()
    : remoteSha;
  return execFileSync("git", ["diff", "--name-only", base, localSha], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function runCheck({ name, command, args }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const finish = (ok, output) =>
      resolve({ name, ok, seconds: (Date.now() - started) / 1000, output });
    const child = spawn(command, args);
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => finish(false, String(error)));
    child.on("close", (code) => finish(code === 0, output));
  });
}

async function main() {
  const refs = parsePushedRefs(readFileSync(0, "utf8"));
  if (shouldSkipChecks(refs, changedFiles)) {
    console.log("pre-push: docs-only push, checks skipped");
    return 0;
  }
  const results = await Promise.all(CHECKS.map(runCheck));
  for (const result of results) {
    console.log(
      `pre-push: ${result.ok ? "pass" : "FAIL"}  ${result.name} (${result.seconds.toFixed(1)}s)`
    );
  }
  const failed = results.filter((result) => !result.ok);
  for (const result of failed) {
    console.log(`\n===== ${result.name} =====\n${result.output}`);
  }
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/pre-push.test.mjs`
Expected: PASS, 12 tests.

- [ ] **Step 5: Replace the hook and fix the README**

`.husky/pre-push` (whole file):

```sh
# Pre-push VERIFIES; it does not mutate (review INFRA-07). It mirrors CI's
# lint, unit-test, and type-check gates in parallel and skips docs-only pushes.
node scripts/pre-push.mjs
```

In `.husky/README.md`, replace the line `- **`pre-push`** - Runs ESLint fixes and unit tests before allowing push` with:

```md
- **`pre-push`** - Runs `scripts/pre-push.mjs`: lint, unit tests (`--allowOnly=false`), and every tsc program in parallel; skips pushes that change only `*.md` or `docs/**`
```

Then read the rest of `.husky/README.md` and correct any other pre-push description that still says it runs `lint:fix` or ESLint fixes.

- [ ] **Step 6: Verify the script end to end**

Run each and check the stated result:

```bash
printf 'refs/heads/x %s refs/heads/x %s\n' "$(git rev-parse HEAD)" "$(git rev-parse HEAD~1)" | node scripts/pre-push.mjs; echo exit=$?
```

Expected: HEAD~1..HEAD is Task 1's `tsconfig.strict.json` commit (not docs), so all four checks run; four `pre-push: pass` lines; `exit=0`; total wall time about 16s.

```bash
printf 'refs/heads/x %s refs/heads/x %s\n' "$(git rev-parse main)" "$(git rev-parse main~1)" | node scripts/pre-push.mjs; echo exit=$?
```

Expected: if `main~1..main` touches only docs, `pre-push: docs-only push, checks skipped` and `exit=0`; otherwise the four checks run. State which happened and why (`git diff --name-only main~1 main`).

```bash
printf 'import { it } from "vitest";\nit.only("x", () => {});\n' > src/zz-only.test.ts
printf '\n' | node scripts/pre-push.mjs; echo exit=$?
rm src/zz-only.test.ts
```

Expected: `pre-push: FAIL  unit tests` with vitest output mentioning `.only`, and `exit=1`. If unit tests pass instead, `--allowOnly=false` is not being honored: try `--no-allowOnly`, re-run, and use whichever fails.

- [ ] **Step 7: Commit**

```bash
git add scripts/pre-push.mjs scripts/pre-push.test.mjs .husky/pre-push .husky/README.md
git commit -m "build(hooks): pre-push mirrors CI gates in parallel, skips docs-only pushes

Strict count: 190"
```

---

### Task 3: Stop hook gaps

**Files:**

- Modify: `scripts/agent-stop-check.sh:11-14` (changed-file detection), the cache-key block, the `typecheck_tests` check, and the `output=` chain

**Interfaces:**

- Consumes: nothing new. Task 9 adds the strict program to the chain and `tsconfig.strict.json` to the cache key.

- [ ] **Step 1: Reproduce the deletion gap (fails before the fix)**

```bash
mv src/lib/utils/dates.ts "$SCRATCH/dates.ts"
echo '{"session_id":"gap-test-1"}' | CLAUDE_PROJECT_DIR=$PWD scripts/agent-stop-check.sh; echo exit=$?
mv "$SCRATCH/dates.ts" src/lib/utils/dates.ts && git status -s
```

Expected: `exit=0` (the bug: `dates.ts` is imported, so tsc would fail, but the hook skips because no `.ts` file was added or modified; the branch so far changed only `.json`/`.mjs`/`.sh`). `git status -s` shows only this task's in-progress edits afterwards.

- [ ] **Step 2: Fix detection, cache key, and lint skip**

Replace:

```bash
changed=$( { git diff --name-only --diff-filter=ACMR "$base"; git ls-files --others --exclude-standard; } \
  | grep -E '\.(ts|tsx)$' | sort -u)
[ -z "$changed" ] && exit 0
```

with:

```bash
changed=$( { git diff --name-only --diff-filter=ACMR "$base"; git ls-files --others --exclude-standard; } \
  | grep -E '\.(ts|tsx)$' | sort -u)
deleted=$(git diff --name-only --diff-filter=D "$base" | grep -E '\.(ts|tsx)$')
[ -z "$changed" ] && [ -z "$deleted" ] && exit 0
```

In the cache-key block, replace:

```bash
  printf '%s\n' "$changed"
  cat $changed
```

with:

```bash
  printf '%s\n' "$changed"
  [ -z "$changed" ] || cat $changed
```

and replace the line `  cat eslint.config.js tsconfig.json tsconfig.tests.json package-lock.json 2>/dev/null` with:

```bash
  cat eslint.config.js tsconfig.json tsconfig.tests.json package-lock.json .nvmrc 2>/dev/null
  node -v
```

Replace:

```bash
if printf '%s\n' "$changed" | grep -qE '^(tests/|playwright\.config\.ts$)'; then
```

with:

```bash
if printf '%s\n' "$changed" "$deleted" | grep -qE '^(tests/|playwright\.config\.ts$)'; then
```

Replace:

```bash
output=$(npx eslint $changed 2>&1 \
```

with:

```bash
output=$( { [ -z "$changed" ] || npx eslint $changed 2>&1; } \
```

- [ ] **Step 3: Re-run the reproduction (passes after the fix)**

Same commands as Step 1 with `"session_id":"gap-test-2"`.
Expected: `exit=2` and stderr shows a tsc `Cannot find module` error for `@/lib/utils/dates`. `git status -s` shows only `scripts/agent-stop-check.sh` afterwards.

- [ ] **Step 4: Verify a clean tree still passes and caches**

```bash
echo '{"session_id":"gap-test-3"}' | CLAUDE_PROJECT_DIR=$PWD scripts/agent-stop-check.sh; echo exit=$?
time (echo '{"session_id":"gap-test-3"}' | CLAUDE_PROJECT_DIR=$PWD scripts/agent-stop-check.sh); echo exit=$?
```

Expected: both `exit=0`. No `.ts` file differs from `origin/main` yet, so both exit at the early return; the cached-pass path is exercised in Task 9.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-stop-check.sh
git commit -m "fix(hooks): stop check runs on deletion-only branches; Node version in cache key

Strict count: 190"
```

---

### Task 4: lib production sites (190 → 171)

**Files:**

- Modify: `src/lib/debts/sync.ts:170-176`
- Modify: `src/lib/debts/reversals.ts:169`
- Modify: `src/lib/csv-exporter.ts:275`
- Modify: `src/lib/duplicate-detector.ts:75-77`
- Modify: `src/lib/event-compactor.ts:223-253`
- Modify: `src/lib/pdf-import-duplicates.ts:59-64`
- Modify: `src/lib/sync/idempotency.ts:171-182`
- Modify: `src/lib/utils/dates.ts:21`
- Modify: `src/lib/supabaseQueries.ts:1492-1543`
- Test: `src/lib/utils/dates.test.ts`

**Interfaces:**

- Produces: no signature changes. `fetchBudgetGroupsFromServer` now omits a budget whose embedded category is missing (was a `TypeError` that failed the whole query).

Behavior notes (why only one test): every other site in this task is a guard after an existing check (length check, `SAFETY_BUFFER`, `parts.length < 4`) or an equivalent rewrite (`split("T")[0]` → `slice(0, 10)`, index loop → `entries()`), so there is no new reachable behavior to test. The budget change is not unit tested: the function is private with no Supabase-mock harness; the budgets E2E specs in Task 10's diff cover the page.

- [ ] **Step 1: Pin `parseLocalDate`'s malformed-input contract**

Add inside `describe("parseLocalDate", ...)` in `src/lib/utils/dates.test.ts`:

```ts
it("returns an Invalid Date when a date part is missing", () => {
  expect(Number.isNaN(parseLocalDate("2026-07").getTime())).toBe(true);
  expect(Number.isNaN(parseLocalDate("").getTime())).toBe(true);
});
```

Run: `npx vitest run src/lib/utils/dates.test.ts`
Expected: PASS (characterization: it pins the documented contract before the refactor).

- [ ] **Step 2: `dates.ts`**

Replace `  const [year, month, day] = dateString.split("-").map(Number);` with:

```ts
const [year = NaN, month = NaN, day = NaN] = dateString.split("-").map(Number);
```

- [ ] **Step 3: `debts/sync.ts`**

Replace:

```ts
if (outstanding.length === 0) {
  return "synced";
}

// Most recent item wins
outstanding.sort((a, b) => b.created_at.localeCompare(a.created_at));
const status = outstanding[0].status as SyncQueueStatus;
```

with:

```ts
// Most recent item wins
outstanding.sort((a, b) => b.created_at.localeCompare(a.created_at));
const latest = outstanding[0];
if (!latest) {
  return "synced";
}
const status = latest.status as SyncQueueStatus;
```

- [ ] **Step 4: `debts/reversals.ts` and `csv-exporter.ts`**

`reversals.ts:169`: replace `new Date().toISOString().split("T")[0]` with `new Date().toISOString().slice(0, 10)`.
`csv-exporter.ts:275`: replace `return dateObj.toISOString().split("T")[0];` with `return dateObj.toISOString().slice(0, 10);`.

- [ ] **Step 5: `duplicate-detector.ts`**

Replace:

```ts
  for (let i = 0; i < importData.length; i++) {
    const importRow = importData[i];
    const fingerprint = generateFingerprint(importRow);
```

with:

```ts
  for (const [i, importRow] of importData.entries()) {
    const fingerprint = generateFingerprint(importRow);
```

- [ ] **Step 6: `event-compactor.ts`**

Replace:

```ts
    const events = await db.events.where("entity_id").equals(entityId).sortBy("lamport_clock");

    // Skip if not enough events to compact
    if (events.length <= SAFETY_BUFFER) {
```

with:

```ts
    const events = await db.events.where("entity_id").equals(entityId).sortBy("lamport_clock");
    const firstEvent = events[0];

    // Skip if not enough events to compact
    if (!firstEvent || events.length <= SAFETY_BUFFER) {
```

Then replace `events[0].household_id`, `events[0].entity_type`, and `events[0].actor_user_id` (lines 244, 246, 253) with `firstEvent.household_id`, `firstEvent.entity_type`, `firstEvent.actor_user_id`.

- [ ] **Step 7: `pdf-import-duplicates.ts`**

Replace:

```ts
for (let i = 0; i < rowFingerprints.length; i++) {
  if (existingFingerprints.has(rowFingerprints[i])) {
    duplicateIndices.add(i);
  }
}
```

with:

```ts
rowFingerprints.forEach((fingerprint, i) => {
  if (existingFingerprints.has(fingerprint)) {
    duplicateIndices.add(i);
  }
});
```

- [ ] **Step 8: `sync/idempotency.ts`**

Replace:

```ts
// Parse from end (lamport clock is always last)
const lamportClockStr = parts[parts.length - 1];
const lamportClock = parseInt(lamportClockStr, 10);
```

with:

```ts
// Parse from end (lamport clock is always last); device ID is first
const lamportClockStr = parts[parts.length - 1];
const deviceId = parts[0];
if (lamportClockStr === undefined || deviceId === undefined) {
  return null;
}
const lamportClock = parseInt(lamportClockStr, 10);
```

and delete:

```ts
// Device ID is first component (may be part of UUID)
const deviceId = parts[0];
```

- [ ] **Step 9: `supabaseQueries.ts` (`fetchBudgetGroupsFromServer`)**

Replace:

```ts
const categoryIds = budgets.map((b: { categories: { id: string }[] | { id: string } }) => {
  const cat = Array.isArray(b.categories) ? b.categories[0] : b.categories;
  return cat.id;
});
```

with:

```ts
const categoryIds = budgets.flatMap((b: { categories: { id: string }[] | { id: string } }) => {
  const cat = Array.isArray(b.categories) ? b.categories[0] : b.categories;
  return cat ? [cat.id] : [];
});
```

In the `budgetObjects` block, change `const budgetObjects: Budget[] = budgets.map(` to `const budgetObjects: Budget[] = budgets.flatMap(`, then replace:

```ts
const category = Array.isArray(b.categories) ? b.categories[0] : b.categories;
const parent = parents?.find((p) => p.id === category.parent_id);
```

with:

```ts
const category = Array.isArray(b.categories) ? b.categories[0] : b.categories;
if (!category) return [];
const parent = parents?.find((p) => p.id === category.parent_id);
```

and wrap the returned object: `      return {` → `      return [{`, and its closing `      };` (the line after `isOverBudget: actualSpent > b.amount_cents,`) → `      }];`. Run `npx prettier --write src/lib/supabaseQueries.ts` afterwards.

- [ ] **Step 10: Verify**

```bash
npx tsc --noEmit -p tsconfig.strict.json | grep -c "error TS"
npx tsc --noEmit -p tsconfig.strict.json | grep -E "src/lib/(debts/sync|debts/reversals|csv-exporter|duplicate-detector|event-compactor|pdf-import-duplicates|sync/idempotency|utils/dates|supabaseQueries)\.ts" | wc -l
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.tests.json && npm run lint && npx vitest run
```

Expected: `171`, `0`, and every command exits 0 (vitest 76 files; tests = 1012 + 12 from Task 2 + 1 from Step 1 = 1025; report the actual numbers).

- [ ] **Step 11: Commit**

```bash
git add src/lib
git commit -m "fix(types): narrow indexed access in lib production code

Strict count: 171"
```

---

### Task 5: bdo-credit-card parser (171 → 153)

**Files:**

- Modify: `src/lib/pdf-parsers/bdo-credit-card.ts:49-106` (`reconstructLines`), `:161-166` (`convertBDODate`), `:194` (`parseTransactionLine`)
- Test: `src/lib/pdf-parsers/__tests__/bdo-credit-card.test.ts`

**Interfaces:**

- Produces: `convertBDODate(mmddyy: string): string` now throws `Error('Invalid BDO date: "<input>"')` when the input lacks three `/`-separated parts (before: returned a string containing `NaN`). Callers only pass regex-validated `\d{2}/\d{2}/\d{2}` captures, so no caller changes.

- [ ] **Step 1: Write the failing test**

Add inside `describe("convertBDODate", ...)`:

```ts
it("throws on input without three slash-separated parts", () => {
  expect(() => convertBDODate("12/13")).toThrow('Invalid BDO date: "12/13"');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/pdf-parsers/__tests__/bdo-credit-card.test.ts -t "throws on input"`
Expected: FAIL, `expected [Function] to throw an error`.

- [ ] **Step 3: `convertBDODate`**

Replace:

```ts
const [mm, dd, yy] = mmddyy.split("/");
const year = parseInt(yy, 10);
```

with:

```ts
const [mm, dd, yy] = mmddyy.split("/");
if (mm === undefined || dd === undefined || yy === undefined) {
  throw new Error(`Invalid BDO date: "${mmddyy}"`);
}
const year = parseInt(yy, 10);
```

- [ ] **Step 4: `parseTransactionLine`**

After `  const [, saleDate, , descriptionRaw, amountRaw] = match;` insert:

```ts
if (saleDate === undefined || descriptionRaw === undefined || amountRaw === undefined) {
  return null;
}
```

(All four `TRANSACTION_RE` groups are required, so this never fires today; it keeps the function's "not a transaction" result if the regex ever gains an optional group.)

- [ ] **Step 5: `reconstructLines`**

Replace:

```ts
  // Group items whose y-coordinates are within tolerance
  const groups: PDFTextItem[][] = [];
  let currentGroup: PDFTextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= yTolerance) {
```

with:

```ts
  // Group items whose y-coordinates are within tolerance
  const [first, ...rest] = sorted;
  if (!first) return [];
  const groups: PDFTextItem[][] = [];
  let currentGroup: PDFTextItem[] = [first];
  let currentY = first.y;

  for (const item of rest) {
    if (Math.abs(item.y - currentY) <= yTolerance) {
```

and replace:

```ts
// Concatenate with spacing based on gaps
let text = byX[0].text;
for (let i = 1; i < byX.length; i++) {
  const prev = byX[i - 1];
  const curr = byX[i];
  const gap = curr.x - (prev.x + prev.width);

  if (gap > 30) {
    // Large column gap — insert multiple spaces to preserve column alignment
    text += "    " + curr.text;
  } else if (gap > 5) {
    // Small gap — single space
    text += " " + curr.text;
  } else {
    // Items are adjacent or overlapping
    text += curr.text;
  }
}
```

with:

```ts
// Concatenate with spacing based on gaps
let text = "";
let prev: PDFTextItem | undefined;
for (const curr of byX) {
  if (!prev) {
    text = curr.text;
  } else {
    const gap = curr.x - (prev.x + prev.width);

    if (gap > 30) {
      // Large column gap — insert multiple spaces to preserve column alignment
      text += "    " + curr.text;
    } else if (gap > 5) {
      // Small gap — single space
      text += " " + curr.text;
    } else {
      // Items are adjacent or overlapping
      text += curr.text;
    }
  }
  prev = curr;
}
```

- [ ] **Step 6: Verify**

```bash
npx vitest run src/lib/pdf-parsers/__tests__/bdo-credit-card.test.ts
npx tsc --noEmit -p tsconfig.strict.json | grep -c "error TS"
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.tests.json && npm run lint && npx vitest run
```

Expected: all parser tests PASS (the 10 existing `reconstructLines` tests guard the refactor), `153`, every command exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdf-parsers
git commit -m "fix(pdf-import): narrow indexed access in BDO parser; reject malformed dates

Strict count: 153"
```

---

### Task 6: UI components and hooks (153 → 143)

**Files:**

- Modify: `src/components/analytics/AnalyticsDashboard.tsx:158`
- Modify: `src/components/dashboard/CategoryChart.tsx:35-40`
- Modify: `src/components/dashboard/MonthlyChart.tsx:28-57`
- Modify: `src/components/pdf-import/PDFImportPage.tsx:57-59`
- Modify: `src/components/pdf-import/steps/PreviewStep.tsx:50-55, 122-123, 177-178`
- Modify: `src/hooks/useAnalytics.ts:126-136`

**Interfaces:**

- Produces: `PreviewStep`'s local `getEffectiveRow` signature becomes `(base: ParsedTransactionRow, index: number) => ParsedTransactionRow` (file-local).

Behavior notes: `MonthlyChart`'s tooltip now reads income/expense from the hovered datum (`incomeCents`/`expenseCents`, the same values the two `Line` `dataKey`s plot) instead of `payload[0]`/`payload[1]` by position. If a series is ever absent from `payload`, the old code crashed or showed expense as income. `useAnalytics` now falls back to `"Uncategorized"` when the category embed is an empty array (was `undefined`).

- [ ] **Step 1: `AnalyticsDashboard.tsx` (`generateColor`)**

Replace `  return colors[index % colors.length];` with:

```ts
return colors[index % colors.length] ?? "#6b7280";
```

- [ ] **Step 2: `CategoryChart.tsx` (`CustomTooltip`)**

Replace:

```tsx
if (!active || !payload || !payload.length) {
  return null;
}

const data = payload[0].payload;
```

with:

```tsx
const data = payload?.[0]?.payload;
if (!active || !data) {
  return null;
}
```

- [ ] **Step 3: `MonthlyChart.tsx`**

Replace the `CustomTooltipProps` payload element type:

```ts
  payload?: Array<{
    value: number;
    payload: TooltipPayload;
  }>;
```

with:

```ts
  payload?: Array<{
    payload: TooltipPayload;
  }>;
```

Replace:

```tsx
if (!active || !payload || !payload.length) {
  return null;
}

const data = payload[0].payload;
```

with:

```tsx
const data = payload?.[0]?.payload;
if (!active || !data) {
  return null;
}
```

Replace `{formatPHP(payload[0].value)}` with `{formatPHP(data.incomeCents)}` and `{formatPHP(payload[1].value)}` with `{formatPHP(data.expenseCents)}`.

- [ ] **Step 4: `PDFImportPage.tsx`**

Replace:

```tsx
      if (!bankId && workerPages.length > 0) {
        const firstPageText = workerPages[0].items.map((item) => item.text).join(" ");
```

with:

```tsx
      const firstPage = workerPages[0];
      if (!bankId && firstPage) {
        const firstPageText = firstPage.items.map((item) => item.text).join(" ");
```

- [ ] **Step 5: `PreviewStep.tsx`**

Replace:

```tsx
  const getEffectiveRow = (index: number): ParsedTransactionRow => {
    const base = parsedRows[index];
    const edits = userEdits.get(index);
```

with:

```tsx
  const getEffectiveRow = (base: ParsedTransactionRow, index: number): ParsedTransactionRow => {
    const edits = userEdits.get(index);
```

At both call sites (card list near line 122, table near line 177) replace:

```tsx
{parsedRows.map((_, index) => {
                const row = getEffectiveRow(index);
```

with the same indentation and:

```tsx
{parsedRows.map((base, index) => {
                const row = getEffectiveRow(base, index);
```

- [ ] **Step 6: `useAnalytics.ts`**

Replace:

```ts
const categoryName = Array.isArray(categoryData)
  ? categoryData[0]?.name
  : categoryData?.name || "Uncategorized";
if (!budgetsByCategory[budget.category_id]) {
  budgetsByCategory[budget.category_id] = {
    total: 0,
    name: categoryName,
  };
}
budgetsByCategory[budget.category_id].total += budget.amount_cents;
```

with:

```ts
const categoryName =
  (Array.isArray(categoryData) ? categoryData[0]?.name : categoryData?.name) || "Uncategorized";
const existing = budgetsByCategory[budget.category_id];
if (existing) {
  existing.total += budget.amount_cents;
} else {
  budgetsByCategory[budget.category_id] = {
    total: budget.amount_cents,
    name: categoryName,
  };
}
```

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit -p tsconfig.strict.json | grep -c "error TS"
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.tests.json && npm run lint && npx vitest run
npm run build >/dev/null && npm run size | tail -3
```

Expected: `143`, every command exits 0, bundle ≤ 355 KB gz (report the number).

- [ ] **Step 8: Commit**

```bash
git add src/components src/hooks
git commit -m "fix(types): narrow indexed access in charts, analytics, and PDF import

MonthlyChart's tooltip reads the hovered datum instead of payload by
position, so a missing series can no longer swap or crash the values.

Strict count: 143"
```

---

### Task 7: TransactionList (143 → 84)

**Files:**

- Modify: `src/components/TransactionList.tsx:170-172, 293, 298, 611, 754`
- Test: `src/components/TransactionList.test.tsx` (existing; run only)

**Interfaces:**

- None. Rows whose index is past the loaded data render nothing for that frame (was a `TypeError` on `transaction.id`).

- [ ] **Step 1: Virtual item indices**

Replace:

```ts
const lastVirtualIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;
const firstVirtualIndex = virtualItems.length > 0 ? virtualItems[0].index : -1;
```

with:

```ts
const lastVirtualIndex = virtualItems.at(-1)?.index ?? -1;
const firstVirtualIndex = virtualItems[0]?.index ?? -1;
```

Replace `  const firstRenderedStart = virtualItems.length > 0 ? virtualItems[0].start : 0;` with:

```ts
const firstRenderedStart = virtualItems[0]?.start ?? 0;
```

Replace `    const topRowId = transactions && transactions.length > 0 ? transactions[0].id : undefined;` with:

```ts
const topRowId = transactions?.[0]?.id;
```

- [ ] **Step 2: Row guards (table and card maps)**

At line 611 (table) replace:

```tsx
const transaction = transactions[virtualRow.index];
```

with:

```tsx
const transaction = transactions[virtualRow.index];
if (!transaction) return null;
```

At line 754 (cards) replace:

```tsx
const transaction = transactions[virtualRow.index];
```

with:

```tsx
const transaction = transactions[virtualRow.index];
if (!transaction) return null;
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit -p tsconfig.strict.json | grep -c "error TS"
npx tsc --noEmit -p tsconfig.strict.json | grep -c TransactionList
npx vitest run src/components/TransactionList.test.tsx
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.tests.json && npm run lint && npx vitest run
npm run build >/dev/null && npm run size | tail -3
```

Expected: `84`, `0`, TransactionList tests PASS, every command exits 0, bundle ≤ 355 KB gz.

- [ ] **Step 4: Smoke**

Run: `PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke -- --reporter=list 2>&1 | tail -3`
Expected: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/components/TransactionList.tsx
git commit -m "fix(transactions): skip virtual rows past the loaded data

Strict count: 84"
```

---

### Task 8: Test files (84 → 0)

**Files:**

- Modify: `src/lib/offline/syncQueue.test.ts` (28), `transactions.test.ts` (12), `budgets.test.ts` (11), `reads.test.ts` (4), `accounts.test.ts` (4), `transfers.test.ts` (3), `aggregates.test.ts` (3), `categories.test.ts` (1)
- Modify: `src/lib/sync/__tests__/processor.test.ts` (8)
- Modify: `src/lib/debts/__tests__/crud.test.ts` (4), `payments.test.ts` (3), `reversals.test.ts` (1), `test-utils.ts` (2)

**Interfaces:** none.

Rules, applied to every line the strict program reports in these files:

1. Put the `!` where the indexed value is first bound, not at each use. `const [item] = await db.syncQueue.toArray();` followed by `item.id` becomes `const item = (await db.syncQueue.toArray())[0]!;`. `const [queueItem] = …` (syncQueue.test.ts:93) likewise.
2. Inline reads inside `expect`: `expect(rows[0].status)` → `expect(rows[0]!.status)`; nested `groups[0].budgets[0]` → `groups[0]!.budgets[0]!`.
3. Arguments: `db.syncQueue.update(pending[0].id, …)` → `db.syncQueue.update(pending[0]!.id, …)`.
4. Date strings in `debts/__tests__/test-utils.ts` (`:278` and the `today` used at `:163`): `.toISOString().split("T")[0]` → `.toISOString().slice(0, 10)` (no `!`).
5. Only add `!` where a preceding line in the same test asserts the length or definedness, or the setup just inserted the row. If a site has neither, add `expect(rows).toHaveLength(n)` (with the count the test setup implies) before it, then the `!`.

- [ ] **Step 1: List the sites**

Run: `npx tsc --noEmit -p tsconfig.strict.json | grep "error TS" | cut -d'(' -f1 | sort | uniq -c`
Expected: the 13 files above with the listed counts (total 84).

- [ ] **Step 2: Fix `src/lib/offline/*.test.ts`**

Apply the rules file by file, re-running `npx tsc --noEmit -p tsconfig.strict.json | grep "src/lib/offline/.*test" | wc -l` until `0`.

- [ ] **Step 3: Fix `src/lib/sync/__tests__/processor.test.ts` and `src/lib/debts/__tests__/*`**

Same rules, until `npx tsc --noEmit -p tsconfig.strict.json | grep -c "error TS"` prints `0`.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p tsconfig.strict.json; echo strict=$?
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.tests.json && npm run lint && npx vitest run
git diff --stat
```

Expected: `strict=0` with no output, every command exits 0, and the diff touches only the 13 test files.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "test: assert indexed rows in strict-scoped tests

Strict count: 0"
```

---

### Task 9: Wire enforcement

**Files:**

- Modify: `.github/workflows/ci.yml` (after the "Typecheck tests" step)
- Modify: `scripts/agent-stop-check.sh` (cache key and check chain)
- Modify: `scripts/pre-push.mjs` (`CHECKS`)

**Interfaces:**

- Consumes: `CHECKS` from Task 2; the Stop hook block from Task 3.

- [ ] **Step 1: CI step**

After the "Typecheck tests" step in `.github/workflows/ci.yml` insert:

```yaml
# noUncheckedIndexedAccess over sync, offline, debts and their imports
# (roadmap 4.8). Delete with tsconfig.strict.json when Phase 3 enables
# the flag repo-wide.
- name: Typecheck strict
  run: npx tsc --noEmit -p tsconfig.strict.json
```

- [ ] **Step 2: Stop hook**

In the cache-key `cat` line add `tsconfig.strict.json`:

```bash
  cat eslint.config.js tsconfig.json tsconfig.tests.json tsconfig.strict.json package-lock.json .nvmrc 2>/dev/null
```

Replace:

```bash
  && npx tsc --noEmit -p tsconfig.json 2>&1 \
```

with:

```bash
  && npx tsc --noEmit -p tsconfig.json 2>&1 \
  && npx tsc --noEmit -p tsconfig.strict.json 2>&1 \
```

- [ ] **Step 3: Pre-push**

Append to `CHECKS` in `scripts/pre-push.mjs`:

```js
  { name: "tsc strict", command: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.strict.json"] },
```

- [ ] **Step 4: Prove each gate fails on a strict error**

```bash
printf 'export function firstOf(xs: number[]): number {\n  return xs[0];\n}\n' > src/lib/sync/zz-strict-probe.ts
npx tsc --noEmit -p tsconfig.strict.json; echo strict=$?
echo '{"session_id":"wire-test-1"}' | CLAUDE_PROJECT_DIR=$PWD scripts/agent-stop-check.sh; echo stop=$?
printf '\n' | node scripts/pre-push.mjs | head -8; echo prepush=${PIPESTATUS[1]}
rm src/lib/sync/zz-strict-probe.ts && git status -s
```

Expected: `strict=2` with `TS2322` at `zz-strict-probe.ts(2,…)`; `stop=2` with the same error on stderr; pre-push prints `pre-push: FAIL  tsc strict` and `prepush=1`; status shows only this task's intended edits.

- [ ] **Step 5: Prove they pass clean**

```bash
echo '{"session_id":"wire-test-2"}' | CLAUDE_PROJECT_DIR=$PWD scripts/agent-stop-check.sh; echo stop=$?
printf '\n' | node scripts/pre-push.mjs; echo prepush=$?
```

Expected: `stop=0`; five `pre-push: pass` lines; `prepush=0`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml scripts/agent-stop-check.sh scripts/pre-push.mjs
git commit -m "ci: enforce tsconfig.strict.json in CI, Stop hook, and pre-push

Strict count: 0"
```

---

### Task 10: Acceptance

**Files:**

- Modify: `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 1b checkbox, Resume state)
- Modify: this plan (Progress, Acceptance results)

- [ ] **Step 1: Static gates**

```bash
for p in tsconfig.json tsconfig.tests.json tsconfig.strict.json; do npx tsc --noEmit -p $p; echo "$p=$?"; done
npm run lint 2>&1 | tail -3; npx vitest run 2>&1 | grep -E "Test Files|Tests "
npm run build >/dev/null; echo build=$?; npm run size | tail -3
npm audit --omit=dev --audit-level=high | tail -1
```

Expected: three `=0`; lint 0 errors/0 warnings; vitest all passing (record counts); `build=0`; bundle ≤ 355 KB gz (record); `found 0 vulnerabilities`.

- [ ] **Step 2: Smoke**

Run: `PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke -- --reporter=list 2>&1 | tail -3`
Expected: `11 passed`.

- [ ] **Step 3: Full chromium E2E diff against the baseline**

```bash
PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e -- --project=chromium --reporter=list > "$SCRATCH/e2e-branch.txt" 2>&1; tail -6 "$SCRATCH/e2e-branch.txt"
perl -ne 'print "$1 $2 › $3\n" if /^\s*(✓|✘|-)\s+\d+\s+\[chromium\]\s+›\s+(\S+?):\d+:\d+\s+›\s+(.*?)(?:\s+\(\d[\d.]*m?s\))?\s*$/' "$SCRATCH/e2e-branch.txt" | sort -u > "$SCRATCH/e2e-branch-norm.txt"
grep '^✓' docs/plans/2026-10-02-phase-1b-e2e-baseline.txt | sed 's/^✓ //' | sort > "$SCRATCH/pass-main.txt"
grep '^✓' "$SCRATCH/e2e-branch-norm.txt" | sed 's/^✓ //' | sort > "$SCRATCH/pass-branch.txt"
echo "regressions:"; comm -23 "$SCRATCH/pass-main.txt" "$SCRATCH/pass-branch.txt"
echo "newly passing:"; comm -13 "$SCRATCH/pass-main.txt" "$SCRATCH/pass-branch.txt"
```

Expected: `regressions:` followed by nothing. Any listed test passed on `main` and fails here: re-run that spec alone twice (`npx playwright test --project=chromium <spec> --reporter=list`); if it fails both times it is a regression and blocks merge (debug with superpowers:systematic-debugging); if it passes, record it as flaky in this plan. Record the newly-passing list too.

- [ ] **Step 4: Screenshot pass**

Use the `run` skill (or a Playwright script against `npm run preview` with the E2E test user from `tests/e2e/fixtures`) to capture, on chromium:

1. `/transactions` in table presentation, scrolled so rows load past the first page
2. `/transactions` in card presentation (narrow viewport, 390px wide)
3. Dashboard with the monthly chart tooltip hovered over a month that has both income and expenses, and the category chart tooltip hovered
4. `/analytics`
5. PDF import preview step (a fixture PDF from `src/lib/pdf-parsers/__tests__` or `tests/e2e/fixtures`, if one exists; if none exists, record that this screen was not captured)

Open every screenshot with Read and write one line per screenshot in this plan's Acceptance results: what it shows, and whether the tooltip shows separate Income and Expenses values that match the hovered month.

- [ ] **Step 5: Live pre-push**

Ask the user to run `! git push -u origin phase-1b-strict-tsconfig`. Expected in their output: five `pre-push: pass` lines, then the push. Then commit a docs-only change (Step 6) and ask them to push again. Expected: `pre-push: docs-only push, checks skipped`.

- [ ] **Step 6: Record results**

In this plan: check off Task 10, add an "Acceptance results" section with the numbers from Steps 1-5. In the roadmap: check the Phase 1b box, append "(merged … at `<sha>`)" after merge, and update "Resume state". Commit:

```bash
git add docs/plans
git commit -m "docs(plans): Phase 1b acceptance results"
```

- [ ] **Step 7: Finish the branch**

Use superpowers:finishing-a-development-branch.

## Acceptance results (2026-10-02, branch head `e50458e`)

- Static gates (Node 26.10.0): `tsc` exit 0 for `tsconfig.json`, `tsconfig.tests.json`, `tsconfig.strict.json`; lint 0 errors / 0 warnings; vitest 76 files / 1026 tests; build ok; bundle 352.6 KB gz (budget 355, 352.5 before 1b); `npm audit --omit=dev` found 0 vulnerabilities.
- Chromium smoke: 11 passed.
- Full chromium E2E: 37 passed / 33 failed / 24 skipped, identical totals to the `main` baseline. Per-test diff: one "regression", `settings.spec.ts` "export accounts CSV triggers download", was skipped (not failed) because the serial settings spec skips after an earlier failure; re-run alone twice it was skipped once and passed once. One "newly passing", `settings.spec.ts` "export categories CSV", is the same flake in reverse. Neither file is touched by 1b. Verdict: no regression.
- Enforcement (Task 9): a probe `src/lib/sync/zz-strict-probe.ts` failed all three gates (`tsc` strict exit 2 with TS2322, Stop hook exit 2, pre-push `FAIL  tsc strict` exit 1); clean tree passed all three; Stop hook cached pass 11.99s then 0.23s.
- Screenshots (chromium, 1440x900 unless noted), each opened and read:
  - Transactions table: 50 transactions, "In ₱80,000.00 Out ₱18,553.95", rows render with date, description, category, account, amount, status, actions; long seeded category/account names push the Amount column past the card edge (layout, pre-existing, not touched by 1b).
  - Transactions cards (390x844): card list with title, date, amount and "Pending", "Select all", bottom nav; no blank or broken cards.
  - Dashboard monthly tooltip: "Oct / Income: ₱30,000.00 / Expenses: ₱17,955.00", matching the Total Income and Total Expenses cards above it, so the tooltip reads the hovered datum correctly.
  - Dashboard category tooltip: "[E2E] Shots A … ₱11,775.00 / 65.6% of total", matching the legend row.
  - Analytics: overview cards, top categories, monthly trend and category pie render. "Avg. Monthly Spending" shows "₱2,650.56.428571428" (see Decisions & Deferrals; pre-existing).
  - PDF import preview: not captured (no PDF fixture in the repo).
- Final whole-branch review: "Ready after fixes", doc-only (README lines fixed in the acceptance commit; CLAUDE.md wording left for the user).
- Live pre-push (user terminal, first push of the branch at `619e40e`): `pre-push: pass` for lint 19.5s, unit tests 19.6s, tsc src 7.7s, tsc tests 1.2s, tsc strict 13.7s, then the push succeeded. Docs-only skip: verified by the push of this commit (see the next line once recorded).

## Decisions & Deferrals

- **Deferred: `reversals.ts` stamps `payment_date` with the UTC date (found while planning).** `new Date().toISOString().slice(0, 10)` is yesterday's date between 00:00 and 08:00 in Manila, which contradicts CLAUDE.md's "transaction date is the user's local date". 1b keeps the behavior (`split("T")[0]` → `slice(0, 10)` is equivalent). Same pattern in `debts/__tests__/test-utils.ts` and `csv-exporter.ts`'s `Date` branch. Revisit: next debts work; use the user's local date (`format(new Date(), "yyyy-MM-dd")`) with a timezone test like `dates.test.ts`.
- **Only `convertBDODate` gains a test-driven throw (found while planning).** The spec expected throws in debts/sync and idempotency, but every other site is guarded by an existing check (`length === 0`, `SAFETY_BUFFER`, `parts.length < 4`, all-required regex groups), so the new guards are unreachable and keep each function's existing result. Revisit: never.
- **Budgets with a missing category embed are omitted, not thrown (decided while planning).** It is a read path; a throw fails the whole Budgets page. `budgets.category_id` is `NOT NULL REFERENCES categories`, so the embed is only missing if RLS hides the category. Revisit: if a budget is reported missing from the page.
- **Deferred: Analytics "Avg. Monthly Spending" renders fractional cents (found by the acceptance screenshots).** `useAnalytics.ts:364` divides `totalExpenses / monthCount` and passes the non-integer to `formatPHP`, which shows "₱2,650.56.428571428". Pre-existing (2025-10-29), not in the 1b diff. Revisit: next analytics work; round to integer cents (`Math.round`) before formatting, with a test.
- **Deferred: `settings.spec.ts` is order-dependent (found by the E2E diff).** It runs serially, so one failure skips the rest and the export tests flip between skipped and passed across runs. Revisit: when the E2E suite's pre-existing failures are worked down.
- **Fixed after the final review (decided 2026-10-02):** the Stop hook now diffs with `--no-renames`, so a `.ts` renamed to another extension counts as a deletion (`81658fc`); pre-push reads stdin only when it is not a terminal, so `node scripts/pre-push.mjs` run by hand runs the full checks (`f7be290`).
- **Deferred (final review triage): budget with a missing category dropped without a warning; repeated `x[0]!` in test `expect`s; `parsePushedRefs` multi-ref untested.** Why: unreachable in practice, style only, or covered through `shouldSkipChecks`. Revisit: if hit in practice.
- **CLAUDE.md rewritten to 73 lines (decided 2026-10-02).** Why: the user asked for an instructional, token-light file that references docs to load on demand. The stale Supabase-port infra entry was dropped (the health poll already reads `API_URL`), and the E2E entry now cites the 2026-10-02 baseline.
