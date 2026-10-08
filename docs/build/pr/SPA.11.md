# SPA.11 — surface: inbox (`/app/inbox` → React SPA behind the `inbox` flag)

**Manifest row 109** · stacks on `stevevitali/spaf-1-prod-flip-usage` @ `d41e4a4` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/109_SPA.11__surface-inbox.md` per `docs/design/22` (endpoint table —
`app.inbox` row), `docs/design/29` (route-map `inbox`), `docs/design/27` (two-leg + rollback
mechanics), and `docs/frontend-spa-spec.md` §4/§8/§9. `STAGES.dev.spaSurfaces` gains `"inbox"`;
preview/prod stay unchanged (prod flips only on a separate SPAF ticket after the REQ-SEQ-10
bake gate).

**Deployable dark:** nothing changes for an unflipped request — the leaf's loader skips its BFF
read and `SsrHandoff` document-navigates back to the same server route. SSR fallback + SSR tests
untouched (REQ-SEQ-11/12). `?ssr=1`/`?renderer=spa`/`x-rhema-renderer` overrides ride the
unchanged consult machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8/9 · REQ-BFF-1/2/3/10/16 · REQ-DAT-4 · REQ-SPEC-18 ·
REQ-UX-3/4/5/6/10/13/14/15/16**

## What lands

### `GET /bff/app/inbox` (the read twin)

- `bffRoute`-gated; returns `{items, badge, gateCards}` — the SAME aggregate the `/app/inbox`
  document composes: api-ordered items, the raw badge count, and §6.4 gate cards joined
  per-touched-project (one `listGates` per distinct project id — the document's own join) keyed
  by **inbox-item id**.
- Degrade semantics verbatim: each seam is best-effort — a miss lands the SSR's own composed
  default (`items: []`, `badge: 0`, a row's missed join degrades to its deep link) — while an
  upstream 401 rethrows through `swallowDegraded` to the `{error:"unauthenticated"}` envelope.

### JSON mutation branches (REQ-BFF-1/2/3)

- `POST /app/inbox/read` and `POST /app/inbox/read-all` gain `wantsJson` branches: a JSON caller
  posts `{item}` (or `{}`) and gets `{ok:true, redirect:"/app/inbox"}` — never a 302; the
  form-encoded post keeps its 302 verbatim (the no-JS leg is the same element, untouched).
- JSON callers with no session get `{error:"unauthenticated"}` 401 — never the `/login` document
  redirect. Mutation side effects stay idempotent and swallowed exactly as the form path's.

### `spa/surfaces/inbox.tsx` — `InboxSurface`

- The §5.11 ordering verbatim: **blocked/Needs-you → unread → earlier → voices**; the badge line
  IS the rendered blocked-row count (`blocked.length`), never the raw api number.
- Blocked rows port all three kinds: `<details>` gate rows (the expand IS the side-sheet) mounting
  the run's real card through the shared `gateCardFor` (`data-inbox-gate-card`), decision rows
  through `DecisionsList`, and plain blocked rows.
- `gate-card.tsx` extraction: `gateCardFor`/`gateCardModel`/`dispositionLabels`/`decisionsLabels`/
  `outlineLabels`/`decisionLine`/`approvalRowLabels` moved out of `pages.tsx` into a shared
  server-safe module — one composition, both renderers. The browser-only REQ-SPEC-18 presence
  pings live in `spa/gate-presence.ts` (`useGatePresence` — the verbatim React port of GateCard's
  inline `<script>`; `gateCardFor`'s new `presenceScript:false` option suppresses the dead
  innerHTML script under React mounts only).
- SSR markup parity fix: the unread row's mark-read `<form>` was nested inside a flex `<p>` —
  `form` is a p-closing tag, so every HTML parser hoisted it out (plus a stray-`</p>` phantom
  paragraph). `pages.tsx` now emits the sibling shape directly; the SPA emits the same — the two
  renderers' DOMs are identical and valid.
- Full manifest vocabulary verbatim; `data-spa-surface` root; `check:dom-contract` 12/12 emitted
  + asserted. All user-facing text via `COPY.inbox` (the containment scan).
- Mutations ride the JSON branch via `useMutation` + `inboxQuery` invalidation on settle —
  server-truth repaint, never optimistic mirroring; submit handlers `preventDefault` over the
  same forms so no-JS stays a document POST.

### Route leaf + queries

- `routes/_authenticated/app.inbox.tsx`: loader warms `inboxQuery` **only** when the boot verdict
  is `spa`; component re-consults → `SsrHandoff` otherwise; `isPending` → `SurfaceShell`;
  non-401 errors → thrown to the designed error state (REQ-UX-6); `compact` rides the boot's
  deviceClass.
- `queries.ts`: `BffInboxTwin` + `inboxQuery` (`["bff","app","inbox"]`, `bffFetch`, shared
  retryPolicy).

### Journey re-spec (REQ-VFY-8 — per-surface gate legs)

- `T2` split → `T2.badge` (inbox badge ⇄ Needs-you rows + open links) and `T2.matrix`
  (notification matrix + quiet hours) — `inbox` gates on the first, `settings` on the second.
- `R8` split → `R8.showcase` / `R8.prefs` / `R8.inbox` — same shape; owners unchanged.
- `SURFACE_GATES.inbox` = `["T2.badge", "R8.inbox", "X1.inbox"]`; the other gate rows re-point
  (`settings` → `T2.matrix`/`R8.prefs`; `project-home`/`editor` → `T2.badge`); legNotes dropped
  where the split made the leg the whole step.
- `registry.test.ts` id/green-baseline lists updated for the post-split ids.

### Dev flag

- `STAGES.dev.spaSurfaces = ["usage", "inbox"]`; preview `[]` (flips only via `rhema:spaSurfaces`
  stack config), prod `["usage"]` untouched (SPAF.1 landed; `inbox`'s prod flip is a separate
  SPAF ticket gated on the nightly bake). `stages.test.ts` pins the new shape.

## Tests

- `spa/inbox.dom.test.tsx` (**12**) — production-router mount at `/app/inbox`: every manifest
  hook emitted, the four sections in order, gate-card mount + missed-join degrade, decision row
  options, badge⇄row arithmetic, mark-read/mark-all-read JSON POSTs + invalidate, `SsrHandoff`
  on the unflipped verdict + never-spends-BFF, pending shell, non-401 designed error state,
  component axe (`axeCheck`).
- `bff.test.ts` — inbox twin block (aggregate payload, per-project join dedup, degraded seams →
  SSR defaults, 401 → `unauthenticated`, no-session 401-JSON) + JSON mutation legs (envelope,
  no-item no-op, form-302 preserved, unauthed JSON → 401/redirect split).
- `spa.dom.test.tsx` — seeded-session leg moved to `/app/new` (inbox now legitimately spends its
  own BFF read; the seed-satisfaction assertion is unchanged).
- **REQ-VFY-9 disposition:** `inbox-phone.test.ts` retained verbatim — its render asserts now have
  React-twin counterparts in `inbox.dom.test.tsx`; its POST/redirect legs have JSON-branch twins
  in `bff.test.ts`. No SSR test deleted.

## Verification

`pnpm turbo build lint typecheck` **135/135** · `pnpm test` **473 files / 5,050 pass / 0 fail**
· `check:dom-contract` **502 entries / 18 surfaces; inbox 12/12** · `check:spa-budget` ceilings
held · `check:licenses`, `check:protocol-markers`, `check:no-cookies`, `check:spa-env` clean.

## Preview two-leg + rollback — BLOCKED (recorded honestly)

Two preconditions, only one lifted this week:

- **Images/stack — now authorized.** The operator's amended pre-authorization (LEDGER
  2026-10-08T16:34Z) allows scoped `gcloud builds submit` (`infra/cloudbuild/image-set.yaml`,
  `_SERVICES` subset → `rhema-pr-<n>` AR) + `preview-stack.mjs` bring-up.
- **Sessions — still impossible on previews (D-OPS.1-1, OPEN).** Every inbox gate step —
  `T2.badge`, `R8.inbox`, `X1.inbox` — needs a signed-in context, and sessions mint only through
  the real magic-link mailbox (real Resend key + gmail DWD). Previews carry placeholder provider
  secrets and invite-mode signup **by design**; there is no test-session seam on non-prod. Legs
  A/B (the `SURFACE_GATES.inbox` subset under each renderer pin) and leg C's signed-in bulk cannot
  execute on `pr-<n>` regardless of infra spend. Standing a full preview would produce zero gate
  evidence — the public-route legs (N10-shaped) can't reach a flagged surface (all flagged
  surfaces are auth-gated) to observe `data-renderer="spa"`.

**Disposition:** staging-verified rows stay open — `D-SPA.6-1` OPEN unchanged (leg (b) needs both
the now-authorized image path AND preview session wiring; `D-OPS.1-1` is the operative blocker).
Compensating deterministic legs: flipped AND unflipped router mounts in `inbox.dom.test.tsx`
(SsrHandoff + no-BFF-spend asserted), override semantics in `spa-flag.test.ts`, SSR⇄SPA
vocabulary parity pinned by `check:dom-contract`, and `SURFACE_GATES["inbox"]` →
`T2.badge`/`R8.inbox`/`X1.inbox` — all renderer-agnostic, all `expected:"green"`.

## Notes for the operator

- When preview session wiring lands (D-OPS.1-1's unblock), the procedure is
  `SURFACE_GATES` `TWO_LEG_PROCEDURE`: leg A `--pin-renderer ssr --expect-renderer ssr`, leg B
  `rhema:spaSurfaces=inbox` + `--expect-renderer spa`, leg C full `paid:false`; rollback = remove
  the stack config → `up` → re-run leg A.
- `useGatePresence` is the reusable REQ-SPEC-18 pattern for every React surface that mounts
  `gateCardFor` (settings/decisions legs, project-home needs-you, run pages).
- Merge policy `OPERATOR` — the stack merges bottom-up; this run does not merge.
