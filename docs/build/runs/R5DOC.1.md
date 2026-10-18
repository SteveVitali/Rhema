# R5DOC.1 — Repo-docs refresh (post-round-5) — run ledger

- **Spec:** `docs/tickets/174_R5DOC.1__repo-docs-refresh.md` (manifest row 174, round 5,
  Kind: docs) — `implement-spec` + `refresh-repo-docs` (incremental audit)
- **Base:** `stevevitali/r5rec-3-integration-plan` tip @ `f79665e`
- **Branch:** `stevevitali/r5doc-1-repo-docs-refresh` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high · **Skills:** implement-spec + refresh-repo-docs +
  build-memory @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** none — docs row
- **Live stage:** none · **Production mutations:** none — offline-only, $0, zero live
  contact; every claim verified against the tree (or prior committed build records)
- **Started:** 2026-10-18T04:20Z · **Closed:** 2026-10-18T05:23Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). A docs-refresh ticket
unblocks no `OPEN` row (all live legs are merge/deploy- or human-gated). Opened: none
planned. Closed: none. Standing: `D-R5REC.1-1` (mount-settle flake) stays OPEN —
test-harness leg, out of a docs row's scope; `GD-FUNDED.1-1` CARRY and
`GD-R5OPS.1-1` AWAITING are recorded, never answered here.

## Requirements (from the contract + the round-5 refresh surface)

1. No stale `?ssr=1`/MPA-era text presented as live machinery; flag-vocabulary references
   carry their deleted/contract-vocabulary status.
2. Client-side navigation documented where the SPA architecture is described
   (delegated `document` interceptor via `mountSpa`, guard pipeline + skip-list,
   `RELOAD_STUB_IDS` doc-nav arm, `SsrHandoff` replace-mode, push-only, no
   intent-preload) — verbatim-from-code source: spec §14.19 + `spa/nav-intercept.ts`.
3. Extended settle contract vocabulary where journeys/harness docs live
   (`data-nav-count`, mounted-pending `data-mounted`, `data-page-session`,
   `settleClientNav`/`settleDocumentNav`, unconditional `SettleScope.documentLoads`).
4. Econ regime in ops/runbook docs only (fail-closed `funded-window.mjs` checklist,
   `JOURNEY_FUNDED_STABLE_TAG` tenant, `req_jrn_`/REQ-ECON-6 exclusions, levered caps) —
   no secret values, never imply the funded wave ran (GD-FUNDED.1-1 = CARRY, $0 spent).
5. Cost posture honest: ~$285.80 → **$198.32/mo list**; the ~$50/mo target is UNMET.
6. `check:*` script set named correctly against root `package.json` (six — none added
   this round; verified).
7. Prod posture: still pre-chain `ffbb8ad` — no doc may claim round-4/5 surfaces live;
   `docs/build/INTEGRATION_PLAN.md` §R5 exists and may be pointed at.
8. Size budget ~200 changed lines.

## Acceptance criteria

- [ ] Every refreshed claim verified against the tree; no stale `?ssr=1`/MPA-era text
      (deterministic).
- [ ] Universal phase-gate AC (green build/lint/typecheck + tests + checks + memory
      validators + head-bound CI).

## Plan

- Detector: `refresh-repo-docs/scripts/check-repo-docs-freshness.sh .` — 497 docs,
  16 broken refs (all in frozen/historical/fixture docs — report-only per the
  `docs/README.md` mode table), 0 stale suspects. Worklist built by stale-class hunts
  + the round-5 surface map.
- Living docs only: `README.md`, `docs/README.md`, `apps/web/README.md`,
  `packages/journeys/README.md`. `docs/ops/**` + `docs/security/**` audited — accurate
  (hedged authored-dormant language, no stale classes). `docs/build/` +
  `docs/tickets/` + spec files are historical/frozen — findings report-only.
- No CHANGELOG file exists → VERIF.2 fixes (HostRateLimiter clock, `[data-apply]`
  dossier leak) are report-only, noted in the evidence report.

## Findings ledger (Phase 0/1 — audit, before edits)

