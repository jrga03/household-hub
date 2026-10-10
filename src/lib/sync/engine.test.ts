import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed, type LoggedEvent } from "@/lib/events/log";
import { listAccounts } from "@/lib/accounts/projection";
import { createAccount } from "@/lib/commands/accounts";
import { cents } from "@/test/cents";
import { createSyncEngine, type PulledEvent, type RemoteEventLog } from "./engine";
import { startSyncTriggers } from "./triggers";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

/** The server contract pgTAP checks: duplicates ignored, pulls after N in sequence order. */
class FakeRemote implements RemoteEventLog {
  events: PulledEvent[] = [];
  offline = false;
  refusePush = false;
  pullGate: Promise<void> | null = null;

  async push(events: LoggedEvent[]) {
    if (this.offline) throw new Error("Failed to fetch");
    if (this.refusePush) throw new Error("new row violates row-level security policy");
    for (const event of events) {
      if (this.events.some((existing) => existing.id === event.id)) continue;
      this.events.push({ ...event, sequence: this.events.length + 1 });
    }
  }

  async pull(afterSequence: number, batchSize: number) {
    await this.pullGate;
    if (this.offline) throw new Error("Failed to fetch");
    return this.events.filter((event) => event.sequence > afterSequence).slice(0, batchSize);
  }
}

let otherDeviceAccounts = 0;
function accountFromOtherDevice(name: string): LoggedEvent {
  otherDeviceAccounts += 1;
  return {
    id: crypto.randomUUID(),
    householdId: MEMBER.householdId,
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
    await remote.push(["A", "B", "C", "D", "E"].map(accountFromOtherDevice));

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

    remote.offline = false;
    await engine.sync();

    expect(remote.events).toHaveLength(1);
    expect(await listUnpushed(10)).toHaveLength(0);
  });

  it("still pulls when the server refuses a push", async () => {
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });
    await remote.push([accountFromOtherDevice("BDO")]);
    remote.refusePush = true;

    await expect(createSyncEngine(remote).sync()).rejects.toThrow("row-level security");

    expect((await listAccounts()).map((account) => account.name)).toEqual(["BDO", "Cash"]);
    expect(await listUnpushed(10)).toHaveLength(1);
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
});
