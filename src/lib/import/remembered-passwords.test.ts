import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { switchHousehold } from "@/lib/events/log";
import {
  forgetStatementPassword,
  readRememberedPassword,
  rememberStatementPassword,
} from "./remembered-passwords";

const CARD = "card-1";
const OTHER_CARD = "card-2";

beforeEach(async () => {
  await resetLocalDatabase();
  await switchHousehold("household-a");
});

describe("remembered statement passwords", () => {
  it("are kept per card until forgotten", async () => {
    await rememberStatementPassword(CARD, "secret");

    expect(await readRememberedPassword(CARD)).toBe("secret");
    expect(await readRememberedPassword(OTHER_CARD)).toBeUndefined();

    await forgetStatementPassword(CARD);

    expect(await readRememberedPassword(CARD)).toBeUndefined();
  });

  it("are wiped when the device switches household", async () => {
    await rememberStatementPassword(CARD, "secret");

    await switchHousehold("household-b");

    expect(await readRememberedPassword(CARD)).toBeUndefined();
  });

  it("survive a household check that finds no change", async () => {
    await rememberStatementPassword(CARD, "secret");

    await switchHousehold("household-a");

    expect(await readRememberedPassword(CARD)).toBe("secret");
  });

  it("are wiped on sign-out", async () => {
    await rememberStatementPassword(CARD, "secret");

    await resetLocalDatabase();

    expect(await readRememberedPassword(CARD)).toBeUndefined();
  });
});
