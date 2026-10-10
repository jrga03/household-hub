import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";
import { cents } from "@/test/cents";
import { createExternalDebt, deleteDebt } from "../crud";
import { validateDebtDeletion } from "../validation";

vi.mock("@/lib/supabase", () => {
  const supabase = {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  };
  return { supabase, untypedSupabase: supabase };
});

const USER = "12345678-1234-5678-1234-567812345678";

async function debt() {
  return createExternalDebt(
    {
      name: `Loan ${crypto.randomUUID()}`,
      original_amount_cents: cents(10000),
      household_id: DEFAULT_HOUSEHOLD_ID,
    },
    USER
  );
}

async function setCreateStatus(debtId: string, status: "syncing" | "completed") {
  await db.syncQueue.where("entity_id").equals(debtId).modify({ status });
}

describe("deleteDebt with a pending create", () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it("cancels a debt that never left the device", async () => {
    const { id } = await debt();

    expect((await validateDebtDeletion(id, "external")).valid).toBe(true);
    await deleteDebt(id, "external", USER);

    expect(await db.debts.get(id)).toBeUndefined();
    expect(await db.syncQueue.where("entity_id").equals(id).count()).toBe(0);
  });

  it("blocks while the create is syncing", async () => {
    const { id } = await debt();
    await setCreateStatus(id, "syncing");

    expect((await validateDebtDeletion(id, "external")).errors).toContain(
      "Cannot delete debt with pending sync operations. Please wait for sync to complete."
    );
    await expect(deleteDebt(id, "external", USER)).rejects.toThrow("pending sync operations");
    expect(await db.debts.get(id)).toBeDefined();
  });

  it("queues a server delete once the create has synced", async () => {
    const { id } = await debt();
    await setCreateStatus(id, "completed");

    await deleteDebt(id, "external", USER);

    expect(await db.debts.get(id)).toBeUndefined();
    const items = await db.syncQueue.where("entity_id").equals(id).toArray();
    expect(items.map((item) => [item.operation.op, item.status])).toContainEqual([
      "delete",
      "queued",
    ]);
  });
});
