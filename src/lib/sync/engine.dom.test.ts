import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { countWaiting, listStuck, listUnpushed, type LoggedEvent } from "@/lib/events/log";
import { listAccounts } from "@/lib/accounts/projection";
import { createAccount } from "@/lib/commands/accounts";
import { cents } from "@/test/cents";
import {
  createSyncEngine,
  EventLogRejected,
  type PulledEvent,
  type RemoteEventLog,
} from "./engine";
import { startSyncTriggers } from "./triggers";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

/** The server contract pgTAP checks: duplicates ignored, pulls after N in sequence order. */
class FakeRemote implements RemoteEventLog {
  events: PulledEvent[] = [];
  /** The member's household; RLS shows its Household events and refuses pushes outside it. */
  householdId: string | null = MEMBER.householdId;
  offline = false;
  /** Refuses every push that contains one of these events, as RLS refuses a whole insert. */
  refused = new Set<string>();
  pullGate: Promise<void> | null = null;

  async push(events: LoggedEvent[]) {
    if (this.offline) throw new Error("Failed to fetch");
    // Appending needs membership; a Personal event may name the household it was made in.
    const refused = (event: LoggedEvent) =>
      this.refused.has(event.entityId) ||
      this.householdId === null ||
      (event.visibility === "household" && event.householdId !== this.householdId);
    if (events.some(refused)) {
      throw new EventLogRejected("new row violates row-level security policy", "42501");
    }
    for (const event of events) {
      if (this.events.some((existing) => existing.id === event.id)) continue;
      this.events.push({ ...event, sequence: this.events.length + 1 });
    }
  }

  async pull(afterSequence: number, batchSize: number) {
    await this.pullGate;
    if (this.offline) throw new Error("Failed to fetch");
    return this.events
      .filter((event) => event.sequence > afterSequence)
      .filter((event) => event.visibility === "personal" || event.householdId === this.householdId)
      .slice(0, batchSize);
  }

  async currentHouseholdId() {
    if (this.offline) throw new Error("Failed to fetch");
    return this.householdId;
  }
}

let otherDeviceAccounts = 0;
function accountFromOtherDevice(name: string, householdId = MEMBER.householdId): LoggedEvent {
  otherDeviceAccounts += 1;
  return {
    id: crypto.randomUUID(),
    householdId,
    visibility: "household",
    ownerUserId: null,
    entityType: "account",
    entityId: crypto.randomUUID(),
    eventType: "account.created",
    eventVersion: 1,
    hlc: `00000000000${1000 + otherDeviceAccounts}-000000-device-b`,
    deviceId: "device-b",
    actorUserId: "user-a",
    payload: { name, type: "bank", startingBalanceCents: 100 },
  };
}

let remote: FakeRemote;

beforeEach(async () => {
  await resetLocalDatabase();
  remote = new FakeRemote();
});

describe("sync engine", () => {
  it("pushes local events once, however often it runs", async () => {
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });
    const engine = createSyncEngine(remote);

    await engine.sync();
    await engine.sync();

    expect(remote.events).toHaveLength(1);
    expect(await listUnpushed(10)).toHaveLength(0);
    expect(await listAccounts()).toHaveLength(1);
  });

  it("shows accounts another device created", async () => {
    await remote.push([accountFromOtherDevice("BDO"), accountFromOtherDevice("Maya")]);

    await createSyncEngine(remote).sync();

    expect((await listAccounts()).map((account) => account.name)).toEqual(["BDO", "Maya"]);
  });

  it("pulls in batches until it has caught up", async () => {
    await remote.push(["A", "B", "C", "D", "E"].map((name) => accountFromOtherDevice(name)));

    await createSyncEngine(remote, { batchSize: 2 }).sync();

    expect(await listAccounts()).toHaveLength(5);
  });

  it("picks up events that arrive after an earlier sync", async () => {
    const engine = createSyncEngine(remote);
    await remote.push([accountFromOtherDevice("BDO")]);
    await engine.sync();

    await remote.push([accountFromOtherDevice("Maya")]);
    await engine.sync();

    expect((await listAccounts()).map((account) => account.name)).toEqual(["BDO", "Maya"]);
  });

  it("keeps offline changes queued and pushes them once the server is reachable", async () => {
    const engine = createSyncEngine(remote);
    remote.offline = true;
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });

    await expect(engine.sync()).rejects.toThrow("Failed to fetch");
    expect(await listAccounts()).toHaveLength(1);
    expect(await listUnpushed(10)).toHaveLength(1);
    expect(await listStuck()).toEqual([]);

    remote.offline = false;
    await engine.sync();

    expect(remote.events).toHaveLength(1);
    expect(await listUnpushed(10)).toHaveLength(0);
  });

  it("holds a refused change as stuck and still pushes the rest and pulls", async () => {
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });
    const { id: refusedId } = await createAccount(MEMBER, {
      name: "BPI Savings",
      type: "bank",
      startingBalanceCents: cents(0),
    });
    await createAccount(MEMBER, { name: "Wallet", type: "cash", startingBalanceCents: cents(0) });
    await remote.push([accountFromOtherDevice("BDO")]);
    remote.refused.add(refusedId);
    const onStuck = vi.fn();

    await createSyncEngine(remote, { onStuck }).sync();

    expect(remote.events.map((event) => event.payload.name)).toEqual(["BDO", "Cash", "Wallet"]);
    expect(await countWaiting()).toBe(0);
    expect(await listStuck()).toEqual([
      expect.objectContaining({ description: "Add account: BPI Savings" }),
    ]);
    expect(onStuck).toHaveBeenCalledOnce();
    expect((await listAccounts()).map((account) => account.name)).toEqual([
      "BDO",
      "BPI Savings",
      "Cash",
      "Wallet",
    ]);
  });

  it("does not resend a stuck change on later syncs", async () => {
    const { id } = await createAccount(MEMBER, {
      name: "BPI Savings",
      type: "bank",
      startingBalanceCents: cents(0),
    });
    remote.refused.add(id);
    const engine = createSyncEngine(remote);
    await engine.sync();
    const push = vi.spyOn(remote, "push");

    await engine.sync();

    expect(push).not.toHaveBeenCalled();
  });

  it("runs again when asked during a sync, so a write made mid-sync still goes out", async () => {
    const engine = createSyncEngine(remote);
    let releasePull = () => {};
    remote.pullGate = new Promise((resolve) => (releasePull = resolve));
    const firstSync = engine.sync();
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });
    const secondSync = engine.sync();
    releasePull();

    await Promise.all([firstSync, secondSync]);

    expect(remote.events).toHaveLength(1);
  });
});

