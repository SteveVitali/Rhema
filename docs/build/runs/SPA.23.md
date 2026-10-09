# SPA.23 — run ledger: surface `editor` part 1 — Page mount, session registry, DOM parity

- **Ticket:** `docs/tickets/133_SPA.23__editor-mount.md` (manifest row 133)
- **Branch:** `stevevitali/spa-23-editor-mount` — forked from
  `stevevitali/spaf-13-prod-flip-run-report` @ `6a01a62` (the requested chain tip). (The forked
  local branch was born misnamed `stevenvitali/…` — renamed to the chain's `stevevitali/`
  convention before first push; unpushed at rename, no refs rewritten.)
- **PR:** #155 — opened at closeout; `gh pr checks --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if
  it reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND
gcloud secrets list --filter='name~resend' --project=rhema-507501
→ only rhema-prod-resend-api-key
```

The secret was never printed (there is no version to print); the shared non-prod Resend
key is still absent, so no signed-in preview session can mint through the magic-link +
mailbox leg — the Page routes are session-gated. The preview two-leg and rollback
drill are honestly deferred (`D-SPA.23-1`/`-2`), with the deterministic in-repo proof
standing in. Same live blocker as `D-MAINT.6-1` / `D-SPA.6-1` / `D-SPA.12-1` … `D-SPA.22-1`.

## 0b — Inherited chain debt

None closed this run. `D-OPS.1-1`, `D-SPA.6-1`, `D-MAINT.6-1` blocker-updated (the SPA.23
re-probe), all stay OPEN; `D-SPAF.1-*`…`D-SPAF.13-*` stay OPEN behind the operator
merge+deploy prerequisite.

## 1 — What landed

The **first half of the LAST surface** — the editor split (design/23): this row owns the
mount/registry seam, the five read twins + the handoff POST, DOM parity part 1, and the
forced-SSR posture. SPA.24 owns the collab wire, autosave layers, provenance/undo, the
remaining parity rows, and the dead-code drops; SPAF.14 owns the prod flip (after SPA.24 —
`editor` flips only when both halves land).

### Mount + registry (`apps/web/src/spa/`)

- `page-mount.tsx` — `PageMount`: hand-rolled `useRef`+`useEffect` ProseMirror mount
  (REQ-ED-1/2, REQ-FW-11). The host owns only `[data-page-host]`; the declarative
  `data-page-preview` stays painted until the mount succeeds (pending + no-JS floor), then
  yields to the live view stamped `data-page-view="1"` + `.rm-page`.
  `installOriginDispatch` (non-re-entrant), decorations/meters/focus-scroll, read-only
  handling — StrictMode-safe: session-owned destroy, no double-mount.
- `page-sessions.ts` — module-scope `PageSessionRegistry` (REQ-ED-4; `draft:<id>` keys —
  draft ids globally unique so the key is REQ-NAV-6's `(projectId,draftId)` equivalent):
  acquire/release refcount, idle-destroy TTL, `rekey` on draft rebind, `EditorState`
  custody, `PageSessionWire` seam. Remount preserves doc + undo + plugin state.
- `surfaces/editor.tsx` — the five surface components: verbatim `@rhema/ui` chrome
  (`PageEditor` with the additive `host`/`embeds`/`onProposalAccept`/`onProposalReject`
  props), delegated `bffFetch` submits, `useGatePresence` on approval rows,
  `useDwell`/`useShellChrome`.

### Shared chrome + `@rhema/ui`

- `page-chrome.tsx` — `PageChrome`/`ProjectOverviewBody`/`anchorQuote`/`compareLabels`/
  `whatChangedLabels` extracted verbatim out of `pages.tsx` (SSR byte-preserved); added to
  `SPA_WEB_SRC_ALLOW` in `check-protocol-markers.mjs`.
- `page-editor.tsx` — additive props only: `host`, `embeds={false}` (SPA skips the
  `script[data-page-doc]` embeds + `/assets/page.js` island — the leaf derives
  `markdownToDoc(doc.markdown).toJSON()`, the same canonical call `page-data.ts` runs —
  design/23 F5 + REQ-ED-14), proposal callbacks.
- `approval-row.tsx` — `rowRef` (React mount for `useGatePresence`; the SSR presence
  `<script>` never executes under React).

### Server (`server.ts`) + twins (`queries.ts`)

- Five BFF read twins on the ONE shared compositions: `GET /bff/p/:slug`
  (`projectOverviewComposition` + `ideContext`), `GET /bff/p/:slug/v/:v` (the `/v/working`
  miss is the document's own `{ok:true, redirect:"/p/:slug"}`), `GET
  /bff/p/:slug/v/:n/diff/:m`, `GET /bff/p/:slug/a/:artifactId`, `GET
  /bff/p/:slug/revisions/:cid`; 401/404 parity throughout.
- `POST /bff/p/:slug/handoff` (REQ-BFF-22) — the unread-`run_finished` mark-read +
  workflow-href handoff; invoked from the `/p/:slug` leaf's `beforeLoad` (`?focus=1`
  suppresses verbatim); workflow hrefs redirect via document navigation — server authority.
- `wantsJson`/`mutationOutcome` on every editor-surface write — rename, approval
  overrides, decision answers, revision comments, restore, compare comments, editor
  note/cancel/revise + kin: JSON callers get 401 `{error:unauthenticated}` (never a
  `/login` redirect) + JSON `not_found` 404s; form 302s byte-identical. The save POST keeps
  its underlying save DTO + provenance metadata verbatim.
- `queries.ts` — `BffPageBag` (`PageData["page"]` minus `docJson` — the doc JSON is
  leaf-derived), `BffProjectTwin`/`BffVersionPageTwin`/`BffCompareTwin`/`BffArtifactTwin`/
  `BffRevisionTwin`, `postProjectHandoff(slug,{focus})`.

### Routes

Five leaves (`p.$project.index` with the `beforeLoad` handoff, `v.$v` with the
working-redirect + 404 arms, `v.$n.diff.$m`, `a.$artifactId`, `revisions.$cid`) —
validated search, `isSpaEnabled` consult, twin warmed on "spa" only, twin-404 →
`notFound()`, `PendingShell`/`SsrHandoff` on other verdicts (zero BFF reads).

### Forced SSR (REQ-ED-12, REQ-VFY-5)

`isPhoneRequest(c)` + `row.showcase` precede the `spaShellResponse` consult — phone and
showcase stay SSR even with `editor ∧ ide-chrome` flipped. Server-decided read-only rides
the twin (`readOnly`, withheld `collabWsUrl`) — the SPA cannot enable collab by asking.

### Stage facts + gates

`STAGES.dev.spaSurfaces` `…,"run-report"]` → `…,"run-report","editor"]` (the five leaves
are IDE-framed — key-level AND with the already-flipped `ide-chrome`); preview `[]`, prod
pinned (`[…,"dossier","run-report"]` — SPAF.14 owns the LAST flip). `SURFACE_GATES.editor`
keeps the seven carried legs + gains the owed preview note. `dom-contract` editor
**57 hooks** (`layout` manifested).

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135** tasks |
| `pnpm test` (repo root) | **5,598 pass / 6 skip / 0 fail** (486 files, 2 skipped) |
| `page-sessions.test.ts` | **9/9** |
| `editor.dom.test.tsx` | **16/16** |
| `server.test.ts` | 126 total — **+10 SPA.23** |
| `check:dom-contract` | editor **57/57** emitted + asserted |
| `stages.test.ts` | **23/23** (dev +`editor`, prod/preview pinned) |
| `surface-gates.test.ts` | **11/11** |
| `check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-budget` / `check:spa-env` | all clean (244 public files scanned; allowlist += `page-chrome.tsx`) |
| REQ-VFY-9 disposition | **MET** — SSR HTML-string asserts stay as retained fallback coverage (`server.test.ts`); SPA render asserts in `editor.dom.test.tsx`; status/mutation legs in `server.test.ts` + the carried journey steps |

### Mid-run fixes (all real, all re-verified)

- `page-sessions.test.ts`: `prosemirror-model` did not resolve under the web package's
  test context — the test rides `@rhema/editor`'s exports instead. The TTL leg's
  fake-clock boundary corrected to the registry's scheduled cleanup timing.
- `server.test.ts` SPA.23 block: the overview fixture lacked `listGates`; assertions
  initially read fields off the wrong twin nesting; the save leg expects the underlying
  save DTO (not an `{ok,data}` wrap) — the route's pre-existing semantics preserved.
- JSON write branches: several editor POSTs still had unconditional
  `c.redirect("/login")`/HTML 404s — converted to `wantsJson`/`mutationOutcome` so JSON
  callers get envelopes (401/404 JSON), form 302s unchanged.
- Lint: unused `railLabels`/`WhatChangedDto`/`resolved`/`BffIdeBag` imports removed;
  unknown `react-hooks/exhaustive-deps` directives dropped (the real deps behavior kept).
- `check:protocol-markers`: `page-chrome.tsx` entered the SPA source-map graph → added to
  `SPA_WEB_SRC_ALLOW`.
- `check:dom-contract`: `layout` manifested as an editor URL-param hook.
- Copy-containment: one `page-mount.tsx` comment carried scanner-tripping copy — reworded,
  behavior unchanged.
- Harness note: `paywall.test.ts` walks `packages/ui/src` relative to CWD — green under
  the canonical root `pnpm test`; a CWD-scoped run reds it as an invocation artifact.

## 3 — Deferrals

Opened `D-SPA.23-1` (preview two-leg + leg C on `pr-<n>` — the Resend prerequisite) and
`D-SPA.23-2` (rollback drill on the same preview). `D-OPS.1-1`, `D-SPA.6-1`,
`D-MAINT.6-1` blocker-updated. **None closed** — every upstream OPEN row still needs its
named operator prerequisite.

## 4 — AC disposition

| AC | Layer | Disposition |
|---|---|---|
| Page mounts under the SPA shell on dev-flag; `<PmPreview>` pending paint then editor | deterministic · engineered | **MET** — `STAGES.dev` +=`editor`; `data-page-preview` → `data-page-view` swap asserted in `editor.dom.test.tsx` (mount + preview yield legs); `STAGES.prod` untouched |
| Registry: remount preserves doc+undo+plugin state; refcount-0 idle destroy | deterministic · engineered | **MET** — `page-sessions.test.ts` 9 legs: `draft:<id>` identity, acquire/release, StrictMode remount preserves the `EditorState` custody, idle-TTL + rekey, wire seams |
| DOM contract part-1 checklist asserted vs `dom-contract.ts` | deterministic · engineered | **MET** — editor **57/57** emitted + asserted incl. mount attrs, readonly posture, preview contract, pending paint |
| Phone/showcase forced-SSR even with the flag on | deterministic · engineered | **MET** — consult-order legs (`isPhoneRequest`/`row.showcase` precede `spaShellResponse`); twin withholds `collabWsUrl` + `readOnly` server-side |
| Universal phase-gate AC | agentic | **MET** — verification green; requirement ids stamped in `pr/SPA.23.md`; `D-SPA.23-1`/`-2` ledgered; no ADRs (no design deviations — the leaf-side `docJson` derivation is design/23 F5's sanctioned arm); BUILD_INDEX + LEDGER advanced; append-only honored; dates from the clock; PR checks read and recorded below |

## PR checks read

`gh pr checks 155 --watch=false` at closeout (2026-10-09T21:56Z) → **"no checks reported
on the 'stevevitali/spa-23-editor-mount' branch"** — the same closeout read as #140–#154
recorded; no inherited-red classification needed this run.
