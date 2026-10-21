import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { Button } from "@/components/app/Button";
import { FormError } from "@/components/app/FormError";
import { advanceOnEnter, FormFooter, FormSheet } from "@/components/app/FormSheet";
import { SubmitButton } from "@/components/app/SubmitButton";
import { ACCOUNT_TYPES, CREDIT_CARD, isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { editAccount, retireAccount, type Actor } from "@/lib/commands/accounts";
import { errorMessage } from "@/lib/utils";
import { AccountDetailsFields, readAccountDetails } from "./AccountDetailsFields";

const NON_CARD_TYPES = ACCOUNT_TYPES.filter((type) => type !== CREDIT_CARD);

const VISIBILITY_SUMMARY = {
  household: "Household: every member sees it.",
  personal: "Personal: only you see it.",
};

interface SaveState {
  startingBalanceError?: string;
  error: string | null;
}

export function EditAccountDialog({
  actor,
  account,
  onCorrectBalance,
  onRetired,
  onClose,
}: {
  actor: Actor;
  account: AccountRow;
  onCorrectBalance: () => void;
  onRetired: () => void;
  onClose: () => void;
}) {
  const [state, saveAction] = useActionState(
    async (_previous: SaveState, formData: FormData): Promise<SaveState> => {
      const { input, startingBalanceError } = readAccountDetails(formData);
      if (startingBalanceError !== null) return { startingBalanceError, error: null };
      try {
        await editAccount(actor, account.id, input);
        toast.success("Account saved");
        onClose();
        return { error: null };
      } catch (caught) {
        return { error: errorMessage(caught, "Couldn't save the account.") };
      }
    },
    { error: null }
  );
  const [retiring, startRetiring] = useTransition();

  const retire = () =>
    startRetiring(async () => {
      try {
        await retireAccount(actor, account.id);
        toast.success(`${account.name} retired`);
        onClose();
        onRetired();
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
        noValidate
        className="space-y-4"
        aria-label="Edit account"
      >
        <AccountDetailsFields
          types={isCreditCard(account) ? [CREDIT_CARD] : NON_CARD_TYPES}
          ownership={account}
          defaults={account}
          startingBalanceError={state.startingBalanceError}
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
        <FormError>{state.error}</FormError>
        <FormFooter destructive={{ label: "Retire account", onClick: retire, disabled: retiring }}>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </FormFooter>
      </ActionForm>
    </FormSheet>
  );
}
