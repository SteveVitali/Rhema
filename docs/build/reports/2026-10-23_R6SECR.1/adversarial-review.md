# R6SECR.1 — Pre-launch adversarial security review (report)

**This review is not independent.** It was performed by the same model family that wrote the code
under review (Devin / Cognition SWE harness, `devin-desktop/swe-2-high/subagent`), on the same
repository, in a single session — the substitution ADR-112 records for the deferred external
penetration test (D-P1.22-3, still OPEN, post-launch ≤ 60 d). Nothing here should be read as an
external audit; it is a rigorous self-adversarial pass whose evidence is reproducible — every leg
is committed probe code or a cited deterministic suite, and the one finding it produced is
demonstrated live, in source, and in regression.

- **Date:** 2026-10-23 · **Reviewer harness:** devin-desktop/swe-2-high/subagent · **Ticket:** 195
  (manifest row 195, REQ-SEC-3, GATE-LAUNCH threshold 2)
- **Deployed surface reviewed:** prod serves `ba66c4b` (R6CNT.2 redeploy; ancestor of the review
  base `cd66194`). All live legs ran against it.
- **Spend:** **$0 confirmed** — every live leg is session-authed GET/POST that writes nothing; no
  run was dispatched, no model call attempted (`rhema-prod-anthropic-api-key` 401s — F-R6CNT.2-1).
- **Tenants:** two provisioned `is_test` workspaces (journey tenants A/B; `isTest:true` verified on
  `/session` 2026-10-23). Planted ids only; no real-user data touched; session material never left
  request headers.
- **Merge:** none (mergePolicy OPERATOR). The fix for F-R6SECR.1-1 lands on
  `stevevitali/r6secr-1-adversarial-review`; a prod redeploy under GD-DEPLOY.R6 is attempted this
  run because a launch-blocking critical is **live on prod right now**.

## Findings (severity per `pen-test-findings-triage.md` §2)

| id | severity | surface | verdict |
|---|---|---|---|
| F-R6SECR.1-1 | **CRITICAL** | api `/projects/:id/v/:n/diff/:m`, `/projects/:id/responses/:cid/what-changed`, both hunk-comment POSTs | **FIXED in-ticket** (ownProject guard); live-confirmed on `ba66c4b`; deterministic regression red→green |
| F-R6SECR.1-2 | low | web+api response headers | HSTS absent → DEFERRALS D-R6SECR.1-2 |
| D-R6SECR.1-1 | n/a (coverage obligation) | egress proxy / run-task / fetcher live legs | deferred — needs a live run (F-R6CNT.2-1) + spend authorization |

**Open criticals/highs at close: 0.** One critical found → fixed in-ticket with regression tests;
prod exposure persists only until merge+deploy (deploy attempted under GD-DEPLOY.R6 this run — see
§Close).

### F-R6SECR.1-1 — CRITICAL: `revision-routes.ts` serves foreign drafts and writes foreign guidance (cross-tenant read + write)

**Live evidence (prod `ba66c4b`, 2026-10-23):** authenticated as tenant A, `GET
/projects/<B-projectId>/v/2/diff/1` returned **200 with tenant B's draft bytes** — the diff view's
`before`/`after` draft ids (`01M5JNGZ7A…`) are B's own draft ids, and the body carried B's working
draft text verbatim. The mirror leg (B's session against A's project id) returned A's draft
`bl78_a53e53fc-…` content. Both directions leak.

