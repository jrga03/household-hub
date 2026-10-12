import { errorMessage } from "@/lib/utils";

export interface BulkResult {
  changed: string[];
  failed: { id: string; reason: string }[];
}

/**
 * Runs a single-record command on each record in turn, one event each,
 * skipping those already as asked: a re-sent change carries a later HLC and
 * would undo another device's. A record that fails is reported, not thrown.
 */
export async function changeEach<Row>(
  ids: string[],
  read: (id: string) => Promise<Row>,
  isAlready: (row: Row) => boolean,
  change: (row: Row) => Promise<void>
): Promise<BulkResult> {
  const result: BulkResult = { changed: [], failed: [] };
  for (const id of ids) {
    try {
      const row = await read(id);
      if (isAlready(row)) continue;
      await change(row);
      result.changed.push(id);
    } catch (caught) {
      result.failed.push({ id, reason: errorMessage(caught, "Couldn't change it.") });
    }
  }
  return result;
}
