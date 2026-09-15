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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "12px",
          padding: "12px 16px",
          borderBottom: "1px solid var(--shell-border)",
          background: "var(--shell-surface)",
        }}
      >
        <a href="/" style={{ fontWeight: 600, fontSize: "16px", color: "var(--shell-fg)", textDecoration: "none" }}>
          {brand}
        </a>
        {tagline ? <span style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{tagline}</span> : null}
        {nav ? <nav style={{ marginLeft: "auto", display: "flex", gap: "12px", alignItems: "center" }}>{nav}</nav> : null}
      </header>
      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "880px",
          margin: "0 auto",
          padding: "24px 16px",
          boxSizing: "border-box",
        }}
      >
        {children}
      </main>
      {footer ? (
        <footer
          style={{
            padding: "16px",
            borderTop: "1px solid var(--shell-border)",
            color: "var(--shell-fg-faint)",
            fontSize: "12px",
            textAlign: "center",
          }}
        >
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

/** A quiet section heading for the flat shell. */
export function SectionTitle({ children }: { children: ReactNode }): ReactNode {
  return (
    <h1 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 16px", color: "var(--shell-fg)" }}>{children}</h1>
  );
}
