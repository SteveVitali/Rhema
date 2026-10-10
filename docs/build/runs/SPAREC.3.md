# SPAREC.3 — run ledger: integration plan (the round-4 merge + activation plan)

- **Ticket:** `docs/tickets/146_SPAREC.3__integration-plan.md` (manifest row 146)
- **Base:** `stevevitali/sparec-2-spec-reconciliation` @ `d263808` (the chain tip,
  confirmed clean + synced at fork — `d26380817b072ce15e33eead35c181e8a3fadd94`).
- **Branch:** `stevevitali/sparec-3-integration-plan`.
- **PR:** #167 stacked on `stevevitali/sparec-2-spec-reconciliation`;
  `gh pr checks --watch=false` read once at closeout (§ 8).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** `reconcile-build mode=integration` — writes the plan the operator
  executes; never merges, never deploys. Offline-only, $0, no prod mutations,
  mergePolicy OPERATOR.
- **Spend:** $0.

## 1 — What this run is

The round-4 tail's integration row: append to `docs/build/INTEGRATION_PLAN.md` the
complete, executable merge + activation plan for the ~50-PR round-4 stack — the
operator-executable answer to "how does this chain land without a tip-only deploy".
The plan is `SPACAP.2_COMPOSED_VERIFICATION.md` §3's 15-segment cadence refined to
today's live git/GitHub state, composed against the round-3 chain it sits on, with
the deploy/legs/bake recipes verbatim and every stop condition named. **This run
merges nothing and deploys nothing** — it re-reads state and writes the plan.

## 2 — What landed

`docs/build/INTEGRATION_PLAN.md` — round-4 section appended (+385 lines; a dated
header note names the amendment; the round-3 body §1–§11 stands untouched):

| § | Content |
|---|---|
| R4.0 head | scope: 69 open PRs #98–#166 + #167 (this PR) + the SPADOC tail still to be authored |
| R4.1 | **External state re-read** — every §1 fact re-verified 2026-10-10T16:05Z (table below) |
| R4.2 | **Composition with round 3** — the honest Q-7 answer |
| R4.3 | The open-stack graph: PR ↔ branch ↔ ticket ↔ segment, #98 → #169 |
| R4.4 | Merge order + per-PR mechanics (bottom-up, merge commits, retarget-by-delete) |
| R4.5 | CI state to expect (the resolved reds, the one waived red class) |
| R4.6 | Known drift — one predicted union conflict + two recorded drifts |
| R4.7 | **The 15-segment cadence** — merge range ↔ flip ↔ legs ↔ bake, verbatim-refined |
| R4.8 | Deploy procedure per boundary — verbatim commands |
| R4.9 | Per-segment legs + the nightly-bake check |
| R4.10 | Post-cadence composed verification (BL-82 → runbook §3.2–3.5 verbatim) |
| R4.11 | Arm B — tip-deploy fallback with compressed-verification consequence |
| R4.12 | The Resend secret — parallel preview track, never a serial blocker |
| R4.13 | Rollback + eight named stop conditions + hazards |

## 3 — Composition findings (the state that changed since REC.3's read)

- **`main` head `c13d865` = merge of PR #97 (SLO.1).** The round-3 chain merged
  through #97, not #69 — §1's table is now stale. The open stack is #98–#166 (69
  PRs: round-3 tail #98–#118 = 21 PRs, round-4 #119–#166 = 48 PRs), plus #167 and
  the SPADOC tail.
- **Round-3 composition:** the round-4 stack's declared base is
  `res-3-leg1a-zero-coverage` — the round-3 tail MUST merge first; merge order is
  stack order, not round order (the Q-7 "independent schedules" resolve by position).
- **Prod provenance is inside the unmerged tail:** web `6ebb1cb` / api `0acd16d`
  are commits inside #118's branch (`res-3`), ancestors of tip `d263808`
  (`merge-base --is-ancestor` verified; tip is 238 commits ahead of `c3d776c`). The
  pending pinned deploys (`5baa666` inside #104, `bbe1e95` inside #105) are
  ancestors of the deployed SHAs — prod already runs their code; their dedicated
  deploys are superseded, not replayed (recorded in the plan).
- **`MAINT.5` folded:** its `6ebb1cb` CSP fix + `666640c` deploy record live inside
  #118's branch — no dedicated PR; prod already runs it.
- **`#98`'s declared base is the merged `slo-1` branch** (not deleted after #97's
  merge; `b1800e1` ancestor-of-main verified) → retarget to `main` is step 0.
