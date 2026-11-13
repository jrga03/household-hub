import { listBudgets } from "@/lib/budgets/projection";
import { appendTogether } from "@/lib/events/log";
import { checkedName } from "@/lib/events/names";
import type { Ownership } from "@/lib/events/ownership";
import {
  PAYDAY_CREATED,
  PAYDAY_DELETED,
  PAYDAY_ENTITY,
  PAYDAY_RENAMED,
  PAYDAY_REORDERED,
  PAYDAY_VERSIONS,
} from "@/lib/paydays/events";
import { readPaydays, type PaydayRow } from "@/lib/paydays/projection";
import { requestSync } from "@/lib/sync/triggers";
import type { Actor } from "./accounts";
import { appenderFor } from "./append";

const HOUSEHOLD: Ownership = { visibility: "household", ownerUserId: null };

const appendPaydayEvent = appenderFor(PAYDAY_ENTITY, PAYDAY_VERSIONS);

export async function requirePayday(paydayId: string): Promise<PaydayRow> {
  const payday = (await readPaydays()).find((candidate) => candidate.id === paydayId);
  if (!payday) throw new Error("That payday no longer exists.");
  return payday;
}

/** Paydays are household-wide (ADR 0014), so they have no visibility to choose. */
export async function addPayday(actor: Actor, input: string): Promise<{ id: string }> {
  const name = checkedName(input, "payday");
  const last = (await readPaydays()).at(-1);
  const id = crypto.randomUUID();
  await appendPaydayEvent(actor, { ...HOUSEHOLD, id }, PAYDAY_CREATED, {
    name,
    position: last ? last.position + 1 : 0,
  });
  requestSync();
  return { id };
}

export async function renamePayday(actor: Actor, paydayId: string, input: string): Promise<void> {
  const name = checkedName(input, "payday");
  await requirePayday(paydayId);
  await appendPaydayEvent(actor, { ...HOUSEHOLD, id: paydayId }, PAYDAY_RENAMED, { name });
  requestSync();
}

/** Renumbers the paydays in their new order, writing only the positions that change. */
export async function movePayday(
  actor: Actor,
  paydayId: string,
  direction: "up" | "down"
): Promise<void> {
  const paydays = await readPaydays();
  const from = paydays.findIndex((payday) => payday.id === paydayId);
  if (from === -1) throw new Error("That payday no longer exists.");
  const to = direction === "up" ? from - 1 : from + 1;
  const moving = paydays[from];
  const neighbour = paydays[to];
  if (!moving || !neighbour) return;

  const reordered = paydays.with(from, neighbour).with(to, moving);
  await appendTogether(async () => {
    for (const [position, payday] of reordered.entries()) {
      if (payday.position === position) continue;
      await appendPaydayEvent(actor, { ...HOUSEHOLD, id: payday.id }, PAYDAY_REORDERED, {
        position,
      });
    }
  });
  requestSync();
}

/** A payday no budget ever named deletes directly (ADR 0014). */
export async function deletePayday(actor: Actor, paydayId: string): Promise<void> {
  const payday = await requirePayday(paydayId);
  const named = (await listBudgets()).some((budget) =>
    budget.portions.some((portion) => portion.paydayId === paydayId)
  );
  if (named) throw new Error(`A budget has a portion on ${payday.name}, so it can't be deleted.`);
  await appendPaydayEvent(actor, { ...HOUSEHOLD, id: paydayId }, PAYDAY_DELETED, {});
  requestSync();
}
