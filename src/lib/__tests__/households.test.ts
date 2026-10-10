import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirect } from "@tanstack/react-router";

const { maybeSingle, rpc } = vi.hoisted(() => ({ maybeSingle: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ select: () => ({ maybeSingle }) }), rpc },
}));

import { createHousehold, enforceHouseholdGate } from "../households";
import { queryClient } from "../queryClient";

const USER_ID = "user-a";
const householdRow = { id: "h1", name: "Acido home", code: "ABC234", owner_user_id: USER_ID };

function serverReturns(row: typeof householdRow | null) {
  maybeSingle.mockResolvedValue({ data: row, error: null });
}

function serverUnreachable() {
  maybeSingle.mockResolvedValue({ data: null, error: new TypeError("Failed to fetch") });
}

function restartApp() {
  queryClient.clear();
}

async function redirectTarget(pathname: string, userId = USER_ID): Promise<string | null> {
  try {
    await enforceHouseholdGate(pathname, userId);
    return null;
  } catch (error) {
    if (isRedirect(error)) return String(error.options.to);
    throw error;
  }
}

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  maybeSingle.mockReset();
  rpc.mockReset();
});

describe("household gate", () => {
  it("sends a member reaching create-or-join home", async () => {
    serverReturns(householdRow);

    expect(await redirectTarget("/create-or-join")).toBe("/");
  });

  it("sends a person with no household from any route to create-or-join", async () => {
    serverReturns(null);

    expect(await redirectTarget("/settings")).toBe("/create-or-join");
    expect(await redirectTarget("/")).toBe("/create-or-join");
  });

  it("lets the creator in right after creating a household", async () => {
    serverReturns(null);
    expect(await redirectTarget("/")).toBe("/create-or-join");

    rpc.mockResolvedValue({ data: householdRow, error: null });
    await createHousehold(USER_ID, "Acido home");
    serverUnreachable();

    expect(await redirectTarget("/create-or-join")).toBe("/");
  });

  describe("offline", () => {
    it("keeps a member in using the last membership seen online", async () => {
      serverReturns(householdRow);
      await redirectTarget("/");
      restartApp();
      serverUnreachable();

      expect(await redirectTarget("/settings")).toBeNull();
      expect(await redirectTarget("/create-or-join")).toBe("/");
    });

    it("sends a person to create-or-join when no membership was ever seen", async () => {
      serverUnreachable();

      expect(await redirectTarget("/settings")).toBe("/create-or-join");
      expect(await redirectTarget("/create-or-join")).toBeNull();
    });

    it("ignores another person's last membership on a shared device", async () => {
      serverReturns(householdRow);
      await redirectTarget("/", "someone-else");
      restartApp();
      serverUnreachable();

      expect(await redirectTarget("/settings")).toBe("/create-or-join");
    });
  });
});
