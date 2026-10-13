import { formatPHP, formatTransactionExpense, type Cents } from "@/lib/currency";

export type AmountDirection = "in" | "out" | "moved";

interface TransactionAmountProps {
  direction: AmountDirection;
  cents: Cents;
  /** "(₱250.00)" instead of "−₱250.00": only the Transactions page and Home's Latest ask for it. */
  expenseInParentheses?: boolean;
}

/** What an amount says aloud: "(₱250.00)" and "−₱250.00" are both "minus ₱250.00". */
export function spokenAmount(direction: AmountDirection, cents: Cents): string {
  const amount = formatPHP(cents);
  if (direction === "out") return `minus ${amount}`;
  return direction === "in" ? `plus ${amount}` : amount;
}

/** A transaction's signed amount, read aloud with its sign. */
export function TransactionAmount({
  direction,
  cents,
  expenseInParentheses = false,
}: TransactionAmountProps) {
  const amount = formatPHP(cents);
  const text =
    direction === "out"
      ? expenseInParentheses
        ? formatTransactionExpense(cents).text
        : `−${amount}`
      : direction === "in"
        ? `+${amount}`
        : amount;
  return (
    <>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{spokenAmount(direction, cents)}</span>
    </>
  );
}