**Root cause.** `revision-routes.ts` mounts four `/projects/:id/*` routes whose handlers jump
straight from the 401 check to `loadWhatChanged` / `loadVersionDiff` / `captureGuidance`. Every
sibling module guards project membership first (`version-routes.ts` `ownProject` at
`version-routes.ts:478-482`; `outline-routes.ts:75-80` `loadProject` with `workspace_id = $2`;
`editor/figure/finding/triage/approval/export` likewise). The revision module did not — and its
queries (`what-changed.ts` `resolveDraftRef`, `loadVersionDiff`, `loadWhatChanged`,
`responseProducedDraftId`, `utf8OfVersion`) filter on `project_id` only, with **no workspace
predicate**, because `drafts`, `correspondence_items`, `artifact_versions`, `guidance` are
tenant-by-FK tables (`rls-catalog.test.ts` Bucket C: no `workspace_id` column, no RLS — tenancy is
enforced ONLY by the route's ownership predicate). The guard was the entire boundary, and it was
absent.

**The write half is worse than the read.** `POST /projects/:id/{v/:n/diff/:m,
responses/:cid}/hunks/:hunkId/comments` resolves the foreign project's hunks and calls
`captureGuidance({ workspaceId: <caller's>, projectId: <path's foreign id>, … })` — inserting a
`guidance` row keyed to the **victim's** project. `consumeGuidance`
(`packages/orchestrator/src/guidance.ts:168`) selects `where active and project_id = $1` with no
workspace join, so attacker-planted text lands inside the victim's next Revise prompt — a
cross-tenant prompt-injection vector, not merely a stray row. (Code-verified; the write was not
executed against prod — the read hole already proved the missing guard, and a foreign guidance row
is a production mutation beyond probe scope.)

**Why it shipped.** The deterministic two-tenant probe's fixture bound no content store, so every
store-dependent route — exactly this family plus the dossier — 500'd at `storeFor`'s
"content store unavailable" check **before** the unscoped SQL ran. A 500 with no markers reads as
fail-closed; the census moved on. Prod binds `contentStoreFor`, so the same requests reached the
unscoped queries and leaked. This is the second masking layer found by the live probe (the first
being RLS-covered tables that never needed the guard).

**Fix (this branch).** `revision-routes.ts` now takes the same `ownProject` guard as
`version-routes.ts`: a scoped-db read of `projects` — the tenant-scoped client hides foreign rows
(RLS), so a foreign id reads zero rows → uniform `404 not_found`; an unbound `db` seam fails
closed. Applied to all four routes before any store/SQL work.

**Regression (verified both directions).** The deterministic probe now binds the prod
`contentStoreFor` seam (an `InMemoryContentStore`) and seeds a `response`-kind correspondence so
`/responses/:cid/what-changed` can actually resolve. On the **buggy** build the probe goes red
with 4 findings — `GET /v/:n/diff/:m` leaks `dft_probe_<foreign>` and `GET
/responses/:cid/what-changed` leaks `corr_probe_<foreign>` in both directions — proving the
fixture would have caught this had the store been bound. On the **fixed** build: green, 76 GET
routes probed, 0 findings. The live probe extension adds planted-foreign-id legs across every
user-serving family (below); on prod it flags exactly this finding and nothing else.

**Prod exposure.** The vulnerability is live on `ba66c4b` until a deploy carrying this branch's
fix. The only prod tenants today are operator/staff `is_test` workspaces (pre-launch), but the
defect class is the exact one that shipped once already (R6FOR.2's 252 reads) — a GD-DEPLOY.R6
redeploy of this chain tip is attempted at close.

### F-R6SECR.1-2 — LOW: no `Strict-Transport-Security` header on `rhema.tools` / `api.rhema.tools`

Observed on every sampled response (anon `/`, authed `/app`, api `/session`). TLS terminates at
the Google LB; HSTS is not emitted. Impact is bounded (all cookies are `Secure` + `__Host-`, every
surface is HTTPS-only) — but a first-visit-over-HTTP downgrade window exists until HSTS ships.
→ **D-R6SECR.1-2** (owner: infra; trigger: next infra/deploy config pass).

### Controls checklist — every `pen-test-scope.md` controls-list item

| control | verdict | evidence |
|---|---|---|
| §12.8(a) full-board fetch via `fetcher` tool only | holds (suite+code); live leg deferred | `injection-controls.test.ts` (tool-census assertions); live exercise needs a run → D-R6SECR.1-1 |
| §12.8(b) `<document trust="untrusted">` wrap on fetched pages + attachments | holds (suite); live deferred | `injection-controls.test.ts:207,242` (`^<untrusted:… trust="untrusted"`) |
| §12.8(c) suspicious Tier-1 source verdicts downgrade to `unverifiable` | holds (suite); live deferred | `injection-controls.test.ts:282-312` |
| §12.8(d) proxy channel limits (>256-char query, domain cap, ≥12-word n-gram → pause+refuse) | holds (suite); live deferred | `injection-controls.test.ts:320+` (planted exfil fixture pauses end-to-end) |
| §12.8(e) second read never sees fetched pages | holds (suite); live deferred | `injection-controls.test.ts:419+` (mount-manifest assertion) |
| §12.8(f) harness/agent uid privilege separation | holds (suite+infra); live deferred | suite + run-task distroless/two-uid/AppArmor posture (`pen-test-scope.md` surface map) |
| REQ-ARCH-32 `egress.denied` pauses run end-to-end | holds (suite); live deferred | `injection-controls.test.ts:342,481` |
| tenancy (forced-RLS + pooled isolation) | **F-R6SECR.1-1 — FIXED** | live probe: 178 planted-foreign-id legs, 1 finding (this one); deterministic probe now covers the masked family |
| secrets boundary (harness-only files, scrubbed agent env, no provider keys in web/collab) | holds | `secrets-manifests.test.ts`, `system-pool-boundary.test.ts`; live: forged/malformed `__Host-` cookies → 401 |
| quarantine-key tenant binding | **holds — live-verified** | foreign `quarantine/<wsB>/…` + `converted/<wsB>/…` mints → clean 404 (no `url`); signer never invoked (deterministic mint leg); `..`/`%2F` traversal variants → 404; own-prefix mint → working GCS V4 URL (`NoSuchKey` on the fake object = signature accepted, not `SignatureDoesNotMatch`) |
| CSP / cookie posture | **holds — live-verified** (+F-R6SECR.1-2 low) | web `script-src 'self' 'nonce-<per-request>'`, `img-src` allowlist incl. usercontent/storage origins, `object-src 'none'`, `frame-ancestors 'none'`; api `default-src 'none'`; session cookie `__Host-rhema.session_token` HttpOnly+Secure+SameSite=Lax; zero `Set-Cookie` on usercontent origin / api GETs; `usercontent.rhema.tools` bare GET → GCS 403 XML, no cookies settable |
| retention / tombstone lifecycle | holds (suite) | `retention-backup.test.ts`; soft-delete predicates on project surfaces verified in-route (`deleted_at` checks) |
| run-task sandbox (two-uid, distroless, AppArmor) | holds (suite+infra); live deferred | `system-pool-boundary.test.ts`, scope surface map; live legs need a run |
| fetcher + convert (SSRF, robots, egress) | holds (suite); live deferred | injection-controls + convert serving review; live needs a run |
| egress proxy live channel | deferred | needs a running run → D-R6SECR.1-1 |
| ingest / credential handling | holds (code) | LIVE_KEYS rotation + credential paths reviewed; no key material in logs (secrets suite) |

### Live probe evidence (prod `ba66c4b`, $0, `is_test` only)

Committed extension of `integration/src/two-tenant-probe.ts` live mode: each tenant's typed ids
are harvested from `/session` + the list routes, then planted across `LIVE_FOREIGN_GETS` (37 api
templates — voices, chat/outline/timeline/versions/settings/approvals/decisions/pretriage/
figures/files/bibliography/ai-use/voice/export/editor/drafts/restore-points/review-dossier/
what-changed/diff/findings/artifacts/gates/runs/billing/checkout/usercontent-sign/export-token/
action-token/settings) and `LIVE_FOREIGN_BFF_GETS` (17 `/bff/p/:slug/*` twins + 12 `/bff/*` list
twins), plus a second write leg (`POST /inbox/<foreign>/read`) alongside the existing refund leg.
The BFF foreign-slug value is chosen **outside** the requester's own slug set (a same-named slug
resolves to the requester's own row and proves nothing — real hazard here: both tenants own a
`showcase` slug; the probe falls back to the foreign project *id*, which can never be a valid
slug).

- **Result: 178 legs, 4 write legs — exactly 1 finding (F-R6SECR.1-1, both directions).**
- Anonymous posture: `/voices` 401, `/bff/app` 401, `/app` 302→`/login`; forged + malformed
  session cookies → 401.
- `/billing/usage/project/<foreign>` → 200 `{projectId:<supplied>, totalCredits:0, runs:[]}` —
  reviewed: `usageLevel2` predicates every query on `workspace_id` and echoes only the
  caller-supplied id; byte-identical for a nonexistent id ⇒ not an oracle, **not a finding**
  (whitelisted in the probe as `LIVE_FOREIGN_200_OK`).
- Own-prefix mint signs nonexistent keys under the caller's own namespace — by design (the
  boundary is the workspace prefix; GCS 404s the fetch). Noted, not a finding.

