import { useState } from "react";
import { format } from "date-fns";
import { categoryNames } from "@/components/allocations/envelopes";
import { DetailPane, resolveOpenItem, useOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useImportReview } from "@/hooks/useImports";
import type { AccountRow } from "@/lib/accounts/projection";
import type { Actor } from "@/lib/commands/accounts";
import { saveDrafts } from "@/lib/commands/drafts";
import { deleteDrafts } from "@/lib/import/drafts";
import {
  discardedByDefault,
  needsDescription,
  selectedByDefault,
  type ReviewedDraft,
  type ReviewedImport,
} from "@/lib/import/review";
import { cn, countOf } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { DraftDetail } from "./DraftDetail";
import { FlagBadge, isSuggested, signedAmount, SuggestedBadge } from "./DraftLabels";
import { ReadStatement } from "./ReadStatement";
import { useDraftAction } from "./useDraftAction";

const draftsLabel = (count: number) => countOf(count, "draft", "drafts");

/** A draft's name in the list, or what it's missing. */
const draftTitle = (draft: ReviewedDraft) => draft.description || "Needs a description";

/**
 * Read a statement, then review its drafts: each Import lists its lines,
 * flagged and selectable for bulk save or discard. A draft opens in the
 * `DetailPane`.
 */
export function ImportView({ actor }: { actor: Actor }) {
  const imports = useImportReview();
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  const { openId, open, close } = useOpenItem();

  if (!imports || !accounts || !retiredAccounts || !categories) return null;
  const accountsById = new Map(
    [...accounts, ...retiredAccounts].map((account) => [account.id, account])
  );
  const names = categoryNames(categories);
  // Saved or discarded, here or by a bulk action: it's gone, which closes it.
  const opened = resolveOpenItem(openId, (id) => findDraft(imports, id));
  const openedCard = opened ? accountsById.get(opened.statement.accountId) : undefined;

  return (
    <>
      <PageShell.List className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Read a statement</CardTitle>
            <CardDescription>
              Its lines wait below as drafts until you save or discard them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReadStatement />
          </CardContent>
        </Card>

        {imports.length === 0 ? (
          <p className="text-body text-muted-foreground">No open imports.</p>
        ) : (
          imports.map((statement) => (
            <ImportCard
              key={statement.id}
              actor={actor}
              statement={statement}
              cardName={cardLabel(accountsById.get(statement.accountId))}
              categoryNames={names}
              openId={openId}
              onOpen={open}
            />
          ))
        )}
      </PageShell.List>

      <DetailPane
        title={opened && draftTitle(opened.draft)}
        description={cardLabel(openedCard)}
        item={opened}
      >
        {({ draft }) => (
          <DraftDetail
            key={draft.id}
            actor={actor}
            draft={draft}
            card={openedCard}
            categories={categories}
            onDone={close}
          />
        )}
      </DetailPane>
    </>
  );
}

const cardLabel = (card: AccountRow | undefined) => card?.name ?? "A card not on this device";

function findDraft(imports: ReviewedImport[], draftId: string) {
  for (const statement of imports) {
    const draft = statement.drafts.find((candidate) => candidate.id === draftId);
    if (draft) return { statement, draft };
  }
  return undefined;
}

