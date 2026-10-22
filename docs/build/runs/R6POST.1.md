# R6POST.1 — Prod arms on the deployed tip ($0 legs + two pre-authorized fixture writes) — run ledger

- **Spec:** `docs/tickets/189_R6POST.1__prod-arms.md` (manifest row 189, round 6 — Kind: ticket) —
  `implement-spec`; spec §4.6 `REQ-POST-1/-2/-3/-5/-7/-8/-9`
- **Base:** `stevevitali/r6inf-1-infra-posture` @ `bc23409` (chain tip; PR base = same;
  mergePolicy=OPERATOR — never merge)
- **Branch:** `stevevitali/r6post-1-prod-arms`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-POST-1, REQ-POST-2, REQ-POST-3, REQ-POST-5, REQ-POST-7,
  REQ-POST-8, REQ-POST-9
- **Live stage:** prod — `dc7fb15a0aa7caa5d47734656d06514d5b75b127` (deployed by R6DEP.1; every leg
  reports `--expect-sha dc7fb15a0aa7caa5d47734656d06514d5b75b127`); SQL REGIONAL; worker 1vCPU/1Gi
- **Production mutations (GD-PREAUTH-ACTS.R6 — exact scope):**
  - `scripts/live/mint-t8-export.mjs --execute` (D-FIX.1-1) — binds `JOURNEY_T8_EXPORT_TOKEN`;
  - `scripts/live/seed-bl78-fixtures.mjs --execute` + `--entitlement` (D-FIX.1-3) — flagged tenant only.
  Both `is_test`-scoped, pre-state captured, per-script rollback. Dry-run scope mismatch → do NOT
  execute; record + flag FIRST-LINE.
- **Spend posture:** all legs `paid:false`; $0 confirmed via the system-role guard read over the IAP
  tunnel (tunnel closed after).
- **Started:** 2026-10-22T20:31Z · **Closed:** pending

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Load list + dispositions:

- **D-SPA.6-1** — already **DONE** (2026-10-22, R6DEP.1): prod `--expect-renderer ssr` leg + preview
  `--expect-renderer spa` sweep both green. This run re-proofs the arm on the tip (REQ-POST-1).
- **D-OPS.1-1** — OPEN; the posture-bound residual (collab-wire N8 + Stripe N9 + T8 expired-token)
  discharges on the prod arm (prod has real domains + Stripe live-mode). VERIF.2/pr-186 +
  R6DEP.1/pr-207 evidence recorded in-row.
- **D-SEC.2-1** — OPEN; real-invite-consume leg. `RHEMA_INVITE_CODE` is NOT set in this environment
  (probed 2026-10-22T20:31Z); the H10 invite mint is operator out-of-band. Per the ticket: if absent
  or unredeemable → defer the ONE leg with a dated note; mechanism stays ready (`--invite-code`).
- **D-PRB.01-1** — PARTIAL; its residual IS D-SEC.2-1 (invite enforcement at creation). Same
  disposition — stays PARTIAL with a dated note.
- **D-CAP.1-1** — PARTIAL; the live browser walk of the deep-link layout restore → POST-3.
- **D-FIX.1-1** — OPEN; the T8 410 arm; `mint-t8-export.mjs --execute` is a ticket-named mutation.
- **D-FIX.1-3** — OPEN; BL-78 probes (mooted-defer 409 + entitlement render) after
  `seed-bl78-fixtures.mjs --execute`.
- **D-STB.5b-4** — PARTIAL; code-fixed; its live leg is D-FIX.1-3(a).
- **D-MAINT.3-1** — PARTIAL; its live legs are D-FIX.1-3(b).
- **D-P1.18-1** — PARTIAL; the import round-trip arm is POST-5's T3 leg; the 7-day expiry arm is
  owed to R6CLK.1 (noted); citeproc + in-app download already DONE in-row.
- **D-R5OPS.1-2** — OPEN→(re-pointed by R6UCD.1); the live verify probes ride POST-7
  (`usercontent-cdn-verify.mjs` re-pointed at api-minted v4 signed URLs).
- **D-P1.22-2** — PARTIAL; its (c) usercontent residual = D-R5OPS.1-2's live probes → POST-7;
  (f) → D-R5OPS.1-1, (e) channel arm → F-R6OPS.1-1 — the row stays PARTIAL on those.
- **D-SLO.1-6** — OPEN; the post-deploy `slo_samples{signal='event_delivery_ms', detail='tail'}`
  p95 re-read over a ≥50-sample window → POST-8 (R6ENG.2 recipe).
- **D-P1.17-2** — PARTIAL; the agent half (Lighthouse + axe + drop-zone→signup→ingest ≤20 s) →
  POST-9; funnel-metric legs stay HUMAN/owner-routed.

## Requirements (spec §In scope — deliverables)

1. POST-1 SSR arm re-proof: `--expect-renderer ssr` on the public funnel + phone-UA Page legs
   (uncapped pane), edit POST (N8), seam conformance (R10 nav contract + settle markers), clean
   observability (consoleErrors:[]), control legs (X1.* isolation).
