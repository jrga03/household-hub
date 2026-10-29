/* global Dexie, performance, console -- page and Node globals in a throwaway benchmark */
// Throwaway benchmark for research ticket #269: the same Reports Year read in
// headless Chromium, on real IndexedDB through Dexie, at 1x, 4x and 6x CPU
// throttling. Run from the repo root: node docs/research/reports-compute-browser-bench.mjs
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dexieScript = require.resolve("dexie/dist/dexie.js");

async function benchInPage() {
  const RUNS = 40;
  const WARMUP = 5;
  const ME = "user-me";
  const END_MONTH = "2026-10";

  const shiftMonth = (month, by) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const index = year * 12 + (monthNumber - 1) + by;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  };

  let state = 269;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  await Dexie.delete("bench");
  const db = new Dexie("bench");
  db.version(1).stores({ transactions: "id, [date+recordedHlc]" });
  const start = shiftMonth(END_MONTH, -23);
  const rows = Array.from({ length: 10_000 }, (_, i) => {
    const month = shiftMonth(start, Math.floor(random() * 24));
    const personal = random() < 0.3;
    return {
      id: `tx-${String(i).padStart(8, "0")}-${Math.floor(random() * 1e9)}`,
      householdId: "household",
      visibility: personal ? "personal" : "household",
      ownerUserId: personal ? (random() < 0.5 ? ME : "user-partner") : null,
      date: `${month}-${String(1 + Math.floor(random() * 28)).padStart(2, "0")}`,
      type: random() < 0.9 ? "expense" : "income",
      amountCents: 100 + Math.floor(random() * 500_000),
      accountId: "bank",
      categoryId: random() < 0.05 ? null : `category-${Math.floor(random() * 40)}`,
      payingAccountId: null,
      description: `Purchase ${i} at some store with a realistic length`,
      notes: random() < 0.2 ? "A short note about this purchase" : "",
      status: "cleared",
      removed: random() < 0.03,
      recordedHlc: `${String(i).padStart(13, "0")}-0000-device`,
      importKey: null,
    };
  });
  await db.transactions.bulkPut(rows);

  function summarizeReport(transactions, view, endMonth, periodMonths) {
    const isShown = (row) =>
      view === "household"
        ? row.visibility === "household"
        : row.visibility === "personal" && row.ownerUserId === ME;
    const firstMonth = shiftMonth(endMonth, -(periodMonths * 2 - 1));
    const monthIndex = new Map();
    for (let i = 0; i < periodMonths * 2; i++) monthIndex.set(shiftMonth(firstMonth, i), i);
    const byCategory = new Map();
    for (const transaction of transactions) {
      if (transaction.removed || !isShown(transaction)) continue;
      const index = monthIndex.get(transaction.date.slice(0, 7));
      if (index === undefined) continue;
      const key = transaction.categoryId ?? "unassigned";
      let months = byCategory.get(key);
      if (!months) {
        months = new Array(periodMonths * 2).fill(0);
        byCategory.set(key, months);
      }
      months[index] +=
        transaction.type === "expense" ? transaction.amountCents : -transaction.amountCents;
    }
    const reports = [];
    for (const [categoryId, months] of byCategory) {
      const sparkline = months.slice(periodMonths);
      reports.push({
        categoryId,
        spending: sparkline.reduce((a, b) => a + b, 0),
        previous: months.slice(0, periodMonths).reduce((a, b) => a + b, 0),
        sparkline,
      });
    }
    return reports.sort((a, b) => b.spending - a.spending);
  }

  const readRange = (periodMonths) =>
    db.transactions
      .where("[date+recordedHlc]")
      .between(
        [`${shiftMonth(END_MONTH, -(periodMonths * 2 - 1))}-01`, ""],
        [`${END_MONTH}-31`, "￿"],
        true,
        true
      )
      .toArray();

  async function time(label, task) {
    for (let i = 0; i < WARMUP; i++) await task();
    const samples = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      await task();
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
    return { label, median: at(0.5).toFixed(1), p95: at(0.95).toFixed(1), max: at(1).toFixed(1) };
  }

  const all = await db.transactions.toArray();
  const results = [
    await time("dexie: transactions.toArray (10k)", () => db.transactions.toArray()),
    await time("dexie: index range, 24 months", () => readRange(12)),
    await time("compute: one pass, household", () =>
      summarizeReport(all, "household", END_MONTH, 12)
    ),
    await time("end to end: toArray + one pass", async () =>
      summarizeReport(await db.transactions.toArray(), "household", END_MONTH, 12)
    ),
    await time("end to end: index range + one pass", async () =>
      summarizeReport(await readRange(12), "household", END_MONTH, 12)
    ),
    await time("end to end: Month (index range + one pass)", async () =>
      summarizeReport(await readRange(1), "household", END_MONTH, 1)
    ),
  ];
  db.close();
  return results;
}

const browser = await chromium.launch();
for (const rate of [1, 4, 6]) {
  const page = await browser.newPage();
  // IndexedDB needs a real origin; serve a blank page from a data-free route.
  await page.route("http://bench.local/", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>bench</title>" })
  );
  await page.goto("http://bench.local/");
  await page.addScriptTag({ path: dexieScript });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const results = await page.evaluate(`(${benchInPage.toString()})()`);
  console.log(`\nCPU throttle ${rate}x`);
  for (const result of results) console.log(JSON.stringify(result));
  await page.close();
}
await browser.close();
