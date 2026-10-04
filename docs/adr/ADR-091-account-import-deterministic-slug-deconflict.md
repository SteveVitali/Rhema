# ADR-091: Account import resolves slug collisions deterministically instead of skipping the row

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-ACCT-3
- **Spec:** §5.11

## Context

D-STB.5a-2: `importAccountZip` inserted `projects … on conflict do nothing` on
`UNIQUE(workspace_id, slug)`; every export carries the seeded `showcase` project and every target
workspace already owns one → the row skipped, `projectId` still mapped the never-inserted id, and
the dependent `artifacts` insert failed `artifacts_project_id_fkey` → 500 on every real import
(live log `unhandled_route_error` 2026-10-04T04:43:41Z).

## Decision

Before insert, `importAccountZip` resolves a deterministic non-colliding slug per imported
project/persona — `base`, `base-2`, `base-3`, … against a snapshot of existing slugs — and imports
under the resolved slug while `importedId(ws, kind, original_id)` still derives the imported PK
from the ORIGINAL id. A candidate slug already owned by the derived imported id is a re-import
dedupe: that id is skipped, not renamed again. Null persona slugs stay null.

## Consequences

- Import is idempotent across repeat imports of the same zip (same resolved slugs → conflict on
  id → skip) and no longer loses dependent rows; the artifacts FK uses the actual inserted id.
- The imported `showcase` appears as `showcase-2` (etc.) rather than silently merging into the
  destination's seed — visible but correct.

## Alternatives considered

- Skip the colliding project with its dependents: loses user data silently; rejected.
- Gate dependent inserts on the row-count: lands a half-import (project dropped, voice kept);
  rejected.
- Rename the destination's existing row: mutates user data the import doesn't own; rejected.

## Revisit trigger

Reopen if deterministic deconflict is ever wrong UX (e.g. import previews want to offer "merge
into existing" semantics) or slug uniqueness rules change.
