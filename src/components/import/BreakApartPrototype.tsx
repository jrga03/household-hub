/**
 * PROTOTYPE (#411), throwaway: three layouts for Break apart on /import, switched
 * by `?variant=A|B|C`. Parts live in memory; Save only toasts. Lives on branch
 * prototype/411-break-apart, never merged.
 *
 * A: "Break apart…" in the draft detail; every part's fields open in the sheet.
 * B: a "Break apart" link on the Amount fact; the sheet splits the amount first, then names the parts.
 * C: "Break apart" in the list's selection bar (one draft); parts as rows, one open at a time.
 */
import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/app/Button";
import { CurrencyInput } from "@/components/app/CurrencyInput";
import { FormFooter, FormSheet, FULL_ROW } from "@/components/app/FormSheet";
import { Input } from "@/components/app/Input";
import { Label } from "@/components/app/Label";
import { ListRow } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import {
  categoryChoices,
  CategorySelect,
  UNASSIGNED,
} from "@/components/transactions/CategorySelect";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { payingAccountChoices } from "@/lib/accounts/paying-account";
import type { AccountRow } from "@/lib/accounts/projection";
import { categoryNames } from "@/components/allocations/envelopes";
import { diffCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import type { ReviewedDraft } from "@/lib/import/review";
import { cn } from "@/lib/utils";

export const VARIANTS = {
  A: "Detail button, every part open",
  B: "Amount link, split then name",
  C: "Selection bar, parts as rows",
} as const;
type Variant = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Variant[];

export function readVariant(search: Record<string, unknown>) {
  return KEYS.find((key) => key === search.variant) ? { variant: search.variant as Variant } : {};
}

export function useVariant(): Variant {
  const search: Record<string, unknown> = useSearch({ strict: false });
  return readVariant(search).variant ?? "A";
}

export function PrototypeSwitcher() {
  const variant = useVariant();
  const navigate = useNavigate();
  if (import.meta.env.PROD) return null;
  const go = (step: number) => {
    const next = KEYS[(KEYS.indexOf(variant) + step + KEYS.length) % KEYS.length];
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, variant: next }),
      replace: true,
    });
  };
  return (
    <div className="fixed top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-foreground p-1 text-background shadow-float">
      <Button size="icon" variant="ghost" aria-label="Previous variant" onClick={() => go(-1)}>
        <ChevronLeft aria-hidden />
      </Button>
      <span className="px-2 text-label">
        {variant} ({VARIANTS[variant]})
      </span>
      <Button size="icon" variant="ghost" aria-label="Next variant" onClick={() => go(1)}>
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}

/* ---------- Parts state (shared by every variant) ---------- */

interface Part {
  key: number;
  amount: Cents;
  description: string;
  categoryId: string | null;
  paidFromId: string;
}

function useParts(draft: ReviewedDraft, usualPaidFromId: string) {
  const copy = (key: number, amount: Cents): Part => ({
    key,
    amount,
    description: draft.description,
    categoryId: draft.categoryId,
    paidFromId: usualPaidFromId,
  });
  const [parts, setParts] = useState<Part[]>(() => [copy(1, draft.line.amount)]);
  const remaining = diffCents(draft.line.amount, sumCents(parts.map((part) => part.amount)));
  const add = () => {
    const key = Math.max(...parts.map((part) => part.key)) + 1;
    setParts([...parts, copy(key, remaining > 0 ? remaining : ZERO_CENTS)]);
    return key;
  };
  const remove = (key: number) => setParts(parts.filter((part) => part.key !== key));
  const change = (key: number, changes: Partial<Part>) =>
    setParts(parts.map((part) => (part.key === key ? { ...part, ...changes } : part)));
  const problem =
    parts.length < 2
      ? "Add a second part to break this line apart."
      : parts.some((part) => part.amount <= 0)
        ? "Every part needs an amount above ₱0.00."
        : remaining !== 0
          ? "The parts must total the line."
          : null;
  return { parts, remaining, add, remove, change, problem };
}

function usePaidFromChoices(card: AccountRow | undefined) {
  const accounts = useAccounts();
  const choices = card && accounts ? payingAccountChoices(accounts, card) : [];
  const usualId = card?.payingAccountId ?? choices[0]?.id ?? "";
  const nameOf = (id: string) => choices.find((account) => account.id === id)?.name ?? "No account";
  return { choices, usualId, nameOf };
}

/** "Remaining ₱X" under the parts; "₱X over" when the parts pass the line. */
function Remaining({ cents, className }: { cents: Cents; className?: string }) {
  return (
    <p
      className={cn("flex items-baseline justify-between text-body font-medium", className)}
      aria-live="polite"
    >
      <span className={cn(cents === 0 ? "text-muted-foreground" : "text-warning")}>
        {cents < 0 ? "Over by" : "Remaining"}
      </span>
      <Money kind="balance" cents={cents < 0 ? diffCents(ZERO_CENTS, cents) : cents} />
    </p>
  );
}

