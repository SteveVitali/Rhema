# PRB.19 — Revise `response` delivery fix + the remaining live-verify defects (run ledger)

- **Ticket:** `docs/tickets/28j_PRB.19__revise-delivery-and-defect-pass.md` (seq 28j — the last code-bearing
  row of the prod-launch round)
- **Branch:** `stevevitali/prb-19-revise-delivery-defect-pass` (stacked on
  `stevevitali/prb-18-prod-auth-billing-finish-legs`, base commit `e8239b5`)
- **ADR:** [[ADR-011]] — declared phase outputs are writable for the run that declares them (the F26b
  mount-policy ruling).

## Requirements / acceptance criteria

1. **F26(a)** — a Revise-shaped run (`priorReviewId` + reserved `nextDraftId`, **no** `inputs.draftId`) must
   produce `spec.delivery` resolved from server facts, and `deliverRun` must write the `response`
   correspondence, fold the response ledger into `dispositions`, materialize + freeze the reserved
   `nextDraftId`, and emit `revision.move_traced`.
2. **F26(b)** — decide the mount policy for declared phase outputs under the §12.6 read-only shared mounts;
   implement the chosen contract (ADR if material). **Decided:** per-run, per-path write grant over the
   unchanged read-only seat table — see ADR-011.
3. **Fetch byte receipts** — `kind=fetch` server-tool rows carry `fetch_log.bytes` where the provider result
   exposes the page inline (implemented; no deferral needed).
4. **F32** — the `open_payment_link` 302 composes `client_reference_id=<billingAccountId>` onto the
   configured Payment Link (existing query preserved).
5. **`dockerUsable()` bound** — the synchronous `docker version` probe is timeout-bounded and the CI opt-out
   is evaluated before any spawn.
6. Deterministic tests for all of the above; full green gate.
7. **Stage B** — one real prod Revise through `DELIVERED` (asserts the D-PRB.16-1 closure criteria); the
   D-PRB.16-2/-4/-5 live-verify/reporting legs.

## Stage A — implementation (all committed)

### F26(a) — the delivery gate resolves the base server-side

- New `packages/orchestrator/src/delivery-base.ts`: `resolveDeliveryBase` picks the run's freeze/diff base
  from frozen inputs + the project's draft rows — `manualRevision.baseDraftId` (divergent head) →
  `inputs.draftId` → the unique working head → the `priorReviewId` reviewed draft → newest by `n`. Also
  returns `reviewedDraftN` (the `vN` the correspondence names). `promotedVersionId` is the EFFECTIVE
  promoted head (own, else one step up the base chain).
- `internal-api.ts` `hydration` now returns `deliveryBase` + `writablePaths` on the descriptor (computed
  BEFORE the manifest — the grant decides committed artifacts' manifest `mode`).
- `runspec.ts` builds `spec.delivery` from `hyd.deliveryBase` (not `inputs.draftId`), carrying
  `priorReviewId` + `newDraftId` from frozen inputs; `correspondenceKind` maps `revise→response`.
- `packages/mirror/src/delivery.ts`: the produced-draft pickup unions `deliveredVersionIds` with every done
  step's `produced_version_ids` (a Revise's `drafts/v(N+1).md` is produced by the `revise` phase, not the
  final `deliver` phase — the old lookup never saw it), prefers the canonical `drafts/v(n+1).md` path, marks
  the delivered version immutable, and inserts the `nextDraftId` row **born frozen**
  (`origin='response_to_review'`, `base_draft_id`, `promoted_version_id`, `frozen_at`/`frozen_by`).

### F26(b) — per-run declared-output write grant (ADR-011)

- `packages/mirror/src/mounts.ts` `declaredWritableArtifacts(seat, manifest, {baseDraftN, reviewedDraftN})`:
  expands each declared `phase.artifacts` path's `vN`/`v(N+1)` tokens against the resolved ordinals; grants
  only paths whose seat mount exists and is `read`. Seat-private declarations (`agents/author/**`) yield no
  grant; unmounted paths gain none.
- `materialize.ts`: a committed artifact at a granted path mounts `readwrite` (the `revise` phase's
  `drafts/v2.md` must stay editable through `verify`/`deliver`).
