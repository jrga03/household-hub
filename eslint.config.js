import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import pluginQuery from "@tanstack/eslint-plugin-query";
import prettier from "eslint-config-prettier";
import betterTailwind from "eslint-plugin-better-tailwindcss";
import { builtinRules } from "eslint/use-at-your-own-risk";

// The core no-restricted-syntax rule, registered once per invariant. Flat config
// replaces a rule's options wholesale per rule ID, so one shared array could not
// carry different allowlists (Phase 1a design, section 1).
const restrictedSyntax = builtinRules.get("no-restricted-syntax");
const architecturePlugin = {
  rules: {
    "no-ad-hoc-money-parse": restrictedSyntax,
    "no-events-table-outside-sync": restrictedSyntax,
    "no-direct-event-log": restrictedSyntax,
    "no-color-literal": restrictedSyntax,
    "no-inline-color-style": restrictedSyntax,
    // Its own rule ID so it stacks with the no-restricted-imports blocks below
    // instead of replacing them.
    "no-direct-primitive-import": builtinRules.get("no-restricted-imports"),
  },
};

const srcTestFiles = [
  "src/**/*.test.{ts,tsx}",
  "src/**/*.spec.ts",
  "src/**/*.fixtures.ts",
  "src/**/__tests__/**",
  "src/test/**",
];

// TanStack Query strict rules for production code (roadmap 4.3).
const queryPluginConfigs = pluginQuery.configs["flat/recommended-strict"].map((config) => ({
  ...config,
  files: ["src/**/*.{ts,tsx}"],
  ignores: srcTestFiles,
}));

// The raw number → Cents constructor stays in the data layer (roadmap 4.4).
const restrictAsCents = {
  group: ["@/lib/currency", "**/lib/currency", "**/lib/currency.ts", "./currency", "../currency"],
  importNames: ["asCents"],
  message:
    "Derive money with the @/lib/currency helpers (sumCents, diffCents, absCents, divideCents, ZERO_CENTS). asCents is for the data layer only.",
};

const restrictSupabase = {
  group: ["**/lib/supabase", "**/lib/supabase.ts"],
  message:
    "Routes and components read and write through a hook or a src/lib module, never Supabase directly.",
};

// Only commands append events (ADR 0001): they validate, append and project in
// one local transaction.
const restrictAppendEvent = {
  group: ["@/lib/events/log", "**/events/log", "**/events/log.ts", "./log"],
  importNames: ["appendEvent", "appendTogether"],
  message:
    "Record changes through a command in src/lib/commands, which validates, appends and projects in one transaction.",
};

const restrictSyncOnlyLog = {
  group: ["@/lib/events/log", "**/events/log", "**/events/log.ts", "./log"],
  importNames: [
    "listUnpushed",
    "markPushed",
    "markStuck",
    "requeueStuck",
    "discardStuck",
    "receiveEvents",
  ],
  message:
    "Only the sync engine (src/lib/sync) pushes and receives events. Record changes with a command; read projections.",
};

// Event decoders turn synced payloads into Cents, so they are data layer.
const eventDecoderFiles = ["src/lib/*/events.ts"];
const commandFiles = ["src/lib/commands/**"];
const syncFiles = ["src/lib/sync/**"];

// Colors come only from theme tokens (spec #162, ADR 0011).
const COLOR_FUNCTION = "(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\\(";
const COLOR_LITERAL = `(?:^|[\\s,(])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z])|\\b${COLOR_FUNCTION}`;
const COLOR_UTILITY =
  "(?:bg|text|border(?:-[xytrblse])?|divide|outline|ring(?:-offset)?|inset-ring|fill|stroke|decoration|accent|caret|placeholder|from|via|to|shadow|inset-shadow|drop-shadow|text-shadow)";
const COLOR_STYLE_PROPERTY =
  "^(?:color|background|backgroundColor|background-color|border(?:Top|Right|Bottom|Left|Block|Inline)?Color|border(?:-[a-z]+)?-color|outlineColor|outline-color|fill|stroke|textDecorationColor|caretColor|accentColor)$";

const arbitraryColorClasses = [
  {
    pattern: `(?:^|:)!?-?${COLOR_UTILITY}-(?:\\[(?:color:|var\\(|#|${COLOR_FUNCTION})|\\((?:color:)?--)`,
    message:
      "Arbitrary colors bypass the theme. Use a token class (bg-primary, text-income, border-border…).",
  },
  {
    pattern: "(?:^|:)\\[(?:color|background(?:-color)?|[a-z-]+-color|fill|stroke):",
    message: "Arbitrary color properties bypass the theme. Use a token class.",
  },
];

// Motion names the properties it animates (spec #162): transform, opacity, or
// color for a state change.
const transitionAllClass = {
  pattern: "(?:^|:)!?transition-all!?$",
  message:
    "List the properties that animate: transition-transform, transition-opacity or transition-colors.",
};

