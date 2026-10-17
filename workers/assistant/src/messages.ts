// The AI binding validates input against its own schema and rejects unknown fields (AiError 5006),
// so every message and tool is rebuilt from the fields that schema accepts.

import { isObject } from "./guards";

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatRequest = { messages: ChatMessage[]; tools: Tool[] };

/** What a provider call ends in, before it becomes an HTTP response. */
export type ProviderReply =
  | { kind: "stream"; stream: ReadableStream }
  | { kind: "limited"; retryAfterMs: number }
  | { kind: "upstream" };

export interface Tool {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

function rebuildToolCall(call: unknown): ToolCall | undefined {
  if (!isObject(call) || typeof call.id !== "string" || !isObject(call.function)) return undefined;
  const { name, arguments: args } = call.function;
  if (typeof name !== "string" || typeof args !== "string") return undefined;
  return { id: call.id, type: "function", function: { name, arguments: args } };
}

function rebuildMessage(message: unknown): ChatMessage | undefined {
  if (!isObject(message)) return undefined;
  const { role, content } = message;

  if (role === "system" || role === "user") {
    return typeof content === "string" ? { role, content } : undefined;
  }

  if (role === "tool") {
    if (typeof message.tool_call_id !== "string" || typeof content !== "string") return undefined;
    return { role, tool_call_id: message.tool_call_id, content };
  }

  if (role === "assistant") {
    if (content !== null && content !== undefined && typeof content !== "string") return undefined;
    const rebuilt = { role, content: content ?? "" } as const;
    const calls = message.tool_calls;
    if (calls === undefined || (Array.isArray(calls) && calls.length === 0)) return rebuilt;
    if (!Array.isArray(calls)) return undefined;
    const toolCalls = calls.map(rebuildToolCall);
    if (toolCalls.some((call) => call === undefined)) return undefined;
    return { ...rebuilt, tool_calls: toolCalls.filter((call) => call !== undefined) };
  }

  return undefined;
}

/** Returns undefined when any message is not one the binding can take. */
export function rebuildMessages(input: unknown): ChatMessage[] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const messages = input.map(rebuildMessage);
  if (messages.some((message) => message === undefined)) return undefined;
  return messages.filter((message) => message !== undefined);
}

function rebuildTool(tool: unknown): Tool | undefined {
  if (!isObject(tool) || tool.type !== "function" || !isObject(tool.function)) return undefined;
  const { name, description, parameters } = tool.function;
  if (typeof name !== "string") return undefined;
  if (description !== undefined && typeof description !== "string") return undefined;
  if (parameters !== undefined && !isObject(parameters)) return undefined;
  return {
    type: "function",
    function: {
      name,
      ...(description !== undefined && { description }),
      ...(parameters !== undefined && { parameters }),
    },
  };
}

/** The client defines the tools; a missing list means none. Returns undefined when any tool is malformed. */
export function rebuildTools(input: unknown): Tool[] | undefined {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return undefined;
  const tools = input.map(rebuildTool);
  if (tools.some((tool) => tool === undefined)) return undefined;
  return tools.filter((tool) => tool !== undefined);
}