| doc | class | finding | severity |
|---|---|---|---|
| `README.md` | stale | Cost bullet reads "~$285/mo list" — COST.1 executed $285.80→$198.32 list (OPERATIONAL_READINESS L181; LEDGER PHASE LOG) | moderate |
| `README.md` | stale/gap | Status stamp `2026-10-10` predates round 5; Frontend bullet describes round-4 SPA only — no client-side nav (ADR-110), points at INTEGRATION_PLAN §R4 only (§R5 exists since R5REC.3) | moderate |
| `docs/README.md` | stale | Mode table row says `frontend-spa-spec.md` "(v1.1)" — spec is v1.2 (R5REC.2, §14.18/14.19) | minor |
| `docs/README.md` | stale | "Where the build is (2026-10-10)" predates round 5 — nav landed; §R4-only pointer | moderate |
| `apps/web/README.md` | gap | No client-side-navigation mention — the delegated interceptor + extended settle contract landed (NAVC.1–5 / ADR-110 / §14.19) | moderate |
| `packages/journeys/README.md` | gap | No mechanism-pinned settle vocabulary (`settleClientNav`/`settleDocumentNav`, unconditional `documentLoads`, `data-nav-count`/`data-page-session`) and no funded-window driver surface (`funded-window.mjs --dry-run` checklist, `JOURNEY_FUNDED_STABLE_TAG`, `funded-tenant.mjs`) | moderate |
| frozen/historical set | report-only | detector's 16 broken refs — `asset://` placeholders, `sources/slug.md`, `url` in frozen specs/research/tickets/protocols conventions + an editor test fixture | n/a (pre-existing; frozen) |

## Test matrix

Docs row — verification is the repo gate itself: `pnpm turbo build lint typecheck`,
`pnpm test`, all six `pnpm check:*`, `check-build-memory.sh`, `check-append-only.mjs`
(vs base `f79665e`), detector re-run. Claim verification: every added line cites a
file:line/figure read off the tree this run (§14.19; `nav-intercept.ts`;
`main.tsx:88`; `render.tsx:86`; `spa-shell.ts:217`; `dom-contract.ts:127/1345`;
`settle.ts`; `window-plan.ts`; `funded-window.mjs`; OPERATIONAL_READINESS L181).

## Progress

- [x] Branch cut at `f79665e`; DEFERRALS read; detector run; worklist audited.
- [x] Doc edits (4 files, +68/−14 — inside the ~200-line budget).
- [x] Self-review + gap analysis; verification gates; PR + closeout.

## Gap table

