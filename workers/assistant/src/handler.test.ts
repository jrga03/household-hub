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

function setup(
  run: AiBinding["run"] = vi.fn<AiBinding["run"]>().mockImplementation(async () => sseStream())
) {
  const ai = { run: vi.fn(run) };
  const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
  const deps = {
    authorize: async (token: string) => token === VALID_TOKEN,
    sleep,
    nowMs: () => Date.UTC(2026, 9, 15, 13, 30),
  };
  const send = (request: Request) => handleRequest(request, { AI: ai, ALLOWED_ORIGINS }, deps);
  return { ai, sleep, send };
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
      .mockRejectedValueOnce(
        new Error("AiError: 3040: Capacity temporarily exceeded, please try again.")
      )
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
      .mockRejectedValue(new Error("3040: Capacity temporarily exceeded"));
    const { ai, send } = setup(run);

    const response = await send(chatRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "busy" });
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it("reports the daily limit with the next 00:00 UTC reset", async () => {
    const run = vi
      .fn<AiBinding["run"]>()
      .mockRejectedValue(
        new Error("AiError: 3036: You have used up your daily free allocation of 10,000 neurons.")
      );
    const { ai, send } = setup(run);

    const response = await send(chatRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(await response.json()).toEqual({
      error: "daily_limit",
      resetsAt: "2026-10-16T00:00:00.000Z",
    });
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it("reports any other model failure without retrying", async () => {
    const run = vi
      .fn<AiBinding["run"]>()
      .mockRejectedValue(new Error("AiError: 5006: invalid input"));
    const { ai, send } = setup(run);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await send(chatRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream" });
    expect(ai.run).toHaveBeenCalledTimes(1);
  });
});
