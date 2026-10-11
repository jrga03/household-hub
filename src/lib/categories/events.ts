import type { LoggedEvent } from "@/lib/events/log";
import type { EventVersions } from "@/lib/events/versions";

export const CATEGORY_NAME_MAX_LENGTH = 40;

export const GROUP_ENTITY = "category_group";
export const GROUP_CREATED = "category_group.created";
export const GROUP_RENAMED = "category_group.renamed";
export const GROUP_RETIRED = "category_group.retired";
export const GROUP_UNRETIRED = "category_group.unretired";

export const CATEGORY_ENTITY = "category";
export const CATEGORY_CREATED = "category.created";
export const CATEGORY_RENAMED = "category.renamed";
export const CATEGORY_MOVED = "category.moved";
export const CATEGORY_RETIRED = "category.retired";
export const CATEGORY_UNRETIRED = "category.unretired";

export const GROUP_VERSIONS = {
  [GROUP_CREATED]: { current: 1, upcasts: {} },
  [GROUP_RENAMED]: { current: 1, upcasts: {} },
  [GROUP_RETIRED]: { current: 1, upcasts: {} },
  [GROUP_UNRETIRED]: { current: 1, upcasts: {} },
} satisfies EventVersions;

export const CATEGORY_VERSIONS = {
  [CATEGORY_CREATED]: { current: 1, upcasts: {} },
  [CATEGORY_RENAMED]: { current: 1, upcasts: {} },
  [CATEGORY_MOVED]: { current: 1, upcasts: {} },
  [CATEGORY_RETIRED]: { current: 1, upcasts: {} },
  [CATEGORY_UNRETIRED]: { current: 1, upcasts: {} },
} satisfies EventVersions;

export type RecordNoun = "group" | "category";

type NameCheck = { name: string; problem: null } | { name: null; problem: string };

/** Validates a group or category name from a form or from another device's event. */
export function checkCategoryName(input: unknown, noun: RecordNoun): NameCheck {
  const name = typeof input === "string" ? input.trim() : "";
  if (name === "") return { name: null, problem: `A ${noun} needs a name.` };
  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    return {
      name: null,
      problem: `A ${noun} name can be at most ${CATEGORY_NAME_MAX_LENGTH} characters.`,
    };
  }
  return { name, problem: null };
}

const decodeName = (event: LoggedEvent, noun: RecordNoun) =>
  checkCategoryName(event.payload.name, noun).name;

const decodeGroupId = (event: LoggedEvent) => {
  const { groupId } = event.payload;
  return typeof groupId === "string" && groupId !== "" ? groupId : null;
};

/** The name a group create or rename sets, or null for any other event. */
export function decodeGroupName(event: LoggedEvent): string | null {
  if (event.eventType !== GROUP_CREATED && event.eventType !== GROUP_RENAMED) return null;
  return decodeName(event, "group");
}

/** What a category create sets, or null for any other event or a broken payload. */
export function decodeCategoryCreated(
  event: LoggedEvent
): { name: string; groupId: string } | null {
  if (event.eventType !== CATEGORY_CREATED) return null;
  const name = decodeName(event, "category");
  const groupId = decodeGroupId(event);
  return name !== null && groupId !== null ? { name, groupId } : null;
}

export function decodeCategoryRenamed(event: LoggedEvent): string | null {
  return event.eventType === CATEGORY_RENAMED ? decodeName(event, "category") : null;
}

export function decodeCategoryMoved(event: LoggedEvent): string | null {
  return event.eventType === CATEGORY_MOVED ? decodeGroupId(event) : null;
}

/** Whether a retire or unretire event leaves the record retired, or null for any other event. */
export function decodeRetirement(event: LoggedEvent): boolean | null {
  switch (event.eventType) {
    case GROUP_RETIRED:
    case CATEGORY_RETIRED:
      return true;
    case GROUP_UNRETIRED:
    case CATEGORY_UNRETIRED:
      return false;
    default:
      return null;
  }
}

const ACTION_LABELS: Record<string, string> = {
  [GROUP_CREATED]: "Add group",
  [GROUP_RENAMED]: "Rename group",
  [GROUP_RETIRED]: "Retire group",
  [GROUP_UNRETIRED]: "Unretire group",
  [CATEGORY_CREATED]: "Add category",
  [CATEGORY_RENAMED]: "Rename category",
  [CATEGORY_MOVED]: "Move category",
  [CATEGORY_RETIRED]: "Retire category",
  [CATEGORY_UNRETIRED]: "Unretire category",
};

/**
 * What a change was ("Rename category: Market"). A create or rename names the
 * record as it set it; anything else by its current name, when this device holds it.
 */
export function describeCategoryEvent(event: LoggedEvent, currentName: string | undefined): string {
  const action = ACTION_LABELS[event.eventType] ?? "Change category";
  const name =
    decodeGroupName(event) ??
    decodeCategoryCreated(event)?.name ??
    decodeCategoryRenamed(event) ??
    currentName;
  return name ? `${action}: ${name}` : action;
}
