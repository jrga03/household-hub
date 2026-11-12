import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/app/Button";
import { CurrencyInput } from "@/components/app/CurrencyInput";
import { FormFooter, FormSheet } from "@/components/app/FormSheet";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/app/Input";
import { Money } from "@/components/app/Money";
import {
  categoryChoices,
  CategorySelect,
  shownCategory,
  UNASSIGNED,
} from "@/components/transactions/CategorySelect";
import { PaidFromSelect, usePaidFrom } from "@/components/transactions/PaidFromSelect";
import type { AccountRow } from "@/lib/accounts/projection";
import type { CategoryList } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { breakApartDraft, breakApartProblem, type DraftPart } from "@/lib/commands/drafts";
import { diffCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import type { ReviewedDraft } from "@/lib/import/review";
import { normalizeStatementText } from "@/lib/import/statement";
import { DESCRIPTION_MAX_LENGTH } from "@/lib/transactions/events";
import { cn, countOf } from "@/lib/utils";
import { useDraftAction } from "./useDraftAction";

interface Part extends DraftPart {
  key: number;
}

/** Breaks a draft apart into Parts that total its line; closing it drops the parts. */
export function BreakApartSheet({
  actor,
  draft,
  card,
  categories,
  onSaved,
  onClose,
}: {
  actor: Actor;
  draft: ReviewedDraft;
  card: AccountRow | undefined;
  categories: CategoryList;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { usualId } = usePaidFrom(card);
  const { busy, run } = useDraftAction();
  const copyOfDraft = (key: number, amountCents: Cents): Part => ({
    key,
    amountCents,
    description: draft.description,
    categoryId: draft.categoryId,
    paidFromId: draft.paidFromId ?? usualId ?? undefined,
  });
  const [parts, setParts] = useState(() => [copyOfDraft(1, draft.line.amount)]);
  const remaining = diffCents(draft.line.amount, sumCents(parts.map((part) => part.amountCents)));
  const problem = breakApartProblem(draft.line.amount, parts);

  const change = (key: number, changes: Partial<DraftPart>) =>
    setParts(parts.map((part) => (part.key === key ? { ...part, ...changes } : part)));
  const add = () =>
    setParts([
      ...parts,
      copyOfDraft(
        Math.max(...parts.map((part) => part.key)) + 1,
        remaining > 0 ? remaining : ZERO_CENTS
      ),
    ]);
  const save = async () => {
    const saved = await run(
      () => breakApartDraft(actor, draft.id, parts),
      `Saved ${countOf(parts.length, "part", "parts")}`,
      "Couldn't break the line apart."
    );
    if (saved) onSaved();
  };

  return (
    <FormSheet
      title={
        <span className="flex items-baseline justify-between gap-4">
          <span className="truncate">Break apart</span>
          <Money kind={draft.type} cents={draft.line.amount} />
        </span>
      }
      description={normalizeStatementText(draft.line.description)}
      onClose={onClose}
    >
      <div className="space-y-6">
        {parts.map((part, index) => (
          <fieldset key={part.key} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
            <legend className="flex w-full items-center justify-between text-label font-medium">
              Part {index + 1}
              {parts.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove part ${index + 1}`}
                  onClick={() => setParts(parts.filter((other) => other.key !== part.key))}
                >
                  <X aria-hidden />
                </Button>
              )}
            </legend>
            <PartFields
              part={part}
              card={card}
              categories={categories}
              onChange={(changes) => change(part.key, changes)}
            />
          </fieldset>
        ))}
        <div className="space-y-3 border-t pt-4">
          <p role="status" className="flex items-baseline justify-between text-body font-medium">
            <span className={cn(remaining === 0 ? "text-muted-foreground" : "text-warning")}>
              {remaining < 0 ? "Over by" : "Remaining"}
            </span>
            <Money
              kind="balance"
              cents={remaining < 0 ? diffCents(ZERO_CENTS, remaining) : remaining}
            />
          </p>
          <Button type="button" variant="outline" className="w-full" onClick={add}>
            <Plus aria-hidden /> Add part
          </Button>
        </div>
      </div>
      {problem && <p className="pt-2 text-body text-muted-foreground">{problem}</p>}
      <FormFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={busy || problem !== null} onClick={() => void save()}>
          Save {countOf(parts.length, "part", "parts")}
        </Button>
      </FormFooter>
    </FormSheet>
  );
}

function PartFields({
  part,
  card,
  categories,
  onChange,
}: {
  part: Part;
  card: AccountRow | undefined;
  categories: CategoryList;
  onChange: (changes: Partial<DraftPart>) => void;
}) {
  const choices = categoryChoices(categories, card, part.categoryId);
  return (
    <div className="grid grid-cols-1 gap-3 @[480px]:grid-cols-2">
      <Field label="Amount">
        <CurrencyInput
          value={part.amountCents}
          onChange={(amountCents) => onChange({ amountCents })}
        />
      </Field>
      <Field label="Description">
        <Input
          maxLength={DESCRIPTION_MAX_LENGTH}
          value={part.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>
      <Field label="Category">
        {(control) => (
          <CategorySelect
            {...control}
            choices={choices}
            value={shownCategory(choices, part.categoryId)}
            onValueChange={(value) => onChange({ categoryId: value === UNASSIGNED ? null : value })}
          />
        )}
      </Field>
      <Field label="Paid from">
        {(control) => (
          <PaidFromSelect
            {...control}
            card={card}
            value={part.paidFromId}
            onChange={(paidFromId) => onChange({ paidFromId })}
          />
        )}
      </Field>
    </div>
  );
}