2. POST-2 signed-in legs: mailto (legal contact link), invite-accept (H10 invite via
   `RHEMA_INVITE_CODE` — defer alone if absent), `/r/:token`-class token expiry, OAuth initiation.
3. POST-3 deep-link restore (`/p/:slug/f/:fid` → dossier anchor + `?focus=1` layout restore).
4. POST-5 fixture legs after the two executes: T8 410 `export_link_expired`; BL-78 mooted-defer →
   409 `obligation_not_routable`; entitlement render probes (matched shape → `Included` + hidden
   `entitlementId`; mismatched → funded estimate, no `data-included`); export import round-trip
   parity (T3). 7-day expiry arm owed to R6CLK.1.
5. POST-7 usercontent: `usercontent-cdn-verify.mjs --execute` — unsigned/signed/tampered/expired
   probes + the header leg (attachment + octet-stream + no Set-Cookie).
6. POST-8 SSE window re-read: `slo_samples{detail:'tail'}` p95 ≤ 2,000 ms post-deploy, or honestly
   re-owed with its date.
7. POST-9 Lighthouse + axe on prod (LCP < 2.5 s, CLS < 0.05, reduced-motion) + drop-zone→signup→
   ingest ≤ 20 s (N1+N3 on a flagged account).
8. Every closed D-row flipped with evidence; still-red re-owed with classification.

## Acceptance criteria

- [ ] Every leg's report committed with `--expect-sha` = the deployed tip; `consoleErrors:[]`
  where asserted *(live-executed)*
- [ ] $0 spend confirmed (guard read) *(live-executed)*
- [ ] Universal phase-gate AC *(agentic)*

## Plan

1. Branch + ledger + PR skeleton (PR number for boundary reads at close).
2. Baseline: `pnpm --filter @rhema/journeys build`, `pnpm --filter @rhema/db build` (the BL-78
   seeder imports `packages/db/dist`), playwright chrome present.
3. Leg set A (POST-1 SSR arm, anonymous): `--steps N10,P1.public,N2.invite --expect-renderer ssr`.
4. Leg set B (signed-in, unpinned — phone legs self-assert the SSR verdict): the full `paid:false`
   registry (`--journey all`) incl. N8 edit POST, R10/R10.keepalive seam, X1.* controls, P1.*
   phone family, T1–T8 seeded legs (JOURNEY_DATABASE_URL over the tunnel for T7/T12F/T13F), N1+N3
   (POST-9's ≤20 s leg), T3 (POST-5 import parity), N9 (Stripe-hosted page — prod posture),
   T8 (bound after the mint executes).
5. POST-2 probes: legal mailto + `/api/action/<bogus>` expiry surface + magic-link verify bogus
   token + `sign-in/social` OAuth initiation (client_id assertion, no callback).
6. POST-3: playwright deep-link probe (scratch script, committed evidence).
7. IAP tunnel (`rhema-prod-proxy-vxdt` → 10.46.0.3:5432): pre-state → mint-t8 dry-run → scope match
   → `--execute` → capture token; seed-bl78 dry-run → `--execute --mooted --entitlement`; POST-5
   probes; POST-8 slo read; $0 guard read; tunnel closed.
8. POST-7 usercontent verify (gcloud signBlob impersonation; `CDN_VERIFY_ACK=yes` — the ticket's
   POST-7 leg IS the operator's prod-read go for this read-only probe).
9. POST-9: playwright perf probe (LCP/CLS via PerformanceObserver, axe-core inject, reduced-motion)
   on `/` + the N1/N3 journey legs.
10. Registry flip if earned (T8 red→green), DEFERRALS flips/dated notes, verify suite, self-review,
    gap table, closeout.

## Test matrix

No product-code change — the legs are the tests. Registry `T8` flips `red→green` only if its live
leg passes (registry.test.ts must stay green). Verification at close: scoped journeys/db builds +
`pnpm turbo build lint typecheck`, `pnpm test`, all `check:*`, `check-build-memory.sh`,
`check-append-only.mjs --base bc23409`.

## Progress

- 2026-10-22T20:31Z — branch cut at `bc23409`; contract + DEFERRALS (14 rows) + spec §4.6 + anchors
  read; prod `/healthz` web+api both `dc7fb15a0aa7caa5d47734656d06514d5b75b127`;
  `RHEMA_INVITE_CODE` unset (invite-accept leg disposition recorded); proxy VM
  `rhema-prod-proxy-vxdt` RUNNING; secrets `rhema-prod-alloydb-password` /
  `rhema-prod-app-database-url` present.
- Interpretation note (recorded, not silently resolved): spec §4.6's "`/r/:token` expiry" names no
  literal route — no `/r/` token route exists in code or git history; the only token-parameterized
  GET with an expiry arm is the signed one-click email action `/api/action/:token` (400 bad/malformed,
  410 expired_or_consumed) plus the magic-link verify + export-token gates. The leg runs on the
  token-link expiry surface (`/api/action/<bogus>` → 4xx; magic-link verify bogus → error redirect,
  no session) and the naming discrepancy is flagged in the PR.

## Gap table

(pending — Phase 4)

## Evidence log

(pending — Phase 5)

## Evidence report

(pending — Phase 6)
