# R5DOC.1 — Repo-docs refresh (post-round-5)

Stacked on `stevevitali/r5rec-3-integration-plan` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** Offline-only docs row;
$0; no live stage; zero prod contact. `implement-spec
spec=docs/tickets/174_R5DOC.1__repo-docs-refresh.md` + `refresh-repo-docs`
(incremental audit, scope `.`). Docs row — no REQ ids.

## What

Human-facing docs converge onto the post-round-5 tree — the SPA-nav era
(delegated click interceptor, extended settle contract), the econ regime's
runbook surface, and the honest cost posture. Four living docs, **+68/−14**
(budget ~200):

- **`README.md`** — status stamp → 2026-10-18; cost bullet rebased
  ~$285/mo → **~$198/mo list** ($285.80→$198.32 via COST.1 class-A levers;
  the ~$50/mo target recorded **unmet**, remaining levers paused per D-COST.1-3);
  Frontend bullet → rounds 4–5: `mountSpa`'s delegated `document` interceptor,
  the `nav-intercept.ts` guard pipeline + skip-list, push-only / no
  intent-preload, `data-nav-count` + pending `data-mounted`; INTEGRATION_PLAN
  pointer §R4 → §R4/§R5.
- **`docs/README.md`** — "Where the build is" stamp + round-5 nav note; the
  `frontend-spa-spec.md` mode row corrected v1.1 → **v1.2** (§14.18/§14.19).
- **`apps/web/README.md`** — new "Client-side navigation (round 5; ADR-110)"
  section: the one bubble-phase `document` click listener, ordered guard
  pipeline, `RELOAD_STUB_IDS` doc-nav arm, `SsrHandoff` replace-mode,
  renderer-unconditional interception, extended settle contract
  (`data-nav-count` / `data-mounted` / `data-page-session`).
- **`packages/journeys/README.md`** — layout rows for `src/settle.ts` +
  `src/window-plan.ts`; funded-window driver bullet (`--headroom` REQ-ECON-9,
  fail-closed `--dry-run` §5.5 checklist, `JOURNEY_FUNDED_STABLE_TAG` +
  `funded-tenant.mjs`); round-5 paragraph on the mechanism-pinned settles
  (`settleClientNav`/`settleDocumentNav`, unconditional `documentLoads`).

## Evidence

| Claim | Proof |
|---|---|
| Every refreshed claim verified against the tree | each new line cites file:line read this run — `main.tsx:88`, `nav-intercept.ts`, `dom.ts:25/36`, `render.tsx:86`, `spa-shell.ts:217`, `head.tsx:51–59/79–88`, `dom-contract.ts:127/1345`, `settle.ts:247/308`, `runner.ts:66`, `window-plan.ts`, `funded-window.mjs` |
| No stale `?ssr=1`/MPA-era text | grep sweep over all living docs — the only flag-machinery mentions already carry inert/retired/deleted status |
| `check:*` set is real | root `package.json` L20–25 — six scripts, all named correctly in the docs; none added this round |
| Cost posture honest | `OPERATIONAL_READINESS.md` L181 + GATE-ACCEPT.R5 row 10 — $198.32 list, ~$50 unmet |
| Prod posture honest | "authored-dormant"/"pre-chain ancestors" preserved; nothing claims round-4/5 is live (prod `ffbb8ad`) |
| Detector clean | `check-repo-docs-freshness.sh` — 16 broken refs before AND after, all in frozen/historical docs + one fixture (report-only per the mode table) |
| Green gate | turbo 135/135 · pnpm test 5,813 pass / 4 skip / 1 fail = **D-R5REC.1-1 flake** (`outline.dom.test.tsx`; 21/21 on isolated re-run) · six `check:*` green · check-build-memory 0 violations · append-only vs `f79665e` OK |

## Deferrals

Opened: none. Closed: none (a docs row unblocks no live leg). Standing:
D-R5REC.1-1 recurred in the full suite (third occurrence — BL-87 carries it).

## Operator flags

GD-FUNDED.1-1 stays CARRY (the docs name the machinery, never imply the wave
ran — $0 spent, envelope exhausted) · GD-R5OPS.1-1 AWAITING · merge sweep
operator-owned (§R5) · no CHANGELOG exists, so VERIF.2's fixes
(HostRateLimiter clock, dossier `[data-apply]` leak) have no changelog-grade
home — record-only.
