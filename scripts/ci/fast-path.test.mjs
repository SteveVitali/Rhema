// R6CI.1 (operator insert 176a; ADR-115) — the fail-closed fast-path classifier tests.
//
// Every AC row of the contract's first acceptance criterion is a named case here:
//   docs-only head → eligible; code head, workflow touch, `.gitleaks.toml` diff,
//   `docs/build/tools/**` or `docs/build/record_policy/**` touch, ambiguous diff,
//   missing/invalid anchor, fast-mode producer → each classified `full`.
// `verdict()` is pure — gh/git IO is injected — so the whole matrix runs deterministically.

import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadFastPathRules,
  nonDocsTreeHash,
  parseAnchorPayload,
  validateCandidate,
  verdict,
} from "./lib/fast-path.mjs";

const COMMITTED_RULES = readFileSync(new URL("./fast-path-paths.txt", import.meta.url), "utf8");
const rules = loadFastPathRules(COMMITTED_RULES);
const { isEligible } = rules;

const H = "a".repeat(64); // a non-docs tree hash
const HEAD = "d".repeat(40);
const BASE = "b".repeat(40);
const C_HEAD = "c".repeat(40); // an anchor's recorded head_sha

// ── helpers ──────────────────────────────────────────────────────────────────

const anchor = (over = {}) => {
  const { payload: pOver, ...rest } = over;
  return {
    name: `ci-pass-${H}`,
    created_at: "2026-10-20T00:00:00Z",
    artifact_run_id: 100,
    run: { id: 100, conclusion: "success" },
    payload:
      "payload" in over
        ? pOver === null
          ? null
          : {
              mode: "full",
              run_id: 100,
              head_sha: C_HEAD,
              non_docs_tree: H,
              base_sha: BASE,
              ...pOver,
            }
        : { mode: "full", run_id: 100, head_sha: C_HEAD, non_docs_tree: H, base_sha: BASE },
    ...rest,
  };
};

const compare = (table) => (base, head) => {
  const hit = table[`${base}...${head}`];
  if (!hit) return { ok: false, reason: `no-stub ${base}...${head}` };
  return hit;
};

const eligibleDiff = {
  ok: true,
  mergeBaseSha: C_HEAD,
  files: [{ filename: "docs/build/runs/X.md" }, { filename: "docs/adr/ADR-999-x.md" }],
};

// Contract gate (b): compare(anchor_head…head) — the commits SINCE the anchor's recorded
// head — must be all-eligible (the anchor's green run already covered everything up to its
// head). The whole-PR-diff reading was rejected in Episteme ADR-0534: it can never
// fast-path a docs closeout on a code PR.
const baseDiffEligible = {
  ok: true,
  mergeBaseSha: BASE,
  files: [{ filename: "docs/build/runs/X.md" }, { filename: "docs/development.md" }],
};

// ── the committed allowlist ──────────────────────────────────────────────────

describe("fast-path-paths.txt — grammar + the committed list", () => {
  test("parses subtree, exact and negation rules; comments/blanks ignored", () => {
    const r = loadFastPathRules("# c\n\nfoo/\nbar.txt\n!foo/skip/\n!baz.txt\n");
    expect(r.isEligible("foo/a.md")).toBe(true);
    expect(r.isEligible("bar.txt")).toBe(true);
    expect(r.isEligible("bar.txt2")).toBe(false);
    expect(r.isEligible("foo/skip/x.md")).toBe(false);
    expect(r.isEligible("baz.txt")).toBe(false);
    expect(r.isEligible("other/x")).toBe(false);
  });

  test("committed list = deploy-neutral minus .gitleaks.toml / tools / record_policy", () => {
    const corpus = [
      ["docs/build/runs/X.md", true],
      ["docs/tickets/00_MANIFEST.md", true],
      ["docs/adr/ADR-115-x.md", true],
      ["docs/development.md", true],
      ["docs/research/x.md", true],
      ["docs/build/LEDGER.md", true],
      ["docs/build/BUILD_INDEX.md", true],
      ["docs/build/tools/check-append-only.mjs", false],
      ["docs/build/tools/record_policy/ci_required.txt", false],
      ["docs/build/tools/record_policy/history.policy", false],
      ["docs/build/record_policy/ci_required.txt", false],
      [".gitleaks.toml", false],
      [".github/workflows/ci.yml", false],
      [".github/workflows/journeys.yml", false],
      ["scripts/ci/fast-path-paths.txt", false],
      ["packages/db/src/x.ts", false],
      ["README.md", false],
      ["AGENTS.md", false],
    ];
    for (const [path, want] of corpus) expect(isEligible(path), path).toBe(want);
  });
});

