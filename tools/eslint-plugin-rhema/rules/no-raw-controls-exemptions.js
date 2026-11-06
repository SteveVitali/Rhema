"use strict";

/**
 * REQ-GUARD-1 (225a_R7KIT.2b; RV-16; RV-36) — the committed no-JS/SSR exemption list for
 * `rhema/no-raw-controls`, kept as DATA so the rule, its tests and the batches all read the same
 * source. Each entry:
 *
 *   file      — repo-relative path (suffix-matched against the linted filename)
 *   component — OPTIONAL: narrows the exemption to JSX inside the named function/component
 *   reason    — why these raw controls stay; only a no-JS/SSR justification is legitimate —
 *               KIT-1's `themeCss()` element rules style these native controls permanently and
 *               Radix wrappers need client JS (RV-36). An exemption is never for residue: 249's
 *               global sweep fails an unlisted raw control even in an exempt-looking file.
 *
 * The KIT-3 batches append entries as they migrate (hidden inputs and no-JS-only forms inside
 * otherwise-migrated files get an entry with a reason each — narrow to `component` where the
 * rest of the file is migrated).
 */
module.exports = [
  {
    file: "apps/web/src/pages.tsx",
    reason:
      "SSR funnel (the login magic-link/Google forms) + the forced-SSR Page-family documents mount these controls without client JS — KIT-1-styled natives are the permanent fallback (RV-36).",
  },
  {
    file: "apps/web/src/marketing.tsx",
    reason:
      "the public landing and signup forms are no-JS forms on the SSR funnel (RV-36: signup cannot use Radix Select).",
  },
  {
    file: "packages/ui/src/chat-panel.tsx",
    component: "ChatDesk",
    reason:
      "the no-JS SSR fallback forms (composer, notes, pins, plan card, corrections, Ask) keep hidden inputs carrying threadId/ref/version/block ids — the KIT-1-styled native-form leg stays (RV-36); every visible control is a primitive.",
  },
  {
    file: "apps/web/src/page-chrome.tsx",
    reason:
      "the forced-SSR Page family's no-JS form actions (rename, voice picker, approval overrides — the phone-reader approvals, RV-36).",
  },
  {
    file: "apps/web/src/spa/surfaces/project-home.tsx",
    component: "ProjectHomeInner",
    reason:
      "the no-JS submit stays inside <noscript> on the search form (REQ-HOME-1: instant filters, Apply removed — the KIT-1-styled native submit is the SSR fallback, RV-36).",
  },
  {
    file: "apps/web/src/spa/surfaces/inbox.tsx",
    component: "InboxSurface",
    reason:
      "the mark-read form's hidden `item` id is the no-JS post's field — the KIT-1-styled native-form grammar stays (RV-36); every visible control is a primitive.",
  },
  {
    file: "apps/web/src/spa/surfaces/settings.tsx",
    component: "HiddenField",
    reason:
      "the no-JS post's hidden id carriers (sessionId, personaId) — Radix's own hidden select/radio/checkbox inputs carry the named fields, so only these ids ride a raw input (RV-36); every visible control is a primitive.",
  },
  {
    file: "apps/web/src/spa/surfaces/billing.tsx",
    component: "HiddenField",
    reason:
      "the no-JS post's hidden id carriers (tier, packId) — Radix's own hidden carriers cover the named fields, so only these ids ride a raw input (RV-36); every visible control is a primitive.",
  },
  {
    file: "apps/web/src/spa/surfaces/voices.tsx",
    component: "HiddenField",
    reason:
      "the no-JS post's hidden id/flag carriers (runId, provider, scope, tier, quarantineKey, known) — Radix's own hidden select/radio/checkbox carriers post the named fields, so only these ride a raw input (RV-36); every visible control is a primitive.",
  },
  {
    file: "apps/web/src/spa/surfaces/run-sheet.tsx",
    component: "HiddenField",
    reason:
      "the no-JS run post's hidden carriers (workflow, idempotencyKey, estimateCredits, scope, rateTableVersion, words, claims, toggleKeys, toggleRigor, entitlementId, voice_persona) — Radix's own hidden radio/checkbox/select carriers post the named lever fields, so only these ride a raw input (RV-36); every visible control is a primitive.",
  },
  {
    file: "apps/web/src/spa/surfaces/onboarding.tsx",
    component: "HiddenField",
    reason:
      "the no-JS import post's hidden heldToken carrier — Radix's own hidden carriers post the named fields, so only this id rides a raw input (RV-36); every visible control is a primitive.",
  },
  {
    file: "apps/web/src/spa/surfaces/onboarding.tsx",
    component: "FileDropzone",
    reason:
      "the visually-hidden file proxy the styled dropzone (role=button) drives via DataTransfer — no file-input primitive exists and the accessible control is the dropzone, not the input (RV-36).",
  },
  {
    file: "apps/web/src/spa/surfaces/outline.tsx",
    component: "HiddenField",
    reason:
      "the no-JS promote post's hidden carriers (scope, threadId, turnId) — Radix's own hidden carriers post the named fields, so only these ids ride a raw input (RV-36); every visible control is a primitive.",
  },
  {
    file: "apps/web/src/spa/surfaces/figures.tsx",
    component: "HiddenField",
    reason:
      "the no-JS posts' hidden carriers (spec-edit mark; iterate figureId/priorVersion/entryPoint) — Radix's own hidden carriers post the named fields, so only these ride a raw input (RV-36); every visible control is a primitive.",
  },
  {
    file: "packages/ui/src/outline-sections.tsx",
    component: "EdCheckbox",
    reason:
      "the claim strike checkbox posts `ed.claim.*.strike` inside the Approve-outline gate card's no-JS decision form — the SSR gate card renders to static HTML where a Radix toggle is inert, so this stays the KIT-1-styled native checkbox (RV-36); every other field is a TextField primitive.",
  },
  // ---- 243_R7KIT.3d (batch d) ----
  {
    file: "packages/ui/src/gate-card.tsx",
    component: "GateCheck",
    reason:
      "the `ed.*`/standing checkboxes inside the gate card's no-JS decision form — the card posts with zero client JS where a Radix toggle is inert, so these stay the KIT-1-styled native checkbox (RV-36); every text/number field is a TextField primitive and every action a Button.",
  },
  {
    file: "packages/ui/src/gate-card.tsx",
    component: "GateSelect",
    reason:
      "the `ed.runOverride` deadline select inside the gate card's no-JS decision form — a Radix Select is inert without client JS, so the KIT-1-styled native select stays (RV-36).",
  },
  {
    file: "packages/ui/src/run-sheet.tsx",
    component: "RunSheet",
    reason:
      "the @rhema/ui run sheet IS the permanent no-JS/SSR fallback (RV-36): a plain <form> whose radios, native selects, checkboxes, inputs and textareas post without JS, and the inline recompute script queries the native `input[name=rigor]`/`select[name=modelTier]` carriers — KIT-1-styled natives by name.",
  },
  {
    file: "packages/ui/src/run-sheet.tsx",
    component: "RunButton",
    reason:
      "the no-JS paywall submit inside the SSR run sheet's native form (RV-36 — the require-estimate-prop contract still pins its estimate hooks).",
  },
  {
    file: "packages/ui/src/run-sheet.tsx",
    component: "AskButton",
    reason:
      "the no-JS Assistant submit inside the SSR run sheet's native form (RV-36).",
  },
  {
    file: "packages/ui/src/findings-desk.tsx",
    component: "FilterSelect",
    reason:
      "the findings filter bar's GET form filters server-side from the SSR document — a Radix Select is inert without client JS, so the KIT-1-styled native select stays (RV-36); Apply is a Button primitive.",
  },
  {
    file: "packages/ui/src/page-editor.tsx",
    component: "TaskMark",
    reason:
      "the task-list marker is document content — a disabled + readOnly native checkbox (not a form control), so the KIT-1-styled native input stays (RV-36).",
  },
  {
    file: "apps/web/src/approval-settings.tsx",
    component: "PolicyRadio",
    reason:
      "the policy radios post natively on the SSR /p/:slug settings page — a Radix RadioGroup is inert without client JS (RV-36).",
  },
  {
    file: "apps/web/src/approval-settings.tsx",
    component: "OverrideSelect",
    reason:
      "the per-kind `ov_<kind>` override select posts natively on the SSR settings page — a Radix Select is inert without client JS (RV-36).",
  },
  {
    file: "apps/web/src/approval-settings.tsx",
    component: "HiddenField",
    reason:
      "the hidden `returnTo` post-carrier — prior batches' named exemption shape for hidden form fields (RV-36).",
  },
];
