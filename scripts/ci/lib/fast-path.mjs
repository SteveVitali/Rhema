// R6CI.1 (operator insert 176a; ADR-115) — the fail-closed fast-path classifier.
//
// A `pull_request` head may run the *fast path* (guards + the committed docs-reader subset
// instead of the full legs) only when it is PROVABLY equivalent to a head a full green run
// already verified. Two independent proofs, either is sufficient:
//
//   gate (b) — every changed path SINCE the anchor's recorded head (`anchor_head…head`,
//     the compare API three-dot diff) must be allowlist-eligible: the anchor's green run
//     already covered everything up to its head, so only the delta needs proof. (The whole
//     PR-diff reading was rejected in Episteme ADR-0534 — it can never fast-path a docs
//     closeout on a code PR.) A code / workflow / `.gitleaks.toml` / boundary-tool path in
//     that delta runs full even when a same-tree anchor exists.
//   arm A (same-tree) — a `ci-pass-<h>` anchor artifact exists whose `<h>` equals this
//     head's non-docs tree hash (sha256 over the sorted `git ls-tree -r HEAD` listing with
//     fast-path-eligible paths stripped — what the run actually tested) AND gate (b) holds
//     AND the recorded head is a true ancestor. The hash binds the merge-tree content, so
//     no base-context check is needed — content equality is the proof.
//   arm B (pure-neutral descendant) — a `ci-pass-*` anchor's recorded `head_sha` is a true
//     ancestor of this PR head AND gate (b) holds AND the base context is preserved
//     (payload.base_sha equals this PR's base, or — for a branch-run anchor — the PR base
//     is an ancestor of head so the merge tree IS the head tree).
//
// The verifier trusts only `mode:"full"` producers whose run concluded `success` — a
// fast-path run never writes an anchor, so a `mode != "full"` payload is poison. Any
// evaluation error, ambiguity, or missing/invalid anchor yields `full` — never `fast`.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RULES_PATH = fileURLToPath(new URL("../fast-path-paths.txt", import.meta.url));
const MAX_CANDIDATES = 15; // newest-first evaluation bound — fail closed beyond it
const COMPARE_FILE_CAP = 300; // the compare API truncates `files[]` at 300 → ambiguous

// ── the committed allowlist ──────────────────────────────────────────────────
//
// Grammar: one rule per line; `#` comments and blank lines ignored. A rule ending in `/`
// subtree-matches every path under it; any other rule must equal the path exactly. A rule
// prefixed `!` is an exclusion — exclusions always win over inclusions (the deploy-neutral
// grammar plus carve-outs, so `docs/` can be included minus its boundary-tool subtrees).

export function loadFastPathRules(text = readFileSync(RULES_PATH, "utf8")) {
  const subtree = [];
  const exact = [];
  const noSubtree = [];
  const noExact = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const neg = line.startsWith("!");
    const rule = neg ? line.slice(1) : line;
    const sink = rule.endsWith("/") ? (neg ? noSubtree : subtree) : neg ? noExact : exact;
    sink.push(rule);
  }
  const included = (path) => exact.includes(path) || subtree.some((pre) => path.startsWith(pre));
  const excluded = (path) =>
    noExact.includes(path) || noSubtree.some((pre) => path.startsWith(pre));
  const isEligible = (path) => included(path) && !excluded(path);
  return Object.freeze({ subtree, exact, noSubtree, noExact, isEligible });
}

// ── the non-docs tree hash ───────────────────────────────────────────────────
//
// `git ls-tree -r HEAD` lines look like `100644 blob <sha>\t<path>`. The path follows the
// first tab. Eligible-path lines are dropped; the REST of the listing (mode+type+sha+path)
// is sorted and hashed — the hash therefore covers exactly the content the full legs can
// observe. Git C-quotes exotic paths (`"docs/…"`), which never satisfy `startsWith` — a
// fail-closed accident in our favour (the line stays in the hash, never eligible).

export function nonDocsTreeHash(lsTreeOutput, isEligible = loadFastPathRules().isEligible) {
  const kept = String(lsTreeOutput)
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l !== "")
    .filter((line) => {
      const tab = line.indexOf("\t");
      const path = tab === -1 ? line : line.slice(tab + 1);
      return !isEligible(path);
    })
    .sort();
  return createHash("sha256")
    .update(kept.join("\n") + "\n", "utf8")
    .digest("hex");
}

// ── anchor payloads ──────────────────────────────────────────────────────────
//
// Producer contract (a green FULL run uploads one tiny JSON artifact `ci-pass-<h>`):
//   { mode: "full", run_id, head_sha, non_docs_tree: <h> , base_sha? }
// `base_sha` is recorded for pull_request producers (the merge's base side); branch runs
// (push / workflow_dispatch) record null/absent and the verifier proves base-ancestry
// instead. Strict shape: wrong or missing fields → null → the candidate is invalid.

const SHA = /^[0-9a-f]{40}$/;
const TREEHASH = /^[0-9a-f]{64}$/;

export function parseAnchorPayload(jsonText) {
  let p;
  try {
    p = JSON.parse(String(jsonText));
  } catch {
    return null;
  }
  if (p === null || typeof p !== "object" || Array.isArray(p)) return null;
  if (typeof p.mode !== "string" || p.mode === "") return null;
  if (p.run_id === undefined || p.run_id === null || p.run_id === "") return null;
  if (typeof p.head_sha !== "string" || !SHA.test(p.head_sha)) return null;
  if (typeof p.non_docs_tree !== "string" || !TREEHASH.test(p.non_docs_tree)) return null;
  if (p.base_sha !== undefined && p.base_sha !== null && !SHA.test(p.base_sha)) return null;
  return p;
}

