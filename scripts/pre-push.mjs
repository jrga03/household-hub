#!/usr/bin/env node
// Git pre-push: runs CI's lint, unit-test, and type-check gates in parallel.
// Pushes that change only Markdown files or docs/ skip the checks.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ZERO_SHA = /^0+$/;

export const CHECKS = [
  { name: "lint", command: "npm", args: ["run", "lint"] },
  { name: "unit tests", command: "npx", args: ["vitest", "run", "--allowOnly=false"] },
  { name: "tsc src", command: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.json"] },
  { name: "tsc tests", command: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.tests.json"] },
  { name: "tsc strict", command: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.strict.json"] },
];

export function isDocsOnly(files) {
  return (
    files.length > 0 && files.every((file) => file.endsWith(".md") || file.startsWith("docs/"))
  );
}

export function parsePushedRefs(stdin) {
  return stdin
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 4)
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({
      localRef,
      localSha,
      remoteRef,
      remoteSha,
    }));
}

export function readPushInput(stdin) {
  if (stdin.isTTY) return "";
  try {
    return readFileSync(stdin.fd, "utf8");
  } catch {
    return "";
  }
}

export function shouldSkipChecks(refs, listFiles) {
  if (refs.length === 0) return false;
  for (const ref of refs) {
    let files;
    try {
      files = listFiles(ref);
    } catch {
      return false;
    }
    if (!files || !isDocsOnly(files)) return false;
  }
  return true;
}

function changedFiles({ localSha, remoteSha }) {
  if (ZERO_SHA.test(localSha)) return null; // deleting a remote ref
  const base = ZERO_SHA.test(remoteSha)
    ? execFileSync("git", ["merge-base", "origin/main", localSha], { encoding: "utf8" }).trim()
    : remoteSha;
  return execFileSync("git", ["diff", "--name-only", base, localSha], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function runCheck({ name, command, args }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const finish = (ok, output) =>
      resolve({ name, ok, seconds: (Date.now() - started) / 1000, output });
    const child = spawn(command, args);
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => finish(false, String(error)));
    child.on("close", (code) => finish(code === 0, output));
  });
}

async function main() {
  const refs = parsePushedRefs(readPushInput(process.stdin));
  if (shouldSkipChecks(refs, changedFiles)) {
    console.log("pre-push: docs-only push, checks skipped");
    return 0;
  }
  const results = await Promise.all(CHECKS.map(runCheck));
  for (const result of results) {
    console.log(
      `pre-push: ${result.ok ? "pass" : "FAIL"}  ${result.name} (${result.seconds.toFixed(1)}s)`
    );
  }
  const failed = results.filter((result) => !result.ok);
  for (const result of failed) {
    console.log(`\n===== ${result.name} =====\n${result.output}`);
  }
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
