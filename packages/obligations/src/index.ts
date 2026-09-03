// @rhema/obligations — revision obligations (§11.7; REQ-OBJ-2..8, REQ-WF-7/15, REQ-DATA-26). The one
// deliberately mutable object over the immutable record. This package OWNS obligation semantics end-to-end:
// spawn at dossier delivery (the mirror's `ObligationHook`), disposition routing, the closed-world discharge
// paths, cross-round lineage matching, the §6.8 stall query feeding the Decisions inbox, the REQ-WF-7
// carried/closed/new counts reconciled with the Editor's sidecar, the re-review `obligations.json` mount, and
// the read APIs the beta obligation surfaces consume. Nothing else transitions an obligation (ticket Notes).

export * from "./types.js";
export * from "./state-machine.js";
export * from "./queries.js";
export * from "./spawn.js";
export * from "./lineage.js";
export * from "./routing.js";
export * from "./discharge.js";
export * from "./counts.js";
export * from "./stall.js";
export * from "./hook.js";
export * from "./reads.js";
export * from "./mount.js";
