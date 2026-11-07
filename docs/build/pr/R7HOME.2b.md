# R7HOME.2b — A project opens to its Page; blank new project; Project settings page; outline coherence

Ticket: `docs/tickets/236_R7HOME.2b__project-opens-to-page.md` (row 236 of 254, R7b).
Requirement ids: **REQ-HOME-2, REQ-HOME-3, REQ-HOME-6, REQ-KIT-5 (allowance)**; ADR-128 banners for REQ-IDE-5/48 (amended), REQ-IDE-41 (kept), REQ-GROWTH-12.

## Summary

`/p/:slug` IS the head draft's Page — the overview's admin block (approvals policy, deadlines,
standing notes, voice picker, Needs-you rows, Decisions list, "Edit source") is gone from below
the document: approvals/notes/voice live on the Project settings page, decisions in Inbox +
Timeline, and the Next-step card is a dismissible card in the Timeline tab (per user per project
via `dismissed_explainers`, key `next_step_<projectId>`). No new modal (REQ-IDE-41 kept).

"New project" issues ONE create call — `entry:'scratch'` now writes project + member + blank
`human_revision` working draft + seeded live doc in one tenant transaction — then the leaf throws
an in-router redirect to `/p/:slug?created=scratch`, where the focused inline "Untitled" title
IS the heading (no dialog, no duplicate title). The empty head carries the quiet affordance row
(Import a file · Paste text · Start from an outline · Ask in chat — the §5.3 entries' new home).
`GET /app/new` → 302 `/app` (decided fate: a document GET never creates); the ONB.1 held-draft
contract moved onto `/p/:slug/import` (`?held=1` hydrates there after the blank create).

"Outline exists" is one fact — `a.kind = 'outline'` — shared by the outline route (was
`mirror_path like 'agents/author/outline/%'`) and the Files tree's `loadFiles` (same predicate
already), so the route and the tree can never disagree; `OutlineDto.slug` is `null` outside the
author namespace (saves resolve by recency).

## What changed

- api: `project-routes.ts` (scratch arm → atomic born-blank head), `outline-routes.ts`
  (`kind='outline'` single source, nullable slug).
- web: `server.ts` (`/app/new` GET→302, scratch "Untitled" default, settings twin
  `projectVoice`+`approvalOverrides`, next-step dismissal merge, voice-lock echo → settings),
  `page-chrome.tsx` (Page-only body, inline title, affordance row), `surfaces/editor.tsx`
  (leaf slimmed), `surfaces/settings.tsx` (voice picker + opt-in fallback + lock hatch),
  `surfaces/onboarding.tsx` (sheet deleted; hold contract on `ImportSurface`),
  `routes/app.new.tsx` (beforeLoad create+redirect), `pages.tsx`, `queries.ts`, `copy.ts`,
  `dom-contract.ts` (retired/moved hooks journaled).
- ui: `timeline.tsx` (dismiss form + suppression) + `timeline.test.tsx` (new).
- api-client: `TimelineNextStepDto` dismissal fields; `OutlineDto.slug` nullable.
- journeys: green legs re-pinned to the new contract (POST create, `/p/:slug/import` hold
  landing, `[data-project-item="versions"]`, decisions on `/app/inbox`); `P1.app-new` asserts the
  blank-create flow.
- docs: dated ADR-128 banners in `rhema-design-spec.md`; `D-R7HOME.2b-1` deferral.

## Design decisions

- `/p/:slug` renders the Page directly (no redirect) — the walkthrough-card handoff for an
  unread `run_finished` rides the existing `beforeLoad` POST unchanged.
- Dismissal persistence: `dismissed_explainers` + `next_step_<projectId>` (name-grammar-safe via
  `.toLowerCase()`), so it reappears for another user verbatim — no new storage.
- The create's trio+project is ONE tenant transaction — a failure can never leave a
  half-created project.
- `data-gate-explainer` retired with the Needs-you section; the dismiss machinery is what the
  next-step card rides.
- Green journey legs re-pinned to the new contract (same disposition as R7HOME.1's R1/X1).

## Verification

Stage A only ($0 — GD-PREVIEW.R7; no preview, no live deploy). Tests written per the AC matrix:
PGlite (`project-routes.test.ts` scratch trio; `outline-routes.test.ts` coherence both
directions), DOM (`editor.dom.test.tsx`, `onboarding.dom.test.tsx`, `ide-surfaces.test.tsx`,
`server.test.ts`, `triage-surfaces.test.ts`, `voice-surfaces.test.ts`), component
(`timeline.test.tsx`), journeys bodies updated. **Build/test/check runs + the entry delta + the
CI boundary read are recorded in `runs/R7HOME.2b.md`** (see its evidence log; the delta vs
`spa-budget-baseline.json` — ≤15 kB allowance — is reported there on build).

## AC → evidence

| AC | layer | evidence |
|---|---|---|
| /p/:slug → Page; unread run → walkthrough | engineered | `editor.dom.test.tsx` R7HOME.2b block; handoff beforeLoad unchanged |
| settings holds approvals/deadlines/notes/voice; no admin below doc; no modal | engineered | `settings.tsx` + `/bff/p/:slug/settings` twin; absence + aria-modal asserts |
| dismiss per user per project | engineered | `timeline.test.tsx` + `server.ts` merge + explainers POST |
| one create → draft+live doc; focused inline title; no fork | engineered | `project-routes.test.ts` PGlite; `editor.dom.test.tsx` inline title |
| affordance row opens flows; import overwrites blank head | engineered | `data-empty-page-actions` asserts; 235's `createImportedDraft` overwrite legs |
| outline route ⇔ Files tree agree | engineered | `outline-routes.test.ts` REQ-HOME-6 block |
| dom-contract green; delta ≤15 kB reported | engineered | `dom-contract.ts`; delta in run ledger |
| Stage B at 250 | met-engineered(D-R7HOME.2b-1) | `docs/tickets/DEFERRALS.md` |

Stage B: preview walk at `250_R7DEP.2` (D-R7HOME.2b-1) — new project → type immediately;
existing project → Page; settings renders; outline coherent; screenshots. mergePolicy: OPERATOR.
