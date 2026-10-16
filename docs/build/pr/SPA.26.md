# SPA.26 — island-bundle retirement: outline out; page/ide join the forever-SSR island set (ADR-107)

Manifest row 137 · stacks on `stevevitali/spa-25-source-mode-revival` @ `81cbe38` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/137_SPA.26__island-retirement.md` per
`docs/frontend-spa-spec.md` §5/§11, `docs/design/21_spa-toolchain.md` REQ-TL-12/13,
`docs/design/23_spa-editor-collab-binding.md` §7/REQ-ED-12, and
`docs/research/01_route-census.md` F8.

**Requirement IDs:** REQ-TL-13 · REQ-INV-8 · REQ-ISL-1 (retirement leg) · REQ-TST-8 ·
REQ-SEQ-10 (entry gate — deferred to activation; `D-SPA.26-1`).

## What this does

Consumer-traced each named bundle before deleting:

- **`outline` — RETIRED.** `src/client/outline.ts` deleted; `CLIENT_ENTRIES` shrinks to
  `["ide","page","landing"]`; the `/assets/outline.js` tag + the island's mount
  attributes (`data-autosave`, `data-label-{saving,saved,failed}`) come off the
  editable SSR outline page. The fallback is truthful: the explicit-Save form posts
  the same `ed.*` grammar to the same action (the `?saved=1` flash + cited-outline
  arms untouched), and the SPA leaf has owned autosave since SPA.18.
- **`editor` — stays retired** (source + entry went at SPA.24); `routes.tsx` was
  verified clean of `editorElement`/the `/edit/:draftId` row and now has a regression
  guard (`routes.test.ts`) — the GET stays a server-owned 302, the
  `/edit/:draftId/{doc,note,cancel-run,revise}` transports stay live (REQ-INV-8).
- **`page` + `ide` — deliberately NOT retired (ADR-107).** The ticket premise
  ("islands no longer reachable") does not hold for them: the REQ-ED-12 forced-SSR
  family (`isPhoneRequest`/`row.showcase`, flag-independent forever) renders the SSR
  `PageEditor`+`IdeFrame` and mounts both islands, the `?ssr=1` escape + flag-off
  renders do too, and `D-SPAF.14-3` names `page.js` the flag-rollback collab arm
  (REQ-ISL-4 — the shared `collab.ts` wire). They join `landing` in the permanent SSR
  island set; the entries leave only when nothing served can mount them.
- **Parity retargeted (REQ-TL-13/REQ-TST-8).** `asset-parity.test.ts` (4 → 8):
  surviving-entry parity, a recursive emitted-reference scan, explicit
  retired-name 404s, and a Vite manifest leg — every `file`/`imports`/`css` artifact
  answers `/assets/spa/…` with the right type, every shell-emitted `/assets/spa/` URL
  resolves, `.map`/non-`assets/`/`..` shapes refuse. Journeys: `runner.ts` captures all
  same-origin `/assets/` responses (nested SPA paths included) and
  `assertBundleParity` keys content-type by extension (mirroring `SPA_ASSET_TYPES`).

## Verification (offline, all green)

`pnpm turbo build lint typecheck` 135/135 · `pnpm test` **5,622 pass / 6 skip / 0
fail** (487 files) · `check:dom-contract` OK (outline 33/33) · `check:spa-budget` OK ·
`check:licenses` OK (822) · `check:protocol-markers` OK · `check:no-cookies` OK ·
`check:spa-env` OK · build-memory + append-only validators green.

## Deferred

`D-SPA.26-1` — the REQ-SEQ-10 entry gate (14 flips merged + ≥1 nightly green) binds
this row's merge+deploy, not its authoring (the 2026-10-08T19:12Z ruling;
`D-SPAF.14-4` names the cleanup wave). No live legs this ticket — every behavior is
deterministic in-repo.
