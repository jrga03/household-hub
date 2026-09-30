// The server enforces UNIQUE(household_id, name) on accounts and
// UNIQUE(household_id, parent_id, name) on categories. Outbox writes succeed
// locally first, so a duplicate must be caught here or it becomes a terminal
// sync failure with a device-only row. The constraints are not partial, so
// archived rows count too, except for top-level categories: their parent_id
// is NULL and NULLs never collide in a UNIQUE constraint.

interface NamedRow {
  id: string;
  name: string;
  is_active?: boolean | null;
}

interface NamedCategoryRow extends NamedRow {
  parent_id?: string | null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function findNamed<T extends NamedRow>(
  rows: readonly T[],
  name: string,
  excludeId: string | undefined
): T[] {
  const target = normalizeName(name);
  return rows.filter((row) => row.id !== excludeId && normalizeName(row.name) === target);
}

function duplicateError(
  matches: readonly NamedRow[],
  activeMessage: string,
  archivedMessage: string | null
): string | null {
  if (matches.some((row) => row.is_active !== false)) return activeMessage;
  if (archivedMessage && matches.length > 0) return archivedMessage;
  return null;
}

const renameHint = "Choose another name.";

export function duplicateAccountNameError(
  accounts: readonly NamedRow[],
  name: string,
  excludeId?: string
): string | null {
  const displayName = name.trim();
  return duplicateError(
    findNamed(accounts, name, excludeId),
    `An account named "${displayName}" already exists`,
    `An archived account named "${displayName}" already exists. ${renameHint}`
  );
}

export function duplicateCategoryNameError(
  categories: readonly NamedCategoryRow[],
  name: string,
  parentId: string | null | undefined,
  excludeId?: string
): string | null {
  const displayName = name.trim();
  const isTopLevel = (parentId ?? null) === null;
  const siblings = categories.filter(
    (category) => (category.parent_id ?? null) === (parentId ?? null)
  );
  return duplicateError(
    findNamed(siblings, name, excludeId),
    `A category named "${displayName}" already exists`,
    isTopLevel ? null : `An archived category named "${displayName}" already exists. ${renameHint}`
  );
}
