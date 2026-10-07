import { describe, expect, it } from "vitest";
import { db } from "./db";
import { readDb } from "./readDb";

describe("readDb", () => {
  it("is the app database, typed read-only", async () => {
    expect(readDb).toBe(db);
    await db.meta.put({ key: "readDbProbe", value: 1 });
    expect((await readDb.meta.get("readDbProbe"))?.value).toBe(1);
    expect(await readDb.meta.where("key").equals("readDbProbe").count()).toBe(1);
  });

  it("does not expose writes (compile-time checks)", () => {
    const neverRuns = false as boolean;
    if (neverRuns) {
      // @ts-expect-error tables have no put
      void readDb.transactions.put;
      // @ts-expect-error tables have no add
      void readDb.accounts.add;
      // @ts-expect-error tables have no update
      void readDb.categories.update;
      // @ts-expect-error tables have no delete
      void readDb.debts.delete;
      // @ts-expect-error tables have no clear
      void readDb.syncQueue.clear;
      // @ts-expect-error tables have no bulkPut
      void readDb.budgets.bulkPut;
      // @ts-expect-error where-clause collections have no modify
      void readDb.transactions.where("status").equals("cleared").modify;
      // @ts-expect-error filtered collections have no delete
      void readDb.transactions.filter(() => true).delete;
      // @ts-expect-error ordered collections have no modify
      void readDb.transactions.orderBy("date").reverse().modify;
      // @ts-expect-error collections have no delete
      void readDb.accounts.toCollection().delete;

      void readDb.syncQueue.where("status").equals("queued").toArray();
      void readDb.syncQueue.where("status").anyOf("queued", "syncing", "failed").toArray();
      void readDb.syncQueue.where("status").anyOf(["queued", "syncing", "failed"]).count();
      void readDb.transactions.orderBy("date").reverse().limit(10).toArray();
      void readDb.accounts.filter((account) => account.is_active).sortBy("name");
      void readDb.transactions.toCollection().filter((row) => row.amount_cents > 0);
      void readDb.events
        .where("entity_id")
        .equals("id")
        .filter(() => true)
        .count();
      void readDb.events
        .where("entity_id")
        .equals("id")
        .filter(() => true)
        .toArray();
      void readDb.accounts.get("id").then((account) => account?.name);
      void readDb.transactions.count();
      void readDb.events.each((event) => event.entity_id);
      void readDb.budgets.toArray();
      // @ts-expect-error rows keep their entity type
      void readDb.accounts.get("id").then((account) => account?.notAField);
    }
    expect(neverRuns).toBe(false);
  });
});
