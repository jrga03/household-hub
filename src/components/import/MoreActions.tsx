import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/app/Button";
import { FormFooter, FormSheet } from "@/components/app/FormSheet";
import { Label } from "@/components/app/Label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/app/Popover";
import { PaidFromSelect } from "@/components/transactions/PaidFromSelect";
import type { AccountRow } from "@/lib/accounts/projection";
import { setDraftsPaidFrom } from "@/lib/import/drafts";
import { countOf, errorMessage } from "@/lib/utils";

export interface MenuAction {
  label: string;
  disabled: boolean;
  onClick: () => void;
}

/** The selection bar's "⋯": Paid from… for the savable selection, then the discards. */
export function MoreActions({
  paidFromIds,
  card,
  actions,
}: {
  paidFromIds: string[];
  card: AccountRow | undefined;
  actions: MenuAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const items: MenuAction[] = [
    { label: "Paid from…", disabled: paidFromIds.length === 0, onClick: () => setSheetOpen(true) },
    ...actions,
  ];
  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" aria-label="More actions">
            <MoreHorizontal aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-56 flex-col p-1">
          {items.map((item) => (
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
        <PaidFromSheet draftIds={paidFromIds} card={card} onClose={() => setSheetOpen(false)} />
      )}
    </>
  );
}

function PaidFromSheet({
  draftIds,
  card,
  onClose,
}: {
  draftIds: string[];
  card: AccountRow | undefined;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string>();
  const drafts = countOf(draftIds.length, "draft", "drafts");
  const set = async (accountId: string) => {
    try {
      await setDraftsPaidFrom(draftIds, accountId);
      toast.success(`Set Paid from on ${drafts}`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't change the drafts."));
    }
  };
  return (
    <FormSheet
      title="Paid from"
      description={`Which account's Card Payment money holds ${drafts}.`}
      onClose={onClose}
    >
      <div className="space-y-2">
        <Label htmlFor="drafts-paid-from">Paid from</Label>
        <PaidFromSelect
          id="drafts-paid-from"
          card={card}
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
          onClick={() => chosen !== undefined && void set(chosen)}
        >
          Set on {drafts}
        </Button>
      </FormFooter>
    </FormSheet>
  );
}
