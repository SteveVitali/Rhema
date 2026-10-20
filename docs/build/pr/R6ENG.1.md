# R6ENG.1 — CI + provenance hygiene (mount-settle flake, tsconfig drift, nightly provenance tolerance)

Stacked on `stevevitali/r6-planning-corpus` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** Offline-only ticket;
$0; no live stage; zero prod contact. `implement-spec
spec=docs/tickets/176_R6ENG.1__ci-provenance-hygiene.md` — manifest row 176, the
first round-6 row. **This PR carries the round-6 planning/decomposition commits**
(the `r5-synthesis` → #172 precedent — the planning corpus is un-PR'd, so they land
inside this head).

**Requirement ids stamped:** REQ-ENG-1 REQ-ENG-4 REQ-ENG-5 REQ-ENG-6 REQ-ENG-8

## What

- **REQ-ENG-1 — the mount-settle flake (BL-87 / D-R5REC.1-1) removed.**
  `data-mounted` stamps match *resolution*, not the leaf's query repaint — two waits
  now own that distinction: every router-mount `mountAt` waits for the stamp
  (`SETTLE_TIMEOUT`, 4s — the 1s `vi.waitFor` default itself flaked under CPU
  contention), and `settled(selector)` in `apps/web/src/spa/testkit.ts` polls the
  interaction target itself, throwing a 2000-char DOM excerpt on timeout so a future
  capture is self-describing. Second, subtler root cause found and fixed: the
  `*After` fixtures (`outlineAfter`/`cardAfter`/`figuresAfter`/`twinAfter`) served on
  read **count**, so a legitimate StrictMode/`staleTime:0` mount refetch could
  consume the post-mutation truth before the mutation ever posted — the cited arm
  hiding the delete form, `pendingProposal` hiding the propose form. All three stubs
  now gate on `posts.length > 0` — the documented "post-mutation refetch" semantic.
  Every `apps/web/src/**/*.dom.test.tsx` audited (15 router-mount files gated +
  settled; 6 custom-substrate files explicitly cleared with reasons —
  `spa`/`intercept`/`ide-chrome`/`page-collab`/`page-source`/`dom-contract`). Audit
  table + iteration evidence committed under `docs/build/reports/2026-10-20_R6ENG.1/`.
  **25/25 local iterations clean** (50/50 tests each).
- **REQ-ENG-4 — the CIREP.1 dep-vs-reference drift closed.** The five missing
  `references`: `integration` → `packages/ledger` + `packages/live-clients`;
  `packages/benchmark` → `packages/findings-core` + `packages/mirror`;
  `apps/egress-proxy` → `packages/db`. Drift audit: `audited 47 package.json files /
  NO DRIFT`.
- **REQ-ENG-5 — the system-role `JOURNEY_DATABASE_URL` convention at both read
  points.** Dated ADR-093 addendum (append-only) + a new paragraph in
  `infra/PROD-BRINGUP.md` §2 — operator-local env, never a `rhema:*` key; a
  `rolsuper OR rolbypassrls` DSN or the guard's `pg_roles` probe refuses (a blind
  app-role bind reads `usage_records` as $0 through FORCE-RLS). The live re-proof
  stays R6FOR.1's; verified live 2026-10-06 via D-CAP.3-1.
- **REQ-ENG-6 — census §5 dispositions + BL-02 sweep.** BL-02 re-verified (332 rows /
  0 dirty-leading). Dispositions committed
  (`reports/2026-10-20_R6ENG.1/census-dispositions.md`): **BL-06 flipped closed**
  (DOC.1 `20e29ec`/#114 carried the phase1-exit-readout dated correction; DOC.2 #115;
  tail R5DOC.1 #193 + R5DOC.2 #194); **BL-24 annotated** (injection smoke discharged
  2026-10-15 — playbook/CDN/cohort residuals named); **BL-80/82/74 kept open** with
  named residuals; **D-P1.22-2** got a dated cell note (injection half discharged;
  residual legs named). `REQ-FIX-BL22-T7DEST` re-pointed `D-FIX.1-4` →
  `deferral:D-P1.04-2`; `check-coverage-matrix` 6/6 green.
