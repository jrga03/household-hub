/** What the model is told about each tool, in the OpenAI `tools` shape. Kept short: every request carries them. */

interface Parameter {
  type: "string" | "integer";
  description?: string;
  enum?: string[];
}

export interface AssistantTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, Parameter>; required: string[] };
  };
}

const tool = (
  name: string,
  description: string,
  properties: Record<string, Parameter> = {},
  required: string[] = []
): AssistantTool => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});

const DATE = "yyyy-MM-dd, local date";

export const ASSISTANT_TOOLS: AssistantTool[] = [
  tool(
    "get_account_balances",
    "Accounts in use with their balances in PHP. A credit card's balance is what it owes."
  ),
  tool("list_transactions", "Transactions, newest first. more is true when rows were left out.", {
    account_id: { type: "string" },
    category_id: { type: "string" },
    from: { type: "string", description: DATE },
    to: { type: "string", description: DATE },
    limit: { type: "integer", description: "Rows to return, default 20, at most 50" },
  }),
  tool("list_categories", "Categories in use, with their groups."),
  tool(
    "get_budget_status",
    "Each category's budget, spending and what's left for a month. Transfers never count as spending.",
    { month: { type: "string", description: "yyyy-MM, default this month" } }
  ),
  tool(
    "add_transaction",
    "Propose an expense or income. The member confirms it before it is recorded.",
    {
      amount: { type: "string", description: 'Decimal PHP, e.g. "1,250.50"' },
      description: { type: "string", description: "What or where, e.g. Jollibee" },
      type: { type: "string", enum: ["expense", "income"], description: "Default expense" },
      account_id: { type: "string" },
      category_id: { type: "string", description: "Required for an expense" },
      date: { type: "string", description: `${DATE}, default today` },
      notes: { type: "string" },
    },
    ["amount", "description"]
  ),
];
