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
- **Started:** 2026-10-22T20:31Z · **Closed:** 2026-10-22 (PR #210, mergePolicy=OPERATOR — unmerged)

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

- [x] Every leg's report committed with `--expect-sha` = the deployed tip; `consoleErrors:[]`
  where asserted *(live-executed — provenance `match:true` on all three journey runs; the one
  console-erroring leg, N9's Stripe-hosted page, is the substrate-drift FAIL and carries its own
  screenshots/diagnostics)*
- [x] $0 spend confirmed (guard read) *(live-executed — journey-run spend $0.00 ×3 reports AND the
  system-role guard read: 0 real metered `usage_records` rows this ISO week after REQ-ECON-6's
  `req_jrn_` exclusion; the 5 rows written today are the R6F leg's seeded fixture marks, excluded
  by design)*
- [x] Universal phase-gate AC *(agentic — self-review + gap table below; all validators green)*

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
- 20:36Z — **leg set A (POST-1 SSR arm) PASS**: `node packages/journeys/dist/cli.js --stage prod
  --expect-sha dc7fb15a0aa7caa5d47734656d06514d5b75b127 --expect-renderer ssr --steps
  N2.invite,N10,P1.public --out docs/build/reports/2026-10-22_R6POST.1/journeys-ssr` → 3/3 PASS,
  provenance match, `weeklyMeteredUsd:0`, zero renderer violations, `consoleErrors:[]`.
- 20:36Z — **leg set B (full signed-in `paid:false` registry) on `dc7fb15` → 37 PASS / 2 FAIL /
  1 OWED / 1 READY-TO-FLIP**: `--surface=signed-in` run (`journeys-full/`) — every green leg passed
  incl. N1/N3 (the ≤20 s funnel legs), N4 phone-UA uncapped-pane, N8 edit POST + yjs collab wire,
  R10 seam conformance, R7+R8 family, all P1.* phone/SSR legs, X1.* controls, T1/T2/T3(import
  parity)/T4/T6/T12F/T13F/T17, R6F report leg, C1. **T8 → `ready-to-flip`** (minted fixture bound —
  bogus→404, minted→410 `export_link_expired`; registry flipped green this run). Fails: **N9** —
  Stripe "Buy 1,000 credits" not in DOM: **substrate drift, not a product regression** — prod no
  longer carries the funded tenant N9 seeds (it does carry GD-FUNDED.1-1's contents); re-owed to
  the funded wave (probe `post-n9-probe.txt`-class diagnostics captured in-report); **T5** —
  "discovery listed 0 items, expected 2" (transient index lag — isolated `--steps T5` retry PASS,
  `journeys-t5-retry/`). Owed: **R10.keepalive** — expected-red pending its first live keepalive
  event on a domains-bearing stage; T15/R8.invite/P4 absent from the surface set (invite-code
  gating — `RHEMA_INVITE_CODE` unset; owed on D-SEC.2-1).
- 20:37–20:41Z — **POST-2 probes** (`post2-probes.txt`): OAuth initiation POST
  `/api/auth/sign-in/social` → real Google authorization URL (client_id `25012989319-…`,
  redirect_uri `https://rhema.tools/api/auth/callback/google`, `code`+PKCE S256); action-token
  surface: malformed→400, forged-bad-signature→400, forged-HMAC-over-expired-row→**410
  `expired_or_consumed`** (zero-write consume — expired rows match nothing); magic-link bogus→302
  `?error=INVALID_TOKEN`. **mailto**: `/legal` 404 (the legal pages are draft placeholders with
  `LEGAL_DETAILS.CONTACT_EMAIL=null`, `approved:false` — no real `mailto:` exists to probe;
  `/terms`/`/privacy`/`contact`/`refunds` render placeholder copy, which IS the verified shipped
  behavior). Invite-accept: `GET /api/signup-config` → `signupMode:"open"`, prod `invites`=0 →
  deferred on the operator mint (D-SEC.2-1 dated tail).
- 20:38Z — **POST-8 honest finding**: zero `slo_samples{signal=event_delivery_ms,detail=tail}` rows
  post-deploy (`at >= 2026-10-22T15:49Z`); one historical tail sample only (2026-10-21). The
  p95 re-read is **unmeasurable** — tail samples mint only from real run traffic flushing SSE and
  none has occurred since deploy; dated re-owal appended to D-SLO.1-6.
- 20:38–20:43Z — **fixture writes (GD-PREAUTH-ACTS.R6) executed**, IAP tunnel up
  (`rhema-prod-proxy-vxdt` → 10.46.0.3:5432, system DSN): (1) `mint-t8-export.mjs` dry-run matched
  the itemized scope verbatim (ONE `account_exports` insert on the flagged `test+jrn-a` tenant) →
  pre-state captured (0 rows) → `--execute` minted `t8exp_1f9832c4b64d445498f4` (created −9d /
  ready −8d / expired −1d, stub s3_key, hash-only token — raw token bound only in-process as
  `JOURNEY_T8_EXPORT_TOKEN`, never committed) → post-state verified (ready+expired+key+hash).
  Rollback: `delete from account_exports where id='t8exp_1f9832c4b64d445498f4'`.
  (2) `seed-bl78-fixtures.mjs` dry-run matched (mooted dossier `jrn-bl78-mooted` + two
  `obligation_findings` edges + `open→mooted` transition; entitlement arm already claimable —
  `locked`/`unused` row matching `PRICING.trial.entitlement` verbatim → seeder no-oped it) →
  `--execute --entitlement` landed the mooted substrate. Evidence `mint-t8-{dryrun,prestate,
  execute,poststate}.txt`, `seed-bl78-{dryrun,execute}.txt`.
- 20:40Z — **POST-5 fixture legs PASS**: T8 via the suite above (404 bogus / 410 minted);
  BL-78 mooted-defer probe — `POST defer` on the `jrn-bl78-mooted` mooted finding → **409
  `obligation_not_routable`** (`no obligation transition mooted → deferred`), discharged twin →
  same 409, `dispositions` count unchanged (`post5-mooted-probes.txt`); entitlement render —
  matched `review/standard/base` → `data-included="true"` + hidden `entitlementId` + "Included —
  trial covers up to 2,800 words"; mismatched `review/quick/base` → funded 619-cr estimate with no
  `data-included`/hidden id (`post3-post5-probes.json` + `post5-entitlement-*.png`); T3 import
  round-trip parity PASS in-suite (same-zip → fresh-account import → parity → re-import `deduped`
  → zip carries no protocol marker).
- 20:41Z — **POST-3 deep-link PASS**: `GET /p/jrn-bl78-mooted/f/bl78_047beb10-…` → 302 →
  `/p/jrn-bl78-mooted/review/bl78_d025c50e-…#finding-bl78_047beb10-…`; browser landed the dossier
  with the anchor element present by id + in-viewport inside the findings pane (19 cards), zero
  console errors (`post3-post5-probe.mjs` → `post3-post5-probes.json` + `post3-deeplink.png`).
- 20:43Z — **POST-9 PASS**: Lighthouse on `https://rhema.tools/` (fresh cold profile, desktop
  preset): all categories 1.00 — LCP **1.1 s** < 2.5, CLS **0.013** < 0.05, FCP 1.1 s, TBT 0 ms
  (`post9/lighthouse-prod-home.json`); axe: 26 passes, **0 violations**, `color-contrast`
  incomplete (manual-review rule); `prefers-reduced-motion` → zero animated elements + hero still
  visible (`post9-axe-reducemotion.{mjs,json}` + `post9/reduced-motion.png`); drop-zone→signup→
  ingest ≤20 s discharged in-suite by N1 (hold persistence across sign-in + two reloads) + N3
  (held draft → project → conversion preview READY inside the 20 s assert + `?hc=` consumed
  handshake), both PASS at $0.
- 20:44Z — **POST-7 PASS**: `usercontent-cdn-verify.mjs --execute --cookie <flagged-session>
  --object quarantine/<ws>/<id>` — minted through the REAL api route (`GET /usercontent/sign`,
  tenant check + `signBlob` live): unauth mint→**401**, unsigned GET→**403**, signed→**200** +
  `attachment` + `application/octet-stream` + no `Set-Cookie`, tampered→**403**, expired→**400**.
  Verdict PASS (`usercontent-verify.json`, `minted_via:"api-route"` — the impersonation arm was
  unavailable: this runner identity lacks `serviceAccounts.getAccessToken` on the api SA; the
  api-route arm is strictly stronger — it exercises the tenant check + the deployed mint).
- 20:45Z — **$0 guard, resolved**: the five `usage_records` rows written at 20:37Z ($12.33 list,
  4,110 credits, run `01M5JNA…`) are **seeded fixture fiction, not real metered spend** — they are
  the R6F leg's `seedDeliveredRunReport` marks (`provider_request_id = 'req_jrn_report_*'`), which
  REQ-ECON-6's spend-guard SQL excludes by design. Guard re-run pinned to the exclusion: **0 real
  metered rows this ISO week / today** (`zero-spend-guard.txt`). Both journey reports' own
  `weeklyMeteredUsd:0` readings agree.
- Closeout — registry `T8` red→green (`packages/journeys/src/registry.ts`, evidence-cited;
  `registry.test.ts` green-baseline list updated with its dated comment — 9/9 pass);
  DEFERRALS flips **DONE**: D-FIX.1-1, D-FIX.1-3, D-STB.5b-4, D-MAINT.3-1, D-CAP.1-1, D-R5OPS.1-2,
  D-P1.18-1 (7-day organic arm re-pointed to R6CLK.1); dated tails on D-SEC.2-1, D-PRB.01-1,
  D-OPS.1-1, D-SLO.1-6, D-P1.17-2, D-P1.22-2, D-SPA.6-1. All DONE flips use the
  `**DONE — …** … Original cell:` prepend convention — original verdict text preserved verbatim.
- Verification — `@rhema/journeys` build/lint/typecheck clean; `vitest registry.test.ts` 9/9;
  `check-build-memory.sh` **0 violations** (9 warnings, all pre-existing budget/legacy classes);
  `check-append-only.mjs --base bc23409` **OK**; ci-boundary → **`ci: pass #210@cd24c9e`**
  (run 39849559442 — all legs incl. fast-path + `ci-pass` anchor; `logs/ci-R6POST.1.json`). The
  PR diff is docs + registry flag + evidence only — the product surface is untouched.

## Gap table

| req | state | evidence / carry |
| --- | --- | --- |
| REQ-POST-1 | **discharged** | `journeys-ssr` 3/3 PASS `--expect-renderer ssr` at `dc7fb15` (N10 observability incl. consoleErrors, P1.public uncapped-pane public arm, N2.invite); signed-in suite adds N4 (phone-UA uncapped pane), N8 (edit POST + collab wire), R10 (seam), X1.* (controls), P1.* family — all PASS same SHA |
| REQ-POST-2 | **discharged except invite-accept + mailto** | OAuth initiation green (real Google payload); action-token expiry surface: 400/400/410 + magic-link 302; invite-accept → **D-SEC.2-1** (prod open-mode, `invites`=0, `RHEMA_INVITE_CODE` unset — the operator mint is the one missing input); mailto → legal pages ship draft placeholders, `LEGAL_DETAILS.CONTACT_EMAIL=null` — operator/legal content gate (R6CNT.2/HUMAN-H11), verified behavior is the placeholder render |
| REQ-POST-3 | **discharged** | deep-link → dossier anchor in-viewport, findings pane restored, `consoleErrors:[]` — closes D-CAP.1-1 |
| REQ-POST-5 | **discharged** | T8 404/410 on the minted fixture; mooted-defer 409 ×2 zero writes; entitlement matched/mismatched render arms; T3 import parity — D-FIX.1-1/-3, D-STB.5b-4, D-MAINT.3-1, D-P1.18-1 flipped DONE |
| REQ-POST-7 | **discharged** | api-minted v4 verify PASS — 401/403/200+headers/403/400 — D-R5OPS.1-2 flipped DONE |
| REQ-POST-8 | **re-owed (honest)** | 0 post-deploy `event_delivery_ms{detail:tail}` samples — window unmeasurable; dated re-owal on D-SLO.1-6 (first qualifying window: funded wave / organic traffic) |
| REQ-POST-9 | **discharged (agent half)** | Lighthouse 1.00 ×5, LCP 1.1 s, CLS 0.013; axe 0 violations; reduced-motion clean; N1+N3 ≤20 s funnel legs PASS. Funnel-metric legs stay HUMAN (D-P1.17-2 PARTIAL) |

## Evidence log

`docs/build/reports/2026-10-22_R6POST.1/` — all SHA-pinned to `dc7fb15a0aa7caa5d47734656d06514d5b75b127`:
`journeys-ssr/report.json` (3/3 PASS, expect-renderer ssr) · `journeys-full/report.json` (37 PASS /
1 owed / 1 ready-to-flip / N9+T5 fails — T5 reran green in `journeys-t5-retry/`, N9 re-owed) +
per-leg screenshots · `post2-probes.txt` · `post3-post5-probe.mjs` + `post3-post5-probes.json` +
`post3-deeplink.png` + `post5-entitlement-{matched,mismatched}.png` · `post5-mooted-probes.txt` ·
`mint-t8-{dryrun,prestate,execute,poststate}.txt` · `seed-bl78-{dryrun,execute}.txt` ·
`usercontent-verify{,-dryrun}.json` · `post9/lighthouse-prod-home.json` +
`post9-axe-reducemotion.{mjs,json}` + `post9/reduced-motion.png` · `zero-spend-guard.txt`.
No raw tokens/DSNs/cookies in any committed file (T8 raw token lived only in `/tmp`).

## Evidence report

**Verdict: 6 of 7 prod arms discharged at the deployed tip; REQ-POST-8 honestly re-owed.** The
stacked PR carries zero product-code change (registry expectation flip + build memory only); every
user-facing surface claim is live-verified at `dc7fb15a` with `consoleErrors:[]` where asserted and
$0 real metered spend. Residuals — each operator-owned: invite mint (`D-SEC.2-1`), legal mailto
content (`LEGAL_DETAILS.CONTACT_EMAIL=null`, R6CNT.2), SSE p95 window (`D-SLO.1-6`), N9's funded
substrate (GD-FUNDED.1-1 wave), R10.keepalive first live keepalive, funnel metrics (REQ-WATCH-1).
