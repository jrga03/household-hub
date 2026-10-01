#!/bin/bash
# SessionStart: hand the agent the repo state so resuming after a gap starts
# from facts (CLAUDE.md "Multi-day sessions"), not memory.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
plan_docs=$(git log -1 --name-only --format= -- docs/plans/ | grep -v '^$' | paste -sd, - | sed 's/,/, /g')
CONTEXT="$(git status -sb)
$(git log --oneline -10)
Plan docs in the most recent plans commit: ${plan_docs:-none}" \
  node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:process.env.CONTEXT}}))'
