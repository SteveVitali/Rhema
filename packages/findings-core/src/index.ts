// @rhema/findings-core — the framework-free disposition/anchor/deadline logic web and 1.x mobile both consume
// verbatim (§5.7, §10.2 REQ-MOBILE-4; REQ-SPEC-20 "same contracts"). The read model from rows (FindingView),
// the anchoring ladder, the disposition state machine, the second-read reconciliation states, ledger + claim
// summaries, the rubric view model, the run-card state (orchestrator-only — REQ-IDE-11), the live-feed density
// split, gate deadline math, and the runtime trust chip (derived only from access_report — REQ-PROD-2). NO
// React, NO DOM — the presentational surfaces live in @rhema/ui; this package is pure logic + types.

export const PACKAGE_NAME = "@rhema/findings-core" as const;

export * from "./anchor.js";
export * from "./disposition.js";
export * from "./find-view.js";
export * from "./reconciliation.js";
export * from "./rubric.js";
export * from "./ledger.js";
export * from "./run-card.js";
export * from "./timeline.js";
export * from "./run-report.js";
export * from "./feed.js";
export * from "./deadline.js";
export * from "./trust-chip.js";
export * from "./triage.js";
export * from "./gate-card.js";
export * from "./gate-edits.js";
export * from "./decisions.js";
export * from "./inbox.js";
export * from "./what-changed.js";
export * from "./manual-revision.js";
export * from "./voice-status.js";
// HOT.1 — the single evidence-shape read seam (ADR-019): every evidence consumer normalizes here.
export * from "./normalize-evidence.js";
// P1.14 — the Update-voice scope router + diff-of-inputs panel (REQ-SPEC-27), the hold-out spec +
// leak audit (§9.5), and the fixed §9.4 profile surfaces (section order, approve-sample card, build
// gates, hold-out reveal) — all pure over the same facts the pill derives.
export * from "./voice-update.js";
export * from "./holdout.js";
export * from "./profile-surface.js";
export * from "./charter.js";
export * from "./surface.js";
export * from "./apply.js";
