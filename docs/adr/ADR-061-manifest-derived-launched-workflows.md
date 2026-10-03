# ADR-061: The launched-workflow set derives from the shipped manifests — `LAUNCHED_WORKFLOW_KEYS`, with `reseed_charter` filtered from user surfaces

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.1
- **Requirement ids:** REQ-SPEC-2 (copy half), REQ-IDE-41
- **Spec:** §6.2, §5.11, §14.7

## Context
`WORKFLOW_KEYS` is the domain vocabulary — all 22 keys, including workflows with no manifest and no
runner. Preferences rendered all of them under "Rigor per workflow", advertising ten workflows that
cannot launch, and the settings API accepted rigor overrides keyed on them. The ticket requires one
launched-set source; the choice was where it lives and what it derives from.

## Decision
`LAUNCHED_WORKFLOW_KEYS` in `@rhema/contracts` (enums.ts) is the boundary list; it is pinned
one-for-one to `WORKFLOW_MANIFESTS` (the shipped manifests in `@rhema/protocols`) by
`manifests.test.ts` — a manifest added or pulled without the contracts row updating fails the build.
`USER_LAUNCHED_WORKFLOW_KEYS` subtracts `reseed_charter`, which launches only as the adopt hatch's
system-side run (never a user-pickable rigor row). Preferences renders the user list; the settings
API rejects any `rigorByWorkflow` key outside the launched set (a `null` still prunes — deletes stay
legal); the ⌘K palette lists only `phase:"mvp"` verbs and a hand-typed unlaunched verb still
resolves to an honest disabled row ("isn't available yet"). `WORKFLOW_KEYS` itself is untouched —
protocol/domain vocabulary keeps the full enumeration; launched filtering belongs at product
surfaces.

## Consequences
Preferences can never advertise an unbuilt workflow again; the API gate means a stale client or a
hand-crafted request gets a 422, not a silently stored dead key. The pin test makes drift between
contracts and the engine a build failure.

## Alternatives considered
- Deriving the list from `VERB_TABLE`'s `phase` flags: rejected — the verb table is a command-grammar
  surface (several launched workflows have no verb, e.g. `reseed_charter`, `chat_turn`), so "verbs"
  and "runnable workflows" are different sets; manifests are the engine's truth.
- Filtering at render only (keep accepting unlaunched keys in prefs): rejected — the stored override
  would be a latent inconsistency; rejecting at the boundary is the honest contract.

## Revisit trigger
A `one_x` workflow shipping — its manifest lands in `WORKFLOW_MANIFESTS`, the pin test forces the
`LAUNCHED_WORKFLOW_KEYS` row, and every surface picks it up from the one list.
