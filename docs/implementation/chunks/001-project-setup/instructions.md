# Instructions: Project Setup

Follow these steps in order. Estimated time: 45 minutes.

---

## Step 1: Create Vite Project (5 min)

```bash
# Navigate to your projects folder
cd ~/repos/personal

# Create project (when prompted, select React + TypeScript)
npm create vite@latest household-hub -- --template react-ts

# Navigate into project
cd household-hub

# Install base dependencies
npm install
```

**Verify**: `npm run dev` should start server at http://localhost:5173

---

## Step 2: Install Core Dependencies (10 min)

### Router & State Management

```bash
npm install @tanstack/react-router @tanstack/router-vite-plugin
npm install @tanstack/react-query
npm install zustand
```

### UI & Styling

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

npm install lucide-react
npm install sonner
```

### Forms & Validation

```bash
npm install react-hook-form zod @hookform/resolvers
```

### Database & Offline

```bash
npm install @supabase/supabase-js
npm install dexie dexie-react-hooks
```

### Utilities

```bash
npm install @fingerprintjs/fingerprintjs
npm install date-fns
```

### Dev Dependencies

```bash
npm install -D @playwright/test vitest @testing-library/react
npm install -D @axe-core/playwright
```

---

## Step 3: Configure Tailwind CSS (5 min)

Update `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Update `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

---

## Step 4: Setup shadcn/ui (10 min)

```bash
npx shadcn-ui@latest init
```

When prompted:

- **Style**: Default
- **Base color**: Slate
- **CSS variables**: Yes
- **React Server Components**: No
- **Write to**: src/components
- **Import alias**: @/components

Add some components we'll need:

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add form
npx shadcn-ui@latest add table
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add toast
```

---

## Step 5: Configure TypeScript Paths (3 min)

Update `tsconfig.json` to include:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Update `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

---

## Step 6: Create Folder Structure (5 min)

```bash
mkdir -p src/{components,lib,stores,routes,hooks,types}
mkdir -p src/components/ui
```

Your structure should look like:

```
src/
├── components/
│   └── ui/          # shadcn components
├── lib/             # utilities, database setup
├── stores/          # Zustand stores
├── routes/          # TanStack Router pages
├── hooks/           # Custom React hooks
├── types/           # TypeScript types
├── App.tsx
├── main.tsx
└── index.css
```

---

## Step 7: Setup ESLint & Prettier (5 min)

Create `.prettierrc`:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

Update `eslint.config.js` (if it exists, or create it):

```javascript
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  }
);
```

---

## Step 8: Environment Variables (2 min)

Create `.env.example`:

```bash
# Supabase
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key

# Optional
VITE_APP_ENV=development
```

Add to `.gitignore` (should already exist, verify these lines):

```
.env.local
.env
node_modules/
dist/
```

---

## Step 9: Initialize Git (2 min)

```bash
git init
git add .
git commit -m "chore: initial project setup"
```

---

## Step 10: Test Hello World (3 min)

Update `src/App.tsx`:

```typescript
function App() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">
          Household Hub
        </h1>
        <p className="mt-4 text-muted-foreground">
          Project setup complete ✓
        </p>
      </div>
    </div>
  )
}

export default App
```

Run dev server:

```bash
npm run dev
```

Visit http://localhost:5173

**Should see**: "Household Hub - Project setup complete ✓"

---

## Done!

When your dev server shows the Hello World page without errors, you're ready for the checkpoint.

**Next**: Run `checkpoint.md` to verify everything works.
