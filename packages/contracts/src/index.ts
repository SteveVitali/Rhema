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

// versioned provider rate tables + list-cost math (REQ-SPEC-11, REQ-BILL-2; §12.7, §14.1)
export * from "./domain/rates.js";

// structured-output sidecars (REQ-SPEC-12, REQ-OBJ-16)
export * from "./sidecars.js";

// run events (§12.5) + agent.note templates (REQ-ARCH-14)
export * from "./events.js";
export * from "./notes.js";

// analytics event catalogue (design/9 §7.2; REQ-BETA-6…12)
export * from "./analytics.js";

// phone-width-shared read models (§5.7, §10.5)
export * from "./views.js";

// deploy provenance (REQ-ARCH-39) — kept from P0.01
export * from "./provenance.js";
