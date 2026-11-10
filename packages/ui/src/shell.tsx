import type { ReactNode } from "react";

// The beta's flat dark shell (REQ-BETA-21 stopgap #2): a header, a centred single column, and an optional
// footer. No pane system — that arrives with the §5 design system (P1.01). Phone-width readable: the column
// is width-capped with a side gutter and the header wraps.

export function Shell({
  brand,
  tagline,
  nav,
  children,
  footer,
}: {
  brand: string;
  tagline?: string;
  nav?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}): ReactNode {
  return (
    <div className="ui-t-vh" style={{ display: "flex", flexDirection: "column" }}>
      <header
        className="ui-c2-g3 ui-t-p1216 ui-d-rc"
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--shell-border)",
        }}
      >
        <a href="/" className="ui-d-b ui-t-f16 ui-t-fg" style={{ textDecoration: "none" }}>
          {brand}
        </a>
        {tagline ? <span className="ui-t-mut ui-d-fd">{tagline}</span> : null}
        {nav ? (
          <nav className="ui-d-mla ui-c2-g3" style={{ display: "flex", alignItems: "center" }}>
            {nav}
          </nav>
        ) : null}
      </header>
      <main
        className="ui-vc-w ui-t-mw880 ui-t-m0a ui-t-p2416"
        style={{ flex: 1, boxSizing: "border-box" }}
      >
        {children}
      </main>
      {footer ? (
        <footer
          className="ui-t-p16 ui-t-fnt ui-d-fs"
          style={{ borderTop: "1px solid var(--shell-border)", textAlign: "center" }}
        >
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

/** The one page-level heading for the flat shell (UX.1 — exactly one `<h1>` per document). */
export function PageTitle({ children }: { children: ReactNode }): ReactNode {
  return <h1 className="ui-t-f20 ui-d-b ui-t-m04 ui-t-fg">{children}</h1>;
}

/** A quiet section heading — `<h2>` (UX.1): it used to render `<h1>`, which put a second page-level
 *  heading on every document the landing's hero or a section strip carried. */
export function SectionTitle({ children }: { children: ReactNode }): ReactNode {
  return <h2 className="ui-t-f20 ui-d-b ui-t-m04 ui-t-fg">{children}</h2>;
}
