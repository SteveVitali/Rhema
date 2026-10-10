# SPA.26 — run ledger: island-bundle retirement (REQ-TL-13, REQ-INV-8, REQ-ISL-1, REQ-TST-8, REQ-SEQ-10)

- **Ticket:** `docs/tickets/137_SPA.26__island-retirement.md` (manifest row 137)
- **Branch:** `stevevitali/spa-26-island-retirement` — forked from
  `stevevitali/spa-25-source-mode-revival` @ `81cbe38` (the requested chain tip).
- **PR:** opened at closeout against `stevevitali/spa-25-source-mode-revival`;
  `gh pr checks --watch=false` read once at closeout (result recorded in
  § PR checks read below; inherited `integration`/privsep red, if it reports, is
  waived per GD-MAINT.4-1 — classified, not repaired).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).
- **Owned decision record:** `docs/adr/ADR-107-forever-ssr-island-set.md` — the
  ticket-prose-vs-trace narrowing (page.js + ide.js stay in the forever-SSR island set).

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND  (output redirected to a temp file;
  never printed — there is no version to print)
```

The shared non-prod Resend key is still absent, so no signed-in preview session can
mint through the magic-link + mailbox leg. SPA.26's legs are all deterministic in-repo
(parity + retirement asserts need no browser), so the probe changes nothing this run —
`D-MAINT.6-1` / `D-SPA.*-1` rows stay OPEN unchanged.

## 0b — Inherited chain debt

None closed this run. `D-OPS.1-1` + `D-MAINT.6-1` blocker-updated (the SPA.26 re-probe),
all stay OPEN; the `D-SPAF.*` rows stay OPEN behind the operator merge+deploy
prerequisite. **New row:** `D-SPA.26-1` — the REQ-SEQ-10 entry gate (all 14 prod flips
merged + ≥1 nightly green since the last flip) recorded as this row's *activation*
precondition, per the 2026-10-08T19:12Z ruling (the gate binds merge/deploy order, not
PR authoring) and `D-SPAF.14-4`'s explicit naming of SPA.26 in the cleanup wave.

## 1 — Consumer trace (the load-bearing finding)

Before deleting anything, every live mount of the four named bundles was traced:

| entry | mount (emitted by) | verdict |
|---|---|---|
| `landing` | `marketing.tsx` landing; `pages.tsx` `/app/new` + held-consumed legs | **STAYS** — public pages are forever-SSR |
| `page` | `packages/ui/src/page-editor.tsx` (`embeds ?? true` → embeds + island tag); rendered by the Page family on **every** SSR document — including the forced-SSR arm | **STAYS** — REQ-ED-12's forced-SSR path (`server.ts:4479` `!isPhoneRequest(c) && row.showcase !== true`) is flag-independent forever; the island's read-only PM mount is design/23 OQ5's adopted arm (decorations parity), and `D-SPAF.14-3` names it the flag-rollback collab arm (same `client/collab.ts` wire, REQ-ISL-4) |
| `ide` | `render.tsx` — emitted whenever `data.ide != null` (every IdeFrame doc, forced-SSR arm included; `ideContext` always returns the `ide` bag) | **STAYS** — the SSR IDE shell's pane/theme/menu/palette/feed enhancement; the `?ssr=1` escape + flag-off renders still mount it |
| `outline` | `pages.tsx` — `<script src="/assets/outline.js">` on the editable `/p/:slug/outline` SSR page only | **RETIRES** — the SPA leaf (`spa/surfaces/outline.tsx`, SPA.18) owns the debounced `ed.*` save outright; the SSR page's surviving fallback is the explicit-Save form posting the same `ed.*` grammar (REQ-ISL-11's floor) |
| `editor` | none — unrouted since P1.02; source + entry retired at SPA.24 | **CONFIRMS retired** — residual cleanup = the census-F8 manifest guard |

The ticket's premise "islands no longer reachable" therefore holds for `outline` +
`editor` and **fails for `page` + `ide`** — those mounts are not migration leftovers;
they are the designed forever-SSR posture. Retirement is scoped to surfaces whose SPA
path replaced the island (the run's governing semantic), so the entries a forever-SSR
leaf still loads STAY. → **ADR-107**.

## 2 — What landed

- **`apps/web/client-entries.mjs`** — `["ide","page","outline","landing"]` →
  `["ide","page","landing"]`; the comment now names the permanent SSR island set and the
  "an entry leaves only when nothing served can mount it" rule.
- **`apps/web/src/client/outline.ts`** — deleted (the autosave island; self-contained
  entry, no importers).
- **`apps/web/src/pages.tsx`** — the editable outline page drops the
  `/assets/outline.js` tag and the island's mount attributes (`data-autosave`,
  `data-label-saving|saved|failed`); `data-outline-editor` stays as the form's
  renderer-shared identity (the SPA leaf emits it too). The form POST, `ed.*` grammar,
  delete affordance, `?saved=1` flash, and the cited-outline arm are untouched.
- **`apps/web/build-client.mjs`** — header comment corrected (no `editor.ts`; the
  surviving set named; Vite owns the SPA bundle, never this file).
- **`apps/web/src/dom-contract.ts`** — `outline` block header + three rows' emitted-by
  columns updated (`data-autosave`/`data-autosave-status` → leaf-owned;
  `data-outline-editor` gloss → "the outline edit form"). Every row still emitted +
  asserted (the leaf emits all three).
- **`apps/web/src/spa/surfaces/outline.tsx`** — comment corrected (the label leaves are
  leaf-emitted vocabulary now, not "SSR'd").
- **`apps/web/src/asset-parity.test.ts`** — retargeted (REQ-TL-13/REQ-TST-8), 4 → 8
  tests: entry↔source parity; `/assets/<x>.js` reference scan now recursive over
  `src/**` (covers `spa/`); an explicit retired-set leg (`outline`+`editor` — absent
  from entries, absent from every emitted reference, 404 on the route even if a stale
  artifact sits on disk); the per-entry serve leg; the unknown-name 404; and a NEW
  manifest leg — a tmpdir `spaAssetRoot` fixture (entry + imported chunk + dynamic
  chunk + css + a planted `.map`) proves every manifest artifact answers
  `/assets/spa/<file>` with the right content-type, every `/assets/spa/` URL the shell
  document emits resolves 200, and `.map`/non-`assets/`/`..`-segment shapes all refuse.
- **`apps/web/src/outline-surfaces.test.ts`** — the editable-page assert flipped: no
  `outline.js` tag, no `data-autosave`/`data-label-*`, the form + POST contract intact.
- **`apps/web/src/routes.test.ts`** — census-F8 guard: no manifest row under `/edit/`;
  `matchAppRoute("/p/…/edit/d_1")` undefined (the GET stays a server-owned 302 — the
  `editorElement` row and `editor.js` stay gone; transports live server-side).
- **`packages/journeys/src/runner.ts`** — the asset ledger widened from
  `/assets/[^/]+\.js$` to every same-origin `/assets/` path — the Vite bundle's nested
  `/assets/spa/assets/*.{js,css,…}` urls are now captured (REQ-TL-13 verbatim ask).
- **`packages/journeys/src/steps.ts`** — `assertBundleParity` keys the content-type
  assert per extension (a `ASSET_CONTENT_TYPE` map mirroring the server's
  `SPA_ASSET_TYPES` + the island routes' `text/javascript`); 200-or-flag holds for all.
- **`docs/tickets/DEFERRALS.md`** — `D-SPA.26-1` appended (entry-gate activation).
- **`docs/adr/ADR-107-forever-ssr-island-set.md`** + regenerated `docs/adr/README.md`.

## 3 — AC accounting

- **No route references a deleted bundle (parity test + server grep gate)** — MET,
  deterministic: the recursive source scan (`asset-parity.test.ts`) fails on any
  `/assets/<retired>.js` reference; the route leg proves `/assets/outline.js` +
  `/assets/editor.js` 404.
- **Entry gate: 14 flips merged + ≥1 nightly green (REQ-SEQ-10)** — DEFERRED to
  activation as designed: authored-dormant per the 2026-10-08T19:12Z ruling;
  `D-SPA.26-1` records it, `D-SPAF.14-4` already binds this cleanup wave's deploy.
- **Public islands still build + serve** — MET: `landing` stays in `CLIENT_ENTRIES`;
  `marketing.test.ts` + the parity serve leg green; `turbo build` emits it.
- **Parity regex covers surviving entries + `public/spa` manifest** — MET:
  runner capture + per-extension content-type assert + the manifest-leg tests.
- **Universal phase-gate AC** — MET: verification green; every new behavior has a
  removal-detecting test; REQ ids stamped in `pr/SPA.26.md`; `D-SPA.26-1` ledgered;
  ADR-107 written for the owned deviation; BUILD_INDEX + LEDGER advanced; dates from
  the clock; PR checks read once at closeout (below); append-only honored.

## 4 — Verify (all run this session)

- `pnpm turbo build lint typecheck` — **135/135 tasks** green.
- `pnpm test` — **5,622 pass / 6 skip / 0 fail** (487 files; +4 net vs SPA.25's 5,618 —
  the parity pack grew 4 → 8 and routes gained one; the outline file count holds).
- `pnpm check:dom-contract` — OK (outline 33/33 emitted+asserted; full manifest green).
- `pnpm check:spa-budget` — OK, all ceilings held.
- `pnpm check:licenses` — OK (822 packages).
- `pnpm check:protocol-markers` — OK (248 public-facing files scanned).
- `pnpm check:no-cookies` — OK (253 files scanned).
- `pnpm check:spa-env` — OK (111 client sources, 146 artifacts).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — see
  § Validators below.
- `node docs/build/tools/check-append-only.mjs --base 81cbe38` — see § Validators.

## 5 — Deviations / owned decisions

1. **Scope narrowed vs the ticket's literal goal (ADR-107).** `page` + `ide` are NOT
   deleted: the forced-SSR forever path and the `?ssr=1` fallback still mount them —
   they are permanent SSR islands alongside `landing`, not migration leftovers.
   `outline` retires fully (source, entry, mount tag, mount attrs); `editor` stays
   retired. Consequence recorded honestly: this PR is a *partial* retirement —
   "entries deleted" reads as `outline` (+ `editor` already), with the rule "an entry
   leaves `CLIENT_ENTRIES` only when nothing served can mount it" now written into
   `client-entries.mjs`.
2. **`data-autosave`/`data-label-*` stripped from the SSR outline form** — they were
   the island's mount contract; emitting them with no island would be untruthful.
   `data-outline-editor` kept as the renderer-shared form identity. The leaf still
   emits the whole set — dom-contract green.
3. **F8 cleanup verified, not re-done** — `routes.tsx` already carried no
   `editorElement`/edit row (SPA.24); this run adds the regression guard rather than
   re-editing landed comment text.

## 6 — Deferrals

Opened: `D-SPA.26-1` (the REQ-SEQ-10 entry gate binds this row's merge+deploy —
operator precondition, per the standing ruling). Closed: none. `D-OPS.1-1` /
`D-MAINT.6-1` / `D-SPAF.*` / `D-SPA.*` rows stay OPEN unchanged.

## 7 — PR checks read

(one read at closeout — result recorded here + in the follow-up commit)
