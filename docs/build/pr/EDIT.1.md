# EDIT.1 — Locked versions fork without a confirm; `/v/working` resolves for every project; the Page saves with ONE truthful sync pill

The 404 was a single filter: fresh imports write `origin='human_upload'`,
`state='frozen'` (`import.ts` — by design since PRB.02), but
`GET /projects/:id/editor/resolve/:v` queried `state='working'` only. Every
project whose head was frozen — fresh imports, reviewed-but-unedited heads,
duplicates, `my-first-project`-shaped projects — 404'd at `/p/:slug/v/working`.

The fork machinery needed no change: `saveManualRevision` /
`openHumanRevision` already mint `v(N+1)` `human_revision` on first write and
route stale-base writes to the child. What was missing was the **route** to the
head the user should edit.

Ticket: `docs/tickets/72_EDIT.1__edit-path.md` (chain row 72, round 3).
Base: `stevevitali/onb-1-import-latency-held-draft` @ `52629b3` (stacks on PR #93).
Merge policy: **OPERATOR — do not merge.**
ADRs: **ADR-048** (`/v/working` = the editable head — working head, else the
highest-n draft as the lazy-fork source; names the §5.4-vs-`import.ts` freeze
deviation), **ADR-049** (one sync indicator — `[data-sync-pill]` survives;
read-only reaches the client at attach; explicit `wss://` connect-src).
Requirement ids: **REQ-IDE-32** (primary), **REQ-DATA-14**, **REQ-DATA-21**,
**REQ-DATA-24**, **REQ-IDE-43**, **REQ-IDE-46**; REQ-IDE-44/REQ-DATA-27 honoured
as amended — **no working copies** (1.x).
Deferrals: **D-EDIT.1-1** (Stage B deploy + N8 on prod + `my-first-project`
HTTP legs + the WebKit CSP leg).

## What changed

**Resolver (ADR-048).** `resolve/:v` for `working` is now
`order by (state='working') desc, n desc limit 1` — the working head, else the
highest-n draft. Numeric `/v/:n` stays exact (a frozen `/v/3` never resolves to
a child). `/v/working` is **read-only**: no GET path mints a draft — the lazy
fork stays first-write (`openHumanRevision` is never called by a GET).

**Web.** `/v/working` resolve-404 ⇒ redirect `/p/:slug` (the project has no
drafts — the empty-state affordances live there); numeric misses keep the
truthful 404. The Showcase SSRs read-only with **no collab wire** (§15.4 — the
worked example can never fork under a keystroke). The Files-pane `sourceHref`
and every edit affordance ride `/v/working`; the legacy `/edit/:draftId`
redirect reads non-exact so a stale base id lands on `/v/<childN>`, the live
editing surface — matching the save/doc routes. CSP `connect-src` carries the
configured `COLLAB_WS_URL` origin explicitly (Chromium maps `'self'`→`wss://`,
WebKit's coverage has been historically inconsistent — the explicit source
makes the connect engine-independent).

**Collab.** The Showcase attaches read-only at auth (the binding now selects
`p.showcase`) — the WSS leg matches the api's `showcaseReadOnlyGuard` posture,
and `storeDocument` returns `locked` for it as a belt (no fork, no `y_state`
write even via a stale connection). A new `connected` hook sends
`rhema.readonly` on read-only attach — the client's handler existed but
nothing ever sent it; the pill used to claim `synced` while the framework
silently dropped updates until the 10 s doc poll caught up.

**Sync (ADR-049).** `[data-sync-pill]` is the ONE autosave indicator — the
ide-shell status bar's `.ide-sync` span (rendered `Synced` unconditionally,
fed by nothing) is removed along with its labels/props; the pill gains
`role="status" aria-live="polite"`. Fork banner copy is §5.4 verbatim:
**"Editing v{n} · findings from v{base} follow your text"**.

**Journey N8.** Rewritten: **leg A** — a fresh tenant's imported draft
(`createDraftProject`) → the Edit source link → `/v/working` mounts → typing
flips the banner to `Editing v2` with **no confirm surface anywhere** → the
pill reaches `synced ✓` → `/v/working` reload shows the working
`human_revision` chip + the persisted marker. **Leg B** — jrn-a's
reviewed/frozen chip gets the same flow (through the `frozen_fork` rebind when
the lineage is already forked); fallback is the Showcase-duplicate's frozen
head. `expected` stays **`red`** — the green flip rides the deployed walk
(D-EDIT.1-1).

## Tests

- `apps/api/src/editor-routes.test.ts` — 13/13. New: resolve `working` over a
  head built by the **real `createImportedDraft`** (the exact
  `human_upload`/`frozen` row shape that 404'd), agent-frozen resolve,
  working-child preference + numeric exactness, resolve mints nothing (draft
  count + frozen sha unchanged), draft-less 404, showcase save still 409s.
  The existing fork-once / stale-base-routes-to-child / run-lock legs stay
  green — the regression test fails against the pre-fix resolver.
- `apps/web` — 434/434. New: `/v/working` on a frozen head renders the editable
  Page (`data-readonly="0"`, frozen banner, collab wire), draft-less redirect,
  CSP `connect-src` carries the `wss://` origin, exactly one
  `[data-sync-pill]` + `role="status"` + zero `.ide-sync`, showcase read-only
  SSR, stale `/edit/` lands on the child's `/v/<n>`.
- `apps/collab` — 13/13. New: showcase draft attaches read-only + the store
  belt writes nothing (no child draft, byte-identical `y_state`);
  `rhema.readonly` reaches a real `HocuspocusProvider` over a real WebSocket
  at connect.
- `packages/{ui,journeys,tokens}` — 155/155 (ide-shell no-`.ide-sync`;
  registry green-baseline set still enforces N8 red).
- `pnpm turbo typecheck` 90/90 · `lint` 45/45 · `build` 45/45 · licenses 609 +
  protocol-markers clean.

## Deploy notes

api + web + collab images change (`edit1` build; run-task/worker/fetcher/
convert/export/egress-proxy keep their pins). **No new migration** —
`projects.showcase` already exists. `pulumi preview` expectation: image-env
updates only — zero stateful replace/delete; a stateful change pauses per
ADR-013. Stage B (D-EDIT.1-1): deploy chain-tip → `pnpm journeys N8 --stage
prod` → `my-first-project` HTTP legs → WebKit leg → flip N8 green with
report + screenshots under `docs/build/reports/`.
