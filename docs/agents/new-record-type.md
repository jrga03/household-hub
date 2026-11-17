# Adding a record type, an event version or a projection field

Paydays (`src/lib/paydays/`, #443 and #448) are the smallest complete example; copy their shape. Categories (`src/lib/categories/`) are the larger one.

## A new record type

1. **Events**, in `src/lib/<record>/events.ts`: the entity name, one constant per event type, a `<RECORD>_VERSIONS` map (`satisfies EventVersions`, each `{ current: 1, upcasts: {} }`), a decoder per payload field that returns null on a broken payload, and a `describe…Event` for the history line. Names go through `checkRecordName` / `checkedName` in `src/lib/events/names.ts`.
2. **Projection**, in `src/lib/<record>/projection.ts`: the row type (`id`, `householdId`, `visibility`, then fields), a fold that takes each field from its latest event, and an `EntityProjection` object. Retire, unretire and delete reuse `RETIRED` / `UNRETIRED` / `DELETED` from `src/lib/events/retirement.ts`.
3. **Register it** in `src/lib/events/projector.ts`. The registry is the only list of projection tables; the event log (`src/lib/events/log.ts`) projects and describes every event through it.
4. **Dexie table**: add the next `this.version(N).stores({ <table>: "id" })` in `src/lib/dexie/db.ts` and the `Table` field on the class. A new empty table needs no `.upgrade()`.
5. **Commands**, in `src/lib/commands/<record>.ts`: `appenderFor(ENTITY, VERSIONS)` from `./append`, validate, append, then `requestSync()`. Several events that must land together go inside `appendTogether`. Lookups that refuse a missing or retired record live beside `refuseRetired` in `src/lib/commands/records.ts`.
6. **Hook**: a `useLiveQuery` reader in `src/hooks/` (see `usePaydays` in `src/hooks/useBudgets.ts`).
7. **Tests**: a permutation test of the projection with `orders()` from `src/test/permutations.ts` and `loggedEvent()` / `hlcAt()` from `src/test/events.ts` (pattern: `src/lib/paydays/projection.test.ts`). Keep each permutation to 6 events or fewer: 7 events is 5,040 orders and about 12 s. Put a separate race (two renames, two reorders) in its own small permutation.

The server stores any event type: there is no allowlist to update in `supabase/`.

Done when: the record's events fold to the same rows in every order, the table is registered, and `node scripts/pre-push.mjs` passes.

## A new payload shape (event version)

Raise `current` and add an upcast from the old version (`upcasts: { 1: (payload) => ({ ...payload, newField: default }) }`). Folds only ever see the current version. Examples: `src/lib/transfers/events.ts`, `src/lib/accounts/events.ts`, `budget.set` v2 in `src/lib/budgets/events.ts`. Test that a v1 event projects as before.

## A new field on an existing row

Projections are not rebuilt from the log on upgrade; there is no replay or projection version. Rows already on a device get the field from a Dexie upgrade: add `this.version(N).upgrade(...)` in `src/lib/dexie/db.ts` that sets a default with `row.field ??= …` (see versions 17 and 18). Test it the way `src/lib/dexie/db.payer-upgrade.test.ts` does: seed the old stores, then import the app's `db`.
