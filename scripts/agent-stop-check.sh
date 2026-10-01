#!/bin/bash
# Lint + typecheck what changed on this branch. Blocks the stop once per
# distinct working-tree state: Claude gets one chance to fix each failure,
# and an unfixable failure cannot loop because the tree hash stops changing.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
input=$(cat)
session=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).session_id||"nosession")}catch{process.stdout.write("nosession")}})')

base=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD 2>/dev/null || echo HEAD)
changed=$( { git diff --name-only --diff-filter=ACMR "$base"; git ls-files --others --exclude-standard; } \
  | grep -E '\.(ts|tsx)$' | sort -u)
[ -z "$changed" ] && exit 0

typecheck_tests=""
if printf '%s\n' "$changed" | grep -qE '^(tests/|playwright\.config\.ts$)'; then
  typecheck_tests="yes"
fi

# Phase 3 exit criterion adds --max-warnings=0 here (roadmap section 5).
output=$(npx eslint $changed 2>&1 \
  && npx tsc --noEmit -p tsconfig.json 2>&1 \
  && { [ -z "$typecheck_tests" ] || npx tsc --noEmit -p tsconfig.tests.json 2>&1; })
[ $? -eq 0 ] && exit 0

marker="${TMPDIR:-/tmp}/household-hub-stop-${session}"
current=$(cat $changed | git hash-object --stdin)
if [ -f "$marker" ] && [ "$(cat "$marker")" = "$current" ]; then
  exit 0 # same tree as the last block: no progress, let the stop through
fi
printf '%s' "$current" > "$marker"
echo "$output" | tail -40 >&2
exit 2
