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
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST = "dist";
const BUDGET_KB = 378; // gzip regression ceiling; reset to measured + 3 KB after Dependabot PR #11 (2026-10-08, was 355: react-dom 19.3 and react-hook-form 7.89); aspiration is <200
// The statement import worker (pdf.js and the parsers): lazy and precached, so
// outside BUDGET_KB. First measured at 535.9 KB gz (#97); budget is that + 10%.
const IMPORT_WORKER_BUDGET_KB = 590;
const IMPORT_WORKER = /^parse\.worker-.*\.js$/;
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

const workerFiles = readdirSync(join(DIST, "assets")).filter((file) => IMPORT_WORKER.test(file));
if (workerFiles.length !== 1) {
  console.error(
    `\nExpected one statement import worker in ${DIST}/assets, found ${workerFiles.length}.`
  );
  process.exit(1);
}
const workerKb = gzipSync(readFileSync(join(DIST, "assets", workerFiles[0]))).length / 1024;
console.log(`\nStatement import worker (lazy):`);
console.log(
  `  ${workerKb.toFixed(1).padStart(7)} KB gz  ${workerFiles[0]} (budget: ${IMPORT_WORKER_BUDGET_KB} KB)`
);

if (totalKb > BUDGET_KB) {
  console.error(`\n❌ Initial bundle ${totalKb.toFixed(1)}KB exceeds ${BUDGET_KB}KB budget.`);
  process.exit(1);
}
if (workerKb > IMPORT_WORKER_BUDGET_KB) {
  console.error(
    `\n❌ Import worker ${workerKb.toFixed(1)}KB exceeds ${IMPORT_WORKER_BUDGET_KB}KB budget.`
  );
  process.exit(1);
}
console.log(`\n✅ Within budget.`);
