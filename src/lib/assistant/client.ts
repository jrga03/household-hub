/** Talks to the assistant proxy Worker (ADR 0010): one POST per model call, the reply streamed back. */

import { ASSISTANT_TOOLS } from "./definitions";
import { readReply, type AssistantReply } from "./stream";

interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** The OpenAI chat shape the proxy accepts. */
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: WireToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** A message the member can read, such as "busy" or "sign in again". */
export class AssistantError extends Error {}

/** The household's free daily allocation is spent until `resetsAt`. */
export class LimitReachedError extends AssistantError {
  constructor(readonly resetsAt: Date) {
    super("The assistant has reached today's limit.");
  }
}

export interface AssistantClient {
  send(messages: ChatMessage[], onText: (text: string) => void): Promise<AssistantReply>;
}

const SIGN_IN_AGAIN = "Sign in again to use the assistant.";
const UNREACHABLE = "Couldn't reach the assistant. Try again.";

async function limitResetTime(response: Response): Promise<Date | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("resetsAt" in body)) return null;
    const resetsAt = new Date(String(body.resetsAt));
    return Number.isNaN(resetsAt.getTime()) ? null : resetsAt;
  } catch {
    return null;
  }
}

async function failureOf(response: Response): Promise<AssistantError> {
  if (response.status === 401) return new AssistantError(SIGN_IN_AGAIN);
  if (response.status === 503) {
    return new AssistantError("The assistant is busy. Try again in a moment.");
  }
  if (response.status === 429) {
    const resetsAt = await limitResetTime(response);
    if (resetsAt) return new LimitReachedError(resetsAt);
  }
  return new AssistantError(UNREACHABLE);
}

export function createProxyClient({
  url,
  getToken,
  fetchImpl = (input, init) => fetch(input, init),
}: {
  url: string;
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}): AssistantClient {
  return {
    async send(messages, onText) {
      const token = await getToken();
      if (!token) throw new AssistantError(SIGN_IN_AGAIN);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ messages, tools: ASSISTANT_TOOLS }),
        });
      } catch {
        throw new AssistantError(UNREACHABLE);
      }
      if (!response.ok || !response.body) throw await failureOf(response);
      try {
        return await readReply(response.body, onText);
      } catch {
        throw new AssistantError(UNREACHABLE);
      }
    },
  };
}
