import { streamFromGroq } from "./groq";
import { isObject } from "./guards";
import { rebuildMessages, rebuildTools, type ChatRequest, type ProviderReply } from "./messages";

export const MODEL = "@cf/openai/gpt-oss-120b";
const MAX_TOKENS = 2048;
const CAPACITY_RETRY_DELAY_MS = 1000;
const OUT_OF_CAPACITY = "3040";
const DAILY_NEURONS_USED_UP = "3036";

export interface AiBinding {
  run(model: string, input: ChatRequest & { stream: true; max_tokens: number }): Promise<unknown>;
}

export interface HandlerEnv {
  AI: AiBinding;
  /** Comma-separated origins the app is served from. */
  ALLOWED_ORIGINS: string;
  /** Unset, there is no fallback once the Workers AI daily allocation is spent. */
  GROQ_API_KEY?: string;
}

export interface HandlerDeps {
  authorize: (token: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  nowMs: () => number;
  fetch: typeof fetch;
  /** Outlives a request: after a 3036, Workers AI is skipped until its 00:00 UTC reset. */
  workersAi: { spentUntilMs: number };
}

type ModelReply = ProviderReply | { kind: "spent" } | { kind: "busy" };

function corsHeaders(origin: string | null): HeadersInit {
  return origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
}

function jsonResponse(status: number, body: unknown, origin: string | null) {
  return Response.json(body, { status, headers: corsHeaders(origin) });
}

function nextUtcMidnightMs(nowMs: number) {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/** The binding throws an AiError whose message starts with the code: "3040: Capacity temporarily exceeded…". */
function aiErrorCode(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  return /^(\d{4}):/.exec(message)?.[1];
}

async function readBody(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isObject(body)) return undefined;
    const messages = rebuildMessages(body.messages);
    const tools = rebuildTools(body.tools);
    return messages && tools ? { messages, tools } : undefined;
  } catch {
    return undefined;
  }
}

export async function handleRequest(
  request: Request,
  env: HandlerEnv,
  deps: HandlerDeps
): Promise<Response> {
  const requestOrigin = request.headers.get("origin");
  const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
  if (requestOrigin !== null && !allowedOrigins.includes(requestOrigin)) {
    return new Response("origin not allowed", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(requestOrigin),
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "86400",
      },
    });
  }
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: { allow: "POST, OPTIONS" } });
  }

  const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token || !(await deps.authorize(token))) {
    return jsonResponse(401, { error: "unauthorized" }, requestOrigin);
  }

  const body = await readBody(request);
  if (!body) return jsonResponse(400, { error: "invalid_request" }, requestOrigin);

  const nowMs = deps.nowMs();
  const workersAiResetMs = nextUtcMidnightMs(nowMs);
  let reply: ModelReply = { kind: "spent" };
  if (nowMs >= deps.workersAi.spentUntilMs) {
    reply = await streamFromWorkersAi(env.AI, body, deps.sleep);
    if (reply.kind === "spent") deps.workersAi.spentUntilMs = workersAiResetMs;
  }
  if (reply.kind === "spent" && env.GROQ_API_KEY) {
    reply = await streamFromGroq({
      apiKey: env.GROQ_API_KEY,
      fetch: deps.fetch,
      ...body,
      maxTokens: MAX_TOKENS,
    });
  }

  switch (reply.kind) {
    case "stream":
      return new Response(reply.stream, {
        headers: {
          ...corsHeaders(requestOrigin),
          "content-type": "text/event-stream",
          "cache-control": "no-store",
        },
      });
    case "spent":
      return jsonResponse(
        429,
        { error: "daily_limit", resetsAt: new Date(workersAiResetMs).toISOString() },
        requestOrigin
      );
    case "limited": {
      // Whichever provider frees up first can take the next message.
      const resetsAtMs = Math.min(nowMs + reply.retryAfterMs, workersAiResetMs);
      return jsonResponse(
        429,
        { error: "daily_limit", resetsAt: new Date(resetsAtMs).toISOString() },
        requestOrigin
      );
    }
    case "busy":
      return jsonResponse(503, { error: "busy" }, requestOrigin);
    case "upstream":
      return jsonResponse(502, { error: "upstream" }, requestOrigin);
  }
}

async function streamFromWorkersAi(
  ai: AiBinding,
  body: ChatRequest,
  sleep: HandlerDeps["sleep"]
): Promise<ModelReply> {
  const input = { ...body, stream: true as const, max_tokens: MAX_TOKENS };
  let stream: unknown;
  try {
    stream = await ai.run(MODEL, input).catch(async (error: unknown) => {
      if (aiErrorCode(error) !== OUT_OF_CAPACITY) throw error;
      await sleep(CAPACITY_RETRY_DELAY_MS);
      return ai.run(MODEL, input);
    });
  } catch (error) {
    const code = aiErrorCode(error);
    if (code === DAILY_NEURONS_USED_UP) return { kind: "spent" };
    if (code === OUT_OF_CAPACITY) return { kind: "busy" };
    // Only the code: the message can echo the conversation, which the Worker must not keep.
    console.error(`Workers AI failed: ${code ?? "unknown error"}`);
    return { kind: "upstream" };
  }

  if (!(stream instanceof ReadableStream)) {
    console.error("Workers AI did not return a stream");
    return { kind: "upstream" };
  }
  return { kind: "stream", stream };
}
