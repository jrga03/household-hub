#!/bin/bash
# PostToolUse(Edit|Write): report only architecture-boundary violations (arch/*,
# no-restricted-imports) in the edited src file. Mid-edit noise like unused
# imports is left to the Stop hook, which lints and type-checks the batch.
set -u
project="${CLAUDE_PROJECT_DIR:-$PWD}"
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path||"")}catch{}})')
case "$file" in
  "$project"/src/*.ts | "$project"/src/*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0
violations=$(cd "$project" && npx eslint --format json "$file" 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  let results;try{results=JSON.parse(s)}catch{return}
  const isBoundaryRule=(rule)=>rule?.startsWith("arch/")||rule==="no-restricted-imports";
  for(const {filePath,messages} of results)
    for(const m of messages.filter((m)=>isBoundaryRule(m.ruleId)))
      console.log(`${filePath}:${m.line}:${m.column} ${m.message} (${m.ruleId})`);
})')
[ -z "$violations" ] && exit 0
echo "$violations" | tail -30 >&2
exit 2