// ── candidate validation ─────────────────────────────────────────────────────
//
// A candidate = { name, artifact_run_id, run: {conclusion} | null, payload: <parsed>|null }.
// Verifier rules (ADR-115): the artifact name pins the tree hash; the producing run must
// exist and have concluded `success`; the payload's `run_id` must be the artifact's own run
// and its `non_docs_tree` must match the name's hash; `mode` must be `full` — a fast-path
// producer is *poison* (it never writes anchors, so one that did is untrustworthy).

export function validateCandidate(cand) {
  const m = /^ci-pass-([0-9a-f]{64})$/.exec(cand?.name ?? "");
  if (!m) return { ok: false, reason: "not-a-ci-pass-name" };
  if (!cand.run || cand.run.conclusion !== "success") {
    return { ok: false, reason: "producer-run-missing-or-not-success" };
  }
  if (!cand.payload) return { ok: false, reason: "payload-missing-or-unparseable" };
  if (cand.payload.mode !== "full") {
    return { ok: false, poison: true, reason: `poison: producer mode is '${cand.payload.mode}'` };
  }
  if (String(cand.payload.run_id) !== String(cand.artifact_run_id)) {
    return { ok: false, reason: "payload-run-id-mismatch" };
  }
  if (cand.payload.non_docs_tree !== m[1]) {
    return { ok: false, reason: "name-hash-mismatch" };
  }
  return { ok: true, treeHash: m[1] };
}

// ── the verdict ──────────────────────────────────────────────────────────────
//
// compare(base, head) → { ok:true, mergeBaseSha, files: [{filename, previous_filename?}] }
//                     | { ok:false, reason } — the compare API over `base...head`.
// candidates arrive newest-first; a `full` reason line always names the failing guard.

export function verdict({
  eventName,
  headSha,
  baseSha,
  nonDocsTree,
  candidates = [],
  compare = () => ({ ok: false, reason: "no-compare" }),
  isEligible = loadFastPathRules().isEligible,
}) {
  const full = (reason, extra = {}) => ({ mode: "full", reason, anchor: null, ...extra });
  const fast = (reason, payload) => ({
    mode: "fast",
    reason,
    anchor: { run_id: payload.run_id, head_sha: payload.head_sha },
  });

  if (eventName !== "pull_request") return full(`not-a-pull-request (${eventName})`);
  if (!nonDocsTree || !TREEHASH.test(nonDocsTree)) return full("non-docs-tree-hash-unavailable");
  if (!headSha || !SHA.test(headSha)) return full("head-sha-unavailable");

  const sameTreeName = `ci-pass-${nonDocsTree}`;
  const evaluated = candidates.slice(0, MAX_CANDIDATES);

  // A same-name anchor that fails validation is poison: never resolve "which one" — full.
  for (const c of evaluated) {
    if (c?.name === sameTreeName) {
      const v = validateCandidate(c);
      if (!v.ok) return full(`same-tree anchor invalid: ${v.reason}`);
    }
  }

  // One pass, newest first. Every anchor — same-tree or not — vouches only when the commits
  // SINCE its recorded head are provably all-eligible and its head is a true ancestor
  // (contract gate (b): "every changed path base…head" is the delta the anchor cannot
  // already cover — the Episteme precedent rejected the whole-PR-diff reading).
  for (const c of evaluated) {
    const v = validateCandidate(c);
    if (!v.ok) continue; // candidates that cannot be verified cannot vouch
    const p = c.payload;
    const d = compare(p.head_sha, headSha);
    if (!d.ok) continue; // compare unavailable for this pair → cannot vouch
    if (d.truncated || !Array.isArray(d.files) || d.files.length >= COMPARE_FILE_CAP) {
      continue; // ambiguous diff → cannot vouch
    }
    if (d.mergeBaseSha !== p.head_sha) continue; // not a descendant of the green head
    const changed = [];
    for (const f of d.files) {
      changed.push(f.filename);
      if (f.previous_filename) changed.push(f.previous_filename);
    }
    if (!changed.every((path) => isEligible(path))) continue;
    if (c.name === sameTreeName) {
      // Arm A — the hash binds the merge-tree content; gate (b) + ancestry proved above.
      return fast(
        `same-tree anchor ${sameTreeName.slice(0, 20)}… (run ${p.run_id}) — ${p.head_sha.slice(0, 7)} ancestor, delta all-eligible`,
        p,
      );
    }
    // Arm B — a different tree hash vouches only when the base context is preserved.
    if (p.base_sha) {
      // A PR-run anchor vouches only for the same merge base — a moved base changes the
      // merge tree's non-docs content invisibly to the descendant diff.
      if (p.base_sha !== baseSha) continue;
    } else {
      // A branch-run anchor (push/dispatch verified the bare head tree) vouches only when
      // the merge tree IS the head tree — i.e. the PR base is an ancestor of head.
      const bd = compare(baseSha, headSha);
      if (!bd.ok || bd.mergeBaseSha !== baseSha) continue;
    }
    return fast(
      `pure-neutral descendant of green head ${p.head_sha.slice(0, 7)} (run ${p.run_id})`,
      p,
    );
  }

  return full("no-valid-anchor");
}
