// `uiCss()` — the stylesheet for the `primitives/**` component kit (R7KIT.2 + 225a_R7KIT.2b;
// REQ-KIT-2, REQ-KIT-5; ADR-129; UXC-15). Like `themeCss()`/`ideCss()` it is GENERATED: one
// function emits every `.ui-*` rule, so the primitives carry zero inline spacing/type/colour/
// radius literals — their JSX names classes, this file owns the values. Values come from the
// tokens two ways: `var(--…)` references (spacing `--s*`, type `--fs-*`, radius `--radius-*`,
// palette `--shell-*`/`--state-*`/`--sev-*` — so light and dark both resolve through the one
// token layer) and the typed maps (`LAYOUT`, `MOTION`) where the token is a value, not a var.
//
// The moved `primitives.tsx` exports (Pill/Chip/FetchedUrlChip/ActionLink — `primitives/chips.tsx`)
// emit the SAME declaration values their inline styles did; the `.ui-pill*`/`.ui-chip*`/
// `.ui-fetch-chip*`/`.ui-action-link` rules are pinned against those values by test, which is the
// rendered-behaviour-unchanged proof. C6 lives here: `.ui-chip` carries no cursor — only the
// interactive `button.ui-chip` gets `cursor: pointer`.
//
// Bound: inlined verbatim into every SPA shell + SSR document — asserted ≤ 24 kB raw (REQ-KIT-5);
// 225a's additions must fit the same bound.

import { LAYOUT, MOTION } from "@rhema/tokens";

