# ADR-130: Retire the generated run walkthrough — the run card is composed from the delivered record

- **Status:** Proposed
- **Date:** 2026-11-03
- **Ticket:** R7OPEN.1 (shell); filled and accepted by **213 R7COPY.0**.
- **Requirement ids:** REQ-IDE-19 (amended), REQ-COPY-4, REQ-SPEC-32/REQ-ECON-* (COGS posture,
  unchanged), DS §5.5 D20 / §5.6 (amended)
- **Spec:** `docs/round-7-draft-spec.md` §3.2 (ADR-130 bullets), §4.13 REQ-COPY-4;
  `GD-UX-WALKTHROUGH.R7`; `packages/orchestrator/AGENTS.md` (read before changing the harness)

## Context

The operator ruled **"Retire it"** (GD-UX-WALKTHROUGH.R7): the generated run summary is
factually wrong and leaks internals (R5 C3 — the Showcase run card contradicted the same
screen's ledger). Spec §3.2: this ADR amends **REQ-IDE-19** and DS §5.5 D20 / §5.6; the
`run.walkthrough` model call (`packages/orchestrator/src/walkthrough.ts`,
`apps/worker/src/walkthrough-generator.ts`) is removed; the run card is composed
deterministically from the delivered record (REQ-COPY-4). COGS falls by one model call per
run, and no money mode changes.

## Decision

**Status: Accepted — filled by 213 R7COPY.0 (2026-11-03).**

- **The `run.walkthrough` call path is removed end-to-end.** `packages/orchestrator/src/walkthrough.ts`
  and `apps/worker/src/walkthrough-generator.ts` are deleted, with `RUN_JOBS.walkthrough`, the
  `boss.work` consumer, `handleRunWalkthrough`, the worker's `walkthroughModelKeySecret` env slot,
  the api's lazy post-delivery enqueue and `POST /runs/:id/walkthrough/retry`, the web/BFF retry
  form, and `RunCardAction "retry_walkthrough"`. A repo-grep test pins the removal.
- **"What it delivered" is composed deterministically** by `composeDeliveredSummary`
  (`packages/findings-core/src/delivered-summary.ts`), a pure function — 218a R7DEM.3b can call it
  on snapshots (REQ-DWEB-15): the letter's `one_thing`/Verdict slot's first paragraph, **quoted
  verbatim** (no verdict section ⇒ no line, never a paraphrase); the finding/claim counts; and the
  dossier/letter/ledger links (keys the surface resolves to hrefs).
- **One count rule** — `deliveredRecordCounts`: a finding filed under the letter's `strength` slot is
  a strength, never a finding. Timeline chips, the dossier rail figures and the run card all call it
  (R5 C5's "6 vs 5" split is structurally impossible).
- **One `RunSummaryView`** — beside `RunCardView`; the Timeline's entries, the dossier's embedded
  card (`runSummary`, replacing the event-derived `deriveRunCardInput`), and the chrome's
  `data-run-state` all read the same SQL-fact assembly (R5 C4).
- **`runs.walkthrough` stays, unread.** The column and stored historical text are retained
  append-only; nothing selects or renders them. The `walkthrough` artifact/document kind is kept.
- **The ingest key decouples.** `WALKTHROUGH_MODEL_KEY_SECRET` survives only as the legacy fallback
  name inside the `ingestModelKeySecret` resolution, so every deployed stage resolves the same key.
  The provider-key exception narrows to `ingest.reconstruct` alone (ADR-052's worker pair is now one).
- **Queued-job handling:** rely on pg-boss expiry — no consumer is registered, so any already-queued
  `run.walkthrough` jobs simply expire; a rolling deploy's pre-change worker drains what it can. No
  new code touches the queue table.
- **Infra residue (deferred, `D-R7COPY.0-2`):** `WALKTHROUGH_MODEL_KEY_SECRET` remains provisioned in
  `infra/pulumi/compute.ts` (and its compute.test pin) — deleting the env binding on the same deploy
  that stops reading it is safe, but it is infra surface and this ticket is code-only; removal lands
  with the deploy ticket. `worker-reads-anthropic` IAM stays for `ingest.reconstruct`.

### Golden re-run classification (GD-GOLDEN.R7)

Rule: protocol-affecting = protocol seeds/manifests/rubrics/phases, the run/dispatch path, the
harness, the egress proxy's research/fetch policy, or REQ-SEC-3 boundary changes; in doubt ⇒
affecting. Mapped files: findings-core (display models — NOT protocol/run), orchestrator (walkthrough
module + queue name — removed *post-delivery* read path, never a dispatch or phase path), worker
(main/run-jobs/env — removes a lazy consumer; `ingest.reconstruct` unchanged), api routes (read
models only), ui/web (rendering), api-client/data (DTO twins). No protocol, phase, dispatch,
research, or boundary file changes ⇒ **NOT protocol-affecting** ⇒ zero golden re-runs owed for this
deploy under the rule (recorded here per GD-GOLDEN.R7 "classify per deploy").

## Consequences

- COGS falls by one model call per delivered run (the lazy Haiku call); no money-mode change —
  `spend.ts`, `delivery.ts`, and the ledger package are untouched.
- The same screen can no longer contradict itself: card state, counts, and the delivered block all
  read the delivered record through one function.
- Stored walkthrough prose becomes dead data: honest (it was generated, never verified) and cheap to
  revisit — a future ADR can drop the column or re-read it for migration.
- `POST /runs/:id/walkthrough/retry` is removed rather than stubbed — a dead dial would lie; a 404
  is honest. The REQ-IDE-48 landing (unread finished run → the run card on the dossier) is unchanged.
- Amends **REQ-IDE-19** (the ≤200-word model walkthrough retires; the run report stays) and **DS
  §5.5 D20 / §5.6** — dated banners landed on both in `docs/design/2_ide-core-ux.md`.

## Alternatives considered

- **Keep the call behind a flag.** Rejected — the ruling was "Retire it" (the output was factually
  wrong and leaked internals); a flag keeps the COGS, the prompt surface, and a renderer override the
  ticket forbids.
- **Regenerate with a stricter prompt.** Rejected — prompt tightening cannot guarantee truthfulness;
  the record is already the ground truth the card needs, and generation re-introduces the exact class
  R5 C3 reported.
- **Compose from the record (chosen).** Deterministic, zero COGS, replayable on snapshots, and it
  forces the counts/links to agree with the ledger they sit beside.

## Revisit trigger

A reviewer-facing need for generated prose returns (a new, verified-accuracy pipeline would be
a new ADR), or REQ-IDE-19 is amended again.
