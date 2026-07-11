/**
 * Bundle-size budget guard.
 *
 * The <200KB entry-bundle target in CLAUDE.md was never enforced, so the
 * initial JS had drifted (review UI-03/Theme 7). This script fails CI when
 * the initial JS the browser must download before first paint exceeds the
 * budget, walking the STATIC import graph from Vite's manifest (dynamic
 * imports - lazy routes, charts, pdfjs - are correctly excluded).
 *
 * Phase 4 got the initial graph from ~474KB to ~322KB gz by route-splitting
 * (recharts/pdfjs/analytics) and dropping the counterproductive manualChunks.
 * The remaining ~322KB is the genuine app shell (React, TanStack, Supabase,
 * the Radix primitives the always-mounted layout uses, lucide icons). Driving
 * it under the 200KB aspiration needs an icon-strategy / Radix-lazy pass and
 * is tracked separately. BUDGET below locks in the current state as a
 * regression ceiling, not the final goal. Bumped 340->355 in 2026-07 for the
 * @supabase/supabase-js 2.75->2.110 upgrade (+~15KB eager JS, which also
 * removed the vulnerable transitive `ws` dep and required Node 22); the
 * icon-strategy / Radix-lazy pass remains the way to earn this headroom back.
 *
 * Run: npm run build && npm run size
 */
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST = "dist";
const BUDGET_KB = 355; // gzip regression ceiling (current ~351 after supabase 2.110); aspiration is <200
const MANIFEST = join(DIST, ".vite", "manifest.json");

if (!existsSync(MANIFEST)) {
  console.error(`Manifest not found at ${MANIFEST}. Run \`npm run build\` first.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

// The entry is the manifest record with isEntry: true
const entry = Object.values(manifest).find((r) => r.isEntry);
if (!entry) {
  console.error("No entry chunk found in manifest.");
  process.exit(1);
}

// Walk the STATIC import graph (imports), not dynamicImports (lazy routes/charts)
const seen = new Set();
const files = [];
function collect(record) {
  if (!record || seen.has(record.file)) return;
  seen.add(record.file);
  if (record.file.endsWith(".js")) files.push(record.file);
  for (const key of record.imports ?? []) {
    collect(manifest[key]);
  }
}
collect(entry);

let totalGzip = 0;
const rows = files.map((file) => {
  const buf = readFileSync(join(DIST, file));
  const gz = gzipSync(buf).length;
  totalGzip += gz;
  return { file, gz };
});

rows.sort((a, b) => b.gz - a.gz);
console.log("Initial (eagerly loaded) JS:");
for (const { file, gz } of rows) {
  console.log(`  ${(gz / 1024).toFixed(1).padStart(7)} KB gz  ${file}`);
}
const totalKb = totalGzip / 1024;
console.log(`  ${"-".repeat(30)}`);
console.log(`  ${totalKb.toFixed(1).padStart(7)} KB gz  TOTAL (budget: ${BUDGET_KB} KB)`);

if (totalKb > BUDGET_KB) {
  console.error(`\n❌ Initial bundle ${totalKb.toFixed(1)}KB exceeds ${BUDGET_KB}KB budget.`);
  process.exit(1);
}
console.log(`\n✅ Within budget.`);
