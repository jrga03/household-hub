import Dexie, { liveQuery } from "dexie";
import type { TransactionRow } from "@/lib/transactions/projection";
import { foldSpending } from "./spending";
import type { SpendingRequest, SpendingResponse } from "./watch-spending";

// Opened without a schema: the page's `db` owns the versions, and this only reads.
const db = new Dexie("household-hub");

const reply = (response: SpendingResponse) => self.postMessage(response);
const fail = (error: unknown) => reply({ ok: false, detail: String(error) });

self.addEventListener(
  "message",
  ({ data: { userId, todayDay } }: MessageEvent<SpendingRequest>) => {
    void db.open().then(
      () =>
        liveQuery(() => db.table<TransactionRow>("transactions").toArray()).subscribe({
          next: (transactions) =>
            reply({ ok: true, grids: foldSpending(transactions, userId, todayDay) }),
          error: fail,
        }),
      fail
    );
  }
);