function SaveFooter({
  count,
  problem,
  onCancel,
  onSave,
  back,
}: {
  count: number;
  problem: string | null;
  onCancel: () => void;
  onSave: () => void;
  back?: () => void;
}) {
  return (
    <>
      {problem && <p className="pt-2 text-body text-muted-foreground">{problem}</p>}
      <FormFooter>
        <Button type="button" variant="outline" onClick={back ?? onCancel}>
          {back ? "Back" : "Cancel"}
        </Button>
        <Button type="button" disabled={problem !== null} onClick={onSave}>
          Save {count} parts
        </Button>
      </FormFooter>
    </>
  );
}

function PartFields({
  part,
  idPrefix,
  card,
  withAmount,
  onChange,
}: {
  part: Part;
  idPrefix: string;
  card: AccountRow | undefined;
  withAmount: boolean;
  onChange: (changes: Partial<Part>) => void;
}) {
  const categories = useCategoryList();
  const paidFrom = usePaidFromChoices(card);
  const choices = categories ? categoryChoices(categories, card, part.categoryId) : [];
  return (
    <div className="grid grid-cols-1 gap-3 @[480px]:grid-cols-2">
      {withAmount && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-amount`}>Amount</Label>
          <CurrencyInput
            id={`${idPrefix}-amount`}
            value={part.amount}
            onChange={(amount) => onChange({ amount })}
          />
        </div>
      )}
      <div className={cn("space-y-2", !withAmount && FULL_ROW)}>
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Input
          id={`${idPrefix}-description`}
          value={part.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-category`}>Category</Label>
        <CategorySelect
          id={`${idPrefix}-category`}
          choices={choices}
          value={part.categoryId ?? UNASSIGNED}
          onValueChange={(value) => onChange({ categoryId: value === UNASSIGNED ? null : value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-paid-from`}>Paid from</Label>
        <Select value={part.paidFromId} onValueChange={(paidFromId) => onChange({ paidFromId })}>
          <SelectTrigger id={`${idPrefix}-paid-from`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {paidFrom.choices.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
                {account.id === paidFrom.usualId && " (usual)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function RemoveButton({ index, onClick }: { index: number; onClick: () => void }) {
  return (
    <Button size="icon" variant="ghost" aria-label={`Remove part ${index + 1}`} onClick={onClick}>
      <X aria-hidden />
    </Button>
  );
}

const savedToast = (count: number) => toast.success(`Prototype: would save ${count} parts`);

/* ---------- Entry points ---------- */

/** The sheet for the open variant; mount it to open it. */
export function BreakApartSheet({
  draft,
  card,
  onClose,
}: {
  draft: ReviewedDraft;
  card: AccountRow | undefined;
  onClose: () => void;
}) {
  const variant = useVariant();
  const { usualId } = usePaidFromChoices(card);
  const parts = useParts(draft, usualId);
  const sheet = { draft, card, onClose, parts };
  return variant === "A" ? (
    <SheetA {...sheet} />
  ) : variant === "B" ? (
    <SheetB {...sheet} />
  ) : (
    <SheetC {...sheet} />
  );
}

interface SheetProps {
  draft: ReviewedDraft;
  card: AccountRow | undefined;
  onClose: () => void;
  parts: ReturnType<typeof useParts>;
}

function SheetTitle({ draft }: { draft: ReviewedDraft }) {
  return (
    <span className="flex items-baseline justify-between gap-4">
      <span className="truncate">Break apart</span>
      <Money kind={draft.type} cents={draft.line.amount} />
    </span>
  );
}

/* ---------- A: every part open ---------- */

function SheetA({ draft, card, onClose, parts }: SheetProps) {
  return (
    <FormSheet
      title={<SheetTitle draft={draft} />}
      description={draft.line.description}
      onClose={onClose}
    >
      <div className="space-y-6">
        {parts.parts.map((part, index) => (
          <fieldset key={part.key} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
            <legend className="flex w-full items-center justify-between text-label font-medium">
              Part {index + 1}
              {parts.parts.length > 1 && (
                <RemoveButton index={index} onClick={() => parts.remove(part.key)} />
              )}
            </legend>
            <PartFields
              part={part}
              idPrefix={`a-${part.key}`}
              card={card}
              withAmount
              onChange={(changes) => parts.change(part.key, changes)}
            />
          </fieldset>
        ))}
        <div className="space-y-3 border-t pt-4">
          <Remaining cents={parts.remaining} />
          <Button type="button" variant="outline" className="w-full" onClick={parts.add}>
            <Plus aria-hidden /> Add part
          </Button>
        </div>
      </div>
      <SaveFooter
        count={parts.parts.length}
        problem={parts.problem}
        onCancel={onClose}
        onSave={() => {
          savedToast(parts.parts.length);
          onClose();
        }}
      />
    </FormSheet>
  );
}

/* ---------- B: split the amount, then name the parts ---------- */

function SheetB({ draft, card, onClose, parts }: SheetProps) {
  const [step, setStep] = useState<"amounts" | "details">("amounts");
  return (
    <FormSheet
      title={<SheetTitle draft={draft} />}
      description={
        step === "amounts" ? "Step 1 of 2: split the amount" : "Step 2 of 2: name the parts"
      }
      onClose={onClose}
    >
      {step === "amounts" ? (
        <>
          <ul aria-label="Part amounts" className="space-y-2">
            {parts.parts.map((part, index) => (
              <li key={part.key} className="flex items-center gap-2">
                <Label htmlFor={`b-${part.key}-amount`} className="w-14 shrink-0">
                  Part {index + 1}
                </Label>
                <div className="flex-1">
                  <CurrencyInput
                    id={`b-${part.key}-amount`}
                    value={part.amount}
                    onChange={(amount) => parts.change(part.key, { amount })}
                  />
                </div>
                {parts.parts.length > 1 ? (
                  <RemoveButton index={index} onClick={() => parts.remove(part.key)} />
                ) : (
                  <span className="size-9 shrink-0" />
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-3 border-t pt-4">
            <Remaining cents={parts.remaining} />
            <Button type="button" variant="outline" className="w-full" onClick={parts.add}>
              <Plus aria-hidden /> Add part
            </Button>
          </div>
          {parts.problem && <p className="pt-2 text-body text-muted-foreground">{parts.problem}</p>}
          <FormFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={parts.problem !== null}
              onClick={() => setStep("details")}
            >
              Next
            </Button>
          </FormFooter>
        </>
      ) : (
        <>
          <div className="space-y-6">
            {parts.parts.map((part, index) => (
              <section key={part.key} aria-label={`Part ${index + 1}`} className="space-y-3">
                <h3 className="flex items-baseline justify-between text-label font-medium">
                  Part {index + 1}
                  <Money kind={draft.type} cents={part.amount} />
                </h3>
                <PartFields
                  part={part}
                  idPrefix={`b-${part.key}`}
                  card={card}
                  withAmount={false}
                  onChange={(changes) => parts.change(part.key, changes)}
                />
              </section>
            ))}
          </div>
          <SaveFooter
            count={parts.parts.length}
            problem={parts.problem}
            onCancel={onClose}
            back={() => setStep("amounts")}
            onSave={() => {
              savedToast(parts.parts.length);
              onClose();
            }}
          />
        </>
      )}
    </FormSheet>
  );
}

/* ---------- C: parts as rows, one open ---------- */

function SheetC({ draft, card, onClose, parts }: SheetProps) {
  const [openKey, setOpenKey] = useState<number | null>(parts.parts[0]?.key ?? null);
  const categories = useCategoryList();
  const names = categories ? categoryNames(categories) : new Map<string, string>();
  const paidFrom = usePaidFromChoices(card);
  return (
    <FormSheet
      title={<SheetTitle draft={draft} />}
      description={draft.line.description}
      onClose={onClose}
    >
      <Remaining cents={parts.remaining} className="pb-3" />
      <ul aria-label="Parts" className="-mx-4 border-y">
        {parts.parts.map((part, index) =>
          part.key === openKey ? (
            <li key={part.key} className="space-y-3 border-b bg-muted px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between">
                <span className="text-label font-medium">Part {index + 1}</span>
                <div className="flex items-center gap-1">
                  {parts.parts.length > 1 && (
                    <RemoveButton index={index} onClick={() => parts.remove(part.key)} />
                  )}
                  <Button size="sm" variant="outline" onClick={() => setOpenKey(null)}>
                    Done
                  </Button>
                </div>
              </div>
              <PartFields
                part={part}
                idPrefix={`c-${part.key}`}
                card={card}
                withAmount
                onChange={(changes) => parts.change(part.key, changes)}
              />
            </li>
          ) : (
            <li key={part.key} className="border-b last:border-b-0">
              <ListRow
                onClick={() => setOpenKey(part.key)}
                label={part.description || "Needs a description"}
                amount={<Money kind={draft.type} cents={part.amount} />}
                detail={
                  <span>
                    {(part.categoryId && names.get(part.categoryId)) ?? "Unassigned"}
                    {part.paidFromId !== paidFrom.usualId &&
                      ` · Paid from ${paidFrom.nameOf(part.paidFromId)}`}
                  </span>
                }
              />
            </li>
          )
        )}
      </ul>
      <Button
        type="button"
        variant="ghost"
        className="mt-2 w-full"
        onClick={() => setOpenKey(parts.add())}
      >
        <Plus aria-hidden /> Add part
      </Button>
      <SaveFooter
        count={parts.parts.length}
        problem={parts.problem}
        onCancel={onClose}
        onSave={() => {
          savedToast(parts.parts.length);
          onClose();
        }}
      />
    </FormSheet>
  );
}
