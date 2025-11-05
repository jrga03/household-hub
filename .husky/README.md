# Git Hooks (`.husky/`)

## Purpose

Automated code quality checks via Husky git hooks. Ensures consistent formatting, linting, and test passage before code enters the repository.

## Directory Contents

**2 active hooks:**

- **`pre-commit`** - Runs Prettier formatting on staged files via lint-staged
- **`pre-push`** - Runs ESLint fixes and unit tests before allowing push

**Infrastructure files:**

- `_/` directory - Husky's internal hook templates and scripts

## Hook Overview

### pre-commit (.husky/pre-commit:1)

**Purpose:** Auto-format staged files before commit

**Command:**

```bash
npx lint-staged
```

**Behavior:**

1. Identifies staged files (via git index)
2. Runs Prettier on matching file patterns
3. Automatically stages formatted files
4. If formatting changes files, commit includes updates
5. If Prettier fails, commit is blocked

**File patterns matched** (package.json:22-29):

```json
{
  "*.{ts,tsx,js,jsx}": ["prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
}
```

**Affected files:**

- TypeScript/JavaScript: All `.ts`, `.tsx`, `.js`, `.jsx` files
- Configuration: `package.json`, `.prettierrc`, `tsconfig.json`
- Documentation: All `.md` files
- Infrastructure: `.yml`, `.yaml` files

**Performance:**

- Only formats staged files (not entire codebase)
- Typical run time: <2 seconds for 5-10 files
- Negligible overhead for normal commits

### pre-push (.husky/pre-push:1-2)

**Purpose:** Ensure code quality and test passage before pushing to remote

**Commands:**

```bash
npm run lint:fix
npm test
```

**Behavior:**

1. **ESLint auto-fix** (`lint:fix` → `eslint . --fix`):
   - Scans entire codebase for linting issues
   - Automatically fixes common issues (unused vars, formatting)
   - Fails if unfixable errors remain
   - Typical run time: 3-5 seconds

2. **Unit tests** (`test` → `vitest`):
   - Runs all Vitest unit tests
   - Fails if any test fails
   - Typical run time: 5-10 seconds

**Total pre-push time:** 8-15 seconds

**Bypass option** (not recommended):

```bash
git push --no-verify  # Skip pre-push hook
```

## Integration with Development Workflow

### Standard Commit Flow

```
1. Developer makes changes
2. Developer stages files: git add src/file.ts
3. Developer attempts commit: git commit -m "feat: new feature"
4. pre-commit hook triggers:
   - Prettier formats staged files
   - Files automatically restaged if changed
5. Commit completes successfully
6. Developer attempts push: git push
7. pre-push hook triggers:
   - ESLint runs and auto-fixes issues
   - All unit tests run
   - If all pass, push proceeds
   - If any fail, push is blocked
8. Push completes successfully
```

### Hook Failure Handling

**Pre-commit failure (Prettier):**

```bash
# Scenario: Prettier encounters syntax error
$ git commit -m "fix: update validation"
✖ prettier --write:
  src/lib/validation.ts: SyntaxError: Unexpected token

# Resolution:
1. Fix syntax error in file
2. Re-stage: git add src/lib/validation.ts
3. Retry commit
```

**Pre-push failure (ESLint):**

```bash
# Scenario: Unfixable linting errors
$ git push
> lint:fix

✖ ESLint found 2 errors:
  src/components/Form.tsx:15 - 'useState' is not defined
  src/lib/utils.ts:42 - Unexpected any type

# Resolution:
1. Fix linting errors manually
2. Commit fixes: git commit -am "fix: resolve linting errors"
3. Retry push
```

**Pre-push failure (Tests):**

```bash
# Scenario: Failing unit test
$ git push
> test

FAIL src/lib/currency.test.ts
  ✓ formatPHP formats correctly (2ms)
  ✗ parsePHP handles invalid input (8ms)

# Resolution:
1. Fix failing test or implementation
2. Verify locally: npm test
3. Commit fix: git commit -am "fix: update currency parsing"
4. Retry push
```

## Husky Setup

### Installation (package.json:54, 20)

**Dependencies:**

```json
{
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^16.2.4"
  },
  "scripts": {
    "prepare": "husky"
  }
}
```

**Initialization:**

```bash
npm install              # Runs "prepare" script
                         # Husky installs git hooks automatically
```

**Hook location:**

- Husky hooks: `.husky/pre-commit`, `.husky/pre-push`
- Git hooks: `.git/hooks/` (symlinked to Husky)

### Manual Hook Installation

**If hooks not working:**

```bash
# Verify Husky installed
npx husky --version

# Reinstall hooks
npx husky install
```

## Lint-Staged Configuration

### Configuration Location (package.json:22-29)

**Inline in package.json:**

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

### Pattern Matching

**Glob patterns:**

- `*.{ts,tsx,js,jsx}` - All TypeScript and JavaScript files
- `*.{json,md,yml,yaml}` - Configuration and documentation

**Ignored files** (via `.gitignore`):

