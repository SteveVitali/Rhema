# 222 R7DEM.6a — public-ssr-baseline local before/after compare

- **Before:** `../2026-11-04_r7dem-6a-public-ssr-baseline-before/` — local `apps/web` server built
  from the base `stevevitali/r7dem-5b-hub` (worktree, `a273375c`), `API_BASE_URL` dead port.
- **After:** this dir — the same local serve on `stevevitali/r7dem-6a-tour`.
- **Warnings:** identical on both sides (`/login` "private beta" copy warn, `/showcase`
  missing sample-dossier text) — pre-existing local-mode artefacts, not new deltas.

## Enumerated deltas (all intended — REQ-TOUR-4's document-navigation entries)

| route | delta |
|---|---|
| `/` | +2 `data-demo-entry` — the hero secondary CTA "See it on four real essays →" (`landing`) + the shared footer "Demo" (`footer`) |
| `/showcase` | +2 `data-demo-entry` — "For the full record … Open the demo →" (`showcase`) + the shared footer "Demo" (`footer`) |
| `/pricing`, `/login`, `/signup` | +1 `data-demo-entry` — the shared footer "Demo" (`footer`) |

Every semantic field in `baseline.json` (title, h1 count, renderer markers `data-renderer="ssr"`,
`data-route`, `data-mounted`, `spaRoot:false`) is unchanged; only `normalizedSha256`/`bytes`
moved — the link bytes themselves. `data-renderer` stays `ssr` on every public route (no renderer
flip leaked into the public set).