- **The old standing reds are resolved in code on `main`:** `b1800e1` (merged via
  #97) recorded migration 0054 in the additive-migration baseline AND scoped
  `rhema_fp` out of the never-cookies gate — §3a/§3b dead. The `rhema_fp` scope was
  independently re-committed inside the stack (`406cbcc`/`ce36fe0`/`56fee60`).
- **`integration`/privsep is intermittently red** — `d60a70d`'s skip-where-cannot-
  unmount guard went green on #98/#129 but red on #157/#161 (log-verified: same
  `privsep.docker.test.ts` GH-runner `CAP_SYS_ADMIN` EACCES — the GD-MAINT.4-1
  waived class; a non-privsep red is a named stop in the plan).
- **One predicted conflict, verified:** `ux-1` (#98) was rebased onto `b1800e1`;
  the stack above descends from `c3d776c`. `git merge-tree` of tip vs `main` =
  **exactly 1 real conflict hunk** in `scripts/check-additive-migrations.test.mjs`
  (union: keep `main`'s `0054` + the chain's `0055`–`0058`). The two other
  `<<<<<<<` grep hits are literal strings inside §6's code fence — labeled-marker
  count used. Mid-chain `ux-2`-head drift (identical-change re-commits) merges
  clean; `main`-side `.gitleaks.toml` +5 auto-merges.

## 4 — Plan structure decisions (recorded)

- **15-segment cadence verbatim, segment 0 prepended.** Segments 1–14 are the
  runbook rows with live PR numbers; the cleanup wave's runbook range "#158–#163"
  is restated as **#158 → tip** (the tail grew to #167; SPADOC.1/.2 will append).
- **Deploy SHA = `main` tip at the segment boundary** (the flip PR's merge commit) —
  keeps `--expect-sha`/provenance trivially exact. The plan forbids deploying past
  the last fully-verified boundary; merging ahead is a named hazard.
- **Images: `api,web` minimum every segment** for provenance parity (the gate
  compares both `/healthz` SHAs), diff-scoped additions per the merged range,
  full canonical set when in doubt — the `image-set.yaml` + `Pulumi.prod.yaml`
  pin + `record-deployment.mjs` recipe is verbatim the FUNDED-2026-10-06-A
  procedure.
- **Resend secret positioned as parallel, not serial** (BL-80): it gates only the
  `pr-<n>` preview-leg family; recommended seeding window is the early nightly
  bakes; prod path mints sessions via the live mailbox.
- **Arm B recorded, not recommended** — compressed-verification consequence
  carried verbatim from the runbook.

## 5 — Deviations from the ticket contract

None. Docs-only; no code paths touched; no DEFERRALS rows opened or closed (every
owed leg still needs a deploy, an operator act, or a funded window — this plan IS
the sequencing those rows cite).

## 6 — Validator + gate results

| Command | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135** tasks (FULL TURBO — docs-only diff) |
| `pnpm test` | **487 files / 5,562 pass / 6 skip / 0 fail** |
| `pnpm check:licenses` | OK — 822 packages |
| `pnpm check:protocol-markers` | OK — 248 files |
| `pnpm check:no-cookies` | OK — 253 files |
| `pnpm check:spa-budget` | OK — all ceilings held |
| `pnpm check:spa-env` | OK — 111 sources / 146 artifacts |
| `pnpm check:dom-contract` | OK — journey selectors ⊆ manifest ⊆ emitted+asserted |
| `check-backlog.sh` | **465 expected sources — complete + non-duplicating + verdict-consistent** |
| `check-build-memory.sh .` | **0 violations** (7 warnings — the pre-existing baseline class: manifest banners, gate-cell wording, ledger nextTicket ordering, phase-log sizes, legacy index values, readout guard, old Harness headers) |
| `check-append-only.mjs --base d263808` | **OK** |

## 7 — Files changed

`docs/build/INTEGRATION_PLAN.md` (header note + §R4 appended) ·
`docs/build/runs/SPAREC.3.md` · `docs/build/pr/SPAREC.3.md` ·
`docs/build/BUILD_INDEX.md` (+1 row) · `docs/build/LEDGER.md` (state advance +
phase-log append).

## 8 — PR checks

PR **#167** (`gh pr create --base stevevitali/sparec-2-spec-reconciliation`; never
merged — mergePolicy OPERATOR). `gh pr checks --watch=false` read **once** at
closeout 2026-10-10T16:12Z: **`typecheck / lint / unit` pending** (first job
registered, run 38066454821 — recorded honestly; the same pending-first-read class
SPAF.1/SPAF.2 recorded). Inherited `integration`/privsep red, if it reports later,
is waived per GD-MAINT.4-1 and would be recorded, not inferred.
