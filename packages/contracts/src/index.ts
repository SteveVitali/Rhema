// @rhema/contracts — the shared Zod contracts. P0.02 makes this package the owner of every shared name:
// enum values, artifact kinds, sidecar shapes, event types, the visibility policy table, and the canonical
// vocabularies. Later tickets extend a set by spec amendment, never rename in place (REQ-IDE-50).

// vocabularies + reserved strings (REQ-SPEC-2, REQ-PROD-6, REQ-BILL-18; Appendix D.2)
export * from "./vocab.js";
export * from "./reserved-strings.js";
export * from "./vocab-lint.js";

// ids + structural enums
export * from "./ids.js";
export * from "./enums.js";

// the §8.2 visibility policy table (REQ-VIS-1, REQ-SPEC-14)
export * from "./artifact-policy.js";

// domain value objects and row schemas (§11.3)
export * from "./domain/anchor.js";
export * from "./domain/common.js";
export * from "./domain/claims.js";
export * from "./domain/findings.js";
export * from "./domain/obligations.js";
export * from "./domain/gates.js";
export * from "./domain/guidance.js";
export * from "./domain/conversion.js";
export * from "./domain/export.js";

// per-seat agent-type configuration (§7.1; P1.11 — the Assistant row + per-turn budgets)
export * from "./domain/agent-types.js";

// versioned provider rate tables + list-cost math (REQ-SPEC-11, REQ-BILL-2; §12.7, §14.1)
export * from "./domain/rates.js";
export * from "./domain/estimate.js";

// structured-output sidecars (REQ-SPEC-12, REQ-OBJ-16)
export * from "./sidecars.js";

// isomorphic sha256 (pure TS — DOM-free packages + browser bundles can't use node:crypto)
export * from "./sha256.js";

// run events (§12.5) + agent.note templates (REQ-ARCH-14)
export * from "./events.js";
export * from "./notes.js";

// notification event types, preferences, and email templates (§5.11/§10.4; REQ-IDE-47/REQ-ACCT-1; PRB.09)
export * from "./notifications.js";

// analytics event catalogue (design/9 §7.2; REQ-BETA-6…12)
export * from "./analytics.js";

// signup admission mode + the beta-grade abuse throttle (PRB.13; REQ-BETA-19 amended 2026-09-16)
export * from "./signup.js";
export * from "./rate-limit.js";

// the quarantine-upload wire contract (REQ-ARCH-24; §13.3; PRB.20 — moved from @rhema/convert so the api's
// presign route + the web upload flow share the key shape without pulling the parser deps)
export * from "./upload.js";

// phone-width-shared read models (§5.7, §10.5)
export * from "./views.js";

// the M17 block-patch contract (REQ-MOBILE-6; §10.2) — schema + service in P1.03, mobile client 1.x
export * from "./block-patch.js";

// deploy provenance (REQ-ARCH-39) — kept from P0.01
export * from "./provenance.js";
