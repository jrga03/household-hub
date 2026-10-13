interface NamedTransfer {
  description: string;
  fromAccountId: string;
  toAccountId: string;
}

/**
 * The transfer's description, or "Transfer to BPI" when it has none:
 * "Transfer from BDO" when the list is filtered to the account it went into.
 */
export function transferName(
  transfer: NamedTransfer,
  accountNameOf: (accountId: string) => string,
  direction: "in" | "out" | null
): string {
  if (transfer.description) return transfer.description;
  return direction === "in"
    ? `Transfer from ${accountNameOf(transfer.fromAccountId)}`
    : `Transfer to ${accountNameOf(transfer.toAccountId)}`;
}
