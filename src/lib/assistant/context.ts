import { format } from "date-fns";
import type { Ownership } from "@/lib/events/log";
import { localDate } from "@/lib/utils/dates";
import {
  listUsableAccounts,
  listUsableCategories,
  onlyAccount,
  type AssistantSession,
} from "./session";

const idNameLines = (records: (Ownership & { id: string; name: string })[]) =>
  records
    .map(({ id, name, visibility }) => {
      const label = visibility === "personal" ? " (Personal)" : "";
      return `- ${id}: ${name}${label}`;
    })
    .join("\n") || "- none";

/** The session's first message: enough for a one-line entry to become a proposal in one call. */
export async function buildSessionContext({ userId, now }: AssistantSession): Promise<string> {
  const [accounts, categories] = await Promise.all([
    listUsableAccounts(userId),
    listUsableCategories(userId),
  ]);
  const defaultAccount = onlyAccount(accounts);
  const accountRule = defaultAccount
    ? `No account: use ${defaultAccount.name}.`
    : "No account: ask the member which one.";
  return [
    `Today is ${localDate(now)} (${format(now, "EEEE")}).`,
    `Accounts (id: name):\n${idNameLines(accounts)}`,
    `Categories (id: name):\n${idNameLines(categories)}`,
    [
      `To record a line such as "jollibee 250 gcash", call add_transaction:`,
      `- No date means today; resolve "yesterday" or "last Friday" against today's date.`,
      "- No type means expense.",
      "- No category: ask the member. Never guess one.",
      `- ${accountRule}`,
      "- A Personal category goes only with a Personal account, a Household one with a Household account.",
      "- Use only the ids above.",
    ].join("\n"),
    [
      "How to answer:",
      "- Reply in a few sentences.",
      "- Never show ids to the member. Use names.",
      "- Prefer a list to a table, unless you are comparing numbers.",
      `- When asked what you can do, answer in two or three lines with examples such as "jollibee 250 gcash" or "How's my Groceries budget?".`,
    ].join("\n"),
  ].join("\n\n");
}
