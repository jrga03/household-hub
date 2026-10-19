/**
 * The projection registry: each entity registers its table, event versions,
 * fold, description and creation check, and the event log dispatches through
 * it. Adding an entity means registering it here, not editing the log.
 */

import type { Table } from "dexie";
import { accountProjection } from "@/lib/accounts/projection";
import { allocationProjection } from "@/lib/allocations/projection";
import { budgetProjection } from "@/lib/budgets/projection";
import { categoryProjection, groupProjection } from "@/lib/categories/projection";
import { balanceCorrectionProjection } from "@/lib/corrections/projection";
import { transactionProjection } from "@/lib/transactions/projection";
import { transferProjection } from "@/lib/transfers/projection";
import type { LoggedEvent } from "./log";
import type { Visibility } from "./ownership";
import { upcast, type EventVersions } from "./versions";

export interface ProjectedRow {
  id: string;
  householdId: string;
  visibility: Visibility;
}

export interface EntityProjection<Row extends ProjectedRow> {
  entityType: string;
  table: Table<Row, string>;
  /** `fold` sees only events lifted to their type's current version; `describe` gets an unknown version with an empty payload. */
  versions: EventVersions;
  /** Whether the event brings its entity into being, so nothing after it stands without it. */
  isCreation(event: LoggedEvent): boolean;
  /** Applies one event to the row so far (null before its create), called in HLC order. */
  fold(row: Row | null, event: LoggedEvent): Row | null;
  /** A readable line for one change, given the entity's current row when this device holds it. */
  describe(event: LoggedEvent, row: Row | undefined): string | Promise<string>;
}

interface RegisteredProjection {
  tableName: string;
  isCreation(event: LoggedEvent): boolean;
  project(entityId: string, history: LoggedEvent[]): Promise<void>;
  describe(event: LoggedEvent): Promise<string>;
  wipe(isGone: (row: ProjectedRow) => boolean): Promise<void>;
}

// Formatted HLCs sort as strings; the event id keeps the order total.
export const byHlc = (a: LoggedEvent, b: LoggedEvent) =>
  a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : a.id < b.id ? -1 : 1;

const projections = new Map<string, RegisteredProjection>();

export function registerProjection<Row extends ProjectedRow>(entity: EntityProjection<Row>): void {
  const lift = (event: LoggedEvent) => upcast(entity.versions, event);
  projections.set(entity.entityType, {
    tableName: entity.table.name,
    isCreation: entity.isCreation,
    async project(entityId, history) {
      const row = history
        .map(lift)
        .filter((event) => event !== null)
        .sort(byHlc)
        .reduce<Row | null>(entity.fold, null);
      if (row) await entity.table.put(row);
      else await entity.table.delete(entityId);
    },
    async describe(event) {
      // An unknown version is described by its type and the current row alone.
      const lifted = lift(event) ?? { ...event, payload: {} };
      return entity.describe(lifted, await entity.table.get(event.entityId));
    },
    async wipe(isGone) {
      await entity.table.filter(isGone).delete();
    },
  });
}

registerProjection(accountProjection);
registerProjection(groupProjection);
registerProjection(categoryProjection);
registerProjection(transactionProjection);
registerProjection(allocationProjection);
registerProjection(transferProjection);
registerProjection(budgetProjection);
registerProjection(balanceCorrectionProjection);

/** Every projection table's name, for the log's transactions. */
export const projectionTableNames = () =>
  [...projections.values()].map(({ tableName }) => tableName);

/**
 * Rebuilds the projection of the event's entity from its history (every event
 * the device holds for that entity, the new one included). Must give the same
 * result for any arrival order, since devices pull each other's events at
 * different times. Events of an entity or version this app doesn't know stay
 * in the log only.
 */
export async function projectEvent(event: LoggedEvent, history: LoggedEvent[]): Promise<void> {
  await projections.get(event.entityType)?.project(event.entityId, history);
}

/** A readable line for one change, for showing an event the server refused. */
export async function describeEvent(event: LoggedEvent): Promise<string> {
  const projection = projections.get(event.entityType);
  return projection ? projection.describe(event) : `Unknown change (${event.eventType})`;
}

export const isCreation = (event: LoggedEvent): boolean =>
  projections.get(event.entityType)?.isCreation(event) ?? false;

/** Deletes the rows a household switch takes away, in every projection. */
export async function wipeProjections(isGone: (row: ProjectedRow) => boolean): Promise<void> {
  for (const projection of projections.values()) await projection.wipe(isGone);
}
