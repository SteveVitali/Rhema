// `uiCss()` — the stylesheet for the `primitives/**` component kit (R7KIT.2; REQ-KIT-2, REQ-KIT-5;
// ADR-129; UXC-15). Like `themeCss()`/`ideCss()` it is GENERATED: one function emits every `.ui-*`
// rule, so the primitives carry zero inline spacing/type/colour/radius literals — their JSX names
// classes, this file owns the values. Values come from the tokens two ways: `var(--…)` references
// (spacing `--s*`, type `--fs-*`, radius `--radius-*`, palette `--shell-*`/`--state-*`/`--sev-*` —
// so light and dark both resolve through the one token layer) and the typed maps (`LAYOUT`,
// `MOTION`) where the token is a value, not a var.
//
// The moved `primitives.tsx` exports (Pill/Chip/FetchedUrlChip/ActionLink — `primitives/chips.tsx`)
// emit the SAME declaration values their inline styles did; the `.ui-pill*`/`.ui-chip*`/
// `.ui-fetch-chip*`/`.ui-action-link` rules are pinned against those values by test, which is the
// rendered-behaviour-unchanged proof.
//
// Bound: inlined verbatim into every SPA shell + SSR document — asserted ≤ 24 kB raw (REQ-KIT-5);
// 225a's additions must fit the same bound.

import { LAYOUT, MOTION } from "@rhema/tokens";

