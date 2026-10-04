# CAP.3 — Capstone closure: routed gaps closed, deviations proposed for GATE-ACCEPT signature

Ticket: `docs/tickets/88_CAP.3__capstone-closure.md` · run ledger: `docs/build/runs/CAP.3.md` · primary artifact: `docs/build/CAPSTONE_CLOSURE.md`
Stacks on `stevevitali/cap-2-composed-verification` (PR #109, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> Offline-only run (Pulumi Cloud still 401s — no deploy, no live claims beyond what was
> observed). **Every gap CAP.1/CAP.2 routed to closure is now closed in code + test, or
> carried on an explicit `DEFERRALS.md` row with its compensating control.** Eight
> defects/construction findings were fixed with failing-then-green seam tests; their
> *live* re-verification legs are consolidated in the new **D-CAP.3-1** and ride
> D-CAP.2-2's post-deploy suite. Fourteen ADRs land: eight CAP.3-owned decisions
> (ADR-090…097) and six retro-fitted records covering the ADR-less MET-DIFFERENTLY
> verdicts (ADR-098…103). `CAPSTONE_CLOSURE.md` carries the 13-row ACCEPTED-deviations
> list for the operator's signature at `88a_GATE-ACCEPT`. **The build is not DONE.**

## What was closed (code + deterministic test)

| D-id | fix | test |
|---|---|---|
| D-CAP.2-3 | `ide-css.ts` — base `.ide .ide-actions{,a}` rules moved before the media blocks; the 44 px phone rule is now the last equal-specificity declaration | `tokens.test.ts` ordering seam |
| D-STB.5a-1 | anonymous `/export/download?token=` resolves on `deps.systemExec` (BYPASSRLS — the token IS the credential); unbound ⇒ 503 fail-closed; `index.ts` wires it (ADR-090) | `account-export-routes.test.ts` (6) |
| D-STB.5a-2 | `import.ts` — `resolveImportSlug` deterministic `base`,`base-2`,… deconflict; dependents map to inserted ids; re-import dedupes (ADR-091) | `archive.test.ts` (4) |
| D-STB.5a-3 | migration `0058` — `rhema_project_purge_schedule(project_id)` SECURITY DEFINER probe (one queue, schedule-only) granted to `rhema_app`; T7 uses it w/ `42883`/`42501` fallback (ADR-092) | migration applies on PGlite; T7 fallback tested |
| D-STB.5b-1 | `spend-guard.ts` — `pg_roles` `rolsuper\|rolbypassrls` probe before metering; blind/absent pool ⇒ `withinCap:false`, `weeklyMeteredUsd:null`; `>=` cap refuses; `cli.ts` binds `JOURNEY_DATABASE_URL`→`pg.Pool` (ADR-093) | `spend-guard.test.ts` (8) |
| D-STB.5b-2 | `attestation.ts` — `recordSubagentLaunch` enforces `SCOPED_LABEL_CAPS` per run; (cap+1)-th launch throws `IterationCapError` before insert (ADR-094) | `attestation.test.ts` (6) |
| D-CAP.1-1 | deep-link layout restore decomposed honestly: SSR carries context+anchor, layout = per-user `paneStorageKey` client state (ADR-097) | `server.test.ts` SSR seam |
| D-CAP.1-2 | reverse emission sweep — every emitted literal in the tree asserted catalogued + classified (ADR-096) | `emission-audit.test.ts` |

## What was consciously accepted / re-deferred

- **D-STB.5b-3** — fetcher grant stays `holdout-calibrator`-only (the intended §12.6
  least-privilege surface; ADR-095). Live leg rides the D-PRB.02-3 paid chain.
- **D-CAP.3-2** (new) — `completed_partial` step-state: a spec-shaped product decision
  CAP.3 can't take; the cap fires + is attested meanwhile.
- **D-CAP.3-1** (new) — all eight fixes' live legs (T3 token+import, T7 probe, P1 phone
  rule, two-role guard re-read) need the deployed tip → rides D-CAP.2-2.
- Unchanged live/operator/human obligations — D-CAP.2-1 (paid steps), D-CAP.2-2
  (chain-tip suite), D-SLO.1-5..8, D-OBS.1-2/-3, CITE.1/ECON.2 deploys, D-EDIT.1-2,
  D-DEF.4-*, OPS rows, H7 items, D5 (G2/H2) — carried into `CAPSTONE_CLOSURE.md` §2 with
  compensating controls; the signature table (§4) lists 13 proposed accepted deviations.
- **Round-3 note items** listed for GATE-ACCEPT: open H7 legs, D5 (G2/H2 deferred),
  interim trial terms (ADR-014), and **no SLO re-basing ADR** (targets unchanged — the
  D-SLO breaches are remediations, not re-basings).

## Matrix + ledger changes

- `COVERAGE_MATRIX.csv`: REQ-ACCT-3 AT-RISK-INTEGRATION → **PARTIAL**; REQ-IDE-1 /
  REQ-BETA-5 / REQ-DATA-20 / REQ-ARCH-21 stay PARTIAL with new evidence + ADR columns;
  nine ADR-less MET-DIFFERENTLY rows now cite ADR-098…103.
- `DEFERRALS.md` (append-only): 8 routed rows flipped PARTIAL with dated CAP.3 evidence;
  D-CAP.2-2 annotated still-blocked; D-CAP.3-1/-2 appended.
- `docs/adr/README.md` regenerated (never hand-edited).
- `BUILD_INDEX.md` row + `LEDGER.md` advanced — `nextTicket` = `88a_GATE-ACCEPT`;
  `projectStatus` stays `IN_PROGRESS`.

## Requirement ids stamped

REQ-ACCT-3 · REQ-IDE-1 · REQ-BETA-5 · REQ-DATA-15 · REQ-DATA-20 · REQ-DATA-28 ·
REQ-ARCH-20 · REQ-ARCH-21 · REQ-ARCH-24 · REQ-MOBILE-3 · REQ-MOBILE-10 ·
REQ-SPEC-5 · REQ-SPEC-23 · REQ-SPEC-26 · REQ-SPEC-28 · REQ-SPEC-30 · REQ-SPEC-32

## Honest non-claims

- Nothing was deployed; every fix is verified at build-time only — live re-verification
  is ledgered (D-CAP.3-1), not assumed.
- No journey ran; no paid leg executed; weekly spend guard state unchanged ($58.08 ≥ $5).
- The build is not DONE — GATE-ACCEPT signature is the operator's, not this PR's.
- CAP.2's defect rule honored: these fixes close on THIS branch; the defects' live
  re-verification waits for the same deploy as the rest of the tip.

## Spend

CAP.3 metered: **$0** (offline-only). No tunnels opened; no secrets touched.
