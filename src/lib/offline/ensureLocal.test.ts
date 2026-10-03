import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, type LocalAccount } from "@/lib/dexie/db";
import { supabase } from "@/lib/supabase";
import { ensureLocalRow } from "./ensureLocal";

vi.mock("@/lib/supabase", () => {
  const supabase = { from: vi.fn() };
  return { supabase, untypedSupabase: supabase };
});

function mockServerRow(row: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  vi.mocked(supabase.from).mockReturnValue({ select } as never);
  return { select, eq, maybeSingle };
}

const account: LocalAccount = {
  id: "acc-1",
  household_id: "00000000-0000-0000-0000-000000000001",
  name: "BDO",
  type: "bank",
  initial_balance_cents: 0,
  currency_code: "PHP",
  visibility: "household",
  color: "#3B82F6",
  icon: "wallet",
  sort_order: 0,
  is_active: true,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

describe("ensureLocalRow", () => {
  beforeEach(async () => {
    vi.mocked(supabase.from).mockReset();
    await db.accounts.clear();
  });

  it("returns the local row without touching the network", async () => {
    await db.accounts.put(account);
    expect(await ensureLocalRow("accounts", "acc-1")).toEqual(account);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("fetches a missing row from Supabase and stores it locally", async () => {
    const { eq } = mockServerRow(account);
    expect(await ensureLocalRow("accounts", "acc-1")).toEqual(account);
    expect(supabase.from).toHaveBeenCalledWith("accounts");
    expect(eq).toHaveBeenCalledWith("id", "acc-1");
    expect(await db.accounts.get("acc-1")).toEqual(account);
  });

  it("returns null when the row exists nowhere or the fetch fails", async () => {
    mockServerRow(null);
    expect(await ensureLocalRow("accounts", "missing")).toBeNull();
    mockServerRow(null, { message: "offline" });
    expect(await ensureLocalRow("accounts", "missing")).toBeNull();
    expect(await db.accounts.count()).toBe(0);
  });
});
