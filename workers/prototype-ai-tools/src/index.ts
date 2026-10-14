// PROTOTYPE, throwaway. Not production code.
interface Env {
  AI: Ai;
  PUBLIC_JWK: string;
}

const MODEL = "@cf/openai/gpt-oss-120b";

const tools = [
  {
    type: "function",
    function: {
      name: "get_account_balances",
      description: "List the household's accounts with their current balances in PHP.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_transaction",
      description: "Propose a new income or expense. The user confirms it before it is saved.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Decimal PHP amount, e.g. \"450.00\"" },
          type: { type: "string", enum: ["income", "expense"] },
          account_id: { type: "string", description: "An id from get_account_balances" },
          category: { type: "string" },
          date: { type: "string", description: "yyyy-MM-dd, the user's local date" },
          description: { type: "string" },
        },
        required: ["amount", "type", "account_id", "date"],
      },
    },
  },
];

const systemPrompt = "You are the Household Hub assistant. Today is 2026-10-14. Use the tools; never invent account ids.";
const userPrompt = "I spent 450 pesos on groceries today from my BPI account.";

const balances = [
  { id: "acc-bpi", name: "BPI savings", balance: "12,340.50" },
  { id: "acc-gcash", name: "GCash", balance: "1,200.00" },
];

function base64urlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (char) => char.charCodeAt(0));
}

async function verifyToken(request: Request, env: Env): Promise<boolean> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return false;
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.PUBLIC_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64urlToBytes(signature),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const claims = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload))) as { exp: number; aud: string };
  return valid && claims.exp > Date.now() / 1000 && claims.aud === "authenticated";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await verifyToken(request, env))) return new Response("unauthorized", { status: 401 });
    const mode = new URL(request.url).searchParams.get("mode") ?? "chat";
    const run = env.AI.run.bind(env.AI) as (model: string, input: unknown) => Promise<unknown>;

    if (mode === "jwt") return new Response("token ok");

    if (mode === "chat" || mode === "stream") {
      const result = await run(MODEL, {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools,
        stream: mode === "stream",
        max_tokens: 1024,
      });
      if (result instanceof ReadableStream) return new Response(result, { headers: { "content-type": "text/event-stream" } });
      return Response.json(result);
    }

    if (mode === "responses") {
      const result = await run(MODEL, {
        instructions: systemPrompt,
        input: userPrompt,
        tools: tools.map((tool) => ({ type: "function", ...tool.function })),
        reasoning: { effort: "low" },
      });
      return Response.json(result);
    }

    if (mode === "roundtrip") {
      const messages: unknown[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      const transcript: unknown[] = [];
      for (let step = 0; step < 4; step++) {
        const result = (await run(MODEL, { messages, tools, max_tokens: 1024 })) as {
          choices?: { message: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
        };
        transcript.push(result);
        const message = result.choices?.[0]?.message;
        if (!message?.tool_calls?.length) break;
        messages.push({
          role: "assistant",
          content: message.content ?? "",
          tool_calls: message.tool_calls.map(({ id, function: fn }) => ({ id, type: "function", function: fn })),
        });
        for (const call of message.tool_calls) {
          const output = call.function.name === "get_account_balances" ? balances : { status: "awaiting user confirmation" };
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
        }
      }
      return Response.json(transcript);
    }

    return new Response("unknown mode", { status: 400 });
  },
};
