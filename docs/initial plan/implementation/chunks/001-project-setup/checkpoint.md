# Checkpoint: Project Setup

Run these checks to verify chunk 001 is complete.

## Automated Checks

### 1. Dev Server Starts

```bash
npm run dev
```

**Expected**:

```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

**Status**: [ ] Pass / [ ] Fail

---

### 2. TypeScript Compiles

```bash
npm run build
```

**Expected**:

```
vite v5.x.x building for production...
✓ xxx modules transformed.
dist/index.html                   x.xx kB
dist/assets/index-xxxxx.js       xxx.xx kB
✓ built in xxxms
```

**Status**: [ ] Pass / [ ] Fail

---

### 3. No TypeScript Errors

```bash
npx tsc --noEmit
```

**Expected**: No output (silence means success)

**Status**: [ ] Pass / [ ] Fail

---

### 4. ESLint Clean

```bash
npx eslint src/
```

**Expected**: No warnings or errors

**Status**: [ ] Pass / [ ] Fail

---

## Manual Checks

### 1. Dependencies Installed

Check `package.json` includes:

- [ ] @tanstack/react-router
- [ ] @tanstack/react-query
- [ ] zustand
- [ ] tailwindcss
- [ ] @supabase/supabase-js
- [ ] dexie
- [ ] react-hook-form
- [ ] zod

---

### 2. Folder Structure Exists

Check these folders exist in `src/`:

- [ ] components/
- [ ] components/ui/
- [ ] lib/
- [ ] stores/
- [ ] routes/
- [ ] hooks/
- [ ] types/

---

### 3. Configuration Files Present

- [ ] `tailwind.config.js`
- [ ] `vite.config.ts`
- [ ] `tsconfig.json`
- [ ] `.prettierrc`
- [ ] `.env.example`
- [ ] `.gitignore`

---

### 4. Visual Check

Visit http://localhost:5173

**Should see**:

- "Household Hub" heading (large, centered)
- "Project setup complete ✓" subtext
- White background (or dark if system preference is dark)
- Clean, centered layout

**Screenshot expected**:

```
┌────────────────────────────┐
│                            │
│                            │
│     Household Hub          │
│  Project setup complete ✓  │
│                            │
│                            │
└────────────────────────────┘
```

**Status**: [ ] Pass / [ ] Fail

---

### 5. Import Alias Works

Create test file `src/test-alias.ts`:

```typescript
import { Button } from "@/components/ui/button";

console.log("Alias works!");
```

Run:

```bash
npx tsc --noEmit
```

Should compile without errors.

Delete `src/test-alias.ts` after verification.

**Status**: [ ] Pass / [ ] Fail

---

## Pass Criteria

All checks above must pass:

- ✅ Dev server starts without errors
- ✅ TypeScript compiles
- ✅ ESLint clean
- ✅ All dependencies present
- ✅ Folder structure created
- ✅ Config files exist
- ✅ Visual output correct
- ✅ Import alias works

---

## If Any Check Fails

1. Check `troubleshooting.md` for that specific issue
2. Review `instructions.md` for that step
3. Run `npm install` again to ensure deps installed
4. Check Node version is 20+

---

## When All Checks Pass

1. Update `progress-tracker.md`:
   - Mark chunk 001 as complete `[x]`
   - Update time invested

2. Commit your work:

```bash
git add .
git commit -m "feat: complete chunk 001-project-setup"
```

3. Move to next chunk:
   - `chunks/002-auth-flow/`

---

**Checkpoint Status**: **\_\_** (Pass / Fail / In Progress)
**Time Taken**: **\_\_** minutes
**Issues Encountered**: **\_\_**
**Notes**: **\_\_**
