/**
 * Follows a `var(--name, fallback)` chain to its final value. `lookup` returns a custom
 * property's raw value (name without the leading dashes), or undefined when it is not defined.
 */
export function resolveVar(value: string, lookup: (name: string) => string | undefined): string {
  const trimmed = value.trim();
  const reference = /^var\(--([\w-]+)(?:,\s*(.+))?\)$/.exec(trimmed);
  if (!reference?.[1]) return trimmed;
  const [, name, fallback] = reference;
  const definition = lookup(name);
  if (definition !== undefined) return resolveVar(definition, lookup);
  if (fallback) return resolveVar(fallback, lookup);
  throw new Error(`--${name} is not defined`);
}
