import { describe, expect, it } from "vitest";
import { blockedReason } from "./agent-bash-guard.mjs";

const options = { projectDir: "/repo", tmpDirs: ["/tmp", "/private/tmp"] };

describe("blockedReason", () => {
  it.each([
    "git push --force",
    "git push -f origin main",
    "git push --force-with-lease origin main",
    "git push origin +main",
    "cd /repo && git push -uf origin feature",
    "supabase db push",
    "supabase db reset --linked",
    "rm -rf /",
    'rm -rf "/"',
    "rm -rf ~",
    "rm -rf ~/Documents",
    "rm -rf $HOME/projects",
    "rm -rf ..",
    "rm -rf ../other-repo",
    "rm -rf .",
    "rm -rf /repo",
    "rm -rf /Users/someone/elsewhere",
    "rm -r /etc",
    "sudo rm -rf /var/lib/thing",
    "rm --recursive --force /opt",
    "command rm -rf /etc",
    "git -C /x push --force",
    "git -c http.extraHeader=x push -f origin main",
    "FOO=1 git push --force",
    "cd /repo; rm -rf ~/x",
  ])("blocks %s", (command) => {
    expect(blockedReason(command, options)).toEqual(expect.any(String));
  });

  it.each([
    "git push",
    "git push -u origin feature",
    "git push origin main && rm -f notes.txt",
    "git status -sb",
    "supabase status -o env",
    "rm -rf dist",
    "rm -rf node_modules/.vite",
    "rm -rf /repo/dist",
    "rm -rf /tmp/claude-501/scratch",
    "rm -rf /private/tmp/claude-501/scratch",
    "rm notes.txt",
    "npm run lint",
    'git commit -m "docs: never git push --force"',
    'git commit -m "x; git push -f later"',
    'gh pr create --title "fix: rm -rf /tmp handling"',
    "git stash push -f",
    "git commit -F - <<'EOF'\ngit push -f is blocked by the guard\nEOF",
    'git commit -m "mention supabase db push"',
  ])("allows %s", (command) => {
    expect(blockedReason(command, options)).toBeNull();
  });
});
