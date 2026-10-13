import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { bdoCreditCardPdf } from "./bdo-pdf";
import { readPdfLines } from "./pdf-text";
import { StatementParseError, type StatementParseProblem } from "./statement";

const FIXTURES = "tests/fixtures/statements";
const FIXTURE_PASSWORD = "fixture-password";

function readFixture(name: string): ArrayBuffer {
  const bytes = readFileSync(`${FIXTURES}/${name}`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("BDO credit card PDF", () => {
  it("reads every purchase, refund and payment line across pages", async () => {
    const lines = await bdoCreditCardPdf.parse(
      readFixture("bdo-credit-card.pdf"),
      FIXTURE_PASSWORD
    );

    expect(lines).toEqual([
      {
        purchaseDate: "2026-07-28",
        postingDate: "2026-07-29",
        description: "SARI SARI STORE QUEZON PH",
        amount: 15000,
        type: "expense",
        isCardPayment: false,
      },
      {
        purchaseDate: "2026-07-28",
        postingDate: "2026-07-29",
        description: "SARI SARI STORE QUEZON PH",
        amount: 15000,
        type: "expense",
        isCardPayment: false,
      },
      {
        purchaseDate: "2026-08-02",
        postingDate: "2026-08-02",
        description: "PAYMENT RECEIVED - THANK YOU",
        amount: 1234567,
        type: "income",
        isCardPayment: true,
      },
      {
        purchaseDate: "2026-08-03",
        postingDate: "2026-08-05",
        description: "ONLINE SHOP (PH) MAKATI PH",
        amount: 199950,
        type: "expense",
        isCardPayment: false,
      },
      {
        purchaseDate: "2026-08-04",
        postingDate: "2026-08-05",
        description: "ONLINE SHOP (PH) MAKATI PH",
        amount: 49950,
        type: "income",
        isCardPayment: false,
      },
      {
        purchaseDate: "2025-12-30",
        postingDate: "2026-01-02",
        description: "STREAMING SVC SG SG",
        amount: 54900,
        type: "expense",
        isCardPayment: false,
      },
      {
        purchaseDate: "2026-08-16",
        postingDate: "2026-08-16",
        description: "FINANCE CHARGE-RETAIL PURCHASES",
        amount: 1234,
        type: "expense",
        isCardPayment: false,
      },
    ]);
  });

  it.each<[string, string, string, StatementParseProblem]>([
    ["a wrong password", "bdo-credit-card.pdf", "not-it", "wrong-password"],
    ["no password", "bdo-credit-card.pdf", "", "password-required"],
    ["a PDF that isn't a statement", "not-a-statement.pdf", "", "unrecognised-layout"],
  ])("refuses %s with a clear problem", async (_case, fixture, password, problem) => {
    const parsing = bdoCreditCardPdf.parse(readFixture(fixture), password);

    await expect(parsing).rejects.toBeInstanceOf(StatementParseError);
    await expect(parsing).rejects.toMatchObject({ problem });
  });

  it("says a file that isn't a PDF is unrecognised", async () => {
    const notPdf = new TextEncoder().encode("Date,Description,Amount\n").buffer;

    await expect(bdoCreditCardPdf.parse(notPdf, "")).rejects.toMatchObject({
      problem: "unrecognised-layout",
    });
  });
});

// Real statements stay on the developer's machine (git-ignored); CI skips this.
const PRIVATE = `${FIXTURES}/private`;
const realStatements = existsSync(PRIVATE)
  ? readdirSync(PRIVATE).filter((name) => /^BDO-SOA-.*\.pdf$/.test(name))
  : [];
const BDO_STATEMENT_PASSWORD = existsSync(".env.local")
  ? /^BDO_STATEMENT_PASSWORD=(.+)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim()
  : undefined;

/** The amount printed after a summary row's label, in signed cents, as the bank shows it. */
function summaryAmount(lines: string[][], label: string): number {
  const amount = lines.find((line) => line[0] === label)?.at(-1);
  return amount ? Math.round(Number(amount.replace(/,/g, "")) * 100) : 0;
}

describe.skipIf(realStatements.length === 0 || !BDO_STATEMENT_PASSWORD)(
  "BDO credit card PDF, real statements",
  () => {
    it.each(realStatements)("%s: previous balance plus every line is the total", async (name) => {
      const data = readFixture(`private/${name}`);
      const password = BDO_STATEMENT_PASSWORD ?? "";

      const lines = await bdoCreditCardPdf.parse(data, password);
      const printed = await readPdfLines(data, password);

      const charged = lines.reduce(
        (sum, line) => sum + (line.type === "expense" ? line.amount : -line.amount),
        0
      );
      expect(lines.length).toBeGreaterThan(0);
      expect(summaryAmount(printed, "PREVIOUS STATEMENT BALANCE") + charged).toBe(
        summaryAmount(printed, "TOTAL")
      );
      expect(
        lines.filter((line) => line.isCardPayment).every((line) => line.type === "income")
      ).toBe(true);
    });
  }
);
