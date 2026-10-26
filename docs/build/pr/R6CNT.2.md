## Summary

R6CNT.2 — apply HUMAN-H11's approvals (REQ-POS-3/REQ-LCH-3/REQ-LCH-4/REQ-LCH-1; manifest row 194).

- Showcase fixture replaced: H.G. Wells "The Extinction of Man" (public domain) — full Full-board-shaped dossier (outline/v1/letters/findings/claims/rubric/run card/triage+revision/v2), ≥1 contradicted Tier-1 claim w/ fetched source URLs, Apply-capable finding (b7 exact anchor); `assertShowcaseFixture` green.
- Web sample dossier swapped to the approved Wells proposal (real deep URLs).
- H4 verified_at stamps applied to the four directly-verified venue rows (PLOS ONE, NYT, LAT, Globe); WaPo/WSJ/USA Today stay stale (re-fetch blocked 403/401/402 — never fabricated).
- Legal details filled (entity Rhema Labs / NY, NY / contact@rhema.tools) — all five pages `approved: true`; unsupported CONTACT_ADDRESS placeholder removed.
- Exposure-notice send tool added (`--dry-run` default; verbatim H11-approved text; dedup/collapse-key delivery; counts-only). **Send is a named mutation — executed only at deploy time under GD-EXPOSURE-NOTICE.R6.**
- ADR-121: fixture authored under the funding-cap pause (cheapest legal Full-board cap $33.48 > $15 operator bound, $0 headroom); live-run regeneration deferred (D-R6CNT.2-1).

## Verification

Focused suites green (contracts legal 9 · protocols 13 · sample-dossier 2 · legal-pages 19 · api dossier 8 · server 113 · ledger exposure-notice 4); full `pnpm turbo build lint typecheck` 135/135. Full `pnpm test` + checks at closeout.

## Live-stage plan (named mutations)

Redeploy of the tip under GD-DEPLOY.R6 (four conditions evidenced before `pulumi up`) → prod-migrate-seed (seedProtocols → venue_table_verified_at) → showcase seed → fresh-account leg (dossier open on finding 1 ≤ 60 s) → exposure-notice send (counts only) → GATE-LAUNCH staged for the operator. Evidence committed under `docs/build/reports/`.

Requirement ids: REQ-POS-3, REQ-LCH-3, REQ-LCH-4, REQ-LCH-1.

## Live outcome (2026-10-23)

- Deployed `dc7fb15` → **`ba66c4b`** under GD-DEPLOY.R6 (Cloud Build `b05636b5`; preview 10u+1r stateless-tmpl only + 161 same; additive lint PASS; cost $0; provenance all-PASS; `record-deployment` written).
- `/showcase` serves the Wells dossier live; `venue_table_verified_at 2026-10-21` on prod; legal pages render the approved values.
- Showcase seed sweep: +2 membered-workspace showcases (33 total; the 31 pre-existing rows keep the prior fixture — operator call recorded in GATE-LAUNCH threshold 4).
- Fresh-account leg GREEN: real signup → first finding card 1,737 ms after landing / 11.97 s after signup (budget 60 s).
- Exposure notice SENT: dry-run 4 staff/operator recipients = approval basis → 4 emails + 4 inbox rows (counts-only log committed).
- **F-R6CNT.2-1 (live-found, launch-relevant):** prod `rhema-prod-anthropic-api-key` v3 401s on the shared model path — `run.walkthrough` lands failed (by-design nicety) and any paid model call would 401. Recorded in LEDGER OPEN FINDINGS + flagged first-line in `docs/build/readouts/GATE-LAUNCH.md`.
- GATE-LAUNCH readout staged — 13 thresholds tabulated honestly; the operator's go is not recorded by the agent.
- Verify: turbo 135/135 · pnpm test 515 files / 6,073 / 0 fail · six check:* green · build-memory 0 violations · append-only OK vs `97e2a88`.

Merge: OPERATOR.
