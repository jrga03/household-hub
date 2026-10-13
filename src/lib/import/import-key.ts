import type { StatementFormatId, StatementLine } from "./statement";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type KeyedLine = StatementLine & { importKey: string };

/**
 * Each line with its import key, in statement order (ADR 0008): a hash of the format,
 * the account, the purchase date, the raw description and the amount, plus
 * how many identical lines came before it. Re-reading the statement gives the
 * same keys; two genuine identical lines get different ones.
 */
export function withImportKeys(
  formatId: StatementFormatId,
  accountId: string,
  lines: StatementLine[]
): Promise<KeyedLine[]> {
  const seen = new Map<string, number>();
  return Promise.all(
    lines.map(async (line) => {
      const identity = JSON.stringify([
        formatId,
        accountId,
        line.purchaseDate,
        line.description,
        line.amount,
      ]);
      const occurrence = seen.get(identity) ?? 0;
      seen.set(identity, occurrence + 1);
      return { ...line, importKey: await sha256Hex(`${identity}#${occurrence}`) };
    })
  );
}
