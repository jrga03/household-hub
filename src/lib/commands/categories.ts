import type { Envelope } from "@/lib/allocations/events";
import { absCents, formatPHP, sumCents, type Cents } from "@/lib/currency";
import { appendTogether } from "@/lib/events/log";
import { isVisibility, VISIBILITY_LABELS, type Ownership } from "@/lib/events/ownership";
import { readAccountMoney, sumCategoryMoney } from "@/lib/transactions/money";
import { requestSync } from "@/lib/sync/triggers";
import {
  CATEGORY_CREATED,
  CATEGORY_ENTITY,
  CATEGORY_MOVED,
  CATEGORY_RENAMED,
  CATEGORY_RETIRED,
  CATEGORY_UNRETIRED,
  CATEGORY_VERSIONS,
  checkCategoryName,
  type RecordNoun,
  GROUP_CREATED,
  GROUP_ENTITY,
  GROUP_RENAMED,
  GROUP_RETIRED,
  GROUP_UNRETIRED,
  GROUP_VERSIONS,
} from "@/lib/categories/events";
import { DEFAULT_GROUPS, defaultCategoryId, defaultGroupId } from "@/lib/categories/defaults";
import {
  canHold,
  getCategory,
  getGroup,
  listCategoriesInGroup,
  type CategoryRow,
  type GroupRow,
} from "@/lib/categories/projection";
import type { Actor } from "./accounts";
import { addAllocation } from "./allocations";
import { appenderFor } from "./append";
import { requireCategory } from "./records";

const HOUSEHOLD: Ownership = { visibility: "household", ownerUserId: null };

const appendGroupEvent = appenderFor(GROUP_ENTITY, GROUP_VERSIONS);
const appendCategoryEvent = appenderFor(CATEGORY_ENTITY, CATEGORY_VERSIONS);

/**
 * Adds the suggested Household groups and categories. Their IDs come from the
 * household, so a second member seeding offline makes the same records and the
 * projection keeps one of each. Defaults this device already holds are skipped.
 */
export async function seedDefaultCategories(actor: Actor): Promise<void> {
  for (const group of DEFAULT_GROUPS) {
    const groupId = await defaultGroupId(actor.householdId, group.key);
    if (!(await getGroup(groupId))) {
      await appendGroupEvent(actor, { ...HOUSEHOLD, id: groupId }, GROUP_CREATED, {
        name: group.name,
      });
    }
    for (const name of group.categories) {
      const categoryId = await defaultCategoryId(actor.householdId, name);
      if (await getCategory(categoryId)) continue;
      await appendCategoryEvent(actor, { ...HOUSEHOLD, id: categoryId }, CATEGORY_CREATED, {
        name,
        groupId,
      });
    }
  }
  requestSync();
}

function checkedName(input: string, noun: RecordNoun): string {
  const { name, problem } = checkCategoryName(input, noun);
  if (problem !== null) throw new Error(problem);
  return name;
}

async function requireGroup(groupId: string): Promise<GroupRow> {
  const group = await getGroup(groupId);
  if (!group) throw new Error("That group no longer exists.");
  return group;
}

function refuseRetired(group: GroupRow | CategoryRow | undefined): void {
  if (group?.retired) throw new Error(`${group.name} is retired. Unretire it first.`);
}

/** Household unless the member deliberately chooses Personal; fixed once created (ADR 0005). */
export async function createGroup(
  actor: Actor,
  input: { name: string; visibility?: string }
): Promise<{ id: string }> {
  const name = checkedName(input.name, "group");
  const visibility = input.visibility ?? "household";
  if (!isVisibility(visibility)) throw new Error("Choose Household or Personal.");
  const ownerUserId = visibility === "personal" ? actor.userId : null;

  const id = crypto.randomUUID();
  await appendGroupEvent(actor, { id, visibility, ownerUserId }, GROUP_CREATED, { name });
  requestSync();
  return { id };
}

export async function renameGroup(actor: Actor, groupId: string, input: string): Promise<void> {
  const name = checkedName(input, "group");
  const group = await requireGroup(groupId);
  await appendGroupEvent(actor, group, GROUP_RENAMED, { name });
  requestSync();
}

const conjunction = new Intl.ListFormat("en", { type: "conjunction" });