export function uiCss(): string {
  return [
    ".ui-kbd, .ui-skeleton, .ui-tooltip, .ui-menu-item, .ui-select-item, .ui-checkbox, .ui-command-item, .ui-vc-pre { border-radius: var(--radius-1); }",
    ".ui-fetch-chip, .ui-prow-title, .ui-prow-open, .ui-prow-menu-link, .ui-vc-link, .ui-toolbar-active, .ui-toolbar-clear, .ui-vc-acc, .ui-vc-tab { text-decoration: none; }",
    ".ui-tooltip, .ui-menu-item, .ui-select-item, .ui-command-item { line-height: 1.4; }",
    ".ui-tooltip, .ui-menu-item, .ui-menu-label, .ui-command-group [cmdk-group-heading], .ui-select-item, .ui-command-item { padding: var(--s1) var(--s2); }",
    ".ui-dialog, .ui-prow-list, .ui-c2-pv, .ui-c2-pvs { border-radius: var(--radius-3); }",
    ".ui-prow-title, .ui-matrix th { font-weight: 500; }",
    ".ui-ob-drop, .ui-c2-img, .ui-c2-pre, .ui-os-card { border-radius: var(--radius-2); }",
    // ---- visually-hidden helper (accessible names without visual chrome) ----
    ".ui-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); border: 0; }",

    // ---- shared control chrome (240a_R7KIT.3a2) — the declarations the primitives' rules used
    // to repeat, hoisted once per family so the voices `.ui-vc-*` block fits the ≤24 kB bound.
    // The groups sit before every member rule and change no computed value (identical decls,
    // identical cascade; `--warn`/`--acc`/`[data-state]`/`[aria-checked]`/`--invalid` overrides
    // still land later). Form-element font/size/line-height/color decls are dropped outright —
    // `themeCss()` already gives `button/input/select/textarea` the same values. ----
    ".ui-badge, .ui-pill, .ui-chip, .ui-btn, .ui-kbd, .ui-tooltip, .ui-menu, .ui-dialog, .ui-toast, .ui-popover, .ui-select-trigger, .ui-select-content, .ui-checkbox, .ui-radio-item, .ui-switch, .ui-command, .ui-field, .ui-radio-card, .ui-accordion, .ui-prow-list, .ui-prow-open, .ui-inbox-row, .ui-set-card, .ui-vc-card, .ui-vc-pre, .ui-vc-diff { border: 1px solid var(--shell-border); }",
    ".ui-btn, .ui-menu, .ui-toast, .ui-popover, .ui-select-trigger, .ui-select-content, .ui-command, .ui-field, .ui-radio-card, .ui-accordion, .ui-prow-open, .ui-inbox-row, .ui-set-card, .ui-vc-card, .ui-vc-diff { border-radius: var(--radius-2); }",
    ".ui-badge, .ui-pill, .ui-btn, .ui-tooltip, .ui-menu, .ui-popover, .ui-select-trigger, .ui-select-content, .ui-toast, .ui-checkbox, .ui-radio-item, .ui-command, .ui-field, .ui-radio-card { background: var(--shell-raised); }",

    // ---- Button / IconButton ----
    ".ui-btn { cursor: pointer; text-decoration: none; }",
    ".ui-btn:hover:not(:disabled), .ui-field:hover:not(:disabled) { border-color: var(--shell-fg-faint); }",
    ".ui-btn:active:not(:disabled), .ui-menu-item:hover, .ui-menu-item:focus, .ui-menu-item[data-highlighted], .ui-select-item[data-highlighted] { background: var(--shell-border); }",
    ".ui-btn:disabled, .ui-select-trigger[data-disabled], .ui-tabs-trigger[data-disabled], .ui-checkbox[data-disabled], .ui-radio-item[data-disabled], .ui-switch[data-disabled], .ui-field:disabled, .ui-radio-card[aria-disabled='true'], .ui-accordion-trigger:disabled { opacity: 0.55; cursor: not-allowed; }",
    ".ui-btn:focus-visible, .ui-select-trigger:focus-visible, .ui-field:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-color: var(--accent); }",
    ".ui-btn--primary { background: var(--accent); border-color: transparent; color: var(--shell-bg); }",
    ".ui-btn--primary:hover:not(:disabled) { border-color: transparent; }",
    ".ui-btn--ghost { background: transparent; border-color: transparent; }",
    ".ui-btn--ghost:hover:not(:disabled) { background: var(--shell-raised); border-color: var(--shell-border); color: var(--shell-fg); }",
    ".ui-btn--danger, .ui-badge--danger { border-color: var(--sev-blocking); color: var(--sev-blocking); }",
    ".ui-btn--danger:hover:not(:disabled) { background: var(--sev-blocking); color: var(--shell-bg); }",
    ".ui-btn--sm { padding: var(--s1) var(--s2); }",
    ".ui-btn--icon { padding: var(--s1); line-height: 1; }",
    ".ui-btn--icon > svg, .ui-icon { width: 1em; height: 1em; }",

    // ---- Badge ----
    ".ui-badge { padding: 1px var(--s2); border-radius: var(--radius-pill); color: var(--shell-fg); line-height: 1.5; }",
    ".ui-badge--accent { border-color: var(--accent); color: var(--accent); }",
    ".ui-badge--ok { border-color: var(--state-ok); color: var(--state-ok); }",
    ".ui-badge--attention { border-color: var(--state-needs-you); color: var(--state-needs-you); }",

    // ---- Kbd ----
    ".ui-kbd { padding: 0 var(--s1); border-bottom-width: 2px; background: var(--shell-surface); font-family: var(--font-mono); line-height: 1.5; }",

    // ---- Skeleton ----
    "@keyframes ui-skeleton { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }",
    ".ui-skeleton { inline-size: var(--ui-skeleton-w, 100%); block-size: var(--ui-skeleton-h, 1em); background: var(--shell-border); animation: ui-skeleton 1.4s ease-in-out infinite; }",

    // ---- moved primitives.tsx exports — same declarations, now classes (rendered behaviour
    // pinned unchanged; radius/size steps resolve to the tokens where the value is identical) ----
    ".ui-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: var(--radius-pill); color: var(--shell-fg); font-variant-numeric: tabular-nums; }",
    ".ui-pill-dot { width: 7px; height: 7px; border-radius: var(--radius-pill); background: var(--shell-fg-muted); }",
    ".ui-pill--running .ui-pill-dot, .ui-prow-dot--running { background: var(--state-running); }",
    ".ui-pill--needs-you .ui-pill-dot, .ui-prow-dot--needs { background: var(--state-needs-you); }",
    ".ui-pill--ready .ui-pill-dot, .ui-prow-dot--ready { background: var(--state-ready); }",
    ".ui-pill--attention .ui-pill-dot { background: var(--sev-major); }",
    ".ui-chip { gap: 5px; padding: 1px 8px; border-radius: 6px; background: var(--shell-surface); color: var(--ui-chip-fg, var(--shell-fg-muted)); text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }",
    ".ui-fetch-chip { gap: 5px; padding: 1px 8px; border-radius: 6px; border: 1px solid var(--state-ready); background: var(--shell-surface); font-variant-numeric: tabular-nums; }",
    '.ui-fetch-chip[data-fetched="search"] { border-color: var(--paper-rule); }',
    ".ui-fetch-chip-mark, .ui-set-t--ok { color: var(--state-ready); }",
    ".ui-action-link { display: inline-block; padding: 6px 14px; border-radius: var(--radius-2); background: var(--accent); color: var(--shell-bg); text-decoration: none; }",

    // ---- Tooltip (Radix) ----
    ".ui-tooltip { z-index: 60; max-width: 260px; box-shadow: 0 4px 16px color-mix(in srgb, var(--shell-bg) 60%, transparent); }",
    ".ui-tooltip-arrow, .ui-popover-arrow { fill: var(--shell-raised); }",
    '.ui-tooltip[data-state="delayed-open"], .ui-tooltip[data-state="instant-open"] { animation: ui-fade-in 120ms ease-out; }',

    // ---- DropdownMenu (Radix) ----
    ".ui-menu { z-index: 60; min-width: 160px; padding: var(--s1); box-shadow: 0 6px 24px color-mix(in srgb, var(--shell-bg) 60%, transparent); }",
    '.ui-menu[data-state="open"] { animation: ui-fade-in 120ms ease-out; }',
    ".ui-menu-item { cursor: default; outline: none; user-select: none; }",

    ".ui-menu-item[data-disabled], .ui-select-item[data-disabled] { opacity: 0.55; pointer-events: none; }",
    ".ui-menu-separator { height: 1px; margin: var(--s1) 0; background: var(--shell-border); }",

    // ---- Dialog (Radix) + Sheet ----
    ".ui-dialog-overlay { position: fixed; inset: 0; z-index: 70; background: color-mix(in srgb, var(--shell-bg) 70%, transparent); }",
    '.ui-dialog-overlay[data-state="open"] { animation: ui-fade-in 120ms ease-out; }',
    ".ui-dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 71; width: min(92vw, 440px); max-height: 85vh; overflow-y: auto; padding: var(--s4); background: var(--shell-surface); box-shadow: 0 12px 40px color-mix(in srgb, var(--shell-bg) 70%, transparent); }",
    ".ui-dialog-title { margin: 0 0 var(--s2); font-size: var(--fs-lead); line-height: 1.25; }",
    ".ui-dialog-desc { margin: 0 0 var(--s3); }",
    ".ui-dialog-actions { justify-content: flex-end; margin-top: var(--s4); }",
    // Sheet: the panel variant on Dialog (REQ-IDE-41 kept — `modal={false}` mounts no overlay, no
    // focus trap, no scroll lock; outside content stays interactive). Width + slide duration are
    // the tokens' pane values (LAYOUT.timelinePx / MOTION.paneMs).
    ".ui-sheet { position: fixed; top: 0; bottom: 0; z-index: 70; padding: var(--s4); overflow-y: auto; background: var(--shell-surface); box-shadow: 0 0 32px color-mix(in srgb, var(--shell-bg) 60%, transparent); }",
    `.ui-sheet--right { right: 0; left: auto; width: min(92vw, ${LAYOUT.timelinePx}px); border-left: 1px solid var(--shell-border); }`,
    `.ui-sheet--left { left: 0; right: auto; width: min(92vw, ${LAYOUT.timelinePx}px); border-right: 1px solid var(--shell-border); }`,
    `.ui-sheet[data-state="open"] { animation: ui-sheet-in ${MOTION.paneMs}ms ease-out; }`,
    ".ui-sheet-title { margin: 0; font-size: var(--fs-lead); line-height: 1.25; }",
    "@keyframes ui-sheet-in { from { transform: translateX(var(--ui-sheet-shift, 24px)); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }",
    ".ui-sheet--left[data-state='open'] { --ui-sheet-shift: -24px; }",
    "@keyframes ui-fade-in { from { opacity: 0; } to { opacity: 1; } }",

    // ---- Toast (in-house queue) ----
    ".ui-toast-viewport { position: fixed; right: var(--s4); bottom: var(--s4); z-index: 80; width: min(92vw, 360px); margin: 0; }",
    ".ui-toast { align-items: flex-start; padding: var(--s2) var(--s3); border-left-width: 3px; box-shadow: 0 6px 24px color-mix(in srgb, var(--shell-bg) 60%, transparent); animation: ui-fade-in 160ms ease-out; }",
    ".ui-toast--ok { border-left-color: var(--state-ok); }",
    ".ui-toast--attention { border-left-color: var(--state-needs-you); }",
    ".ui-toast--danger { border-left-color: var(--sev-blocking); }",
    ".ui-toast-body-wrap, .ui-vc-grow { flex: 1; min-width: 0; }",
    ".ui-toast-body { margin-top: 2px; }",
    ".ui-toast-dismiss { flex: none; }",

    // ---- 225a_R7KIT.2b — the form/menu primitives ----
    // Shared Lucide icon sizing (the check/chevron glyphs render at text size).

    // C6 — the interactive chip variant is the ONLY chip with a pointer affordance (a static
    // `.ui-chip` keeps none); the button resets to the chip's own typography.
    "button.ui-chip { cursor: pointer; }",
    ".ui-vc-sum { cursor: pointer; }",

    // ---- Popover (Radix) ----
    ".ui-popover { z-index: 60; min-width: 180px; max-width: 320px; padding: var(--s2); box-shadow: 0 6px 24px color-mix(in srgb, var(--shell-bg) 60%, transparent); }",
    '.ui-popover[data-state="open"] { animation: ui-fade-in 120ms ease-out; }',

    // ---- Select (Radix) ----
    ".ui-select-trigger { justify-content: space-between; cursor: pointer; }",
    ".ui-select-content { z-index: 60; min-width: var(--radix-select-trigger-width); padding: var(--s1); box-shadow: 0 6px 24px color-mix(in srgb, var(--shell-bg) 60%, transparent); }",
    '.ui-select-content[data-state="open"] { animation: ui-fade-in 120ms ease-out; }',
    ".ui-select-item { justify-content: space-between; cursor: default; outline: none; user-select: none; }",

    ".ui-select-item-indicator { color: var(--accent); }",

    // ---- Tabs (Radix) ----
    ".ui-tabs-list { border-bottom: 1px solid var(--shell-border); }",
    ".ui-tabs-trigger { padding: var(--s1) var(--s3); border: none; border-bottom: 2px solid transparent; background: transparent; cursor: pointer; }",
    '.ui-tabs-trigger[data-state="active"] { color: var(--shell-fg); border-bottom-color: var(--accent); }',
    ".ui-tabs-trigger:focus-visible, .ui-command-input:focus-visible, .ui-accordion-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }",

    ".ui-tabs-content { padding-top: var(--s3); }",

    // ---- Checkbox / RadioGroup / Switch (Radix) ----
    ".ui-checkbox { width: 16px; height: 16px; cursor: pointer; }",
    '.ui-checkbox[data-state="checked"] { background: var(--accent); border-color: var(--accent); color: var(--shell-bg); }',
    ".ui-checkbox:focus-visible, .ui-radio-item:focus-visible, .ui-switch:focus-visible, .ui-radio-card:focus-visible, .ui-prow-open:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }",
    ".ui-radio-item { width: 16px; height: 16px; border-radius: var(--radius-pill); cursor: pointer; }",
    '.ui-radio-item[data-state="checked"] { border-color: var(--accent); }',
    ".ui-radio-indicator { width: 8px; height: 8px; border-radius: var(--radius-pill); background: var(--accent); }",

    ".ui-switch { position: relative; width: 32px; height: 18px; border-radius: var(--radius-pill); background: var(--shell-border); cursor: pointer; }",
    '.ui-switch[data-state="checked"] { background: var(--accent); border-color: var(--accent); }',

    ".ui-switch-thumb { width: 12px; height: 12px; border-radius: var(--radius-pill); background: var(--shell-fg); transform: translateX(3px); transition: transform 120ms ease-out; }",
    '.ui-switch[data-state="checked"] .ui-switch-thumb { transform: translateX(16px); background: var(--shell-bg); }',

    // ---- cmdk Combobox + palette list base ----
    ".ui-command { overflow: hidden; }",
    ".ui-command-input { width: 100%; padding: var(--s2) var(--s3); border: none; border-bottom: 1px solid var(--shell-border); background: transparent; outline: none; }",
    ".ui-command-list { max-height: 280px; overflow-y: auto; padding: var(--s1); }",
    ".ui-command-item { cursor: default; user-select: none; }",
    '.ui-command-item[data-selected="true"] { background: var(--shell-border); }',
    '.ui-command-item[data-disabled="true"] { opacity: 0.55; pointer-events: none; }',
    ".ui-command-empty { padding: var(--s3); }",

    // ---- TextField / TextArea ----
    ".ui-field { width: 100%; }",

    ".ui-field--invalid, .ui-field[aria-invalid='true'] { border-color: var(--sev-blocking); }",
    // Auto-grow TextArea: the JS writes height, so manual resize is off to avoid a tug-of-war.
    ".ui-field--area { resize: none; }",

    // ---- RadioCards (in-house) ----
    ".ui-radio-cards { display: grid; }",
    ".ui-radio-card { padding: var(--s2) var(--s3); cursor: pointer; }",
    ".ui-radio-card[aria-checked='true'], .ui-vc-card--acc { border-color: var(--accent); }",

    // ---- EmptyState ----
    ".ui-empty { padding: var(--s6) var(--s4); text-align: center; }",

    ".ui-empty-title { margin: 0; font-size: var(--fs-lead); }",
    ".ui-empty-body { margin: 0; max-width: 46ch; }",
    ".ui-empty-action, .ui-rs-det { margin-top: var(--s2); }",

    // ---- Accordion (in-house) ----
    ".ui-accordion { overflow: hidden; }",
    ".ui-accordion-item + .ui-accordion-item { border-top: 1px solid var(--shell-border); }",
    ".ui-accordion-trigger { justify-content: space-between; width: 100%; padding: var(--s2) var(--s3); border: none; background: transparent; text-align: left; cursor: pointer; }",

    ".ui-accordion-chevron { transition: transform 120ms ease-out; }",
    ".ui-accordion-trigger[aria-expanded='true'] .ui-accordion-chevron { transform: rotate(180deg); }",
    ".ui-accordion-panel { padding: 0 var(--s3) var(--s3); }",

    // ---- R7HOME.1 (batch c1) — the flat projects list + home toolbar ----
    ".ui-prow-home { gap: var(--s4); }",
    ".ui-prow-section { margin: 0; }",
    ".ui-prow-heading { margin: 0 0 var(--s2); letter-spacing: 0.04em; text-transform: uppercase; }",
    ".ui-prow-heading-pill { margin-left: var(--s2); text-transform: none; letter-spacing: 0; }",
    ".ui-prow-heading-note { font-weight: 400; text-transform: none; letter-spacing: 0; }",

    ".ui-prow-list { margin: 0; overflow: hidden; background: var(--shell-surface); }",
    ".ui-prow { gap: var(--s3); padding: var(--s3) var(--s4); border-bottom: 1px solid var(--shell-border); }",
    ".ui-prow:last-child { border-bottom: none; }",
    ".ui-prow-dot { flex: 0 0 auto; width: 9px; height: 9px; border-radius: var(--radius-pill); background: var(--shell-fg-faint); }",

    ".ui-prow-dot--quiet { background: var(--shell-fg-faint); }",
    ".ui-prow-dot--failed { background: var(--sev-blocking); }",
    ".ui-prow-main { flex: 1 1 240px; min-width: 0; }",
    ".ui-prow-title { font-size: var(--fs-lead); overflow: hidden; text-overflow: ellipsis; }",
    ".ui-prow-title:hover { text-decoration: underline; }",
    ".ui-prow-status { flex-basis: 100%; overflow: hidden; text-overflow: ellipsis; }",
    ".ui-prow-edited { flex: 0 0 auto; }",
    ".ui-prow-open { flex: 0 0 auto; padding: var(--s1) var(--s3); opacity: 0; }",
    ".ui-prow:hover .ui-prow-open, .ui-prow:focus-within .ui-prow-open, .ui-prow-open:focus-visible { opacity: 1; }",
    ".ui-prow-menu-est { margin-left: auto; padding-left: var(--s3); font-variant-numeric: tabular-nums; }",
    ".ui-menu-item--danger { color: var(--sev-blocking); }",

    // Toolbar (search + filter/sort/group-by menus) — instant apply, one compact row.
    ".ui-toolbar { margin-bottom: var(--s4); }",
    ".ui-toolbar-search { flex: 1 1 200px; min-width: 160px; max-width: 320px; }",
    ".ui-toolbar-active { padding: 1px var(--s2); border-radius: var(--radius-pill); border: 1px solid var(--accent); color: var(--accent); }",

    // Inbox (batch c1) — the migrated row + control chrome.
    ".ui-inbox-badge-line { margin: var(--s2) 0 var(--s4); }",
    ".ui-inbox-row { padding: var(--s2) var(--s3); background: var(--shell-surface); margin-bottom: var(--s2); }",
    ".ui-inbox-row--unread { border-left: 3px solid var(--accent); }",
    ".ui-inbox-row--read { opacity: 0.8; }",
    ".ui-inbox-title { margin: 0 0 var(--s1); font-size: var(--fs-lead); }",

    ".ui-inbox-body { margin: 0 0 var(--s2); }",

    ".ui-inbox-meta { margin: var(--s1) 0 0; }",
    ".ui-inbox-section { margin-bottom: var(--s5); max-width: 72ch; }",
    ".ui-inbox-heading { margin: 0 0 var(--s2); font-size: var(--fs-lead); }",
    ".ui-inbox-empty { max-width: 68ch; font-size: var(--fs-lead); }",
    ".ui-inbox-card { margin: var(--s2) 0; }",
    ".ui-inbox-actions { gap: var(--s3); margin: 0; }",

    // ---- R7KIT.3a (batch a) — settings / billing / usage vocabulary. Terse on purpose:
    // the ≤24 kB inline bound holds across every batch; surfaces reuse `.ui-set-*`,
    // `.ui-matrix` and `.ui-bill-*` instead of re-declaring per-file rules. Body text is
    // var(--shell-fg) by default, so the rules declare it only when it differs. ----
    ".ui-set-main { max-width: 640px; }",
    ".ui-set-nav { gap: var(--s3); }",

    '.ui-set-nav a[aria-current="page"] { color: var(--shell-fg); font-weight: 600; }',
    ".ui-set-sec { margin-top: var(--s6); }",
    ".ui-set-h2 { font-size: var(--fs-lead); margin: 0 0 var(--s2); }",
    ".ui-set-h3, .ui-set-fs legend { margin: 0 0 var(--s2); }",
    ".ui-set-fs { border: none; margin: var(--s2) 0 0; }",
    ".ui-set-row { margin: var(--s2) 0; }",
    ".ui-set-row--split { justify-content: space-between; }",
    ".ui-set-note { margin: var(--s1) 0; }",
    ".ui-set-t, .ui-set-list { margin: var(--s1) 0; }",

    ".ui-set-t--warn { color: var(--sev-major); }",
    ".ui-set-t--meas { max-width: 68ch; }",
    ".ui-set-card { padding: var(--s2) var(--s3); margin: var(--s2) 0; }",
    ".ui-set-card--warn { border-color: var(--sev-major); }",
    ".ui-set-list { padding-left: 1em; }",
    ".ui-set-list--plain { padding-left: 0; }",
    ".ui-set-inline, .ui-vc-tag { margin-left: var(--s2); }",
    ".ui-field--w { max-width: 9em; }",
    ".ui-matrix { border-collapse: collapse; }",
    ".ui-matrix th, .ui-matrix td { padding: var(--s1) var(--s3) var(--s1) 0; }",
    ".ui-matrix th { text-align: left; }",
    ".ui-matrix td.ui-matrix-r { text-align: right; }",
    ".ui-matrix td.ui-matrix-r, .ui-bill-price { font-variant-numeric: tabular-nums; }",
    ".ui-bill-head { justify-content: space-between; }",
    ".ui-bill-pack { margin: 0 var(--s2) var(--s2) 0; }",

    // ---- 240a_R7KIT.3a2 (batch a part 2) — the voices surface. Same terse posture as `.ui-set-*`:
    // only the voices-only shapes get rules; tones/labels reuse `.ui-set-t--*`/`.ui-prow-heading`,
    // flex rows reuse `.ui-set-form`, tab styling reuses `.ui-tabs-*` (`data-state` mirrors Radix's
    // own active selector onto the anchors). `.ui-vc-card`/`.ui-vc-pre`/`.ui-vc-diff` take border +
    // radius from the shared-chrome groups above. ----
    ".ui-vc-card { padding: var(--s2) var(--s3); margin-bottom: var(--s2); }",
    ".ui-vc-lab .ui-field, .ui-vc-lab .ui-select-trigger, .ui-rs-mt { margin-top: var(--s1); }",
    ".ui-vc-form > * + * { margin-top: var(--s3); }",
    ".ui-vc-btns { margin: var(--s2) 0; }",
    ".ui-vc-list { margin: 0; }",

    ".ui-vc-up { text-transform: uppercase; letter-spacing: 0.04em; }",
    ".ui-vc-acc { color: var(--accent); }",

    ".ui-vc-ct { margin-top: var(--s2); padding-top: var(--s2); border-top: 1px solid var(--shell-border); }",
    ".ui-vc-sec { margin-top: var(--s4); }",
    ".ui-vc-pre { margin: 0; padding: var(--s2); max-height: 320px; overflow: auto; white-space: pre-wrap; }",
    ".ui-vc-diff { margin: 0; max-width: 88ch; padding: var(--s2) var(--s3); white-space: pre-wrap; }",
    ".ui-vc-prewrap { white-space: pre-wrap; }",
    ".ui-vc-tabs { margin: var(--s3) 0 var(--s4); }",

    ".ui-vc-w { width: 100%; }",

    // ---- 241_R7KIT.3b (batch b) — run sheet / export / onboarding. Reuses `.ui-set-*`,
    // `.ui-vc-*`, `.ui-bill-head`, `.ui-pill`, `.ui-set-card` (the export fieldset's chrome);
    // only the batch-b-only shapes get rules. Focus outlines come from the global
    // `:focus-visible` rule in themeCss — no per-class restatement. ----
    ".ui-rs-h,.ui-rs-lead { font-size: var(--fs-lead); }",
    ".ui-rs-h { margin: 0; }",
    ".ui-rs-lead { line-height: 1.6; }",
    ".ui-rs-time { font-weight: 400; }",
    ".ui-rs-lab { flex: 0 0 170px; }",
    ".ui-rs-box,.ui-ob-drop--over { background: var(--shell-raised); }",
    ".ui-rs-pill { border: 1px solid var(--shell-border); }",

    ".ui-rs-end { justify-content: flex-end; }",
    ".ui-ob-drop { max-width: 560px; padding: var(--s4); border: 1px dashed var(--shell-border); background: var(--shell-surface); cursor: pointer; text-align: center; }",
    ".ui-ob-drop--over { border-color: var(--accent); }",
    ".ui-ob-drop--full { max-width: 100%; }",
    ".ui-field--mono { font-family: var(--font-mono); }",

    ".ui-btn--ghost, .ui-fetch-chip-label, .ui-prow-heading-link, .ui-inbox-title--read, .ui-set-nav a, .ui-set-t--m, .ui-matrix td.ui-matrix-m, .ui-rs-time, .ui-rs-lab, .ui-menu-label, .ui-command-group [cmdk-group-heading], .ui-dialog-desc, .ui-toast-body, .ui-select-icon, .ui-tabs-trigger, .ui-command-empty, .ui-radio-card-desc, .ui-empty, .ui-accordion-chevron, .ui-prow-heading, .ui-prow-status, .ui-prow-open, .ui-toolbar-label, .ui-inbox-badge-line, .ui-inbox-body, .ui-inbox-empty, .ui-set-h3, .ui-set-fs legend, .ui-vc-lab, .ui-rs-pill { color: var(--shell-fg-muted); }",
    ".ui-select-trigger[data-placeholder], .ui-empty-icon, .ui-inbox-body--faint, .ui-set-note, .ui-set-t--f, .ui-set-list--faint, .ui-prow-version, .ui-vc-faint, .ui-prow-edited, .ui-prow-menu-est, .ui-toolbar-clear, .ui-inbox-meta, .ui-matrix th { color: var(--shell-fg-faint); }",
    ".ui-kbd, .ui-pill, .ui-chip, .ui-fetch-chip, .ui-tooltip, .ui-prow-version, .ui-vc-faint, .ui-prow-menu-est, .ui-toolbar-active, .ui-toolbar-clear { font-size: var(--fs-micro); }",
    ".ui-action-link, .ui-menu-item, .ui-dialog-desc, .ui-toast-title, .ui-toast-body, .ui-select-item, .ui-command-item, .ui-command-empty, .ui-radio-card, .ui-empty-body, .ui-accordion-panel, .ui-prow-open, .ui-inbox-badge-line, .ui-inbox-body, .ui-inbox-open, .ui-set-nav, .ui-set-h3, .ui-set-fs legend, .ui-set-row, .ui-set-t, .ui-set-list, .ui-vc-card, .ui-vc-lab, .ui-vc-name, .ui-ob-drop { font-size: var(--fs-dense); }",
    ".ui-btn--sm, .ui-badge, .ui-menu-label, .ui-command-group [cmdk-group-heading], .ui-radio-card-desc, .ui-prow-heading, .ui-prow-status, .ui-prow-edited, .ui-toolbar-label, .ui-inbox-meta, .ui-set-note, .ui-set-t--sm, .ui-set-list--faint, .ui-vc-pre, .ui-vc-diff { font-size: var(--fs-caption); }",
    // ---- 242_R7KIT.3c2 (batch c2) — outline + figures + outline-sections. The GUARD-1 style-key
    // ban covers spacing/type/colour/radius only: layout keys (display, flex, list-style, cursor,
    // the border shorthand) stay inline in the migrated files; `.ui-set-*`/`.ui-vc-*`/
    // `.ui-inbox-row` are reused wherever the shape matches. Only batch-c2 shapes below; the
    // shared text decls hoist once into the two groups (same decls, same cascade). ----
    ".ui-c2-ts, .ui-c2-dl, .ui-c2-pre, .ui-os-ol, .ui-os-ul, .ui-os-lf, .ui-os-b { color: var(--shell-fg-muted); }",
    ".ui-c2-ts, .ui-c2-dl, .ui-c2-pre, .ui-os-ol, .ui-os-ul, .ui-os-lf, .ui-os-t, .ui-c2-w, .ui-os-i, .ui-vc-faint { font-size: var(--fs-micro); }",
    ".ui-c2-p0, .ui-c2-facts, .ui-c2-ih, .ui-os-d, .ui-c2-a { font-size: var(--fs-dense); }",
    ".ui-os-i, .ui-os-fnt { color: var(--shell-fg-faint); }",
    ".ui-c2-ml { margin-left: var(--s3); }",
    ".ui-tok { color: var(--state-ok); }",
    ".ui-c2-w { color: var(--sev-major); }",
    ".ui-c2-m0 { margin: 0; }",
    ".ui-c2-p0 { margin: 0; }",
    ".ui-c2-act { margin-top: var(--s3); }",
    ".ui-c2-mt { margin-top: var(--s2); }",
    ".ui-c2-mt3 { margin-top: var(--s3); }",
    ".ui-c2-mt4 { margin-top: var(--s4); }",
    ".ui-c2-mv { margin: var(--s1) 0 var(--s3); }",
    ".ui-c2-mb { margin: 0 0 var(--s2); }",
    ".ui-c2-g3 { gap: var(--s3); }",
    ".ui-c2-mw { max-width: 520px; }",
    ".ui-c2-mw5 { max-width: 560px; }",
    ".ui-c2-l0 { margin: 0; }",
    ".ui-c2-vl { margin: var(--s2) 0 0; }",
    ".ui-c2-img { max-width: 100%; }",
    ".ui-c2-img--l { margin-top: var(--s2); max-height: 220px; }",
    ".ui-c2-pv { padding: var(--s3); background: var(--paper-bg, var(--shell-surface)); }",
    ".ui-c2-pvs { padding: var(--s3); background: var(--shell-surface); font-size: var(--fs-micro); }",
    ".ui-c2-pre { margin: var(--s2) 0 0; padding: var(--s2); }",
    ".ui-c2-dl { margin: var(--s2) 0 0; gap: var(--s1) var(--s3); }",
    ".ui-c2-ins { margin-top: var(--s4); padding-top: var(--s3); }",
    ".ui-c2-ih { margin: 0 0 var(--s1); }",
    ".ui-c2-ca { color: var(--accent); }",
    ".ui-c2-facts { margin: 0; padding-left: 18px; }",
    ".ui-os-ol { margin: var(--s1) 0 0; padding-left: 20px; gap: 2px; }",
    ".ui-os-fs { border: none; margin: 0; }",
    ".ui-os-card { padding: var(--s2); }",
    ".ui-os-ml { margin-left: var(--s2); }",
    ".ui-os-ml1 { margin-left: var(--s1); }",
    ".ui-os-g2 { margin-top: var(--s1); }",
    ".ui-os-ul { margin: var(--s1) 0 0; padding-left: 18px; }",
    ".ui-os-gl { margin: var(--s1) 0 0; }",
    ".ui-os-fnt { margin-left: var(--s2); }",
    ".ui-os-bw { border-color: var(--sev-major); color: var(--sev-major); }",
    ".ui-os-n1 { width: 40px; }",
    ".ui-os-n4 { width: 44px; }",
    ".ui-os-n7 { width: 72px; }",
    ".ui-os-n26 { width: 260px; }",
    ".ui-os-mr { margin-top: var(--s1); }",
    ".ui-visually-hidden, .ui-btn, .ui-badge, .ui-chip, .ui-action-link, .ui-prow-title, .ui-prow-status, .ui-prow-edited { white-space: nowrap; }",
    ".ui-visually-hidden, .ui-toast-viewport, .ui-checkbox, .ui-radio-item, .ui-switch, .ui-prow-list, .ui-set-fs, .ui-vc-list, .ui-c2-l0, .ui-c2-vl, .ui-os-fs, .ui-os-gl { padding: 0; }",
    ".ui-btn--primary, .ui-action-link, .ui-dialog-title, .ui-sheet-title, .ui-toast-title, .ui-empty-title, .ui-accordion-trigger, .ui-prow-heading, .ui-inbox-heading, .ui-set-h3, .ui-set-fs legend, .ui-vc-name, .ui-vc-b, .ui-rs-h, .ui-rs-bold, .ui-c2-a, .ui-c2-ih { font-weight: 600; }",
    ".ui-sheet, .ui-toast-viewport, .ui-radio-group, .ui-command, .ui-radio-card, .ui-empty, .ui-prow-home, .ui-prow-list, .ui-set-list, .ui-set-stack, .ui-vc-list { flex-direction: column; }",
    ".ui-toast-viewport, .ui-prow-list, .ui-set-list--plain, .ui-vc-list { list-style: none; }",
    ".ui-btn, .ui-badge, .ui-pill, .ui-chip, .ui-fetch-chip, .ui-select-trigger, .ui-select-icon, .ui-select-item-indicator, .ui-checkbox, .ui-checkbox-indicator, .ui-radio-item, .ui-switch, .ui-toolbar-label, .ui-toolbar-active, .ui-rs-radio { display: inline-flex; }",
    ".ui-btn, .ui-badge, .ui-pill, .ui-chip, .ui-fetch-chip, .ui-menu-item, .ui-select-trigger, .ui-select-item, .ui-checkbox, .ui-radio-item, .ui-switch, .ui-command-item, .ui-empty, .ui-accordion-trigger, .ui-prow, .ui-prow-main, .ui-toolbar, .ui-toolbar-label, .ui-toolbar-active, .ui-inbox-actions, .ui-set-form, .ui-rs-radio { align-items: center; }",
    ".ui-btn, .ui-menu-item, .ui-dialog-actions, .ui-sheet, .ui-toast-viewport, .ui-toast, .ui-select-trigger, .ui-select-item, .ui-radio-group, .ui-command-item, .ui-radio-cards, .ui-empty, .ui-accordion-trigger, .ui-prow-main, .ui-toolbar, .ui-set-row, .ui-set-list--plain, .ui-set-form, .ui-bill-head, .ui-vc-btns, .ui-rs-end, .ui-c2-act, .ui-c2-g2, .ui-os-gl { gap: var(--s2); }",
    ".ui-btn, .ui-checkbox, .ui-radio-item { justify-content: center; }",
    ".ui-badge, .ui-tabs-list, .ui-radio-card, .ui-toolbar-label, .ui-toolbar-active, .ui-set-list, .ui-set-stack, .ui-vc-list, .ui-rs-radio, .ui-c2-g1, .ui-c2-vl, .ui-c2-facts, .ui-os-g2 { gap: var(--s1); }",
    ".ui-kbd, .ui-skeleton, .ui-bill-pack { display: inline-block; }",
    ".ui-menu-item, .ui-dialog-actions, .ui-sheet, .ui-toast-viewport, .ui-toast, .ui-select-item, .ui-tabs-list, .ui-radio-group, .ui-command, .ui-command-item, .ui-radio-card, .ui-empty, .ui-accordion-trigger, .ui-prow-home, .ui-prow-list, .ui-prow, .ui-prow-main, .ui-toolbar, .ui-inbox-actions, .ui-set-nav, .ui-set-row, .ui-set-list, .ui-set-stack, .ui-set-form, .ui-bill-head, .ui-vc-btns, .ui-vc-list, .ui-rs-end { display: flex; }",
    ".ui-switch-thumb, .ui-field, .ui-vc-lab, .ui-ob-drop, .ui-ob-sub { display: block; }",
    ".ui-prow-main, .ui-toolbar, .ui-set-form, .ui-vc-btns { flex-wrap: wrap; }",
    ".ui-set-row, .ui-bill-head { align-items: baseline; }",
  ].join("\n");
}
