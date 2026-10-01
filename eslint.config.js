import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import { builtinRules } from "eslint/use-at-your-own-risk";

// The core no-restricted-syntax rule, registered once per invariant. Flat config
// replaces a rule's options wholesale per rule ID, so one shared array could not
// carry four different allowlists (Phase 1a design, section 1).
const restrictedSyntax = builtinRules.get("no-restricted-syntax");
const architecturePlugin = {
  rules: {
    "no-direct-dexie-writes": restrictedSyntax,
    "no-direct-supabase-writes": restrictedSyntax,
    "no-ad-hoc-money-parse": restrictedSyntax,
    "no-raw-transactions-from": restrictedSyntax,
  },
};

const srcTestFiles = [
  "src/**/*.test.{ts,tsx}",
  "src/**/*.spec.ts",
  "src/**/__tests__/**",
  "src/test/**",
];

export default [
  {
    ignores: [
      "dist/**",
      "dist-ssr/**",
      "coverage/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      ".lighthouseci/**",
      "*.config.js",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,

  // Node.js scripts configuration
  {
    files: ["scripts/**/*.{js,cjs,mjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        Atomics: "readonly",
        SharedArrayBuffer: "readonly",
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "no-undef": "error",
      "no-console": "off",
    },
  },

  // Deno edge functions configuration.
  // The functions live under supabase/functions/**, not edge-functions/** —
  // the old glob matched a nonexistent directory, so these files were never
  // linted (review INFRA-06).
  {
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        Deno: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        console: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        atob: "readonly",
        btoa: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn", // Relaxed for edge functions
    },
  },

  // Cloudflare Workers configuration
  {
    files: ["workers/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        ExecutionContext: "readonly",
        console: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        atob: "readonly",
        btoa: "readonly",
        fetch: "readonly",
        addEventListener: "readonly",
        dispatchEvent: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn", // Relaxed for workers
    },
  },

  // Service Worker configuration
  {
    files: ["src/sw.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        self: "readonly",
        console: "readonly",
        caches: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        URL: "readonly",
        ServiceWorkerGlobalScope: "readonly",
        PushEvent: "readonly",
        NotificationEvent: "readonly",
        NotificationOptions: "readonly",
        WindowClient: "readonly",
        ExtendableEvent: "readonly",
        FetchEvent: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // E2E tests configuration (Playwright)
  {
    files: ["tests/e2e/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        performance: "readonly",
        Performance: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        URL: "readonly",
        __dirname: "readonly",
        process: "readonly",
        require: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn", // Relaxed for tests
    },
  },

  // Unit tests configuration (Vitest)
  {
    files: ["src/test/**/*.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        window: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        globalThis: "readonly",
        performance: "readonly",
        Performance: "readonly",
        Window: "readonly",
        dispatchEvent: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Main source code (React app)
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: "readonly",
        window: "readonly",
        Window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        crypto: "readonly",
        queueMicrotask: "readonly",
        indexedDB: "readonly",
        IDBKeyRange: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        performance: "readonly",
        dispatchEvent: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        KeyboardEvent: "readonly",
        MediaQueryListEvent: "readonly",
        HTMLButtonElement: "readonly",
        HTMLInputElement: "readonly",
        React: "readonly",
        NotificationPermission: "readonly",
        Notification: "readonly",
        BufferSource: "readonly",
        ServiceWorkerRegistration: "readonly",
        FormData: "readonly",
        HTMLDivElement: "readonly",
        HTMLElement: "readonly",
        PushSubscription: "readonly",
        Worker: "readonly",
        MessageEvent: "readonly",
        self: "readonly",
        alert: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        BeforeInstallPromptEvent: "readonly",
        Navigator: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,

      // Overrides for pragmatic development
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  // Architecture rules (roadmap 4.4-4.6). Each error message says why the rule
  // exists and what to do instead.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { arch: architecturePlugin },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...srcTestFiles,
      "src/lib/offline/**",
      "src/lib/debts/**",
      "src/lib/sync/**",
      "src/lib/dexie/**",
    ],
    rules: {
      "arch/no-direct-dexie-writes": [
        "error",
        {
          selector:
            "CallExpression[callee.object.object.name='db'][callee.object.property.name=/^(transactions|accounts|categories|budgets|debts|internalDebts|debtPayments)$/][callee.property.name=/^(add|put|update|delete|bulkAdd|bulkPut|bulkUpdate|bulkDelete|clear)$/]",
          message:
            "Entity writes go through src/lib/offline/* (or src/lib/debts/*), which write the row and its sync-queue item in one Dexie transaction. A direct db.<table> write never reaches Supabase (IMP-01).",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...srcTestFiles,
      "src/lib/sync/**",
      "src/lib/dexie/deviceManager.ts",
      "src/lib/device-registration.ts",
    ],
    rules: {
      "arch/no-direct-supabase-writes": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(insert|upsert|update|delete)$/][callee.object.callee.property.name='from']",
          message:
            "Supabase entity writes belong to the sync processor (src/lib/sync). Write through src/lib/offline/* instead; a direct write skips the outbox, the event log, and offline support.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...srcTestFiles, "src/lib/currency.ts", "src/lib/supabaseQueries.ts"],
    rules: {
      "arch/no-ad-hoc-money-parse": [
        "error",
        {
          selector: "CallExpression[callee.name=/^(parseFloat|Number)$/]",
          message:
            "Parse peso input with parsePHP, parsePHPSafe, or parsePHPUnbounded from @/lib/currency, which return validated integer cents. URL amount params are already cents: validate them in the route's search schema (see src/lib/validations/transactionsSearch.ts). For a number that is not an amount, disable this line with a `-- reason`.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...srcTestFiles,
      "src/lib/supabaseQueries.ts",
      "src/lib/sync/**",
      "src/lib/debts/**",
      "src/lib/realtime-sync.ts",
    ],
    rules: {
      "arch/no-raw-transactions-from": [
        "error",
        {
          selector: "CallExpression[callee.property.name='from'] > Literal[value='transactions']",
          message:
            "Read transactions through src/lib/supabaseQueries.ts, which owns transfer exclusion for analytics and budget reads (and, from Phase 2, the transactions_non_transfer view).",
        },
      ],
    },
  },
  {
    files: ["src/routes/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/supabase"],
              message:
                "Routes and components fetch through a hook or @/lib/supabaseQueries so reads get the Dexie offline fallback and shared query keys.",
            },
          ],
        },
      ],
    },
  },
  prettier,
];