| item (contract) | required | achieved | status | evidence |
|---|---|---|---|---|
| no stale `?ssr=1`/MPA-era text as live machinery | engineered | engineered | met | grep sweep over every living doc (root + package READMEs, CONTRIBUTING, docs/README, docs/ops/**, docs/security/**, docs/build/README): the only hits already say inert/retired/deleted (`packages/journeys/README.md` L110, `apps/web/README.md` L7, `README.md` L44) |
| client-side nav documented where the SPA is described | engineered | engineered | met | `apps/web/README.md` new §"Client-side navigation" (interceptor at `spa/main.tsx:88` via `installSpaClickInterceptor`; guard pipeline `nav-intercept.ts`; `navigateDocument`/`replaceDocument` `spa/dom.ts:25/36`; ADR-110 file exists); `README.md` + `docs/README.md` round-4→4/5 updates |
| extended settle contract in journeys docs | engineered | engineered | met | `packages/journeys/README.md` — `src/settle.ts` layout row + round-5 additions paragraph (`settleClientNav`/`settleDocumentNav` `settle.ts:247/308`; `documentLoads` `runner.ts:66`; `data-nav-count` `render.tsx:86`+`spa-shell.ts:217`; `data-mounted` pending `head.tsx:79-88`; `data-page-session` `dom-contract.ts:1345`) |
| econ regime in ops/runbook docs; no secrets; never imply the funded wave ran | engineered | engineered | met | journeys README — `src/window-plan.ts` row + funded-window driver bullet (`funded-window.mjs` `--dry-run`/`--headroom` REQ-ECON-9, `windowChecklist` fail-closed `window-plan.ts:158`, `JOURNEY_FUNDED_STABLE_TAG` + `funded-tenant.mjs`, `req_jrn_` REQ-ECON-6 already present). No secret values written; no wave-run claim anywhere |
| cost posture honest ($285.80→$198.32; ~$50 target UNMET) | engineered | engineered | met | `README.md` cost bullet rebased (OPERATIONAL_READINESS L181 + CAPSTONE_CLOSURE row 10 + GATE-ACCEPT.R5 row 10 all record $198.32/unmet) |
| `check:*` set named correctly | engineered | engineered | met | root `package.json` L20–25: exactly six (`licenses`, `protocol-markers`, `no-cookies`, `spa-budget`, `spa-env`, `dom-contract`); `apps/web/README.md` lists all six verbatim; no new `check:*` landed this round (last change SPA.8) |
| prod posture honest (pre-chain `ffbb8ad`; §R5 pointable) | engineered | engineered | met | "authored-dormant"/"pre-chain ancestors" preserved everywhere; §R4 → §R4/§R5 in three docs (`INTEGRATION_PLAN.md` §R5.1–R5.7 exist, R5REC.3) |
| VERIF.2 fixes changelog-grade | — | n/a | met | no CHANGELOG file exists in the repo → nothing to write; recorded in report |
| ~200-line budget | engineered | engineered | met | `git diff --stat`: +68/−14 over 4 files |

## Evidence log

- `check-repo-docs-freshness.sh .` → 497 docs, **16 broken refs / 0 stale suspects**; all 16
  in frozen/historical docs or fixtures (`asset://`/`sources/slug.md`/`url` placeholders in
  `docs/adr/ADR-046`, `docs/design/6_*`, `docs/research/8_*`/`9_*`, `rhema-design-spec.md`,
  two tickets, an editor test fixture, `packages/protocols` conventions + upstream-pin) —
  report-only per the `docs/README.md` mode table. Re-run post-edit: identical set, nothing
  new broken.
- `pnpm turbo build lint typecheck` → **135/135 tasks successful** (127 cached).
- `pnpm test` → 502 files: **5,813 pass / 4 skip / 1 fail** — the one fail is
  `apps/web/src/spa/outline.dom.test.tsx` "delete's cited refusal", the ledgered recurring
  mount-settle flake **D-R5REC.1-1** (BL-87; third observed occurrence — a docs-only diff
  cannot touch it). Isolated re-run: **21/21 pass**.
- All six `pnpm check:*` green: licenses (822 pkgs) · protocol-markers (248 files) ·
  no-cookies (257 files) · spa-budget · spa-env (115 src/146 artifacts) · dom-contract.
- `check-build-memory.sh .` → **0 violations**, 8 pre-existing legacy warnings.
- `check-append-only.mjs --base f79665e` → **OK**.
- ci: pass #193@67f4536 (typecheck / lint / unit · contracts · integration · images
  (build + scan, pin digests) · public-safe (gitleaks / markers / licence policy) —
  run 39097361640; the 2700s bound expired with `integration`/`images` in flight →
  job-polled `gh api` to completion → boundary re-read pass) · stack #192–#172 pass
  · record `logs/ci-R5DOC.1.json`

## Evidence report

**Scope:** `refresh-repo-docs` incremental audit over the whole repo (scope `.`), applied —
living docs only; frozen/historical/generated docs got findings, not edits.

**What changed (4 files, +68/−14):**

- `README.md` — status stamp → 2026-10-18; cost bullet rebased to ~$198/mo list
  ($285.80→$198.32, ~$50 target **unmet**, paused levers named); Frontend bullet →
  rounds 4–5 with the delegated-interceptor mechanism, push-only/no-preload posture, and
  the extended settle contract; INTEGRATION_PLAN pointer §R4 → §R4/§R5.
- `docs/README.md` — "Where the build is" stamp → 2026-10-18 + round-5 nav note +
  §R4/§R5 pointer; `frontend-spa-spec.md` mode row v1.1 → **v1.2** (§14.18/§14.19 named).
- `apps/web/README.md` — new "Client-side navigation (round 5; ADR-110; spec §14.19)"
  section: one delegated `document` click interceptor installed by `mountSpa`, the
  `nav-intercept.ts` guard pipeline + skip-list, `RELOAD_STUB_IDS`/`SsrHandoff`
  replace-mode, unconditional in-tree interception, `data-nav-count` + pending
  `data-mounted` + `data-page-session`.
- `packages/journeys/README.md` — layout rows for `src/settle.ts` and
  `src/window-plan.ts`; a funded-window driver bullet (`--headroom` REQ-ECON-9,
  `--dry-run` fail-closed §5.5 checklist, `JOURNEY_FUNDED_STABLE_TAG` +
  `funded-tenant.mjs`); a round-5 additions paragraph on the mechanism-pinned settle
  contract (`settleClientNav`/`settleDocumentNav`, unconditional `documentLoads`).

**Stale fixed:** 3 (cost figure; spec version v1.1→v1.2; §R4-only pointers).
**Cruft removed:** 0 (no dead machinery was presented as live — the `?ssr=1` mentions
already carry their inert status).
**Gaps filled:** 4 (nav mechanism in `apps/web`; settle vocabulary + funded-window driver
in `packages/journeys`; round-5 note in root + docs READMEs).
**Remaining gaps:** none in living docs. **Report-only findings:** the detector's 16
broken refs are all inside frozen/historical docs or a test fixture (`asset://`
placeholders etc.) — left untouched per the mode table. No CHANGELOG file exists, so the
VERIF.2 fixes (`HostRateLimiter` clock, dossier `[data-apply]` leak) have no
changelog-grade home — noted for the record.

**Operator flags:** `D-R5REC.1-1` recurred in the full `pnpm test` (the
`outline.dom.test.tsx` mount-settle flake — passes in isolation; BL-87 carries it).
Nothing else new: `GD-FUNDED.1-1` CARRY / `GD-R5OPS.1-1` AWAITING stand; prod still
pre-chain `ffbb8ad`.

**ci:** `pass #193@67f4536` — all five checks on run 39097361640 + stack
#192–#172 pass; the 2700s bound expired on the slow tail, job-polled to
completion, boundary re-read pass.
