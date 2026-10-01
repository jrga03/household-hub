#!/usr/bin/env node
// PreToolUse(Bash) guard: refuses commands that rewrite shared history, touch the
// linked Supabase project, or recursively delete outside the repo or temp dirs.
// Hooks can only tighten permissions, so this never allows anything by itself.
import { readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function isInside(path, dir) {
  const root = resolve(dir);
  return path.startsWith(root + sep);
}

function isDangerousTarget(rawTarget, { projectDir, tmpDirs }) {
  const target = rawTarget.replace(/^["']|["']$/g, "");
  if (target === "." || target === "./" || target === "*") return true;
  if (target.startsWith("~") || target.startsWith("$HOME") || target.startsWith("${HOME}")) {
    return true;
  }
  if (target.startsWith("..")) return true;
  if (!isAbsolute(target)) return false;
  const path = resolve(target);
  return ![projectDir, ...tmpDirs].some((dir) => isInside(path, dir));
}

function forcePushReason(tokens) {
  const pushIndex = tokens.indexOf("push");
  if (tokens[0] !== "git" || pushIndex === -1) return null;
  const forced = tokens
    .slice(pushIndex + 1)
    .some(
      (token) =>
        token.startsWith("--force") ||
        /^-[a-zA-Z]*f[a-zA-Z]*$/.test(token) ||
        (token.startsWith("+") && token.length > 1)
    );
  return forced ? "force-push rewrites shared history; push normally or ask the user." : null;
}

function supabaseReason(segment) {
  if (/\bsupabase\s+db\s+push\b/.test(segment)) {
    return "supabase db push applies migrations to a remote project; ask the user.";
  }
  if (/\bsupabase\s+db\s+reset\b/.test(segment) && /--linked\b/.test(segment)) {
    return "supabase db reset --linked wipes the remote database; ask the user.";
  }
  return null;
}

function recursiveRmReason(tokens, options) {
  const rmIndex = tokens.findIndex((token) => token === "rm" || token.endsWith("/rm"));
  if (rmIndex === -1) return null;
  const args = tokens.slice(rmIndex + 1);
  const recursive = args.some(
    (arg) => arg === "--recursive" || (/^-[a-zA-Z]+$/.test(arg) && /[rR]/.test(arg))
  );
  if (!recursive) return null;
  const target = args
    .filter((arg) => !arg.startsWith("-"))
    .find((arg) => isDangerousTarget(arg, options));
  return target
    ? `recursive rm of ${target} is outside the repo and temp dirs; delete a narrower path or ask the user.`
    : null;
}

export function blockedReason(command, options) {
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens[0] === "sudo") tokens.shift();
    if (tokens.length === 0) continue;
    const reason =
      forcePushReason(tokens) ?? supabaseReason(segment) ?? recursiveRmReason(tokens, options);
    if (reason) return reason;
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const reason = blockedReason(input.tool_input?.command ?? "", {
    projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    tmpDirs: [process.env.TMPDIR, "/tmp", "/private/tmp"].filter(Boolean),
  });
  if (reason) {
    process.stderr.write(`Blocked by scripts/agent-bash-guard.mjs: ${reason}\n`);
    process.exit(2);
  }
}
