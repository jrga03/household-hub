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
    expect(await ruleIds(`export const probe = () => { ${snippet} };\n`, route)).toContain(rule);
  });

  it.each(allowed)("is silent on %s", async (snippet) => {
    expect(await ruleIds(`export const probe = () => { ${snippet} };\n`, route)).not.toContain(
      rule
    );
  });

  it("is silent in test files", async () => {
    const [snippet] = flagged;
    expect(await ruleIds(`export const probe = () => { ${snippet} };\n`, routeTest)).not.toContain(
      rule
    );
  });
});

describe("better-tailwindcss reads the theme from src/index.css", () => {
  let themeLint: ESLint;
  beforeAll(() => {
    themeLint = new ESLint({
      overrideConfig: [
        {
          files: ["src/**/*.{ts,tsx}"],
          languageOptions: { parserOptions: { projectService: false } },
          rules: {
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-misused-promises": "off",
            "better-tailwindcss/no-unknown-classes": "error",
          },
        },
      ],
    });
  });

  async function unknownClassMessages(className: string) {
    const [result] = await themeLint.lintText(
      `export const probe = () => <div className="${className}" />;\n`,
      { filePath: route }
    );
    return (result?.messages ?? []).filter(
      (message) => message.ruleId === "better-tailwindcss/no-unknown-classes"
    );
  }

  it("knows a project token class", async () => {
    expect(await unknownClassMessages("text-income bg-card")).toHaveLength(0);
  });

  it("flags a made-up class", async () => {
    expect(await unknownClassMessages("text-incoming")).toHaveLength(1);
  });
});
