# RUN.1 — Run and chat defects: chat turns answer, informational gates never block, walkthroughs write

Ticket: `docs/tickets/73_RUN.1__run-and-chat-defects.md` · run ledger:
`docs/build/runs/RUN.1.md`
Stacks on `stevevitali/edit-1-edit-path` (PR #94). **DO NOT MERGE** — merge policy OPERATOR.
Stage B legs (deploy, R4/R7 journey green, walkthrough regen on `01M3SK62…`) are deferred to the
operator path — see `D-RUN.1-1` / `D-RUN.1-2` in `docs/tickets/DEFERRALS.md`.

## Summary

Four production defects, one branch:

- **Chat bare 502 → truthful error path.** Every chat write/status route now flows through one
  `chatCall` seam (`apps/web/src/server.ts`): api refusals keep their real status + code
  (402 `insufficient_balance`, 403, 409 `run_in_progress`, 422); api 5xx → `502
  chat_upstream_error`; transport → `502 chat_unavailable`; unbound seam → `503
  chat_not_wired`. Every refusal logs exactly one structured line `{route, requestId,
  upstreamStatus, upstreamCode}` — never message text (REQ-VIS-11). ADR-051 records the lock
  ruling: chat turns keep `lockSetSpec {projectId}` (a turn is a run-creating write, not a
  §6.3 read) — the fix is the truthful 409, not lock removal.
- **Send occluded by `footer.ide-statusbar`.** The chat panel is a flex column: `.chat-body`
  scrolls, `.chat-composer` is pinned as the final child and can never underlap the status bar —
  at 1440×900 and on the compact phone mount.
- **Informational gates never park (PR-R1).** `resolveGatePolicy` moved to `@rhema/contracts`
  as THE one resolution (ADR-050): the orchestrator's park decision, the run sheet's scope line,
  the gate card's copy, the Inbox row, and `waitingGate` all derive from it — no hand-written
  duplicates. `CommitNext` gates carry `blocking`; an informational (`blocking:false`)
  `approve_scope` opens its gate row + event but the run keeps `running` (or takes `finalizing`
  via `then`), the pod rides through, and open informational gates auto-resolve at the
  finalization boundary (`Decision{by:'policy'}`). `approve_scope: null` override = blocking
  wait ("the card waits for me"). Spend/refusal kinds untouched; Needs-you filters to actionable
  gates; the Timeline can mount an informational card on a running run without lying about
  `waitingGate`.
- **Walkthrough `unconfigured` on delivered runs (BL-52b).** `loadWalkthroughGenerator` binds
  the real `AnthropicWalkthroughGenerator` when `WALKTHROUGH_MODEL_KEY_SECRET` resolves to a
  valid non-placeholder key; Pulumi now wires the env on the worker to
  `secretVersion(secrets.anthropicApiKey)` (name only — ADR-052 names the worker exception:
  ingest reconstruction + walkthrough only).

## Test plan

- `pnpm turbo build lint typecheck` — **135/135**
- `pnpm test` — **4,172 pass / 6 skip / 0 fail** (424 files)
- `pnpm check:licenses` — 609 OK · `pnpm check:protocol-markers` — 48 clean ·
  build-memory check — 0 violations
- infra/pulumi vitest — 15/15 (note: `tsc -b` on `infra/pulumi` fails on `import.meta` in a
  pre-existing test file — the tsconfig targets the Pulumi CLI; tests are vitest-covered.
  Pre-existing on the base branch, not introduced here.)

New coverage: `chat-surfaces.test.ts` RUN.1 describe (truthful statuses on every chat route,
log fields, no-message-text), `gate-policy.test.ts` matrix (incl. `null`→blocking-wait),
`internal-api.test.ts` (informational advance/finalize + auto-resolve), `pod-loop.test.ts`
end-to-end informational ride-through (real api routes + PGlite), `harness-loop.test.ts`
informational-continue, `walkthrough-generator.test.ts`, `compute.test.ts` IaC assertion,
`chat-panel.test.tsx` composer pinning, `run-sheet/view.test.ts` canonical scope lines.

Journeys R4/R7 rewritten to actually prove the defects (desk-open, real selectors, mobile-UA
context, turn-status poll; sheet-line canonical strings + the informational-card/never-parked
co-occurrence invariant). Both stay `expected:"red"` until Stage B flips them with live
evidence — never claimed green on code alone.

Pre-existing red folded in: `check-additive-migrations` snapshot missed `0053` (EDIT.1's file);
`phase-loop`/`g21`/`pod-loop`/`harness-loop` fixtures updated to the blocking leg where the old
park semantics were under test, with informational-path coverage added alongside.
