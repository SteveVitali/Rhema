// 220a R7DEM.4b (REQ-DWEB-11/14/16; S-14) — the demo banner: the read-only notice sentence
// plus the demo's exits. Every exit is a DOCUMENT navigation — `data-spa-native` opts the
// anchor out of the click interceptor and `data-demo-exit` marks the hook the DOM contract +
// the legs assert. `signedIn` (cookie presence only — never an authorization fact) picks the
// CTA set: a signed-out visitor gets the funnel exits, a signed-in one gets the way back to
// the workspace.

import type { ReactNode } from "react";
import { COPY } from "../copy.js";
import type { SpaBoot } from "./boot.js";

export function DemoBanner({ demo }: { demo: NonNullable<SpaBoot["demo"]> }): ReactNode {
  return (
    <div
      data-demo-banner
      role="note"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
        padding: "6px 14px",
        fontSize: "12px",
        background: "var(--shell-raised)",
        borderBottom: "1px solid var(--shell-border)",
        color: "var(--shell-fg-muted)",
      }}
    >
      <span>{COPY.demo.bannerText}</span>
      <span style={{ marginLeft: "auto", display: "flex", gap: "12px" }}>
        {demo.signedIn ? (
          <a href="/app" data-spa-native data-demo-exit="back" style={{ color: "var(--accent)" }}>
            {COPY.demo.exitBackToProjects}
          </a>
        ) : (
          <>
            <a
              href="/signup"
              data-spa-native
              data-demo-exit="signup"
              style={{ color: "var(--accent)" }}
            >
              {COPY.demo.exitSignUp}
            </a>
            <a
              href="/login"
              data-spa-native
              data-demo-exit="signin"
              style={{ color: "var(--accent)" }}
            >
              {COPY.demo.exitSignIn}
            </a>
          </>
        )}
      </span>
    </div>
  );
}
