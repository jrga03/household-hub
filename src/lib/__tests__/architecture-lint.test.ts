import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// Drives the real eslint.config.js so a glob typo or a moved
// eslint/use-at-your-own-risk export cannot silently disable a rule.
let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint();
});

async function ruleIds(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId);
}

const cases = [
  {
    rule: "arch/no-direct-dexie-writes",
    code: 'import { db } from "@/lib/dexie/db";\nexport const write = () => db.transactions.add({} as never);\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/offline/probe.ts",
  },
  {
    rule: "arch/no-direct-supabase-writes",
    code: 'import { supabase } from "@/lib/supabase";\nexport const write = () => supabase.from("accounts").update({}).eq("id", "x");\n',
    flagged: "src/lib/probe.ts",
    allowed: "src/lib/sync/probe.ts",
  },
  {
    rule: "arch/no-ad-hoc-money-parse",
    code: 'export const cents = Math.round(parseFloat("1.50") * 100);\n',
    flagged: "src/components/probe.tsx",
    allowed: "src/lib/currency.ts",
  },
  {
    rule: "arch/no-raw-transactions-from",
    code: 'import { supabase } from "@/lib/supabase";\nexport const read = () => supabase.from("transactions").select("*");\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/supabaseQueries.ts",
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
    flagged: "src/lib/debts/probe.ts",
    allowed: "src/lib/validations/probe.ts",
  },
  {
    rule: "no-restricted-imports",
    code: 'import { nanoid } from "nanoid";\nexport const id = nanoid();\n',
    flagged: "src/lib/debts/probe.ts",
    allowed: "src/lib/sync/probe.ts",
  },
  {
    rule: "no-restricted-imports",
    code: 'import { db } from "@/lib/dexie/db";\nexport const count = () => db.transactions.count();\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/offline/probe.ts",
  },
  {
    rule: "arch/no-inline-query-keys",
    code: 'import { useQuery } from "@tanstack/react-query";\nexport const useProbe = () => useQuery({ queryKey: ["probe"] as const, queryFn: async () => 1 });\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/query-keys.ts",
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

it("arch/no-inline-query-keys flags a plain array key", async () => {
  const code =
    'import { queryOptions } from "@tanstack/react-query";\nexport const probe = () => queryOptions({ queryKey: ["probe"], queryFn: async () => 1 });\n';
  expect(await ruleIds(code, "src/lib/probe.ts")).toContain("arch/no-inline-query-keys");
});

it("@tanstack/query/prefer-query-options is an error in production code", async () => {
  const code =
    'import { useQueryClient } from "@tanstack/react-query";\nexport const useProbe = () => { const queryClient = useQueryClient(); return () => queryClient.invalidateQueries({ queryKey: ["probe"] }); };\n';
  const [result] = await eslint.lintText(code, { filePath: "src/hooks/probe.ts" });
  const message = result.messages.find((m) => m.ruleId === "@tanstack/query/prefer-query-options");
  expect(message?.severity).toBe(2);
});

it("@tanstack/query rules stay off in test files", async () => {
  const code =
    'import { useQueryClient } from "@tanstack/react-query";\nexport const useProbe = () => { const queryClient = useQueryClient(); return () => queryClient.invalidateQueries({ queryKey: ["probe"] }); };\n';
  expect(await ruleIds(code, "src/hooks/probe.test.ts")).not.toContain(
    "@tanstack/query/prefer-query-options"
  );
});

// Deliberately not allowlisted (design Decisions & Deferrals): debt sync must stay visible to the rule.
it("arch/no-direct-supabase-writes fires in src/lib/debts/sync.ts", async () => {
  const code =
    'import { supabase } from "@/lib/supabase";\nexport const write = () => supabase.from("debts").update({}).eq("id", "x");\n';
  expect(await ruleIds(code, "src/lib/debts/sync.ts")).toContain("arch/no-direct-supabase-writes");
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

it("no-restricted-imports bans nanoid in src/lib/offline", async () => {
  const code = 'import { nanoid } from "nanoid";\nexport const id = nanoid();\n';
  expect(await ruleIds(code, "src/lib/offline/probe.ts")).toContain("no-restricted-imports");
});

it("no-restricted-imports flags asCents in src/lib/offline", async () => {
  const code = 'import { asCents } from "@/lib/currency";\nexport const total = asCents(1);\n';
  expect(await ruleIds(code, "src/lib/offline/probe.ts")).toContain("no-restricted-imports");
});

it("no-restricted-imports flags asCents in src/lib/sync", async () => {
  const code = 'import { asCents } from "@/lib/currency";\nexport const total = asCents(1);\n';
  expect(await ruleIds(code, "src/lib/sync/probe.ts")).toContain("no-restricted-imports");
});

it("no-restricted-imports still bans nanoid in src/lib/debts alongside asCents", async () => {
  const code = 'import { nanoid } from "nanoid";\nexport const id = nanoid();\n';
  expect(await ruleIds(code, "src/lib/debts/probe.ts")).toContain("no-restricted-imports");
});

it("no-restricted-imports allows type-only imports from the database module", async () => {
  const code =
    'import type { LocalTransaction } from "@/lib/dexie/db";\nexport type Row = LocalTransaction;\n';
  expect(await ruleIds(code, "src/components/probe.tsx")).not.toContain("no-restricted-imports");
});

it("no-restricted-imports flags the writable db in validations and routes", async () => {
  const code =
    'import { db } from "@/lib/dexie/db";\nexport const count = () => db.transactions.count();\n';
  expect(await ruleIds(code, "src/lib/validations/probe.ts")).toContain("no-restricted-imports");
  expect(await ruleIds(code, "src/routes/probe.tsx")).toContain("no-restricted-imports");
});

it("no-restricted-imports flags the writable db imported with a .ts extension", async () => {
  const code =
    'import { db } from "@/lib/dexie/db.ts";\nexport const count = () => db.transactions.count();\n';
  expect(await ruleIds(code, "src/hooks/probe.ts")).toContain("no-restricted-imports");
  expect(await ruleIds(code, "src/lib/offline/probe.ts")).not.toContain("no-restricted-imports");
});

it("no-restricted-imports flags constructing a HouseholdHubDB outside the data layer", async () => {
  const code =
    'import { HouseholdHubDB } from "@/lib/dexie/db";\nexport const writable = new HouseholdHubDB();\n';
  expect(await ruleIds(code, "src/components/probe.tsx")).toContain("no-restricted-imports");
  expect(await ruleIds(code, "src/lib/offline/probe.ts")).not.toContain("no-restricted-imports");
});