describe("membership changes", () => {
  const accountNames = async () => (await listAccounts()).map((account) => account.name);

  it("after removal, the next sync drops Household accounts, keeps Personal ones and reports it", async () => {
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });
    await createAccount(MEMBER, {
      name: "My wallet",
      type: "cash",
      startingBalanceCents: cents(0),
      visibility: "personal",
    });
    const onHouseholdChanged = vi.fn();
    const engine = createSyncEngine(remote, { onHouseholdChanged });
    await engine.sync();

    remote.householdId = null;
    await engine.sync();

    expect(await accountNames()).toEqual(["My wallet"]);
    expect(onHouseholdChanged).toHaveBeenCalledOnce();
  });

  it("holds a Household change pushed after removal as stuck", async () => {
    const engine = createSyncEngine(remote);
    await engine.sync();
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });

    remote.householdId = null;
    await engine.sync();

    expect(await listStuck()).toEqual([
      expect.objectContaining({ description: "Add account: Cash" }),
    ]);
    expect(await countWaiting()).toBe(0);
    expect(remote.events).toEqual([]);
  });

  it("after removal, holds Personal changes until the member joins a household again", async () => {
    const engine = createSyncEngine(remote);
    await engine.sync();
    remote.householdId = null;
    await createAccount(MEMBER, {
      name: "My wallet",
      type: "cash",
      startingBalanceCents: cents(0),
      visibility: "personal",
    });

    await engine.sync();
    expect(await countWaiting()).toBe(1);
    expect(await listStuck()).toEqual([]);

    remote.householdId = "22222222-2222-4222-8222-222222222222";
    await engine.sync();
    expect(await countWaiting()).toBe(0);
    expect(remote.events).toEqual([expect.objectContaining({ householdId: MEMBER.householdId })]);
  });

  it("on moving to another household, pulls its events from the start", async () => {
    const otherHousehold = "22222222-2222-4222-8222-222222222222";
    // Recorded in the other household before this device's last pull, so below its cursor.
    remote.householdId = otherHousehold;
    await remote.push([accountFromOtherDevice("Joint savings", otherHousehold)]);
    remote.householdId = MEMBER.householdId;
    await remote.push([accountFromOtherDevice("Old household cash")]);
    const engine = createSyncEngine(remote);
    await engine.sync();

    remote.householdId = otherHousehold;
    await engine.sync();

    expect(await accountNames()).toEqual(["Joint savings"]);
  });
});

describe("halting before the local store is wiped", () => {
  it("stores nothing from a pull that was in flight", async () => {
    await remote.push([accountFromOtherDevice("BDO")]);
    const engine = createSyncEngine(remote);
    let releasePull = () => {};
    remote.pullGate = new Promise((resolve) => (releasePull = resolve));
    const inFlight = engine.sync();

    engine.halt();
    releasePull();
    await inFlight;

    expect(await listAccounts()).toHaveLength(0);
  });

  it("still pushes pending events, and syncs again once resumed", async () => {
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });
    await remote.push([accountFromOtherDevice("BDO")]);
    const engine = createSyncEngine(remote);

    engine.halt();
    await engine.sync();
    await engine.pushPending();
    expect(remote.events).toHaveLength(2);
    expect(await listAccounts()).toHaveLength(1);

    engine.resume();
    await engine.sync();
    expect(await listAccounts()).toHaveLength(2);
  });
});

describe("sync triggers", () => {
  beforeEach(() => {
    // Only the debounce timer: fake-indexeddb schedules with setImmediate.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("syncs on start, on reconnect, and when the page becomes visible", () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const stop = startSyncTriggers(sync);
    expect(sync).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("online"));
    expect(sync).toHaveBeenCalledTimes(2);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sync).toHaveBeenCalledTimes(3);

    stop();
    window.dispatchEvent(new Event("online"));
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it("syncs once after a burst of local writes", async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const stop = startSyncTriggers(sync, { debounceMs: 500 });
    sync.mockClear();

    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });
    await createAccount(MEMBER, { name: "Bank", type: "bank", startingBalanceCents: cents(0) });
    expect(sync).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(sync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("retries a failed sync with growing delays until one succeeds", async () => {
    const sync = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValue(undefined);
    const stop = startSyncTriggers(sync, { retryBaseMs: 1000 });
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(999);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1999);
    expect(sync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync).toHaveBeenCalledTimes(3);
    stop();
  });

  it("stops retrying once stopped", async () => {
    const sync = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const stop = startSyncTriggers(sync, { retryBaseMs: 1000 });
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));

    stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sync).toHaveBeenCalledTimes(1);
  });
});
