// HOT.1 (REQ-SPEC-29) — the browser-client entry list, the SINGLE source of truth both sides consume:
// `build-client.mjs` bundles `src/client/<entry>.ts` → `public/<entry>.js` for every entry, and
// `server.ts` serves `/assets/<entry>.js` from the same list. The dossier-500-era bug this closes: page.ts
// was built but never routed (built ⇒ served is enforced by asset-parity.test.ts).
//
// SPA.24 (REQ-ED-16) — the `editor` row dropped with its source (`src/client/editor.ts` + the
// sync-machine) — the source-editor surface was unrouted since P1.02.
// SPA.26 — `outline` retired: the SPA `outline` leaf owns autosave (Query mutation on the same
// `ed.*` grammar), and the SSR outline page's surviving form POSTs the same action — the no-JS
// floor stays the explicit Save button. `page` + `ide` do NOT retire: the REQ-ED-12 forced-SSR
// family (`isPhoneRequest || row.showcase` on the Page routes, plus the `?ssr=1` escape and every
// flag-off render) still mounts `page.js` (the read-only ProseMirror mount — findings/authorship
// decorations — and the flag-rollback collab arm, D-SPAF.14-3) and `ide.js` (the IdeFrame pane/
// theme/menu/palette enhancement). They join `landing` in the permanent SSR island set — an entry
// leaves this list only when NOTHING served can mount it (ADR-107).
export const CLIENT_ENTRIES = ["ide", "page", "landing"];
