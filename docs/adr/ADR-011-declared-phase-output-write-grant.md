# ADR-011: a run's declared phase outputs are writable for that run (per-run grant over the §12.6 read-only shared mounts)

- **Status:** Accepted
- **Date:** 2026-09-18
- **Ticket:** PRB.19 (F26b — the mount-policy half of the bare-Revise defect, D-PRB.16-1 evidence)
- **Requirement ids:** REQ-DATA-10 (seat mounts), REQ-DATA-14/21 (delivery freeze), REQ-SPEC-2 (the manifest
  is the contract), §12.6 (seat mount table), §12.2 (write-back allowlist)
- **Spec:** rhema-design-spec §12.6, §12.2, §11.5 (hydration)

## Context

The ported Revise skill writes its deliverables at the SHARED paths the workflow manifest declares —
`drafts/v(N+1).md` and `correspondence/vN-response.md` — while §12.6 mounts `drafts/**` and
`correspondence/**` **read-only** for every seat (they are shared evidence; the server's delivery
transaction is the only writer of the `correspondence_items`/`drafts` ROWS). The result, seen live on prod
run `01M2T6D3B32AVXHCQH73ZGJGBD`: the pod wrote both files, the hooks denied and harvest dropped them as
`out_of_allowlist` boundary violations, the run finalized bare (no `run.deliver` job), and the pod-local
bytes were lost with the pod. The seat contract and the delivery contract disagreed about who writes the
manifest's own declared outputs.

## Decision

**Keep the §12.6 seat table byte-identical — `drafts/**` and `correspondence/**` stay `read` — and grant
writability per-run, per-path, from the manifest's own `phase.artifacts` declarations.** The manifest is
already the delivery contract's statement of what the run must produce; the server resolves those declared
paths (expanding `vN`/`v(N+1)` against the run's delivery base) at hydration and carries them as
`writablePaths` on the hydration response + run spec. Every enforcement layer reads the same grant:

- `declaredWritableArtifacts` (`@rhema/mirror/mounts`) computes the concrete paths — only paths whose seat
  mount exists and is `read` are granted (seat-private namespaces need none; unmounted paths gain none).
- `materializeSeat`/`buildSeatHydration` mount a committed artifact at a granted path `readwrite` (the
  revise phase's `drafts/v2.md` must stay editable through `verify`/`deliver`).
- `compileSeatPolicy` (`@rhema/hooks`, the authoritative seat table consumer) appends each granted path as a
  `readwrite` project rule — the classifier prefers a writable match over the seat's `read` glob.
- `harvest` accepts a NEW file at a granted path as a new version instead of an `out_of_allowlist` drop.

The grant is **path-precise**: `drafts/v2.md` and `correspondence/v1-response.md` are writable on a canonical
Revise while `drafts/v9.md` still drops. A divergent-head Revise (manual revision) grants both the base's and
the reviewed draft's `vN` expansions — an unused grant commits nothing. Server-side delivery remains the only
writer of the correspondence/draft ROWS and of `correspondence/<kind>/<ordinal>/` dossier artifacts; the
grant widens only which artifact FILES the seat may commit.

## Consequences

- A Revise run's deliverables persist: `drafts/v(N+1).md` harvests, the delivery transaction finds the
  produced draft version across the run's `steps.produced_version_ids`, and the reserved `nextDraftId`
  materializes + freezes (`response_to_review`, `promoted_version_id` = the produced version).
- The shared read-only evidence posture is unchanged for every path the manifest does not declare — the
  Editor↔Drafter wall, immutable-artifact quarantine, and read-only hash protection all still apply.
- The runspec now carries a writable-path grant; a compromised pod can still only write paths the manifest
  itself declared as the run's outputs (and the server's delivery transaction re-derives everything else).
- `deliver` declares `response-ledger.json` as a sidecar + `sidecar_validates` predicate, so the sealed
  ledger reaches `DeliveryArgs.sidecars` and folds into `dispositions` — a missing ledger now fails the
  phase instead of delivering a bare response.

## Alternatives considered

- **Make `drafts/**`/`correspondence/**` readwrite for the author seat.** Rejected: it widens writes to every
  shared artifact at every phase of every run — the grant would no longer be the manifest's declaration, and
  a stray write to `drafts/v1.md` history would commit instead of violating.
- **Keep everything read-only; have the pod write outputs under `agents/author/**` and let the server copy
  them to the shared paths at delivery.** Rejected: it splits the deliverable across two paths (the skill's
  declared path vs the harvested path), duplicates the bytes as artifacts, and makes the skill's SKILL.md
  contract (`Copy drafts/vN.md → drafts/v(N+1).md`) a lie the server must repair post-hoc.

## Revisit trigger

If a workflow declares an output path the run must NOT be trusted to write (e.g. a path other seats consume
as frozen evidence mid-run), or if the per-run grant proves too broad in practice, replace the manifest-wide
grant with a per-phase grant (hydrate at each phase boundary rather than once per run).