function ImportCard({
  actor,
  statement,
  cardName,
  categoryNames,
  openId,
  onOpen,
}: {
  actor: Actor;
  statement: ReviewedImport;
  cardName: string;
  categoryNames: Map<string, string>;
  openId: string | null;
  onOpen: (draftId: string) => void;
}) {
  // Only what the member ticked or unticked; the rest follows each draft's flag as records sync in.
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(new Map());
  const { busy, run } = useDraftAction();
  const { drafts } = statement;
  const isSelected = (draft: ReviewedDraft) =>
    choices.get(draft.id) ?? selectedByDefault(draft.flag);
  const selected = drafts.filter(isSelected);
  const savable = selected.filter((draft) => draft.flag?.kind !== "card-payment");
  const alreadyRecorded = drafts.filter((draft) => discardedByDefault(draft.flag));
  const undescribed = savable.filter(needsDescription);
  const allSelected = selected.length === drafts.length;

  const choose = (entries: [string, boolean][]) =>
    setChoices((current) => new Map([...current, ...entries]));

  const ids = (list: ReviewedDraft[]) => list.map((draft) => draft.id);
  const save = () =>
    run(
      () => saveDrafts(actor, ids(savable)),
      `Saved ${countOf(savable.length, "transaction", "transactions")}`,
      "Couldn't save the drafts. None were saved."
    );
  const discard = (list: ReviewedDraft[]) =>
    run(
      () => deleteDrafts(ids(list)),
      `Discarded ${draftsLabel(list.length)}`,
      "Couldn't discard the drafts."
    );

  return (
    <Card>
      <section aria-label={`Import ${statement.fileName}`} className="contents">
        <CardHeader>
          <CardTitle className="break-words">{statement.fileName}</CardTitle>
          <CardDescription>
            {cardName} · read {format(new Date(statement.importedAt), "MMM d, h:mm a")} ·{" "}
            {draftsLabel(drafts.length)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto flex items-center gap-2">
              <Checkbox
                id={`select-all-${statement.id}`}
                checked={allSelected ? true : selected.length > 0 ? "indeterminate" : false}
                onCheckedChange={() =>
                  choose(drafts.map((draft): [string, boolean] => [draft.id, !allSelected]))
                }
              />
              <label htmlFor={`select-all-${statement.id}`} className="text-body">
                Select all
              </label>
            </div>
            <Button
              size="sm"
              disabled={busy || savable.length === 0 || undescribed.length > 0}
              onClick={() => void save()}
            >
              Save {draftsLabel(savable.length)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || selected.length === 0}
              onClick={() => void discard(selected)}
            >
              Discard {draftsLabel(selected.length)}
            </Button>
            {alreadyRecorded.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void discard(alreadyRecorded)}
              >
                Discard {alreadyRecorded.length} already recorded
              </Button>
            )}
          </div>

          {undescribed.length > 0 && (
            <p className="text-body text-warning">
              {countOf(undescribed.length, "selected draft needs", "selected drafts need")} a
              description before saving.
            </p>
          )}

          <ul aria-label="Drafts" className="divide-y rounded-md border">
            {drafts.map((draft) => (
              <DraftItem
                key={draft.id}
                draft={draft}
                categoryName={draft.categoryId ? categoryNames.get(draft.categoryId) : undefined}
                selected={isSelected(draft)}
                open={draft.id === openId}
                onSelect={(next) => choose([[draft.id, next]])}
                onOpen={() => onOpen(draft.id)}
              />
            ))}
          </ul>
        </CardContent>
      </section>
    </Card>
  );
}

function DraftItem({
  draft,
  categoryName,
  selected,
  open,
  onSelect,
  onOpen,
}: {
  draft: ReviewedDraft;
  categoryName: string | undefined;
  selected: boolean;
  open: boolean;
  onSelect: (selected: boolean) => void;
  onOpen: () => void;
}) {
  const { line, flag } = draft;
  return (
    <li className={cn("flex items-center gap-3 px-3 py-2", open && "bg-accent")}>
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onSelect(checked === true)}
        aria-label={`Select ${draft.description || signedAmount(draft.type, line.amount)}`}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-current={open || undefined}
        className="min-w-0 flex-1 text-left"
      >
        <p className={cn("truncate text-body", needsDescription(draft) && "text-warning")}>
          {draftTitle(draft)}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
          <span>{format(parseLocalDate(line.purchaseDate), "MMM d")}</span>
          {flag && <FlagBadge flag={flag} />}
          {flag?.kind !== "card-payment" && (
            <CategoryLabel draft={draft} categoryName={categoryName} />
          )}
        </p>
      </button>
      <span className="shrink-0 text-body tabular-nums">
        {signedAmount(draft.type, line.amount)}
      </span>
    </li>
  );
}

function CategoryLabel({
  draft,
  categoryName,
}: {
  draft: ReviewedDraft;
  categoryName: string | undefined;
}) {
  if (categoryName) {
    return (
      <span className="flex items-center gap-1">
        {categoryName}
        {isSuggested(draft.categorySource) && <SuggestedBadge />}
      </span>
    );
  }
  return draft.type === "expense" ? (
    <span className="text-warning">Needs a category</span>
  ) : (
    <span>Unassigned</span>
  );
}
