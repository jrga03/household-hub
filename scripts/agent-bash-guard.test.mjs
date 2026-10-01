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
  ])("allows %s", (command) => {
    expect(blockedReason(command, options)).toBeNull();
  });
});
