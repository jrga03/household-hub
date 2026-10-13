import { formatPHP, formatTransactionExpense, type Cents } from "@/lib/currency";

export type AmountDirection = "in" | "out" | "moved";

/** How each direction is signed, read aloud and coloured. */
export const AMOUNT_DIRECTION: Record<
  AmountDirection,
  { sign: string; spoken: string; className: string }
> = {
  in: { sign: "+", spoken: "plus ", className: "text-income" },
  out: { sign: "−", spoken: "minus ", className: "" },
  moved: { sign: "", spoken: "", className: "text-muted-foreground" },
};

interface TransactionAmountProps {
  direction: AmountDirection;
  cents: Cents;
  /**
   * "(₱250.00)" instead of "−₱250.00", still read aloud as "minus ₱250.00".
   * Only the Transactions page and Home's Latest ask for it; every other view
   * keeps the minus sign.
   */
  expenseInParentheses?: boolean;
}

/** What an amount says aloud: "(₱250.00)" and "−₱250.00" are both "minus ₱250.00". */
export function spokenAmount(direction: AmountDirection, cents: Cents): string {
  return `${AMOUNT_DIRECTION[direction].spoken}${formatPHP(cents)}`;
}

/** A transaction's signed amount, read aloud with its sign. */
export function TransactionAmount({
  direction,
  cents,
  expenseInParentheses = false,
}: TransactionAmountProps) {
  const text =
    direction === "out" && expenseInParentheses
      ? formatTransactionExpense(cents)
      : `${AMOUNT_DIRECTION[direction].sign}${formatPHP(cents)}`;
  return (
    <>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{spokenAmount(direction, cents)}</span>
    </>
  );
}
