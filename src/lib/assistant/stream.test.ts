import { describe, expect, it } from "vitest";
import { readReply } from "./stream";

/** The proxy's body, cut into the given pieces as the network might deliver them. */
function bodyOf(...pieces: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
}

const chunk = (delta: unknown) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;

describe("readReply", () => {
  it("joins streamed text and reports each piece as it arrives", async () => {
    const pieces: string[] = [];
    const reply = await readReply(
      bodyOf(chunk({ content: "You have " }), chunk({ content: "₱750.00." }), "data: [DONE]\n\n"),
      (text) => pieces.push(text)
    );
    expect(reply).toEqual({ content: "You have ₱750.00.", toolCalls: [] });
    expect(pieces).toEqual(["You have ", "You have ₱750.00."]);
  });

  it("assembles tool calls whose name comes first and arguments in pieces", async () => {
    const reply = await readReply(
      bodyOf(
        chunk({
          tool_calls: [
            { index: 0, id: "call-1", type: "function", function: { name: "add_transaction" } },
          ],
        }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '{"amount":' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '"250"}' } }] }),
        chunk({
          tool_calls: [
            { index: 1, id: "call-2", function: { name: "list_categories", arguments: "" } },
          ],
        }),
        "data: [DONE]\n\n"
      ),
      () => {}
    );
    expect(reply.toolCalls).toEqual([
      { id: "call-1", name: "add_transaction", arguments: '{"amount":"250"}' },
      { id: "call-2", name: "list_categories", arguments: "" },
    ]);
  });

  it("reads events split across network pieces and CRLF line ends", async () => {
    const whole = chunk({ content: "Hello" }).replaceAll("\n", "\r\n");
    const reply = await readReply(
      bodyOf(whole.slice(0, 9), whole.slice(9), "data: [DONE]"),
      () => {}
    );
    expect(reply.content).toBe("Hello");
  });

  it("skips the model's reasoning and lines that aren't data", async () => {
    const reply = await readReply(
      bodyOf(
        ": keep-alive\n\n",
        chunk({ reasoning_content: "The member wants" }),
        chunk({ content: "Done." }),
        "data: [DONE]\n\n"
      ),
      () => {}
    );
    expect(reply.content).toBe("Done.");
  });

  it("skips the usage summary Workers AI sends before [DONE]", async () => {
    const reply = await readReply(
      bodyOf(
        chunk({ content: "Hello!" }),
        'data: {"response":"","usage":{"prompt_tokens":117,"completion_tokens":27}}\n\n',
        "data: [DONE]\n\n"
      ),
      () => {}
    );
    expect(reply.content).toBe("Hello!");
  });

  it("fails when the provider reports an error partway through the reply", async () => {
    const reply = readReply(
      bodyOf(
        chunk({ content: "Your balance" }),
        'data: {"error":{"message":"Service unavailable","type":"internal_server_error"}}\n\n'
      ),
      () => {}
    );
    await expect(reply).rejects.toThrow();
  });

  it("refuses a stream that isn't the chat shape", async () => {
    await expect(readReply(bodyOf("data: not json\n\n"), () => {})).rejects.toThrow();
  });
});