// ── non-docs tree hash ───────────────────────────────────────────────────────

describe("nonDocsTreeHash — sha256 over ls-tree minus eligible paths", () => {
  const ls = (lines) => lines.join("\n") + "\n";
  const tree = ls([
    `100644 blob 111\tdocs/build/runs/X.md`,
    `100644 blob 222\tpackages/db/src/x.ts`,
    `100644 blob 333\t.github/workflows/ci.yml`,
  ]);

  test("eligible paths are stripped; hash is order-independent", () => {
    const h1 = nonDocsTreeHash(tree, isEligible);
    const h2 = nonDocsTreeHash(ls(tree.trim().split("\n").reverse()), isEligible);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
  });

  test("a docs-only change leaves the hash identical; a code change moves it", () => {
    const h = nonDocsTreeHash(tree, isEligible);
    const docsChanged = nonDocsTreeHash(
      ls([
        `100644 blob 999\tdocs/build/runs/X.md`,
        `100644 blob 222\tpackages/db/src/x.ts`,
        `100644 blob 333\t.github/workflows/ci.yml`,
      ]),
      isEligible,
    );
    const codeChanged = nonDocsTreeHash(
      ls([
        `100644 blob 111\tdocs/build/runs/X.md`,
        `100644 blob 888\tpackages/db/src/x.ts`,
        `100644 blob 333\t.github/workflows/ci.yml`,
      ]),
      isEligible,
    );
    expect(docsChanged).toBe(h);
    expect(codeChanged).not.toBe(h);
  });

  test("git-C-quoted docs paths never match the prefix and stay in the hash", () => {
    const quoted = ls([
      `100644 blob 111\t"docs/quo\\303\\251.md"`,
      `100644 blob 222\tpackages/db/src/x.ts`,
    ]);
    const plain = ls([`100644 blob 111\tdocs/q.md`, `100644 blob 222\tpackages/db/src/x.ts`]);
    // The C-quoted entry is NOT stripped (it fails the startsWith check) → hash differs.
    expect(nonDocsTreeHash(quoted, isEligible)).not.toBe(nonDocsTreeHash(plain, isEligible));
  });
});

// ── anchor payload + candidate validation ────────────────────────────────────

describe("anchor validation — producer contract + verifier rules", () => {
  test("strict payload parse: every required field, or null", () => {
    expect(
      parseAnchorPayload(
        JSON.stringify({ mode: "full", run_id: 100, head_sha: C_HEAD, non_docs_tree: H }),
      ),
    ).toMatchObject({ mode: "full", run_id: 100, head_sha: C_HEAD });
    for (const bad of [
      "{}",
      JSON.stringify({ mode: "full", run_id: 100, head_sha: C_HEAD }), // no tree
      JSON.stringify({ mode: "full", run_id: 100, head_sha: "zzz", non_docs_tree: H }),
      JSON.stringify({ mode: "full", run_id: 100, head_sha: C_HEAD, non_docs_tree: "xyz" }),
      "not json",
      "42",
      "null",
    ]) {
      expect(parseAnchorPayload(bad), bad).toBeNull();
    }
  });

  test("validateCandidate: success + mode full + run_id match + name/hash match", () => {
    expect(validateCandidate(anchor()).ok).toBe(true);
    // a fast-mode producer is poison
    expect(validateCandidate(anchor({ payload: { mode: "fast" } })).ok).toBe(false);
    // run not green → invalid
    expect(validateCandidate(anchor({ run: { id: 100, conclusion: "failure" } })).ok).toBe(false);
    // missing run → invalid
    expect(validateCandidate(anchor({ run: null })).ok).toBe(false);
    // unparseable/absent payload → invalid
    expect(validateCandidate(anchor({ payload: null })).ok).toBe(false);
    // run_id mismatch between artifact and payload → invalid
    expect(validateCandidate(anchor({ payload: { run_id: 999 } })).ok).toBe(false);
    // name hash disagrees with payload tree → invalid
    expect(validateCandidate(anchor({ name: `ci-pass-${"9".repeat(64)}` })).ok).toBe(false);
  });
});

