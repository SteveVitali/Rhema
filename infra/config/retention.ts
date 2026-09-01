// Retention schedule (§13.3; REQ-ARCH-29) as pure config consumed by S3 lifecycle rules and the
// worker's purge jobs. Each data class has an explicit retention; a test asserts every §13.3 class
// is present so no class silently loses its rule.

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
