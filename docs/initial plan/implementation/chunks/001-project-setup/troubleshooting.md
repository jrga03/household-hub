# Troubleshooting: Project Setup

Common issues and solutions for chunk 001.

---

## Issue: npm install fails

### Symptom

```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE could not resolve
```

### Solution

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

---

## Issue: "Cannot find module '@/components/ui/button'"

### Symptom

TypeScript error: Cannot find module '@/components/ui/button' or its corresponding type declarations.

### Solution

1. Check `tsconfig.json` has paths configured:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

2. Check `vite.config.ts` has alias:

```typescript
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

3. Restart TypeScript server:
   - VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"

4. Run shadcn init again:

```bash
npx shadcn-ui@latest init
```

---

## Issue: Tailwind styles not working

### Symptom

No styling applied, components look unstyled

### Solution

1. Check `tailwind.config.js` content array includes your files:

```javascript
content: [
  "./index.html",
  "./src/**/*.{js,ts,jsx,tsx}",
],
```

2. Check `src/index.css` has Tailwind directives:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

3. Check `src/main.tsx` imports the CSS:

```typescript
import "./index.css";
```

4. Restart dev server:

```bash
# Ctrl+C to stop
npm run dev
```

---

## Issue: TypeScript errors on React components

### Symptom

```
Property 'children' does not exist on type...
```

### Solution

1. Check React types installed:

```bash
npm install --save-dev @types/react @types/react-dom
```

2. Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  }
}
```

---

## Issue: Port 5173 already in use

### Symptom

```
Error: Port 5173 is already in use
```

### Solution

Option 1: Kill process on that port

```bash
# Find process
lsof -ti:5173

# Kill it
kill -9 $(lsof -ti:5173)
```

Option 2: Use different port

```bash
npm run dev -- --port 3000
```

---

## Issue: ESLint shows errors after setup

### Symptom

ESLint errors on valid code

### Solution

1. Check `eslint.config.js` exists and is properly configured

2. Install ESLint dependencies:

```bash
npm install --save-dev eslint @eslint/js typescript-eslint
npm install --save-dev eslint-plugin-react-hooks eslint-plugin-react-refresh
```

3. Restart VS Code ESLint server:
   - Cmd+Shift+P → "ESLint: Restart ESLint Server"

---

## Issue: Git not initializing

### Symptom

```
fatal: not a git repository
```

### Solution

1. Make sure you're in project root:

```bash
pwd
# Should show: /path/to/household-hub
```

2. Initialize git:

```bash
git init
```

3. Add .gitignore:

```bash
echo "node_modules/
dist/
.env.local
.env" > .gitignore
```

---

## Issue: Dark mode not working

### Symptom

Dark mode class added but styles don't change

### Solution

1. Check `tailwind.config.js` has darkMode configured:

```javascript
module.exports = {
  darkMode: ["class"],
  // ...
};
```

2. Add dark mode toggle logic (will be implemented in later chunks)

3. For now, test by manually adding class to `<html>`:

```html
<html class="dark"></html>
```

---

## Issue: shadcn components show errors

### Symptom

```
Module not found: Can't resolve '@/lib/utils'
```

### Solution

1. Create `src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

2. Install dependencies:

```bash
npm install clsx tailwind-merge
```

---

## Issue: Vite server won't start

### Symptom

```
Error: Failed to load config
```

### Solution

1. Check `vite.config.ts` syntax:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
});
```

2. Install Vite plugin:

```bash
npm install --save-dev @vitejs/plugin-react-swc
```

3. Delete `.vite` cache:

```bash
rm -rf node_modules/.vite
```

---

## Issue: Build fails with TypeScript errors

### Symptom

```
error TS2307: Cannot find module...
```

### Solution

1. Run TypeScript check to see all errors:

```bash
npx tsc --noEmit
```

2. Fix import paths (use `@/` prefix)

3. Check all dependencies installed:

```bash
npm install
```

4. Clear TypeScript cache:

```bash
rm -rf node_modules/.cache
```

---

## Still Stuck?

### Debugging Checklist

- [ ] Node version is 20+
- [ ] npm install completed without errors
- [ ] All config files present
- [ ] VS Code restarted
- [ ] Terminal restarted
- [ ] node_modules deleted and reinstalled

### Get Help

1. Check error message carefully
2. Search GitHub issues for similar problems
3. Ask Claude Code:
   ```
   I'm getting [error] in chunk 001-project-setup.
   The checkpoint fails at [step].
   Here's the full error: [paste error]
   ```

### Nuclear Option: Start Fresh

If nothing works, start over:

```bash
# Go up one directory
cd ..

# Delete project
rm -rf household-hub

# Start instructions.md from Step 1
```

---

**Most Common Issue**: Missing or incorrect `@/` alias configuration. 99% of import errors are fixed by properly setting up `tsconfig.json` and `vite.config.ts` paths.
