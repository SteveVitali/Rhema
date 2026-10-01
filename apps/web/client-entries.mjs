// HOT.1 (REQ-SPEC-29) — the browser-client entry list, the SINGLE source of truth both sides consume:
// `build-client.mjs` bundles `src/client/<entry>.ts` → `public/<entry>.js` for every entry, and
// `server.ts` serves `/assets/<entry>.js` from the same list. The dossier-500-era bug this closes: page.ts
// was built but never routed (built ⇒ served is enforced by asset-parity.test.ts).
export const CLIENT_ENTRIES = ["editor", "ide", "page", "outline", "landing"];
