import { useState } from "react";
import { AllocationForm } from "@/components/allocations/AllocationForm";
import { FormSheet, FULL_ROW } from "@/components/app/FormSheet";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { DirectionChoice } from "@/components/transactions/EntryFields";
import { TransferForm } from "@/components/transactions/TransferForm";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useAccountMoney } from "@/hooks/useTransactions";
import type { AllocationRow } from "@/lib/allocations/projection";
import type { Actor } from "@/lib/commands/accounts";
import type { Cents } from "@/lib/currency";
import { TRANSFER_TYPE, type EntryDirection } from "@/lib/transactions/filter";
import type { TransferRow } from "@/lib/transfers/projection";

/** A transfer moves money between accounts; an allocation, between categories in one account. */
type MoveType = "accounts" | "categories";

const MOVE_TYPES = [
  { value: "accounts", label: "Between accounts" },
  { value: "categories", label: "Between categories" },
] as const satisfies readonly { value: MoveType; label: string }[];

interface MoveProps {
  actor: Actor;
  /** A saved transfer opens as itself, with no type switch. */
  transfer?: TransferRow;
  /** A saved allocation opens as itself, with no type switch. */
  allocation?: AllocationRow;
  /** Where a new move starts. */
  initialType?: MoveType;
  /** A new allocation's account, when it's one of the choices. */
  initialAccountId?: string;
  onClose: () => void;
}

/** Every read the form needs, or null until all have arrived. */
function useMoveMoneyData() {
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  const money = useAccountMoney();
  if (!accounts || !retiredAccounts || !categories || !money) return null;
  return { accounts, retiredAccounts, categories, money };
}

type MoveMoneyData = NonNullable<ReturnType<typeof useMoveMoneyData>>;

type FormProps = MoveProps & {
  draftAmount?: Cents;
  /** Offered for a new entry, so it can become an expense or income, carrying the amount typed. */
  onDirectionChange?: (direction: EntryDirection, amount: Cents | undefined) => void;
};

/** Opens once its reads have arrived, so the sheet never fills in after it shows. */
export function MoveMoneyDialog(props: MoveProps) {
  const data = useMoveMoneyData();
  if (!data) return null;
  const title = props.transfer
    ? "Edit transfer"
    : props.allocation
      ? "Edit allocation"
      : "Move money";
  return (
    <FormSheet title={title} onClose={props.onClose}>
      <MoveMoneyFields {...props} data={data} />
    </FormSheet>
  );
}

/** The form alone, for the Add transaction dialog's Transfer choice. */
export function MoveMoneyForm(props: FormProps) {
  const data = useMoveMoneyData();
  return data && <MoveMoneyFields {...props} data={data} />;
}

function MoveMoneyFields({
  actor,
  transfer,
  allocation,
  initialType = "accounts",
  initialAccountId,
  draftAmount,
  onDirectionChange,
  onClose,
  data: { accounts, retiredAccounts, categories, money },
}: FormProps & { data: MoveMoneyData }) {
  const [type, setType] = useState<MoveType>(
    transfer ? "accounts" : allocation ? "categories" : initialType
  );
  // The amount typed so far follows a switch of type.
  const [amount, setAmount] = useState(
    transfer?.amountCents ?? allocation?.amountCents ?? draftAmount
  );

  const choices = !transfer && !allocation && (
    <>
      {onDirectionChange && (
        <DirectionChoice
          value={TRANSFER_TYPE}
          withTransfer
          onChange={(next) => next !== TRANSFER_TYPE && onDirectionChange(next, amount)}
        />
      )}
      <div className={FULL_ROW}>
        <SegmentedControl<MoveType>
          label="Between accounts or categories"
          options={MOVE_TYPES}
          value={type}
          onChange={setType}
          className="grid w-full grid-cols-2"
        />
      </div>
    </>
  );
  const shared = {
    actor,
    accounts,
    retiredAccounts,
    categories,
    amount,
    onAmountChange: setAmount,
    choices,
    onClose,
  };

  return type === "accounts" ? (
    <TransferForm {...shared} transfer={transfer} />
  ) : (
    <AllocationForm
      {...shared}
      allocation={allocation}
      initialAccountId={initialAccountId}
      money={money}
    />
  );
}
