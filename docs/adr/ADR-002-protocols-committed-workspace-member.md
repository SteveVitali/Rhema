# ADR-002: `@rhema/protocols` is a committed workspace member with an export-time stub swap — retro-fitted record

- **Status:** Accepted — **REVERSED in part 2026-11-03** (operator ruling 2026-11-02; see the
  appended note). The committed-workspace-member half stands; the export-time-stub-swap half is
  retired — `packages/protocols` ships public.
- **Date:** 2026-09-01
- **Ticket:** P0.03 (PR #3); wiring P0.01 (PR #1); reversal R6OSS.1
- **Requirement ids:** REQ-ARCH-37 (re-amended); cross-cutting invariant 3 (§13.2)
- **Spec:** rhema-design-spec §13.2; Q-19 (closed-source, open-source-ready — operator-amended:
  open-source with protocols)

> Retro-fitted by MAINT.1 from the manifest's `## Spec amendments applied` (2026-09-01). Applied during the
> build (P0.01/P0.03); this ADR is its committed record.

## Context

The spec required the ported skills/evals to be **open-source-ready**: the original design kept
`packages/protocols` as a gitignored, path-resolved private checkout so a public export could drop it. But the
repo is private, and a gitignored package is absent from CI — P0.03's protocols checks (upstream-diff, manifest
validation) could not run against a package that did not exist in the tree.

## Decision

Make `packages/protocols` a **committed workspace member** of this private repo. Open-source-readiness becomes an
**export-time swap** to `@rhema/protocols-stub` (renamed from `@rhema/protocols`), not a live path resolution:
the `public-safe` CI job builds the stub, and a public export drops `packages/protocols` and swaps in the stub.
`.pnpmfile.cjs` path-resolution now covers `@rhema/evals` only; the ported skills are drift-checked against the
vendored pin `packages/protocols/upstream-pin/`.

## Consequences

- The whole graph (incl. `packages/protocols` build/lint/tests + the upstream-diff, AC1) runs in the normal
  `typecheck-lint-unit` CI job — no external repo needed (closed `D-P0.03-4`).
- The protocol IP now lives in this private repo's git history; the closed-source invariant is preserved because
  no protocol/eval text enters client bundles, OpenAPI, or events, and the public export drops the package.
- Affects P0.01 (private-package wiring) and P0.03 (the protocols package lands in-tree, tracked).

## Alternatives considered

- **Keep the gitignored path-resolved checkout.** Rejected: absent from CI; the protocols checks could not run.
- **Publish `@rhema/protocols` to a private registry.** Rejected: added a release/versioning step for an
  in-repo package and did not improve the open-source-export story over an export-time stub swap.

## Revisit trigger

Revisit if Rhēma goes open-source (execute the stub swap and verify no protocol/eval text ships), or if the
protocols package needs to be shared across repos (then a private registry may beat an in-tree member).

## Amendment — 2026-11-03 (operator ruling 2026-11-02; R6OSS.1; REQ-ARCH-37 re-amended)

**The export-time stub swap is retired.** The operator ruled, verbatim: "I'm okay with
packages/protocols being public. We should amend the docs that say otherwise." The public shape is
now the **repository visibility flip** — `packages/protocols` and its full git history publish
with the tree; nothing is swapped or renamed at export.

What stands unchanged:

- `packages/protocols` remains a committed workspace member (the Decision's first half).
- `@rhema/evals` remains **private and path-resolved** via `RHEMA_EVALS_PATH` with `evals-stub` as
  the fallback (`.pnpmfile.cjs`); the ruling covers protocols only.
- The marker/no-cookies containment checks still run — they now guard the remaining private
  material (evals) and the ingestion contract, not protocol text (which is public by choice).

What changed:

- `packages/protocols-stub` is reclassified as a **dormant export shim** — kept, still compiled by
  `public-safe` as the tested escape hatch if protocols ever need to be pulled again, but no longer
  "the intended public replacement." See ADR-125.
- The `public-safe` CI job's meaning narrows: it proves the stubs still compile and that no
  eval/protocol text reaches client bundles; it does **not** model an export.
- The visibility flip publishes **every commit**, so the secret/personal-data exposure surface is
  all of git history, not the tip — audited in `docs/ops/open-source-readiness.md` (R6OSS.1).
