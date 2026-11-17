// Retention schedule (§13.3; REQ-ARCH-29) as pure config consumed by the worker's prune jobs.
// Each data class has an explicit retention; a test asserts every §13.3 class is present so no
// class silently loses its rule.
//
// BL-123 (2026-11-16) — the honest class → store → enforcer binding:
//   sdk-transcripts  (30d)  → run_events_internal rows — run_events.retention job
//   internal-events  (30d)  → run_events_internal      — run_events.retention job
//   audit            (90d)  → admin_actions            — admin_actions.retention job
//                          + GCS access-logs bucket   — the bucket's unscoped 90d lifecycle rule
//   usage-and-ledger (7y)   → usage_records/credit_ledger — retained, no prune before the horizon
//   restore-points   (plan) → restore_points           — per-plan write-time expiry + project.purge
// The old GCS `<class>/` lifecycle rules were dropped (dead prefixes — no writer used them).

export type RetentionClass =
  | "sdk-transcripts"
  | "internal-events"
  | "audit"
  | "usage-and-ledger"
  | "restore-points";

export interface RetentionRule {
  class: RetentionClass;
  /** Retention in days. `null` = per-plan (restore points) — resolved from the plan, not fixed. */
  days: number | null;
  description: string;
}

export const RETENTION_SCHEDULE: Record<RetentionClass, RetentionRule> = {
  "sdk-transcripts": { class: "sdk-transcripts", days: 30, description: "SDK transcripts — 30 days." },
  "internal-events": { class: "internal-events", days: 30, description: "Internal events — 30 days." },
  audit: { class: "audit", days: 90, description: "Audit log — 90 days." },
  "usage-and-ledger": {
    class: "usage-and-ledger",
    days: 2555, // 7 years
    description: "Usage records and credit ledger — 7 years (tax/audit law).",
  },
  "restore-points": {
    class: "restore-points",
    days: null,
    description: "Restore points — per plan.",
  },
};

export const RETENTION_CLASSES: RetentionClass[] = [
  "sdk-transcripts",
  "internal-events",
  "audit",
  "usage-and-ledger",
  "restore-points",
];