// ── verdict — the AC matrix ─────────────────────────────────────────────────

describe("verdict — fail-closed fast-path classification", () => {
  const baseInput = () => ({
    eventName: "pull_request",
    headSha: HEAD,
    baseSha: BASE,
    nonDocsTree: H,
    candidates: [],
    compare: compare({}),
  });

  test("non-pull_request events always run full", () => {
    for (const ev of ["push", "workflow_dispatch", "schedule"]) {
      expect(verdict({ ...baseInput(), eventName: ev, candidates: [anchor()] }).mode).toBe("full");
    }
  });

  test("docs-only head with a same-tree anchor → fast (arm A)", () => {
    // The hosted-proof shape: a code head ran full (anchor recorded), then a docs-only
    // push — anchor head is an ancestor, the delta is all-eligible, the hash matches.
    const v = verdict({
      ...baseInput(),
      candidates: [anchor()],
      compare: compare({ [`${C_HEAD}...${HEAD}`]: eligibleDiff }),
    });
    expect(v.mode).toBe("fast");
    expect(v.reason).toContain("same-tree");
  });

  test("docs-only head as a pure-neutral descendant → fast (arm B)", () => {
    const cand = anchor({ payload: { non_docs_tree: "e".repeat(64) } });
    cand.name = `ci-pass-${"e".repeat(64)}`;
    const v = verdict({
      ...baseInput(),
      candidates: [cand],
      compare: compare({ [`${C_HEAD}...${HEAD}`]: eligibleDiff }),
    });
    expect(v.mode).toBe("fast");
    expect(v.reason).toContain("descendant");
  });

  test("code head → full even when a same-tree anchor exists (delta since anchor has code)", () => {
    // e.g. code + revert netting an identical tree — the commit-level delta still touched
    // code, so the anchor cannot vouch (Episteme ADR-0534's condition-3 hole, closed).
    const v = verdict({
      ...baseInput(),
      candidates: [anchor()], // same-tree anchor present — the delta check must still fire
      compare: compare({
        [`${C_HEAD}...${HEAD}`]: {
          ...eligibleDiff,
          files: [{ filename: "docs/x.md" }, { filename: "packages/db/src/x.ts" }],
        },
      }),
    });
    expect(v.mode).toBe("full");
  });

  test.each([".github/workflows/ci.yml", ".github/workflows/journeys.yml"])(
    "workflow touch %s in the delta since the anchor → full",
    (filename) => {
      const v = verdict({
        ...baseInput(),
        candidates: [anchor()],
        compare: compare({
          [`${C_HEAD}...${HEAD}`]: { ...eligibleDiff, files: [{ filename }] },
        }),
      });
      expect(v.mode).toBe("full");
    },
  );

  test(".gitleaks.toml in the delta since the anchor → full", () => {
    const v = verdict({
      ...baseInput(),
      candidates: [anchor()],
      compare: compare({
        [`${C_HEAD}...${HEAD}`]: { ...eligibleDiff, files: [{ filename: ".gitleaks.toml" }] },
      }),
    });
    expect(v.mode).toBe("full");
  });

  test.each([
    "docs/build/tools/check-append-only.mjs",
    "docs/build/tools/record_policy/ci_required.txt",
    "docs/build/record_policy/history.policy",
  ])("boundary-tool path %s in the delta since the anchor → full", (filename) => {
    const v = verdict({
      ...baseInput(),
      candidates: [anchor()],
      compare: compare({
        [`${C_HEAD}...${HEAD}`]: { ...eligibleDiff, files: [{ filename }] },
      }),
    });
    expect(v.mode).toBe("full");
  });

  test("a rename's previous_filename must also be eligible", () => {
    const v = verdict({
      ...baseInput(),
      candidates: [anchor()],
      compare: compare({
        [`${C_HEAD}...${HEAD}`]: {
          ...eligibleDiff,
          files: [{ filename: "docs/moved.md", previous_filename: "src/moved.ts" }],
        },
      }),
    });
    expect(v.mode).toBe("full");
  });

  test("ambiguous diff (compare error / truncated files) → full", () => {
    expect(verdict({ ...baseInput(), candidates: [anchor()], compare: compare({}) }).mode).toBe(
      "full",
    ); // no stub → compare error → the anchor cannot vouch → full
    const truncated = {
      ok: true,
      mergeBaseSha: C_HEAD,
      files: Array.from({ length: 300 }, (_, i) => ({ filename: `docs/f${i}.md` })),
      truncated: true,
    };
    expect(
      verdict({
        ...baseInput(),
        candidates: [anchor()],
        compare: compare({ [`${C_HEAD}...${HEAD}`]: truncated }),
      }).mode,
    ).toBe("full");
  });

  test("missing anchor (no candidates) → full", () => {
    expect(verdict(baseInput()).mode).toBe("full");
  });

  test("invalid anchor → full (failed run / bad payload / fast-mode producer)", () => {
    for (const cand of [
      anchor({ run: { id: 100, conclusion: "failure" } }),
      anchor({ payload: null }),
      anchor({ payload: { mode: "fast" } }),
    ]) {
      expect(verdict({ ...baseInput(), candidates: [cand] }).mode).toBe("full");
    }
  });

  test("non-ancestor candidate head (merge_base ≠ recorded head) → full", () => {
    const cand = anchor({ payload: { non_docs_tree: "e".repeat(64) } });
    cand.name = `ci-pass-${"e".repeat(64)}`;
    const v = verdict({
      ...baseInput(),
      candidates: [cand],
      compare: compare({
        [`${C_HEAD}...${HEAD}`]: { ...eligibleDiff, mergeBaseSha: "f".repeat(40) },
      }),
    });
    expect(v.mode).toBe("full");
  });

  test("a same-tree anchor on a non-ancestor lineage cannot vouch → full", () => {
    const v = verdict({
      ...baseInput(),
      candidates: [anchor()], // name matches this head's hash…
      compare: compare({
        [`${C_HEAD}...${HEAD}`]: { ...eligibleDiff, mergeBaseSha: "f".repeat(40) }, // …but not ancestor
      }),
    });
    expect(v.mode).toBe("full");
  });

  test("base moved (payload.base_sha ≠ this base) defeats the descendant arm → full", () => {
    const MOVED = "0".repeat(40);
    const cand = anchor({ payload: { non_docs_tree: "e".repeat(64) } });
    cand.name = `ci-pass-${"e".repeat(64)}`;
    const v = verdict({
      ...baseInput(),
      candidates: [cand],
      baseSha: MOVED,
      compare: compare({
        [`${C_HEAD}...${HEAD}`]: eligibleDiff, // delta clean — but the anchor's base context moved
      }),
    });
    expect(v.mode).toBe("full");
  });

  test("branch-run anchor (no base_sha) needs the merge base to be the PR base", () => {
    const cand = anchor({ payload: { non_docs_tree: "e".repeat(64), base_sha: null } });
    cand.name = `ci-pass-${"e".repeat(64)}`;
    // base IS an ancestor of head → merge tree = head tree → sound
    const ok = verdict({
      ...baseInput(),
      candidates: [cand],
      compare: compare({
        [`${C_HEAD}...${HEAD}`]: eligibleDiff,
        [`${BASE}...${HEAD}`]: { ...baseDiffEligible, mergeBaseSha: BASE },
      }),
    });
    expect(ok.mode).toBe("fast");
    // base NOT an ancestor → the merge tree was never tested → full
    const bad = verdict({
      ...baseInput(),
      candidates: [cand],
      compare: compare({
        [`${C_HEAD}...${HEAD}`]: eligibleDiff,
        [`${BASE}...${HEAD}`]: { ...baseDiffEligible, mergeBaseSha: "f".repeat(40) },
      }),
    });
    expect(bad.mode).toBe("full");
  });

  test("missing non-docs tree hash → full", () => {
    expect(verdict({ ...baseInput(), nonDocsTree: "", candidates: [anchor()] }).mode).toBe("full");
  });
});

