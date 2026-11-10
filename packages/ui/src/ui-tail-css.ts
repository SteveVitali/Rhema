// `uiTailCss()` — the GUARD-1 migrate-tail stylesheet (248a_R7KIT.3f; REQ-KIT-3, REQ-GUARD-1,
// REQ-KIT-5). The residual 29-file census the stopped 249 run measured (340 diagnostics) migrates
// onto these `.ui-t-*` utilities plus the shared `.ui-*`/`.ui-d-*`/`.ui-c2-*` classes `uiCss()`
// already emits. It is a SECOND generated block, emitted beside `uiCss()` in `render.tsx` /
// `spa-shell.ts`, because the REQ-KIT-5 bound (`uiCss()` ≤ 24 kB raw per shell document, asserted)
// cannot be raised without a ruling — the tail rides its own bound below instead of growing the
// pinned block. Same generation discipline: one function emits every `.ui-t-*` rule, values come
// from the token layer (`var(--…)` where the literal equals a step — the spec's own "resolve onto
// the scale" bands cover 10.5–11→caption, 12–12.5→micro, 13–13.5→dense, 15–16→lead font sizes and
// the 4-pt spacing steps), literal values stay only where no step matches (2px paddings, 6/7/10-px
// radii, off-band font sizes). Dynamic values ride the same `--d-*` custom-property seam `uiCss()`
// uses (`--d-sev`, `--d-w`, `--d-w2`) — `style={{ "--d-sev": … }}` is the sanctioned inline channel
// for computed colours/weights/widths.
//
// Bound: inlined verbatim into the same documents as `uiCss()` — asserted ≤ 5 kB raw in
// `ui-css.test.ts` (measured 4,466 B at this head); the additions are sized against the measured
// census, not guessed.

