# ADR-125: `packages/protocols` publishes with the repository; the stub is a retained dormant shim

- **Status:** Accepted (operator ruling — recorded verbatim)
- **Date:** 2026-11-03 (ruling 2026-11-02)
- **Ticket:** R6OSS.1 (open-source readiness — audit + readiness artifacts; the visibility flip
  itself is the operator's act)
- **Requirement ids:** REQ-ARCH-37 (re-amended); REQ-ARCH-30 (secrets posture — drives the
  full-history scan); REQ-ARCH-38 (previews/secrets separation — drives the fork-safety leg)
- **Spec:** rhema-design-spec §13.2 dated amendment (2026-11-03); Q-19 amended; manifest
  `## Spec amendments applied` 2026-11-03 entry; ADR-002 appended amendment

## Context

ADR-002 (2026-09-01) committed `packages/protocols` to this private repo and made
open-source-readiness an **export-time swap**: a public export would drop the package and rename
`@rhema/protocols-stub` into its place. `docs/open-source-readiness.md` carried the same boundary,
and P0.03's probe (2026-10-27) showed the swap path didn't even build — importer dependencies
and lockfile disagreed, and `@rhema/run-sheet` missed estimator/workflow exports from the stub.

On 2026-11-02 the operator reversed the premise, verbatim: **"I'm okay with
packages/protocols being public. We should amend the docs that say otherwise."** and, for the
readiness work, **"we should do secret/history scan, check for personal data, etc., and scan all
the other stuff you mention, as well as the standard OSS hygiene."** The publication shape is
therefore the GitHub **visibility flip** on `SteveVitali/rhema` — no export, no rename, and the
exposure surface is **all of git history**, not the tip tree.

## Decision

1. `packages/protocols` ships **public** — the repository flips visibility with the package in
   place; the export-time swap premise is retired (ADR-002 amendment 2026-11-03).
2. `packages/protocols-stub` is **retained** as a dormant fallback shim: it still builds under
   `public-safe` so the escape hatch stays warm if the boundary ever reverses again, but nothing
   resolves `@rhema/protocols` to it today and it is not "the intended public replacement."
3. `@rhema/evals` stays **private and path-resolved** (`RHEMA_EVALS_PATH` → `evals-stub` via
   `.pnpmfile.cjs`); the ruling covers protocols only.
4. The `public-safe` job's meaning narrows: stub-compile + the containment checks that still
   bind (eval text, ingestion credentials, bundle budgets). A green `public-safe` no longer says
   anything about an export artifact.
5. Readiness is now a **full-history audit + a flip runbook**
   (`docs/ops/open-source-readiness.md`), executed in this ticket: gitleaks over all refs,
   targeted class greps, and a per-class stays/scrub/ruling disposition table whose
   operator-ruled items gate the flip.

## Consequences

- Protocol IP is no longer a private-tree asset — the marker/containment gates' remaining job is
  eval text and the ingestion/secret contracts, and they stay fail-closed.
- Historical documents asserting the private-package/export-swap invariant stand as history; the
  reversal rides the dated amendments (this ADR, the ADR-002 note, the spec + manifest entries)
  rather than a rewrite.
- The flip is irreversible in the same way a leak is: every commit publishes. The audit's
  needs-ruling rows must be dispositioned by the operator before the toggle.

## Alternatives considered

- **Keep the export-swap design.** Rejected by the operator — and it was already dishonest: the
  2026-10-27 probe showed the swapped tree does not build.
- **Delete `packages/protocols-stub`.** Rejected: it compiles today, costs one CI step, and is the
  only tested fallback if protocols must be pulled again (e.g. a future closed distribution).
  Recorded as dormant rather than silently dead so a later reader does not mistake it for the
  live boundary.
- **Scrub history preemptively.** Rejected — a destructive rewrite requires per-item operator
  authorization; the audit instead produces a disposition table for each class.

## Revisit trigger

Revisit if the operator withdraws the protocols-public ruling (re-arm the stub as the real
export), if `@rhema/evals` changes boundary (a second ADR), or if a real secret is confirmed in
history (then the scrub-vs-rotate ruling and its execution plan belong to a dedicated record).
