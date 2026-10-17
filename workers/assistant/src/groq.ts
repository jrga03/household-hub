import type { ChatMessage, Tool } from "./messages";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_RETRY_AFTER_MS = 60_000;

export type GroqReply =
  | { kind: "stream"; stream: ReadableStream }
  | { kind: "limited"; retryAfterMs: number }
  | { kind: "upstream" };

/** Groq sends `retry-after` in seconds on a 429. */
function retryAfterMs(response: Response) {
  const seconds = Number(response.headers.get("retry-after") ?? NaN);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
}

export async function streamFromGroq({
  apiKey,
  fetch,
  messages,
  tools,
  maxTokens,
}: {
  apiKey: string;
  fetch: typeof globalThis.fetch;
  messages: ChatMessage[];
  tools: Tool[];
  maxTokens: number;
}): Promise<GroqReply> {
  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        ...(tools.length > 0 && { tools }),
        stream: true,
        max_completion_tokens: maxTokens,
      }),
    });
  } catch {
    console.error("Groq could not be reached");
    return { kind: "upstream" };
  }
  if (response.status === 429) return { kind: "limited", retryAfterMs: retryAfterMs(response) };
  if (!response.ok || !response.body) {
    // Only the status: the body can echo the conversation, which the Worker must not keep.
    console.error(`Groq failed: ${response.status}`);
    return { kind: "upstream" };
  }
  return { kind: "stream", stream: response.body };
}
