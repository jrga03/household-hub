/**
 * PROTOTYPE (#402), throwaway: three layouts for "Paid from" on /import and the
 * transaction edit form, switched by `?variant=A|B|C`. State lives in memory only;
 * nothing is saved. Lives on branch prototype/402-paid-from, never merged.
 */
import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, MoreHorizontal, Wallet } from "lucide-react";
import { toast } from "sonner";
import { create } from "zustand";
import { Button } from "@/components/app/Button";
import { FormFooter, FormSheet } from "@/components/app/FormSheet";
import { Label } from "@/components/app/Label";
import { ListRow } from "@/components/app/ListRow";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/app/Popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import { StatusBadge } from "@/components/app/StatusBadge";
import { useAccounts } from "@/hooks/useAccounts";
import { isCreditCard } from "@/lib/accounts/events";
import { payingAccountChoices } from "@/lib/accounts/paying-account";
import type { AccountRow } from "@/lib/accounts/projection";
import { countOf } from "@/lib/utils";

export const VARIANTS = {
  A: "More menu, field in the grid",
  B: "Bottom bar, fact with Change",
  C: "Grouped list, account picker",
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

const usePaidFrom = create<{
  byDraft: Record<string, string>;
  set: (draftIds: string[], accountId: string) => void;
}>((setState) => ({
  byDraft: {},
  set: (draftIds, accountId) =>
    setState((state) => ({
      byDraft: { ...state.byDraft, ...Object.fromEntries(draftIds.map((id) => [id, accountId])) },
    })),
}));

/** The card's choices and the draft's account: its own, or the card's usual one. */
export function usePaidFromOf(card: AccountRow | undefined) {
  const accounts = useAccounts();
  const byDraft = usePaidFrom((state) => state.byDraft);
  const set = usePaidFrom((state) => state.set);
  const choices = card && accounts ? payingAccountChoices(accounts, card) : [];
  const usualId = card?.payingAccountId ?? choices[0]?.id ?? "";
  const idOf = (draftId: string) => byDraft[draftId] ?? usualId;
  const nameOf = (accountId: string) =>
    choices.find((account) => account.id === accountId)?.name ?? "No account";
  return { choices, usualId, idOf, nameOf, set };
}

function AccountSelect({
  id,
  choices,
  usualId,
  value,
  placeholder,
  onChange,
}: {
  id?: string;
  choices: AccountRow[];
  usualId: string;
  value: string | undefined;
  placeholder?: string;
  onChange: (accountId: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={id ? undefined : "Paid from"} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {choices.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
            {account.id === usualId && " (usual)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ---------- Row label ---------- */

export function PaidFromRowLabel({ draftId, card }: { draftId: string; card?: AccountRow }) {
  const variant = useVariant();
  const { idOf, usualId, nameOf } = usePaidFromOf(card);
  const accountId = idOf(draftId);
  if (variant === "C" || accountId === usualId) return null;
  return variant === "A" ? (
    <span>· Paid from {nameOf(accountId)}</span>
  ) : (
    <StatusBadge tone="outline" icon={Wallet}>
      {nameOf(accountId)}
    </StatusBadge>
  );
}

/* ---------- Selection action ---------- */

/** A: Discard moves into a More menu beside Save; "Paid from…" opens a sheet. */
export function MoreMenu({
  selectedIds,
  card,
  discardItems,
}: {
  selectedIds: string[];
  card?: AccountRow;
  discardItems: { label: string; disabled: boolean; onClick: () => void }[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" aria-label="More actions">
            <MoreHorizontal aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-56 flex-col p-1">
          <Button
            variant="ghost"
            className="justify-start"
            disabled={selectedIds.length === 0}
            onClick={() => {
              setMenuOpen(false);
              setSheetOpen(true);
            }}
          >
            Paid from…
          </Button>
          {discardItems.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              className="justify-start"
              disabled={item.disabled}
              onClick={() => {
                setMenuOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
      {sheetOpen && (
        <PaidFromSheet ids={selectedIds} card={card} onClose={() => setSheetOpen(false)} />
      )}
    </>
  );
}

function PaidFromSheet({
  ids,
  card,
  onClose,
}: {
  ids: string[];
  card?: AccountRow;
  onClose: () => void;
}) {
  const { choices, usualId, set } = usePaidFromOf(card);
  const [chosen, setChosen] = useState<string>();
  const drafts = countOf(ids.length, "draft", "drafts");
  return (
    <FormSheet
      title="Paid from"
      description={`Which account holds the Card Payment money for ${drafts}.`}
      onClose={onClose}
    >
      <div className="space-y-2">
        <Label htmlFor="paid-from-sheet">Paid from</Label>
        <AccountSelect
          id="paid-from-sheet"
          choices={choices}
          usualId={usualId}
          value={chosen}
          placeholder="Choose an account"
          onChange={setChosen}
        />
      </div>
      <FormFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={chosen === undefined}
          onClick={() => {
            if (chosen === undefined) return;
            set(ids, chosen);
            toast.success(`Set Paid from on ${drafts}`);
            onClose();
          }}
        >
          Set on {drafts}
        </Button>
      </FormFooter>
    </FormSheet>
  );
}

/** B: the selection's actions float in a bar at the bottom of the list. */
export function BottomSelectionBar({
  selectedIds,
  card,
  saveLabel,
  saveDisabled,
  onSave,
  discardLabel,
  onDiscard,
}: {
  selectedIds: string[];
  card?: AccountRow;
  saveLabel: string;
  saveDisabled: boolean;
  onSave: () => void;
  discardLabel: string;
  onDiscard: () => void;
}) {
  const { choices, usualId, set } = usePaidFromOf(card);
  if (selectedIds.length === 0) return null;
  const drafts = countOf(selectedIds.length, "draft", "drafts");
  return (
    <div
      role="toolbar"
      aria-label="Selected drafts"
      className="sticky bottom-[calc(var(--bottom-chrome)+0.5rem)] z-10 space-y-2 rounded-lg border bg-popover p-2 shadow-float"
    >
      <AccountSelect
        // Shows its placeholder again after each change.
        key={selectedIds.join()}
        choices={choices}
        usualId={usualId}
        value={undefined}
        placeholder={`Paid from… (${drafts})`}
        onChange={(accountId) => {
          set(selectedIds, accountId);
          toast.success(`Set Paid from on ${drafts}`);
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onDiscard}>
          {discardLabel}
        </Button>
        <Button size="sm" className="flex-1" disabled={saveDisabled} onClick={onSave}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

/** C: a second row under the toolbar moves the selection into another account's group. */
export function MoveToAccountRow({
  selectedIds,
  card,
}: {
  selectedIds: string[];
  card?: AccountRow;
}) {
  const { choices, usualId, set } = usePaidFromOf(card);
  const drafts = countOf(selectedIds.length, "draft", "drafts");
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-body text-muted-foreground">Move {drafts} to</span>
      <AccountSelect
        key={selectedIds.join()}
        choices={choices}
        usualId={usualId}
        value={undefined}
        placeholder="Paid from…"
        onChange={(accountId) => {
          set(selectedIds, accountId);
          toast.success(`Moved ${drafts}`);
        }}
      />
    </div>
  );
}

/** C: drafts grouped under the account that pays them, the usual one first. */
export function useGroupsByPaidFrom<T extends { id: string }>(drafts: T[], card?: AccountRow) {
  const { idOf, usualId, nameOf } = usePaidFromOf(card);
  const groups = new Map<string, T[]>([[usualId, []]]);
  for (const draft of drafts) {
    const accountId = idOf(draft.id);
    groups.set(accountId, [...(groups.get(accountId) ?? []), draft]);
  }
  return [...groups]
    .filter(([, list]) => list.length > 0)
    .map(([accountId, list]) => ({
      accountId,
      title: `Paid from ${nameOf(accountId)}${accountId === usualId ? " (usual)" : ""}`,
      drafts: list,
    }));
}

/* ---------- Draft detail ---------- */

/** A: a field in the form grid, beside Category. */
export function PaidFromGridField({ draftId, card }: { draftId: string; card?: AccountRow }) {
  const { choices, usualId, idOf, set } = usePaidFromOf(card);
  return (
    <div className="space-y-2">
      <Label htmlFor="draft-paid-from">Paid from</Label>
      <AccountSelect
        id="draft-paid-from"
        choices={choices}
        usualId={usualId}
        value={idOf(draftId)}
        onChange={(accountId) => set([draftId], accountId)}
      />
    </div>
  );
}

/** B: a fact under the statement's facts, with a Change button. */
export function PaidFromFact({ draftId, card }: { draftId: string; card?: AccountRow }) {
  const { choices, usualId, idOf, nameOf, set } = usePaidFromOf(card);
  const [changing, setChanging] = useState(false);
  const accountId = idOf(draftId);
  return (
    <>
      <dt className="self-center text-muted-foreground">Paid from</dt>
      <dd className="flex items-center gap-2">
        {changing ? (
          <AccountSelect
            choices={choices}
            usualId={usualId}
            value={accountId}
            onChange={(next) => {
              set([draftId], next);
              setChanging(false);
            }}
          />
        ) : (
          <>
            <span>
              {nameOf(accountId)}
              {accountId === usualId && <span className="text-muted-foreground"> (usual)</span>}
            </span>
            <Button
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

/** C: every account as a row to tap, the chosen one pressed. */
export function PaidFromPicker({ draftId, card }: { draftId: string; card?: AccountRow }) {
  const { choices, usualId, idOf, set } = usePaidFromOf(card);
  const accountId = idOf(draftId);
  return (
    <section aria-labelledby="draft-paid-from-title" className="space-y-2">
      <h3 id="draft-paid-from-title" className="text-label font-medium">
        Paid from
      </h3>
      <ul className="-mx-4 border-y">
        {choices.map((account) => (
          <li key={account.id} className="border-b last:border-b-0">
            <ListRow
              onClick={() => set([draftId], account.id)}
              pressed={account.id === accountId}
              label={account.name}
              detail={account.id === usualId ? "Usual for this card" : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Transaction edit form ---------- */

/** Shown under Account only while it is a card; a different card resets it to that card's usual one. */
export function PaidFromEditField({ account }: { account: AccountRow | undefined }) {
  const variant = useVariant();
  const card = account && isCreditCard(account) ? account : undefined;
  const { choices, usualId, nameOf } = usePaidFromOf(card);
  const [chosen, setChosen] = useState<{ cardId: string; accountId: string }>();
  const [changing, setChanging] = useState(false);
  if (!card) return null;
  const accountId = chosen?.cardId === card.id ? chosen.accountId : usualId;
  const choose = (next: string) => {
    setChosen({ cardId: card.id, accountId: next });
    setChanging(false);
  };

  if (variant === "B" && !changing) {
    return (
      <p className="flex items-center gap-2 text-body text-muted-foreground">
        Paid from {nameOf(accountId)}
        {accountId === usualId && " (usual)"}
        <Button size="sm" variant="link" className="h-auto p-0" onClick={() => setChanging(true)}>
          Change
        </Button>
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Label htmlFor="transaction-paid-from">Paid from</Label>
      <AccountSelect
        id="transaction-paid-from"
        choices={choices}
        usualId={usualId}
        value={accountId}
        onChange={choose}
      />
    </div>
  );
}

/* ---------- Switcher ---------- */

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
