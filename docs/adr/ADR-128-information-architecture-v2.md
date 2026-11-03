# ADR-128: Information architecture v2 — persistent left sidebar, flat list, project-opens-to-Page, no new modals

- **Status:** Proposed
- **Date:** 2026-11-03
- **Ticket:** R7OPEN.1 (shell); filled and accepted by **211 R7RO.1** (the REQ-ED-12/Showcase
  item) and the R7b owners per spec §10 as split (manifest `### Round 7`; Notes § Split rows):
  226 R7SHELL.1a (REQ-IDE-2 rail → sidebar; REQ-IDE-8/DS §5.1 regions), 234 R7HOME.1
  (REQ-IDE-4/-6 flat list), 236 R7HOME.2b (REQ-IDE-5 new project; REQ-IDE-48 landing),
  248 R7TOUR.2 (REQ-GROWTH-12 non-modal tour), 239 R7WRITE.2 (REQ-UX-8/REQ-IDE-49 `?` sheet),
  246 R7SYNC.1 (REQ-NAVM-7 preload discharge).
- **Requirement ids:** REQ-IDE-2/4/5/6/8/19/41/48, REQ-GROWTH-12, REQ-UX-8/REQ-IDE-49,
  REQ-NAVM-7, REQ-ED-12/ADR-108; REQ-SHELL-*, REQ-HOME-*, REQ-PANE-3
- **Spec:** `docs/round-7-draft-spec.md` §3.2 (ADR-128 item list), §4.5–§4.9; `GD-UX-SHELL.R7`,
  `GD-UX-HOME-LIST.R7`, `GD-UX-PROJECT-HOME.R7`, `GD-UX-WALKTHROUGH.R7`

## Context

Spec §3.2 enumerates the per-requirement amendments this ADR lands: REQ-IDE-2 (rail → a
persistent, collapsible left sidebar, still identical in workspace and IDE scope, still
carrying the Inbox badge); REQ-IDE-8 and DS §5.1 (new regions sidebar | Page | right panel —
tabs Chat · Findings · Claims · Timeline · Live feed; the bottom Desk retires); REQ-IDE-4/-6
(flat recent list; "Waiting on you"/"Running" only when non-empty; attention grouping opt-in;
"Quiet" retired); REQ-IDE-5 (new project = an immediately created blank Page with an inline
title, no dialog; protocol defaults to Essay; venue/voice move to Project settings);
REQ-IDE-41 (**kept** — no new modal anywhere); REQ-IDE-48 (a project opens to its head draft's
Page; the walkthrough-card landing kept); REQ-GROWTH-12 (the demo tour is non-modal and never
auto-starts); REQ-UX-8/REQ-IDE-49 (the `?` cheat sheet kept; REQ-KEYS remaps chords only);
REQ-NAVM-7 (discharged by REQ-SPEED-3); REQ-ED-12/ADR-108 (Showcase Pages render SPA
read-only — UXC-6; the phone-UA SSR reader remains for real projects).

## Decision

_(Shell — written by R7OPEN.1 from spec §3.2. The owning tickets fill the decision section by
section as they land their items.)_

### REQ-ED-12 — Showcase Pages render in the SPA read-only (R7RO.1, 2026-11-03)

The Page family's forced-SSR verdict is **phone-UA only**. The `row.showcase === true` arm is
removed from all five Page-family document predicates (`/p/:slug`, `/p/:slug/v/:v`,
`/p/:slug/v/:n/diff/:m`, `/p/:slug/revisions/:cid`, `/p/:slug/a/:artifactId`): a `showcase`
row's document GET serves the SPA shell, and its in-app hops are client navigations — the
seeded Showcase stops being a forced-SSR multi-page site.

Read-only posture is carried by the shared `ReadOnlyProject{reason}` mechanism (REQ-DWEB-14):
`project.readOnlyProject = {reason:"showcase"}` on every Page-family twin plus the dossier,
run-report, and obligation-new twins; `readOnlyProject` in the SPA boot payload on those same
document routes; `{reason:"run_lock"}` when a run's lock set holds the head (DS §5.4 — a frozen
VERSION is never a reason; typing in one forks `v(N+1)`, REQ-WRITE-7). The client derives the
fact once (`readOnlyProjectFor` — twin wins, boot slot slug-scoped), mounts one notice per
reason, and hides or disables every write control before any request is made; the api's 409
guards stay as defence in depth. The phone-UA SSR reader remains the only forced renderer for
real projects (`isPhoneRequest(c)`), unchanged.

## Consequences

_(Filled by the owners: migration order, pane breakpoints (REQ-PANE-2), the Desk-retirement
staging (REQ-PANE-3 keeps every body reachable between merges), keymap interplay.)_

## Alternatives considered

_(Filled by the owners: the rail-only alternative; modal tour; bottom panel vs right panel.)_

## Revisit trigger

A surface cannot render inside the shell, a modal is genuinely required, the sidebar item set
changes materially, or REQ-IDE-41's no-modal rule is amended.
