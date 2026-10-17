/** Reads the proxy's server-sent events: OpenAI chat chunks carrying `delta.content` and `delta.tool_calls`. */

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface AssistantReply {
  content: string;
  toolCalls: ToolCall[];
}

interface ToolCallDelta {
  index?: unknown;
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

interface ChunkDelta {
  content?: unknown;
  tool_calls?: ToolCallDelta[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readDelta(data: string): ChunkDelta {
  const parsed: unknown = JSON.parse(data);
  if (!isObject(parsed)) throw new Error("The assistant sent a reply this app can't read.");
  // Workers AI ends with a usage summary that has no choices.
  if (!Array.isArray(parsed.choices)) return {};
  const [choice]: unknown[] = parsed.choices;
  return isObject(choice) && isObject(choice.delta) ? choice.delta : {};
}

/** Resolves with the whole reply once the stream ends; `onText` gets the text so far after each piece. */
export async function readReply(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void
): Promise<AssistantReply> {
  let content = "";
  const calls: ToolCall[] = [];

  const readEvent = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice("data:".length).trim();
    if (data === "[DONE]") return;
    const delta = readDelta(data);
    if (typeof delta.content === "string" && delta.content !== "") {
      content += delta.content;
      onText(content);
    }
    for (const piece of delta.tool_calls ?? []) {
      const index = typeof piece.index === "number" ? piece.index : calls.length;
      const call = (calls[index] ??= { id: "", name: "", arguments: "" });
      if (typeof piece.id === "string") call.id = piece.id;
      if (typeof piece.function?.name === "string") call.name += piece.function.name;
      if (typeof piece.function?.arguments === "string") call.arguments += piece.function.arguments;
    }
  };

  const decoder = new TextDecoder();
  let pending = "";
  const reader = body.getReader();
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    pending += decoder.decode(read.value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    lines.forEach(readEvent);
  }
  readEvent(pending + decoder.decode());

  return { content, toolCalls: calls.filter((call) => call.name !== "") };
}
