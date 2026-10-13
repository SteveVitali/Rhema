# REC.3 — integration plan

Manifest row 91 · reconcile-build `mode=integration` · stacks on
`stevevitali/rec-2-spec-reconciliation` (PR #112) · merge policy **OPERATOR** — do not merge
from the build environment · docs-only, **$0** · **this PR merges nothing**.

## What lands

- **`docs/build/INTEGRATION_PLAN.md`** — the operator's plan to land the unmerged stack:
  - Scope corrected to live state: PRs #1–#69 already merged; the stack is **43 open PRs
    #70–#112** (+ this PR). `main` = `5009487`; chain still descends from it.
  - **Read-only merge dry-run** (`merge-dryrun.sh` / `git merge-tree` — never merges):
    **43/43 clean pairwise and 43/43 clean onto `main`, 0 conflicts.** Evidence:
    `docs/build/reports/REC.3/merge-dryrun-{vs-main.json,pairwise.txt}`.
  - CI states read (not fixed): 20 green · **21 red** · 2 pending — every red classified:
    transient single-test snapshot reds on #90/#91/#94/#97; **two standing reds** —
    `public-safe` never-cookies on the `rhema_fp` construct (#92→tip) and the privsep kernel
    legs in CI Docker (#101→tip); #76's GitHub `CONFLICTING` proven stale by merge-tree.
  - Merge order (strictly bottom-up), strategies (merge commit recommended — preserves
    deployed SHAs for REQ-ARCH-39; squash/rebase rejected), the stacked-PR retarget caveat,
    copy-pasteable operator procedure, rollback (`revert -m 1`, top-down), post-merge
    verification.
  - **Provenance reconciliation §9** — deployed chain-tip SHAs (`b909fe9a` prod; `5baa666`
    pending) reconcile tree-for-tree with post-merge `main`: ancestry under merge commits,
    tree-equality fallback documented; merge SHAs differ, the check is **tree equality, not
    SHA equality**.
- **`docs/build/reports/RELEASE_NOTES_DRAFT.md`** — draft release notes over all ~113 landed rows
  from BUILD_INDEX: highlights, per-PR features grouped by phase, breaking changes, known
  gaps. Operator edits before publishing.
- **`docs/build/planning/2026-10-04_decision-memo.md`** — the round-4 seed skeleton: open
  operator rulings (GD-RES.2-1/GD-ACT.1-1/GD-BILL.3-1/BL-30/metered flip/CITE.1 cap/CI-reds),
  the **H2→G2 LIFT path** (BL-40→43→44→45) and **BL-31** on it, the 77-row backlog by
  landing, candidate round-4 lanes.
- **Closeout:** `runs/REC.3.md` · this file · `BUILD_INDEX.md` row · `LEDGER.md` advanced
  (`lastCompleted: REC.3`, `nextTicket: 92_DOC.1__repo-docs-refresh.md` row 92,
  `chainTip: stevevitali/rec-3-integration-plan`, `projectStatus` stays **IN_PROGRESS**).

## Verification

- `check-append-only.mjs --base 498fe89` → OK
- `check-build-memory.sh .` → 0 violations (baseline warnings unchanged)
- Dry-run is read-only: `git merge-tree` / `--no-commit` semantics only; `gh` used for
  list/view/checks reads; **`gh pr merge` never invoked**; nothing pushed to `main`
- No live stage · **$0 metered** · zero prod writes/deploys · no live verification claimed

## Requirement ids stamped

REQ-ARCH-38 · REQ-ARCH-39 (deploy/run provenance — the reconciliation target) ·
REQ-ARCH-40 · REQ-ARCH-34 (SLO verification posture) · REQ-ARCH-36 (smoke/diff gates in the
post-merge check).
