import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { PayCardDialog } from "@/components/accounts/PayCardDialog";
import { Button } from "@/components/app/Button";
import { Checkbox } from "@/components/app/Checkbox";
import { FULL_ROW } from "@/components/app/FormSheet";
import { Input } from "@/components/app/Input";
import { Label } from "@/components/app/Label";
import { Money } from "@/components/app/Money";
import { Notice } from "@/components/app/Notice";
import {
  categoryChoices,
  CategorySelect,
  isCategoryChoice,
  UNASSIGNED,
} from "@/components/transactions/CategorySelect";
import { DirectionChoice } from "@/components/transactions/EntryFields";
import { PaidFromSelect, usePaidFrom } from "@/components/transactions/PaidFromSelect";
import type { AccountRow } from "@/lib/accounts/projection";
import type { CategoryList } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { saveDrafts } from "@/lib/commands/drafts";
import { deleteDrafts, discardDrafts, editDraft, type DraftChanges } from "@/lib/import/drafts";
import { normalizeStatementText } from "@/lib/import/statement";
import { needsDescription, type DraftFlag, type ReviewedDraft } from "@/lib/import/review";
import { DESCRIPTION_MAX_LENGTH, isTransactionType } from "@/lib/transactions/events";
import { cn, errorMessage } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { BreakApartSheet } from "./BreakApartSheet";
import { isSuggested, SuggestedBadge } from "./DraftLabels";
import { useDraftAction } from "./useDraftAction";

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
  const { busy, run } = useDraftAction();
  const [paying, setPaying] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const { line, flag } = draft;
  const statementText = normalizeStatementText(line.description);
  const isCardPayment = line.isCardPayment;
  const recordedPayment = flag?.kind === "card-payment" && flag.transfer !== null;
  const blockedAsImported = flag?.kind === "already-imported" && !keepAnyway;

  const act = async (action: () => Promise<void>, done: string, failed: string) => {
    if (await run(action, done, failed)) onDone();
  };

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-body">
        <dt className="text-muted-foreground">On the statement</dt>
        <dd className="min-w-0 break-words">{line.description}</dd>
        <dt className="text-muted-foreground">Purchased</dt>
        <dd>{longDate(line.purchaseDate)}</dd>
        <dt className="text-muted-foreground">Posted</dt>
        <dd>{longDate(line.postingDate)}</dd>
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="flex items-baseline gap-3">
          <Money kind={line.type} cents={line.amount} />
          {!isCardPayment && (
            <Button
              type="button"
              size="sm"
              variant="link"
              className="h-auto p-0"
              onClick={() => setBreaking(true)}
            >
              Break apart
            </Button>
          )}
        </dd>
        {!isCardPayment && <PaidFromFact draft={draft} card={card} />}
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

      {!isCardPayment && statementText !== "" && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="draft-pin"
              checked={pinned}
              onCheckedChange={(checked) => setPinned(checked === true)}
            />
            <Label htmlFor="draft-pin" className="font-normal">
              Use these details next time
            </Label>
          </div>
          <p className="pl-6 text-caption text-muted-foreground">
            The next “{statementText}” gets this description and category, until newer saves differ.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isCardPayment ? (
          !recordedPayment &&
          card && (
            <Button type="button" disabled={busy} onClick={() => setPaying(true)}>
              Record as card payment
            </Button>
          )
        ) : (
          <Button
            type="button"
            disabled={busy || blockedAsImported || needsDescription(draft)}
            onClick={() =>
              void act(
                () => saveDrafts(actor, [draft.id], pinned),
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
            void act(() => discardDrafts([draft.id]), "Draft discarded", "Couldn't discard it.")
          }
        >
          Discard
        </Button>
      </div>

      {breaking && (
        <BreakApartSheet
          actor={actor}
          draft={draft}
          card={card}
          categories={categories}
          onSaved={onDone}
          onClose={() => setBreaking(false)}
        />
      )}

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
        <Notice tone="warning" title="Already imported">
          As{" "}
          {flag.transaction.description || (
            <Money kind={flag.transaction.type} cents={flag.transaction.amountCents} />
          )}{" "}
          on {longDate(flag.transaction.date)}. Saving it again would count it twice.
        </Notice>
      );
    case "discarded-before":
      return (
        <Notice tone="warning" title="Discarded before">
          You discarded this line on this device in the last 6 months. Save it only if that was a
          mistake.
        </Notice>
      );
    case "might-be-recorded":
      return (
        <Notice tone="warning" title="Might already be recorded">
          {flag.transaction.description || "A transaction"} of{" "}
          <Money kind={flag.transaction.type} cents={flag.transaction.amountCents} /> on{" "}
          {longDate(flag.transaction.date)}, typed in on this card. Discard this draft if it&apos;s
          the same purchase.
        </Notice>
      );
    case "card-payment":
      return flag.transfer ? (
        <Notice title="Card payment">
          Already recorded as the payment of{" "}
          <Money kind="transfer" cents={flag.transfer.amountCents} /> on{" "}
          {longDate(flag.transfer.date)}. Discard this draft.
        </Notice>
      ) : (
        <Notice title="Card payment">
          Not recorded yet. A payment is a transfer into the card, never income: record it as a card
          payment, or discard it if you record it elsewhere.
        </Notice>
      );
  }
}

