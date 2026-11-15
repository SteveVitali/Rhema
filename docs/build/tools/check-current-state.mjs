#!/usr/bin/env node
// Post-merge assertion (GD-OPS-RULES.R6, 2026-11-15): CURRENT STATE is exactly one
// heading + one fenced block of single-valued keys. Fails on stacked/duplicated blocks.
import { readFileSync } from "node:fs";
const t = readFileSync(process.argv[2] ?? "docs/build/LEDGER.md", "utf8");
const heads = (t.match(/^## CURRENT STATE/gm) ?? []).length;
if (heads !== 1) { console.error(`FAIL: ${heads} '## CURRENT STATE' headings`); process.exit(1); }
const seg = t.slice(t.indexOf("## CURRENT STATE"), t.indexOf("## OPEN FINDINGS"));
const keys = ["projectStatus","nextTicket","lastCompleted","blockedOn","pauseRequested","returnPass","manifest","canonicalSpec","memoryRoot","dispatchTarget","buildWorktree","buildBranchBase","pinnedBaseSha","chainTip","benchmarkSet","autonomy","mergePolicy","round","updatedAt"];
const m = seg.match(/```\n([\s\S]*?)\n```/);
if (!m) { console.error("FAIL: no fenced key block inside CURRENT STATE"); process.exit(1); }
const body = m[1];
for (const k of keys) {
  const hits = body.split("\n").filter(l => new RegExp(`^${k}:`).test(l.trim()));
  if (hits.length === 0) console.error(`FAIL: missing key '${k}'`);
  if (hits.length > 1) console.error(`FAIL: duplicate key '${k}' (${hits.length})`);
}
if (process.exitCode === 1) process.exit(1);
const stray = body.split("\n").filter(l => l.trim() && !keys.some(k => new RegExp(`^${k}:`).test(l.trim())));
if (stray.length) { console.error(`FAIL: unfenced/stray lines inside block: ${stray.length}`); process.exit(1); }
console.log(`OK: 1 heading, ${keys.length} keys fenced, no duplicates`);
