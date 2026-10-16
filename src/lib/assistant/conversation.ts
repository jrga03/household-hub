/**
 * The chat as a list of items, held in memory only (ADR 0010). Read tools run as
 * their calls arrive; add_transaction waits on a card until the member decides.
 */

import { formatPHP } from "@/lib/currency";
import type { AssistantClient, ChatMessage } from "./client";
import type { TransactionProposal } from "./proposal";
import type { ToolCall } from "./stream";
import type { ToolOutcome } from "./tools";

/** `content` is the tool's result, sent to the model with the member's next message. */
export type ProposalDecision =
  | { outcome: "recorded"; recorded: TransactionProposal; content: string }
  | { outcome: "dismissed"; content: string };

export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; toolCalls: ToolCall[] }
  | { kind: "tool"; callId: string; content: string }
  | {
      kind: "proposal";
      callId: string;
      proposal: TransactionProposal;
      decision: ProposalDecision | null;
    };

export type ProposalItem = Extract<ChatItem, { kind: "proposal" }>;

export const DISMISSED: ProposalDecision = {
  outcome: "dismissed",
  content: JSON.stringify({ declined: "The member dismissed it. Nothing was recorded." }),
};

/** What the member confirmed, which may differ from the proposal in account, category and date. */
export const recordedDecision = (
  recorded: TransactionProposal,
  names: { account: string; category: string }
): ProposalDecision => ({
  outcome: "recorded",
  recorded,
  content: JSON.stringify({
    recorded: {
      date: recorded.date,
      type: recorded.type,
      amount: formatPHP(recorded.amountCents),
      account: names.account,
      category: names.category,
      description: recorded.description,
    },
  }),
});

const WROTE_INSTEAD: ProposalDecision = {
  outcome: "dismissed",
  content: JSON.stringify({
    declined: "The member wrote again instead of confirming. Nothing was recorded.",
  }),
};

// Enough for a read or two before a proposal; a model calling tools in circles stops here.
const MAX_ROUNDS = 5;

export const isWaiting = (item: ChatItem): item is ProposalItem =>
  item.kind === "proposal" && item.decision === null;

function toMessage(item: ChatItem): ChatMessage | null {
  switch (item.kind) {
    case "user":
      return { role: "user", content: item.text };
    case "assistant":
      return {
        role: "assistant",
        content: item.text,
        ...(item.toolCalls.length > 0 && {
          tool_calls: item.toolCalls.map(({ id, name, arguments: args }) => ({
            id,
            type: "function" as const,
            function: { name, arguments: args },
          })),
        }),
      };
    case "tool":
      return { role: "tool", tool_call_id: item.callId, content: item.content };
    case "proposal":
      return (
        item.decision && {
          role: "tool",
          tool_call_id: item.callId,
          content: item.decision.content,
        }
      );
  }
}

/** What the model is sent: the session context first, then the chat. */
export function toMessages(context: string, items: ChatItem[]): ChatMessage[] {
  return [
    { role: "system", content: context },
    ...items.map(toMessage).filter((message) => message !== null),
  ];
}

/** Writing instead of tapping declines any card still waiting. */
export function addMemberMessage(items: ChatItem[], text: string): ChatItem[] {
  return [
    ...items.map((item) => (isWaiting(item) ? { ...item, decision: WROTE_INSTEAD } : item)),
    { kind: "user", text },
  ];
}

export function decideProposal(
  items: ChatItem[],
  callId: string,
  decision: ProposalDecision
): ChatItem[] {
  return items.map((item) =>
    item.kind === "proposal" && item.callId === callId ? { ...item, decision } : item
  );
}

/** Calls the model until it answers without tools or proposes a transaction. */
export async function continueConversation({
  context,
  items,
  client,
  runTool,
  onProgress,
  onText,
}: {
  context: string;
  items: ChatItem[];
  client: AssistantClient;
  runTool: (name: string, rawArguments: string) => Promise<ToolOutcome>;
  onProgress: (items: ChatItem[]) => void;
  onText: (text: string) => void;
}): Promise<ChatItem[]> {
  let current = items;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await client.send(toMessages(context, current), onText);
    current = [...current, { kind: "assistant", text: reply.content, toolCalls: reply.toolCalls }];
    for (const call of reply.toolCalls) {
      const outcome = await runTool(call.name, call.arguments);
      current = [
        ...current,
        outcome.proposal
          ? { kind: "proposal", callId: call.id, proposal: outcome.proposal, decision: null }
          : { kind: "tool", callId: call.id, content: outcome.content },
      ];
    }
    onProgress(current);
    if (reply.toolCalls.length === 0 || current.some(isWaiting)) return current;
  }
  return current;
}
