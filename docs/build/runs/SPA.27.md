# SPA.27 — run ledger: SSR deletion wave (REQ-TST-1/6/9, REQ-BND-1, REQ-SEQ-11 conclusion)

- **Ticket:** `docs/tickets/138_SPA.27__ssr-deletion-wave.md` (manifest row 138)
- **Branch:** `stevevitali/spa-27-ssr-deletion-wave` — forked from
  `stevevitali/spa-26-island-retirement` (the requested chain tip). The run resumed a
  killed mid-session WIP commit `95a809d` ("wip(spa-27): SSR deletion wave partial"),
  audited it for real (§ 0b), and completed the wave on top.
- **PR:** #160, opened at closeout against `stevevitali/spa-26-island-retirement`;
  `gh pr checks --watch=false` read once at closeout (§ 7).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 0b — Inherited WIP audit (commit `95a809d`)

The resumed session inherited `95a809d`, a partial deletion commit ("killed mid-run").
The audit walked it before continuing:

- `server.ts` hunks — every flipped authenticated document handler already ended in a
  single `spaShellDocument(...)` leg with `// SPA.27 — sole renderer: the shell …`
  stamps; no half-deleted render arm survived. The forced-SSR arms were intact
  (`server.ts:3929` project home; the Page-family per-route checks at the
  `/v/:v`/`/v/:n/diff/:m`/`/a/:artifactId`/`/revisions/:cid` handlers).
- `pages.tsx` — already shrunk to the surviving set (footer, `PhoneBlockedNote`,
  `IdeFrame`, `InvitePage`, `LoginPage`, `ProjectPage`, `NotFoundPage`,
  `RevisionPage`, `ComparePage`, `PageSurface`/`PagePage`): 486 lines vs ~4,448 at
  base.
- `routes.tsx` — flipped rows carried `element: null` (`SPA_ONLY`) with the
  "re-adding an element does not restore a render" pin.
- `spa-flag.ts` — leg (c) already unconditional; session gate + override legs intact.
- What the WIP lacked: the test-migration wave (78 failures across 25 files — the
  parity/HTML-string suites still asserted deleted markup) and all closeout artifacts.

## 1 — What landed

- **Server handlers (server.ts, net −1,519 lines vs base incl. the WIP).** The 14
  flipped surfaces' GET document paths serve `spaShellDocument` unconditionally:
  `/app`, `/app/inbox`, `/app/new`, `/p/:project/import`, `/p/:project/run`,
  `/p/:project/review/:runId`, `/p/:project/r/:runId`, `/p/:project/outline` +
  `/outline/promote`, `/p/:project/figures` + `/figures/:figureId`,
  `/p/:project/visualize`, `/p/:project/obligations/new`, `/p/:project/settings`,
  `/p/:project/export`, `/voices`, `/voices/new`, `/v/:persona`,
  `/p/:project/voice/reseed`, the six `/app/settings/*` leaves + `/settings`,
  `/app/settings/billing` + `/settings/billing` + `/billing/return`, `/usage` +
  `/p/:project/usage`. The meta-refresh/poll documents (import progress, voice ingest)
  are deleted with them — a form POST follows the same poll URL the leaf polls.
  Form-mode POST failures now 302 back to the sheet URL (no SSR document exists to
  re-render); JSON envelopes and refusal statuses unchanged. Session gates and
  server-owned redirects precede the shell on every route.
- **The surviving SSR set is exactly what the contract requires.** Public funnel
  (`/`, `/invite`, `/pricing`, `/signup`, `/login`, `/showcase`), the Page family on
  its forced-SSR arms (phone/showcase/`?ssr=1` → read-only SSR document mounting
  `page.js` + `ide.js` per ADR-107), `RevisionPage`, `ComparePage`, `NotFoundPage`.
  `page.js`/`ide.js` entries and routes untouched.
- **`spa-flag.ts` (§ consult).** `createSpaConsult` leg (c) returns `true` — the
  flag-on set is the whole authenticated document set; REQ-SEQ-2's IDE-framed
  AND-gate is vacuously satisfied. The session re-check inside the consult,
  `ssrOverrideRequested` (`?ssr=1`, `x-rhema-renderer: ssr` — factored out so the
  Page forced-SSR arm shares the same signals), and the `SPA_OVERRIDES`-gated
  force-spa forms all stay. `deps.surfaces` remains plumbed-but-unread (the deploy
  fact stays for the roll-forward record; SPA.28 removes the machinery).
- **`routes.tsx`.** `SPA_ONLY = null` on every flipped row; the header comment pins
  that re-adding an element restores no render.
