import { describe, expect, it, vi } from "vitest";
import { handleRequest, MODEL, type AiBinding } from "./handler";

const APP_ORIGIN = "https://app.example.com";
const ALLOWED_ORIGINS = `${APP_ORIGIN},http://localhost:3000`;
const VALID_TOKEN = "valid-token";

const sseStream = () =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\ndata: [DONE]\n\n'));
      controller.close();
    },
  });

// Shaped like the binding's own errors (seen under wrangler dev): name AiError, code first in the message.
const aiError = (message: string) => Object.assign(new Error(message), { name: "AiError" });

const DAILY_NEURONS_USED_UP =
  "3036: You have used up your daily free allocation of 10,000 neurons.";

const groqReply = () =>
  new Response(sseStream(), { headers: { "content-type": "text/event-stream" } });

function setup(
  run: AiBinding["run"] = vi.fn<AiBinding["run"]>().mockImplementation(async () => sseStream()),
  {
    groqApiKey = undefined as string | undefined,
    groq = vi.fn<typeof fetch>().mockImplementation(async () => groqReply()),
  } = {}
) {
  const ai = { run: vi.fn(run) };
  const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
  const clock = { nowMs: Date.UTC(2026, 9, 15, 13, 30) };
  const deps = {
    authorize: async (token: string) => token === VALID_TOKEN,
    sleep,
    nowMs: () => clock.nowMs,
    fetch: groq,
    workersAi: { spentUntilMs: 0 },
  };
  const env = { AI: ai, ALLOWED_ORIGINS, GROQ_API_KEY: groqApiKey };
  const send = (request: Request) => handleRequest(request, env, deps);
  return { ai, sleep, send, groq, clock };
}

