// HOT.1 (REQ-SPEC-29) — the browser-client entry list, the SINGLE source of truth both sides consume:
// `build-client.mjs` bundles `src/client/<entry>.ts` → `public/<entry>.js` for every entry, and
// `server.ts` serves `/assets/<entry>.js` from the same list. The dossier-500-era bug this closes: page.ts
// was built but never routed (built ⇒ served is enforced by asset-parity.test.ts).
//
// SPA.24 (REQ-ED-16) — the `editor` row dropped with its source (`src/client/editor.ts` + the
// sync-machine) — the source-editor surface was unrouted since P1.02. The remaining island rows
// shrink with their own surfaces' retirements (SPA.26).
export const CLIENT_ENTRIES = ["ide", "page", "outline", "landing"];
