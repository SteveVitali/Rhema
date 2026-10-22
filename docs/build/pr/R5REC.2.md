# R5REC.2 — Round-5 spec reconciliation (the nav fold-back)

Stacked on `stevevitali/r5rec-1-backlog-readiness` · `mergePolicy: OPERATOR` — **do not
merge; the operator merges the chain bottom-up.** Offline-only docs reconcile; $0; no
live stage. `implement-spec spec=docs/tickets/172_R5REC.2__spec-reconciliation.md
reconcile=spec` — amendments applied, not proposed.

## What

- **REQ-MEM-6 — `docs/frontend-spa-spec.md` §7 mechanism amendment (v1.1 → v1.2, new
  §14.19).** The settled mechanism recorded verbatim from code: one delegated
  bubble-phase `click` listener on `document` installed by `mountSpa` (never
  `createSpaRouter`); the ordered guard pipeline (closest-anchor → defaultPrevented →
  button → modifiers → contenteditable → target/download/`data-spa-native` →
  fail-closed origin → hash-only → `getMatchedRoutes` with the `**` fuzzy predicate →
  `RELOAD_STUB_IDS` → `router.navigate`); push-only history; renderer-unconditional
  interception; `SsrHandoff` replace-mode (`spaRuntime.replace`/`replaceDocument`);
  no intent-preload; the `hashchange` compensation; and the extended settle contract
  (`data-nav-count` on every served document + HeadManager ticks; `data-mounted`
  removed while pending; `data-page-session`; `settleClientNav`/`settleDocumentNav`
  + the unconditional `SettleScope.documentLoads`).
- **REQ-MEM-7 — §14 dated defect block (new §14.18).** The round-4 chain shipped zero
  interception — every `<a href>` was a document nav (the "MPA-mode" gap the A4-F1/F5
  observability hole let ship invisibly); ruled a defect at Q-scope-1, not an accepted
  posture. Cross-refs REQ-NAVM-1..10, REQ-NAVT-1..8, REQ-NAVC-16..23; the REQ-NAVC-13
  naming nit recorded as R5CAP.1's no-action note; the `/voices/` → `/v/` dead-link fix.
- **REQ-MEM-8 — `docs/rhema-design-spec.md` supersession clauses + the round-5 ADR.**
  Dated banner addenda appended to the §12-table and §13.1 supersession banners
  (settled mechanism + `data-nav-count` settle extension) and the status line.
  **ADR-110** authored this run — the nav stream wrote no ADR and REQ-MEM-8's wording
  ("once the round-5 ADR lands") made it this ticket's to write; `docs/adr/README.md`
  regenerated via `adr-index.sh` (never hand-edited).
- **Drift fold-back.** COVERAGE_MATRIX REQ-MEM-6/7/8 `MISSING → MET` with evidence;
  BL-84's watch set gains ADR-110 (BACKLOG.csv + .md); a dated correction in BACKLOG.md
  fixes R5REC.1's `ADR-110`-for-ADR-082 misreference (the run-ledger twin stands —
  append-only, corrected here). GATE-ACCEPT.R5 signed rows 1/2/4 folded into §14.19
  (no intent-preload; dossier-stays-SPA-at-phone-width; mark-read freshness asymmetry).
  AGENTS.md gains the interceptor convention bullet (landed-code truth).
- **Manifest.** `00_MANIFEST.md § Spec amendments applied` gains the dated 2026-10-17
  line. `projectStatus` stays `IN_PROGRESS`; prod remains pre-chain `ffbb8ad`.

## Evidence

| Claim | Proof |
|---|---|
| Spec text matches the built mechanism | §14.19 cites the code line-for-line (`nav-intercept.ts` guard order, `RELOAD_STUB_IDS` verbatim, `dom.ts` replace arm, `head.tsx` tick/remount, `runner.ts` unconditional counter — all verified against the working tree) |
| REQ ids append-only | dated §14.18/§14.19 blocks + banner addenda; zero requirement text rewritten |
| ADR index derived | `adr-index.sh` regen — one new row, machine-generated |
| Backlog consistent | `check-backlog.sh` re-run green after the BL-84 source append |
| $0 / offline | docs-only diff; no stage contact |
| Append-only | `check-append-only.mjs --base 7ae45ba` |

## Operator flags standing

GD-R5OPS.1-1 (golden budget, AWAITING — not answered) · GD-FUNDED.1-1 (funded wave,
CARRY) · merge/deploy sweep · H8 ~11 items · CDN IAM decision · BL-85 residue ·
BL-29 out-of-class rulings · **D-R5REC.1-1 stays OPEN** (the `outline.dom.test.tsx`
mount-settle flake — a test-harness fix, deliberately out of scope for this
spec-text-only contract).
