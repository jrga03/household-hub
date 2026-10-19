interface Named {
  id: string;
  name: string;
}

/** Name first, then id, so equal names keep the same order on every device. */
export const byName = (a: Named, b: Named) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
