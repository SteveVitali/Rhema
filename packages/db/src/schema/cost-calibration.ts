// ECON.1 (0049; REQ-SPEC-32(a), REQ-BILL-7; ADR-032) — the durable calibration store: admissible
// metered-run observations, derived cost-card cells, per-bucket cap-refit reports, and the folded
// estimator cells the API reads override-first (the durable INSTRUMENTED_OVERRIDES replacement).
import { integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const costObservations = pgTable("cost_observations", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().unique(),
  workspaceId: text("workspace_id").notNull(),
  workflow: text("workflow").notNull(),
  rigor: text("rigor").notNull(),
  modelTier: text("model_tier").notNull(),
  sizeBand: text("size_band").notNull(),
  outcome: text("outcome").notNull(),
  proxyCredits: integer("proxy_credits").notNull(),
  proxyListCostUsd: numeric("proxy_list_cost_usd").notNull(),
  committedCredits: integer("committed_credits").notNull(),
  estimateCredits: integer("estimate_credits"),
  words: integer("words"),
  claims: integer("claims"),
  phases: integer("phases"),
  admissible: boolean("admissible").notNull(),
  inadmissibleReason: text("inadmissible_reason"),
  source: text("source").notNull(),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const costCardCells = pgTable(
  "cost_card_cells",
  {
    workflow: text("workflow").notNull(),
    rigor: text("rigor").notNull(),
    modelTier: text("model_tier").notNull(),
    sizeBand: text("size_band").notNull(),
    outcome: text("outcome").notNull(),
    n: integer("n").notNull(),
    p50Credits: numeric("p50_credits"),
    p95Credits: numeric("p95_credits"),
    p50Usd: numeric("p50_usd"),
    p95Usd: numeric("p95_usd"),
    fitVersion: text("fit_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workflow, t.rigor, t.modelTier, t.sizeBand, t.outcome] })],
);

export const capCalibrationReports = pgTable("cap_calibration_reports", {
  id: text("id").primaryKey(),
  workflow: text("workflow").notNull(),
  rigor: text("rigor").notNull(),
  modelTier: text("model_tier").notNull(),
  sizeBand: text("size_band").notNull(),
  sampleRuns: integer("sample_runs").notNull(),
  p95Ratio: numeric("p95_ratio"),
  capMultiplier: numeric("cap_multiplier").notNull(),
  capReachPct: numeric("cap_reach_pct"),
  adopted: boolean("adopted").notNull().default(false),
  note: text("note"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const estimatorCells = pgTable("estimator_cells", {
  workflow: text("workflow").primaryKey(),
  spec: jsonb("spec").notNull(),
  runsBehind: text("runs_behind").array().notNull().default([]),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
