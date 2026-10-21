// @rhema/orchestrator — the run-orchestration core (§12.4): the state machine, run creation, lock-set
// concurrency, provisioning, the internal run API, the reaper, the phase loop, and the §6.3 project-state
// function. Pure and dependency-injected; apps/api and apps/worker are thin adapters over it (P0.08).

export * from "./state-machine.js";
export * from "./error-class.js";
export * from "./capabilities.js";
export * from "./project-state.js";
export * from "./locks.js";
export * from "./completion-oracle.js";

export * from "./clock.js";
export * from "./ids.js";
export * from "./tx.js";
export * from "./queue.js";
export * from "./heartbeat.js";
export * from "./token.js";
export * from "./ledger.js";
export * from "./event-writer.js";
export * from "./event-store.js";
export * from "./event-stream.js";
export * from "./credentials.js";
export * from "./transition.js";

export * from "./run-creation.js";
export * from "./cancel.js";
export * from "./run-shape.js";
export * from "./allowlist.js";
export * from "./provision.js";
export * from "./resolver.js";
export * from "./user-sources.js";
export * from "./internal-api.js";
export * from "./research-budget.js";
export * from "./runspec.js";
export * from "./delivery.js";
export * from "./citation-completeness.js";
export * from "./reaper.js";
export * from "./stranded-sweep.js";
export * from "./spend.js";
export * from "./phase-loop.js";
export * from "./commit-decision.js";
export * from "./credit-renderer.js";
export * from "./reactions.js";
export * from "./pause-signals.js";
// P1.22 W9 — the §13.5 SLO probe (REQ-ARCH-34): signal registry + probeSlos over the system executor.
export * from "./slo.js";

// gates, decisions, guidance, write-back overlays (P0.10; §6.4/§6.5/§11.5)
export * from "./gate-policy.js";
export * from "./gate-overlay.js";
export * from "./gate-resolution.js";
export * from "./gate-expiry.js";
export * from "./guidance.js";

// §12.7 cross-check 1 — proxy-metered vs SDK-reported cost divergence (P0.15; REQ-SPEC-11)
export * from "./usage-crosscheck.js";

// email notifications (PRB.09; §5.11; REQ-IDE-47/REQ-ACCT-1/REQ-SPEC-20/REQ-GATE-8; closes D-P0.10-1)
export * from "./notifications.js";
export * from "./email-actions.js";
export * from "./voice-status.js";
// P1.19 — the Inbox read model + the in-app channel (§5.11; REQ-IDE-2 amended/48, REQ-MOBILE-19)
export * from "./inbox.js";

// user steering + the run walkthrough (P1.05; §5.5/§6.5)
export * from "./steering.js";
export * from "./walkthrough.js";

// P1.12 — the Approve-outline delivery consequences (§7.3: research-note copies + outline.approved)
export * from "./outline-delivery.js";

// P1.13 — the Figure run's delivery + the worker-owned `figure.render` job (§7.5; REQ-VIZ-6…9)
export * from "./figure-delivery.js";

// P1.13 — the figure-claims mount provider a Review/fact_check hydration binds (REQ-VIZ-13)
export * from "./figure-claims.js";
