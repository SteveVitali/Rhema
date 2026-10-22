#!/usr/bin/env node
// R6CI.1 (operator insert 176a; ADR-115) — the `fast-path` job's decide step.
//
// Computes this head's non-docs tree hash over the checked-out merge tree, resolves any
// `ci-pass-<h>` anchor artifacts repo-wide via the Actions API, and emits the verdict:
//   $GITHUB_OUTPUT   mode=fast|full · non_docs_tree · head_sha · base_sha · reason
//   notice           ::notice title=CI-FAST-PATH:: / CI-FULL-PATH::
//   step summary     one line distinguishing fast from full
// Everything is fail-closed: any error, API failure, or unparseable response → mode=full.
// The verdict is consumed by every other job via `needs.fast-path.outputs.mode`.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadFastPathRules,
  nonDocsTreeHash,
  parseAnchorPayload,
  verdict,
} from "./lib/fast-path.mjs";

const env = process.env;
const eventName = env.GITHUB_EVENT_NAME ?? "";
const repo = env.GITHUB_REPOSITORY ?? "";
const headSha = (env.PR_HEAD_SHA || env.GITHUB_SHA || "").trim();
const baseSha = (env.PR_BASE_SHA || "").trim();

const fail = (reason, treeHash = "") => emit({ mode: "full", reason, anchor: null }, treeHash);

function emit(v, treeHash) {
  const reason = String(v.reason)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 400);
  if (env.GITHUB_OUTPUT) {
    appendFileSync(
      env.GITHUB_OUTPUT,
      `mode=${v.mode}\nnon_docs_tree=${treeHash}\nhead_sha=${headSha}\nbase_sha=${baseSha}\nreason=${reason}\n`,
    );
  }
  const title = v.mode === "fast" ? "CI-FAST-PATH" : "CI-FULL-PATH";
  console.log(`::notice title=${title}::${reason}`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `- **${title}** — \`fast-path\` decide — ${reason}\n`);
  }
  console.log(`decide: mode=${v.mode} reason=${reason}`);
}

const gh = (api) =>
  execFileSync("gh", ["api", api], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const ghJson = (api) => JSON.parse(gh(api));

// `gh api --paginate --jq` emits one NDJSON object per page-match.
const ghNdjson = (api, jq) =>
  execFileSync("gh", ["api", "--paginate", "--jq", jq, api], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));

const compare = (base, head) => {
  try {
    const res = ghJson(`repos/${repo}/compare/${base}...${head}`);
    const files = Array.isArray(res.files) ? res.files : [];
    return {
      ok: true,
      mergeBaseSha: res.merge_base_commit?.sha ?? "",
      files,
      truncated: files.length >= 300,
    };
  } catch (e) {
    return {
      ok: false,
      reason: `compare ${base}...${head}: ${String(e.stderr ?? e).slice(0, 200)}`,
    };
  }
};

// Download + extract the payload of one artifact (`unzip` is on every ubuntu-latest runner).
const fetchPayload = (artifactId) => {
  const dir = mkdtempSync(join(tmpdir(), "ci-pass-"));
  const zipPath = join(dir, "a.zip");
  const zip = execFileSync("gh", ["api", `repos/${repo}/actions/artifacts/${artifactId}/zip`], {
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(zipPath, zip);
  const entry = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .split("\n")
    .filter((n) => n.endsWith(".json"))[0];
  if (!entry) return null;
  const body = execFileSync("unzip", ["-p", zipPath, entry], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return parseAnchorPayload(body);
};

function main() {
  const rules = loadFastPathRules();

  // The non-docs tree hash — over the checked-out HEAD (the merge tree on pull_request).
  let treeHash = "";
  try {
    const ls = execFileSync("git", ["ls-tree", "-r", "HEAD"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    treeHash = nonDocsTreeHash(ls, rules.isEligible);
  } catch (e) {
    return fail(`ls-tree failed: ${String(e.stderr ?? e).slice(0, 200)}`);
  }

  if (eventName !== "pull_request") {
    // Push / dispatch heads always run full — the anchor job still uploads so later PR
    // heads can reuse this green verdict (D5 governs reuse the other way: main never
    // consumes an anchor).
    return emit(
      verdict({ eventName, headSha, baseSha, nonDocsTree: treeHash, isEligible: rules.isEligible }),
      treeHash,
    );
  }

  // Resolve anchor candidates, newest first.
  let candidates;
  try {
    candidates = ghNdjson(
      `repos/${repo}/actions/artifacts?per_page=100`,
      '.artifacts[] | select(.name | startswith("ci-pass-")) | select(.expired | not) | {id, name, created_at, run_id: .workflow_run.id}',
    ).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  } catch (e) {
    return fail(`artifact list failed: ${String(e.stderr ?? e).slice(0, 200)}`, treeHash);
  }

  const resolved = [];
  for (const a of candidates.slice(0, 15)) {
    let run = null;
    try {
      const r = ghJson(`repos/${repo}/actions/runs/${a.run_id}`);
      run = { id: r.id, conclusion: r.conclusion };
    } catch {
      run = null;
    }
    let payload = null;
    try {
      payload = fetchPayload(a.id);
    } catch {
      payload = null;
    }
    resolved.push({ name: a.name, artifact_run_id: a.run_id, run, payload });
  }

  const v = verdict({
    eventName,
    headSha,
    baseSha,
    nonDocsTree: treeHash,
    candidates: resolved,
    compare,
    isEligible: rules.isEligible,
  });
  emit(v, treeHash);
}

try {
  main();
} catch (e) {
  fail(`decide crashed: ${String(e).slice(0, 200)}`);
}
