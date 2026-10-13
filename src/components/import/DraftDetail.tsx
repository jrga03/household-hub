import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { PayCardDialog } from "@/components/accounts/PayCardDialog";
import {
  categoryChoices,
  CategorySelect,
  isCategoryChoice,
  UNASSIGNED,
} from "@/components/transactions/CategorySelect";
import { DirectionChoice } from "@/components/transactions/EntryFields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountRow } from "@/lib/accounts/projection";
import type { CategoryList } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { saveDrafts } from "@/lib/commands/drafts";
import { formatPHP } from "@/lib/currency";
import { deleteDrafts, editDraft } from "@/lib/import/drafts";
import type { DraftFlag, ReviewedDraft } from "@/lib/import/review";
import { DESCRIPTION_MAX_LENGTH, isTransactionType } from "@/lib/transactions/events";
import { errorMessage } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { isSuggested, SuggestedBadge } from "./DraftLabels";

const longDate = (date: string) => format(parseLocalDate(date), "MMM d, yyyy");

/** One draft: the line as read, what it may match, its editable fields, and save or discard. */
export function DraftDetail({
  actor,
  draft,
  card,
  categories,
  onDone,
}: {
  actor: Actor;
  draft: ReviewedDraft;
  card: AccountRow | undefined;
  categories: CategoryList;
  onDone: () => void;
}) {
  const [keepAnyway, setKeepAnyway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const { line, flag } = draft;
  const isCardPayment = flag?.kind === "card-payment";
  const blockedAsImported = flag?.kind === "already-imported" && !keepAnyway;

  async function act(run: () => Promise<void>, done: string, failed: string) {
    setBusy(true);
    try {
      await run();
      toast.success(done);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error, failed));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">On the statement</dt>
        <dd className="min-w-0 break-words">{line.description}</dd>
        <dt className="text-muted-foreground">Purchased</dt>
        <dd>{longDate(line.purchaseDate)}</dd>
        <dt className="text-muted-foreground">Posted</dt>
        <dd>{longDate(line.postingDate)}</dd>
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="tabular-nums">
          {line.type === "income" ? "+" : "−"}
          {formatPHP(line.amount)}
        </dd>
      </dl>

      {flag && <FlagNote flag={flag} />}

      {flag?.kind === "already-imported" && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="draft-keep-anyway"
            checked={keepAnyway}
            onCheckedChange={(checked) => setKeepAnyway(checked === true)}
          />
          <Label htmlFor="draft-keep-anyway" className="font-normal">
            Save it anyway; it&apos;s a different purchase
          </Label>
        </div>
      )}

      {!isCardPayment && <DraftFields draft={draft} card={card} categories={categories} />}

      <div className="flex flex-wrap gap-2">
        {isCardPayment ? (
          flag.transfer === null &&
          card && (
            <Button type="button" disabled={busy} onClick={() => setPaying(true)}>
              Record as card payment
            </Button>
          )
        ) : (
          <Button
            type="button"
            disabled={busy || blockedAsImported}
            onClick={() =>
              void act(
                () => saveDrafts(actor, [draft.id]),
                "Saved as a transaction",
                "Couldn't save the draft."
              )
            }
          >
            Save as transaction
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void act(() => deleteDrafts([draft.id]), "Draft discarded", "Couldn't discard it.")
          }
        >
          Discard
        </Button>
      </div>

      {paying && card && (
        <PayCardDialog
          actor={actor}
          card={card}
          prefill={{ amountCents: line.amount, date: line.purchaseDate }}
          onPaid={() => void deleteDrafts([draft.id]).then(onDone)}
          onClose={() => setPaying(false)}
        />
      )}
    </div>
  );
}

function FlagNote({ flag }: { flag: DraftFlag }) {
  switch (flag.kind) {
    case "already-imported":
      return (
        <p className="rounded-md border border-amber-500/50 p-3 text-sm">
          <strong className="font-medium">Already imported</strong> as{" "}
          {flag.transaction.description || formatPHP(flag.transaction.amountCents)} on{" "}
          {longDate(flag.transaction.date)}. Saving it again would count it twice.
        </p>
      );
    case "might-be-recorded":
      return (
        <p className="rounded-md border border-amber-500/50 p-3 text-sm">
          <strong className="font-medium">Might already be recorded:</strong>{" "}
          {flag.transaction.description || "a transaction"} of{" "}
          {formatPHP(flag.transaction.amountCents)} on {longDate(flag.transaction.date)}, typed in
          on this card. Discard this draft if it&apos;s the same purchase.
        </p>
      );
    case "card-payment":
      return flag.transfer ? (
        <p className="rounded-md border p-3 text-sm">
          <strong className="font-medium">Card payment</strong>, already recorded as the payment of{" "}
          {formatPHP(flag.transfer.amountCents)} on {longDate(flag.transfer.date)}. Discard this
          draft.
        </p>
      ) : (
        <p className="rounded-md border p-3 text-sm">
          <strong className="font-medium">Card payment</strong>, not recorded yet. A payment is a
          transfer into the card, never income: record it as a card payment, or discard it if you
          record it elsewhere.
        </p>
      );
  }
}

/** Edits apply as they're made; what the member sets is no longer marked suggested. */
function DraftFields({
  draft,
  card,
  categories,
}: {
  draft: ReviewedDraft;
  card: AccountRow | undefined;
  categories: CategoryList;
}) {
  const choices = categoryChoices(categories, card, draft.categoryId);
  const shownCategoryId = isCategoryChoice(choices, draft.categoryId)
    ? (draft.categoryId ?? UNASSIGNED)
    : UNASSIGNED;
  const edit = (changes: Parameters<typeof editDraft>[1]) =>
    void editDraft(draft.id, changes).catch((error: unknown) =>
      toast.error(errorMessage(error, "Couldn't change the draft."))
    );

  return (
    <div className="grid gap-4 @[480px]:grid-cols-2">
      <div className="space-y-2 @[480px]:col-span-2">
        <Label htmlFor="draft-description" className="flex items-center gap-2">
          Description
          {isSuggested(draft.descriptionSource) && <SuggestedBadge />}
        </Label>
        <Input
          // Remounts when a suggestion arrives or another edit lands.
          key={draft.description}
          id="draft-description"
          maxLength={DESCRIPTION_MAX_LENGTH}
          defaultValue={draft.description}
          onBlur={(event) => {
            if (event.target.value.trim() !== draft.description) {
              edit({ description: event.target.value });
            }
          }}
        />
      </div>
      <DirectionChoice
        value={draft.type}
        withTransfer={false}
        onChange={(type) => isTransactionType(type) && edit({ type })}
      />
      <div className="space-y-2">
        <Label htmlFor="draft-category" className="flex items-center gap-2">
          Category
          {isSuggested(draft.categorySource) && <SuggestedBadge />}
        </Label>
        <CategorySelect
          id="draft-category"
          choices={choices}
          value={shownCategoryId}
          onValueChange={(value) => edit({ categoryId: value === UNASSIGNED ? null : value })}
        />
      </div>
      {draft.type === "expense" && draft.categoryId === null && (
        <p className="text-sm text-muted-foreground @[480px]:col-span-2">
          Needs a category. It can be saved to Unassigned and given one later.
        </p>
      )}
    </div>
  );
}
