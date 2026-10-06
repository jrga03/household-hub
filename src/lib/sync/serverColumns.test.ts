import { describe, it, expect } from "vitest";
import { pickServerColumns } from "./serverColumns";

describe("pickServerColumns", () => {
  it("drops keys that are not columns of the server transactions table", () => {
    const picked = pickServerColumns("transaction", {
      id: "t1",
      amount_cents: 1,
      owner_user_id: null,
      notes: undefined,
    });

    expect(Object.keys(picked).sort()).toEqual(["amount_cents", "id", "notes"]);
  });

  it("returns other entity payloads unchanged", () => {
    expect(pickServerColumns("account", { owner_user_id: "u" })).toEqual({ owner_user_id: "u" });
  });
});
