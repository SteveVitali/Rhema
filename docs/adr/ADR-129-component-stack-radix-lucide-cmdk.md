# ADR-129: Component stack — Radix per-package primitives, Lucide icons, `cmdk`; SplitPane choice by R7PANE.1

- **Status:** Proposed
- **Date:** 2026-11-03
- **Ticket:** R7OPEN.1 (shell); filled and accepted by **225 R7KIT.2**. The no-raw-controls rule
  item is **225a R7KIT.2b**'s; the SplitPane choice (`react-resizable-panels` vs in-house, under
  the REQ-KIT-5 budget rule) is **229 R7PANE.1**'s.
- **Requirement ids:** REQ-KIT-2/3/4/5, REQ-DOPS-8, REQ-GUARD-1, REQ-PANE-1
- **Spec:** `docs/round-7-draft-spec.md` §3.2 (ADR-129 bullets), §4.6, §4.7; `GD-UX-KIT.R7`

## Context

The operator ruled **"Radix primitives + Lucide"** (GD-UX-KIT.R7). Spec §3.2 enumerates:
Radix per-package primitives (`@radix-ui/react-*`; no meta-package), `lucide-react`, and
`cmdk` for Combobox and palette; `react-resizable-panels` *or* an in-house SplitPane — the
R7PANE.1 ticket chooses under the budget rule; all candidates are MIT/ISC and `check:licenses`
verifies; styling comes from a generated `uiCss()` in `@rhema/ui`; the no-raw-controls rule
(REQ-GUARD-1) and the per-ticket entry-delta allowance (REQ-KIT-5) apply.

## Decision

_(Shell — written by R7OPEN.1 from spec §3.2. 225 R7KIT.2 fills the dependency list with exact
pins (REQ-DOPS-8) and the `uiCss()` contract; 225a R7KIT.2b fills the primitive inventory and
the no-raw-controls rule's scope/exemptions; 229 R7PANE.1 records the SplitPane choice.)_

## Consequences

_(Filled by the owners: SPA budget headroom measured at the tip (REQ-KIT-5), chunk-loading
boundaries, the migration-batch order, licence evidence.)_

## Alternatives considered

_(Filled by the owners: meta-package vs per-package Radix; react-resizable-panels vs in-house;
generated CSS vs per-component styles.)_

## Revisit trigger

`check:licenses` fails a candidate, the budget rule rejects both SplitPane options, a needed
primitive has no Radix implementation, or the icon set changes.
