import { describe, expect, it } from "vitest";
import { cents } from "@/test/cents";
import type { StatementFormatId, StatementLine } from "./statement";
import { withImportKeys } from "./import-key";

const importKeys = async (formatId: StatementFormatId, accountId: string, lines: StatementLine[]) =>
  (await withImportKeys(formatId, accountId, lines)).map((line) => line.importKey);

const CARD = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_CARD = "aaaaaaaa-0000-4000-8000-000000000002";

const line = (description: string, overrides: Partial<StatementLine> = {}): StatementLine => ({
  purchaseDate: "2026-09-03",
  postingDate: "2026-09-04",
  description,
  amount: cents(15000),
  type: "expense",
  isCardPayment: false,
  ...overrides,
});

const coffee = line("COFFEE SHOP MAKATI");
const grocery = line("SM SUPERMARKET", { amount: cents(254075) });

describe("importKeys", () => {
  it("gives the same keys when the same statement is imported again", async () => {
    const first = await importKeys("bdo-credit-card-pdf", CARD, [coffee, grocery]);
    const again = await importKeys("bdo-credit-card-pdf", CARD, [coffee, grocery]);

    expect(again).toEqual(first);
    expect(new Set(first).size).toBe(2);
  });

  it("tells two identical lines on one statement apart", async () => {
    const [firstCoffee, secondCoffee] = await importKeys("bdo-credit-card-pdf", CARD, [
      coffee,
      { ...coffee },
    ]);

    expect(firstCoffee).not.toBe(secondCoffee);
  });

  it("numbers identical lines among themselves, not among every line", async () => {
    const [, firstCoffee, , secondCoffee] = await importKeys("bdo-credit-card-pdf", CARD, [
      grocery,
      coffee,
      grocery,
      coffee,
    ]);
    const [aloneFirst, aloneSecond] = await importKeys("bdo-credit-card-pdf", CARD, [
      coffee,
      coffee,
    ]);

    expect([firstCoffee, secondCoffee]).toEqual([aloneFirst, aloneSecond]);
  });

  it("differs by format, account, date, description and amount", async () => {
    const [base] = await importKeys("bdo-credit-card-pdf", CARD, [coffee]);
    const variants = await Promise.all([
      importKeys("unionbank-credit-card-xlsx", CARD, [coffee]),
      importKeys("bdo-credit-card-pdf", OTHER_CARD, [coffee]),
      importKeys("bdo-credit-card-pdf", CARD, [{ ...coffee, purchaseDate: "2026-09-02" }]),
      importKeys("bdo-credit-card-pdf", CARD, [{ ...coffee, description: "COFFEE SHOP BGC" }]),
      importKeys("bdo-credit-card-pdf", CARD, [{ ...coffee, amount: cents(15001) }]),
    ]);

    for (const [key] of variants) expect(key).not.toBe(base);
  });

  it("ignores the posting date, which a bank may print differently", async () => {
    const [base] = await importKeys("bdo-credit-card-pdf", CARD, [coffee]);
    const [reposted] = await importKeys("bdo-credit-card-pdf", CARD, [
      { ...coffee, postingDate: "2026-09-06" },
    ]);

    expect(reposted).toBe(base);
  });
});