/** A group holds no money of its own, so it retires once nothing in it is in use. */
export async function retireGroup(actor: Actor, groupId: string): Promise<void> {
  const group = await requireGroup(groupId);
  const inUse = await listCategoriesInGroup(group.id);
  if (inUse.length > 0) {
    const names = inUse.map((category) => category.name).sort((a, b) => a.localeCompare(b));
    throw new Error(`Retire ${conjunction.format(names)} first.`);
  }
  await appendGroupEvent(actor, group, GROUP_RETIRED, {});
  requestSync();
}

export async function unretireGroup(actor: Actor, groupId: string): Promise<void> {
  const group = await requireGroup(groupId);
  await appendGroupEvent(actor, group, GROUP_UNRETIRED, {});
  requestSync();
}

/** The category takes its group's visibility and owner, fixed from then on (ADR 0005). */
export async function createCategory(
  actor: Actor,
  input: { name: string; groupId: string }
): Promise<{ id: string }> {
  const name = checkedName(input.name, "category");
  const group = await requireGroup(input.groupId);
  refuseRetired(group);

  const id = crypto.randomUUID();
  await appendCategoryEvent(actor, { ...group, id }, CATEGORY_CREATED, { name, groupId: group.id });
  requestSync();
  return { id };
}

export async function renameCategory(
  actor: Actor,
  categoryId: string,
  input: string
): Promise<void> {
  const name = checkedName(input, "category");
  const category = await requireCategory(categoryId);
  await appendCategoryEvent(actor, category, CATEGORY_RENAMED, { name });
  requestSync();
}

/** Only to a group in use seen by the same people; resolved apart from the name, so both survive. */
export async function moveCategory(
  actor: Actor,
  categoryId: string,
  groupId: string
): Promise<void> {
  const category = await requireCategory(categoryId);
  const group = await requireGroup(groupId);
  if (!canHold(group, category)) {
    throw new Error(`Choose a ${VISIBILITY_LABELS[category.visibility]} group.`);
  }
  refuseRetired(group);
  await appendCategoryEvent(actor, category, CATEGORY_MOVED, { groupId: group.id });
  requestSync();
}

export interface MoneyDestination {
  toCategoryId: string;
  /** The allocations' date, the member's local date "yyyy-MM-dd". */
  date: string;
}

/**
 * Hidden from pickers and kept under Retired; its history stays. Money it
 * holds in each account first moves into `destination` (money it owes moves
 * back from it), as one change with the retire.
 */
export function retireCategory(
  actor: Actor,
  categoryId: string,
  destination?: MoneyDestination
): Promise<void> {
  return appendTogether(async () => {
    const category = await requireCategory(categoryId);
    const held = [
      ...(sumCategoryMoney(await readAccountMoney()).get(categoryId)?.byAccount ?? []),
    ].filter(([, cents]) => cents !== 0);
    if (held.length > 0) {
      if (!destination) {
        const total = sumCents(held.map(([, cents]) => cents));
        throw new Error(
          `${category.name} holds ${formatPHP(total)}. Choose a category to move it into.`
        );
      }
      await moveAllMoney(actor, category, held, destination);
    }
    await appendCategoryEvent(actor, category, CATEGORY_RETIRED, {});
    requestSync();
  });
}

async function moveAllMoney(
  actor: Actor,
  category: CategoryRow,
  held: [accountId: string, cents: Cents][],
  { toCategoryId, date }: MoneyDestination
): Promise<void> {
  if (toCategoryId === category.id) {
    throw new Error(`Choose another category to move ${category.name}' money into.`);
  }
  refuseRetired(await requireCategory(toCategoryId));
  const retiring: Envelope = { kind: "category", id: category.id };
  const receiving: Envelope = { kind: "category", id: toCategoryId };
  for (const [accountId, cents] of held) {
    await addAllocation(actor, {
      date,
      accountId,
      amountCents: absCents(cents),
      from: cents > 0 ? retiring : receiving,
      to: cents > 0 ? receiving : retiring,
    });
  }
}

/** Comes back only into a group in use, so no category in use sits in a retired group. */
export async function unretireCategory(actor: Actor, categoryId: string): Promise<void> {
  const category = await requireCategory(categoryId);
  refuseRetired(await getGroup(category.groupId));
  await appendCategoryEvent(actor, category, CATEGORY_UNRETIRED, {});
  requestSync();
}
