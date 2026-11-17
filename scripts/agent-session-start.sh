#!/bin/bash
# SessionStart: hand the agent the repo state so resuming after a gap starts
# from facts (CLAUDE.md "Multi-day sessions"), not memory.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
# The three plan docs committed most recently that still exist (moves and deletes leave old paths
# in the log); a plan folder shows as its plan.md.
plan_docs=$(git log --name-only --format= -- docs/plans/ ':!docs/plans/archive/' |
  sed -E 's#^(docs/plans/[^/]+)/.*#\1/plan.md#' | awk 'NF && !seen[$0]++' |
  while read -r doc; do [ -f "$doc" ] && echo "$doc"; done |
  head -3 | paste -sd, - | sed 's/,/, /g')
CONTEXT="$(git status -sb)
$(git log --oneline -10)
Newest plan docs: ${plan_docs:-none}" \
  node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:process.env.CONTEXT}}))'
