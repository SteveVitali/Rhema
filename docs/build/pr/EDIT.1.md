# EDIT.1 — Locked versions fork without a confirm; `/v/working` resolves for every project; the Page saves with ONE truthful sync pill

The 404 was a single filter: fresh imports write `origin='human_upload'`,
`state='frozen'` (`import.ts` — by design since PRB.02), but
`GET /projects/:id/editor/resolve/:v` queried `state='working'` only. Every
project whose head was frozen — fresh imports, reviewed-but-unedited heads,
duplicates, `my-first-project`-shaped projects — 404'd at `/p/:slug/v/working`.

The resolver now picks **the working head, else the highest-`n` draft**
(including frozen). Viewing a frozen head mints nothing; the first write
lazily forks `v(N+1)` `human_revision` without a confirm; repeated saves
update the same head; a stale frozen-base id routes to the project's ONE
working head. One vocabulary decides editability everywhere —
`HUMAN_EDITABLE_DRAFT_ORIGINS = human_revision | human_upload | duplicate`
in `@rhema/contracts` — so `duplicate` heads edit in place (they are normal
project heads, not Showcase) while agent-origin heads stay non-editable and
the Showcase stays read-only end-to-end.

Ticket: `docs/tickets/72_EDIT.1__edit-path.md` (chain row 72, round 3).
Base: `stevevitali/onb-1-import-latency-held-draft` @ `52629b3` (stacks on PR #93).
Merge policy: **OPERATOR — do not merge.**
ADRs: **ADR-048** (`/v/working` = the editable head — resolver order, lazy
fork, stale-base routing, the human-editable set; names the
§5.4-vs-`import.ts` freeze deviation, amended 2026-10-03 for the
duplicate-origin class), **ADR-049** (one sync indicator — `[data-sync-pill]`
survives; read-only reaches the client at attach; the out-of-band
`rhema.fork`/`rhema.readonly` stateless messages; explicit `wss://`
connect-src).
Requirement ids: **REQ-IDE-32** (primary), **REQ-DATA-14**, **REQ-DATA-21**,
**REQ-DATA-24**, **REQ-IDE-43**, **REQ-IDE-46**; REQ-IDE-44/REQ-DATA-27 honoured
as amended — **no working copies** (1.x).
Deferrals: **D-EDIT.1-1 → DONE** (Stage B executed — see below);
**D-EDIT.1-2 OPEN** (Safari/WebKit CSP leg — not runnable autonomously on
the build host; verification coverage only).

## What changed

**Resolver (ADR-048).** `resolve/:v` for `working` is now
`order by (state='working') desc, n desc limit 1` — the working head, else the
highest-n draft. Numeric `/v/:n` stays exact (a frozen `/v/3` never resolves to
a child). `/v/working` is **read-only**: no GET path mints a draft — the lazy
fork stays first-write (`openHumanRevision` is never called by a GET).
`openHumanRevision` numbers the child `max(n)+1` so a stale-base fork can't
collide on `(project_id, n)`.

**Human-editable origins.** `saveManualRevision` saves a working
`human_revision`/`human_upload`/`duplicate` head **in place**; the frozen
branch resolves the project's working head first (human-editable → rebind/
route; agent-origin → read-only/`not_editable`; none → fork from the frozen
base). Same rule in collab `auth` (writable attach), `blocks` (mobile patch
guard), `materialize`, `manual-trace`, and `computeReReviewSeed`'s
`humanEdit` — no more `origin === 'human_revision'` drift.

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

**Collab.** The Showcase attaches read-only at auth (the binding selects
`p.showcase`) — the WSS leg matches the api's `showcaseReadOnlyGuard` posture,
and `storeDocument` returns `locked` for it as a belt (no fork, no `y_state`
write even via a stale connection). The store broadcasts **`rhema.fork`
{draftId, draftN} out-of-band** before `closeConnections` — the in-band CLOSE
left the provider half-open so `frozen_fork`'s rebind signal never arrived;
locked/showcase/not-editable early-outs broadcast **`rhema.readonly`**. The
client handles both in `onStateless`; `page.ts` rebinds the same Y.Doc to the
child document, updates the draft id + URL, and stamps
`root.dataset.draftN`.

**Sync (ADR-049).** `[data-sync-pill]` is the ONE autosave indicator — the
ide-shell status bar's `.ide-sync` span (rendered `Synced` unconditionally,
fed by nothing) is removed along with its labels/props; the pill gains
`role="status" aria-live="polite"` and truthfully reports
synced/syncing/offline/readonly. Fork banner copy is §5.4 verbatim:
**"Editing v{n} · findings from v{base} follow your text"**.

