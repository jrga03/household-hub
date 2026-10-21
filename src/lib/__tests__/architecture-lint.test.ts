import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// Drives the real eslint.config.js so a glob typo or a moved
// eslint/use-at-your-own-risk export cannot silently disable a rule.
let eslint: ESLint;
beforeAll(() => {
  // Probe paths are not on disk, so the project service cannot type them; the
  // type-aware rules are covered by `npm run lint` over real files instead.
  eslint = new ESLint({
    overrideConfig: [
      {
        files: ["src/**/*.{ts,tsx}"],
        languageOptions: { parserOptions: { projectService: false } },
        rules: {
          "@typescript-eslint/no-floating-promises": "off",
          "@typescript-eslint/no-misused-promises": "off",
        },
      },
    ],
  });
});

async function ruleIds(code: string, filePath: string) {
  const results = await eslint.lintText(code, { filePath });
  expect(results).toHaveLength(1);
  return results[0]!.messages.map((message) => message.ruleId);
}

const cases = [
  {
    rule: "arch/no-ad-hoc-money-parse",
    code: 'export const cents = Math.round(parseFloat("1.50") * 100);\n',
    flagged: "src/components/probe.tsx",
    allowed: "src/lib/currency.ts",
  },
  {
    rule: "no-restricted-imports",
    code: 'import { supabase } from "@/lib/supabase";\nexport { supabase };\n',
    flagged: "src/routes/probe.tsx",
    allowed: "src/hooks/probe.ts",
  },
  {
    rule: "no-restricted-imports",
    code: 'import { asCents } from "@/lib/currency";\nexport const total = asCents(1);\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/currency.ts",
  },
  {
    rule: "no-restricted-imports",
    code: 'import { asCents } from "@/lib/currency";\nexport const total = asCents(1);\n',
    flagged: "src/lib/accounts/projection.ts",
    allowed: "src/lib/accounts/events.ts",
  },
  {
    rule: "no-restricted-imports",
    code: 'import { appendEvent } from "@/lib/events/log";\nexport { appendEvent };\n',
    flagged: "src/lib/sync/probe.ts",
    allowed: "src/lib/commands/probe.ts",
  },
  {
    rule: "no-restricted-imports",
    code: 'import { receiveEvents, markPushed } from "@/lib/events/log";\nexport { receiveEvents, markPushed };\n',
    flagged: "src/components/probe.tsx",
    allowed: "src/lib/sync/probe.ts",
  },
  {
    rule: "arch/no-events-table-outside-sync",
    code: 'import { supabase } from "@/lib/supabase";\nexport const push = () => supabase.from("events").insert([]);\n',
    flagged: "src/lib/probe.ts",
    allowed: "src/lib/sync/probe.ts",
  },
  {
    rule: "arch/no-events-table-outside-sync",
    code: 'import { supabase } from "@/lib/supabase";\nexport const pull = () => supabase.rpc("pull_events", { after_sequence: 0, batch_size: 1 });\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/sync/probe.ts",
  },
  {
    rule: "arch/no-direct-event-log",
    code: 'import { db } from "@/lib/dexie/db";\nexport const add = () => db.events.add({} as never);\n',
    flagged: "src/lib/commands/probe.ts",
    allowed: "src/lib/events/probe.ts",
  },
  {
    rule: "arch/no-direct-primitive-import",
    code: 'import { Button } from "@/components/ui/button";\nexport { Button };\n',
    flagged: "src/routes/probe.tsx",
    allowed: "src/components/app/probe.tsx",
  },
  {
    rule: "arch/no-direct-primitive-import",
    code: 'import { Button } from "@/components/ui/button";\nexport { Button };\n',
    flagged: "src/components/accounts/probe.tsx",
    allowed: "src/App.tsx",
  },
  {
    rule: "arch/no-direct-primitive-import",
    code: 'import { Sidebar } from "@/components/ui/sidebar";\nexport { Sidebar };\n',
    flagged: "src/components/probe.tsx",
    allowed: "src/components/layout/probe.tsx",
  },
];

