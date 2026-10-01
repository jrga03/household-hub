#!/bin/bash
# PostToolUse(Edit|Write): lint the one edited src file so feedback lands seconds
# after the edit; the Stop hook stays the backstop for cross-file type errors.
set -u
project="${CLAUDE_PROJECT_DIR:-$PWD}"
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path||"")}catch{}})')
case "$file" in
  "$project"/src/*.ts | "$project"/src/*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0
output=$(cd "$project" && npx eslint "$file" 2>&1) && exit 0
echo "$output" | tail -30 >&2
exit 2
