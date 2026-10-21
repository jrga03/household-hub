import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/ui/action-form";
import { advanceOnEnter, FormFooter, FormSheet } from "@/components/app/FormSheet";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ACCOUNT_TYPES, CREDIT_CARD, isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { editAccount, retireAccount, type Actor } from "@/lib/commands/accounts";
import { AccountDetailsFields, readAccountDetails } from "./AccountDetailsFields";
import { FormError } from "@/components/ui/form-error";
import { errorMessage } from "@/lib/utils";

const NON_CARD_TYPES = ACCOUNT_TYPES.filter((type) => type !== CREDIT_CARD);

const VISIBILITY_SUMMARY = {
  household: "Household: every member sees it.",
  personal: "Personal: only you see it.",
};

export function EditAccountDialog({
  actor,
  account,
  onCorrectBalance,
  onClose,
}: {
  actor: Actor;
  account: AccountRow;
  onCorrectBalance: () => void;
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
    <FormSheet
      title="Edit account"
      description="Changes reach your household's other devices when they sync."
      onClose={onClose}
    >
      <ActionForm
        ref={advanceOnEnter}
        action={saveAction}
        className="space-y-4"
        aria-label="Edit account"
      >
        <AccountDetailsFields
          idPrefix="edit-account"
          types={isCreditCard(account) ? [CREDIT_CARD] : NON_CARD_TYPES}
          ownership={account}
          defaults={account}
        />
        <p className="text-body text-muted-foreground">
          Balance drifted from the bank&apos;s? Use{" "}
          <Button type="button" variant="link" className="h-auto p-0" onClick={onCorrectBalance}>
            Correct balance
          </Button>{" "}
          instead of changing the starting balance.
        </p>
        <div className="space-y-1">
          <p className="text-label">Who sees it</p>
          <p className="text-body text-muted-foreground">
            {VISIBILITY_SUMMARY[account.visibility]} Visibility can&apos;t be changed.
          </p>
        </div>
        <FormError>{error}</FormError>
        <FormFooter destructive={{ label: "Retire account", onClick: retire, disabled: retiring }}>
          <SubmitButton pendingText="Saving...">Save</SubmitButton>
        </FormFooter>
      </ActionForm>
    </FormSheet>
  );
}
