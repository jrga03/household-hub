import { format } from "date-fns";
import { listUsableAccounts, listUsableCategories, type AssistantScope } from "./scope";

const byId = (records: { id: string; name: string }[]) =>
  records.map((record) => `- ${record.id}: ${record.name}`).join("\n") || "- none";

/** The session's first message: enough for a one-line entry to become a proposal in one call. */
export async function buildSessionContext({ userId, now }: AssistantScope): Promise<string> {
  const [accounts, categories] = await Promise.all([
    listUsableAccounts(userId),
    listUsableCategories(userId),
  ]);
  const [onlyAccount] = accounts;
  const accountRule =
    accounts.length === 1 && onlyAccount
      ? `No account: use ${onlyAccount.name}.`
      : "No account: ask the member which one.";
  return [
    `Today is ${format(now, "yyyy-MM-dd")} (${format(now, "EEEE")}).`,
    `Accounts (id: name):\n${byId(accounts)}`,
    `Categories (id: name):\n${byId(categories)}`,
    [
      `To record a line such as "jollibee 250 gcash", call add_transaction:`,
      `- No date means today; resolve "yesterday" or "last Friday" against today's date.`,
      "- No type means expense.",
      "- No category: ask the member. Never guess one.",
      `- ${accountRule}`,
      "- Use only the ids above.",
    ].join("\n"),
  ].join("\n\n");
}
