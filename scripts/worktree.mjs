#!/usr/bin/env node
// Sets up and tears down an issue worktree under .claude/worktrees/.
//   node scripts/worktree.mjs new <branch>   worktree off origin/main, .env.local copied, npm ci
//   node scripts/worktree.mjs done <branch>  remove it, delete the branch, put this checkout on an up-to-date main
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const [command, branch] = process.argv.slice(2);
if (!["new", "done"].includes(command) || !branch) {
  console.error("Usage: node scripts/worktree.mjs <new|done> <branch>");
  process.exit(1);
}

const git = (args, cwd = root) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const run = (file, args, cwd) => execFileSync(file, args, { cwd, stdio: "inherit" });

// The main checkout, even when this runs inside a worktree.
const root = dirname(
  git(["rev-parse", "--path-format=absolute", "--git-common-dir"], process.cwd())
);
const path = join(root, ".claude", "worktrees", branch.split("/").pop());

if (command === "new") {
  git(["fetch", "-q", "origin", "main"]);
  git(["worktree", "add", "-q", "--no-track", "-b", branch, path, "origin/main"]);
  // Gitignored, so the worktree lacks it; without it the build has no Supabase URL.
  copyFileSync(join(root, ".env.local"), join(path, ".env.local"));
  // Its own install: a symlinked node_modules lets npm ci empty the main checkout's.
  run("npm", ["ci", "--silent"], path);
  console.log(path);
} else {
  if (existsSync(path)) git(["worktree", "remove", path]);
  const lock = () => git(["rev-parse", "main:package-lock.json"]);
  const lockBefore = lock();
  git(["fetch", "-q", "--prune"]);
  git(["switch", "-q", "main"]);
  git(["pull", "-q", "--ff-only"]);
  // After the switch, so a branch checked out here (no worktree) can go too.
  git(["branch", "-D", branch]);
  if (lock() !== lockBefore) run("npm", ["ci", "--silent"], root);
  console.log(git(["log", "--oneline", "-1"]));
}
