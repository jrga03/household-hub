// The server enforces UNIQUE(household_id, name) on accounts and
// UNIQUE(household_id, parent_id, name) on categories. Outbox writes succeed
// locally first, so a duplicate must be caught here or it becomes a terminal
// sync failure with a device-only row.

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

function hasActiveNamed<T extends NamedRow>(
  rows: readonly T[],
  name: string,
  excludeId: string | undefined
): boolean {
  const target = normalizeName(name);
  return rows.some(
    (row) => row.id !== excludeId && row.is_active !== false && normalizeName(row.name) === target
  );
}

export function duplicateAccountNameError(
  accounts: readonly NamedRow[],
  name: string,
  excludeId?: string
): string | null {
  return hasActiveNamed(accounts, name, excludeId)
    ? `An account named "${name.trim()}" already exists`
    : null;
}

export function duplicateCategoryNameError(
  categories: readonly NamedCategoryRow[],
  name: string,
  parentId: string | null | undefined,
  excludeId?: string
): string | null {
  const siblings = categories.filter(
    (category) => (category.parent_id ?? null) === (parentId ?? null)
  );
  return hasActiveNamed(siblings, name, excludeId)
    ? `A category named "${name.trim()}" already exists`
    : null;
}