- **Test migration (the run's bulk).** 42 files, +1,800/−8,275 vs base —
  deletion-dominated; ~82% of the churn is removals. Per `research/04` 's disposition
  map: HTML-string asserts on deleted documents were ported to `/bff/...` payload
  contracts (billing, settings, outline/promote, figures, findings/dossier, inbox,
  voices/ingestion, export, usage, analytics), shell/boot contracts (shell metadata,
  `data-device` boot, `?saved`/`?notice` URL flash state), redirect/refusal contracts
  (form-mode failures → 302 to the sheet URL; `marketing.test.ts` now asserts
  shell/redirect precedence), and the REQ-TST-2 SSR/SPA parity blocks were retired
  from 14 `spa/*.dom.test.tsx` suites (the SSR premise is gone — parity would assert
  a deleted render). `paywall.test.ts`'s scan roots were made
  working-directory-correct (Vitest runs from `apps/web`).
- **Removal-detecting tests (the wave's resurrection tripwires).**
  `spa-shell.test.ts` — flag-off still serves the shell on a flipped surface and
  SPA-prefixed deep links reach the shell flag-independent;
  `ide-surfaces.test.tsx` — flipped manifest rows are `element: null`;
  `routes.test.ts` — a resurrected element row would shadow the redirect;
  `asset-parity.test.ts` — retired bundle names 404 even with a stale artifact on
  disk; `page.test.ts` — `?ssr=1` + showcase Page SSR verbatim (`data-page-root`,
  embeds, island tag, read-only arm);
  `inbox-phone.test.ts` — migrated surfaces serve the shell carrying
  `data-device="phone"` while the project home stays forced-SSR (no `id="spa-root"`,
  affordance links dropped server-side).

## 2 — AC accounting

- **No render path for flipped surfaces; requests answer via the shell** — MET:
  `server.ts` handlers are shell-only (per-route SPA.27 stamps); `pages.tsx` has no
  subtree for them; `routes.tsx` rows are `element: null`; the shell-served pins
  assert `id="spa-root"` + boot device class.
- **Retired test legs gone / ported; remaining suite green; coverage not silently
  dropped** — MET: `pnpm test` 5,554 pass / 6 skip / 0 fail across 487 files; the
  ported BFF asserts cover the same composition facts the HTML strings asserted
  (`/bff` payloads are the documents' own view contracts — REQ-TST-6's
  component/twin coverage, not deleted coverage).
- **Forced-SSR phone/showcase still serves SSR** — MET: the Page-family arms are
  preserved verbatim and asserted (`page.test.ts` `?ssr=1`/showcase legs,
  `inbox-phone.test.ts` phone-vs-shell distinction).
- **Universal phase-gate AC** — MET: verification green; removal-detecting tests
  listed above; REQ ids stamped in `pr/SPA.27.md`; `D-SPA.27-1` ledgered; BUILD_INDEX
  + LEDGER advanced; dates from the clock; PR checks read once at closeout;
  append-only honored.

## 3 — Verify (all run this session)

- `pnpm turbo build lint typecheck` — **135/135 tasks** green.
- `pnpm test` — **5,554 pass / 6 skip / 0 fail** (487 files).
- `pnpm --filter @rhema/web exec eslint src` — clean (the parity-retirement fallout —
  ~25 unused imports/constants across the dom suites + voice-surfaces — removed).
- `pnpm check:licenses` — OK (822 packages).
- `pnpm check:protocol-markers` — OK.
- `pnpm check:no-cookies` — OK (253 ingestion-surface files scanned).
- `pnpm check:spa-budget` — OK, all ceilings held.
- `pnpm check:spa-env` — OK (111 client sources, 146 emitted artifacts).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — see
  § Validators.
- `node docs/build/tools/check-append-only.mjs --base b90b3aa` — see § Validators.

## 4 — Deviations / owned decisions

1. **Churn is ~10.1k changed lines vs the ~4,000 planning estimate** —
   deletion-dominated (+1,800/−8,275; `pages.tsx` alone −3,962). The estimate assumed
   the ~300 HTML-string test legs would be *deleted*; the disposition map actually
   directs most of them *ported* to BFF/shell/redirect contracts, and porting writes
   new asserts. Recorded as a budget note, not a defect — the ticket's operative
   clause ("deletion-dominated"; split only "if the diff still overflows a
   fresh-context run") is satisfied.
2. **Form-mode refusal semantics changed shape honestly.** Where a POST failure used
   to re-render the SSR sheet with the error inline, the handler now 302s back to the
   sheet URL — there is no document left to re-render. The leaf recomposes the same
   failure affordance off the twin; tests assert the redirect + preserved status on
   the JSON legs.
3. **Parity blocks retired, not stubbed.** The REQ-TST-2 SSR↔SPA parity legs in the
   14 dom suites asserted a render that no longer exists; they were removed with
   their now-dead fixtures rather than rewritten to a false premise.

## 5 — Deferrals

Opened: `D-SPA.27-1` — the REQ-SEQ-10 entry gate binds this row's merge+deploy
(operator precondition; `D-SPAF.14-4` already names SPA.27 in the cleanup wave, and
this row carries the strongest posture: after merge+deploy there IS no SSR fallback
document to serve). Closed: none. `D-OPS.1-1` / `D-MAINT.6-1` / `D-SPAF.*` /
`D-SPA.*` rows stay OPEN unchanged.

## 6 — Validators

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` —
  **no violations (7 warnings, all pre-existing classes):** manifest banner/row-order
  advisories, the `nextTicket`-vs-`GATE-G2` note (G2 is operator-deferred), PHASE LOG
  >2 KiB entry budget (structural — the chain's entries run long), legacy
  live-verification vocabulary in old BUILD_INDEX rows, pre-guard readouts, and old
  run ledgers lacking a Harness line (this ledger carries one).
- `node docs/build/tools/check-append-only.mjs --base b90b3aa` — **OK** (history
  only grew).

## 7 — PR checks read

`gh pr checks 160 --watch=false` (2026-10-10T05:32Z, on impl tip `450c108`) →
**`typecheck / lint / unit` — pending** (run `38027836714`). The same first-reported
check status as SPA.24–SPA.26's reads; the inherited `integration`/privsep red, if it
reports later, is waived per GD-MAINT.4-1 (classified, not repaired).
