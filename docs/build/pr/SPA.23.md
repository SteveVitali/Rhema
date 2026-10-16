# SPA.23 — surface: `editor` part 1 — Page mount, session registry, DOM parity

Manifest row 133 · stacks on `stevevitali/spaf-13-prod-flip-run-report` @ `6a01a62` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/133_SPA.23__editor-mount.md` per `docs/design/23_spa-editor-collab-binding.md`
(the normative mount discipline + the 29-row parity checklist part 1), `docs/research/02_island-contract-map.md`,
and `docs/frontend-spa-spec.md` §6. **The first half of the LAST surface** — the editor split:
this row owns the mount/registry seam, the five read twins + the handoff POST, DOM parity part 1,
and the forced-SSR posture; **SPA.24 owns the collab wire, autosave layers, provenance/undo, the
remaining parity rows, and the dead-code drops**; **SPAF.14 owns the prod flip** (it sits after
SPA.24 — `editor` flips only when both halves land). Dev flips on this commit
(`STAGES.dev.spaSurfaces += "editor"`).

## Requirement IDs

REQ-ED-1/2/4/6/12/13/14 · REQ-NAV-6 · REQ-VFY-2/3/5/9 · REQ-BFF-2/22 · REQ-UX-3/4/5/10/13/14/15/16

## What lands

### The mount + registry seam (`apps/web/src/spa/`)

- `page-mount.tsx` — `PageMount`: hand-rolled `useRef` + `useEffect` ProseMirror mount
  (REQ-ED-1/2, REQ-FW-11). The host owns only `[data-page-host]`; the declarative
  `data-page-preview` stays painted until the mount succeeds (pending + no-JS floor), then yields
  to the live view stamped `data-page-view="1"` + `.rm-page`. `installOriginDispatch` (the
  non-re-entrant dispatch seam), decorations/meters/focus-scroll, read-only handling — all
  StrictMode-safe: the destroy path is owned by the session, a double-effect remount cannot
  double-mount.
- `page-sessions.ts` — module-scope `PageSessionRegistry` (REQ-ED-4, REQ-NAV-6's
  `(projectId,draftId)` — draft ids are globally unique so `draft:<id>` is the verbatim key):
  acquire/release refcount, idle-destroy TTL, `rekey` on draft rebind, `EditorState` custody, and
  the `PageSessionWire` seam the mount lifecycle binds. Remount preserves doc + undo + plugin
  state; refcount-0 + TTL destroys.
- `surfaces/editor.tsx` — the five surface components: the verbatim `@rhema/ui` chrome (`PageEditor`
  with the additive `host`/`embeds`/`onProposalAccept`/`onProposalReject` props), delegated submits
  via `bffFetch` envelopes, `useGatePresence` on the approval rows (the SSR presence `<script>`
  never executes under React — `ApprovalRow` gained `rowRef`), `useDwell`, `useShellChrome`.

### Shared chrome (`apps/web/src/page-chrome.tsx`, `pages.tsx`, `packages/ui`)

- `page-chrome.tsx` — `PageChrome` + `ProjectOverviewBody` + `anchorQuote`/`compareLabels`/
  `whatChangedLabels` extracted verbatim out of `pages.tsx` (SSR byte-preserved) so both renderers
  import the ONE component set. Added to `SPA_WEB_SRC_ALLOW` in `check-protocol-markers.mjs`.
- `page-editor.tsx` — additive props only: `host` (React owns the host block), `embeds={false}`
  (SPA skips the `script[data-page-doc]` JSON/provenance/findings embeds + the `/assets/page.js`
  island script — the leaf derives the doc via `markdownToDoc(doc.markdown).toJSON()`, the same
  canonical call `page-data.ts` runs — design/23 F5 + REQ-ED-14), proposal callbacks.
- `approval-row.tsx` — `rowRef` prop (above).

### BFF twins (`apps/web/src/server.ts`, `spa/queries.ts`)

- `GET /bff/p/:slug` — the project-overview twin on the ONE shared `projectOverviewComposition` +
  `ideContext` (gates, decisions, overrides, optional settings read, dismissed explainers,
  voice-picker facts, best-effort working-head page load; the `page` bag is `PageData["page"]`
  minus `docJson`).
- `GET /bff/p/:slug/v/:v` — the version twin; the `/v/working` miss is the document's own
  `{ok:true, redirect:"/p/:slug"}` arm; a numeric miss is a 404 twin error.
- `GET /bff/p/:slug/v/:n/diff/:m` — the §5.8 compare pair verbatim (`layout`/`commented`
  leaf-owned — `layout` manifested in `dom-contract.ts`).
- `GET /bff/p/:slug/a/:artifactId` — the read-only artifact twin.
- `GET /bff/p/:slug/revisions/:cid` — the What-changed twin (`commented` leaf-owned).
- `POST /bff/p/:slug/handoff` (REQ-BFF-22) — the unread-`run_finished` mark-read + workflow-href
  handoff the `/p/:slug` leaf invokes in `beforeLoad` (`?focus=1` suppresses, verbatim); a
  workflow href redirects via document navigation — server authority preserved.
- **JSON mutations** — every editor-surface write the routes own is `wantsJson`/`mutationOutcome`-
  branched: rename, approval overrides, decision answers, revision comments, restore, compare
  comments, editor note/cancel/revise + kin. JSON callers get 401 `{error:unauthenticated}` (never
  a `/login` redirect) and JSON `not_found` 404s; form 302s byte-identical. The save POST keeps its
  underlying save DTO + provenance metadata verbatim.

### Routes (`apps/web/src/spa/routes/_authenticated/`)

Five leaves — `p.$project.index` (handoff in `beforeLoad`), `p.$project.v.$v` (working-redirect +
404 arms), `p.$project.v.$n.diff.$m`, `p.$project.a.$artifactId`, `p.$project.revisions.$cid` —
validated search, `isSpaEnabled` consult, twin warmed on the "spa" verdict only, twin-404 →
`notFound()`, `PendingShell`/`SurfaceShell`, `SsrHandoff` on any other verdict (zero BFF reads).

### Forced SSR (REQ-ED-12, REQ-VFY-5)

`data-device` phone + `showcase` requests are SSR even with `editor ∧ ide-chrome` on — the
`isPhoneRequest`/`row.showcase` check precedes the `spaShellResponse` consult. Server-decided
read-only rides the twin (`readOnly`, withheld `collabWsUrl`) — **the SPA cannot enable collab by
asking**; `data-readonly="1"` + empty `data-collab-url` + no contenteditable.

### Stage facts + gates

`STAGES.dev.spaSurfaces` `[…,"run-report"]` → `[…,"run-report","editor"]` (paired with
`ide-chrome` — `editor` ∈ `SPA_IDE_FRAMED_SURFACES`, the leaves mount `<IdeChrome>`); preview
`[]`, prod pinned (SPAF.14 owns — the LAST surface flip). `SURFACE_GATES.editor` keeps the seven
carried legs (`N8, P1.pill, P1.project, R7, T2.badge, T6, T7`) + gains the owed preview two-leg
note (D-SPA.23-1). `dom-contract` editor **57 hooks — 57 emitted, 57 asserted** (`layout`
manifested).

## Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135** tasks |
| `pnpm test` (repo root) | **5,598 pass / 6 skip / 0 fail** (486 files, 2 skipped) |
| `page-sessions.test.ts` | **9/9** (draft:<id> identity, acquire/release, StrictMode remount preserves EditorState, idle TTL + rekey, wire seams) |
| `editor.dom.test.tsx` | **16/16** (handoff POST order + `?focus=1`, `data-page-view` mount + preview yield, read-only artifact posture, REQ-TST-2 parity legs vs the SSR pages, component axe) |
| `server.test.ts` | 126 total — **+10 SPA.23** (the five twins verbatim, handoff POST on the real app, JSON write branches + 401/404 envelopes) |
| `check:dom-contract` | editor **57/57** emitted + asserted |
| `stages.test.ts` · `surface-gates.test.ts` · `page-dispatch.test.ts` | green (dev +`editor`, prod/preview pinned; editor gate + owed note; non-re-entrant dispatch) |
| `check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-budget` · `check:spa-env` | all clean (protocol allowlist += `page-chrome.tsx`; 244 public files scanned) |
| REQ-VFY-9 | **MET** — SSR HTML-string asserts retained (`server.test.ts`); SPA render asserts in `editor.dom.test.tsx`; status/mutation legs in `server.test.ts` + the carried journey steps |

## Deferrals

Opened `D-SPA.23-1` (preview two-leg on `pr-<n>` — the Resend prerequisite: re-probed
`rhema-nonprod-resend-api-key` → NOT_FOUND, D-MAINT.6-1 operative) and `D-SPA.23-2` (rollback drill
on the same preview). `D-OPS.1-1`, `D-SPA.6-1`, `D-MAINT.6-1` blocker-updated, stay OPEN. **None
closed** — every upstream OPEN row still needs its named operator prerequisite.

## Out of scope (SPA.24 / SPAF.14 / SPA.25)

Collab session wiring, autosave layers, provenance/undo — SPA.24. Source mode — SPA.25. The prod
`editor` flip — SPAF.14 (after SPA.24). Dead-code drops land in SPA.24, not here.
