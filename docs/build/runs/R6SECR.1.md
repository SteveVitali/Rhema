# R6SECR.1 — Pre-launch adversarial security review (run ledger)

- **Spec:** `docs/tickets/195_R6SECR.1__adversarial-security-review.md` (manifest row 195, round 6;
  REQ-SEC-3 — launch-blocking, GATE-LAUNCH threshold 2)
- **Normative loads:** `docs/round-6-draft-spec.md` §4.8; ADR-112 (review gates launch; **not
  independent** — stated verbatim in the report's first paragraph);
  `docs/security/pen-test-scope.md` (controls list = the checklist);
  `docs/security/pen-test-findings-triage.md` (severity scale + dispositions);
  `docs/security/rls-exposure-since-0026.md` (the defect class — confirmed leaks + residual buckets);
  `docs/security/usercontent-csp-audit.md` (§13.3 + the ADR-113 v4-mint amendment);
  `docs/security/tenancy-audit.md` (system-pool boundary + allowlist);
  `docs/build/reports/2026-10-21_R6FOR.2/exposure-forensics.md` (252 confirmed cross-tenant reads
  2026-09-22→10-01 — the shipped-once class this review hunts).
- **Base:** `stevevitali/r6cnt-2-showcase-build` @ `cd66194` (chain tip at branch cut)
- **Branch:** `stevevitali/r6secr-1-adversarial-review` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-SEC-3
- **Started:** 2026-10-23T06:17Z · **Closed:** (open)
- **Live stage:** prod probes with `is_test` tenants only, $0; code review offline.
  **Prod serves `ba66c4b`** (R6CNT.2 redeploy; ancestor of the base tip) — probes exercise the
  deployed code under review.
- **Production mutations (ticket header, verbatim):** a redeploy under `GD-DEPLOY.R6` only if a
  fix lands here. Probe traffic only — planted ids, `is_test` tenants, counts/classifications in
  the report, secrets never.
- **KNOWN CONSTRAINT:** `rhema-prod-anthropic-api-key` 401s upstream (F-R6CNT.2-1, operator
  rotation owed) — any leg needing a live model call is deferred with a dated note; HTTP-level
  tenancy/authz probes are unaffected.

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start. Relevant rows:
- **D-P1.22-3** (OPEN, HUMAN-owned): the external pen test this review substitutes for at the
  launch gate — stays OPEN under ADR-112 (post-launch ≤ 60 d obligation; REQ-SEC-1/-2).
- **D-R6CNT.2-1** (OPEN): paid showcase run regeneration — needs a model call; not unblocked here.
- **D-CAP.2-1** (OPEN): paid journey legs — spend-guarded; not this ticket.
- Security-scoped rows carrying into this review's checklist: the rls-exposure residual classes
  (`rls-exposure-since-0026.md`), the system-pool boundary (`tenancy-audit.md`), D-OPS.2-2
  (HA/cost levers, PARTIAL→D-COST.1-3). No OPEN row is closed by this ticket's scope; new
  mediums/lows found here append rows.

## Requirements (from the ticket)

1. Code-against-controls read: every `pen-test-scope.md` controls-list item → a finding or a
   "holds — evidence" line.
2. Live tenancy/authz probes on prod ($0, `is_test` only): two-tenant probe extensions + planted
   foreign ids on every user-serving route — BFF twins, signed-URL mint, export/import, billing,
   voices, chat/outline.
3. §12.8 injection controls on the live surface (planted fixtures, R5OPS.1 canary precedent).
4. Usercontent/cookie posture on real objects.
5. Money paths: no double-spend, no free credit, refund bounded by §14.4, trial bound, metered
   settle ≤ cap — code + probe review (no paid runs).
6. Report under `docs/build/reports/<date>_R6SECR.1/` — every finding classified per the triage
   scale; first paragraph states the review is not independent; criticals/highs fixed in-ticket
   (with regression test) or run-time inserts; mediums/lows → DEFERRALS rows (owner + trigger).
   Exit = zero open criticals/highs.

## Acceptance criteria

- [ ] Every controls-list item has a finding or an evidence line (deterministic)
- [ ] Probe extensions committed + run green on prod after fixes (live-executed)
- [ ] Zero open criticals/highs at close; each fix has a regression test (live-executed)
- [ ] Report's first paragraph states the review is not independent (deterministic)
- [ ] Universal phase-gate AC (verification green; tests for new behavior; REQ ids stamped;
      DEFERRALS rows for the non-verifiable; ADRs for deviations; BUILD_INDEX + LEDGER;
      operating clauses)

## Plan

1. Inventory the controls list → checklist rows (12.8 a–f, ARCH-32, tenancy, secrets, quarantine,
   CSP/cookie, retention/tombstone + the deliverable surfaces).
2. Extend `integration/src/two-tenant-probe.ts` live mode: harvest each tenant's own ids from
   list/detail responses, then probe planted-foreign-id detail routes across families
   (voices/projects/runs/billing/inbox/artifacts/usercontent-sign) + `/bff/*` twins on web.
   Committed extension, deterministic-mode coverage stays as is.
3. Run live on prod (`api.rhema.tools`, `rhema.tools`) with cached `is_test` jrn_a/jrn_b sessions
   (validated 2026-10-23 — `is_test:true` on `/session`, $0).
4. §12.8: deterministic suite re-verified offline; live legs that need a running run deferred
   (F-R6CNT.2-1); proxy/posture legs that are HTTP-level run where reachable.
5. Usercontent: mint a real v4 URL via `/usercontent/sign` on own tenant key → assert headers
   (disposition/type/no-Set-Cookie/CORP); `__Host-` cookie shape asserted from Set-Cookie lines.
6. Money: code read of billing/refund/trial/settle paths + probe-level foreign-id refund leg.
7. Report + classify + fix or defer; close with zero open criticals/highs.

## Test matrix

| AC | test / leg | layer |
|---|---|---|
| controls list covered | report table (one row per item, evidence cited) | deterministic |
| probe extensions committed + green on prod | `two-tenant-probe.ts` live-mode extension + prod run JSON | live-executed |
| zero open criticals/highs | report findings table + DEFERRALS rows for mediums/lows | live-executed |
| not-independent statement | report §0 first paragraph | deterministic |
| new behavior tested | probe extension legs are themselves the assertions (live); any code fix carries a colocated regression test | — |

## Progress

- 2026-10-23T06:1xZ — branch cut @ `cd66194`; context loaded; jrn_a/jrn_b cached sessions
  validated live on prod (`/session` 200, `is_test:true` both); prod serves `ba66c4b` (⊂ base).
- 2026-10-23T06:2xZ — live probe extended (typed-id harvest + 37 api foreign-id templates + 29
  BFF legs + inbox write leg) and run: **F-R6SECR.1-1 confirmed** — `GET
  /projects/:id/v/:n/diff/:m` serves the foreign tenant's draft bytes both directions; also the
  sibling `what-changed` GET + both hunk-comment POSTs unguarded (cross-tenant guidance write =
  prompt injection). Sibling audit: `revision-routes.ts` was the only module missing the
  ownership guard; `drafts`/`correspondence_items`/`guidance`/`artifact_versions` are
  tenant-by-FK (no RLS) so the route predicate IS the boundary.
- 2026-10-23T06:3xZ — fix landed (ownProject ×4 routes, fail-closed) + deterministic probe
  unmasked: bound the prod `contentStoreFor` seam + seeded a `response` corr — buggy build →
  4 findings (`dft_probe_*`/`corr_probe_*` leak), fixed build → green (76 GETs, 0 findings).
- 2026-10-23T06:35Z — live posture legs all green: foreign mint 404, traversal 404, anon 401/302,
  forged cookies 401, CSP nonce + `__Host-` cookie shape verified, usercontent origin
  cookie-free. **F-R6SECR.1-2 (LOW):** no HSTS on either origin → D-R6SECR.1-2.
- Money paths code-reviewed (refund episode key + workspace-locked `for update`, Stripe
  idempotency keys, trial lock/kill-switch, §14.4 window) + refund write leg → 404 no rows.
- §12.8 (a)–(f) + REQ-ARCH-32: deterministic suite green; live exercise deferred →
  **D-R6SECR.1-1** (needs a running run; F-R6CNT.2-1).

## Gap table

(pending — filled at Phase 4)

## Evidence log

- `GET https://api.rhema.tools/session` as jrn_a → 200 `{userId:01M5HEEZ…, isTest:true}`;
  as jrn_b → 200 `{userId:01M5JNGZ…, isTest:true}` (cached `.journeys-state` cookies, expiry
  ~2026-10-26/27 client-side).
- Live probe `runLiveProbe` on `api.rhema.tools`+`rhema.tools`: `passed:false` — 178 legs, 4
  writes; findings = exactly F-R6SECR.1-1 both directions (`/v/2/diff/1` 200 carrying the foreign
  draftId + draft text). `/tmp/probe-live2.json` (counts only; ids truncated here).
- `GET /projects/<B>/v/2/diff/1` as A → 200 `{before:{draftId:01M5JNGZ7A5JYNXT…},
  after:{draftId:01M5JNGZ7A8WY2C3…}, diff:{hunks:[…draft text…]}}` — B's workspace bytes.
- Deterministic probe: fixed build `{passed:true, routesProbed:76, writesProbed:8}`; buggy build
  `{passed:false, findings:4}` (`/v/:n/diff/:m` + `/responses/:cid/what-changed`, both tenants).
- `GET /usercontent/sign?key=quarantine/<wsB>/…` as A → `{"error":"not_found"}`; `..`/`%2F`
  variants same; own-prefix mint → v4 URL, GCS answers `NoSuchKey` (signature accepted).
- Cookie record: `__Host-rhema.session_token` HttpOnly Secure SameSite=Lax; no `Set-Cookie` on
  usercontent origin or api GETs; forged/malformed session cookie → 401.
- Headers: web CSP `script-src 'self' 'nonce-…'` per-request, `object-src 'none'`,
  `frame-ancestors 'none'`; api `default-src 'none'`; **no `strict-transport-security` anywhere**
  → F-R6SECR.1-2.

## Evidence report

`docs/build/reports/2026-10-23_R6SECR.1/adversarial-review.md` — findings table (1 critical
fixed, 1 low deferred), controls checklist (every `pen-test-scope.md` item → verdict +
evidence), live probe transcript summary, money-path review, §12.8 deferral.
