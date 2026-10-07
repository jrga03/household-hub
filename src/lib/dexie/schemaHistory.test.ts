import { describe, expect, it } from "vitest";
import { db } from "./db";
import { SCHEMA_HISTORY } from "./schemaHistory.fixture";

interface DeclaredVersion {
  version: number;
  stores: Record<string, string | null>;
}

/**
 * Dexie has no public "stores of version N" API; read its internal version
 * list, failing loudly if that shape changes rather than comparing nothing.
 */
function declaredVersions(): DeclaredVersion[] {
  const versions: unknown = Reflect.get(db, "_versions");
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error("Dexie internals changed: db._versions is not a non-empty array");
  }
  return versions
    .map((version: unknown): DeclaredVersion => {
      const cfg: unknown =
        typeof version === "object" && version !== null ? Reflect.get(version, "_cfg") : undefined;
      const number: unknown =
        typeof cfg === "object" && cfg !== null ? Reflect.get(cfg, "version") : undefined;
      const stores: unknown =
        typeof cfg === "object" && cfg !== null ? Reflect.get(cfg, "storesSource") : undefined;
      if (typeof number !== "number" || typeof stores !== "object" || stores === null) {
        throw new Error("Dexie internals changed: version._cfg has no version/storesSource");
      }
      return { version: number, stores: stores as Record<string, string | null> };
    })
    .sort((a, b) => a.version - b.version);
}

describe("Dexie schema history", () => {
  it("matches every shipped version's stores() exactly", () => {
    expect(declaredVersions()).toEqual(SCHEMA_HISTORY);
  });

  it("adds versions only by appending", () => {
    const versions = SCHEMA_HISTORY.map((entry) => entry.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });
});