- `packages/hooks/src/seat-tables.ts` `CompileInput.writableArtifacts`: each granted path compiles to a
  `readwrite` project rule; the classifier's writable-match preference upgrades exactly those paths.
- `harvest.ts` `writablePaths`: a NEW file at a granted path persists as a new version instead of dropping
  `out_of_allowlist`; every other shared path still drops.
- `work-reader.ts` passes `spec.writablePaths` to `harvest`; `runspec.ts` folds the grant into
  `hookPolicyInput.writableArtifacts`.

### Revise manifest — the dossier carries the sealed ledger

- `packages/protocols/manifests/revise.ts` `deliver` phase: `sidecars: ["response-ledger.json"]` +
  `sidecar_validates` completion predicate — the delivery transaction folds `dispositions` only from
  `DeliveryArgs.sidecars`, so a missing sealed ledger now fails the phase instead of delivering bare.
  (PROTOCOLS_VERSION re-pinned `+53e3babb…` → `+d640d3ca…` — the trio digest covers manifests.)

### F32 — Payment Link `client_reference_id`

- `apps/api/src/billing-routes.ts`: `/billing/balance` returns `billingAccountId` (the authenticated
  principal's — never a request field); `BillingBalanceDto.billingAccountId` added in `@rhema/api-client`.
- `apps/web/src/server.ts` `paymentLinkWithReference` composes the param via `URL` (existing query survives;
  malformed link / missing id falls back to the bare link — the redirect never breaks).

### Docker probe bound + fetch byte receipts

- `apps/run-task/src/docker-probe.ts`: `dockerUsable(timeoutMs=10_000, run=execFileSync)` — bounded spawn;
  `privsep.docker.test.ts` evaluates `CI_OPT_OUT` FIRST so the unit CI job never spawns `docker`.
- `apps/egress-proxy/src/outbound-limits.ts`: `ServerToolActivity.fetch.bytes` + `resultBytes` — a
  `web_search_result`'s `encrypted_content` and a `web_fetch_result`'s `content.source.data` (utf8/base64)
  size the page the model received; `handler.ts` writes it through `buildServerToolFetchLogRow`. Results
  with no inline content log `null` — never a guess.

## Tests (deterministic)

| Suite | Count | Covers |
|---|---|---|
| `orchestrator/runspec.test.ts` | 23 ✓ | revise-shaped run → `spec.delivery` + the grant; divergent-head base; no-draft → no spec; review unchanged |
| `mirror/delivery.test.ts` | 13 ✓ | produced-draft pickup from an earlier step; frozen `nextDraftId`; disposition fold; `revision.move_traced` |
| `mirror/materialize.test.ts` | 8 ✓ | `declaredWritableArtifacts` expansion; granted-path mode upgrade |
| `mirror/harvest.test.ts` | 8 ✓ | new declared output persists; non-granted shared path still violates |
| `run-task/work-reader.test.ts` | 25 ✓ | deliver dossier carries `response-ledger.json`; missing ledger fails the predicate |
| `web/billing-surfaces.test.ts` | 8 ✓ | `client_reference_id` on the 302; query preserved; missing id → bare link |
| `run-task/docker-probe.test.ts` | 4 ✓ | timeout passed to the runner; ETIMEDOUT/ENOENT → unusable |
| `egress-proxy/server-tools-sse.test.ts` | 10 ✓ | bytes from `encrypted_content` + `content.source.data` (utf8/base64); no inline content → no bytes |

**Green gate:** `pnpm turbo build lint typecheck` 111/111 · `pnpm test` 273 files / 2079 pass, 4 skipped ·
`pnpm check:licenses` + `pnpm check:protocol-markers` clean. Two inherited reds repaired en route:
`billing-routes.test.ts` expected-DTO gained `billingAccountId`; `PROTOCOLS_VERSION` re-pinned for the
manifest trio drift.

## Stage B — bounded prod verify (the plan)

The live legs below ran post-deploy of this branch's images; each row names its evidence target.

- **D-PRB.16-1 closure:** one real prod Revise to `delivered`; assert `correspondence_items.kind='response'`
  with `artifact_ids` naming the persisted letter, dispositions folded + `frozen_at`/`response_id`, the
  reserved `nextDraftId` row `frozen` with `promoted_version_id` → the persisted `drafts/v(N+1).md` version,
  and a `revision.move_traced` run event.
- **D-PRB.16-2:** one Quick Voice run OR cite PRB.18's deployed-image evidence if a persona_builder run has
  already produced `profile/**` at the persona root.
- **D-PRB.16-4(a):** re-arm/expiry only if an honest deadline-bearing gate exists — never fabricated.
- **D-PRB.16-5:** report `spent_credits` vs proxy Σ vs `credit_ledger` debits vs hold release; the ruling
  stays operator-owed.

## Stage B — live results (2026-09-19)

**Deploys.** Build `e488f00d` (tag `prb19b-76cbbff`, commits through `76cbbff` = F33+F34) → api
`…@sha256:1e25776b`, worker `…@sha256:9a1064e2`; Pulumi update **58**. The F35 fix (`b3d7a01`) → build
`d5294c77` (tag `prb19c-b3d7a01`) → worker `…@sha256:a8c6d153`; update **59**. Final prod pins: api
`1e25776b…`, web `82f293a0…`, worker `a8c6d153…`, run-task `d7c01575…`, egress-proxy `c40d8ad4…`.

**Provider-secret incident (environmental, not a code defect).** The prod `rhema-prod-anthropic-api-key`
effective SM version 2 was malformed (31 chars, invalid prefix — never a repo value). v2 disabled, v3 created
from the valid v1 material; after a proxy refresh/restart real inference flowed (attempt-1 401 → attempt-2+
200s + proxy metering).

**Run `01M2VDHN2ZFDV1SVDX2XN257NN`** (revise; `priorReviewId` `01M2RJR0SKT5BHGD3GK3TRSWW6`; reserved
`nextDraftId` `01M2VDHN2QRS1Q0B3ZFQZ4SWCE`) — five attempts surfaced three more live defects:

1. `Invalid API key` (malformed secret v2).
2. Real inference succeeded; finalize failed `missing .rhema/phase-result.json` — the author seat correctly
   can't write `/work/project/.rhema` (**F34**; fix: the runspec prompt steers control files to
   `agents/<seat>/.rhema/`, which the work-reader already resolves).