describe.each(cases)("$rule", ({ rule, code, flagged, allowed }) => {
  it(`fires in ${flagged}`, async () => {
    expect(await ruleIds(code, flagged)).toContain(rule);
  });

  it(`is silent in ${allowed}`, async () => {
    expect(await ruleIds(code, allowed)).not.toContain(rule);
  });

  it("is silent in test files", async () => {
    expect(await ruleIds(code, flagged.replace(/\.tsx?$/, ".test.ts"))).not.toContain(rule);
  });
});

it("@tanstack/query/prefer-query-options is an error in production code", async () => {
  const code =
    'import { useQueryClient } from "@tanstack/react-query";\nexport const useProbe = () => { const queryClient = useQueryClient(); return () => queryClient.invalidateQueries({ queryKey: ["probe"] }); };\n';
  const results = await eslint.lintText(code, { filePath: "src/hooks/probe.ts" });
  expect(results).toHaveLength(1);
  const message = results[0]!.messages.find(
    (m) => m.ruleId === "@tanstack/query/prefer-query-options"
  );
  expect(message?.severity).toBe(2);
});

it("@tanstack/query rules stay off in test files", async () => {
  const code =
    'import { useQueryClient } from "@tanstack/react-query";\nexport const useProbe = () => { const queryClient = useQueryClient(); return () => queryClient.invalidateQueries({ queryKey: ["probe"] }); };\n';
  expect(await ruleIds(code, "src/hooks/probe.test.ts")).not.toContain(
    "@tanstack/query/prefer-query-options"
  );
});

it("no-restricted-imports fires for the .ts-suffixed supabase import", async () => {
  const code = 'import { supabase } from "@/lib/supabase.ts";\nexport { supabase };\n';
  expect(await ruleIds(code, "src/routes/probe.tsx")).toContain("no-restricted-imports");
});