### Money paths (code + probe, no paid runs)

- **Refund bounded by §14.4:** `POST /runs/:id/refund` → `requestUserRefund`
  (`packages/ledger/src/refund-window.ts:131`) — `runs` row locked `where id=$1 and
  workspace_id=$2 for update of r` (foreign → `not_found` → 404); one episode key per run
  (`user-refund:${runId}` — auto and review paths share it, never double-returned); net-of-
  refunds computed from committed `credit_ledger` rows; quarterly allowance auto-approves the
  first eligible request, a second lands `pending_review`; unique `run_id` on
  `user_refund_requests` makes replay return the recorded verdict. **Live:** foreign refund POST
  → 404, zero request rows / zero refund ledger rows on the foreign run (probe durable check).
- **No double-spend / replay:** Stripe webhook intake dedupes on `singletonKey: stripe:${event.id}`;
  checkout/subscription processing keys `stripe:checkout:${session.id}`,
  `stripe:sub:${invoice.subscription}`; admin grants keyed `on conflict (idempotency_key) do
  nothing`.
- **No free credit / trial bound:** `packages/ledger/src/trial.ts` — entitlement created LOCKED,
  unlocks only behind the first-spend gate (abuse checks: velocity, IP/account reuse, daily global
  trial-spend ceiling → pause); workspace kill switch voids entitlement + pocket.
