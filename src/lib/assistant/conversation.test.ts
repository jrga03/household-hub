import { describe, expect, it, vi } from "vitest";
import { asCents } from "@/lib/currency";
import type { AssistantClient, ChatMessage } from "./client";
import {
  addMemberMessage,
  continueConversation,
  decideProposal,
  toMessages,
  type ChatItem,
} from "./conversation";
import type { AssistantReply } from "./stream";
import type { ToolOutcome } from "./tools";

const CONTEXT = "Today is 2026-10-16 (Friday).";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const proposal = {
  date: "2026-10-16",
  type: "expense" as const,
  amountCents: asCents(25_000),
  accountId: "acc-gcash",
  categoryId: "cat-food",
  description: "Jollibee",
  notes: "",
};

/** A model that answers each call with the next reply, recording what it was sent. */
function scriptedClient(...replies: AssistantReply[]) {
  const sent: ChatMessage[][] = [];
  const client: AssistantClient = {
    send: vi.fn((messages: ChatMessage[], onText: (text: string) => void) => {
      sent.push(messages);
      const reply = replies.shift();
      if (!reply) throw new Error("No reply scripted");
      if (reply.content) onText(reply.content);
      return Promise.resolve(reply);
    }),
  };
  return { client, sent };
}

const say = (content: string): AssistantReply => ({ content, toolCalls: [] });
const call = (id: string, name: string, args = "{}"): AssistantReply => ({
  content: "",
  toolCalls: [{ id, name, arguments: args }],
});

const readTool = vi.fn((): Promise<ToolOutcome> =>
  Promise.resolve({ content: '{"accounts":[]}', proposal: null })
);

async function ask(
  text: string,
  client: AssistantClient,
  runTool = readTool,
  items: ChatItem[] = []
) {
  return continueConversation({
    context: CONTEXT,
    items: addMemberMessage(items, text),
    client,
    runTool,
    onProgress: () => {},
    onText: () => {},
  });
}

describe("continueConversation", () => {
  it("opens with the session context and ends on a reply without tool calls", async () => {
    const { client, sent } = scriptedClient(say("Hello! How can I help?"));
    const items = await ask("hi", client);
    expect(sent).toEqual([
      [
        { role: "system", content: CONTEXT },
        { role: "user", content: "hi" },
      ],
    ]);
    expect(items.at(-1)).toEqual({
      kind: "assistant",
      text: "Hello! How can I help?",
      toolCalls: [],
    });
  });

  it("runs a read tool and sends its result back under the call's id", async () => {
    const { client, sent } = scriptedClient(
      call("call-1", "get_account_balances"),
      say("GCash has ₱750.00.")
    );
    const items = await ask("how much in gcash?", client);
    expect(readTool).toHaveBeenCalledWith("get_account_balances", "{}");
    expect(sent[1]?.slice(2)).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "get_account_balances", arguments: "{}" },
          },
        ],
      },
      { role: "tool", tool_call_id: "call-1", content: '{"accounts":[]}' },
    ]);
    expect(items.at(-1)).toMatchObject({ kind: "assistant", text: "GCash has ₱750.00." });
  });

  it("stops at a proposal and waits for the member", async () => {
    const { client, sent } = scriptedClient(call("call-1", "add_transaction"));
    const runTool = vi.fn(() =>
      Promise.resolve({ content: '{"status":"Shown to the member"}', proposal })
    );
    const items = await ask("jollibee 250 gcash", client, runTool);
    expect(sent).toHaveLength(1);
    expect(items.at(-1)).toEqual({
      kind: "proposal",
      callId: "call-1",
      transactionId: expect.stringMatching(UUID) as unknown,
      proposal,
      decision: null,
    });
  });

  it("gives up after a few rounds of tool calls without a reply", async () => {
    const replies = Array.from({ length: 10 }, (_, round) =>
      call(`call-${round}`, "list_categories")
    );
    const { client, sent } = scriptedClient(...replies);
    await ask("loop forever", client);
    expect(sent.length).toBeLessThan(10);
  });
});

describe("the member's decision on a proposal", () => {
  const waiting: ChatItem[] = [
    { kind: "user", text: "jollibee 250 gcash" },
    {
      kind: "assistant",
      text: "",
      toolCalls: [{ id: "call-1", name: "add_transaction", arguments: "{}" }],
    },
    { kind: "proposal", callId: "call-1", transactionId: "txn-1", proposal, decision: null },
  ];

  it("goes back to the model as the tool's result with the next message", () => {
    const decided = decideProposal(waiting, "call-1", {
      outcome: "recorded",
      recorded: proposal,
      content: '{"recorded":{}}',
    });
    expect(toMessages(CONTEXT, addMemberMessage(decided, "thanks")).slice(-2)).toEqual([
      { role: "tool", tool_call_id: "call-1", content: '{"recorded":{}}' },
      { role: "user", content: "thanks" },
    ]);
  });

  it("is a decline when the member writes instead of tapping", () => {
    const items = addMemberMessage(waiting, "make it 300");
    expect(items[2]).toMatchObject({ kind: "proposal", decision: { outcome: "dismissed" } });
    expect(toMessages(CONTEXT, items).at(-2)).toMatchObject({
      role: "tool",
      tool_call_id: "call-1",
      content: expect.stringContaining("Nothing was recorded") as unknown,
    });
  });
});

describe("the history the model is sent", () => {
  /** A member message, then a read call, its result and a reply: four items a turn. */
  const turn = (n: number): ChatItem[] => [
    { kind: "user", text: `question ${n}` },
    {
      kind: "assistant",
      text: "",
      toolCalls: [{ id: `call-${n}`, name: "get_account_balances", arguments: "{}" }],
    },
    { kind: "tool", callId: `call-${n}`, content: "{}" },
    { kind: "assistant", text: `answer ${n}`, toolCalls: [] },
  ];

  it("sends the whole chat while it is short", () => {
    const items = [...turn(1), ...turn(2)];
    expect(toMessages(CONTEXT, items)).toHaveLength(9);
  });

  it("sends only the tail of a long chat, starting at a member message", () => {
    // 7 turns are 28 items; with the last 3 items of turn 2 cut, turn 3 starts the history.
    const items = Array.from({ length: 7 }, (_, n) => turn(n + 1)).flat();
    const messages = toMessages(CONTEXT, items);

    expect(messages[0]).toEqual({ role: "system", content: CONTEXT });
    expect(messages[1]).toEqual({ role: "user", content: "question 3" });
    expect(messages).toHaveLength(1 + 20);
    expect(messages.at(-1)).toEqual({ role: "assistant", content: "answer 7" });
  });

  it("keeps the latest member message and what follows even past the cap", () => {
    const calls: ChatItem[] = Array.from({ length: 12 }, (_, n): ChatItem[] => [
      {
        kind: "assistant",
        text: "",
        toolCalls: [{ id: `read-${n}`, name: "list_categories", arguments: "{}" }],
      },
      { kind: "tool", callId: `read-${n}`, content: "{}" },
    ]).flat();
    const items: ChatItem[] = [...turn(1), { kind: "user", text: "latest" }, ...calls];
    const messages = toMessages(CONTEXT, items);

    expect(messages[1]).toEqual({ role: "user", content: "latest" });
    expect(messages).toHaveLength(1 + 1 + 24);
  });
});