3. Triage sidecar rejected twice — anchors as strings, then partial anchors; the canonical anchor schema is
   strict. Guided retry: omit `anchor` (optional), `actor ∈ {user,drafter}`.
4–5. Phases committed (`correspondence/v2-response.md` + sealed
   `agents/author/.rhema/response-ledger.json` — 19 entries / 7 moves) but the deliver dossier POST crashed in
   the fold on closed-world **same-state** obligation transitions — the pretriage had already routed ordinals
   1/2/5 (`rebutted`/`deferred`), so `rebutted→rebutted`/`deferred→deferred` self-edges threw (**F33**; fix:
   same-target routes are idempotent no-ops — `76cbbff`). Tx rolled back; run wedged `finalizing`.

**Delivery re-drive.** With F33/F34 live (update 58): `runs.pending_delivery` stashed with the verbatim
`DeliveryArgs` the pod assembled (sealed ledger bytes + review-dossier claim-ledger/findings/rubric from the
object store + server-resolved base/money — the api route's own merge), then a `run.deliver` pg-boss job.
Worker consumed it 01:44:37→01:44:40Z → run `completed` (seq 368), `pending_delivery` cleared.

**Asserted live (the D-PRB.16-1 verify column):**

- `correspondence_items` `01M2VNCH4F9JYH811TXRXE4GVD`: `kind='response'`, ordinal 1, `prior_review_id` =
  the review, `draft_id` = v2 base, `voice_mode='ad_hoc'`, `artifact_ids` = the persisted letter
  (`correspondence/v2-response.md` v `01M2VKZYYXEC4EA48RJPSR4CMC`, immutable) + 5 published dossier copies.
- **19 `dispositions`** — one per finding 0–18: the 6 pretriage `user` rows updated in place (actor kept),
  13 ledger-authored rows inserted (`by_actor=agent`), all `frozen_at` + `response_id` + `move_ordinal` set.
- Draft `01M2VDHN2QRS1Q0B3ZFQZ4SWCE` n=3 **born frozen** (`origin='response_to_review'`, `base_draft_id`=v2,
  `promoted_version_id` = `01M2VJXXJGGJ9ANG86EDT6802Y` = the persisted `drafts/v3.md` version, immutable);
  the v2 base frozen by the `dossier_ref` trigger (`frozen_by` system/this run).
- **8 `revision.move_traced` events** (seqs 358–365; M1–M7 + the unattributed diff trace, hunkCount 3 /
  6105 chars); `boundary.attested` + access-report persisted under `correspondence/response/1/`; `cost.final`
  seq 369.

**F35 (found this leg).** The worker's `run.deliver` re-drive path didn't wire `obligationHook` — the fold
committed but response-ledger **obligation routing was silently skipped** (the api's inline POST path wires
it; the worker's billing deps declared the field but never populated it). Fixed in `b3d7a01`
(`@rhema/obligations` dep + `SqlObligationHook` in worker deps; deployed as worker `a8c6d153`, update 59), and
the routing was backfilled for this run by replaying the SAME `SqlObligationHook.onDelivery` code against prod
in one transaction: **23 `obligation_transitions`** attributed to the run (14 `address` + 9 minor-finding
`spawn`s routed to `addressed` per REQ-OBJ-2), the pretriaged `rebutted`/`deferred` obligations no-op'd (the
F33 idempotency path exercised live), the `escalate` row kept `open` with `decision_requests`
`01M2VNKJ6TVF1C744MMQ5S8CGY` created. (Finding 17 — a minor `defer` — carries no obligation by design.)

**Spend figures (D-PRB.16-5 — reported, no ruling).** Hold 1600 (run create 23:27:49Z) → 5 per-phase debits
176+145+187+133+170 = **811** → release **789** at delivery (01:44:40Z). `usage_records` (186 rows): proxy Σ
**1668** = reconciled `runs.spent_credits` (1668); `sdk_stream` Σ 811; `sdk_estimate` Σ 927. So ledger-debited
811 vs proxy-metered 1668 — **857 cr of real burn** (incl. failed-attempt + investigation-phase inference)
recorded but not charged via `credit_ledger`: the same divergence shape as QV-1. Cap was raised mid-debug
1600→2600→3500; the hold stayed 1600.

**D-PRB.16-2 — closed on existing live evidence (no new run needed).** `profile_voice` run
`01M2TB91FESCXYATTB7JQ8RBGW` (13:28–13:57 on 09-18, after the F27-fixed run-task image `f79f9816` went out
~13:10) produced **9 `namespace='persona'` artifacts at the persona root** — `profile/{index, voice-print,
lexicon, exemplars, provenance, structure-repertoire}.md` + `profile/corpus/*` — no EACCES. Persona-root
writability proven live.

**D-PRB.16-4 — re-arm already proven; a REAL expiry is now armed.** PRB.17 proved the sweep (`gate_rearmed`
×5 on `01M2TNKY…`). Expiry consumption still unobserved, but an honest deadline-bearing gate exists:
`01M2TNKY14HSP3ESJH8Y1NK8HW` — `confirm_cost`, unresolved, `deadline_at` 2026-09-25T16:29Z,
`on_expiry='cancel'`, its `gate.expiry` jobs `created` (start_after 09-25T16:29). It fires organically in ~6
days; the firing assert stays open. (The QV-2 `approve_sample` gate resolved pre-deadline; its armed job will
consume + no-op at 13:36Z today.)

## Deferral dispositions (final, 2026-09-19)

- **D-PRB.16-1 → DONE** — prod Revise `01M2VDHN2ZFDV1SVDX2XN257NN` `completed` with every verify-column row
  asserted above.
- **D-PRB.16-2 → DONE** — `profile/**` at the persona root on run `01M2TB91…` (F27 fix live).
- **D-PRB.16-4 → stays PARTIAL** — re-arm proven (PRB.17); expiry consumption armed on a real gate pending
  2026-09-25 (annotated).
- **D-PRB.16-5 → stays OPEN** — figures reported above; the committed-vs-proxy charge ruling is the
  operator's.
- **New findings this leg:** F33 (same-state obligation routes → idempotent no-op), F34 (seat-dir `.rhema`
  control-file guidance in the runspec prompt), F35 (worker `run.deliver` missing `obligationHook`) — all
  fixed + deployed; no open deferrals.

## Post-Stage-B: prod OAuth finish (operator legs, 2026-09-22)

Live root-cause chain for the operator's prod login failure — three distinct defects, fixed in order:

1. **`invalid_client` (client not found)** — `Pulumi.prod.yaml` carried the placeholder
   `pending-h6-google-oauth-client-id`; the real client id was config-set + deployed in PRB.18.
2. **`invalid_client` (bad secret)** — after the redirect-URI console add, the token exchange failed:
   `rhema-prod-google-oauth-client-secret` still held the *dev* client's secret (copied dev→prod in
   PRB.15), mismatched to client `25012989319-…`. Google no longer displays existing secrets, so the
   operator minted a NEW client secret; seeded as secret **v2** (piped, no value in ledger); api rolled
   to re-read `versions/latest`.
