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

## Stage B — bounded prod verify (OWED at this commit)

The live legs below run post-deploy of this branch's images; each row names its evidence target. **None is
asserted yet — statuses here are the plan, not evidence.**

- **D-PRB.16-1 closure:** one real prod Revise to `delivered`; assert `correspondence_items.kind='response'`
  with `artifact_ids` naming the persisted letter, dispositions folded + `frozen_at`/`response_id`, the
  reserved `nextDraftId` row `frozen` with `promoted_version_id` → the persisted `drafts/v(N+1).md` version,
  and a `revision.move_traced` run event.
- **D-PRB.16-2:** one Quick Voice run OR cite PRB.18's deployed-image evidence if a persona_builder run has
  already produced `profile/**` at the persona root.
- **D-PRB.16-4(a):** re-arm/expiry only if an honest deadline-bearing gate exists — never fabricated.
- **D-PRB.16-5:** report `spent_credits` vs proxy Σ vs `credit_ledger` debits vs hold release; the ruling
  stays operator-owed.

## Deferral dispositions

- **D-PRB.16-1** → implementation DONE + deterministic proofs green; **live closure leg owed** (Stage B
  above) — row annotated, stays PARTIAL until the prod Revise asserts.
- **D-PRB.16-2/-4/-5** → dated annotations; statuses unchanged pending the live legs.
- **New deferrals:** none — the fetch byte-receipts leg is implemented (rows carry bytes where the provider
  result exposes them; `null` otherwise by contract, not a gap).
