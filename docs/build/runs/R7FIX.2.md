# R7FIX.2 — fix the two R7DEP.1 owed legs (U3.stopgap occlusion + R8.showcase.spa nav) (run ledger)

- **Ticket:** `docs/tickets/223c_R7FIX.2__demo-leg-defects.md` (insert row 223c, round 7 / R7a)
- **Base:** `stevevitali/r7dep-1-r7a-deploy` @ `ff1baff4b09d188f3ec36e4f484bfde8d485c1c9` (chainTip)
- **Branch:** `stevevitali/r7fix-2-demo-legs` — PR base `stevevitali/r7dep-1-r7a-deploy` (mergePolicy OPERATOR)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills`
- **Started:** 2026-11-05T00:26Z (`date -u`) · **Closed:** (open)
- **Live stage:** Stage A + pr-259 preview re-walk ($0 legs; preview already up per operator
  context — spend counts to 224's $20 round cap measurement). No new preview, no prod mutations.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows this run owns + closes with preview evidence:

- **D-R7DEP.1-1** (`U3.stopgap` occlusion @1440) — OPEN → fix + re-walk four sizes.
- **D-R7DEP.1-2** (`R8.showcase.spa` client-nav mechanism) — OPEN → fix + re-walk.
- Progress-only arms (stay OPEN; their owner rows note the new evidence): D-R7OPEN.1-1 (leg
  flips), D-R7FIX.1-1 (U3.stopgap flip), D-R7RO.1-1 (R8.showcase.spa flip) — this insert is the
  sanctioned flipper's fix; the flips themselves land here per the ticket's flip clause.

## Requirements (ticket)

1. Root-cause both defects at source — no overlay hacks, no recorder suppression.
2. `U3.stopgap` green on pr-259 at 1440/1280/1024/820 (live-executed + screenshots).
3. `R8.showcase.spa` green on pr-259 — dossier→review a client nav (live-executed).
4. Recording proxy still clean; no regression on other demo legs (fixture-verified).
5. D-R7DEP.1-1 + D-R7DEP.1-2 closed with preview evidence.
6. verification green; DEFERRALS updated; BUILD_INDEX row; LEDGER advanced.

## Root causes (proven live on pr-259 @ `4f66cebc`, cached jrn-a session, Playwright probes)

**D-R7DEP.1-1 — the `<span class="">` is `.ide-statusbar`'s first child (the run-label span,
e.g. "Review of v1").** `.ide-desk` opens with `height var(--dur-pane)` 0→280 px. While the
drawer's box is shorter than its head (~25 px — the first ~9 % of the transition), the head
overlays the statusbar's row below the box; `.ide-statusbar` follows `.ide-desk` in DOM order in
the same stacking context, so its span wins `elementFromPoint` at the tab's center. Reproduced on
the preview: `deskH=1, cy=889` → `<span class="">Review of v1`; `deskH≥28` → clean. The leg's
assert samples inside that window on the remote preview — deterministic ×2. Also a real UX
defect: the desk head is unclickable for the first ~25 px of the open animation.
**Fix (source):** `.ide-desk-head` gets `position: relative; z-index: 1` — the drawer's head
paints/hit-tests above the statusbar (B2 contract: "the Desk head stays actionable — the status
bar may never cover it"). Transient: the head row covers the bar's top hairline for ~50 ms —
correct drawer behavior. (`overflow:hidden` alone was evaluated and rejected: the button's layout
rect still centers inside the bar → the assert would still read the bar's span.)

**D-R7DEP.1-2 — the dossier's first `a[href*="/review/"]` is a SELF-link**
(`data-delivered-link="dossier"` → the bare current URL). The interceptor DOES intercept
(`preventDefault` proven by a wrapped-preventDefault stack trace into `handleSpaClick`'s commit);
`router.navigate({href})` then hits TanStack `commitLocation`'s `isSameLocation` arm → a silent
`this.load()` — no committed transition, `data-nav-count` stays 0 (verified: identical-href
navigate → no-op; `?x=1` → commits; `router.history.push(sameHref)` → nav-count 0→1, `data-mounted`
restored, zero document loads). The 224 record's "document navigation" was an inference — the
runner's `documentLoads` never incremented: it is a **dead click** (three such self-links on this
page: "Dossier", "Open the delivered review", "Clear").
**Fix (source):** in `handleSpaClick`'s commit step, an in-tree anchor whose resolved href is
identical to the current location commits through `router.history.push(href)` — minting a new
location key, i.e. a real in-document transition (native-reload parity: a same-URL click must
navigate, not die silently). Everything else is unchanged (`router.navigate` push-only).

## Plan

1. `packages/tokens/src/ide-css.ts`: `.ide-desk-head` z-index lift (+ B2 comment); extend the
   harness/test pin for the head-above-statusbar contract.
2. `apps/web/src/spa/nav-intercept.ts`: identical-location commit arm (+ comment); guard-table
   test for same-URL commit.
3. Rebuild, redeploy pr-259 at the new head, re-walk the two legs → screenshots → flip
   `expected:"green"` → close the two D-rows → records + PR.

## Test matrix

| Spec item | Test |
|---|---|
| desk head hit-tests above the statusbar during open transition | `intercept`/`ide` dom test or css pin: `.ide-desk-head` positioned above `.ide-statusbar`; live U3.stopgap re-walk |
| same-URL in-tree click commits a client transition | `intercept.dom.test.tsx`: identical-href anchor → `history.push` (transition commits, never dead) |
| both legs green on pr-259 | live: `cli.js --steps U3.stopgap,R8.showcase.spa --web <pr-259> --expect-sha <new head>` |
| recording proxy clean / no leg regression | `demo-side-effects` re-run or prior committed zero-violation run + local suites |
| verification | `pnpm turbo build lint typecheck` + `pnpm test` (touched packages); `check-build-memory.sh`; `check-append-only.mjs --base stevevitali/r7dep-1-r7a-deploy` |

## Progress

- 2026-11-05T00:13Z — ticket/DEFERRALS/LEDGER/224-run-record read; both report.json errors
  confirmed verbatim.
- 2026-11-05T00:2xZ — live probes on pr-259 (cached jrn-a session `.journeys-state/
  test_jrn_a_rhema_tools.json`, cookie valid ~2026-11-11): D-1 reproduced
  (`deskH=1 → <span class="">Review of v1` over the chat tab; clean at ≥28); D-2 reproduced
  (self-link dead click — `defaultPrevented` by the interceptor + `isSameLocation` dedupe;
  `documentLoads` never moved → NOT a document nav). `history.push` commit verified live
  (`__TSR_ROUTER__.history.push(sameHref)` → nav-count 0→1, `data-mounted` restored, docLoads 1).
- Branch cut at `ff1baff` (r7dep-1 head). Fixes landed:
  - `packages/tokens/src/ide-css.ts` — `.ide-desk-head { position:relative; z-index:1 }` + B2 comment.
  - `apps/web/src/spa/nav-intercept.ts` — identical-location arm: `href === router.latestLocation.href`
    → `router.history.push(href)` (compare to `latestLocation.href`, the same value
    `isSameLocation` uses — `window.location` drifts in test envs).
  - Tests: `tokens.test.ts` desk-head stacking pin; `intercept.dom.test.tsx` same-location arm
    (arm-level asserts; commit proven live — memory-history env doesn't mint keys).
- VERIFY STATE: `pnpm turbo build --filter=@rhema/tokens... --filter=@rhema/web` green;
  `vitest run packages/tokens apps/web/src/spa` = **36 files passed**; `@rhema/web` typecheck+lint
  green; `@rhema/tokens` lint green.
- NEXT (resume here): commit + push → new head SHA → preview redeploy:
  `gcloud builds submit infra/cloudbuild/image-set.yaml --substitutions _TAG=r7fix-2,_AR=rhema-pr-259`
  at the head, then `preview-stack.mjs config pr-259` re-pin `rhema:serviceImages` /
  `rhema:runTaskImageDigest` / `rhema:proxyImage` / `rhema:gitSha` → `preview-stack.mjs up pr-259`
  (owned stack — pr-259 stays UP per operator). Re-walk:
  `node packages/journeys/dist/cli.js --web https://rhema-pr-259-web-4043971-tkbl73n3tq-uc.a.run.app
  --api https://rhema-pr-259-api-e2d977b-tkbl73n3tq-uc.a.run.app --invite-code prv-259-test
  --steps U3.stopgap,R8.showcase.spa --expect-sha <head> --out docs/build/reports/<date>_R7FIX.2`
  → flip `expected:"green"` in `packages/journeys/src/registry.ts` (+ census tests) →
  DEFERRALS D-R7DEP.1-1/-2 → DONE → BUILD_INDEX row 261 → LEDGER advance →
  `docs/build/pr/R7FIX.2.md` → `gh pr create --base stevevitali/r7dep-1-r7a-deploy` →
  `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R7FIX.2 --json docs/build/logs/ci-R7FIX.2.json`.

## Gap table

(pending — filled at Phase 4)

## Evidence log

(pending — filled at Phase 5)

## Evidence report

(pending — filled at Phase 6)
