# FUNDED.1 — Funded-window wave (the paid-leg sweep) — run ledger

- **Spec:** `docs/tickets/167_FUNDED.1__funded-window-wave.md` (manifest row 167, round 5 —
  **expanded at run time** from `Kind: skeleton` per `decompose-spec mode=extend`, scoped to
  the GATE-R5F disposition)
- **Normative loads:** `docs/build/readouts/GATE-R5F.md` (disposition **"PASSED — open the
  window"**, 2026-10-16T18:5xZ); `docs/post-spa-disposition-spec.md` §5 + §5.6;
  `docs/research/r5_f1_funded-census.md`; `docs/tickets/DEFERRALS.md` (the funded-row ledger);
  `docs/build/runs/R5ECON.3.md` (the regime + committed drivers);
  `docs/build/runs/FUNDED-2026-10-06-A.md` (tenant-funding + purge lessons)
- **Base:** `stevevitali/verif-2-preview-legs` tip @ `9dcfcf9` (the GATE-R5F disposition commit)
- **Branch:** `stevevitali/funded-1-funded-window-wave` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + decompose-spec +
  build-memory @ `~/agent-skills`
- **Requirement ids stamped:** REQ-FND-1..8 · REQ-ECON-6 REQ-ECON-7 REQ-ECON-9 REQ-ECON-11
- **Authorization:** GATE-R5F PASSED — the ~$60 re-authorized round envelope (Q-ECON.f),
  pinned spend scope (flagged-tenant `source='proxy'`, `req_jrn_%` excluded), levered §5.3 caps,
  ~$20–40 estimated actual. Production mutations: journey tenant provisioning + paid model
  runs ONLY; the mechanical guard fails closed regardless of the disposition.
- **Deployed SHA:** `ffbb8ad01b4383ab7f11088c8427b668bc442b01` on api+web `/healthz`
  (`--expect-sha ffbb8ad` — the documented non-repo-sha divergence stands per VERIF.1).
- **Started:** 2026-10-16T19:0xZ · **Closed:** TBD
- **PR:** TBD · **ci:** TBD

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). The funded-carrier rows this
wave may discharge are enumerated in the expanded contract's wave table (D-CAP.2-1 umbrella;
D-RES.1-2/-3; D-P1.21-2; D-P0.15-3; D-P1.19-1 residuals; D-CAP.1-1; D-FIX.1-2 residual;
D-P1.14-1; D-PRB.02-3 fetcher half; D-STB.5b-3/-4/-5; D-MAINT.3-1; D-FIX.1-3; D-P1.11-1;
D-DEF.1-1; D-CITE.1-2/-3/-5; D-ECON.2-2/-3). Carried-not-runnable: D-RES.3-1 (product change
first), D-ECON.2-4 (verdict-gated), D-ECON.2-5/-6/-7 (operator-paused register items),
D-FIX.1-4 (clock-owed Monday digest), D-STB.5b-1/-2 (convention/unreachable residuals).

## Execution log

_(append-only — entries land as the window executes)_

### 2026-10-16 — expansion + env-bind

- Contract expanded (`decompose-spec mode=extend`, scoped to the disposition) + committed on
  `stevevitali/funded-1-funded-window-wave` at `9dcfcf9`. Wave table: 21 registry legs in
  checklist order + the §5.6 census items whose drivers landed (RES.1 excerpt, BL-20 pair,
  BL-78 arms, CITE probes ≤$9 each, ECON.2 pairs $3–5 each, ADR-086 read $0); RES.3 verify /
  ECON.2-4 / cost-card items carried with named prerequisites.
- Env: prod `ffbb8ad01b…` on api+web `/healthz`; ADC OK; proxy VM `rhema-prod-proxy-3ms6`
  (us-central1-c) RUNNING; DB `rhema-prod-postgres` private `10.46.0.3`; Chrome channel +
  bundled chromium present.

## Gap table (final)

_(to fill at closeout — every requirement + AC row, achieved-layer, evidence path, carrier)_

## Evidence report

_(to fill at closeout)_
