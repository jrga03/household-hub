import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ChangeHandler = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}) => Promise<void>;

const handlers = new Map<string, ChangeHandler>();

vi.mock("@/lib/supabase", () => ({
  supabase: {
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
  },
}));
vi.mock("@/lib/dexie/deviceManager", () => ({
  getDeviceId: vi.fn().mockResolvedValue("this-device"),
}));
vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));

import { db } from "@/lib/dexie/db";
import { RealtimeSync } from "@/lib/realtime-sync";
import { reportError } from "@/lib/sentry";

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
    vi.mocked(reportError).mockClear();
    await db.transactions.clear();
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
  });
});
