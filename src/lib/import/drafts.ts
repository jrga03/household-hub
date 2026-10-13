/**
 * Drafts and Imports (ADR 0008): statement lines held on this device for
 * review, outside the event log. Only a saved draft becomes a record, through
 * the save-drafts command.
 */
import { db } from "@/lib/dexie/db";
import { DESCRIPTION_MAX_LENGTH, type TransactionType } from "@/lib/transactions/events";
import { withImportKeys } from "./import-key";
import type { StatementFormatId, StatementLine } from "./statement";

export type SuggestionSource = "history" | "llm";

/** The drafts read from one statement file, all for one account. */
export interface ImportRow {
  id: string;
  formatId: StatementFormatId;
  fileName: string;
  accountId: string;
  /** ISO timestamp. */
  importedAt: string;
}

export interface DraftRow {
  id: string;
  importId: string;
  /** The line's place in the statement. */
  position: number;
  /** As read; the import key and the dates come from it, whatever is edited. */
  line: StatementLine;
  importKey: string;
  description: string;
  descriptionSource: "statement" | "member" | SuggestionSource;
  /** Null for Unassigned. */
  categoryId: string | null;
  /** Null while nothing chose it; a suggestion never replaces the member's choice. */
  categorySource: "member" | SuggestionSource | null;
  type: TransactionType;
}

const LAST_CARD_PREFIX = "importCard:";
const lastCardKey = (formatId: StatementFormatId) => `${LAST_CARD_PREFIX}${formatId}` as const;

export interface NewImport {
  formatId: StatementFormatId;
  fileName: string;
  accountId: string;
  lines: StatementLine[];
}

/** Holds a statement's lines as drafts, and remembers the card for the format's next file. */
export async function createImport({
  formatId,
  fileName,
  accountId,
  lines,
}: NewImport): Promise<string> {
  if (lines.length === 0) throw new Error("This statement has no lines to import.");
  const keyed = await withImportKeys(formatId, accountId, lines);
  const importId = crypto.randomUUID();
  const drafts = keyed.map(({ importKey, ...line }, position): DraftRow => ({
    id: crypto.randomUUID(),
    importId,
    position,
    line,
    importKey,
    description: line.description.slice(0, DESCRIPTION_MAX_LENGTH),
    descriptionSource: "statement",
    categoryId: null,
    categorySource: null,
    type: line.type,
  }));
  await db.transaction("rw", [db.imports, db.drafts, db.meta], async () => {
    await db.imports.add({
      id: importId,
      formatId,
      fileName,
      accountId,
      importedAt: new Date().toISOString(),
    });
    await db.drafts.bulkAdd(drafts);
    await db.meta.put({ key: lastCardKey(formatId), value: accountId });
  });
  return importId;
}

/** The card last imported into with this format on this device. */
export async function readLastImportCard(formatId: StatementFormatId): Promise<string | undefined> {
  const stored = (await db.meta.get(lastCardKey(formatId)))?.value;
  return typeof stored === "string" ? stored : undefined;
}

export interface DraftChanges {
  description?: string;
  categoryId?: string | null;
  type?: TransactionType;
}

/** What the member sets is theirs: no suggestion replaces it, and it's no longer marked suggested. */
export async function editDraft(draftId: string, changes: DraftChanges): Promise<void> {
  const update: Partial<DraftRow> = {};
  if (changes.description !== undefined) {
    update.description = changes.description.trim().slice(0, DESCRIPTION_MAX_LENGTH);
    update.descriptionSource = "member";
  }
  if (changes.categoryId !== undefined) {
    update.categoryId = changes.categoryId;
    update.categorySource = "member";
  }
  if (changes.type !== undefined) update.type = changes.type;
  await db.drafts.update(draftId, update);
}

/**
 * Deletes drafts, and any import left empty. Saving calls it inside its
 * change, so the drafts go only if the transactions are kept.
 */
export function removeDrafts(draftIds: string[]): Promise<void> {
  return db.transaction("rw", [db.imports, db.drafts], async () => {
    const drafts = await db.drafts.bulkGet(draftIds);
    await db.drafts.bulkDelete(draftIds);
    const importIds = new Set(drafts.flatMap((draft) => (draft ? [draft.importId] : [])));
    for (const importId of importIds) {
      if ((await db.drafts.where("importId").equals(importId).count()) === 0) {
        await db.imports.delete(importId);
      }
    }
  });
}

export const discardDrafts = removeDrafts;

/** Statement order. */
export const listDrafts = (importId: string) =>
  db.drafts.where("importId").equals(importId).sortBy("position");

/** Newest first. */
export async function listImports(): Promise<ImportRow[]> {
  const imports = await db.imports.toArray();
  return imports.sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
}

/** For the sign-out warning: drafts are lost with the device's data. */
export const countDrafts = () => db.drafts.count();

/** A household switch forgets every draft and remembered card, like remembered passwords. */
export async function forgetAllDrafts(): Promise<void> {
  await db.drafts.clear();
  await db.imports.clear();
  await db.meta.where("key").startsWith(LAST_CARD_PREFIX).delete();
}
