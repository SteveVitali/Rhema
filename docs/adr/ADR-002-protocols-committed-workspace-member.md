# ADR-002: `@rhema/protocols` is a committed workspace member with an export-time stub swap — retro-fitted record

- **Status:** Accepted
- **Date:** 2026-09-01
- **Ticket:** P0.03 (PR #3); wiring P0.01 (PR #1)
- **Requirement ids:** REQ-ARCH-37; cross-cutting invariant 3 (§13.2)
- **Spec:** rhema-design-spec §13.2; Q-19 (closed-source, open-source-ready)

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
