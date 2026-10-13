import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { decryptOfficeFile } from "./office-encryption";
import { StatementParseError, type StatementParseProblem } from "./statement";
import { unionBankCreditCardXlsx } from "./unionbank-xlsx";
import { readFirstSheet, type Cell } from "./xlsx";

const FIXTURES = "tests/fixtures/statements";
const FIXTURE_PASSWORD = "fixture-password";

function readFixture(name: string): ArrayBuffer {
  const bytes = readFileSync(`${FIXTURES}/${name}`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("UnionBank credit card XLSX", () => {
  it("reads every purchase, refund and payment line", async () => {
    const lines = await unionBankCreditCardXlsx.parse(
      readFixture("unionbank-credit-card.xlsx"),
      FIXTURE_PASSWORD
    );

    expect(lines).toEqual([
      {
        purchaseDate: "2026-07-05",
        postingDate: "2026-07-05",
        description: "SARI SARI STORE QUEZON PH",
        amount: 15000,
        type: "expense",
        isCardPayment: false,
      },
      {
        purchaseDate: "2026-07-05",
        postingDate: "2026-07-05",
        description: "SARI SARI STORE QUEZON PH",
        amount: 15000,
        type: "expense",
        isCardPayment: false,
      },
      {
        purchaseDate: "2026-07-12",
        postingDate: "2026-07-12",
        description: "BDO BILLS PAYMENT",
        amount: 500000,
        type: "income",
        isCardPayment: true,
      },
      {
        purchaseDate: "2026-07-20",
        postingDate: "2026-07-20",
        description: "ONLINE SHOP & CO MAKATI PH",
        amount: 126404,
        type: "expense",
        isCardPayment: false,
      },
      {
        purchaseDate: "2026-07-21",
        postingDate: "2026-07-21",
        description: "ONLINE SHOP & CO MAKATI PH",
        amount: 1000,
        type: "income",
        isCardPayment: false,
      },
      {
        purchaseDate: "2026-08-01",
        postingDate: "2026-08-01",
        description: "LATE PAYMENT FEE",
        amount: 109669,
        type: "expense",
        isCardPayment: false,
      },
      {
        purchaseDate: "2026-08-02",
        postingDate: "2026-08-02",
        description: "LATE PAYMENT FEE REVERSAL",
        amount: 109669,
        type: "income",
        isCardPayment: false,
      },
    ]);
  });

  it.each<[string, string, string, StatementParseProblem]>([
    ["a wrong password", "unionbank-credit-card.xlsx", "not-it", "wrong-password"],
    ["no password", "unionbank-credit-card.xlsx", "", "password-required"],
    [
      "a workbook that isn't a statement",
      "not-a-statement.xlsx",
      FIXTURE_PASSWORD,
      "unrecognised-layout",
    ],
    [
      "a file that isn't a workbook",
      "bdo-credit-card.pdf",
      FIXTURE_PASSWORD,
      "unrecognised-layout",
    ],
  ])("refuses %s with a clear problem", async (_case, fixture, password, problem) => {
    const parsing = unionBankCreditCardXlsx.parse(readFixture(fixture), password);

    await expect(parsing).rejects.toBeInstanceOf(StatementParseError);
    await expect(parsing).rejects.toMatchObject({ problem });
  });
});

// Real statements stay on the developer's machine (git-ignored); CI skips this.
// Each has its own password, in .env.local as UB_STATEMENT_PASSWORD_<yymm>.
const PRIVATE = `${FIXTURES}/private`;
const ENV_LOCAL = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const realStatements = (existsSync(PRIVATE) ? readdirSync(PRIVATE) : []).flatMap((name) => {
  const month = /^(\d{4}) - .*\.xlsx$/i.exec(name)?.[1];
  const password = new RegExp(`^UB_STATEMENT_PASSWORD_${month}=(.+)$`, "m")
    .exec(ENV_LOCAL)?.[1]
    ?.trim();
  return month && password ? [{ name, password }] : [];
});

/** The amount on a summary row of the header block, in signed cents, as the bank shows it. */
function summaryAmount(rows: Cell[][], label: string): number {
  const amount = rows.find((row) => row[1] === label)?.at(-1);
  return typeof amount === "number" ? Math.round(amount * 100) : Number.NaN;
}

describe.skipIf(realStatements.length === 0)("UnionBank credit card XLSX, real statements", () => {
  it.each(realStatements)(
    "$name: lines add up to the statement's purchases, credits and total",
    async ({ name, password }) => {
      const data = readFixture(`private/${name}`);

      const lines = await unionBankCreditCardXlsx.parse(data, password);
      const rows = (await readFirstSheet(await decryptOfficeFile(data, password))) ?? [];

      const charges = lines.filter((line) => line.type === "expense");
      const credits = lines.filter((line) => line.type === "income");
      const total = (picked: typeof lines) => picked.reduce((sum, line) => sum + line.amount, 0);
      expect(lines.length).toBeGreaterThan(0);
      expect(total(charges)).toBe(summaryAmount(rows, "PURCHASES & ADVANCES"));
      expect(total(credits)).toBe(Math.abs(summaryAmount(rows, "PAYMENTS & CREDITS")));
      expect(summaryAmount(rows, "PREVIOUS BALANCE") + total(charges) - total(credits)).toBe(
        summaryAmount(rows, "TOTAL AMOUNT DUE")
      );
    }
  );
});
