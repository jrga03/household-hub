import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHECKS,
  isDocsOnly,
  parsePushedRefs,
  readPushInput,
  shouldSkipChecks,
} from "./pre-push.mjs";

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

describe("readPushInput", () => {
  it("returns an empty string without reading when stdin is a terminal", () => {
    const stdin = {
      isTTY: true,
      get fd() {
        throw new Error("terminal stdin must not be read");
      },
    };
    expect(readPushInput(stdin)).toBe("");
  });

  it("returns an empty string when reading stdin throws", () => {
    expect(readPushInput({ isTTY: false, fd: -1 })).toBe("");
  });
});

describe("CHECKS", () => {
  it("runs knip through the npm script", () => {
    expect(CHECKS.find((check) => check.name === "knip")).toEqual({
      name: "knip",
      command: "npm",
      args: ["run", "knip"],
    });
  });

  it("keeps config hints as errors in the knip script", () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8")
    );
    expect(packageJson.scripts.knip).toContain("--treat-config-hints-as-errors");
  });
});
