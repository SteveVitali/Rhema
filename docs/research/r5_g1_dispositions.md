# R5.G1 — Open-row census → per-row disposition map

**Stream:** cross-stream synthesis · **Researched:** 2026-10-15 · **Ledger rows:** G1 · **Confidence:** high (counts cross-validated; ~4-row parse delta flagged)

## Census shape

84 BL rows = 55 open + 2 accepted + 27 closed. 320 physical deferral rows; SPAREC.1 validator parsed 203 owed at 10-10. Dispositions: DECOMPOSE (enters a round-5 stream) / OPERATOR (ruling/credential/human act) / DEFER (later track) / DROP (mooted) / ALREADY-DONE (substance discharged, cell stale).

## Headline dispositions (full table in agent note)

- **ALREADY-DONE:** BL-16, BL-17, BL-21 (substance discharged; flip cells); ~17 zombie rows (OPEN/PARTIAL lead + DONE tail → cell normalization under BL-02); D-SPAF.*-1/-2 (28 rows, discharged at `ffbb8ad`); D-SPA.26/27-1 entry gates; D-SLO.1-1..4; D-CAP.3-1/-2; D-STB.5a-1..3; D-P1.15-1 quiet-hours; D-OBS.1-2 (soak — closing read recorded this session).
- **DROP (mooted):** D-SPAF.*-3/-4 (28 rows — Arm-B election discharged pacing+rollback arms; `git revert`+redeploy survives); D-SPA.*-2 preview rollback drills (13+ — no flag exists post-SPA.28).
- **DECOMPOSE round-5:** stream A (BL-82 SHA-exact composed pass, D-SPA.28-1 thin legs, D-SPACAP.2-* $0 legs, BL-80 preview wave behind the secret); stream C (T8, T7-destruction, T15, T16, T17, T12F/T13F, D-STB.5b-4/-5, D-MAINT.3-1); stream D (BL-07 SLO breaches D-SLO.1-5..8, BL-24 launch-verif, BL-25, BL-29 posture, BL-36 golden, BL-38 residue, BL-72, BL-74 nightly green); stream E (BL-02, BL-05, BL-06); stream F (all funded legs — gated on fresh window + flagged purge-exempt tenant + house grant + system DSN; REQ-FND-8).
- **OPERATOR (~20 rows, one-session bundle):** BL-01 merges; BL-80 Resend seed; BL-23 invite mint; BL-33 Stripe live verify; BL-34 admin key; BL-35 pen test; BL-37 exposure review; BL-13/68 metered-flip + unit-econ ruling; BL-30/75 retro/refund rulings; BL-50/51 entitlement rulings; BL-41/42 H4/H5 deliverables; D-OPS.2-1 billing export; D-MAINT.4-1 Google sign-in; X-cite1-leg-cap-recon.
- **DEFER:** BL-40/43/44/45 eval+benchmark track (operator ruled out); BL-39 partner program; BL-31 matcher floor; BL-47/76/77/84 standing ADR watches; BL-73 spec-scheduled Later scope; D-ECON.1-2/-2-5/-2-7; D-P0.06-3; corpus rows.

## Spec requirements emitted

- **REQ-G1-1** — projectStatus close consumes this census keyed on *effective* status (first canonical token + dated late notes), not leading keywords.
- **REQ-G1-2** — No round-5 run re-emits discharged work (zombies, DONE-first cites, BL-16/17/21).
- **REQ-G1-3** — Stream-A decomposes into exactly 3 tickets: (i) `ffbb8ad` SHA-exact composed pass (BL-82 + D-SPA.28-1), (ii) preview-leg wave behind the Resend secret, (iii) nothing for mooted drill families.
- **REQ-G1-4** — Stream-F requires a fresh funded window + flagged purge-exempt tenant + house grant + system-role `JOURNEY_DATABASE_URL`; no funded run until the operator rules envelope/tenant/duration.
- **REQ-G1-5** — The ~20-row OPERATOR cluster is a single-session prerequisite bundle (listed above).

## §Q additions

- The ~4-row parse delta (validator 203 vs grep ~199) → BL-02 scope.
- D-P0.15b-1 cell tail unread → confirm before flip.
- SHA-exactness: does D-SPACAP.2-1 need one `ffbb8ad` re-run ($0) or accept deploy-series evidence?
- D-SPAF.*-3/-4 DROP vs literal per-row dated closes (operator preference).
- BL-68 constituent legs ride organic traffic vs a funded measuring wave.
- B17 registry flag stays `red` — intended (unreachable arm) or stale flip owed?