- `node_modules/`
- `dist/`
- `build/`
- `.next/`
- Coverage reports

### Adding New File Types

**Example: Add CSS formatting:**

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"],
    "*.css": ["prettier --write"]
  }
}
```

## Prettier Configuration

### Configuration File

**Location:** `.prettierrc` (root directory)

**Key settings:**

- Semi-colons: Required (`;`)
- Single quotes: Enabled (`'string'`)
- Trailing commas: ES5 (objects, arrays)
- Tab width: 2 spaces
- Print width: 80 characters (default)

**Ignore file:** `.prettierignore`

- Same patterns as `.gitignore`
- Prevents formatting generated files

## ESLint Configuration

### Configuration File (eslint.config.js)

**Flat config format:**

- TypeScript strict rules
- React/JSX rules
- React Hooks exhaustive deps
- Accessibility checks (jsx-a11y)

**Key rules enforced:**

- `@typescript-eslint/no-explicit-any`: error
- `@typescript-eslint/no-unused-vars`: warn (with `_` prefix ignore)
- `react-hooks/exhaustive-deps`: error
- `react-hooks/rules-of-hooks`: error

## Unit Tests

### Test Runner: Vitest (package.json:13)

**Command:**

```bash
npm test              # Runs Vitest in watch mode (dev)
npm run test:unit     # Alias for npm test
```

**Pre-push runs:** `vitest run` (single run, no watch)

**Test location:**

- Unit tests: `src/**/*.test.ts`, `src/**/*.test.tsx`
- E2E tests: `tests/` (not run on pre-push)

**Coverage:** Not enforced in pre-push (optional local check)

## Performance Considerations

### Hook Speed

**Pre-commit (lint-staged):**

- Fast: Only formats staged files
- ~2 seconds for typical commit (5-10 files)
- Minimal developer friction

**Pre-push (lint + test):**

- Moderate: Scans entire codebase
- ~8-15 seconds total
- Acceptable trade-off for quality assurance

**Optimization tips:**

1. Commit frequently (smaller lint-staged runs)
2. Run tests locally before pushing (`npm test`)
3. Fix linting issues during development (IDE integration)

### Skipping Hooks (Emergency Use Only)

**Skip pre-commit:**

```bash
git commit -m "message" --no-verify
# OR
git commit -m "message" -n
```

**Skip pre-push:**

```bash
git push --no-verify
# OR
git push --no-verify origin branch-name
```

**When to skip:**

- Emergency hotfix (with team approval)
- Known failing test unrelated to changes
- CI/CD will catch issues anyway

**Never skip:**

- Regular development workflow
- Before creating pull request
- When merging to main/master

## Troubleshooting

### Issue: Hooks not running

**Check:**

1. Is `.husky/` directory present?
2. Are hooks executable? (`ls -la .husky/`)
3. Was `npm install` run? (triggers `prepare` script)

**Fix:**

```bash
npx husky install
chmod +x .husky/pre-commit .husky/pre-push
```

### Issue: lint-staged not formatting files

**Check:**

1. Are files staged? (`git status`)
2. Is `.prettierrc` configuration valid?
3. Does file match pattern in `lint-staged` config?

**Debug:**

```bash
npx lint-staged --debug
```

### Issue: Pre-push taking too long

**Causes:**

- Large test suite (>100 tests)
- Slow ESLint scan (large codebase)

**Solutions:**

1. Run tests before pushing: `npm test` (fails fast locally)
2. Split large test files
3. Use ESLint caching (not enabled by default)

### Issue: ESLint errors not auto-fixable

**Example:**

```typescript
// Error: 'any' type not allowed
function foo(bar: any) {}
```

**Resolution:**

- Manual fix required (add proper type)
- Commit fix before retrying push

### Issue: Tests pass locally but fail in hook

**Causes:**

- Environment differences
- Missing `.env` file
- Async timing issues

**Debug:**

```bash
# Run exactly what hook runs
npm run lint:fix && npm test
```

## Key Features

### 1. Automatic Formatting

**Benefits:**

- No manual formatting needed
- Consistent code style across team
- No "format wars" in code reviews
- Reduces diff noise

**Developer experience:**

- Write code naturally
- Commit triggers formatting
- Git diff shows only real changes

### 2. Quality Gate Enforcement

**Pre-push checks prevent:**

- Broken tests entering repository
- Linting errors in main branch
- Syntax errors in production

**Team benefits:**

- Main branch always passing
- CI/CD failures reduced
- Code review focuses on logic, not style

### 3. Fast Feedback Loop

**Local validation:**

- Catches issues before CI/CD
- Faster than waiting for remote checks
- Reduces "fix commit" spam

**Time savings:**

- Pre-commit: 2 seconds vs manual formatting
- Pre-push: 15 seconds vs 5-minute CI wait

## Critical Implementation Notes

### 1. Hook Execution Order

**Git flow:**

```
git commit → pre-commit → commit-msg → post-commit
git push → pre-push → [remote] → post-receive
```

**Household Hub uses:**

- pre-commit: Formatting
- pre-push: Linting + tests
- No commit-msg hook (could add conventional commits enforcement)

### 2. lint-staged Staging Behavior

**Important:** lint-staged automatically re-stages files after formatting

**Example flow:**

1. Edit `src/utils.ts`
2. Stage: `git add src/utils.ts`
3. Commit triggers Prettier
4. Prettier formats `src/utils.ts`
5. lint-staged stages formatted version
6. Commit includes formatted file

**Implication:** Commit may differ from what you staged (formatting applied)

### 3. Test Isolation

**Critical:** Unit tests must be deterministic

**Requirements:**

- No network calls (mock Supabase)
- No real IndexedDB (use fake-indexeddb)
- Consistent date/time (mock `Date.now()`)
- Isolated test state (no shared variables)

**Rationale:** Pre-push tests run in CI-like environment

### 4. Hook Installation Timing

**npm install triggers:**

```bash
"prepare": "husky"
```

**Runs on:**

- `npm install`
- `npm ci`
- `git clone` → `npm install`

**Does not run on:**

- `npm update` (use `npm install` instead)

## Related Components

### Development Tools

- [.prettierrc](../../.prettierrc) - Prettier configuration
- [eslint.config.js](../../eslint.config.js) - ESLint flat config
- [package.json](../../package.json) - Scripts and lint-staged config

### Testing

- [vitest.config.ts](../../vitest.config.ts) - Unit test configuration
- [playwright.config.ts](../../playwright.config.ts) - E2E tests (not in hook)

### CI/CD

- [.github/workflows/](../../.github/workflows/) - GitHub Actions (if exists)
- Complements local hooks with cloud checks

## Further Context

### Project Documentation

- [/CLAUDE.md](../../CLAUDE.md) - Git workflow section
- [/README.md](../../README.md) - Setup instructions

### Code Quality

- [docs/initial plan/TESTING-PLAN.md](../../docs/initial%20plan/TESTING-PLAN.md) - Testing strategy

## Best Practices

### 1. Run Tests Before Pushing

**Recommended workflow:**

```bash
# Before starting work
npm test  # Ensure tests pass