const editOrWarn = (draftId: string, changes: DraftChanges) =>
  void editDraft(draftId, changes).catch((error: unknown) =>
    toast.error(errorMessage(error, "Couldn't change the draft."))
  );

/** The account that pays the line; a choice applies at once, like the other draft fields. */
function PaidFromFact({ draft, card }: { draft: ReviewedDraft; card: AccountRow | undefined }) {
  const { usualId, nameOf } = usePaidFrom(card);
  const [changing, setChanging] = useState(false);
  const paidFromId = draft.paidFromId ?? usualId;
  return (
    <>
      <dt className="self-center text-muted-foreground">Paid from</dt>
      <dd className="flex min-w-0 items-center gap-2">
        {changing ? (
          <PaidFromSelect
            card={card}
            value={paidFromId ?? undefined}
            onChange={(accountId) => {
              editOrWarn(draft.id, { paidFromId: accountId });
              setChanging(false);
            }}
          />
        ) : (
          <>
            <span>
              {nameOf(paidFromId)}
              {paidFromId === usualId && <span className="text-muted-foreground"> (usual)</span>}
            </span>
            <Button
              type="button"
              size="sm"
              variant="link"
              className="h-auto p-0"
              onClick={() => setChanging(true)}
            >
              Change
            </Button>
          </>
        )}
      </dd>
    </>
  );
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
  const edit = (changes: DraftChanges) => editOrWarn(draft.id, changes);

  return (
    <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
      <div className={cn("space-y-2", FULL_ROW)}>
        <Label htmlFor="draft-description" className="flex items-center gap-2">
          Description
          {isSuggested(draft.descriptionSource) && <SuggestedBadge />}
        </Label>
        <Input
          // Remounts when a suggestion arrives or another edit lands.
          key={draft.description}
          id="draft-description"
          required
          maxLength={DESCRIPTION_MAX_LENGTH}
          aria-invalid={draft.description === "" || undefined}
          aria-describedby={draft.description === "" ? "draft-description-needed" : undefined}
          defaultValue={draft.description}
          enterKeyHint="done"
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onBlur={(event) => {
            if (event.target.value.trim() !== draft.description) {
              edit({ description: event.target.value });
            }
          }}
        />
      </div>
      {draft.description === "" && (
        <p id="draft-description-needed" className={cn("-mt-2 text-body text-warning", FULL_ROW)}>
          Needs a description before it can be saved.
        </p>
      )}
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
        <p className={cn("text-body text-muted-foreground", FULL_ROW)}>
          Needs a category. It can be saved to Unassigned and given one later.
        </p>
      )}
    </div>
  );
}
