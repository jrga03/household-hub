# The assistant proposes, the browser records

This refines ADR 0001. The assistant is a chat where a language model decides what to do and the member's browser does it. The model only sees tools, and every tool is a thin wrapper over a local projection read or a command in `src/lib/commands`. A read tool runs at once against the device's projections. A write tool returns a proposal, which the browser shows as a confirmation card; only Confirm runs the command, so `appendEvent` stays the only write path, the device's HLC stamps the event, and sync, membership and RLS don't change. The assistant is the one screen that reads from the network, against ADR 0001's "never the network": its replies come from the model, while every number it reports still comes from local projections.

We kept execution in the browser because the server has nothing to execute against. Projections live only on the device (ADR 0001), a server-side writer would need a second HLC clock and its own copy of each command's validation, and "only commands append events" would stop being true.

## The proxy

A stateless Cloudflare Worker sits between the browser and the model. It verifies the member's Supabase access token against the project's JWKS (ES256, checking `exp`, `iss` and `aud`), calls the model, and streams the reply back. It stores nothing: no conversations, no records, no keys beyond its own provider secrets. The browser sends the conversation with each request, and conversations live in memory only, gone on reload.

## Provider

Workers AI `@cf/openai/gpt-oss-120b` through the Worker's `env.AI` binding is the primary provider: Cloudflare doesn't train on customer content or store it unless asked to, and the binding needs no outbound key. Groq `openai/gpt-oss-120b` is the fallback, used only with Zero Data Retention turned on; it serves the same model, so one tool schema and prompt work on both.

On a limit, the Worker retries once on a capacity error, switches to Groq when the Workers AI daily allocation runs out, and when both are spent the chat disables its input and shows the reset time in local time (Workers AI resets at 00:00 UTC, 08:00 in Manila). A Groq per-minute limit counts as spent too, with its `retry-after` as the reset, so the input can be disabled for about a minute. Nothing is queued.

## Recording a transaction in one line

Most use is a single line such as "jollibee 250 gcash". To turn one into a proposal in one model call, the browser opens each conversation with a short session context message: today's local date, the active accounts and categories with their ids, and the rules for filling in a transaction. No date means today; no direction means expense. A missing category means the model asks rather than guesses. A missing account means it asks only when the household has more than one. On the confirmation card the member can still change the account, category and date before Confirm.

## Considered options

- **Server-side execution** (a Worker or Edge Function appending to `events`): no confirmation round trip, but it breaks "only commands append events", needs a second HLC clock and duplicated validation, and has no projections to read from. Rejected.
- **An MCP server for outside clients:** the same problem; the data a tool needs lives in each device's IndexedDB. Revisit only if a server-side projection exists for another reason.
- **Gemini's free plan:** the strongest free models, but its terms let Google use free-plan content to improve its products, allow human review, and say not to send personal information. Rejected for household money, including in development.
- **Routing proposals into drafts (ADR 0008):** they would wait in Review instead of on a card. Deferred until members are adding transactions through the assistant.
- **A per-member daily turn cap:** would stop one member using up the household's allocation. Not added: the prototype's 50 neurons a turn puts the free allocation near 200 turns a day, well past the 33 to 43 estimated before the prototype. Revisit if real tool sets cost enough that one member's use blocks another's.
- **Guessing a missing category:** fewer questions, but spending filed silently in the wrong envelope is worse than one extra turn. Rejected.

## Consequences

- No assistant offline. Everything it would do still works by hand, and writes already confirmed are ordinary local events.
- The free daily allocation limits how much the household can use it; heavy days end early until the reset.
- A proposal not yet confirmed is lost with the conversation on reload.
- Edit, remove and transfer tools are deferred until the first tool set ships, so the assistant can add transactions but not change them.

## Evidence

Prototype on branch `prototype/workers-ai-tools` (commit `f6bee57`, `workers/prototype-ai-tools/README.md`), run 2026-10-14: gpt-oss-120b takes OpenAI-style `tools` through `env.AI`, streams `delta.tool_calls`, and completed a balances read, then add_transaction, then a confirmation question, without inventing an account id. Deployed CPU was 0 to 2 ms per request including the ES256 token check, far inside the Free plan's 10 ms. That settles the token-check cost ADR 0001 called untested for its Durable Object option, without changing that option's standing. Cost was about 12 neurons per call and 50 per three-call turn with two small tools, against 10,000 free neurons a day; a real tool set will cost more.
