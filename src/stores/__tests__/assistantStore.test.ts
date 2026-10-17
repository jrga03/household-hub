/**
 * The assistant chat is saved on the device: a reload restores it, and a chat
 * idle for 12 hours starts fresh unless a card waits (ADR 0010).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantClient, ChatMessage } from "@/lib/assistant/client";
import type { AssistantReply } from "@/lib/assistant/stream";
import { asCents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";

const replies: AssistantReply[] = [];
const sent: ChatMessage[][] = [];

vi.mock("@/lib/assistant/config", () => ({ ASSISTANT_URL: "https://assistant.test" }));
vi.mock("@/lib/assistant/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/client")>()),
  createProxyClient: (): AssistantClient => ({
    send: (messages) => {
      sent.push(messages);
      const reply = replies.shift();
      return reply ? Promise.resolve(reply) : Promise.reject(new Error("No reply scripted"));
    },
  }),
}));
vi.mock("@/lib/assistant/context", () => ({
  buildSessionContext: () => Promise.resolve("context"),
}));
vi.mock("@/lib/assistant/tools", () => ({
  runAssistantTool: (name: string) =>
    Promise.resolve(
      name !== "add_transaction"
        ? { content: "[]" }
        : {
            content: '{"status":"Shown to the member"}',
            proposal: {
              date: "2026-10-17",
              type: "expense",
              amountCents: asCents(25_000),
              accountId: "acc-gcash",
              categoryId: "cat-food",
              description: "Jollibee",
              notes: "",
            },
          }
    ),
}));

const USER = "user-a";
const HOUR = 60 * 60 * 1000;
const START = new Date("2026-10-17T01:00:00Z");

const say = (content: string): AssistantReply => ({ content, toolCalls: [] });
const lookUp = (): AssistantReply => ({
  content: "",
  toolCalls: [{ id: "call-2", name: "list_accounts", arguments: "{}" }],
});
const propose = (): AssistantReply => ({
  content: "",
  toolCalls: [{ id: "call-1", name: "add_transaction", arguments: "{}" }],
});

/** A fresh copy of the store, as after a reload: nothing held in memory. */
async function loadStore() {
  vi.resetModules();
  const { useAssistantStore } = await import("@/stores/assistantStore");
  return useAssistantStore;
}

const later = (hours: number) => vi.setSystemTime(START.getTime() + hours * HOUR);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  replies.length = 0;
  sent.length = 0;
  await resetLocalDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a saved assistant chat", () => {
  it("comes back after a reload, with its waiting card", async () => {
    const before = await loadStore();
    await before.getState().open(USER);
    replies.push(propose());
    await before.getState().send("jollibee 250 gcash", USER);

    const after = await loadStore();
    await after.getState().open(USER);

    const items = after.getState().items;
    expect(items[0]).toEqual({ kind: "user", text: "jollibee 250 gcash" });
    expect(items.at(-1)).toMatchObject({ kind: "proposal", callId: "call-1", decision: null });
  });

  it("keeps a card's transaction id across a reload, so Confirm records it once", async () => {
    const before = await loadStore();
    await before.getState().open(USER);
    replies.push(propose());
    await before.getState().send("jollibee 250 gcash", USER);
    const proposed = before.getState().items.at(-1);

    const after = await loadStore();
    await after.getState().open(USER);

    expect(proposed).toMatchObject({ transactionId: expect.any(String) as unknown });
    expect(after.getState().items.at(-1)).toEqual(proposed);
  });

  it("keeps a member's decision on a card", async () => {
    const before = await loadStore();
    await before.getState().open(USER);
    replies.push(propose());
    await before.getState().send("jollibee 250 gcash", USER);
    await before.getState().decide("call-1", { outcome: "dismissed", content: "{}" });

    const after = await loadStore();
    await after.getState().open(USER);

    expect(after.getState().items.at(-1)).toMatchObject({ decision: { outcome: "dismissed" } });
  });

  it("starts fresh when opened 12 hours after it last changed", async () => {
    const before = await loadStore();
    await before.getState().open(USER);
    replies.push(say("Hello!"));
    await before.getState().send("hi", USER);

    later(11);
    const soon = await loadStore();
    await soon.getState().open(USER);
    expect(soon.getState().items).toHaveLength(2);

    later(12);
    const idle = await loadStore();
    await idle.getState().open(USER);
    expect(idle.getState().items).toEqual([]);
  });

  it("starts fresh before a send after 12 hours idle, without a reload", async () => {
    const store = await loadStore();
    await store.getState().open(USER);
    replies.push(say("Hello!"), say("Sure."));
    await store.getState().send("hi", USER);

    later(13);
    await store.getState().send("what about now?", USER);

    expect(sent.at(-1)).toEqual([
      { role: "system", content: "context" },
      { role: "user", content: "what about now?" },
    ]);
    expect(store.getState().items).toHaveLength(2);
  });

  it("keeps an idle chat while a card waits", async () => {
    const before = await loadStore();
    await before.getState().open(USER);
    replies.push(propose());
    await before.getState().send("jollibee 250 gcash", USER);

    later(30);
    const after = await loadStore();
    await after.getState().open(USER);

    expect(after.getState().items.at(-1)).toMatchObject({ kind: "proposal", decision: null });
  });

  it("is kept per member", async () => {
    const store = await loadStore();
    await store.getState().open(USER);
    replies.push(say("Hello!"));
    await store.getState().send("hi", USER);

    const other = await loadStore();
    await other.getState().open("user-b");

    expect(other.getState().items).toEqual([]);
  });

  it("is cleared by New chat, also after a reload", async () => {
    const store = await loadStore();
    await store.getState().open(USER);
    replies.push(say("Hello!"));
    await store.getState().send("hi", USER);

    await store.getState().startNewChat(USER);
    expect(store.getState().items).toEqual([]);

    const after = await loadStore();
    await after.getState().open(USER);
    expect(after.getState().items).toEqual([]);
  });

  it("does not bring back a failed send after a reload", async () => {
    const before = await loadStore();
    await before.getState().open(USER);
    replies.push(propose());
    await before.getState().send("jollibee 250 gcash", USER);
    const settled = before.getState().items;

    replies.push(lookUp());
    const sentOk = await before.getState().send("and my balances?", USER);
    expect(sentOk).toBe(false);

    const after = await loadStore();
    await after.getState().open(USER);
    expect(after.getState().items).toEqual(settled);
    expect(after.getState().items.at(-1)).toMatchObject({ kind: "proposal", decision: null });
  });

  it("forgets the saved row when the first send of a chat fails", async () => {
    const before = await loadStore();
    await before.getState().open(USER);
    replies.push(lookUp());
    expect(await before.getState().send("my balances?", USER)).toBe(false);

    const after = await loadStore();
    await after.getState().open(USER);
    expect(after.getState().items).toEqual([]);
  });
});