# During development
# ... make changes ...

# Before committing
npm test  # Verify tests still pass
git add .
git commit -m "feat: new feature"

# Before pushing (optional - hook will run anyway)
npm run lint:fix
npm test
git push
```

**Benefits:**

- Catch failures early
- Faster feedback (local vs hook)
- Less time waiting for hook

### 2. Commit Frequently

**Small commits:**

- Faster pre-commit (fewer files)
- Easier to review
- Simpler to revert

**Large commits:**

- Slower pre-commit (many files)
- Harder to debug failures
- Risk of unrelated changes

### 3. Address Hook Failures Immediately

**Don't skip hooks:**

- Fix issues properly
- Commit fixes
- Maintain quality standards

**Skip only for emergencies:**

- Hotfix with failing unrelated test
- Time-sensitive bug fix
- Always follow up with proper fix

### 4. Keep Hooks Fast

**Avoid:**

- E2E tests in pre-push (too slow)
- Network requests in unit tests
- Complex ESLint rules (slow scanning)

**Current setup is balanced:**

- Pre-commit: <2s (formatting)
- Pre-push: <15s (lint + unit tests)
- Acceptable developer experience

## Security Considerations

### Hook Verification

**Hooks are code:**

- Can run arbitrary commands
- Always review `.husky/` changes in PRs
- Malicious hooks could leak secrets

**Current hooks are safe:**

- Only run standard tools (Prettier, ESLint, Vitest)
- No network calls
- No file system access beyond project

### Bypassing Hooks

**Security risk:**

- Developers can skip with `--no-verify`
- Rely on CI/CD as final gate
- Hooks improve quality, don't enforce security

**Best practice:**

- Enable branch protection rules
- Require passing CI checks
- Code review before merge

## Future Enhancements

### Planned Additions

**Commit message linting:**

- Enforce conventional commits format
- Example: `feat: add new feature`, `fix: resolve bug`
- Use `commitlint` with husky

**Type checking in pre-push:**

- Add `tsc --noEmit` to verify types
- Catches type errors before push
- Alternative: Include in `lint` script

**Bundle size check:**

- Warn if bundle exceeds budget
- Use `bundlesize` package (already installed)
- Prevent performance regressions

**E2E tests on pre-push (optional):**

- Only for critical paths
- With `--no-verify` escape hatch
- Trade-off: quality vs speed

## Quick Reference

**Hook locations:**

- Pre-commit: `.husky/pre-commit`
- Pre-push: `.husky/pre-push`

**Bypass hooks:**

```bash
git commit --no-verify
git push --no-verify
```

**Manual hook run:**

```bash
npx lint-staged       # Run pre-commit manually
npm run lint:fix && npm test  # Run pre-push manually
```

**Reinstall hooks:**

```bash
npx husky install
```

**Debug lint-staged:**

```bash
npx lint-staged --debug
```
