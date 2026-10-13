import type { StatementFormat } from "./statement";

export const BDO_CREDIT_CARD_PDF: StatementFormat = {
  id: "bdo-credit-card-pdf",
  label: "BDO credit card (PDF)",
  accept: "application/pdf,.pdf",
  password: "fixed",
};

/** The formats a statement can be imported from; their parsers load in the import worker. */
export const STATEMENT_FORMATS: StatementFormat[] = [BDO_CREDIT_CARD_PDF];