// ── the workflow pins + the neutral-readers audit ────────────────────────────

describe("ci.yml carries the pinned fast-path wiring", () => {
  const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

  test("workflow_dispatch, pinned concurrency, actions:read, anchor job", () => {
    expect(ci).toContain("workflow_dispatch:");
    expect(ci).toContain(
      "group: ci-${{ github.event_name == 'pull_request' && github.ref || github.sha }}",
    );
    expect(ci).toContain("cancel-in-progress: true");
    expect(ci).toContain("actions: read");
    expect(ci).toContain("ci-pass-");
    expect(ci).toContain("CI-FAST-PATH");
    expect(ci).toContain("needs.fast-path.outputs.mode");
  });

  test("gitleaks + check:no-cookies run unconditionally (no fast-path if:)", () => {
    const gl = ci.match(/- name: gitleaks[\s\S]*?(?=\n\s+- name:|\n\s+- uses:|\n\n)/)?.[0] ?? "";
    expect(gl).not.toContain("needs.fast-path.outputs.mode");
    const nc =
      ci.match(/- name: never-cookies[\s\S]*?(?=\n\s+- name:|\n\s+- uses:|\n\n)/)?.[0] ?? "";
    expect(nc).not.toContain("needs.fast-path.outputs.mode");
  });

  test("the contracts duplicate vitest leg is gone", () => {
    expect(ci).not.toContain("vitest run packages/contracts packages/db");
  });
});

