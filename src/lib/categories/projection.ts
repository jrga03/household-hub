import { db } from "@/lib/dexie/db";
import type { LoggedEvent } from "@/lib/events/log";
import { sameOwnership, type Ownership, type Visibility } from "@/lib/events/ownership";
import type { EntityProjection } from "@/lib/events/projector";
import {
  CATEGORY_CREATED,
  CATEGORY_ENTITY,
  CATEGORY_VERSIONS,
  decodeCategoryCreated,
  decodeCategoryMoved,
  decodeCategoryRenamed,
  decodeGroupName,
  decodeRetirement,
  describeCategoryEvent,
  GROUP_CREATED,
  GROUP_ENTITY,
  GROUP_VERSIONS,
} from "./events";

interface CategoryRecord extends Ownership {
  id: string;
  householdId: string;
  visibility: Visibility;
  name: string;
  /** Hidden from the main list and pickers, kept under Retired; resolved apart from the name. */
  retired: boolean;
}

export type GroupRow = CategoryRecord;

export interface CategoryRow extends CategoryRecord {
  groupId: string;
}

/**
 * The earliest create fixes the record, its visibility and owner (ADR 0005).
 * Seeded defaults share IDs across devices, so a later create of the same ID
 * is a second seed, not an edit, and must not undo a rename or move.
 */
function foldRecord<Row extends CategoryRecord>(
  creationType: string,
  create: (event: LoggedEvent) => Row | null,
  change: (row: Row, event: LoggedEvent) => Row
) {
  return (row: Row | null, event: LoggedEvent): Row | null => {
    if (!row) return event.eventType === creationType ? create(event) : null;
    if (event.eventType === creationType || !sameOwnership(event, row)) return row;
    const retired = decodeRetirement(event);
    return retired === null ? change(row, event) : { ...row, retired };
  };
}

const recordFields = (event: LoggedEvent) => ({
  id: event.entityId,
  householdId: event.householdId,
  visibility: event.visibility,
  ownerUserId: event.ownerUserId,
  retired: false,
});

const applyGroupEvent = foldRecord<GroupRow>(
  GROUP_CREATED,
  (event) => {
    const name = decodeGroupName(event);
    return name === null ? null : { ...recordFields(event), name };
  },
  (group, event) => {
    const name = decodeGroupName(event);
    return name === null ? group : { ...group, name };
  }
);

const applyCategoryEvent = foldRecord<CategoryRow>(
  CATEGORY_CREATED,
  (event) => {
    const created = decodeCategoryCreated(event);
    return created && { ...recordFields(event), ...created };
  },
  (category, event) => {
    const name = decodeCategoryRenamed(event);
    if (name !== null) return { ...category, name };
    const groupId = decodeCategoryMoved(event);
    return groupId === null ? category : { ...category, groupId };
  }
);

export const groupProjection: EntityProjection<GroupRow> = {
  entityType: GROUP_ENTITY,
  table: db.categoryGroups,
  versions: GROUP_VERSIONS,
  isCreation: (event) => event.eventType === GROUP_CREATED,
  fold: applyGroupEvent,
  describe: (event, group) => describeCategoryEvent(event, group?.name),
};

export const categoryProjection: EntityProjection<CategoryRow> = {
  entityType: CATEGORY_ENTITY,
  table: db.categories,
  versions: CATEGORY_VERSIONS,
  isCreation: (event) => event.eventType === CATEGORY_CREATED,
  fold: applyCategoryEvent,
  describe: (event, category) => describeCategoryEvent(event, category?.name),
};

export const getGroup = (id: string) => db.categoryGroups.get(id);

export const getCategory = (id: string) => db.categories.get(id);

/** Categories in use whose group is this one, for the retire check. */
export const listCategoriesInGroup = (groupId: string) =>
  db.categories.filter((category) => category.groupId === groupId && !category.retired).toArray();

/** A group holds only categories seen by exactly the people who see it (ADR 0005). */
export const canHold = (group: GroupRow, category: Ownership) => sameOwnership(group, category);

/** A category holds money only in accounts seen by exactly the people who see it (ADR 0005). */
export const canHoldMoneyIn = (category: CategoryRow, account: Ownership) =>
  sameOwnership(category, account);

export interface GroupListItem extends GroupRow {
  categories: CategoryRow[];
}

export interface CategoryListItem extends CategoryRow {
  /** Its group, once this device holds it and it fits; null otherwise. */
  group: GroupRow | null;
}

export interface CategoryList {
  /** Groups in use, plus retired ones still holding categories in use. */
  groups: GroupListItem[];
  /** Categories in use whose group isn't on this device yet, or doesn't fit. */
  ungrouped: CategoryRow[];
  retiredGroups: GroupRow[];
  retiredCategories: CategoryListItem[];
}

/** The suggested categories are offered only until the household has a group, retired or not. */
export const hasHouseholdGroup = (list: CategoryList) =>
  [...list.groups, ...list.retiredGroups].some((group) => group.visibility === "household");

const byName = (a: CategoryRecord, b: CategoryRecord) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/**
 * Resolves each category's group when read rather than when projected, so a
 * category whose group arrives later joins it as soon as it does.
 */
export async function readCategoryList(): Promise<CategoryList> {
  const [groups, categories] = await Promise.all([
    db.categoryGroups.toArray(),
    db.categories.toArray(),
  ]);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const groupOf = (category: CategoryRow) => {
    const group = groupById.get(category.groupId);
    return group && canHold(group, category) ? group : null;
  };

  const inUse = categories.filter((category) => !category.retired).sort(byName);
  const categoriesIn = (group: GroupRow) =>
    inUse.filter((category) => groupOf(category)?.id === group.id);
  const listed = groups
    .sort(byName)
    .map((group) => ({ ...group, categories: categoriesIn(group) }));

  return {
    groups: listed.filter((group) => !group.retired || group.categories.length > 0),
    ungrouped: inUse.filter((category) => groupOf(category) === null),
    retiredGroups: listed.filter((group) => group.retired && group.categories.length === 0),
    retiredCategories: categories
      .filter((category) => category.retired)
      .sort(byName)
      .map((category) => ({ ...category, group: groupOf(category) })),
  };
}

/** Every category's name on this device, retired ones included, by category ID. */
export async function readCategoryNames(): Promise<Map<string, string>> {
  const categories = await db.categories.toArray();
  return new Map(categories.map((category) => [category.id, category.name]));
}