// Padding, margin, gap, space and inset (top/right/bottom/left/start/end
// included) stay on the step set in app code; primitives in ui/ are exempt.
// calc() and var() arbitrary values (safe areas, chrome heights) stay allowed.
const SPACING_UTILITY =
  "-?(?:p(?:[xytrblse]|b[se])?|m(?:[xytrblse]|b[se])?|gap(?:-[xy])?|space-[xy]|inset(?:-(?:[xyse]|b[se]))?|top|right|bottom|left|start|end)";
const SPACING_STEP = "(?:0|0\\.5|1|2|3|4|6|8|12|16)";

const offSetSpacingClasses = [
  {
    pattern: `(?:^|:)!?${SPACING_UTILITY}-(?!${SPACING_STEP}!?$)(?:[0-9.]+|px)!?$`,
    message: "Spacing steps are 0, 0.5, 1, 2, 3, 4, 6, 8, 12 and 16. Use the nearest step.",
  },
  {
    pattern: `(?:^|:)!?${SPACING_UTILITY}-\\[-?[0-9.]+(?:px|rem|em)?\\]!?$`,
    message:
      "Arbitrary spacing lengths bypass the step set (0, 0.5, 1, 2, 3, 4, 6, 8, 12, 16). Use a step, or calc()/var() for safe areas.",
  },
];

// Font size, radius and shadow come only from the theme's named steps (spec
// #162). Arbitrary sizing and calc() on width, height and the like stay allowed.
const arbitraryScaleClasses = [
  {
    pattern: "(?:^|:)!?text-(?:\\[(?:length:|[0-9.]|calc\\(|clamp\\(|min\\(|max\\()|\\(length:)",
    message: "Arbitrary font sizes bypass the type roles. Use text-body, text-label, text-caption…",
  },
  {
    pattern: "(?:^|:)!?rounded(?:-(?:[trblse]|[tb][lr]|[se][se]))?-(?:\\[(?!inherit\\])|\\()",
    message: "Arbitrary radii bypass the shape scale. Use rounded-sm, rounded-md or rounded-lg.",
  },
  {
    pattern: "(?:^|:)!?-?(?:inset-shadow|drop-shadow|text-shadow|shadow)-[[(]",
    message: "Arbitrary shadows bypass elevation. Use shadow-float for floating layers, or none.",
  },
];

const primitiveRestrictedClasses = [
  ...arbitraryColorClasses,
  ...arbitraryScaleClasses,
  transitionAllClass,
];
const appRestrictedClasses = [...primitiveRestrictedClasses, ...offSetSpacingClasses];

const restrictNanoid = {
  name: "nanoid",
  message: "Use crypto.randomUUID(): local ids are server ids and the columns are uuid.",
};

// shadcn primitives (src/components/ui) are private to the app-component layer
// (src/components/app, plus the layout chrome in src/components/layout), ADR 0011.
// These files imported a primitive directly when the rule landed. The list only
// shrinks: migrate a file and delete its entry; never add one
// (architecture-lint.test.ts holds the count down).
export const directPrimitiveImporters = [
  "src/App.tsx",
  "src/components/ErrorBoundary.tsx",
  "src/components/LoginForm.tsx",
  "src/components/PWAInstallPrompt.tsx",
  "src/components/SignupForm.tsx",
  "src/components/StorageWarning.tsx",
  "src/components/sync/SyncStatusIndicator.tsx",
  "src/routes/__root.tsx",
];

const primitiveBoundary = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: [
    ...srcTestFiles,
    "src/components/ui/**",
    "src/components/app/**",
    "src/components/layout/**",
    ...directPrimitiveImporters,
  ],
  rules: {
    "arch/no-direct-primitive-import": [
      "error",
      {
        patterns: [
          {
            group: ["@/components/ui/*", "**/components/ui/*", "./ui/*", "../ui/*"],
            message:
              "shadcn primitives are private (ADR 0011). Build from a component in src/components/app, or add one there that wraps the primitive.",
          },
        ],
      },
    ],
  },
};

