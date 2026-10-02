#!/bin/bash
# Lint + typecheck what changed on this branch. Blocks the stop once per
# distinct working-tree state: Claude gets one chance to fix each failure,
# and an unfixable failure cannot loop because the tree hash stops changing.
# A pass is cached per tree hash too, so turns with no edits skip the checks.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
input=$(cat)
session=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).session_id||"nosession")}catch{process.stdout.write("nosession")}})')

base=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD 2>/dev/null || echo HEAD)
changed=$( { git diff --no-renames --name-only --diff-filter=ACMR "$base"; git ls-files --others --exclude-standard; } \
  | grep -E '\.(ts|tsx)$' | sort -u)
deleted=$(git diff --no-renames --name-only --diff-filter=D "$base" | grep -E '\.(ts|tsx)$')
[ -z "$changed" ] && [ -z "$deleted" ] && exit 0

marker="${TMPDIR:-/tmp}/household-hub-stop-${session}"
# Deletions, a moved HEAD, and dependency changes can break the build without
# touching any changed file, so they are part of the cache key.
current=$( {
  printf '%s\n' "$changed"
  [ -z "$changed" ] || cat $changed
  git diff --name-status "$base"
  git rev-parse HEAD
  cat eslint.config.js tsconfig.json tsconfig.tests.json tsconfig.strict.json package-lock.json .nvmrc 2>/dev/null
  node -v
} | git hash-object --stdin)
if [ -f "$marker" ]; then
  previous=$(cat "$marker")
  if [ "$previous" = "pass:$current" ] || [ "$previous" = "block:$current" ]; then
    exit 0 # unchanged since a pass, or the same failing tree already blocked once
  fi
fi

typecheck_tests=""
if printf '%s\n' "$changed" "$deleted" | grep -qE '^(tests/|playwright\.config\.ts$)'; then
  typecheck_tests="yes"
fi

# Phase 3 exit criterion adds --max-warnings=0 here (roadmap section 5).
output=$( { [ -z "$changed" ] || npx eslint $changed 2>&1; } \
  && npx tsc --noEmit -p tsconfig.json 2>&1 \
  && npx tsc --noEmit -p tsconfig.strict.json 2>&1 \
  && { [ -z "$typecheck_tests" ] || npx tsc --noEmit -p tsconfig.tests.json 2>&1; })
if [ $? -eq 0 ]; then
  printf 'pass:%s' "$current" > "$marker"
  exit 0
fi
printf 'block:%s' "$current" > "$marker"
echo "$output" | tail -40 >&2
exit 2
