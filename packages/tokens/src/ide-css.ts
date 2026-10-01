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
    ".ide[data-margin='hidden'] .ide-margin { display: none; }",
    ".ide-margin .ide-tick { display: block; width: 8px; height: 8px; border-radius: 2px; margin: 0 auto 10px; }",
    ".ide-margin .ide-fcard { border: 1px solid var(--shell-border); border-left-width: 3px; border-radius: var(--radius-1); padding: var(--s2); margin-bottom: var(--s2); font-size: 12px; background: var(--shell-surface); }",

    // ---- Timeline (pane | overlay | sheet | hidden) ----
    `.ide-timeline { flex: 0 0 var(--timeline-w, ${B.timelinePx}px); width: var(--timeline-w, ${B.timelinePx}px); background: var(--shell-surface); border-left: 1px solid var(--shell-border); overflow: auto; transition: flex-basis var(--dur-pane) ease, width var(--dur-pane) ease, transform var(--dur-pane) ease; display: flex; flex-direction: column; }`,
    ".ide[data-timeline='closed'] .ide-timeline { display: none; }",
    ".ide-timeline .ide-pane-head { padding: var(--s3); font-size: 12px; font-weight: 600; color: var(--shell-fg-muted); border-bottom: 1px solid var(--shell-border); }",
    ".ide-timeline .ide-tl-body { padding: var(--s3); font-size: 13px; }",

    // ---- Desk (bottom drawer) ----
    `.ide-desk { flex: 0 0 auto; height: var(--desk-h, ${B.deskHeightPx}px); border-top: 1px solid var(--shell-border); background: var(--shell-surface); display: flex; flex-direction: column; transition: height var(--dur-pane) ease; }`,
    ".ide[data-desk='closed'] .ide-desk { height: 0; border-top: none; overflow: hidden; }",
    ".ide-desk .ide-desk-tabs { display: flex; gap: var(--s2); padding: var(--s1) var(--s3); border-bottom: 1px solid var(--shell-border); }",
    ".ide-desk .ide-desk-tabs button { background: none; border: none; color: var(--shell-fg-muted); font-size: 12px; padding: 4px 8px; border-radius: var(--radius-1); cursor: pointer; }",
    ".ide-desk .ide-desk-tabs button[aria-selected='true'] { color: var(--shell-fg); background: var(--shell-raised); }",
    ".ide-desk .ide-desk-body { flex: 1; overflow: auto; padding: var(--s3); font-size: 13px; color: var(--shell-fg-muted); }",
    // the active tab's panel is attribute-driven
    ".ide-desk [data-desk-panel] { display: none; }",
    ".ide[data-desk-tab='chat'] [data-desk-panel='chat'], .ide[data-desk-tab='feed'] [data-desk-panel='feed'], .ide[data-desk-tab='findings'] [data-desk-panel='findings'], .ide[data-desk-tab='claims'] [data-desk-panel='claims'] { display: block; }",

    // ---- Status bar ----
    `.ide-statusbar { flex: 0 0 ${B.statusBarPx}px; display: flex; align-items: center; gap: var(--s4); padding: 0 var(--s3); font-size: 12px; color: var(--shell-fg-muted); background: var(--shell-surface); border-top: 1px solid var(--shell-border); font-variant-numeric: tabular-nums; }`,
    ".ide-statusbar .ide-sync[data-state='offline'], .ide-statusbar .ide-sync[data-state='queued'] { color: var(--state-needs-you); }",

    // ---- drag handles (Files / Timeline; REQ-IDE-9) ----
    ".ide-handle { flex: 0 0 5px; width: 5px; cursor: col-resize; background: transparent; border: none; padding: 0; }",
    ".ide-handle:hover, .ide-handle:focus-visible { background: var(--accent); opacity: 0.4; }",

    // ---- Focus view (⌘⇧F / ?focus=1): everything but the Page and finding ticks hides ----
    ".ide[data-view='focus'] .ide-rail, .ide[data-view='focus'] .ide-files, .ide[data-view='focus'] .ide-timeline, .ide[data-view='focus'] .ide-desk, .ide[data-view='focus'] .ide-statusbar { display: none; }",
    ".ide[data-view='focus'] .ide-margin { flex-basis: 36px; width: 36px; padding: var(--s3) 6px; }",

    // ---- yield order (§5.1; the same breakpoints paneLayout() implements) ----
    // Below 1600 with Files open: Margin → ticks, Timeline → overlay.
    `@media (max-width: ${B.bpFilesTicksMarginPx - 1}px) {`,
    "  .ide[data-files='open'] .ide-margin { flex-basis: 36px; width: 36px; padding: var(--s3) 6px; }",
    `  .ide[data-files='open'] .ide-timeline[data-open] { position: absolute; right: 0; top: 0; bottom: 0; width: min(var(--timeline-w, ${B.timelinePx}px), 85vw); z-index: 20; box-shadow: -8px 0 24px rgba(0,0,0,0.35); }`,
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
    // Below ~768: the phone layout — reader-only Page; the other regions hide (the §10.1 input set is P1.19).
    `@media (max-width: ${B.bpPhonePx - 1}px) {`,
    "  .ide .ide-rail, .ide .ide-files, .ide .ide-timeline, .ide .ide-desk, .ide .ide-margin, .ide .ide-statusbar { display: none !important; }",
    "  .ide .ide-page { padding: 0; }",
    "  .ide .ide-page .paper { flex: 1; width: auto; max-width: none; min-width: 0; border: none; border-radius: 0; box-shadow: none; padding: var(--s4) var(--s4); }",
    "  .ide-phonebar { display: flex !important; }",
    "}",
    ".ide-phonebar { display: none; align-items: center; gap: var(--s3); padding: var(--s2) var(--s3); border-bottom: 1px solid var(--shell-border); background: var(--shell-surface); font-size: 13px; }",

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

    // progressive disclosure (§5.1): Advanced-tier chrome exists in the DOM but stays hidden until the
    // persisted ⌘⇧M toggle sets data-advanced="1" on the shell.
    ".ide:not([data-advanced='1']) [data-tier='advanced'] { display: none !important; }",

    // util
    ".sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }",
    ".ide-count { font-variant-numeric: tabular-nums; }",
  ].join("\n");
}