- **Metered settle ≤ cap:** REQ-SPEC-32 — debits equal metered burn clamped at the declared cap;
  the ledger assertion suite (`assertion.ts`) recomputes net spend per run from `credit_ledger`.
- **Checkout id:** `/billing/checkout-sessions/<planted>` → 404 (live leg).

### §12.8 injection controls — status honest

The deterministic suite asserts every (a)–(f) control + REQ-ARCH-32 and is green this run; the
*live* exercise (planted exfiltration fixtures + the R5OPS.1 canary precedent against a running
run) is **not executable at $0** — every leg needs a real run, and the model path is dead upstream
(F-R6CNT.2-1). Carried as **D-R6SECR.1-1** with owner + trigger; the residual-risk statement in
the scope doc (short-query exfil channel under all three bounds) is **unchanged and still open by
design** — the deferred engagement's job is to size it.

## Deviation record

- **Probe budget vs. size:** the ~400-changed-line target is met — the diff is ~400 lines and all
  of it is probe/fix, no production-code sprawl.
- **AC "probe extensions green on prod after fixes":** the live probe is red on prod by exactly
  the finding it was built to catch — green requires the deploy carrying the fix. The
  deterministic probe is green on the fixed build and red on the buggy build (verified both ways).
  Prod deploy attempted under GD-DEPLOY.R6; if it completes, a live re-probe must go green before
  close — recorded in the run ledger either way.

## Artifacts

- `adversarial-review.md` (this file) — findings + controls checklist + live evidence.
- Probe code: `integration/src/two-tenant-probe.ts` (live legs, bound-store deterministic fixture,
  `response` corr seed).
- Fix: `apps/api/src/revision-routes.ts` (ownProject guard ×4 routes, fail-closed on unbound `db`).
