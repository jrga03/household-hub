import { absCents, formatPHP, type Cents } from "@/lib/currency";
import { cn } from "@/lib/utils";

/** What an amount is, which decides its sign and color. */
export type MoneyKind =
  | { kind: "income" | "expense" | "net" }
  | { kind: "transfer"; leg?: "out" | "in" }
  | { kind: "balance"; owed?: boolean };

export type MoneyProps = MoneyKind & { cents: Cents; className?: string };

type Sign = "plus" | "minus" | "none";

const SIGN_TEXT: Record<Sign, { shown: string; spoken: string }> = {
  plus: { shown: "+", spoken: "plus " },
  minus: { shown: "−", spoken: "minus " },
  none: { shown: "", spoken: "" },
};

/**
 * The shortfall color for a negative amount. A credit card's figure is the amount owed,
 * so pass `owed` for it: a negative owed amount is a credit, not money short.
 */
function shortfallClass(cents: Cents, { owed = false }: { owed?: boolean } = {}) {
  return !owed && cents < 0 ? "text-shortfall" : undefined;
}

function signAndColor(props: MoneyProps): { sign: Sign; color?: string } {
  const signOf = (cents: Cents): Sign => (cents > 0 ? "plus" : cents < 0 ? "minus" : "none");
  switch (props.kind) {
    case "income":
      return { sign: "plus", color: "text-income" };
    case "expense":
      return { sign: "minus" };
    case "transfer":
      if (props.leg === undefined) return { sign: "none", color: "text-muted-foreground" };
      return { sign: props.leg === "in" ? "plus" : "minus" };
    case "balance":
      return {
        sign: props.cents < 0 ? "minus" : "none",
        color: shortfallClass(props.cents, props),
      };
    case "net":
      return {
        sign: signOf(props.cents),
        color: props.cents > 0 ? "text-income" : undefined,
      };
  }
}

/** What an amount says aloud: "−₱250.00" is "minus ₱250.00". */
export function spokenMoney(props: MoneyProps): string {
  const { sign } = signAndColor(props);
  return `${SIGN_TEXT[sign].spoken}${formatPHP(absCents(props.cents))}`;
}

/** Every amount in the app: signed, colored and read aloud by its kind. */
export function Money(props: MoneyProps) {
  const { sign, color } = signAndColor(props);
  const amount = formatPHP(absCents(props.cents));
  return (
    <span className={cn("whitespace-nowrap tabular-nums", color, props.className)}>
      <span aria-hidden="true">{`${SIGN_TEXT[sign].shown}${amount}`}</span>
      <span className="sr-only">{spokenMoney(props)}</span>
    </span>
  );
}