describe("scripts/ci/neutral-readers.txt — the committed docs-reader audit", () => {
  const list = readFileSync(new URL("./neutral-readers.txt", import.meta.url), "utf8");
  const entries = list
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));

  test("every listed test file exists", () => {
    for (const e of entries)
      expect(existsSync(new URL(`../../${e}`, import.meta.url)), e).toBe(true);
  });

  test("the five known readers are listed", () => {
    for (const e of [
      "scripts/check-coverage-matrix.test.mjs",
      "scripts/deferral-status-parity.test.mjs",
      "packages/security-checks/src/observability.test.ts",
      "packages/security-checks/src/secrets-manifests.test.ts",
      "packages/journeys/src/registry.test.ts",
    ]) {
      expect(entries).toContain(e);
    }
  });

  test("single-line audit re-run: every same-line fs-read of a neutral path is listed", () => {
    // Mirrors the recorded audit's mechanical leg: test files where an fs-read call and a
    // deploy-neutral path literal share one line must all appear in the committed list.
    // (Multi-line reads are the manual dispositions enumerated in the file's header.)
    const out = execFileSync(
      "bash",
      [
        "-c",
        `grep -rlE "(readFileSync|readFile|readdirSync|readdir|existsSync|readJsonSync|globSync)\\s*\\([^)]*(docs/|\\.gitleaks\\.toml)" --include='*.test.ts' --include='*.test.tsx' --include='*.test.mjs' packages apps scripts infra integration tools 2>/dev/null | sort`,
      ],
      { cwd: fileURLToPath(new URL("../..", import.meta.url)), encoding: "utf8" },
    );
    const hits = out.split("\n").filter(Boolean);
    for (const h of hits) {
      expect(entries, `${h} reads a neutral path on one line but is not listed`).toContain(h);
    }
  });
});
