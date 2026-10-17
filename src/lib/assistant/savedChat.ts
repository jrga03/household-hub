/**
 * Each member's current chat, saved on this device so a reload keeps it (ADR 0010).
 * Local scratch outside the event log: never synced, wiped by the sign-out reset.
 */

import { db } from "@/lib/dexie/db";
import { isWaiting, type ChatItem, type ProposalItem } from "./conversation";

/** A card saved before cards carried their transaction's id (#156). */
type CardWithoutId = Omit<ProposalItem, "transactionId"> & { transactionId?: undefined };

export interface SavedChatRow {
  userId: string;
  items: (ChatItem | CardWithoutId)[];
  /** When the chat last changed, as an ISO timestamp. */
  updatedAt: string;
}

export interface SavedChat {
  items: ChatItem[];
  updatedAt: Date;
}

export async function loadChat(userId: string): Promise<SavedChat | null> {
  const row = await db.assistantChats.get(userId);
  if (!row) return null;
  const items = row.items.map((item): ChatItem =>
    item.kind === "proposal" && item.transactionId === undefined
      ? { ...item, transactionId: crypto.randomUUID() }
      : item
  );
  // Saved before the card can be confirmed, so a reload gives it the same id again.
  if (row.items.some((item, index) => item !== items[index])) {
    await db.assistantChats.put({ ...row, items });
  }
  return { items, updatedAt: new Date(row.updatedAt) };
}

export async function saveChat(userId: string, items: ChatItem[], updatedAt: Date): Promise<void> {
  await db.assistantChats.put({ userId, items, updatedAt: updatedAt.toISOString() });
}

export async function forgetChat(userId: string): Promise<void> {
  await db.assistantChats.delete(userId);
}

const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;

/** A chat left 12 hours or more starts fresh, unless a card still waits for the member. */
export const hasGoneIdle = ({ items, updatedAt }: SavedChat, now: Date) =>
  now.getTime() - updatedAt.getTime() >= IDLE_LIMIT_MS && !items.some(isWaiting);
