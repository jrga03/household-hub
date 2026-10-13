import { useActionState, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAccounts } from "@/hooks/useAccounts";
import { isCreditCard } from "@/lib/accounts/events";
import { formatPHP } from "@/lib/currency";
import { STATEMENT_FORMATS } from "@/lib/import/formats";
import { parseStatement } from "@/lib/import/parse-statement";
import {
  forgetStatementPassword,
  readRememberedPassword,
  rememberStatementPassword,
} from "@/lib/import/remembered-passwords";
import type { StatementLine } from "@/lib/import/statement";
import { errorMessage } from "@/lib/utils";

type ReadResult = { lines: StatementLine[]; fileName: string } | { error: string } | null;

/** Pick a statement, the card it belongs to and its password, and see the lines read from it. */
export function ReadStatement() {
  const accounts = useAccounts();
  const cards = accounts?.filter(isCreditCard) ?? [];
  const [formatId, setFormatId] = useState(STATEMENT_FORMATS[0]?.id ?? "");
  const [cardId, setCardId] = useState("");
  const format = STATEMENT_FORMATS.find((choice) => choice.id === formatId);
  const chosenCardId = cardId || cards[0]?.id || "";
  const rememberable = format?.password === "fixed";
  const remembered = useLiveQuery(
    () => (rememberable && chosenCardId ? readRememberedPassword(chosenCardId) : undefined),
    [rememberable, chosenCardId]
  );

  const [result, readAction] = useActionState(
    async (_previous: ReadResult, formData: FormData): Promise<ReadResult> => {
      const file = formData.get("file");
      if (!format) return { error: "Choose the statement's format." };
      if (!(file instanceof File) || file.size === 0) return { error: "Choose a statement file." };
      if (!chosenCardId) return { error: "Choose the card this statement is for." };
      const password = String(formData.get("password") ?? "");
      try {
        const lines = await parseStatement(format.id, file, password);
        if (rememberable) {
          if (formData.get("remember")) await rememberStatementPassword(chosenCardId, password);
          else await forgetStatementPassword(chosenCardId);
        }
        return { lines, fileName: file.name };
      } catch (caught) {
        return { error: errorMessage(caught, "The statement couldn't be read.") };
      }
    },
    null
  );

  if (!accounts) return null;
  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a credit card first; a card statement is imported into one of your cards.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <form action={readAction} className="@container space-y-4" aria-label="Read a statement">
        <div className="grid gap-4 @[480px]:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="statement-format">Format</Label>
            {/* Keyed by value: Radix Select returns to its first value when the form
                resets, as React does after every read. */}
            <Select key={formatId} value={formatId} onValueChange={setFormatId}>
              <SelectTrigger id="statement-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATEMENT_FORMATS.map((choice) => (
                  <SelectItem key={choice.id} value={choice.id}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="statement-card">Card</Label>
            <Select key={chosenCardId} value={chosenCardId} onValueChange={setCardId}>
              <SelectTrigger id="statement-card" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cards.map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    {card.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="statement-file">Statement file</Label>
            <Input id="statement-file" name="file" type="file" accept={format?.accept} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="statement-password">Password</Label>
            <Input
              // Remounts with the chosen card's remembered password once it loads.
              key={`${chosenCardId}:${remembered ?? ""}`}
              id="statement-password"
              name="password"
              type="password"
              autoComplete="off"
              defaultValue={remembered ?? ""}
            />
          </div>
        </div>
        {rememberable && (
          <div className="flex items-center gap-2">
            <Checkbox
              key={`${chosenCardId}:${remembered !== undefined}`}
              id="statement-remember"
              name="remember"
              defaultChecked={remembered !== undefined}
            />
            <Label htmlFor="statement-remember" className="font-normal">
              Remember password on this device
            </Label>
          </div>
        )}
        {result && "error" in result && <FormError>{result.error}</FormError>}
        <SubmitButton pendingText="Reading...">Read statement</SubmitButton>
      </form>

      {result && "lines" in result && <StatementLines {...result} />}
    </div>
  );
}

function StatementLines({ lines, fileName }: { lines: StatementLine[]; fileName: string }) {
  return (
    <section aria-label="Statement lines" className="space-y-2">
      <h2 className="text-sm font-medium">
        {lines.length} {lines.length === 1 ? "line" : "lines"} read from {fileName}
      </h2>
      <ul className="divide-y rounded-md border">
        {lines.map((line, index) => (
          <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate">{line.description}</p>
              <p className="text-xs text-muted-foreground">
                {line.purchaseDate}
                {line.isCardPayment && (
                  <Badge variant="secondary" className="ml-2">
                    Card payment
                  </Badge>
                )}
              </p>
            </div>
            <span className="shrink-0 tabular-nums">
              {line.type === "income" ? "+" : "−"}
              {formatPHP(line.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
