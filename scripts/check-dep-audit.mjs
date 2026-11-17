#!/usr/bin/env node
/**
 * CI `public-safe` dependency-advisory gate (BL-114; 292_R6FIX.27). Runs `pnpm audit --prod --json`
 * against the committed lockfile and classifies every advisory against
 * `scripts/dep-audit-baseline.json`:
 *
 *   - advisory at severity >= `failFloor` (high) that is NOT in the baseline → FAIL. A new GHSA on
 *     a shipped dependency lands as a failing leg — the whole point of the gate.
 *   - advisory in the baseline with `status: "accepted"` → counted, printed with its ruling cite.
 *   - advisory in the baseline with `status: "pending-triage"` → counted, printed as a known
 *     pre-existing finding whose disposition is owed; never silently "accepted".
 *
 * The floor is `--prod` scope by construction: dev/transitive-only findings (the ~99 the BL row
 * measured) are excluded from the failing class. The full report still prints every severity so
 * the classification is visible, not hidden behind the exit code.
 *
 * Exit 0 on clean/known-only, 1 on new >=high advisories or a malformed run (network/registry
 * failure surfaces honestly — never a silent pass).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FAIL_FLOOR = ["high", "critical"];
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

let audit;
try {
  // pnpm audit exits non-zero whenever ANY advisory exists — the JSON on stdout is the payload.
  const out = execFileSync("pnpm", ["audit", "--prod", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  audit = JSON.parse(out);
} catch (err) {
  if (err.stdout) {
    try {
      audit = JSON.parse(err.stdout);
    } catch {
      /* fall through to the honest failure below */
    }
  }
  if (!audit) {
    console.error(`[check:dep-audit] pnpm audit --prod failed and produced no JSON: ${err.message}`);
    process.exit(1);
  }
}

const baseline = JSON.parse(readFileSync(join(ROOT, "scripts/dep-audit-baseline.json"), "utf8"));
const known = new Map(baseline.advisories.map((b) => [String(b.id), b]));

const advisories = Object.values(audit.advisories ?? {});
const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const failing = [];
const pending = [];
const accepted = [];

for (const a of advisories) {
  counts[a.severity] = (counts[a.severity] ?? 0) + 1;
  const entry = known.get(String(a.id));
  if (!entry) {
    if (FAIL_FLOOR.includes(a.severity)) failing.push(a);
    continue;
  }
  if (entry.status === "accepted") accepted.push([a, entry]);
  else pending.push([a, entry]);
  // A baselined advisory that escalated past its recorded severity fails like a new finding.
  if (RANK[a.severity] > RANK[entry.severity]) failing.push(a);
}

console.log(
  `[check:dep-audit] pnpm audit --prod: ${advisories.length} advisories — ` +
    FAIL_FLOOR.length +
    "-severity floor (high/critical) applies to NEW findings only",
);
console.log(
  `  severity counts: critical=${counts.critical} high=${counts.high} moderate=${counts.moderate} low=${counts.low} info=${counts.info}`,
);
console.log(
  `  baseline: ${pending.length} pending-triage · ${accepted.length} accepted · ${failing.length} NEW/escalated >=high`,
);

for (const [a] of pending) {
  console.log(`  [pending-triage] ${a.severity} ${a.module_name} — ${a.title}`);
}
for (const [a, e] of accepted) {
  console.log(`  [accepted] ${a.severity} ${a.module_name} — ${a.title} (${e.note})`);
}
for (const a of failing) {
  console.error(`  [FAIL] ${a.severity} ${a.module_name} — ${a.title} <${a.url}>`);
}

if (failing.length > 0) {
  console.error(
    `[check:dep-audit] ${failing.length} advisory(ies) at >=high not in the baseline. ` +
      `Bump the dependency, or if the finding genuinely does not reach a shipped surface, ` +
      `add it to scripts/dep-audit-baseline.json as pending-triage — accepted entries require ` +
      `an operator security ruling cited in the note.`,
  );
  process.exit(1);
}
console.log("[check:dep-audit] no new >=high advisories — gate green");