3. **`account_not_linked`** — token exchange then succeeded; the operator's email already had a
   magic-link-created account, and Better Auth refuses same-email social linking by default. Fixed by
   `accountLinking{enabled, trustedProviders:["google"]}` in `apps/api/src/auth.ts` (commit `f20c5e5`,
   test added) — Google↔magic-link converge on one account per the D-P0.01-3 same-user requirement.

Deployed via Cloud Build `e0a42238` (api+web subset) → `pulumi up` update **60**: api `b89196db…`
(account linking + secret v2), web `8fa089f1…` (**F32 now live** — the panel payment link composes
`client_reference_id` itself; the manual `?client_reference_id=…` checkout workaround is retired).
Google sign-in click-through + magic-link legs still await the operator's browser retry; Resend domain
`pending` (CNAME verified; DKIM/SPF/MX pending at last check — MX priority corrected to 10).

**Follow-up (same leg):** the link still refused — better-auth 1.7.x's `requireLocalEmailVerified`
(default `true`) blocks linking when the local user row is `email_verified=false` (the operator
account was fixture-created, never a real magic-link click-through). Set
`accountLinking.requireLocalEmailVerified: false` (commit `0a21358`) — Google only asserts verified
emails so the trust boundary holds, and the local row self-heals to `email_verified=true` on link.
Api rebuilt `4ed76540…` → `pulumi up` update **61** → revision `…-00027`.

