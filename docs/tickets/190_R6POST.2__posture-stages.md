# R6POST.2 — Posture stages: domains-bearing preview (collab) + Stripe test-mode preview (N9)

- **Sequence:** 190 of 208 · **Phase:** round 6 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 189_R6POST.1 + HUMAN-H10 (the Stripe test key — withholds the N9 leg)
- **Run:** `implement-spec spec=docs/tickets/190_R6POST.2__posture-stages.md`
- **Gate status:** [x] the preview-subdomain DNS records **pre-ticked by `GD-PREAUTH-ACTS.R6`**
  (created and removed in this ticket; the names are recorded in advance in the run ledger; any
  record outside the preview subdomain → PAUSE)
- **Live stage:** owned `pr-<n>` posture stages (≤ $8 each); torn down + verified
- **Production mutations:** DNS records under the preview subdomain only (created → removed);
  nothing on the prod stack
- **Size budget:** ~350 changed lines (stage config + leg evidence)

## Goal
Run the legs a plain `*.run.app` preview cannot host, on the two ruled posture stages ("authorize
both"). N8/R10.keepalive need a real-domain stage that path-routes `wss://<app>/collab`. N9 needs a
Stripe-bearing stage using a **test-mode** key.

## Load
- `docs/round-6-draft-spec.md` §4.6 REQ-POST-6; DEFERRALS **D-SPA.24-1**, **D-SPA.16-1**,
  **D-SPA.20-1** (their VERIF.2 re-owe notes verbatim); LEDGER batch-3 posture ruling.
- Anchors (re-confirm): `scripts/live/preview-stack.mjs`, `infra/config/stages.ts` (`domains`,
  `PREVIEW_REQUIRED_SECRETS`), `infra/pulumi` (the domain/LB resources), `packages/journeys`
  (`--surface editor`, `--surface billing`).

## In scope — deliverables
1. A domains-bearing preview fronted by a preview subdomain. `COLLAB_WS_URL` resolves;
   `N8` + `R10.keepalive` run with `--expect-renderer spa`.
2. A Stripe test-mode preview: `sk_test` bound from nonprod Secret Manager (never a prod secret,
   REQ-ARCH-38); `N9` runs the Stripe-hosted hand-off in test mode.
3. Both stages destroyed; DNS records removed; orphan sweep verified; resource cost recorded.
4. D-rows flipped with evidence or honestly re-owed.

## Out of scope
- Prod DNS; live-mode Stripe (HUMAN-H11's operator purchase).

## Acceptance criteria
- [ ] `N8`, `R10.keepalive`, `N9` reports committed per stage *(staging-verified)*
- [ ] DNS records + stacks removed; verified absent *(staging-verified)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-POST-6

## Cross-cutting invariants
- Round-6 spec §8 (preview hygiene, secrets never) + AGENTS.md § Stages (previews never carry prod secrets).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`.
