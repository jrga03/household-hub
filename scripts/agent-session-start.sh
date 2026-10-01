#!/bin/bash
# SessionStart: hand the agent the repo state so resuming after a gap starts
# from facts (CLAUDE.md "Multi-day sessions"), not memory.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
newest_plan=$(git log -1 --name-only --format= -- docs/plans/ | head -1)
CONTEXT="$(git status -sb)
$(git log --oneline -10)
Most recently committed plan doc: ${newest_plan:-none}" \
  node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:process.env.CONTEXT}}))'
