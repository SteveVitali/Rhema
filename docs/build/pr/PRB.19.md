# PRB.19 — Revise `response` delivery fix + the remaining live-verify defects

Stacked on #47 (`stevevitali/prb-18-prod-auth-billing-finish-legs`). Ticket:
`docs/tickets/28j_PRB.19__revise-delivery-and-defect-pass.md`. Run ledger:
`docs/build/runs/PRB.19.md`.

## What this fixes

**F26 — every prod Revise finalized bare** (D-PRB.16-1; live evidence: run `01M2T6D3B32AVXHCQH73ZGJGBD`
`completed` with no response correspondence, no `run.deliver` job, and the pod-local `drafts/v2.md` +
`correspondence/v1-response.md` lost):

- **(a) the delivery gate.** `spec.delivery` was built only when `inputs.draftId` resolved — a Revise
  launch carries `priorReviewId` + reserved `nextDraftId` instead. New `resolveDeliveryBase`
  (`@rhema/orchestrator`) resolves the freeze/diff base server-side
  (`manualRevision.baseDraftId` → `draftId` → working head → reviewed draft → newest) at hydration;
  `runspec` builds the delivery spec from it with `correspondenceKind: "response"`. In the transaction,
  the produced `drafts/v(N+1).md` is now picked up across **all** done steps' `produced_version_ids`
  (the `revise` phase produces it — `deliveredVersionIds` only names the final phase's artifacts), the
  delivered version is marked immutable, and the reserved `nextDraftId` row is inserted **born frozen**
  (`origin='response_to_review'`, `base_draft_id`, `promoted_version_id`, `frozen_at`/`frozen_by`).
- **(b) the mount policy — ADR-011.** The declared deliverables sat under `drafts/**`/`correspondence/**`
  which §12.6 mounts read-only for every seat, so harvest dropped them as `out_of_allowlist`. Decided:
  **keep the seat table read-only; grant the run's own declared `phase.artifacts` writable per-path** —
  `declaredWritableArtifacts` expands `vN`/`v(N+1)` against the resolved ordinals, materialize mounts a
  granted committed artifact `readwrite`, `compileSeatPolicy` emits `readwrite` rules the classifier
  prefers, and harvest persists NEW files at granted paths. Every other shared path still violates.
- **the dossier carries the ledger.** `deliver` now declares `response-ledger.json` as a sidecar +
  `sidecar_validates` predicate — the fold into `dispositions` reads only `DeliveryArgs.sidecars`, so a
  missing sealed ledger fails the phase instead of delivering bare.

**F32 — Payment Link 302 dropped `client_reference_id`** (would land panel purchases `unresolved`):
`/billing/balance` returns the principal's `billingAccountId`; the web composes
`client_reference_id` onto the redirect via `URL` (existing query preserved, malformed/absent → bare
link, never a broken redirect).

**Fetch byte receipts:** server-tool `kind=fetch` rows now carry `fetch_log.bytes` sized from the result's
inline content (`encrypted_content` for search hits, `content.source.data` utf8/base64 for fetches);
results without inline content log `null` — never a guess.

**`dockerUsable()` bound:** the synchronous `docker version` probe is timeout-bounded (10 s default,
injectable runner) and the CI opt-out is evaluated before any spawn — an unresponsive daemon can no
longer hang the whole `pnpm test`.

## Tests

Deterministic additions across the seam: runspec (23 — revise-shaped run → `spec.delivery` + grant,
divergent head, no-draft), delivery (13 — earlier-step produced-draft pickup, born-frozen next draft,
fold, `revision.move_traced`), materialize/harvest (16 — grant expansion, mode upgrade, path-precise
persist), work-reader (25 — deliver dossier carries the sealed ledger), billing-surfaces (8 — the
composed 302), docker-probe (4), server-tools-sse (10 — byte receipts).

**Green gate:** `turbo build lint typecheck` 111/111 · `vitest` 273 files / 2079 tests · `check:licenses`
+ `check:protocol-markers` clean. Repaired en route: the balance-DTO test expectation and the
`PROTOCOLS_VERSION` pin (manifest trio drift).

## Stage B (post-deploy, tracked)

One real prod Revise to `delivered` asserting the D-PRB.16-1 closure criteria; the D-PRB.16-2/-4/-5
live-verify/reporting legs — all owed, none asserted in this PR. See `runs/PRB.19.md` § Stage B.