**Journey N8.** **Leg A** — a fresh tenant's imported draft
(`createDraftProject`) → the Edit source link → `/v/working` mounts → typing
flips the banner to `Editing v2` with **no confirm surface anywhere** → the
pill reaches `synced ✓` → `/v/working` reload shows the working
`human_revision` chip + the persisted marker. **Leg B** — jrn-a's
reviewed/frozen chip gets the same flow (through the `frozen_fork` rebind when
the lineage is already forked); fallback duplicates the Showcase — the
`duplicate` working head edits in place and the chip assertion accepts the
human-editable set. Exactly one `[data-sync-pill]`; no visible confirm.
**`expected` flipped `red→green`** on the deployed walk (below).

## Stage B — executed on prod (update 122 @ `76e00c5`, $0)

Six N8-found defects were fixed en route — each commit deployed and re-walked:

| commit | defect |
|---|---|
| `170722b` | the island's `dispatchTransaction` re-entered `view.dispatch` → `RangeError` inside the Yjs observer |
| `70d327f` | collab prod `ids` minted `dft_<24-hex>` → `draft.forked` ULID `idSchema` reject killed the store hook |
| `446aa11` | migration `0053`: `rhema_collab` lacked UPDATE on `provenance_maps` (the `on conflict` branch needs it) |
| `8376ac1` | `closeConnections` left the WS open → `onAuthenticate` never re-ran → `rhema.fork` stateless broadcast added |
| `76e00c5` | the `duplicate`-origin class: working dup heads attached read-only; stale-base children missed non-revision heads |

- **Deploy:** Cloud Build `730ad630` tag `edit1` → api/web/collab digests
  pinned in `Pulumi.prod.yaml` → `pulumi preview` 7 updates / 0 creates /
  replaces / deletes → `pulumi up` **update 122** → provenance PASS
  `76e00c50f3e458e8dce1b963f5845435f2fa627b` on web + api `/healthz` →
  `deployments` row `prod:76e00c5…` (`protocols_version=0.4.0+ec61156725a895ab`).
- **N8 `ready-to-flip` → green** (`docs/build/reports/2026-10-03_EDIT.1-n8/`,
  nonce `46b3b6960e86`, 27.3 s, $0 ≤ $5, zero console errors / failed
  requests): leg A import→fork→save→reload full green; leg B duplicate
  fallback — the `duplicate` working head edits in place, pill synced.
- **my-first-project authed HTTP 200/200** (owner session minted+deleted over
  the system-role tunnel — no live session existed): `/v/working` renders the
  frozen v8 `drafted_from_outline` head (`data-draft-n="8"`,
  `data-readonly="0"`) — the motivating defect; no one-off repair SQL owed.
- **WebKit CSP leg — attempted, blocked at the environment level**
  (Playwright WebKit `newPage()` hangs headless+headed on macOS 14.4;
  `safaridriver` needs the operator's Remote Automation toggle) →
  **D-EDIT.1-2**.

## Tests

- `apps/api/src/editor-routes.test.ts` — resolve `working` over a head built
  by the **real `createImportedDraft`** (the exact `human_upload`/`frozen`
  row shape that 404'd), agent-frozen resolve, working-child preference +
  numeric exactness, resolve mints nothing (draft count + frozen sha
  unchanged), draft-less 404, showcase save still 409s, dup working-head
  GET/save/stale resolve.
- `apps/web` — `/v/working` on a frozen head renders the editable Page
  (`data-readonly="0"`, frozen banner, collab wire), draft-less redirect,
  CSP `connect-src` carries the `wss://` origin, exactly one
  `[data-sync-pill]` + `role="status"` + zero `.ide-sync`, showcase read-only
  SSR, stale `/edit/` lands on the child's `/v/<n>`; `page-dispatch.test.ts`
  pins the non-reentrant `dispatchTransaction`.
- `apps/collab` — showcase draft attaches read-only + the store belt writes
  nothing (no child draft, byte-identical `y_state`); `rhema.readonly`
  reaches a real `HocuspocusProvider` over a real WebSocket at connect;
  `onStoreDocument` on a frozen head broadcasts `rhema.fork`; dup writable
  attach + in-place store; dup `frozen_fork` rebind; agent head read-only.
- `packages/mirror` — dup working head saves in place, frozen dup base routes
  to the working head, stale-base fork `max(n)+1`, agent head `not_editable`.
- `packages/{ui,journeys,tokens}` — ide-shell no-`.ide-sync`; the registry
  green-baseline set now includes N8.
- Final deterministic totals: mirror **342**, api+web+collab+ui+tokens
  **1082**, `pnpm turbo typecheck/lint/build` **135** tasks — all green;
  licenses + protocol-markers clean.

## Deploy notes

api + web + collab images change (`edit1` build; run-task/worker/fetcher/
convert/export/egress-proxy keep their pins). One additive migration —
`0053_collab_provenance_maps_update.sql` (applied live via the IAP tunnel).
No stateful replace/delete in any preview (updates 116–122 all image/env
only). PR #94 stays **unmerged** — merge policy OPERATOR.
