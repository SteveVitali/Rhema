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

---

## Full per-row disposition table (committed per O2-Finding-2 — this IS the close artifact)

### Backlog rows (55 open; BL-83 `accepted` and 27 `closed` need no disposition)

| id | disposition | stream | operator-gated |
|---|---|---|---|
| BL-01 merge chain | OPERATOR | A | Y |
| BL-02 memory hygiene | DECOMPOSE | E | N |
| BL-05 REC.2 reconciliation | DECOMPOSE | E | Y (ratifies amendments) |
| BL-06 docs refresh | DECOMPOSE | E | N |
| BL-07 SLO remediation | DECOMPOSE | D | Y (ADR arms) |
| BL-13 unit-econ ruling | OPERATOR | B | Y |
| BL-16 B16 pin legs | ALREADY-DONE | — | N |
| BL-17 B17 invariants | ALREADY-DONE | — | N |
| BL-18 B18A/B fetch legs | DECOMPOSE | F | Y |
| BL-19 B19A-C gate legs | DECOMPOSE | F | Y |
| BL-20 research_burst/chat | DECOMPOSE | F | Y (H7 ruling) |
| BL-21 T11-T13 dossier | ALREADY-DONE | — | N |
| BL-22 account/export residuals | DECOMPOSE | C | Y (clock/substrate) |
| BL-23 invite consumed | OPERATOR | — | Y |
| BL-24 launch-verif remainder | DECOMPOSE | D | Y |
| BL-25 non-prod residuals | DECOMPOSE | D | Y (Resend secret) |
| BL-29 prod cost posture | DECOMPOSE | D | Y |
| BL-30 refundPhases ruling | OPERATOR | — | Y |
| BL-31 matcher floor | DEFER | — | Y (corpus) |
| BL-32 browser session legs | OPERATOR | — | Y |
| BL-33 Stripe live verify | OPERATOR | — | Y |
| BL-34 admin key reconcile | OPERATOR | — | Y |
| BL-35 pen test | OPERATOR | — | Y |
| BL-36 nightly golden | DECOMPOSE | D | Y (budget) |
| BL-37 exposure review | OPERATOR | — | Y |
| BL-38 prod residue cleanup | DECOMPOSE | D | Y (prod writes, delegated) |
| BL-39 partner program | DEFER | — | Y |
| BL-40 H2 corpus | DEFER | — | Y |
| BL-41 H4 venue table | OPERATOR | — | Y |
| BL-42 H5 essay/sign-off | OPERATOR | — | Y |
| BL-43/44/45 eval track | DEFER | — | Y (G2) |
| BL-47/76/77/84 ADR watches | DEFER | — | N (standing) |
| BL-50/51 entitlement rulings | OPERATOR | — | Y |
| BL-56 RES.1 residuals | DECOMPOSE | F | Y |
| BL-66 claim-ledger re-verify | DECOMPOSE | F | Y |
| BL-67 CITE probes + cap recon | DECOMPOSE | F | Y |
| BL-68 ECON.1 residuals + flip | OPERATOR | B | Y |
| BL-69 ECON.2 lever pairs | DECOMPOSE | F | Y (driver prerequisite) |
| BL-70 CAP.1 residuals | DECOMPOSE | C | Y |
| BL-71 CAP.2/3 live legs | DECOMPOSE | F | Y |
| BL-72 spend-guard convention | DECOMPOSE | D | N |
| BL-73 Later scope | DEFER | — | N (spec-verified, REQ-MEM-10) |
| BL-74 OBS.1 post-deploy | DECOMPOSE | D | N (soak DONE; nightly merge-dep) |
| BL-75 RES.2 retro ruling | OPERATOR | B | Y |
| BL-78 MAINT.3 live legs | DECOMPOSE | C | Y |
| BL-79 RES.3 retry-drain | DECOMPOSE | F | Y |
| BL-80 Resend + 15 preview legs | OPERATOR (secret) → DECOMPOSE (legs) | A | Y (single seed) |
| BL-81 merge stack | OPERATOR | A | Y |
| BL-82 composed verification | DECOMPOSE | A | N ($0) |

### Deferral rows — grouped by disposition class (lines cite DEFERRALS.md)

**ALREADY-DONE (flip cells only — REQ-MEM-1 normalization):** D-P0.03-2/-3, D-P0.08b-2/-3, D-P0.09-3, D-P0.15b-1..4, D-P0.15c-2/-3/-5, D-P0.15d-2, D-PRB.04-1, D-PRB.13-1, D-PRB.21-1, D-P1.07-1, D-P1.15-1, D-P1.22-1, D-SLO.1-1..4, D-DEF.4-1, D-CITE.1-1/-4, D-CAP.2-3, D-CAP.3-1/-2, D-STB.5a-1..3, D-STB.5b-2, D-SPA.26-1/-27-1, D-OBS.1-2, D-SPAF.*-1/-2 (28 rows), D-ECON.2-1.

**DROP (mooted):** D-SPAF.*-3/-4 (28 rows), D-SPA.12-2..24-2 rollback drills (13), per pending operator call on literal closes.

**DECOMPOSE — stream C (fixture/substrate):** D-P1.18-1 (T8), D-P1.19-1 (T15/T16), D-P1.04-2 (T7 destruction), D-STB.5b-4/-5, D-MAINT.3-1, D-CAP.1-1, D-SPA.25-1 (T17).

**DECOMPOSE — stream A/V (verification):** D-SPA.28-1, D-SPACAP.2-1..4, D-SPACAP.3-1, D-CAP.1-2, D-CAP.2-2 ($0 half), D-SPA.6/12..24-1 (preview legs, behind BL-80 secret).

**DECOMPOSE — stream D (ops):** D-SLO.1-5..8, D-P1.22-2, D-OPS.1-1/-2, D-OPS.2-2, D-STB.5b-1, D-OBS.1-3, D-P0.15-4, BL-38 residue.

**DECOMPOSE — stream F (funded, gated REQ-G1-4):** D-PRB.02-3, D-P1.21-2, D-STB.5b-3, D-P0.15-3, D-P1.10-1, D-P1.12-1, D-P1.14-1, D-P1.11-1, D-DEF.1-1, D-RES.1-1..3, D-CITE.1-2/-3/-5, D-ECON.1-3/-4, D-ECON.2-2..4, D-ECON.2-6, D-CAP.2-1, D-RES.3-1.

**OPERATOR:** D-PRB.01-1, D-SEC.2-1, D-OPS.1-3, D-OPS.2-1, D-DEF.4-3, D-PRB.04-2, D-PRB.07-1, D-PRB.08-1, D-P1.08-1, D-P1.09-1, D-P1.16-1, D-P1.17-1, D-P1.17-2, D-P1.19-2, D-P1.20-1, D-P1.21-1, D-P1.22-3, D-PRB.01-2, D-SEC.1-2, D-ECON.1-1, D-ACT.1-1, D-ACT.1-3, D-BILL.3-1/-2, D-RES.2-2, D-MAINT.4-1, D-MAINT.6-1 (the Resend seed itself).

**DEFER:** D-P0.06-3, D-P0.12-3, D-P0.13-*, D-P0.14-*, D-P0.15c-4, D-PRB.02-2, D-ECON.1-2, D-ECON.2-5/-2-7 (eval/corpus/standing-watch class).
