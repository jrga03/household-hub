/**
 * Throwaway benchmark for research ticket #269 (branch research/reports-compute only).
 * Seeds the transactions projection with 10,000 rows over 24 months and 40
 * categories, then times a Reports Year read on demand, Dexie read included.
 * Run: npx vitest run src/lib/reports/compute.research.test.ts --project node
 */

import { beforeAll, describe, expect, it } from "vitest";
import { asCents, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { AllocationRow } from "@/lib/allocations/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import { readMoneyRecords } from "@/lib/transactions/money";
import { monthOfDate, shiftMonth } from "@/lib/utils/dates";

const TRANSACTION_COUNT = 10_000;
const CATEGORY_COUNT = 40;
const END_MONTH = "2026-10";
const MONTHS_SEEDED = 24;
const ME = "user-me";
const PARTNER = "user-partner";
const RUNS = 40;
const WARMUP = 5;

const categoryIds = Array.from({ length: CATEGORY_COUNT }, (_, i) => `category-${i}`);
const accountIds = ["bank", "wallet", "card", "savings"];

// Deterministic PRNG so every run seeds the same rows.
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedTransactions(): TransactionRow[] {
  const random = mulberry32(269);
  const startMonth = shiftMonth(END_MONTH, -(MONTHS_SEEDED - 1));
  return Array.from({ length: TRANSACTION_COUNT }, (_, i) => {
    const month = shiftMonth(startMonth, Math.floor(random() * MONTHS_SEEDED));
    const day = String(1 + Math.floor(random() * 28)).padStart(2, "0");
    const personal = random() < 0.3;
    return {
      id: crypto.randomUUID(),
      householdId: "household",
      visibility: personal ? "personal" : "household",
      ownerUserId: personal ? (random() < 0.5 ? ME : PARTNER) : null,
      date: `${month}-${day}`,
      type: random() < 0.9 ? "expense" : "income",
      amountCents: asCents(100 + Math.floor(random() * 500_000)),
      accountId: accountIds[Math.floor(random() * accountIds.length)] ?? "bank",
      categoryId:
        random() < 0.05 ? null : (categoryIds[Math.floor(random() * CATEGORY_COUNT)] ?? null),
      payingAccountId: null,
      description: `Purchase ${i} at some store with a realistic length`,
      notes: random() < 0.2 ? "A short note about this purchase" : "",
      status: "cleared",
      removed: random() < 0.03,
      recordedHlc: `${String(i).padStart(13, "0")}-0000-device`,
      importKey: null,
    } satisfies TransactionRow;
  });
}

type View = "household" | "mine";

const shownIn = (view: View) => (row: Pick<TransactionRow, "visibility" | "ownerUserId">) =>
  view === "household"
    ? row.visibility === "household"
    : row.visibility === "personal" && row.ownerUserId === ME;

interface CategoryReport {
  categoryId: string;
  spending: number;
  previous: number;
  sparkline: number[];
}

/**
 * One pass: net spending per category per month over the period and the
 * previous period (Unassigned kept apart as "unassigned"), then totals,
 * change and sparklines, ranked by spending.
 */
function summarizeReport(
  transactions: TransactionRow[],
  view: View,
  endMonth: string,
  periodMonths: number
): CategoryReport[] {
  const isShown = shownIn(view);
  const firstMonth = shiftMonth(endMonth, -(periodMonths * 2 - 1));
  const monthIndex = new Map<string, number>();
  for (let i = 0; i < periodMonths * 2; i++) monthIndex.set(shiftMonth(firstMonth, i), i);

  const byCategory = new Map<string, number[]>();
  for (const transaction of transactions) {
    if (transaction.removed || !isShown(transaction)) continue;
    const index = monthIndex.get(monthOfDate(transaction.date));
    if (index === undefined) continue;
    const key = transaction.categoryId ?? "unassigned";
    let months = byCategory.get(key);
    if (!months) {
      months = new Array<number>(periodMonths * 2).fill(0);
      byCategory.set(key, months);
    }
    months[index] =
      (months[index] ?? 0) +
      (transaction.type === "expense" ? transaction.amountCents : -transaction.amountCents);
  }

  const reports: CategoryReport[] = [];
  for (const [categoryId, months] of byCategory) {
    const sparkline = months.slice(periodMonths);
    reports.push({
      categoryId,
      spending: sparkline.reduce((sum, cents) => sum + cents, 0),
      previous: months.slice(0, periodMonths).reduce((sum, cents) => sum + cents, 0),
      sparkline,
    });
  }
  return reports.sort((a, b) => b.spending - a.spending);
}

/** The month.ts pattern repeated: one full pass over the transactions per month. */
function summarizeReportPerMonthPass(
  transactions: TransactionRow[],
  view: View,
  endMonth: string,
  periodMonths: number
): Map<string, Map<string, number>> {
  const isShown = shownIn(view);
  const byMonth = new Map<string, Map<string, number>>();
  for (let i = 0; i < periodMonths * 2; i++) {
    const month = shiftMonth(endMonth, -i);
    const spent = new Map<string, number>();
    for (const transaction of transactions) {
      if (
        transaction.removed ||
        transaction.categoryId === null ||
        !isShown(transaction) ||
        monthOfDate(transaction.date) !== month
      )
        continue;
      const signed =
        transaction.type === "expense" ? transaction.amountCents : -transaction.amountCents;
      spent.set(transaction.categoryId, (spent.get(transaction.categoryId) ?? 0) + signed);
    }
    byMonth.set(month, spent);
  }
  return byMonth;
}

async function readPeriodByIndex(endMonth: string, periodMonths: number) {
  const firstMonth = shiftMonth(endMonth, -(periodMonths * 2 - 1));
  return db.transactions
    .where("[date+recordedHlc]")
    .between([`${firstMonth}-01`, ""], [`${endMonth}-31`, "￿"], true, true)
    .toArray();
}

async function time(label: string, task: () => unknown) {
  for (let i = 0; i < WARMUP; i++) await task();
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    await task();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const at = (q: number) =>
    samples[Math.min(samples.length - 1, Math.floor(q * samples.length))] ?? 0;
  const result = {
    label,
    median: at(0.5).toFixed(2),
    p95: at(0.95).toFixed(2),
    max: at(1).toFixed(2),
  };
  console.log(JSON.stringify(result));
  return result;
}

describe("Reports on-read cost (#269)", () => {
  beforeAll(async () => {
    await resetLocalDatabase();
    await db.transactions.bulkPut(seedTransactions());
    const random = mulberry32(7);
    await db.allocations.bulkPut(
      Array.from({ length: 2_000 }, (_, i) => ({
        id: crypto.randomUUID(),
        householdId: "household",
        visibility: "household",
        ownerUserId: null,
        date: `${shiftMonth(END_MONTH, -Math.floor(random() * 24))}-01`,
        accountId: "bank",
        from: { kind: "unassigned" },
        to: { kind: "category", id: categoryIds[i % CATEGORY_COUNT] ?? "category-0" },
        amountCents: asCents(10_000) as Cents,
        removed: false,
        recordedHlc: String(i),
      })) as AllocationRow[]
    );
    await db.transfers.bulkPut(
      Array.from({ length: 1_000 }, (_, i) => ({
        id: crypto.randomUUID(),
        householdId: "household",
        visibility: "household",
        ownerUserId: null,
        date: `${shiftMonth(END_MONTH, -Math.floor(random() * 24))}-15`,
        fromAccountId: "bank",
        toAccountId: "card",
        amountCents: asCents(50_000),
        description: "",
        notes: "",
        status: "cleared",
        removed: false,
        recordedHlc: String(i),
      })) as unknown as TransferRow[]
    );
  });

  it("times a Year (12 months + previous 12 + sparklines) read on demand", async () => {
    expect(await db.transactions.count()).toBe(TRANSACTION_COUNT);
    const rows = await db.transactions.toArray();

    await time("dexie: transactions.toArray (10k)", () => db.transactions.toArray());
    await time("dexie: [date+recordedHlc] range, 24 months", () =>
      readPeriodByIndex(END_MONTH, 12)
    );
    await time("dexie: readMoneyRecords (all 5 tables)", () => readMoneyRecords());
    await time("compute: one pass, household", () =>
      summarizeReport(rows, "household", END_MONTH, 12)
    );
    await time("compute: one pass, mine", () => summarizeReport(rows, "mine", END_MONTH, 12));
    await time("compute: month.ts pattern x24 passes", () =>
      summarizeReportPerMonthPass(rows, "household", END_MONTH, 12)
    );
    await time("end to end: toArray + one pass", async () =>
      summarizeReport(await db.transactions.toArray(), "household", END_MONTH, 12)
    );
    await time("end to end: index range + one pass", async () =>
      summarizeReport(await readPeriodByIndex(END_MONTH, 12), "household", END_MONTH, 12)
    );
    await time("end to end: Month period (index range + one pass)", async () =>
      summarizeReport(await readPeriodByIndex(END_MONTH, 1), "household", END_MONTH, 1)
    );

    const report = summarizeReport(rows, "household", END_MONTH, 12);
    expect(report.length).toBeGreaterThan(CATEGORY_COUNT - 1);
    expect(report[0]?.sparkline).toHaveLength(12);
  }, 120_000);
});
