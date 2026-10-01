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
    "npx supabase db push",
    "npx supabase db reset --linked",
    "sleep 1 & rm -rf ~",
    "git fetch & git push -f",
    "{ rm -rf ~; }",
    "if true; then rm -rf ~; fi",
    "time rm -rf ~",
    "xargs rm -rf ~/x",
    "sudo -u root rm -rf /etc",
    "echo $((1<<2))\nrm -rf ~",
    "cat <<\\EOF\nhello\nEOF\nrm -rf ~",
    "rm -rf \\\n/etc",
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
    "npm run build 2>&1 | tail -5",
    "node script.mjs > out.log 2>&1 &",
    'echo "use npx supabase db push carefully"',
    'git log --grep="push -f"',
  ])("allows %s", (command) => {
    expect(blockedReason(command, options)).toBeNull();
  });
});