function chatRequest({
  body = { messages: [{ role: "user", content: "How much is in BPI?" }], tools: [] } as unknown,
  token = VALID_TOKEN as string | null,
  origin = APP_ORIGIN as string | null,
} = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (origin) headers.set("origin", origin);
  return new Request("https://assistant.example.workers.dev/", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("handleRequest", () => {
  it("answers a preflight from the app's origin", async () => {
    const { send } = setup();
    const response = await send(
      new Request("https://assistant.example.workers.dev/", {
        method: "OPTIONS",
        headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-allow-methods")).toBe("POST");
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "authorization, content-type"
    );
  });

  it("refuses a preflight or request from another origin", async () => {
    const { ai, send } = setup();
    const preflight = await send(
      new Request("https://assistant.example.workers.dev/", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example.com" },
      })
    );
    const post = await send(chatRequest({ origin: "https://evil.example.com" }));

    expect(preflight.status).toBe(403);
    expect(post.status).toBe(403);
    expect(post.headers.get("access-control-allow-origin")).toBeNull();
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("rejects a request without a valid member token", async () => {
    const { ai, send } = setup();

    const missing = await send(chatRequest({ token: null }));
    const invalid = await send(chatRequest({ token: "expired-token" }));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("streams the model's reply for rebuilt messages and the client's tools", async () => {
    const { ai, send } = setup();
    const tools = [
      {
        type: "function",
        function: { name: "get_account_balances", parameters: { type: "object" } },
      },
    ];
    const response = await send(
      chatRequest({
        body: {
          messages: [
            { role: "user", content: "How much is in BPI?" },
            {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  index: 0,
                  id: "c1",
                  type: "function",
                  function: { name: "get_account_balances", arguments: "{}" },
                },
              ],
            },
            { role: "tool", tool_call_id: "c1", content: "[]" },
          ],
          tools,
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(await response.text()).toContain("data: [DONE]");
    expect(ai.run).toHaveBeenCalledWith(MODEL, {
      messages: [
        { role: "user", content: "How much is in BPI?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "c1",
              type: "function",
              function: { name: "get_account_balances", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "c1", content: "[]" },
      ],
      tools,
      stream: true,
      max_tokens: expect.any(Number),
    });
  });

  it.each([
    ["a body that is not JSON", "{"],
    ["no messages", { tools: [] }],
    ["a message the binding cannot take", { messages: [{ role: "developer", content: "hi" }] }],
    ["a malformed tool", { messages: [{ role: "user", content: "hi" }], tools: [{ type: "web" }] }],
  ])("rejects %s", async (_label, body) => {
    const { ai, send } = setup();
    const response = await send(chatRequest({ body }));

    expect(response.status).toBe(400);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("only accepts POST", async () => {
    const { send } = setup();
    const response = await send(
      new Request("https://assistant.example.workers.dev/", { method: "GET" })
    );

    expect(response.status).toBe(405);
  });

  it("retries once after about a second when Workers AI is out of capacity", async () => {
    const run = vi
      .fn<AiBinding["run"]>()
      .mockRejectedValueOnce(aiError("3040: Capacity temporarily exceeded, please try again."))
      .mockResolvedValueOnce(sseStream());
    const { ai, sleep, send } = setup(run);

    const response = await send(chatRequest());

    expect(response.status).toBe(200);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it("reports busy when Workers AI is still out of capacity after the retry", async () => {
    const run = vi
      .fn<AiBinding["run"]>()
      .mockRejectedValue(aiError("3040: Capacity temporarily exceeded, please try again."));
    const { ai, send } = setup(run);

    const response = await send(chatRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "busy" });
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it("reports the daily limit with the next 00:00 UTC reset", async () => {
    const run = vi.fn<AiBinding["run"]>().mockRejectedValue(aiError(DAILY_NEURONS_USED_UP));
    const { ai, send, groq } = setup(run);

    const response = await send(chatRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(await response.json()).toEqual({
      error: "daily_limit",
      resetsAt: "2026-10-16T00:00:00.000Z",
    });
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(groq).not.toHaveBeenCalled();
  });

  it("does not mistake a number inside another failure for a limit code", async () => {
    const run = vi
      .fn<AiBinding["run"]>()
      .mockRejectedValue(aiError("3006: Request too large: 3036 tokens"));
    const { ai, send } = setup(run);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await send(chatRequest());

    expect(response.status).toBe(502);
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it("reports any other model failure without retrying", async () => {
    const run = vi
      .fn<AiBinding["run"]>()
      .mockRejectedValue(aiError("5006: Error: oneOf at '/' not met"));
    const { ai, send } = setup(run);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await send(chatRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream" });
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  describe("when the Workers AI daily allocation is spent", () => {
    const spent = () => vi.fn<AiBinding["run"]>().mockRejectedValue(aiError(DAILY_NEURONS_USED_UP));

    it("sends the same request to Groq and streams its reply", async () => {
      const { send, groq } = setup(spent(), { groqApiKey: "groq-key" });

      const response = await send(chatRequest());

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(response.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
      expect(await response.text()).toContain("data: [DONE]");
      expect(groq).toHaveBeenCalledTimes(1);
      const [url, init] = groq.mock.calls[0] ?? [];
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer groq-key");
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: "How much is in BPI?" }],
        stream: true,
        max_completion_tokens: expect.any(Number),
      });
    });

    it("stays on Groq for the rest of the UTC day, then tries Workers AI again", async () => {
      const run = vi
        .fn<AiBinding["run"]>()
        .mockRejectedValueOnce(aiError(DAILY_NEURONS_USED_UP))
        .mockImplementation(async () => sseStream());
      const { ai, send, groq, clock } = setup(run, { groqApiKey: "groq-key" });

      await send(chatRequest());
      clock.nowMs = Date.UTC(2026, 9, 15, 23, 59);
      const lateSameDay = await send(chatRequest());

      expect(lateSameDay.status).toBe(200);
      expect(ai.run).toHaveBeenCalledTimes(1);
      expect(groq).toHaveBeenCalledTimes(2);

      clock.nowMs = Date.UTC(2026, 9, 16, 0, 0);
      const nextDay = await send(chatRequest());

      expect(nextDay.status).toBe(200);
      expect(ai.run).toHaveBeenCalledTimes(2);
      expect(groq).toHaveBeenCalledTimes(2);
    });

    it.each([
      ["a minute's tokens spent", "42", "2026-10-15T13:30:42.000Z"],
      ["a day's tokens spent, Workers AI resets first", "86400", "2026-10-16T00:00:00.000Z"],
      ["no retry-after, a minute assumed", null, "2026-10-15T13:31:00.000Z"],
    ])("reports the limit when Groq is limited too (%s)", async (_label, retryAfter, resetsAt) => {
      const groq = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{"error":{"code":"rate_limit_exceeded"}}', {
          status: 429,
          headers: retryAfter ? { "retry-after": retryAfter } : {},
        })
      );
      const { send } = setup(spent(), { groqApiKey: "groq-key", groq });

      const response = await send(chatRequest());

      expect(response.status).toBe(429);
      expect(response.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
      expect(await response.json()).toEqual({ error: "daily_limit", resetsAt });
    });

    it.each([
      ["answers an error", async () => new Response("echoed prompt", { status: 500 })],
      [
        "cannot be reached",
        async (): Promise<Response> => {
          throw new TypeError("fetch failed: echoed prompt");
        },
      ],
    ])("reports an upstream failure when Groq %s, logging no content", async (_label, reply) => {
      const groq = vi.fn<typeof fetch>().mockImplementation(reply);
      const { send } = setup(spent(), { groqApiKey: "groq-key", groq });
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const response = await send(chatRequest());

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "upstream" });
      expect(log).toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("echoed prompt");
    });
  });
});
