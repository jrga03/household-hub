import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ChangeHandler = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}) => Promise<void>;

const handlers = new Map<string, ChangeHandler>();
const catchUpRows = new Map<string, Record<string, unknown>[]>();

const gteColumns = new Map<string, string>();

vi.mock("@/lib/supabase", () => {
  const client = {
    channel: (name: string) => {
      const channel = {
        on: (_event: string, _filter: unknown, handler: ChangeHandler) => {
          handlers.set(name.replace("-changes", ""), handler);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
    from: (table: string) => {
      const query = {
        select: () => query,
        gte: (column: string) => {
          gteColumns.set(table, column);
          return query;
        },
        order: () => Promise.resolve({ data: catchUpRows.get(table) ?? [], error: null }),
      };
      return query;
    },
  };
  return { supabase: client, untypedSupabase: client };
});
vi.mock("@/lib/dexie/deviceManager", () => ({
  getDeviceId: vi.fn().mockResolvedValue("this-device"),
}));
vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));

import { db } from "@/lib/dexie/db";
import { RealtimeSync } from "@/lib/realtime-sync";
import { reportError } from "@/lib/sentry";

const serverDebt = {
  id: "d-remote",
  household_id: "h1",
  name: "Loan",
  original_amount_cents: 10000,
  status: "active",
  closed_at: null,
  created_at: "2026-10-04T01:00:00Z",
  updated_at: "2026-10-04T01:00:00Z",
};
const serverPayment = {
  id: "p-remote",
  household_id: "h1",
  debt_id: "d-remote",
  internal_debt_id: null,
  transaction_id: "t-remote",
  amount_cents: 2500,
  payment_date: "2026-10-04",
  device_id: "other-device",
  is_reversal: false,
  reverses_payment_id: null,
  adjustment_reason: null,
  is_overpayment: false,
  overpayment_amount: null,
  created_at: "2026-10-04T03:00:00Z",
};

const serverTransaction = {
  id: "t-remote",
  household_id: "h1",
  date: "2026-10-04",
  description: "Remote",
  amount_cents: 5000,
  type: "expense",
  currency_code: "PHP",
  account_id: null,
  category_id: null,
  transfer_group_id: null,
  debt_id: null,
  internal_debt_id: null,
  status: "cleared",
  visibility: "household",
  created_by_user_id: null,
  tagged_user_ids: null,
  notes: null,
  import_key: null,
  device_id: "other-device",
  created_at: "2026-10-04T01:00:00Z",
  updated_at: "2026-10-04T01:00:00Z",
};

describe("RealtimeSync row validation", () => {
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    handlers.clear();
    catchUpRows.clear();
    gteColumns.clear();
    vi.mocked(reportError).mockClear();
    await db.transactions.clear();
    await db.debts.clear();
    await db.internalDebts.clear();
    await db.debtPayments.clear();
    await db.meta.clear();
    await new RealtimeSync().initialize();
  });

  it("writes a valid INSERT with nulls normalised", async () => {
    await handlers.get("transactions")?.({ eventType: "INSERT", new: serverTransaction, old: {} });
    const stored = await db.transactions.get("t-remote");
    expect(stored).toMatchObject({ amount_cents: 5000, tagged_user_ids: [] });
    expect(stored?.account_id).toBeUndefined();
  });

  it("skips and reports an INSERT that fails its schema", async () => {
    await handlers.get("transactions")?.({
      eventType: "INSERT",
      new: { ...serverTransaction, amount_cents: 12.5 },
      old: {},
    });
    expect(await db.transactions.get("t-remote")).toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ subsystem: "realtime-sync", operation: "invalid-row:transactions" })
    );
  });

  it("skips an UPDATE that fails its schema and keeps the local row", async () => {
    await handlers.get("transactions")?.({ eventType: "INSERT", new: serverTransaction, old: {} });
    await handlers.get("transactions")?.({
      eventType: "UPDATE",
      new: { ...serverTransaction, amount_cents: "9999", updated_at: "2026-10-05T00:00:00Z" },
      old: {},
    });
    expect((await db.transactions.get("t-remote"))?.amount_cents).toBe(5000);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ subsystem: "realtime-sync", operation: "invalid-row:transactions" })
    );
  });

  it("catch-up skips an invalid row, reports it, and still advances the high-water mark", async () => {
    catchUpRows.set("transactions", [
      { ...serverTransaction, id: "t-valid", updated_at: "2026-10-04T01:00:00Z" },
      {
        ...serverTransaction,
        id: "t-invalid",
        amount_cents: 12.5,
        updated_at: "2026-10-04T02:00:00Z",
      },
    ]);

    await new RealtimeSync().handleReconnection();

    expect(await db.transactions.get("t-valid")).toBeDefined();
    expect(await db.transactions.get("t-invalid")).toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ subsystem: "realtime-sync", operation: "invalid-row:transactions" })
    );
    expect((await db.meta.get("syncHighWaterMark"))?.value).toBe("2026-10-04T02:00:00Z");
  });

  describe("debt tables", () => {
    it("subscribes to all six tables", async () => {
      expect([...handlers.keys()].sort()).toEqual([
        "accounts",
        "categories",
        "debt_payments",
        "debts",
        "internal_debts",
        "transactions",
      ]);
    });

    it("inserts a debt from realtime", async () => {
      await handlers.get("debts")?.({ eventType: "INSERT", new: serverDebt, old: {} });
      expect(await db.debts.get("d-remote")).toMatchObject({ original_amount_cents: 10000 });
    });

    it("treats payments as append-only", async () => {
      await handlers.get("debt_payments")?.({ eventType: "INSERT", new: serverPayment, old: {} });
      await handlers.get("debt_payments")?.({
        eventType: "UPDATE",
        new: { ...serverPayment, amount_cents: 9999 },
        old: {},
      });
      await handlers.get("debt_payments")?.({ eventType: "DELETE", new: {}, old: serverPayment });
      expect(await db.debtPayments.get("p-remote")).toMatchObject({ amount_cents: 2500 });
    });

    it("catches up debts on updated_at and payments on created_at", async () => {
      catchUpRows.set("debts", [serverDebt]);
      catchUpRows.set("debt_payments", [serverPayment]);

      await new RealtimeSync().handleReconnection();

      expect(gteColumns.get("debts")).toBe("updated_at");
      expect(gteColumns.get("debt_payments")).toBe("created_at");
      expect(await db.debts.get("d-remote")).toBeDefined();
      expect(await db.debtPayments.get("p-remote")).toBeDefined();
      expect((await db.meta.get("syncHighWaterMark"))?.value).toBe("2026-10-04T03:00:00Z");
    });

    it("skips and reports an invalid payment row", async () => {
      catchUpRows.set("debt_payments", [{ ...serverPayment, amount_cents: 1.5 }]);
      await new RealtimeSync().handleReconnection();
      expect(await db.debtPayments.get("p-remote")).toBeUndefined();
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ operation: "invalid-row:debt_payments" })
      );
    });
  });
});
