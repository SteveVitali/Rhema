#!/usr/bin/env node
// 267_R6SEC.2 (RH-8) — the `ci-pass anchor` job's leg gate.
//
// The anchor is the branch-ruleset's required check and now runs under `if: always()`, so it
// executes even when a needed leg failed, was skipped, or was cancelled. That is the honest
// half of the fix: GitHub counts a SKIPPED required check as PASSED, so the anchor must not be
// skippable — and once it always runs it must itself refuse to go green on a red pipeline.
//
// Reads NEEDS_JSON (`${{ toJSON(needs) }}`) and exits 1 unless every entry's `result` is exactly
// "success". A green anchor therefore always means every leg of the pipeline actually concluded
// green — failure, skip, and cancellation all fail here, ahead of any anchor write.

const die = (msg) => {
  console.error(`assert-needs-green: ${msg}`);
  process.exit(1);
};

let needs;
try {
  needs = JSON.parse(process.env.NEEDS_JSON ?? "");
} catch {
  die(`NEEDS_JSON is not valid JSON (got ${JSON.stringify(process.env.NEEDS_JSON ?? "")})`);
}

const entries = Object.entries(needs ?? {});
if (entries.length === 0) die("NEEDS_JSON held no jobs — refusing to assert an empty pipeline");

for (const [name, v] of entries) console.log(`${name}: ${v?.result ?? "(missing)"}`);
const bad = entries.filter(([, v]) => v?.result !== "success");
if (bad.length > 0) {
  die(
    `non-green legs — the anchor cannot pass on a red pipeline: ` +
      bad.map(([n, v]) => `${n}=${v?.result ?? "(missing)"}`).join(", "),
  );
}
console.log(`assert-needs-green: all ${entries.length} needed legs concluded success`);
