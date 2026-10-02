import { describe, expect, it } from "vitest";
import { isDocsOnly, parsePushedRefs, shouldSkipChecks } from "./pre-push.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const ZERO = "0".repeat(40);

describe("isDocsOnly", () => {
  it.each([[["docs/plans/x.md"]], [["README.md", "CLAUDE.md"]], [["docs/plans/baseline.txt"]]])(
    "is true for %j",
    (files) => {
      expect(isDocsOnly(files)).toBe(true);
    }
  );

  it.each([
    [["src/lib/a.ts"]],
    [["docs/plans/x.md", "package.json"]],
    [["scripts/README.md", "scripts/pre-push.mjs"]],
    [[]],
  ])("is false for %j", (files) => {
    expect(isDocsOnly(files)).toBe(false);
  });
});

describe("parsePushedRefs", () => {
  it("parses one ref per line and ignores blank lines", () => {
    const stdin = `refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}\n\n`;
    expect(parsePushedRefs(stdin)).toEqual([
      {
        localRef: "refs/heads/main",
        localSha: SHA_A,
        remoteRef: "refs/heads/main",
        remoteSha: SHA_B,
      },
    ]);
  });
});

describe("shouldSkipChecks", () => {
  const ref = {
    localRef: "refs/heads/x",
    localSha: SHA_A,
    remoteRef: "refs/heads/x",
    remoteSha: SHA_B,
  };

  it("skips when every ref changes only docs", () => {
    expect(shouldSkipChecks([ref, ref], () => ["docs/a.md"])).toBe(true);
  });

  it("runs when any ref changes code", () => {
    const files = [["docs/a.md"], ["src/a.ts"]];
    expect(shouldSkipChecks([ref, ref], () => files.shift())).toBe(false);
  });

  it("runs when there are no refs", () => {
    expect(shouldSkipChecks([], () => ["docs/a.md"])).toBe(false);
  });

  it("runs when a ref cannot be classified", () => {
    expect(shouldSkipChecks([{ ...ref, localSha: ZERO }], () => null)).toBe(false);
    expect(
      shouldSkipChecks([ref], () => {
        throw new Error("unknown sha");
      })
    ).toBe(false);
  });
});