**VERIFIED (operator browser, 2026-09-22T15:24Z):** Google sign-in completes end-to-end — callback
links to the EXISTING user `01M2V3PM0W…` (no duplicate), `account(provider_id=google,
account_id=110577562545223887695)` created, `session` row live, `email_verified` healed false→true.
Google half of D-P0.01-3 done; magic-link half still awaits Resend verification + click-through.

**Magic-link leg + sign-in hardening (2026-09-22):** Resend domain verified (all 4 records green);
real magic-link email delivered + clicked → session `M6fh5tG…` created 15:34Z (verify works; the
browser stayed logged out — token consumed by mail-client prefetch before the real click, classic
single-use race). Two follow-on defects fixed + deployed (`08ec8c0`, update 62): `apiFetch` now sends
`Origin` (better-auth can 403 server-side auth calls), and `advanced.ipAddress.ipAddressHeaders=
["x-forwarded-for"]` so rate limiting buckets per real client instead of one shared bucket — the
shared-bucket fallback is what briefly 403/429'd all sign-ins during the retry burst.

**Stripe-originated purchase VERIFIED (2026-09-22T16:05Z):** the operator's live $25 checkout
(`buy.stripe.com/14AaEQbU030E61k5D7a7C00` + `client_reference_id`) flowed through the live endpoint →
`credit_ledger grant(topup, 2500cr, source=stripe, stripe_ref=pi_3UIWBo2MLe3ETP9S18uvOm9f)` on the
operator billing account. D-PRB.17-1 closed.

**Fresh-account UX gap (live finding, → P1):** a new account has no reachable add-credits affordance
(the exhaustion panel needs an existing project) and NO project-create path at all — that's P.1.04
by design, but for real-world beta usage an operator-created project (`01M34YDZ3SK525JYF74EEH44QR`,
"my-first-project") was inserted into the operator workspace to unblock the import → review loop.
