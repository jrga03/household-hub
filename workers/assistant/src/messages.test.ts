import { describe, expect, it } from "vitest";
import { rebuildMessages, rebuildTools } from "./messages";

describe("rebuildMessages", () => {
  it("echoes an assistant tool call in the shape the binding accepts", () => {
    const asReturned = {
      role: "assistant",
      content: null,
      refusal: null,
      reasoning_content: "The user wants balances.",
      tool_calls: [
        {
          index: 0,
          id: "call_1",
          type: "function",
          function: { name: "get_account_balances", arguments: "{}" },
        },
      ],
    };

    expect(rebuildMessages([asReturned])).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "get_account_balances", arguments: "{}" },
          },
        ],
      },
    ]);
  });

  it("keeps only role and content on system, user and plain assistant messages", () => {
    const messages = [
      { role: "system", content: "You are the Household Hub assistant.", name: "x" },
      { role: "user", content: "How much is in BPI?", id: "local-1" },
      { role: "assistant", content: "₱12,340.50", tool_calls: [] },
    ];

    expect(rebuildMessages(messages)).toEqual([
      { role: "system", content: "You are the Household Hub assistant." },
      { role: "user", content: "How much is in BPI?" },
      { role: "assistant", content: "₱12,340.50" },
    ]);
  });

  it("keeps a tool result's call id and content", () => {
    const toolResult = {
      role: "tool",
      tool_call_id: "call_1",
      content: '[{"id":"acc-bpi"}]',
      name: "x",
    };

    expect(rebuildMessages([toolResult])).toEqual([
      { role: "tool", tool_call_id: "call_1", content: '[{"id":"acc-bpi"}]' },
    ]);
  });

  it.each([
    ["a non-array", { role: "user", content: "hi" }],
    ["an empty list", []],
    ["an unknown role", [{ role: "developer", content: "hi" }]],
    ["user content that is not text", [{ role: "user", content: [{ type: "image_url" }] }]],
    ["a tool result without a call id", [{ role: "tool", content: "{}" }]],
    [
      "a tool call without arguments",
      [
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "c", type: "function", function: { name: "f" } }],
        },
      ],
    ],
  ])("rejects %s", (_label, input) => {
    expect(rebuildMessages(input)).toBeUndefined();
  });
});

describe("rebuildTools", () => {
  it("keeps each function's name, description and parameters", () => {
    const tools = [
      {
        type: "function",
        strict: true,
        function: {
          name: "get_account_balances",
          description: "List the household's accounts.",
          parameters: { type: "object", properties: {} },
          extra: 1,
        },
      },
    ];

    expect(rebuildTools(tools)).toEqual([
      {
        type: "function",
        function: {
          name: "get_account_balances",
          description: "List the household's accounts.",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
  });

  it("treats a missing tool list as no tools", () => {
    expect(rebuildTools(undefined)).toEqual([]);
  });

  it.each([
    ["a non-array", { type: "function" }],
    ["a tool that is not a function", [{ type: "code_interpreter" }]],
    ["a function without a name", [{ type: "function", function: { parameters: {} } }]],
  ])("rejects %s", (_label, input) => {
    expect(rebuildTools(input)).toBeUndefined();
  });
});
