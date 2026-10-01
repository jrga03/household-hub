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

function gitSubcommandIndex(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-C" || args[i] === "-c") i++;
    else if (!args[i].startsWith("-")) return i;
  }
  return -1;
}

function forcePushReason(command, args) {
  if (command !== "git") return null;
  const subcommandIndex = gitSubcommandIndex(args);
  if (subcommandIndex === -1 || args[subcommandIndex] !== "push") return null;
  const forced = args
    .slice(subcommandIndex + 1)
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

function recursiveRmReason(command, args, options) {
  if (command !== "rm" && !command.endsWith("/rm")) return null;
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

function skipHeredocBodies(command, start, delimiters) {
  let position = start;
  while (delimiters.length > 0 && position < command.length) {
    const newline = command.indexOf("\n", position);
    const lineEnd = newline === -1 ? command.length : newline;
    if (command.slice(position, lineEnd).trim() === delimiters[0]) delimiters.shift();
    position = lineEnd + 1;
  }
  return position;
}

// Splits on unquoted && || ; | and newlines. Quoted strings become one token, and
// heredoc bodies are dropped, so text inside messages is never read as a command.
function splitSegments(command) {
  const segments = [];
  const heredocDelimiters = [];
  let tokens = [];
  let word = "";
  let inWord = false;
  let quote = null;

  const endWord = () => {
    if (inWord) tokens.push(word);
    word = "";
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    if (tokens.length > 0) segments.push(tokens);
    tokens = [];
  };

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      const escapedInDoubleQuotes = quote === '"' && char === "\\" && /["\\]/.test(command[i + 1]);
      if (char === quote) quote = null;
      else if (escapedInDoubleQuotes) word += command[++i];
      else word += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      inWord = true;
      continue;
    }
    if (char === "\\" && i + 1 < command.length) {
      word += command[++i];
      inWord = true;
      continue;
    }
    if (command.startsWith("<<", i) && command[i + 2] !== "<") {
      const heredoc = /^<<-?\s*(['"]?)([^\s'"]+)\1/.exec(command.slice(i));
      if (heredoc) {
        endWord();
        heredocDelimiters.push(heredoc[2]);
        i += heredoc[0].length - 1;
        continue;
      }
    }
    if (char === "\n") {
      endSegment();
      i = skipHeredocBodies(command, i + 1, heredocDelimiters) - 1;
      continue;
    }
    const operator = ["&&", "||", ";", "|"].find((op) => command.startsWith(op, i));
    if (operator) {
      endSegment();
      i += operator.length - 1;
      continue;
    }
    if (/\s/.test(char)) {
      endWord();
      continue;
    }
    word += char;
    inWord = true;
  }
  endSegment();
  return segments;
}

function commandIndex(tokens) {
  let index = 0;
  while (
    index < tokens.length &&
    (tokens[index] === "sudo" ||
      tokens[index] === "command" ||
      /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]))
  ) {
    index++;
  }
  return index;
}

export function blockedReason(command, options) {
  for (const segment of splitSegments(command)) {
    const index = commandIndex(segment);
    if (index >= segment.length) continue;
    const name = segment[index];
    const args = segment.slice(index + 1);
    const reason =
      forcePushReason(name, args) ??
      (name === "supabase" ? supabaseReason(segment.slice(index).join(" ")) : null) ??
      recursiveRmReason(name, args, options);
    if (reason) return reason;
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  const reason = blockedReason(input.tool_input?.command ?? "", {
    projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    tmpDirs: [process.env.TMPDIR, "/tmp", "/private/tmp"].filter(Boolean),
  });
  if (reason) {
    process.stderr.write(`Blocked by scripts/agent-bash-guard.mjs: ${reason}\n`);
    process.exit(2);
  }
}
