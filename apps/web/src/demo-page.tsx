// R7DEM.4 (REQ-DWEB-9 server half; REQ-DWEB-2) — the two demo SSR documents: the `/demo` hub
// frame (an empty shell 221a's card surface fills) and the terminal read-only notice a non-GET
// demo write renders when the caller is not a JSON client. Both are plain public documents —
// they ride `renderDocument`'s N10 head contract and the single CSP nonce like every SSR page.

import { COPY } from "./copy.js";

/** The `/demo` hub frame — `data-demo-root` is the mount marker the DOM contract pins for 221a. */
export function DemoHubPage() {
  return (
    <main data-demo-root data-page-root>
      <section style={{ maxWidth: "720px", margin: "0 auto", padding: "96px 24px" }}>
        <h1 style={{ fontSize: "32px", marginBottom: "12px" }}>{COPY.demo.hubTitle}</h1>
        <p style={{ color: "var(--shell-fg-dim)", lineHeight: 1.6 }}>{COPY.demo.hubLede}</p>
      </section>
    </main>
  );
}

/**
 * The terminal notice for a demo write (REQ-DWEB-2): a form poster lands here at 405 — an honest
 * "this is a read-only demo" page, never the shell and never a silent failure.
 */
export function DemoReadOnlyPage() {
  return (
    <main data-demo-readonly-notice data-page-root>
      <section style={{ maxWidth: "640px", margin: "0 auto", padding: "96px 24px" }}>
        <h1 style={{ fontSize: "24px", marginBottom: "12px" }}>{COPY.demo.readOnlyTitle}</h1>
        <p style={{ color: "var(--shell-fg-dim)", lineHeight: 1.6 }}>{COPY.demo.readOnlyBody}</p>
      </section>
    </main>
  );
}
