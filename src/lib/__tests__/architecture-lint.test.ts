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

it.each([
  "src/hooks/probe.ts",
  "src/components/probe.tsx",
  "src/lib/probe.ts",
  "src/lib/dexie/probe.ts",
  "src/lib/currency.ts",
])("no-restricted-imports bans nanoid in %s", async (filePath) => {
  const code = 'import { nanoid } from "nanoid";\nexport const id = nanoid();\n';
  expect(await ruleIds(code, filePath)).toContain("no-restricted-imports");
});
