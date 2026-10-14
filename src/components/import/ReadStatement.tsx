import { useActionState, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { ActionForm } from "@/components/ui/action-form";
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
import { useLastImportCard } from "@/hooks/useImports";
import { isCreditCard } from "@/lib/accounts/events";
import { createImport } from "@/lib/import/drafts";
import { BDO_CREDIT_CARD_PDF, STATEMENT_FORMATS } from "@/lib/import/formats";
import { parseStatement } from "@/lib/import/parse-statement";
import {
  forgetStatementPassword,
  readRememberedPassword,
  rememberStatementPassword,
} from "@/lib/import/remembered-passwords";
import type { StatementFormatId } from "@/lib/import/statement";
import { suggestDrafts } from "@/lib/import/suggest-drafts";
import { countOf, errorMessage } from "@/lib/utils";

interface ReadState {
  error: string | null;
  readCount: number;
}

/**
 * Pick a statement, the card it belongs to and its password; its lines are
 * held as an Import of drafts for review. The card starts as the one last
 * used with the format on this device.
 */
export function ReadStatement() {
  const accounts = useAccounts();
  const cards = accounts?.filter(isCreditCard) ?? [];
  const [formatId, setFormatId] = useState<StatementFormatId>(BDO_CREDIT_CARD_PDF.id);
  const [cardId, setCardId] = useState("");
  const lastCardId = useLastImportCard(formatId);
  const format = STATEMENT_FORMATS.find((choice) => choice.id === formatId);
  const lastCard = cards.find((card) => card.id === lastCardId);
  const chosenCardId = cardId || lastCard?.id || cards[0]?.id || "";
  const rememberable = format?.password === "fixed";
  const remembered = useLiveQuery(
    () => (rememberable && chosenCardId ? readRememberedPassword(chosenCardId) : undefined),
    [rememberable, chosenCardId]
  );

  const [state, readAction] = useActionState(
    async (previous: ReadState, formData: FormData): Promise<ReadState> => {
      const failed = (error: string) => ({ error, readCount: previous.readCount });
      const file = formData.get("file");
      if (!format) return failed("Choose the statement's format.");
      if (!(file instanceof File) || file.size === 0) return failed("Choose a statement file.");
      if (!chosenCardId) return failed("Choose the card this statement is for.");
      const password = String(formData.get("password") ?? "");
      try {
        const lines = await parseStatement(format.id, file, password);
        if (rememberable) {
          if (formData.get("remember")) await rememberStatementPassword(chosenCardId, password);
          else await forgetStatementPassword(chosenCardId);
        }
        if (lines.length === 0) {
          return failed(
            `No purchases, refunds or payments were found in ${file.name}, so there's nothing to import.`
          );
        }
        const importId = await createImport({
          formatId: format.id,
          fileName: file.name,
          accountId: chosenCardId,
          lines,
        });
        void suggestDrafts(importId);
        toast.success(`${countOf(lines.length, "line", "lines")} read from ${file.name}`);
        return { error: null, readCount: previous.readCount + 1 };
      } catch (caught) {
        return failed(errorMessage(caught, "The statement couldn't be read."));
      }
    },
    { error: null, readCount: 0 }
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
    <ActionForm action={readAction} className="@container space-y-4" aria-label="Read a statement">
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="statement-format">Format</Label>
          <Select
            value={formatId}
            onValueChange={(next) => {
              const chosen = STATEMENT_FORMATS.find((choice) => choice.id === next);
              if (!chosen) return;
              setFormatId(chosen.id);
              // Each format remembers its own card.
              setCardId("");
            }}
          >
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
          <Select value={chosenCardId} onValueChange={setCardId}>
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
          <Input
            key={state.readCount}
            id="statement-file"
            name="file"
            type="file"
            accept={format?.accept}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="statement-password">Password</Label>
          <Input
            // Remounts with the chosen card's remembered password once it loads, and after each read.
            key={`${chosenCardId}:${remembered ?? ""}:${state.readCount}`}
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
            key={`${chosenCardId}:${remembered !== undefined}:${state.readCount}`}
            id="statement-remember"
            name="remember"
            defaultChecked={remembered !== undefined}
          />
          <Label htmlFor="statement-remember" className="font-normal">
            Remember password on this device
          </Label>
        </div>
      )}
      <FormError>{state.error}</FormError>
      <SubmitButton pendingText="Reading...">Read statement</SubmitButton>
    </ActionForm>
  );
}
