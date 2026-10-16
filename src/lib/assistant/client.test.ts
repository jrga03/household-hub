import { describe, expect, it, vi } from "vitest";
import { AssistantError, createProxyClient, LimitReachedError } from "./client";

const URL = "https://assistant.example";
const hello = [{ role: "user" as const, content: "hello" }];

function sse(text: string) {
  const event = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(event, { headers: { "content-type": "text/event-stream" } });
}

function clientAnswering(response: Response | Error, token: string | null = "token-1") {
  const fetchImpl = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
  );
  const client = createProxyClient({ url: URL, getToken: async () => token, fetchImpl });
  return { client, fetchImpl };
}

describe("createProxyClient", () => {
  it("posts the conversation and tools with the member's token and reads the stream", async () => {
    const { client, fetchImpl } = clientAnswering(sse("Hi!"));
    const reply = await client.send(hello, () => {});
    expect(reply).toEqual({ content: "Hi!", toolCalls: [] });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-1");
    const body = JSON.parse(String(init.body)) as { messages: unknown; tools: unknown[] };
    expect(body.messages).toEqual(hello);
    expect(body.tools.length).toBeGreaterThan(0);
  });

  it("reports the daily limit with its reset time", async () => {
    const resetsAt = "2026-10-17T00:00:00.000Z";
    const { client } = clientAnswering(
      Response.json({ error: "daily_limit", resetsAt }, { status: 429 })
    );
    const failure = await client.send(hello, () => {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LimitReachedError);
    expect((failure as LimitReachedError).resetsAt.toISOString()).toBe(resetsAt);
  });

  it.each([
    [
      Response.json({ error: "busy" }, { status: 503 }),
      "The assistant is busy. Try again in a moment.",
    ],
    [
      Response.json({ error: "unauthorized" }, { status: 401 }),
      "Sign in again to use the assistant.",
    ],
    [
      Response.json({ error: "upstream" }, { status: 502 }),
      "Couldn't reach the assistant. Try again.",
    ],
    [new TypeError("Failed to fetch"), "Couldn't reach the assistant. Try again."],
  ])("explains a failed request (%#)", async (response, message) => {
    const { client } = clientAnswering(response);
    await expect(client.send(hello, () => {})).rejects.toThrow(new AssistantError(message));
  });

  it("asks the member to sign in when there is no session", async () => {
    const { client, fetchImpl } = clientAnswering(sse("unused"), null);
    await expect(client.send(hello, () => {})).rejects.toThrow(
      "Sign in again to use the assistant."
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
