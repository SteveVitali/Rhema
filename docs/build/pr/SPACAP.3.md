# SPACAP.3 — capstone closure: every routed gap fixed or dispositioned; the ACCEPTED-deviations list for GATE-ACCEPT.SPA

Manifest row 142 · stacks on `stevevitali/spacap-2-composed-verification` @ `0eaea5d` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
offline-only, no deploys, no production mutations.

Implements `docs/tickets/142_SPACAP.3__capstone-closure.md`. Every gap SPACAP.1 routed
(`docs/build/reports/CAPSTONE_GAP_ANALYSIS_SPA.md` §5) is closed here — one by code, one
by runbook, three as signed-deviation candidates — and the six PARTIAL coverage rows are
dispositioned with compensating controls + covering deferral rows.

**Requirement IDs:** REQ-ED-12 (the forced-SSR posture the fix mirrors), REQ-VFY-5/6/8/10,
REQ-SEQ-7/9/10 (the dispositions + deviation rows), REQ-BFF-2 (twin composition verbatim).
ADR-108 records the owned design decision.

## What landed

### The G2 fix — the showcase leg of the forced-SSR truth (ADR-108)

SPACAP.1 §4.5 (LOW): the server's five Page-family document arms force SSR on
`isPhoneRequest(c) || row.showcase === true`, but the boot map replicated only the phone
leg — `row.showcase` is row data the request-scoped, route-keyed `surfaces` map cannot
see, so an in-SPA navigation to `/p/<showcase-slug>` mounted the SPA Page where a document
load serves the forced-SSR read-only document.

- The five Page-family BFF twins now ship `project.showcase: true` on a showcase row
  (`queries.ts` types + `server.ts` emission ×5).
- `spa/states.tsx` exports `twinForcesSsr(twin)`; all five leaf routes
  (`p.$project.index`, `v.$v`, `v.$n.diff.$m`, `a.$artifactId`, `revisions.$cid`) consult it
  after the twin resolves and hand off through `SsrHandoff` — the same document-load seam
  the phone leg takes. The client's effective predicate now mirrors the server's verbatim:
  **boot map owns the phone leg, twin owns the showcase leg.** Forced-SSR stays a server
  verdict in both directions; the twins' `readOnly`/`collabWsUrl`-withheld posture is kept
  verbatim as belt-and-braces.

### Removal-detecting regression pins (all green)

- `renderer-overrides.test.ts` SPACAP.3 block — counts the 5 verbatim two-leg document
  arms, the surviving boot-map phone leg (1), the 5 twin emissions, and names the 5 leaf
  consults.
- `editor.dom.test.tsx` — a showcase twin drives `navigateDocument` on all five leaves with
  no SPA mount; a non-showcase twin mounts and never hands off.
- `server.test.ts` — `project.showcase` ships on all five twins for a showcase row and is
  absent otherwise (read-only/collab posture asserted verbatim).

### The closure record

- `docs/build/CAPSTONE_CLOSURE.md` — round-4 section appended (round-3 preserved verbatim):
  the landed shape, G1–G5 dispositions, the six PARTIAL-row dispositions, and the
  ACCEPTED-deviations list for `GATE-ACCEPT.SPA`.
- `docs/adr/ADR-108-*` + regenerated `docs/adr/README.md`.
- `DEFERRALS.md` `## SPACAP.3` — `D-SPACAP.3-1` (live re-verify of the fix on the deployed
  tip: showcase doc `data-renderer="ssr"`, in-SPA handoff lands SSR, non-showcase control
  mounts SPA). All existing rows carried verbatim.

## Gap dispositions

| # | Severity | Disposition |
|---|---|---|
| G1 | HIGH | **closed-by-runbook** — SPACAP.2's `SPACAP.2_COMPOSED_VERIFICATION.md` §3 (15-segment merge/deploy cadence + Arm B; live legs `D-SPACAP.2-1..4`) |
| G2 | LOW | **fixed** — this PR (ADR-108); live re-verify `D-SPACAP.3-1` |
| G3 | MED | **deviation-candidate** — REQ-VFY-8's written procedure sunset-deleted; amended recipe recorded (`D-SPA.28-2`); live legs `D-SPA.*-1` / `D-SPAF.*-2`→`D-SPACAP.2-1` |
| G4 | MED | **deviation-candidate** — R6F/T12F/T13F/T17 owed; first prod legs folded into `D-SPACAP.2-1`; preview legs behind `D-MAINT.6-1` |
| G5 | MED | **deviation-candidate** — P1-family journey axe owed; component-axe covers the manifest subset; same unblock |

## ACCEPTED-deviations list (verbatim from `CAPSTONE_CLOSURE.md` §R4.4 — proposed, unsigned)

1. REQ-VFY-8's flip procedure amended post-deletion — leg A's pin/flag machinery was deleted
   by SPA.28 under the spec's own sunset; the amended single-leg recipe
   (`--expect-renderer spa` + rollback-by-revert) verifies the same property.
2. REQ-SEQ-9's flag-off DOM-parity legs unexecutable — "flag off" no longer exists
   post-cleanup by design; the DOM contract is pinned by `check:dom-contract` + dom tests.
3. REQ-VFY-10's owed free steps still `expected:"red"` — R6F/T12F/T13F/T17; owed-reporting
   cannot silently pass; first prod legs folded into the composed suite.
4. REQ-VFY-6's journey-level axe leg still owed — component-axe covers the
   interactive-manifest subset; the live leg adds layout/real-browser reach.
5. REQ-SEQ-7's rollback drills never exercised live — deliberately non-destructive;
   revert-by-construction while flags exist, `git revert` + redeploy after.
6. REQ-SEQ-10's nightly pacing unproven until deploys run — the gate binds the §3.1
   cadence via 14 `D-SPAF.*-4` rows + cleanup entry gates.
7. G2's fix verified at build-time only — deterministic pins green; the live legs ride
   `D-SPACAP.3-1` on the deployed tip.
8. The whole live tail — `D-SPACAP.2-1..4` + every `D-SPA.*-1/-2` preview leg gate on the
   ordered merge/deploy + `D-MAINT.6-1`; none closable offline, all ledgered verbatim.

## Verify

- `pnpm turbo build lint typecheck` — 135/135 green.
- `pnpm test` — full-suite result recorded in `docs/build/runs/SPACAP.3.md` (one transient
  flake in `run-sheet.dom.test.tsx` — untouched file, 24/24 green in isolation; re-run
  recorded at closeout).
- All `check:*` green: dom-contract, spa-budget, spa-env, protocol-markers, no-cookies,
  licenses; coverage-matrix checker 6/6.
- Build-memory validator — no violations (7 pre-existing-class warnings);
  `check-append-only.mjs --base 0eaea5d` — OK.
- PR checks read once at closeout; inherited `integration`/privsep red, if reported, is
  classified and waived per `GD-MAINT.4-1` (not repaired — recorded in `runs/SPACAP.3.md`).

**Not in this PR:** merging (OPERATOR), any deploy, any prod mutation, the live legs
themselves (all ledgered). The build is NOT DONE — `nextTicket: GATE-ACCEPT.SPA`.
