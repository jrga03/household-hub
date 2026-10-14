# PROTOTYPE: Workers AI tool calling (throwaway)

Run on 2026-10-14 against `@cf/openai/gpt-oss-120b` through the `env.AI` binding, wrangler 4.149.0.

Run it: `node make-token.mjs`, then `npx wrangler@4.149.0 dev`, then call `/?mode=jwt|chat|stream|roundtrip` with `Authorization: Bearer $(cat .token)`.

## Results

- Tools through the binding: yes. The chat shape (`messages` + OpenAI-style `tools`) returns `tool_calls` with `finish_reason: "tool_calls"`.
- Streaming: yes. SSE chunks carry `delta.tool_calls` the OpenAI way (name first, then argument pieces), ending with `data: [DONE]`.
- Round trip: get_account_balances, then add_transaction with `{"amount":"450.00","type":"expense","account_id":"acc-bpi","category":"groceries","date":"2026-10-14"}`, then a confirmation question. The model did not invent the account id.
- Gotcha: echoing the assistant message back as returned fails with AiError 5006 (`content` is `null` and extra fields fail the schema). Echo `{ role, content: content ?? "", tool_calls: [{ id, type, function }] }` instead.
- Cost: about 12 neurons per call, 50 per full three-call turn with two small tools (~300 to 490 tokens per call). Real tool sets and data will cost more.
- CPU on the deployed Worker (wrangler tail `cpuTime`): JWT check alone 0 to 1 ms; one model call 2 ms; streaming 1 ms; three-call round trip 2 ms (6.1 to 6.7 s wall). Far inside the 10 ms Free limit.