- **REQ-ENG-8 — deploy-neutral provenance tolerance (ADR-114).** A strict mismatch
  now earns ONE fail-closed second opinion: `git merge-base --is-ancestor
  <deployed> <expected>` AND every path of `git diff <deployed>..<expected>` inside
  the committed allowlist `scripts/deploy-neutral-paths.txt` — **`docs/` subtree +
  `.gitleaks.toml`** (workflows deliberately NOT neutral — a CI-behavior edit is not
  deploy-neutral). Implemented twice per the twin convention:
  `scripts/deploy-neutral.mjs` consumed by `check-deploy-provenance.mjs` (PASS +
  `(deploy-neutral drift …)` note per label) and
  `packages/journeys/src/provenance.ts` (`deployNeutralDrift` +
  `provenanceDriftCheck`; `cli.ts` wires the second opinion and the report records
  `provenance.drift` — the labels that passed under drift). `journeys.yml` gains
  `fetch-depth: 0` — ancestry is unresolvable in a depth-1 clone. Absent/unknown/
  unresolvable/non-ancestor/non-neutral all fail exactly as before. R6SWP.1 and
  R6WATCH.1 consume the allowlist as the single source of truth.

## Evidence

| Claim | Proof |
| --- | --- |
| Flake loop ≥ 20 iterations | **25/25 clean**, 50/50 tests each — `reports/2026-10-20_R6ENG.1/flake-iterations.md` (logs in `/tmp/r6eng1-flake/` — two consecutive green CI runs recorded at closeout) |
| Every sibling audited | `reports/2026-10-20_R6ENG.1/dom-settle-audit.md` — 21-file disposition table + the `*After` root-cause section |
| `*After` flake mechanism retired | `git diff` on the three `makeFetch` stubs — `posts.length > 0` gating; iter-5 DOM excerpt showed the cited arm rendered early |
| Drift audit green | `node docs/build/logs/cirep1-drift-audit.mjs` → `NO DRIFT` |
| Provenance arms pinned | `scripts/check-deploy-provenance.test.mjs` (7 tests: exact, docs-only drift, docs+`.gitleaks.toml` drift, code-drift reject, non-ancestor reject, outside-repo fail-closed, usage) + `packages/journeys/src/provenance.test.ts` (15 tests incl. `provenanceDriftCheck` per-label arms) — **22 green** |
| Allowlist owned + ADR'd | `scripts/deploy-neutral-paths.txt` + `docs/adr/ADR-114-deploy-neutral-provenance-tolerance.md` (renumbered from 113 — the decomposition pre-allocates ADR-113 to R6UCD.1's §13.3 amendment) |
| Census §5 dispositions | `reports/2026-10-20_R6ENG.1/census-dispositions.md`; BL-06 `done 2026-10-20` in `BACKLOG.csv`; dated D-P1.22-2 cell append in `DEFERRALS.md` |
| verification green | `pnpm turbo build lint typecheck` **135/135** · `pnpm test` **502 files / 5,827 pass / 4 skip / 0 fail** · all six `check:*` green · check-build-memory **0 violations** (7 pre-existing legacy warnings) · append-only vs `e4a43a2` OK |

## Honestly not claimed

- **No live/deploy/nightly evidence.** The REQ-ENG-8 nightly arm is unit-pinned +
  locally exercised; the first real docs-only-merge nightly read is R6SWP.1's, and
  the scheduled-nightly evidence for BL-74 stays owed.
- **BL-87 / D-R5REC.1-1 stay OPEN until the exact-head CI read** — the local loop is
  evidence, the flips ride the PR's two green CI runs per their verify clauses.
- Two consecutive green full-suite CI runs (the AC's first clause) are recorded at
  closeout via `ci-boundary.sh --pr <n> --stack`, not asserted here.

## CI

`ci: pass #195@52389f4` — all five jobs (images / integration / contracts / public-safe /
typecheck+lint+unit), run 39465573137, `ci-boundary.sh --pr 195 --stack` read
2026-10-20T18:10:11Z. **The mount-settle class did not recur** (unit 32m24s, first
attempt). A second consecutive green run is recorded in the run ledger at closeout —
the BL-87 / D-R5REC.1-1 flips ride it per their verify clause.
