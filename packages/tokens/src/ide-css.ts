// The IDE chrome stylesheet (§5.1, REQ-IDE-8/9/40/42) — generated from the LAYOUT tokens so the CSS
// breakpoints cannot drift from the tested paneLayout() rules. Emitted once into IDE documents by
// `renderDocument` (apps/web). All pane state lives in `data-*` attributes on `.ide`; media queries apply
// the yield order at the §5.1 breakpoints with zero JS, so SSR markup is correct at any viewport.
//
// Region attrs on .ide:
//   data-files="strip|open"      (⌘1; strip default — the 36-px icon column)
//   data-timeline="open|closed"  (⌘2; presentation mode — pane|overlay|sheet — is viewport-derived below)
//   data-desk="closed|open"      (⌘J; bottom drawer)
//   data-view="write|read|focus" (⌘⇧M / ⌘⇧F — Focus hides everything but the Page and finding ticks)
//   data-margin="cards|ticks|hidden"  (finding cards on/off from the View menu; hidden with no findings)
//   data-desk-tab="chat|feed|findings|claims"

import { LAYOUT, TYPOGRAPHY } from "./tokens.js";

const B = LAYOUT;

export function ideCss(): string {
  return [
    // ---- frame: rail + files + (page+margin) + timeline over a desk drawer + status bar ----
    ".ide { display: flex; flex-direction: column; height: 100vh; height: 100dvh; overflow: hidden; background: var(--shell-bg); color: var(--shell-fg); font-family: var(--font-shell); }",
    ".ide-main { flex: 1; display: flex; min-height: 0; position: relative; }",
    `.ide-rail { flex: 0 0 ${B.railPx}px; width: ${B.railPx}px; display: flex; flex-direction: column; align-items: center; gap: var(--s2); padding: var(--s2) 0; background: var(--shell-surface); border-right: 1px solid var(--shell-border); z-index: 30; }`,
    ".ide-rail a, .ide-rail button { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--radius-2); color: var(--shell-fg-muted); background: none; border: none; cursor: pointer; text-decoration: none; font-size: 13px; }",
    ".ide-rail a:hover, .ide-rail button:hover { background: var(--shell-raised); color: var(--shell-fg); }",
    ".ide-rail .ide-badge { position: relative; }",
    ".ide-rail .ide-badge[data-count]:not([data-count='0'])::after { content: attr(data-count); position: absolute; top: -2px; right: -4px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--state-needs-you); color: var(--shell-bg); font-size: 11px; font-weight: 600; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }",
    ".ide-rail .ide-rail-spacer { flex: 1; }",

    // ---- Files (the Browser region — labelled "Files" in copy; §4.3) ----
    `.ide-files { flex: 0 0 ${B.filesStripPx}px; width: ${B.filesStripPx}px; background: var(--shell-surface); border-right: 1px solid var(--shell-border); overflow: hidden; transition: flex-basis var(--dur-pane) ease, width var(--dur-pane) ease; display: flex; flex-direction: column; }`,
    `.ide[data-files="open"] .ide-files { flex-basis: var(--files-w, ${B.filesOpenPx}px); width: var(--files-w, ${B.filesOpenPx}px); }`,
    ".ide-files .ide-pane-head { display: flex; align-items: center; gap: var(--s2); padding: var(--s2); font-size: 12px; font-weight: 600; color: var(--shell-fg-muted); text-transform: none; letter-spacing: 0; }",
    // strip ⇄ body swap is attribute-driven (SSR correct at either state, zero script)
    ".ide[data-files='strip'] .ide-files .ide-pane-head, .ide[data-files='strip'] .ide-files .ide-files-body { display: none; }",
    ".ide[data-files='open'] .ide-files .ide-files-strip { display: none; }",
    ".ide-files .ide-files-strip { display: flex; flex-direction: column; align-items: center; gap: var(--s1); padding-top: var(--s2); }",
    ".ide-files .ide-files-body { padding: 0 var(--s2) var(--s2); font-size: 13px; color: var(--shell-fg-muted); }",
    ".ide-files .ide-files-body ul { list-style: none; margin: 0; padding: 0; }",
    ".ide-files .ide-files-body li { padding: 3px 6px; border-radius: var(--radius-1); }",
    ".ide-files .ide-files-body li[data-current] { color: var(--shell-fg); background: var(--shell-raised); }",
    ".ide-files button, .ide-files a { color: var(--shell-fg-muted); background: none; border: none; cursor: pointer; font-size: 12px; text-decoration: none; }",

    // ---- Page + Margin ----
    ".ide-center { flex: 1; display: flex; min-width: 0; }",
    ".ide-page { flex: 1; min-width: 0; overflow: auto; display: flex; justify-content: center; padding: var(--s6) var(--s4); }",
    // the paper sheet: measure clamped [45ch, 80ch] at the 68ch target (REQ-IDE-9); pinned light inside the
    // dark shell it reads as a sheet — inset with a 1-px rule border and a soft shadow (§5.9 theme policy).
    `.ide-page .paper { flex: 0 1 ${TYPOGRAPHY.measureCh}ch; width: ${TYPOGRAPHY.measureCh}ch; min-width: min(${TYPOGRAPHY.measureMinCh}ch, 100%); max-width: ${TYPOGRAPHY.measureMaxCh}ch; padding: var(--s8) var(--s8); border: 1px solid var(--paper-rule); border-radius: var(--radius-2); box-shadow: 0 1px 3px rgba(0,0,0,0.24), 0 4px 16px rgba(0,0,0,0.16); height: fit-content; min-height: 60%; }`,
    `[data-theme="light"] .ide-page .paper { box-shadow: 0 1px 2px rgba(30,34,40,0.08), 0 4px 14px rgba(30,34,40,0.07); }`,
    `.ide-margin { flex: 0 0 ${B.marginPx}px; width: ${B.marginPx}px; border-left: 1px solid var(--shell-border); overflow: auto; padding: var(--s3); transition: flex-basis var(--dur-pane) ease, width var(--dur-pane) ease; }`,
    ".ide[data-margin='ticks'] .ide-margin, .ide-margin[data-mode='ticks'] { flex-basis: 36px; width: 36px; padding: var(--s3) 6px; }",
    // View › Finding cards collapses the surface to ticks-only (§5.7) — the cards hide, the tick echo stays.
    ".ide[data-margin='ticks'] .ide-margin [data-margin-surface] { display: none; }",
    ".ide[data-margin='hidden'] .ide-margin { display: none; }",
    ".ide-margin .ide-tick { display: block; width: 8px; height: 8px; border-radius: 2px; margin: 0 auto 10px; }",
    ".ide-margin .ide-fcard { border: 1px solid var(--shell-border); border-left-width: 3px; border-radius: var(--radius-1); padding: var(--s2); margin-bottom: var(--s2); font-size: 12px; background: var(--shell-surface); }",
    // P1.07 — the Margin surface: cards carry data-margin-card; crowded paragraphs collapse to one
    // stacked chip (details.ide-mchip, expands on focus — §5.7 clustering). Linked selection paints
    // the focused card/row on all three surfaces at once.
    ".ide-margin [data-margin-card] { border: 1px solid var(--shell-border); border-radius: var(--radius-1); padding: var(--s1); margin-bottom: var(--s2); background: var(--shell-surface); }",
    ".ide-margin [data-margin-card]:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }",
    ".ide-margin [data-margin-card][data-selected='true'], [data-desk-row][data-selected='true'] { outline: 2px solid var(--accent); outline-offset: -1px; }",
    "[data-desk-row][data-selected='true'] td { background: var(--shell-raised); }",
    ".ide-margin .ide-mchip { font-size: 12px; }",
    ".ide-margin .ide-mchip > summary { cursor: pointer; }",
    "[data-desk-row][data-rejected='true'] td { opacity: 0.72; }",
    "[data-triage-mode] [data-triage-section] table { margin-bottom: var(--s2); }",

    // ---- Timeline (pane | overlay | sheet | hidden) ----
    `.ide-timeline { flex: 0 0 var(--timeline-w, ${B.timelinePx}px); width: var(--timeline-w, ${B.timelinePx}px); background: var(--shell-surface); border-left: 1px solid var(--shell-border); overflow: auto; transition: flex-basis var(--dur-pane) ease, width var(--dur-pane) ease, transform var(--dur-pane) ease; display: flex; flex-direction: column; }`,
    ".ide[data-timeline='closed'] .ide-timeline { display: none; }",
    ".ide-timeline .ide-pane-head { padding: var(--s3); font-size: 12px; font-weight: 600; color: var(--shell-fg-muted); border-bottom: 1px solid var(--shell-border); }",
    ".ide-timeline .ide-tl-body { padding: var(--s3); font-size: 13px; }",

    // ---- Desk (bottom drawer) ----
    `.ide-desk { flex: 0 0 auto; height: var(--desk-h, ${B.deskHeightPx}px); border-top: 1px solid var(--shell-border); background: var(--shell-surface); display: flex; flex-direction: column; transition: height var(--dur-pane) ease; }`,
    ".ide[data-desk='closed'] .ide-desk { height: 0; border-top: none; overflow: hidden; }",
    // UX.2 — the desk head wraps the tablist + the (non-tab) close control; the row's padding and
    // hairline moved here so the tablist stays a pure role=tablist container (aria-required-children).
    ".ide-desk .ide-desk-head { display: flex; align-items: center; gap: var(--s2); padding: var(--s1) var(--s3); border-bottom: 1px solid var(--shell-border); }",
    ".ide-desk .ide-desk-tabs { display: flex; gap: var(--s2); flex: 1; min-width: 0; }",
    ".ide-desk .ide-desk-tabs button { background: none; border: none; color: var(--shell-fg-muted); font-size: 12px; padding: 4px 8px; border-radius: var(--radius-1); cursor: pointer; }",
    ".ide-desk .ide-desk-tabs button[aria-selected='true'] { color: var(--shell-fg); background: var(--shell-raised); }",
    ".ide-desk .ide-desk-body { flex: 1; overflow: auto; padding: var(--s3); font-size: 13px; color: var(--shell-fg-muted); }",
    // the active tab's panel is attribute-driven
    ".ide-desk [data-desk-panel] { display: none; }",
    ".ide[data-desk-tab='chat'] [data-desk-panel='chat'], .ide[data-desk-tab='feed'] [data-desk-panel='feed'], .ide[data-desk-tab='findings'] [data-desk-panel='findings'], .ide[data-desk-tab='claims'] [data-desk-panel='claims'] { display: block; }",
    // RUN.1 — the chat panel is a flex column pinned to the drawer's full height: `.chat-body` scrolls
    // and `.chat-composer` is `flex:0 0 auto` at the drawer's bottom edge — the Send button can never
    // slide under `footer.ide-statusbar` again (the desk body's own scroll no longer carries it).
    ".ide[data-desk-tab='chat'] .ide-desk [data-desk-panel='chat'] { display: flex; flex-direction: column; height: 100%; min-height: 0; }",
    ".chat-desk { display: flex; flex-direction: column; height: 100%; min-height: 0; }",
    ".chat-desk .chat-body { flex: 1 1 auto; min-height: 0; }",
    ".ide-desk .chat-desk .chat-body { overflow-y: auto; }",
    ".chat-desk .chat-composer { flex: 0 0 auto; margin-top: var(--s2); padding-top: var(--s2); border-top: 1px solid var(--shell-border); }",

    // ---- Status bar ----
    `.ide-statusbar { flex: 0 0 ${B.statusBarPx}px; display: flex; align-items: center; gap: var(--s4); padding: 0 var(--s3); font-size: 12px; color: var(--shell-fg-muted); background: var(--shell-surface); border-top: 1px solid var(--shell-border); font-variant-numeric: tabular-nums; }`,
    // EDIT.1 — no .ide-sync rule: the Page's [data-sync-pill] is the one indicator (ADR-049); the
    // status bar no longer carries a second sync element.

    // ---- drag handles (Files / Timeline; REQ-IDE-9) ----
    ".ide-handle { flex: 0 0 5px; width: 5px; cursor: col-resize; background: transparent; border: none; padding: 0; }",
    ".ide-handle:hover, .ide-handle:focus-visible { background: var(--accent); opacity: 0.4; }",

    // ---- Focus view (⌘⇧F / ?focus=1): everything but the Page and finding ticks hides ----
    ".ide[data-view='focus'] .ide-rail, .ide[data-view='focus'] .ide-files, .ide[data-view='focus'] .ide-timeline, .ide[data-view='focus'] .ide-desk, .ide[data-view='focus'] .ide-statusbar { display: none; }",
    ".ide[data-view='focus'] .ide-margin { flex-basis: 36px; width: 36px; padding: var(--s3) 6px; }",
    // R7FIX.1 (REQ-WRITE-4, B12) — the focus-view exit pill: hover- and keyboard-revealed. It is a
    // fixed button top-centre; outside focus view it never mounts an affordance (display:none).
    // opacity:0 keeps it hit-testable — a pointer entering its box (or Tab reaching it) reveals.
    ".ide-focus-exit { display: none; position: fixed; top: 10px; left: 50%; transform: translateX(-50%) translateY(-6px); z-index: 65; align-items: center; gap: var(--s1); padding: 5px 14px; border-radius: var(--radius-pill); border: 1px solid var(--shell-border); background: var(--shell-raised); color: var(--shell-fg); font-size: var(--fs-micro, 12px); font-family: var(--font-shell); cursor: pointer; opacity: 0; transition: opacity var(--dur-pane) ease, transform var(--dur-pane) ease; box-shadow: 0 4px 16px rgba(0,0,0,0.35); }",
    ".ide[data-view='focus'] .ide-focus-exit { display: inline-flex; }",
    ".ide[data-view='focus'] .ide-focus-exit:hover, .ide[data-view='focus'] .ide-focus-exit:focus-visible { opacity: 1; transform: translateX(-50%); }",
    ".ide[data-view='focus'] .ide-focus-exit:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }",

    // UX.2 (ADR-067) — the project page's action row: ≥ 24-px targets at every width (WCAG 2.5.8);
    // the <768 block below lifts them to bordered ≥ 44-px controls. These BASE rules must precede
    // the media blocks — at equal specificity the later declaration wins, so a base rule declared
    // after the phone override would silently dead it at every width (D-CAP.2-3: 25-px targets on
    // prod at 390 px).
    ".ide .ide-actions { display: flex; flex-wrap: wrap; gap: var(--s3); }",
    ".ide .ide-actions a { display: inline-flex; align-items: center; min-height: 24px; }",

    // ---- yield order (§5.1; the same breakpoints paneLayout() implements) ----
    // Below 1600 with Files open: Margin → ticks. R7FIX.1 (REQ-PANE-0, B1): the Timeline stays
    // docked at ≥1280 — the Page column reflows instead of sliding under it. Its overlay arm is
    // the <1280 block below.
    `@media (max-width: ${B.bpFilesTicksMarginPx - 1}px) {`,
    "  .ide[data-files='open'] .ide-margin { flex-basis: 36px; width: 36px; padding: var(--s3) 6px; }",
    "}",
    // Below 1280: Margin → ticks and Timeline → overlay regardless of Files.
    `@media (max-width: ${B.bpNarrowPx - 1}px) {`,
    "  .ide .ide-margin { flex-basis: 36px; width: 36px; padding: var(--s3) 6px; }",
    `  .ide .ide-timeline[data-open] { position: absolute; right: 0; top: 0; bottom: 0; width: min(var(--timeline-w, ${B.timelinePx}px), 85vw); z-index: 20; box-shadow: -8px 0 24px rgba(0,0,0,0.35); }`,
    "}",
    // Below 1024: single column — Files opens as an overlay drawer; Timeline open becomes a bottom sheet.
    `@media (max-width: ${B.bpSingleColumnPx - 1}px) {`,
    `  .ide[data-files='open'] .ide-files { position: absolute; left: ${B.railPx}px; top: 0; bottom: 0; width: min(var(--files-w, ${B.filesOpenPx}px), 80vw); z-index: 20; box-shadow: 8px 0 24px rgba(0,0,0,0.35); }`,
    `  .ide .ide-timeline[data-open] { position: absolute; left: ${B.railPx}px; right: 0; bottom: 0; top: auto; width: auto; height: 55%; z-index: 20; border-top: 1px solid var(--shell-border); box-shadow: 0 -8px 24px rgba(0,0,0,0.35); }`,
    "}",
    // R7FIX.1 (REQ-PANE-0) — the scrim under every open overlay/sheet: the controller derives
    // `data-timeline-mode`/`data-files-mode` from paneLayout() (overlay|sheet only where the mode
    // really applies), so a scrim can never be claimed under a docked pane. `.ide-scrim` covers
    // `.ide-main`; the rail (z 30) and the open pane (z 20) stay above it — outside clicks land
    // on it and dismiss.
    ".ide-scrim { display: none; position: absolute; inset: 0; z-index: 19; background: rgba(0,0,0,0.45); }",
    ".ide[data-timeline='open'][data-timeline-mode='overlay'] .ide-scrim, .ide[data-timeline='open'][data-timeline-mode='sheet'] .ide-scrim, .ide[data-files='open'][data-files-mode='overlay'] .ide-scrim { display: block; }",
    // Below ~768: the phone layout — reader-only Page; the other regions hide. P1.19 (§10.1): the
    // §10.1 input set the regions carried re-mounts INSIDE the Page — elements stamped
    // `ide-phone-only` render only at this width (the compact chat surface is the one today).
    `@media (max-width: ${B.bpPhonePx - 1}px) {`,
    "  .ide .ide-rail, .ide .ide-files, .ide .ide-timeline, .ide .ide-desk, .ide .ide-margin, .ide .ide-statusbar { display: none !important; }",
    "  .ide .ide-page { padding: 0; }",
    "  .ide .ide-page .paper { flex: 1; width: auto; max-width: none; min-width: 0; border: none; border-radius: 0; box-shadow: none; padding: var(--s4) var(--s4); }",
    "  .ide-phonebar { display: flex !important; }",
    "  .ide .ide-phone-only { display: block; }",
    // UX.2 (ADR-067; REQ-MOBILE-3 amended, REQ-IDE-42) — the phone target floor: every button is at
    // least the WCAG 2.5.8 24-px minimum, the §10.1 inputs a reader can still take (gate answers,
    // decision options, the chat composer) are ≥ 44 px, and the project page's surviving action row
    // is button-styled — bordered controls, not bare underlined links, with mis-tap gap.
    "  .ide button { min-height: 24px; min-width: 24px; }",
    "  .ide [data-gate-actions] button, .ide [data-decision-option], .ide .ide-phone-only .chat-composer button, .ide .ide-phone-only .chat-threads a, .ide .ide-phone-only [data-chat-chip] { min-height: 44px; font-size: 15px; }",
    "  .ide .ide-phone-only .chat-threads a, .ide .ide-phone-only [data-chat-chip] { display: inline-flex; align-items: center; }",
    "  .ide .ide-actions a { min-height: 44px; min-width: 44px; padding: 0 var(--s3); border: 1px solid var(--shell-border); border-radius: var(--radius-2); background: var(--shell-raised); color: var(--shell-fg); text-decoration: none; font-size: 15px; }",
    "}",
    ".ide-phonebar { display: none; align-items: center; gap: var(--s3); padding: var(--s2) var(--s3); border-bottom: 1px solid var(--shell-border); background: var(--shell-surface); font-size: 13px; }",
    // UX.2 — the phonebar's two links are real targets, not bare 13-px text: ≥ 44 px tall, tappable.
    ".ide-phonebar a { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; padding: 0 var(--s1); }",
    // P1.19 — the badge dot the phonebar's Inbox link carries (the rail's rule is scoped to .ide-rail).
    ".ide-phonebar .ide-badge { position: relative; margin-left: auto; color: var(--shell-fg-muted); text-decoration: none; }",
    ".ide-phonebar .ide-badge[data-count]:not([data-count='0'])::after { content: attr(data-count); position: absolute; top: -6px; right: -8px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--state-needs-you); color: var(--shell-bg); font-size: 11px; font-weight: 600; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }",
    ".ide-phone-only { display: none; }",

    // ---- View menu + disclosure popovers ----
    ".ide-menu { position: absolute; z-index: 40; min-width: 220px; background: var(--shell-raised); border: 1px solid var(--shell-border); border-radius: var(--radius-2); box-shadow: 0 8px 24px rgba(0,0,0,0.35); padding: var(--s2); }",
    ".ide-menu [role='menuitemradio'], .ide-menu [role='menuitemcheckbox'], .ide-menu .ide-menu-row { display: flex; align-items: center; gap: var(--s2); width: 100%; padding: 6px 8px; border: none; background: none; color: var(--shell-fg); font-size: 13px; text-align: left; border-radius: var(--radius-1); cursor: pointer; }",
    ".ide-menu [role='menuitemradio'][aria-checked='true'] { color: var(--accent); }",
    ".ide-menu .ide-menu-sep { border-top: 1px solid var(--shell-border); margin: var(--s2) 0; }",
    ".ide-menu .ide-menu-note { font-size: 11px; color: var(--shell-fg-faint); padding: 2px 8px; }",

    // ---- state catalogue + loading (§5.9; REQ-IDE-41) — skeleton rows in the shell, never spinners ----
    ".ide-state { border: 1px solid var(--shell-border); border-radius: var(--radius-2); padding: var(--s4); background: var(--shell-surface); }",
    ".ide-state[data-tone='failed'] { border-color: var(--state-failed); }",
    ".ide-sk-row { height: 12px; border-radius: var(--radius-1); background: var(--shell-raised); margin-bottom: var(--s2); animation: ide-shimmer var(--dur-phase) ease-in-out infinite alternate; }",
    "@keyframes ide-shimmer { from { opacity: 0.55; } to { opacity: 1; } }",
    ".ide-stream-block { animation: ide-block-in var(--dur-stream) ease both; }",
    "@keyframes ide-block-in { from { opacity: 0; } to { opacity: 1; } }",
    ".ide-finding-in { animation: ide-find-in var(--dur-finding) ease both; }",
    "@keyframes ide-find-in { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: none; } }",
    ".ide-caret { display: inline-block; width: 2px; height: 1em; background: var(--accent); vertical-align: text-bottom; animation: ide-caret var(--dur-caret) ease-in-out infinite; }",
    "@keyframes ide-caret { 0%,100% { opacity: 1; } 50% { opacity: 0; } }",
    ".ide-banner { display: flex; gap: var(--s2); align-items: center; padding: var(--s2) var(--s3); border-radius: var(--radius-1); border: 1px solid var(--shell-border); background: var(--shell-raised); font-size: 13px; }",
    ".ide-banner[data-tone='conflict'] { border-color: var(--state-needs-you); }",
    ".ide-banner[data-tone='locked'] { border-color: var(--shell-border); color: var(--shell-fg-muted); }",
    ".ide-pill { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--shell-border); font-size: 11px; color: var(--shell-fg-muted); }",

    // the ONE blocking modal in the product — the Cancel-run confirmation (§5.9 state catalogue).
    ".ide-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 60; }",
    ".ide-modal { background: var(--shell-surface); border: 1px solid var(--shell-border); border-radius: var(--radius-3); padding: var(--s4); width: min(420px, 90vw); box-shadow: 0 16px 48px rgba(0,0,0,0.5); }",

    // ---- P1.06 — the ⌘K palette + the `?` cheat sheet (§5.12): top-anchored overlays, never blocking;
    // Esc/⌘K toggles, and every palette row navigates or opens the sheet — nothing POSTs. ----
    ".ide-palette { position: fixed; top: 12vh; left: 50%; transform: translateX(-50%); z-index: 70; width: min(560px, 92vw); background: var(--shell-raised); border: 1px solid var(--shell-border); border-radius: var(--radius-3); box-shadow: 0 16px 48px rgba(0,0,0,0.5); padding: var(--s2); }",
    ".ide-palette[hidden] { display: none; }",
    ".ide-palette input[data-palette-input] { width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit; font-size: 15px; background: var(--shell-bg); color: var(--shell-fg); border: 1px solid var(--shell-border); border-radius: var(--radius-2); outline: none; }",
    ".ide-palette input[data-palette-input]:focus { border-color: var(--accent); }",
    ".ide-palette [data-palette-results] { max-height: 50vh; overflow-y: auto; margin-top: var(--s2); }",
    ".ide-palette .ide-pal-section { font-size: 11px; color: var(--shell-fg-faint); text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 10px 2px; }",
    ".ide-palette .ide-pal-row { display: flex; align-items: baseline; gap: var(--s2); width: 100%; padding: 7px 10px; border: none; background: none; color: var(--shell-fg); font-size: 14px; text-align: left; border-radius: var(--radius-1); cursor: pointer; }",
    ".ide-palette .ide-pal-row[data-active] { background: var(--shell-bg); }",
    ".ide-palette .ide-pal-row[data-disabled] { color: var(--shell-fg-faint); cursor: default; }",
    ".ide-palette .ide-pal-hint { margin-left: auto; font-size: 12px; color: var(--shell-fg-faint); }",
    ".ide-palette .ide-pal-pinned { color: var(--accent); font-size: 11px; margin-left: auto; }",
    ".ide-palette .ide-pal-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 10px; }",
    ".ide-palette .ide-pal-chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--shell-border); background: var(--shell-bg); color: var(--shell-fg-muted); }",
    ".ide-palette .ide-pal-error { padding: 8px 10px; font-size: 13px; color: var(--sev-major); }",
    ".ide-palette .ide-pal-action { padding: 8px 10px; font-size: 13px; color: var(--shell-fg-muted); }",
    ".ide-palette [data-palette-empty] { padding: 12px 10px; font-size: 13px; color: var(--shell-fg-faint); }",

    // the other two §7.2 surfaces (REQ-CHAT-22): the selection popover on the Page and the Timeline
    // context menu share one container + the palette's row styling — every row resolves through the
    // same parseCommand → resolveCommand path, so the sheet GET is byte-identical.
    ".ide-cmdmenu { position: fixed; z-index: 72; min-width: 210px; max-width: 320px; background: var(--shell-raised); border: 1px solid var(--shell-border); border-radius: var(--radius-2); box-shadow: 0 8px 24px rgba(0,0,0,0.4); padding: var(--s2); }",
    ".ide-cmdmenu .ide-pal-row { display: flex; align-items: baseline; gap: var(--s2); width: 100%; padding: 7px 10px; border: none; background: none; color: var(--shell-fg); font-size: 13px; text-align: left; border-radius: var(--radius-1); cursor: pointer; }",
    ".ide-cmdmenu .ide-pal-row:hover, .ide-cmdmenu .ide-pal-row:focus-visible { background: var(--shell-bg); outline: none; }",
    ".ide-cmdmenu .ide-pal-row[data-disabled] { color: var(--shell-fg-faint); cursor: default; }",
    ".ide-cmdmenu .ide-pal-row[data-disabled]:hover { background: none; }",
    ".ide-cmdmenu .ide-pal-hint { margin-left: auto; font-size: 12px; color: var(--shell-fg-faint); }",
    ".ide-cmdmenu .ide-cmdmenu-sep { border-top: 1px solid var(--shell-border); margin: var(--s2) 0; }",

    ".ide-cheatsheet { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-start; justify-content: center; z-index: 70; padding-top: 14vh; }",
    ".ide-cheatsheet[hidden] { display: none; }",
    ".ide-cheatsheet-card { background: var(--shell-raised); border: 1px solid var(--shell-border); border-radius: var(--radius-3); padding: var(--s3) var(--s4); width: min(520px, 92vw); box-shadow: 0 16px 48px rgba(0,0,0,0.5); }",
    ".ide-cheatsheet-card ul { list-style: none; margin: var(--s2) 0 0; padding: 0; }",
    ".ide-cheatsheet-row { display: flex; gap: var(--s3); padding: 4px 0; font-size: 13px; align-items: baseline; }",
    ".ide-cheatsheet-row kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--shell-fg-muted); min-width: 150px; }",

    // progressive disclosure (§5.1): Advanced-tier chrome exists in the DOM but stays hidden until the
    // persisted ⌘⇧M toggle sets data-advanced="1" on the shell.
    ".ide:not([data-advanced='1']) [data-tier='advanced'] { display: none !important; }",

    // ---- SPA.9 / REQ-UX-16 chrome polish (design/24's sanctioned list) — ONE stylesheet serves both
    // renderers, so the SSR twin picks these up too: the skip link (WCAG 2.4.1) and hover/focus-visible
    // affordances on the chrome controls that were action-only before. ----
    ".ide-skip { position: fixed; top: 8px; left: 8px; z-index: 80; transform: translateY(-250%); padding: 8px 14px; border-radius: var(--radius-2); background: var(--shell-raised); color: var(--shell-fg); border: 1px solid var(--shell-border); font-size: 13px; text-decoration: none; }",
    ".ide-skip:focus, .ide-skip:focus-visible { transform: none; outline: 2px solid var(--accent); outline-offset: 2px; }",
    ".ide-menu [role='menuitemradio']:hover, .ide-menu [role='menuitemcheckbox']:hover, .ide-menu .ide-menu-row:hover { background: var(--shell-bg); }",
    ".ide-menu [role='menuitemradio']:focus-visible, .ide-menu [role='menuitemcheckbox']:focus-visible, .ide-menu .ide-menu-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }",
    ".ide-desk .ide-desk-tabs button:hover { color: var(--shell-fg); }",
    ".ide-desk .ide-desk-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }",
    ".ide-statusbar button { background: none; border: none; color: var(--shell-fg-muted); font: inherit; font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: var(--radius-1); }",
    ".ide-statusbar button:hover { color: var(--shell-fg); background: var(--shell-raised); }",
    ".ide-statusbar button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }",
    ".ide-palette .ide-pal-row:hover { background: var(--shell-bg); }",
    ".ide-palette .ide-pal-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }",
    ".ide-pane-head button:hover { color: var(--shell-fg); }",
    ".ide button:focus-visible, .ide a:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }",

    // util
    ".sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }",
    ".ide-count { font-variant-numeric: tabular-nums; }",

    // ---- P1.02 — the Page's own styles (the ProseMirror surface + the sidecar decorations). The doc
    // typesets in the paper font; PM's editable root keeps the same measure and never shows a chrome
    // outline. Findings tint the anchored span (severity color, never document content); the Authorship
    // overlay tints block left-edges (read-only decorations — the markdown bytes never change).
    ".rm-page-host .rm-page, .rm-page-host .ProseMirror { font-family: var(--font-paper, var(--font-shell)); font-size: var(--paper-size, 17px); line-height: 1.6; outline: none; white-space: pre-wrap; word-wrap: break-word; }",
    ".rm-page-host .ProseMirror p { margin: 0 0 0.8em; }",
    ".rm-page-host .ProseMirror h1, .rm-page-host .ProseMirror h2, .rm-page-host .ProseMirror h3 { line-height: 1.25; margin: 1.2em 0 0.5em; }",
    ".rm-page-host .ProseMirror blockquote { border-left: 3px solid var(--paper-rule, var(--shell-border)); margin: 0 0 0.8em; padding-left: 1em; color: inherit; opacity: 0.92; }",
    ".rm-page-host .ProseMirror pre { background: var(--shell-raised); border-radius: var(--radius-1); padding: var(--s2) var(--s3); font-size: 0.88em; overflow-x: auto; }",
    ".rm-page-host .ProseMirror table { border-collapse: collapse; margin: 0 0 0.8em; }",
    ".rm-page-host .ProseMirror td, .rm-page-host .ProseMirror th { border: 1px solid var(--paper-rule, var(--shell-border)); padding: 4px 10px; }",
    ".rm-page-host .rm-math-block, .rm-page-preview .rm-math-block { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; text-align: center; padding: var(--s2) 0; color: var(--shell-fg-muted); }",
    ".rm-page-host .rm-math-inline, .rm-page-preview .rm-math-inline { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; color: var(--shell-fg-muted); }",
    ".rm-page-host .rm-cite, .rm-page-preview .rm-cite { color: var(--accent); font-size: 0.92em; }",
    ".rm-page-host .rm-frontmatter, .rm-page-preview .rm-frontmatter, .rm-page-host .rm-link-def, .rm-page-preview .rm-link-def, .rm-page-host .rm-html-block, .rm-page-preview .rm-html-block { color: var(--shell-fg-faint); font-size: 0.85em; border-left: 2px solid var(--shell-border); padding-left: var(--s2); margin: 0 0 0.8em; white-space: pre-wrap; }",
    ".rm-page-host .rm-footnote-def, .rm-page-preview .rm-footnote-def { font-size: 0.88em; color: var(--shell-fg-muted); border-top: 1px solid var(--paper-rule, var(--shell-border)); padding-top: var(--s1); }",
    ".rm-page-host .rm-footnote-def::before, .rm-page-preview .rm-footnote-def::before { content: '[' attr(data-fn) '] '; color: var(--shell-fg-faint); }",
    // §5.7 (P1.07): underline WEIGHT encodes severity — blocking solid 2 px, major solid 1.5 px, minor
    // dotted, note faint — and HUE encodes the finding kind. `--fm-hue` defaults to the severity color
    // (callers without a kind keep the old look); `.rm-kind-*` re-hues the mark. Decorations are
    // aria-hidden in the a11y contract — the Desk table is the screen-reader surface.
    ".rm-page .rm-finding { border-bottom: 1.5px solid var(--sev-minor); }",
    ".rm-page .rm-finding-blocking, .rm-page .rm-finding-critical { border-bottom: 2px solid var(--sev-blocking, var(--sev-major)); }",
    ".rm-page .rm-finding-major { border-bottom-color: var(--sev-major); }",
    ".rm-page .rm-finding-minor { border-bottom-style: dotted; }",
    ".rm-page .rm-finding-note { border-bottom-width: 1px; border-bottom-color: var(--sev-note); }",
    ".rm-page .rm-kind-claim { border-bottom-color: var(--kind-claim); }",
    ".rm-page .rm-kind-discourse { border-bottom-color: var(--kind-discourse); }",
    ".rm-page .rm-kind-argument { border-bottom-color: var(--kind-argument); }",
    ".rm-page .rm-kind-structure { border-bottom-color: var(--kind-structure); }",
    ".rm-page .rm-kind-craft { border-bottom-color: var(--kind-craft); }",
    ".rm-page .rm-kind-voice { border-bottom-color: var(--kind-voice); }",
    ".rm-page .rm-kind-continuity { border-bottom-color: var(--kind-continuity); }",
    // suggestion preview (View › Show suggestions inline): a soft wash on the span; the replacement
    // itself renders as an inserted-text widget the island appends (read-only — Apply owns the bytes).
    ".rm-page .rm-suggestion-preview { background: color-mix(in srgb, var(--kind-craft) 16%, transparent); border-radius: 2px; }",
    ".rm-page .rm-suggestion-replacement { color: var(--sev-minor); background: color-mix(in srgb, var(--sev-minor) 14%, transparent); border-radius: 2px; padding: 0 2px; }",
    ".rm-page .rm-finding-block { box-shadow: inset 3px 0 0 var(--sev-minor); }",
    ".rm-page .rm-finding-block.rm-finding-major { box-shadow: inset 3px 0 0 var(--sev-major); }",
    ".rm-page .rm-finding-block.rm-finding-blocking, .rm-page .rm-finding-block.rm-finding-critical { box-shadow: inset 3px 0 0 var(--sev-blocking, var(--sev-major)); }",
    ".rm-page .rm-finding-block.rm-kind-claim { box-shadow: inset 3px 0 0 var(--kind-claim); }",
    ".rm-page .rm-finding-block.rm-kind-discourse { box-shadow: inset 3px 0 0 var(--kind-discourse); }",
    ".rm-page .rm-finding-block.rm-kind-argument { box-shadow: inset 3px 0 0 var(--kind-argument); }",
    ".rm-page .rm-finding-block.rm-kind-structure { box-shadow: inset 3px 0 0 var(--kind-structure); }",
    ".rm-page .rm-finding-block.rm-kind-craft { box-shadow: inset 3px 0 0 var(--kind-craft); }",
    ".rm-page .rm-finding-block.rm-kind-voice { box-shadow: inset 3px 0 0 var(--kind-voice); }",
    ".rm-page .rm-finding-block.rm-kind-continuity { box-shadow: inset 3px 0 0 var(--kind-continuity); }",
    ".rm-page .rm-proposal-target { box-shadow: inset 3px 0 0 var(--accent); }",
    // the Authorship overlay (View menu; REQ-POS-8): a left-edge tint per block — read-only decorations.
    ".rm-page .rm-author-agent { box-shadow: inset 3px 0 0 var(--accent); }",
    ".rm-page .rm-author-assistant { box-shadow: inset 3px 0 0 var(--sev-note); }",
    ".rm-page .rm-author-mixed { box-shadow: inset 3px 0 0 var(--sev-major); }",
    ".rm-page .rm-author-human { box-shadow: none; }",
    ".rm-page-host[data-readonly='1'] .ProseMirror { caret-color: transparent; }",
    // SPA.25 — the source view (REQ-ED-17; design/30): a toolbar above the editor with the toggle,
    // and the CodeMirror surface typeset in the mono font inside the same paper measure. The PM
    // host hides via `hidden` while the source host is up (the view stays mounted + bound).
    ".rm-source-bar { display: flex; align-items: center; gap: var(--s2); margin-bottom: var(--s2); }",
    ".rm-source-toggle { font-family: var(--font-shell); font-size: 12px; color: var(--shell-fg-muted); background: transparent; border: 1px solid var(--shell-border); border-radius: var(--radius-1); padding: 2px 10px; cursor: pointer; }",
    ".rm-source-toggle[aria-pressed='true'] { color: var(--shell-fg); border-color: var(--accent); }",
    ".rm-source-note { font-family: var(--font-shell); font-size: 12px; color: var(--sev-major); }",
    ".rm-source-host .cm-editor { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; line-height: 1.6; border: 1px solid var(--shell-border); border-radius: var(--radius-1); }",
    ".rm-source-host .cm-editor.cm-focused { outline: 1px solid var(--accent); outline-offset: -1px; }",
    ".rm-source-host .cm-content { padding: var(--s2) var(--s3); caret-color: var(--shell-fg); }",
    ".rm-source-host .cm-gutters { background: var(--shell-raised); color: var(--shell-fg-faint); border-right: 1px solid var(--shell-border); font-size: 0.85em; }",
    // gapcursor / dropcursor / selection chrome PM needs
    ".rm-page-host .ProseMirror-gapcursor { position: relative; }",
    ".rm-page-host .ProseMirror-selectednode { outline: 2px solid var(--accent); }",
    ".rm-page-host .ProseMirror-hideselection *::selection { background: transparent; }",
  ].join("\n");
}
