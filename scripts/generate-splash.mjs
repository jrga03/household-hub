#!/usr/bin/env node
/**
 * iOS splash screen generator (mobile UX remediation item 8.2)
 *
 * Regenerates the paired light/dark iOS splash screen set in /public/splash
 * from the largest app icon, using pwa-asset-generator (fetched via npx; it
 * drives a local headless Chrome to render each device size).
 *
 * Usage: npm run generate:splash
 *
 * Colors match --background in src/index.css (and the paired theme-color
 * metas in index.html): #ffffff light / #0a0a0a dark.
 *
 * The matching <link rel="apple-touch-startup-image"> tags live in
 * index.html. Re-running this script with the same device specs keeps those
 * hrefs valid; if pwa-asset-generator's device list changes (new iPhone/iPad
 * sizes), diff the tags it prints against index.html and update the block
 * there (href paths are /splash/<file>, light tags get an explicit
 * `(prefers-color-scheme: light) and ` media prefix).
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "public", "icons", "icon-512x512.png");
const outDir = path.join(root, "public", "splash");

// Icon occupies ~50% of the splash viewport (pwa-asset-generator's
// recommended padding recipe for centered-logo splash screens).
const padding = "calc(50vh - 25%) calc(50vw - 25%)";

const runs = [
  { label: "light", args: ["--background", "#ffffff"] },
  { label: "dark", args: ["--background", "#0a0a0a", "--dark-mode"] },
];

for (const { label, args } of runs) {
  console.log(`\nGenerating ${label} splash screens...`);
  execFileSync(
    "npx",
    [
      "--yes",
      "pwa-asset-generator",
      source,
      outDir,
      "--splash-only",
      "--type",
      "png",
      "--padding",
      padding,
      ...args,
    ],
    { cwd: root, stdio: "inherit" }
  );
}

console.log("\nDone. Files written to public/splash/.");
console.log("If the printed <link> tags differ from index.html, update the block there.");
process.exit(0);
