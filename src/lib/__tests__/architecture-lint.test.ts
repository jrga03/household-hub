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
