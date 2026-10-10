import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AccountRow } from "@/lib/accounts/projection";
import { editAccount, retireAccount, type Actor } from "@/lib/commands/accounts";
import { AccountDetailsFields, readAccountDetails } from "./AccountDetailsFields";
import { FormError } from "@/components/ui/form-error";
import { errorMessage } from "@/lib/utils";

const VISIBILITY_SUMMARY = {
  household: "Household: every member sees it.",
  personal: "Personal: only you see it.",
};

export function EditAccountDialog({
  actor,
  account,
  onClose,
}: {
  actor: Actor;
  account: AccountRow;
  onClose: () => void;
}) {
  const [error, saveAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const { input, error: readError } = readAccountDetails(formData);
      if (readError !== null) return readError;
      try {
        await editAccount(actor, account.id, input);
        toast.success("Account saved");
        onClose();
        return null;
      } catch (caught) {
        return errorMessage(caught, "Couldn't save the account.");
      }
    },
    null
  );
  const [retiring, startRetiring] = useTransition();

  const retire = () =>
    startRetiring(async () => {
      try {
        await retireAccount(actor, account.id);
        toast.success(`${account.name} retired`);
        onClose();
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't retire the account."));
      }
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="@container">
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>
            Changes reach your household&apos;s other devices when they sync.
          </DialogDescription>
        </DialogHeader>
        <form action={saveAction} className="space-y-4" aria-label="Edit account">
          <AccountDetailsFields idPrefix="edit-account" defaults={account} />
          <div className="space-y-1">
            <p className="text-sm font-medium">Who sees it</p>
            <p className="text-sm text-muted-foreground">
              {VISIBILITY_SUMMARY[account.visibility]} Visibility can&apos;t be changed.
            </p>
          </div>
          <FormError>{error}</FormError>
          <DialogFooter className="gap-2 @[480px]:justify-between">
            <Button type="button" variant="outline" onClick={retire} disabled={retiring}>
              Retire account
            </Button>
            <SubmitButton pendingText="Saving...">Save</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
