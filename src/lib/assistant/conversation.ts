/**
 * The chat as a list of entries, held in memory only (ADR 0010). Read tools run as
 * their calls arrive; add_transaction waits on a card until the member decides.
 */

import type { AssistantClient, ChatMessage } from "./client";
import type { TransactionProposal } from "./proposal";
import type { ToolCall } from "./stream";
import type { ToolOutcome } from "./tools";

export interface ProposalDecision {
  outcome: "recorded" | "dismissed";
  /** The tool's result, sent to the model with the member's next message. */
  content: string;
}

export type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; toolCalls: ToolCall[] }
  | { kind: "tool"; callId: string; content: string }
  | {
      kind: "proposal";
      callId: string;
      proposal: TransactionProposal;
      decision: ProposalDecision | null;
    };

export type ProposalEntry = Extract<Entry, { kind: "proposal" }>;

export const DISMISSED: ProposalDecision = {
  outcome: "dismissed",
  content: JSON.stringify({ declined: "The member dismissed it. Nothing was recorded." }),
};

const WROTE_INSTEAD: ProposalDecision = {
  outcome: "dismissed",
  content: JSON.stringify({
    declined: "The member wrote again instead of confirming. Nothing was recorded.",
  }),
};

// Enough for a read or two before a proposal; a model calling tools in circles stops here.
const MAX_ROUNDS = 5;

export const isWaiting = (entry: Entry): entry is ProposalEntry =>
  entry.kind === "proposal" && entry.decision === null;

function toMessage(entry: Entry): ChatMessage | null {
  switch (entry.kind) {
    case "user":
      return { role: "user", content: entry.text };
    case "assistant":
      return {
        role: "assistant",
        content: entry.text,
        ...(entry.toolCalls.length > 0 && {
          tool_calls: entry.toolCalls.map(({ id, name, arguments: args }) => ({
            id,
            type: "function" as const,
            function: { name, arguments: args },
          })),
        }),
      };
    case "tool":
      return { role: "tool", tool_call_id: entry.callId, content: entry.content };
    case "proposal":
      return (
        entry.decision && {
          role: "tool",
          tool_call_id: entry.callId,
          content: entry.decision.content,
        }
      );
  }
}

/** What the model is sent: the session context first, then the chat. */
export function toMessages(context: string, entries: Entry[]): ChatMessage[] {
  return [
    { role: "system", content: context },
    ...entries.map(toMessage).filter((message) => message !== null),
  ];
}

/** Writing instead of tapping declines any card still waiting. */
export function addMemberMessage(entries: Entry[], text: string): Entry[] {
  return [
    ...entries.map((entry) => (isWaiting(entry) ? { ...entry, decision: WROTE_INSTEAD } : entry)),
    { kind: "user", text },
  ];
}

export function decideProposal(
  entries: Entry[],
  callId: string,
  decision: ProposalDecision
): Entry[] {
  return entries.map((entry) =>
    entry.kind === "proposal" && entry.callId === callId ? { ...entry, decision } : entry
  );
}

/** Calls the model until it answers without tools or proposes a transaction. */
export async function continueConversation({
  context,
  entries,
  client,
  runTool,
  onProgress,
  onText,
}: {
  context: string;
  entries: Entry[];
  client: AssistantClient;
  runTool: (name: string, rawArguments: string) => Promise<ToolOutcome>;
  onProgress: (entries: Entry[]) => void;
  onText: (text: string) => void;
}): Promise<Entry[]> {
  let current = entries;
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