export function uiTailCss(): string {
  return [
    // ---- type ----
    ".ui-t-f16 { font-size: var(--fs-lead); }",
    ".ui-t-f18 { font-size: 18px; }",
    ".ui-t-f20 { font-size: 20px; }",
    ".ui-t-f24 { font-size: 24px; }",
    ".ui-t-f32 { font-size: 32px; }",
    ".ui-t-f2e { font-size: 2em; }",
    ".ui-t-f85 { font-size: 0.85em; }",
    ".ui-t-lh5 { line-height: 1.5; }",
    ".ui-t-lh6 { line-height: 1.6; }",
    ".ui-t-ls5 { letter-spacing: 0.05em; }",
    ".ui-t-ls6 { letter-spacing: 0.06em; }",
    ".ui-t-w4 { font-weight: 400; }",
    ".ui-t-wd { font-weight: var(--d-w, 500); }",
    ".ui-t-ffs { font-family: var(--shell-font, inherit); }",
    ".ui-t-ffp { font-family: var(--font-paper, var(--font-shell)); }",
    // ---- colour ----
    ".ui-t-fg { color: var(--shell-fg); }",
    ".ui-t-mut { color: var(--shell-fg-muted); }",
    ".ui-t-fnt { color: var(--shell-fg-faint); }",
    ".ui-t-dim { color: var(--shell-fg-dim); }",
    ".ui-t-acc { color: var(--accent); }",
    ".ui-t-bgc { color: var(--shell-bg); }",
    ".ui-t-blk { color: var(--sev-blocking); }",
    ".ui-t-pf { color: var(--paper-fg); }",
    ".ui-t-pm { color: var(--paper-fg-muted); }",
    ".ui-t-fgp { color: var(--shell-fg, var(--paper-fg)); }",
    // ---- background ----
    ".ui-t-bga { background: var(--accent); }",
    ".ui-t-bp { background: var(--paper-bg); }",
    ".ui-t-brt { background: var(--shell-raised, transparent); }",
    ".ui-t-bsp { background: var(--shell-surface, var(--paper-bg)); }",
    // ---- radius ----
    ".ui-t-r1 { border-radius: var(--radius-1); }",
    ".ui-t-r2 { border-radius: var(--radius-2); }",
    ".ui-t-r3 { border-radius: var(--radius-3); }",
    ".ui-t-rp { border-radius: var(--radius-pill); }",
    ".ui-t-r6 { border-radius: 6px; }",
    ".ui-t-r7 { border-radius: 7px; }",
    ".ui-t-r10 { border-radius: 10px; }",
    // ---- margin shorthand ----
    ".ui-t-m01 { margin: 0 0 var(--s1); }",
    ".ui-t-m03 { margin: 0 0 var(--s3); }",
    ".ui-t-m04 { margin: 0 0 var(--s4); }",
    ".ui-t-m06 { margin: 0 0 6px; }",
    ".ui-t-m0a { margin: 0 auto; }",
    ".ui-t-m10 { margin: var(--s1) 0 0; }",
    ".ui-t-m20 { margin: var(--s2) 0 0; }",
    ".ui-t-m30 { margin: var(--s3) 0; }",
    ".ui-t-m40 { margin: var(--s4) 0; }",
    ".ui-t-m60 { margin: 6px 0 0; }",
    ".ui-t-m80 { margin: var(--s2) 0; }",
    ".ui-t-m408 { margin: var(--s1) 0 var(--s2); }",
    ".ui-t-m612 { margin: 6px var(--s3); }",
    ".ui-t-ma0 { margin: 10px 0; }",
    ".ui-t-ma00 { margin: 10px 0 0; }",
    ".ui-t-m280 { margin: 28px 0 0; }",
    // ---- margin longhands ----
    ".ui-t-mt0 { margin-top: 0; }",
    ".ui-t-mt2 { margin-top: 2px; }",
    ".ui-t-mt3 { margin-top: 3px; }",
    ".ui-t-mt32 { margin-top: var(--s8); }",
    ".ui-t-mb4 { margin-bottom: var(--s1); }",
    ".ui-t-mb6 { margin-bottom: 6px; }",
    ".ui-t-mb8 { margin-bottom: var(--s2); }",
    ".ui-t-mb12 { margin-bottom: var(--s3); }",
    ".ui-t-ml6 { margin-left: 6px; }",
    ".ui-t-ml8 { margin-left: var(--s2); }",
    ".ui-t-mr6 { margin-right: 6px; }",
    ".ui-t-mr16 { margin-right: var(--s4); }",
    ".ui-t-mre { margin-right: 0.4em; }",
    // ---- padding ----
    ".ui-t-p10 { padding: 1px 0; }",
    ".ui-t-p20 { padding: 2px 0; }",
    ".ui-t-p30 { padding: 3px 0; }",
    ".ui-t-p60 { padding: 6px 0; }",
    ".ui-t-p80 { padding: var(--s2) 0; }",
    ".ui-t-p02 { padding: 0 2px; }",
    ".ui-t-p012 { padding: 0 var(--s3); }",
    ".ui-t-p17 { padding: 1px 7px; }",
    ".ui-t-p24 { padding: 2px var(--s1); }",
    ".ui-t-p210 { padding: 2px 10px; }",
    ".ui-t-p39 { padding: 3px 9px; }",
    ".ui-t-p400 { padding: var(--s1) 0 0; }",
    ".ui-t-p410 { padding: var(--s1) 10px; }",
    ".ui-t-p412 { padding: var(--s1) var(--s3); }",
    ".ui-t-p4122 { padding: var(--s1) var(--s3) 2px; }",
    ".ui-t-p58 { padding: 5px var(--s2); }",
    ".ui-t-p510 { padding: 5px 10px; }",
    ".ui-t-p612 { padding: 6px var(--s3); }",
    ".ui-t-p614 { padding: 6px 14px; }",
    ".ui-t-p710 { padding: 7px 10px; }",
    ".ui-t-p810 { padding: var(--s2) 10px; }",
    ".ui-t-p812 { padding: var(--s2) var(--s3); }",
    ".ui-t-p814 { padding: var(--s2) 14px; }",
    ".ui-t-p816 { padding: var(--s2) var(--s4); }",
    ".ui-t-p1012 { padding: 10px var(--s3); }",
    ".ui-t-p1014 { padding: 10px 14px; }",
    ".ui-t-p12 { padding: var(--s3); }",
    ".ui-t-p1214 { padding: var(--s3) 14px; }",
    ".ui-t-p1216 { padding: var(--s3) var(--s4); }",
    ".ui-t-p16 { padding: var(--s4); }",
    ".ui-t-p1820 { padding: 18px 20px; }",
    ".ui-t-p2416 { padding: var(--s6) var(--s4); }",
    ".ui-t-p01212 { padding: 0 var(--s3) var(--s3); }",
    ".ui-t-p084 { padding: 0 var(--s2) var(--s1); }",
    ".ui-t-p7224 { padding: 72px var(--s6); }",
    ".ui-t-p9624 { padding: 96px var(--s6); }",
    ".ui-t-pl18 { padding-left: 18px; }",
    ".ui-t-pl20 { padding-left: 20px; }",
    // ---- gap ----
    ".ui-t-g5 { gap: 5px; }",
    ".ui-t-g14 { gap: 14px; }",
    ".ui-t-g16 { gap: var(--s4); }",
    // ---- sizing ----
    ".ui-t-s7 { width: 7px; height: 7px; }",
    ".ui-t-s9 { width: 9px; height: 9px; }",
    ".ui-t-s10 { width: 10px; height: 10px; }",
    ".ui-t-wf { width: var(--d-w2, 0%); }",
    ".ui-t-mw0 { min-width: 0; }",
    ".ui-t-mw160 { min-width: 160px; }",
    ".ui-t-mw180 { min-width: 180px; }",
    ".ui-t-mw240 { min-width: 240px; }",
    ".ui-t-mw720 { max-width: 720px; }",
    ".ui-t-mw880 { max-width: 880px; }",
    ".ui-t-vh { min-height: 100vh; }",
    ".ui-t-r0 { right: 0; }",
    // ---- dynamic carriers (the `--d-*` seam) ----
    ".ui-t-bcd { border-color: var(--d-sev); }",
  ].join("\n");
}
