# SPA.21 — surface: `dossier` (`/p/:p/review/:runId` + `/p/:p/obligations/new`)

Manifest row 129 · stacks on `stevevitali/spaf-11-prod-flip-run-sheet` @ `52ac0bf` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/129_SPA.21__surface-dossier.md` per `docs/design/22_spa-bff-api-shape.md`
(`dossier` endpoint table), `docs/design/25` (`p.review` IDE-framed, `p.obligationNew` unframed),
`docs/design/29` §route-map, and `docs/frontend-spa-spec.md` §11. **The twelfth dev surface** of
the strangler migration — the dossier: the Review letter, claims + rubric, second read, the
findings list with its client-ported filter/sort state, triage dispositions, Apply / Promote /
Add-to-obligations, bulk preview + confirm, gate cards, obligations, timeline, and the IDE frame.
`dossier` is **IDE-framed** — `/p/$project/review/$runId` resolves `dossier ∧ ide-chrome` at the
server's key-level AND; `/p/$project/obligations/new` is unframed and consults `dossier` alone.
Dev flips on this commit; **prod is untouched — SPAF.12 owns that row** (REQ-SEQ-10).

## Requirement IDs

REQ-SEQ-9 · REQ-SEQ-12 · REQ-VFY-8 · REQ-VFY-9 · REQ-VFY-10 · REQ-BFF-10/16/24 · REQ-DAT-5 ·
REQ-UX-3/4/5/10/13/14/15/16 · REQ-TST-2

## What lands

### Shared extraction (SSR keeps working — additive-only)

- `apps/web/src/dossier-view.tsx` (new, ~1,000 lines) — the whole dossier composition hoisted out
  of `pages.tsx` verbatim: the letter arm, claims table, second read, rubric, findings list +
  filters, disposition controls, apply/promote/add-obligation actions, the bulk preview + confirm
  arms, the focused `?gate=` card, the triage ledger, the Margin/Desk body builders, plus the
  `DossierViewData`/`DossierViewState` types both renderers consume.
- `apps/web/src/chat-pane.tsx` (new, 71 lines) — `chatPanel` extracted so the Page-internal
  §10.1 phone chat section + the Desk chat body share one emitter.
- `pages.tsx` shrinks ~925 lines to imports + the unrelated pages; the SSR `DossierPage` and
  `ObligationNewPage` render the extracted markup unchanged.

### Server (`apps/web/src/server.ts`)

- `GET /bff/p/:slug/review/:runId` — the dossier twin: the ONE composition call (context,
  correspondence, letter, claims, findings, rubric, run card, access report, triage state, gate
  card, the IDE bag) → `{dossier, dossierView, project, paperTheme, appTheme?, ide}`; unauthed
  401 / missed slug-or-run 404 parity.
- `GET /bff/p/:slug/obligations/new` — `{obligationNew:{slug,projectTitle,back}}`; `?back`
  re-runs the server's `safeBack` (`/p/…`-confined) so the serialized `back` is the authority.
- **JSON mutations** (`wantsJson` + `mutationOutcome`) on every dossier write — the finding
  disposition POST (`?disposed`), Apply (`?applied`), Promote (`?promoted`), Add-to-obligations
  (`?obligated`), the bulk preview + confirm (`?bulk`/`?bulkdone`), the gate decide POSTs, and
  `POST /p/:slug/obligations` (`?obligation=new`). Envelopes carry the identical flash-param
  redirects; refusal statuses + detail strings preserved verbatim; form callers keep their
  302s/re-renders on either renderer.

### SPA (`apps/web/src/spa/**`)

- `surfaces/dossier.tsx` — `DossierSurface` + `ObligationNewSurface` port the extracted markup
  verbatim: canonical `data-*` vocabulary, the Margin/Desk pane bodies + palette + timeline
  republished through `useShellChrome`'s new **extras** param, `data-phone-chat` at phone width,
  the showcase-anchor beacon arm (`spa/showcase-beacon.ts`), gate presence, delegated
  submit-interception (`bffFetch` + `collectJsonFields`), `["bff"]` settle-invalidate, and
  REQ-UX-16 `aria-busy` + disabled controls while a write is in flight, restored on settle.
- **Client-ported filters** — `triage`/`sev`/`kind`/`disp`/`sec`/`url`/`sug`/`obl` are
  leaf-owned validated search keys; `visibleDossierFindings` re-derives the filtered set with the
  shared `@rhema/findings-core` `filterFindings`/`applySeverityBudget` (no refetch), and the SAME
  derived list feeds the body list, the Margin, and the Desk. Server-owned keys
  (`disposed`/`gate`/`bulk`/`bsec`/`bulkdone`/`bulkskip`/`applied`/`promoted`/`obligated`/`ferr`/
  `fmsg`/`focus`) forward onto the twin GET so a mutation redirect lands truth + flash in one read.
- Routes `p.$project.review.$runId` + `p.$project.obligations.new` — loaders warm the twin only on
  the "spa" verdict; twin-404 → `notFound()`; any other verdict → `SsrHandoff` (zero BFF reads).

### Journeys (`@rhema/journeys`)

- `seedWritableDossier` (`@rhema/db`) — the Showcase fixture bundle on a **normal** project
  (`showcase=false`), so `showcaseReadOnlyGuard` does not freeze its writes; slug-idempotent,
  coexists with the Showcase, $0/deterministic.
- `T12F` / `T13F` (new `expected:"red"`, `paid:false` steps) — T12/T13's write legs on the seeded
  dossier: disposition+note round-trip, Add-to-obligations, `/obligations/new` filing,
  Apply retraction, bulk preview checklist → `?bulkdone=` dispatch (the REQ-VFY-10 owed coverage).
- `P1.dossier` — the phone-width leg: letter + finding cards render, the §10.1 capability
  boundary holds (no bulk affordances), overflow + axe clean.
- `SURFACE_GATES.dossier` gains `{T12F, T13F, P1.dossier}` alongside carried `{N7, T1}`; the owed
  note records the preview blocker + the expected:red semantics.

### Stage facts

`STAGES.dev.spaSurfaces += "dossier"` (paired with `ide-chrome`); `preview` stays `[]`; **prod
untouched** — `["usage","inbox","settings","voices","onboarding","project-home","billing",
"export","ide-chrome","outline","figures","run-sheet"]`, SPAF.12 owns the flip.

## Verification

- `pnpm turbo build lint typecheck` — **135/135** tasks.
- `pnpm test` — **5,528 pass / 6 skip / 0 fail** (485 files).
- `dossier.dom.test.tsx` — **16** legs (mount vocabulary, pending shell, query-state filters with
  zero refetch, disposition/apply/promote/obligations/bulk/gate envelopes, refused-write repaint,
  REQ-UX-16, SsrHandoff, axe subset, obligations-new render/refuse/create, `?back` confinement,
  §10.1 phone-chat parity, SSR/SPA hook parity).
- `check:dom-contract` — dossier **108/108** emitted + asserted.
- `showcase.test.ts` (+1 — writable dossier seeds `showcase=false`, coexists, slug-idempotent);
  `registry.test.ts`/`surface-gates.test.ts` green; `stages.test.ts` 23/23.
- `check:licenses` · `check:protocol-markers` (allowlist += `dossier-view.`/`chat-pane.` — the
  shared-leaf convention) · `check:no-cookies` · `check:spa-budget` · `check:spa-env` — all clean.
- REQ-VFY-9 disposition: SSR HTML-string asserts stay as retained fallback coverage
  (`triage-surfaces.test.ts`, `findings-surface.test.ts`, `dossier-evidence.test.ts`); SPA render
  asserts live in `dossier.dom.test.tsx`; mutation/BFF legs live in `bff.test.ts` + T12F/T13F.

## Deferred (honest — `docs/tickets/DEFERRALS.md`)

- `D-SPA.21-1` — preview two-leg + leg-C on `pr-<n>`: **`rhema-nonprod-resend-api-key` re-probed
  NOT_FOUND this run** (`gcloud … versions access` → NOT_FOUND; only `rhema-prod-resend-api-key`
  exists) — no signed-in preview session is mintable; same prerequisite stack as D-MAINT.6-1 /
  D-SPA.6-1 / … / D-SPA.20-1.
- `D-SPA.21-2` — the preview rollback drill (flag off → SSR serves the same DOM contract) rides
  the same preview.
- `D-OPS.1-1` blocker-updated, stays OPEN. Nothing closed.

## Rollback

Flag off → the document path SSR already serves (`SsrHandoff` document-navigates unflipped
verdicts; asserted). The PR is additive-only on the render side; `git revert` of the stage-fact
line re-dormants the leaf on dev.