export function uiCss(): string {
  return [
    // ---- visually-hidden helper (accessible names without visual chrome) ----
    ".ui-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }",

    // ---- Button / IconButton ----
    ".ui-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--s2); padding: var(--s1) var(--s3); border-radius: var(--radius-2); border: 1px solid var(--shell-border); background: var(--shell-raised); color: var(--shell-fg); font-family: var(--font-shell); font-size: var(--fs-dense); line-height: 1.4; cursor: pointer; text-decoration: none; white-space: nowrap; }",
    ".ui-btn:hover:not(:disabled) { border-color: var(--shell-fg-faint); }",
    ".ui-btn:active:not(:disabled) { background: var(--shell-border); }",
    ".ui-btn:disabled { opacity: 0.55; cursor: not-allowed; }",
    ".ui-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-color: var(--accent); }",
    ".ui-btn--primary { background: var(--accent); border-color: transparent; color: var(--shell-bg); font-weight: 600; }",
    ".ui-btn--primary:hover:not(:disabled) { border-color: transparent; }",
    ".ui-btn--ghost { background: transparent; border-color: transparent; color: var(--shell-fg-muted); }",
    ".ui-btn--ghost:hover:not(:disabled) { background: var(--shell-raised); border-color: var(--shell-border); color: var(--shell-fg); }",
    ".ui-btn--danger { border-color: var(--sev-blocking); color: var(--sev-blocking); }",
    ".ui-btn--danger:hover:not(:disabled) { background: var(--sev-blocking); color: var(--shell-bg); }",
    ".ui-btn--sm { padding: var(--s1) var(--s2); font-size: var(--fs-caption); }",
    ".ui-btn--icon { padding: var(--s1); line-height: 1; }",
    ".ui-btn--icon > svg { width: 1em; height: 1em; }",

    // ---- Badge ----
    ".ui-badge { display: inline-flex; align-items: center; gap: var(--s1); padding: 1px var(--s2); border-radius: var(--radius-pill); border: 1px solid var(--shell-border); background: var(--shell-raised); color: var(--shell-fg); font-size: var(--fs-caption); line-height: 1.5; white-space: nowrap; }",
    ".ui-badge--accent { border-color: var(--accent); color: var(--accent); }",
    ".ui-badge--ok { border-color: var(--state-ok); color: var(--state-ok); }",
    ".ui-badge--attention { border-color: var(--state-needs-you); color: var(--state-needs-you); }",
    ".ui-badge--danger { border-color: var(--sev-blocking); color: var(--sev-blocking); }",

    // ---- Kbd ----
    ".ui-kbd { display: inline-block; padding: 0 var(--s1); border: 1px solid var(--shell-border); border-bottom-width: 2px; border-radius: var(--radius-1); background: var(--shell-surface); color: var(--shell-fg); font-family: var(--font-mono); font-size: var(--fs-micro); line-height: 1.5; }",

    // ---- Skeleton ----
    "@keyframes ui-skeleton { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }",
    ".ui-skeleton { display: inline-block; inline-size: var(--ui-skeleton-w, 100%); block-size: var(--ui-skeleton-h, 1em); border-radius: var(--radius-1); background: var(--shell-border); animation: ui-skeleton 1.4s ease-in-out infinite; }",

    // ---- moved primitives.tsx exports — same declarations, now classes (rendered behaviour
    // pinned unchanged; radius/size steps resolve to the tokens where the value is identical) ----
    ".ui-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: var(--radius-pill); border: 1px solid var(--shell-border); background: var(--shell-raised); color: var(--shell-fg); font-size: var(--fs-micro); font-variant-numeric: tabular-nums; white-space: nowrap; }",
    ".ui-pill-dot { width: 7px; height: 7px; border-radius: var(--radius-pill); background: var(--shell-fg-muted); }",
    ".ui-pill--running .ui-pill-dot { background: var(--state-running); }",
    ".ui-pill--needs-you .ui-pill-dot { background: var(--state-needs-you); }",
    ".ui-pill--ready .ui-pill-dot { background: var(--state-ready); }",
    ".ui-pill--attention .ui-pill-dot { background: var(--sev-major); }",
    ".ui-chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 6px; border: 1px solid var(--shell-border); background: var(--shell-surface); color: var(--ui-chip-fg, var(--shell-fg-muted)); font-size: var(--fs-micro); text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".ui-fetch-chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 6px; border: 1px solid var(--state-ready); background: var(--shell-surface); color: var(--shell-fg); font-size: var(--fs-micro); text-decoration: none; font-variant-numeric: tabular-nums; }",
    '.ui-fetch-chip[data-fetched="search"] { border-color: var(--paper-rule); }',
    ".ui-fetch-chip-mark { color: var(--state-ready); }",
    ".ui-fetch-chip-label { color: var(--shell-fg-muted); }",
    ".ui-action-link { display: inline-block; padding: 6px 14px; border-radius: var(--radius-2); background: var(--accent); color: var(--shell-bg); font-size: var(--fs-dense); font-weight: 600; text-decoration: none; white-space: nowrap; }",

    // ---- Tooltip (Radix) ----
    ".ui-tooltip { z-index: 60; max-width: 260px; padding: var(--s1) var(--s2); border-radius: var(--radius-1); border: 1px solid var(--shell-border); background: var(--shell-raised); color: var(--shell-fg); font-size: var(--fs-micro); line-height: 1.4; box-shadow: 0 4px 16px color-mix(in srgb, var(--shell-bg) 60%, transparent); }",
    ".ui-tooltip-arrow { fill: var(--shell-raised); }",
    '.ui-tooltip[data-state="delayed-open"], .ui-tooltip[data-state="instant-open"] { animation: ui-fade-in 120ms ease-out; }',

    // ---- DropdownMenu (Radix) ----
    ".ui-menu { z-index: 60; min-width: 160px; padding: var(--s1); border-radius: var(--radius-2); border: 1px solid var(--shell-border); background: var(--shell-raised); box-shadow: 0 6px 24px color-mix(in srgb, var(--shell-bg) 60%, transparent); }",
    '.ui-menu[data-state="open"] { animation: ui-fade-in 120ms ease-out; }',
    ".ui-menu-item { display: flex; align-items: center; gap: var(--s2); padding: var(--s1) var(--s2); border-radius: var(--radius-1); color: var(--shell-fg); font-size: var(--fs-dense); line-height: 1.4; cursor: default; outline: none; user-select: none; }",
    ".ui-menu-item:hover, .ui-menu-item:focus, .ui-menu-item[data-highlighted] { background: var(--shell-border); }",
    ".ui-menu-item[data-disabled] { opacity: 0.55; pointer-events: none; }",
    ".ui-menu-label { padding: var(--s1) var(--s2); color: var(--shell-fg-muted); font-size: var(--fs-caption); }",
    ".ui-menu-separator { height: 1px; margin: var(--s1) 0; background: var(--shell-border); }",

    // ---- Dialog (Radix) + Sheet ----
    ".ui-dialog-overlay { position: fixed; inset: 0; z-index: 70; background: color-mix(in srgb, var(--shell-bg) 70%, transparent); }",
    '.ui-dialog-overlay[data-state="open"] { animation: ui-fade-in 120ms ease-out; }',
    ".ui-dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 71; width: min(92vw, 440px); max-height: 85vh; overflow-y: auto; padding: var(--s4); border-radius: var(--radius-3); border: 1px solid var(--shell-border); background: var(--shell-surface); color: var(--shell-fg); box-shadow: 0 12px 40px color-mix(in srgb, var(--shell-bg) 70%, transparent); }",
    ".ui-dialog-title { margin: 0 0 var(--s2); font-size: var(--fs-lead); font-weight: 600; line-height: 1.25; }",
    ".ui-dialog-desc { margin: 0 0 var(--s3); color: var(--shell-fg-muted); font-size: var(--fs-dense); }",
    ".ui-dialog-actions { display: flex; justify-content: flex-end; gap: var(--s2); margin-top: var(--s4); }",
    // Sheet: the panel variant on Dialog (REQ-IDE-41 kept — `modal={false}` mounts no overlay, no
    // focus trap, no scroll lock; outside content stays interactive). Width + slide duration are
    // the tokens' pane values (LAYOUT.timelinePx / MOTION.paneMs).
    ".ui-sheet { position: fixed; top: 0; bottom: 0; z-index: 70; display: flex; flex-direction: column; gap: var(--s2); padding: var(--s4); overflow-y: auto; background: var(--shell-surface); color: var(--shell-fg); box-shadow: 0 0 32px color-mix(in srgb, var(--shell-bg) 60%, transparent); }",
    `.ui-sheet--right { right: 0; left: auto; width: min(92vw, ${LAYOUT.timelinePx}px); border-left: 1px solid var(--shell-border); }`,
    `.ui-sheet--left { left: 0; right: auto; width: min(92vw, ${LAYOUT.timelinePx}px); border-right: 1px solid var(--shell-border); }`,
    `.ui-sheet[data-state="open"] { animation: ui-sheet-in ${MOTION.paneMs}ms ease-out; }`,
    ".ui-sheet-title { margin: 0; font-size: var(--fs-lead); font-weight: 600; line-height: 1.25; }",
    "@keyframes ui-sheet-in { from { transform: translateX(var(--ui-sheet-shift, 24px)); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }",
    ".ui-sheet--left[data-state='open'] { --ui-sheet-shift: -24px; }",
    "@keyframes ui-fade-in { from { opacity: 0; } to { opacity: 1; } }",

    // ---- Toast (in-house queue) ----
    ".ui-toast-viewport { position: fixed; right: var(--s4); bottom: var(--s4); z-index: 80; display: flex; flex-direction: column; gap: var(--s2); width: min(92vw, 360px); margin: 0; padding: 0; list-style: none; }",
    ".ui-toast { display: flex; align-items: flex-start; gap: var(--s2); padding: var(--s2) var(--s3); border-radius: var(--radius-2); border: 1px solid var(--shell-border); border-left-width: 3px; background: var(--shell-raised); color: var(--shell-fg); box-shadow: 0 6px 24px color-mix(in srgb, var(--shell-bg) 60%, transparent); animation: ui-fade-in 160ms ease-out; }",
    ".ui-toast--ok { border-left-color: var(--state-ok); }",
    ".ui-toast--attention { border-left-color: var(--state-needs-you); }",
    ".ui-toast--danger { border-left-color: var(--sev-blocking); }",
    ".ui-toast-body-wrap { flex: 1; min-width: 0; }",
    ".ui-toast-title { font-size: var(--fs-dense); font-weight: 600; }",
    ".ui-toast-body { margin-top: 2px; color: var(--shell-fg-muted); font-size: var(--fs-dense); }",
    ".ui-toast-dismiss { flex: none; }",
  ].join("\n");
}