it("components keep both import bans (supabase and asCents)", async () => {
  const [result] = await eslint.lintText(
    'import { supabase } from "@/lib/supabase";\nimport { asCents } from "@/lib/currency";\nexport { supabase, asCents };\n',
    { filePath: "src/components/probe.tsx" }
  );
  const messages = (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports");
  expect(messages).toHaveLength(2);
});

it("formatPHP and the helpers stay importable everywhere", async () => {
  expect(
    await ruleIds(
      'import { formatPHP, sumCents } from "@/lib/currency";\nexport { formatPHP, sumCents };\n',
      "src/components/probe.tsx"
    )
  ).not.toContain("no-restricted-imports");
});

it.each(["src/components/probe.tsx", "src/routes/probe.tsx", "src/lib/accounts/events.ts"])(
  "no-restricted-imports bans appendEvent outside commands in %s",
  async (filePath) => {
    const code = 'import { appendEvent } from "@/lib/events/log";\nexport { appendEvent };\n';
    expect(await ruleIds(code, filePath)).toContain("no-restricted-imports");
  }
);

it.each(["src/lib/commands/probe.ts", "src/hooks/probe.ts", "src/lib/accounts/events.ts"])(
  "no-restricted-imports keeps listUnpushed to the sync engine in %s",
  async (filePath) => {
    const code = 'import { listUnpushed } from "@/lib/events/log";\nexport { listUnpushed };\n';
    expect(await ruleIds(code, filePath)).toContain("no-restricted-imports");
  }
);

it("the sync engine may not append events", async () => {
  const code = 'import { appendEvent } from "@/lib/events/log";\nexport { appendEvent };\n';
  expect(await ruleIds(code, "src/lib/sync/engine.ts")).toContain("no-restricted-imports");
});

it.each([
  "src/lib/commands/probe.ts",
  "src/lib/accounts/events.ts",
  "src/components/probe.tsx",
  "src/lib/probe.ts",
  "src/lib/dexie/probe.ts",
  "src/lib/currency.ts",
  "src/hooks/probe.ts",
])("no-restricted-imports bans nanoid in %s", async (filePath) => {
  const code = 'import { nanoid } from "nanoid";\nexport const id = nanoid();\n';
  expect(await ruleIds(code, filePath)).toContain("no-restricted-imports");
});

const route = "src/routes/probe.tsx";
const routeTest = "src/routes/probe.test.tsx";

/** Rule ids reported for a JSX or statement snippet wrapped in an exported function. */
async function snippetRuleIds(snippet: string, filePath: string) {
  return ruleIds(`export const probe = () => { ${snippet} };\n`, filePath);
}

const styleCases = [
  {
    rule: "better-tailwindcss/no-restricted-classes",
    flagged: [
      '<div className="bg-[#1e40af]" />',
      '<div className="text-[oklch(0.5_0.1_150)]" />',
      '<div className="hover:border-[rgb(0,0,0)]/50" />',
      '<div className="bg-(--brand)" />',
      '<div className="bg-[color:var(--brand)]" />',
      '<div className="data-[state=open]:[color:red]" />',
      '<div className={cn("p-2", "fill-[var(--brand)]")} />',
    ],
    allowed: [
      '<div className="bg-income text-muted-foreground data-[state=open]:bg-accent" />',
      '<div className="w-[4.75rem] w-(--sidebar-width) focus-visible:ring-[3px]" />',
      '<div className="pb-[calc(1rem+var(--safe-area-bottom))] max-h-[calc(100dvh-2rem)]" />',
    ],
  },
  {
    rule: "arch/no-color-literal",
    flagged: [
      'const color = "#0a0a0a";',
      'const color = "#fff";',
      "const color = `oklch(0.5 0.1 ${hue})`;",
      'const color = "rgb(0 0 0 / 0.5)";',
      'const color = "hsl(220 10% 50%)";',
      'const shadow = "0 0 0 1px color-mix(in oklch, var(--ring), transparent)";',
    ],
    allowed: [
      'const color = "var(--background)";',
      'const label = "Issue #12";',
      'const id = "section-label";',
    ],
  },
  {
    rule: "arch/no-inline-color-style",
    flagged: [
      '<div style={{ color: "red" }} />',
      "<div style={{ backgroundColor: tone }} />",
      '<div style={{ borderColor: "currentColor" }} />',
      '<div style={{ "fill": tone }} />',
    ],
    allowed: [
      "<div style={{ width: 4, transform: `translateX(${offset}px)` }} />",
      '<div style={{ "--normal-bg": "var(--popover)" } as React.CSSProperties} />',
    ],
  },
];

describe.each(styleCases)("$rule", ({ rule, flagged, allowed }) => {
  it.each(flagged)("fires on %s", async (snippet) => {
    expect(await snippetRuleIds(snippet, route)).toContain(rule);
  });

  it.each(allowed)("is silent on %s", async (snippet) => {
    expect(await snippetRuleIds(snippet, route)).not.toContain(rule);
  });

  it("is silent in test files", async () => {
    const [snippet = ""] = flagged;
    expect(await snippetRuleIds(snippet, routeTest)).not.toContain(rule);
  });
});

const primitive = "src/components/ui/probe.tsx";
const appComponent = "src/components/app/probe.tsx";
const restrictedClass = "better-tailwindcss/no-restricted-classes";

describe("off-set spacing", () => {
  const offSet = [
    '<div className="p-5" />',
    '<div className="md:px-7" />',
    '<div className="-mt-5" />',
    '<div className="gap-x-10" />',
    '<div className="space-y-2.5" />',
    '<div className="inset-x-3.5" />',
    '<div className="top-1.5" />',
    '<div className="hover:py-9" />',
    '<div className="p-px" />',
    '<div className="p-5!" />',
    '<div className="mt-[3px]" />',
    '<div className={cn("p-2", isOpen && "gap-1.5")} />',
  ];
  const onSet = [
    '<div className="p-0 p-0.5 p-1 p-2 p-3 p-4 p-6 p-8 p-12 p-16 -mx-2 gap-x-4 space-y-6" />',
    '<div className="top-1/2 left-full inset-0 mx-auto" />',
    '<div className="h-5 w-10 size-4.5 translate-x-5 min-h-11" />',
    '<div className="pb-[calc(1rem+var(--safe-area-bottom))] pt-[var(--safe-area-top)]" />',
  ];

  it.each(offSet)("fails in a route: %s", async (snippet) => {
    expect(await snippetRuleIds(snippet, route)).toContain(restrictedClass);
  });

  it("fails in the app-component layer", async () => {
    expect(await snippetRuleIds('<div className="p-5" />', appComponent)).toContain(
      restrictedClass
    );
  });

  it.each(onSet)("passes in a route: %s", async (snippet) => {
    expect(await snippetRuleIds(snippet, route)).not.toContain(restrictedClass);
  });

  it.each(offSet)("passes in a primitive: %s", async (snippet) => {
    expect(await snippetRuleIds(snippet, primitive)).not.toContain(restrictedClass);
  });
});

describe("transition-all", () => {
  it.each([route, appComponent, primitive, "src/hooks/probe.tsx"])("fails in %s", async (path) => {
    for (const snippet of [
      '<div className="transition-all" />',
      '<div className={cn("hover:transition-all")} />',
    ]) {
      expect(await snippetRuleIds(snippet, path)).toContain(restrictedClass);
    }
  });

  it("lets a primitive name what it animates", async () => {
    const snippet =
      '<div className="transition-colors transition-transform transition-opacity transition-[color,box-shadow] duration-move ease-out" />';
    expect(await snippetRuleIds(snippet, primitive)).not.toContain(restrictedClass);
  });
});

it("primitives keep the arbitrary color ban", async () => {
  expect(await snippetRuleIds('<div className="bg-[#1e40af]" />', primitive)).toContain(
    restrictedClass
  );
});

describe("arbitrary font-size, radius and shadow values", () => {
  const arbitrary = [
    '<div className="text-[13px]" />',
    '<div className="md:text-[0.8rem]" />',
    '<div className="text-[length:var(--size)]" />',
    '<div className="text-(length:--size)" />',
    '<div className="text-[calc(1rem+1vw)]" />',
    '<div className="rounded-[10px]" />',
    '<div className="rounded-t-[4px]" />',
    '<div className="rounded-(--card-radius)" />',
    '<div className="shadow-[0_0_0_1px_var(--ring)]" />',
    '<div className="hover:inset-shadow-[0_1px_0_0_black]" />',
    '<div className="drop-shadow-[0_1px_2px_black]" />',
    '<div className="text-shadow-[0_1px_0_black]" />',
    '<div className={cn("p-2", isOpen && "rounded-[3px]")} />',
  ];
  const sizing = [
    '<div className="w-[4.75rem] h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] size-(--cell-size)" />',
    '<div className="min-h-[44px] basis-[30%] translate-y-[calc(-50%-2px)] focus-visible:ring-[3px]" />',
    '<div className="text-body rounded-md rounded-[inherit] shadow-float shadow-none" />',
  ];

  it.each([route, primitive])("fail in %s", async (filePath) => {
    for (const snippet of arbitrary) {
      expect(await snippetRuleIds(snippet, filePath), snippet).toContain(restrictedClass);
    }
  });

  it.each([route, primitive])("arbitrary sizes and calc() pass in %s", async (filePath) => {
    for (const snippet of sizing) {
      expect(await snippetRuleIds(snippet, filePath), snippet).not.toContain(restrictedClass);
    }
  });
});

describe("no-unknown-classes", () => {
  const unknownClass = "better-tailwindcss/no-unknown-classes";
  const removed = [
    "text-green-600",
    "text-sm",
    "shadow-lg",
    "font-light",
    "bg-white",
    "bg-black/50",
    "shadow",
    "rounded",
    "rounded-xl",
    "text-incoming",
  ];

  it.each([route, primitive])("flags removed defaults in %s", async (filePath) => {
    for (const className of removed) {
      expect(
        await snippetRuleIds(`<div className="${className}" />`, filePath),
        className
      ).toContain(unknownClass);
    }
  });

  it("knows the design system", async () => {
    const snippet =
      '<div className="text-income bg-card text-body font-medium shadow-float shadow-none rounded-md rounded-full bg-transparent" />';
    expect(await snippetRuleIds(snippet, route)).not.toContain(unknownClass);
  });
});

it.each([
  ["src/components/accounts/probe.tsx", "../ui/button"],
  ["src/components/probe.tsx", "./ui/button"],
  ["src/routes/probe.tsx", "../components/ui/button"],
  ["src/hooks/probe.ts", "@/components/ui/sonner"],
])("arch/no-direct-primitive-import fires in %s for %s", async (filePath, source) => {
  const code = `import * as primitive from "${source}";\nexport { primitive };\n`;
  expect(await ruleIds(code, filePath)).toContain("arch/no-direct-primitive-import");
});

it("primitives may import each other", async () => {
  const code =
    'import { Button } from "./button";\nimport { Label } from "@/components/ui/label";\nexport { Button, Label };\n';
  expect(await ruleIds(code, "src/components/ui/probe.tsx")).not.toContain(
    "arch/no-direct-primitive-import"
  );
});

it("the primitive ban leaves the routes and components import bans in place", async () => {
  const code = 'import { supabase } from "@/lib/supabase";\nexport { supabase };\n';
  expect(await ruleIds(code, "src/components/accounts/AccountList.tsx")).toContain(
    "no-restricted-imports"
  );
});

const typeScriptProbes = [
  "src/lib/probe.ts",
  "src/components/probe.tsx",
  "src/lib/probe.test.ts",
  "src/sw.ts",
  "workers/probe.ts",
  "tests/e2e/probe.ts",
  "supabase/functions/probe/index.ts",
];

it.each(typeScriptProbes)("an inline-only type import fails in %s", async (filePath) => {
  const code =
    'import { type Session } from "@supabase/supabase-js";\nexport let session: Session;\n';
  expect(await ruleIds(code, filePath)).toContain("@typescript-eslint/no-import-type-side-effects");
});

it("a value import used only as a type fails", async () => {
  const code =
    'import { AuthError } from "@supabase/supabase-js";\nexport let error: AuthError | null = null;\n';
  expect(await ruleIds(code, "src/components/probe.tsx")).toContain(
    "@typescript-eslint/consistent-type-imports"
  );
});

it("a mixed value and type import stays legal", async () => {
  const code =
    'import { createClient, type Session } from "@supabase/supabase-js";\nexport const make = createClient;\nexport let session: Session;\n';
  expect(await ruleIds(code, "src/lib/probe.ts")).toEqual([]);
});

it("typeof import() stays legal in a Vitest mock", async () => {
  const code =
    'import { vi } from "vitest";\nvi.mock("@/lib/assistant/client", async (importOriginal) => ({\n  ...(await importOriginal<typeof import("@/lib/assistant/client")>()),\n}));\n';
  expect(await ruleIds(code, "src/lib/probe.test.ts")).not.toContain(
    "@typescript-eslint/consistent-type-imports"
  );
});

describe("the directPrimitiveImporters allowlist only shrinks", () => {
  const ALLOWLIST_CEILING = 28;

  async function loadAllowlist(): Promise<string[]> {
    const config: unknown = await import(pathToFileURL(path.resolve("eslint.config.js")).href);
    const list =
      typeof config === "object" && config !== null && "directPrimitiveImporters" in config
        ? config.directPrimitiveImporters
        : undefined;
    if (!Array.isArray(list) || !list.every((entry) => typeof entry === "string")) {
      throw new Error("eslint.config.js must export directPrimitiveImporters as a string array");
    }
    return list;
  }

  it("never grows", async () => {
    const allowlist = await loadAllowlist();
    expect(
      allowlist.length,
      `directPrimitiveImporters has ${allowlist.length} entries. Never add one; when you migrate a file off ui/ primitives, delete its entry and lower ALLOWLIST_CEILING to the new count.`
    ).toBeLessThanOrEqual(ALLOWLIST_CEILING);
  });

  it("lists only files that still import a primitive", async () => {
    const allowlist = await loadAllowlist();
    const stale: string[] = [];
    for (const entry of allowlist) {
      const source = await readFile(entry, "utf8");
      const probe = path.join(path.dirname(entry), `allowlist-probe${path.extname(entry)}`);
      if (!(await ruleIds(source, probe)).includes("arch/no-direct-primitive-import")) {
        stale.push(entry);
      }
    }
    expect(
      stale,
      "These files no longer import a ui/ primitive; remove them from directPrimitiveImporters"
    ).toEqual([]);
  });
});