export default [
  {
    ignores: [
      ".claude/**",
      "dist/**",
      "dist-ssr/**",
      "coverage/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      ".lighthouseci/**",
      "*.config.js",
      "src/routeTree.gen.ts",
      "src/types/database.types.ts",
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

  // Cloudflare Workers
  {
    files: ["workers/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      // tsc (tsconfig.tests.json) resolves the runtime globals; a hand-kept list here only drifts.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
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
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
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
        atob: "readonly",
        BeforeInstallPromptEvent: "readonly",
        Navigator: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      // eslint-plugin-react and jsx-a11y still call context methods ESLint 10
      // removed; @eslint/compat restores them.
      react: fixupPluginRules(react),
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
      // Every promise has an owner (roadmap 4.7).
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  // Must stay after the src/** block above: in flat config later blocks win.
  {
    files: srcTestFiles,
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  ...fixupConfigRules({ ...jsxA11y.flatConfigs.recommended, files: ["src/**/*.tsx"] }),
  ...queryPluginConfigs,
  // Architecture rules (roadmap 4.4-4.6). Each error message says why the rule
  // exists and what to do instead.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { arch: architecturePlugin },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...srcTestFiles, "src/lib/currency.ts"],
    rules: {
      "arch/no-ad-hoc-money-parse": [
        "error",
        {
          selector: "CallExpression[callee.name=/^(parseFloat|Number)$/]",
          message:
            "Parse peso input with parsePHP, parsePHPSafe, or parsePHPUnbounded from @/lib/currency, which return validated integer cents. For a number that is not an amount, disable this line with a `-- reason`.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...srcTestFiles, "src/lib/sync/**"],
    rules: {
      "arch/no-events-table-outside-sync": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value='events'], CallExpression[callee.property.name='rpc'][arguments.0.value='pull_events']",
          message:
            "Only the sync engine (src/lib/sync) talks to the server event log. Screens read local projections; commands record changes.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...srcTestFiles, "src/lib/events/**"],
    rules: {
      "arch/no-direct-event-log": [
        "error",
        {
          selector: "MemberExpression[object.name='db'][property.name='events']",
          message:
            "The local event log is reached only through src/lib/events/log: commands append, the sync engine pushes and receives.",
        },
      ],
    },
  },
  // Tailwind class lint. The plugin reads the v4 theme from the CSS entry, so
  // a theme token class is known and a removed one is not.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: { "better-tailwindcss": { entryPoint: "src/index.css" } },
    rules: {
      "better-tailwindcss/no-unknown-classes": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...srcTestFiles, "src/components/ui/**"],
    rules: {
      "better-tailwindcss/no-restricted-classes": ["error", { restrict: appRestrictedClasses }],
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    ignores: srcTestFiles,
    rules: {
      "better-tailwindcss/no-restricted-classes": [
        "error",
        { restrict: primitiveRestrictedClasses },
      ],
    },
  },
  {
    files: ["src/**/*.tsx"],
    ignores: srcTestFiles,
    rules: {
      "arch/no-color-literal": [
        "error",
        {
          selector: `Literal[value=/${COLOR_LITERAL}/], TemplateElement[value.raw=/${COLOR_LITERAL}/]`,
          message:
            "Colors come from theme tokens in src/index.css. Use a token class, or read the token with getComputedStyle.",
        },
      ],
      "arch/no-inline-color-style": [
        "error",
        {
          selector: `JSXAttribute[name.name='style'] Property[key.name=/${COLOR_STYLE_PROPERTY}/], JSXAttribute[name.name='style'] Property[key.value=/${COLOR_STYLE_PROPERTY}/]`,
          message: "Set colors with a theme token class, not an inline style.",
        },
      ],
    },
  },
  // no-restricted-imports: one block per disjoint file set. A later block's
  // no-restricted-imports replaces an earlier one for the same file, so the
  // sets must never overlap.
  {
    files: ["src/routes/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [restrictNanoid],
          patterns: [restrictSupabase, restrictAsCents, restrictAppendEvent, restrictSyncOnlyLog],
        },
      ],
    },
  },
  {
    files: commandFiles,
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [restrictNanoid], patterns: [restrictAsCents, restrictSyncOnlyLog] },
      ],
    },
  },
  {
    files: syncFiles,
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [restrictNanoid], patterns: [restrictAsCents, restrictAppendEvent] },
      ],
    },
  },
  {
    files: eventDecoderFiles,
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [restrictNanoid], patterns: [restrictAppendEvent, restrictSyncOnlyLog] },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...srcTestFiles,
      ...commandFiles,
      ...syncFiles,
      ...eventDecoderFiles,
      "src/lib/currency.ts",
      "src/routes/**",
      "src/components/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [restrictNanoid],
          patterns: [restrictAsCents, restrictAppendEvent, restrictSyncOnlyLog],
        },
      ],
    },
  },
  {
    files: ["src/lib/currency.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [restrictNanoid] }],
    },
  },
  primitiveBoundary,
  // verbatimModuleSyntax keeps every import not marked as a type, so a
  // type-only use must say so or the module loads at runtime (#184).
  // disallowTypeAnnotations stays off for Vitest's typeof import("…") mocks.
  {
    files: [
      "src/**/*.{ts,tsx}",
      "workers/**/*.ts",
      "tests/e2e/**/*.ts",
      "supabase/functions/**/*.ts",
    ],
    plugins: { "@typescript-eslint": typescript },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: false,
        },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
  prettier,
];
