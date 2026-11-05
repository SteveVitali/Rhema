# R7DEM.5 — Demo mode side effects (recording proxy) + labels + lazy tour seam + D3.readonly

Base: `stevevitali/r7dem-4b-demo-spa` — Ticket: `docs/tickets/221_R7DEM.5__demo-mode-hub.md`
Run ledger: `docs/build/runs/R7DEM.5.md` — Deferral: `D-R7DEM.5-1` (OPEN — Stage B owed to 224)

## What ships

- **The recording proxy** (`packages/journeys/src/demo-side-effects.ts`): bundled Chromium walks
  every `DEMO_DOCUMENT_ROUTE_ID` × essay × {logged out, planted cookie} × {desktop, phone}
  against a local `dist/main.js` serving `demoDataSource`. GET/HEAD-only allowlist (plus the
  REQ-TOUR-9 `POST /a/demo`); EventSource/WebSocket opens, out-of-allowlist requests, and
  same-origin 4xx/5xx are hard violations; a negative leg injects `POST /a/dwell` and proves
  the recorder fails; a `RHEMA_DEMO_DS_TRACE` seam reports the DataSource methods the walk
  reached (implemented-only: reach == `demoDataSource`'s Pick — `checkSession` +
  `postAcquisitionEvent` left the Pick per DWEB-3's amended contract). The regenerated table
  is committed: `docs/demo-side-effects.md` (0 violations across 4 walks) + artifacts in
  `docs/build/reports/demo-side-effects/`; the CLI (`demo-side-effects.js --base <url>`) is
  the 224/221a/222/R7TOUR.2 re-run entry point.
- **Effect gates**: feed EventSource, dwell beacon, showcase beacon, gate-presence, controller
  POSTs + sheet/run-next chords, `/doc` poll, ⌘S restore point (no-op + honest read-only
  pill — never the "syncing" lie), out-of-scope `/run` navigations withheld
  (`timelineHrefs.nextStep`/`verbHref`, the overview next-step card), `DemoEffects`
  capture-submit backstop → `data-demo-readonly-notice`.
- **The lazy tour seam**: `spa/demo-tour.ts` behind `import()` in `chrome.tsx` — the table
  proves it ships as its own `demo-tour-*.js` chunk.
- **Labels/markers**: replayed-run arms on run-card + run-report ("Replayed from the
  agent-discourse record", "inferred from the delivered files", "approvals not recorded",
  absent time/credits/model → "not recorded", never fabricated zeros); `rewriteDemoDocLinks`
  — `notPublishedRefs` → labelled non-links; `assetRefs` → the demo asset route; external
  `https?://` image srcs → corpus-copy rewrite or " (not published)" (the real corpus'
  essays carry Substack-hosted URLs — the proxy caught 25 fetches); `DemoLedgerDecisions`
  renders response-ledger escalations through existing Decisions vocabulary.
- **Honesty fixes the walk found**: `--`-flattened artifactIds (`/a/` is single-segment),
  `FileRowDto.figureId` + `hrefs.figure` arm (binary figure rows link the card, not a 404).
- **`D3.readonly` real leg body** in `r7legs.ts`: anon + `returningUser("a")` over every
  registered essay — zero non-GET, zero ES/WS, zero 4xx/5xx, no mutation forms, no
  contenteditable; twin-derived seeds cover every route shape the corpus actually holds.
  Stays `expected:"red"` (ready-to-flip); local green in `demo-readonly.local.test.ts` with
  committed screenshots `docs/build/reports/2026-11-04_r7dem-5-legs/`.

## Verification (Stage A only, $0)

- `turbo build lint typecheck` 138/138 · `pnpm test` — 4 failures on first pass, all fixed
  (registry/runner real-body census, read-only source pin, spa-env reader rule) and
  re-verified green individually · `check:dom-contract`/`check:spa-env`/`check:spa-budget`
  green · `demo-side-effects.local.test.ts` 3/3 ×2 (222s) · `demo-readonly.local.test.ts`
  green (182s) · `demo-effects.dom.test.tsx` 12/12 · `demo-bundle.test.ts` green.
- **Owed**: `D-R7DEM.5-1` — preview walk + flip of `D3.readonly` at 224's R7a deploy.
