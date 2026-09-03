import type { Finding } from "@rhema/contracts";
import type { BenchmarkArm, BenchmarkDeps, SqlExecutor } from "@rhema/benchmark";

// Shared types + DI seams for @rhema/benchmark-runner — the §18 evaluation-program EXECUTION layer (P0.14). This
// package ORCHESTRATES the P0.13 @rhema/benchmark data layer + deterministic scorers; it never re-implements
// scoring. Two runtime seams are DI'd so the whole layer is deterministic in tests and so the heavy bindings land
// where they belong: `ArmExecutor` (the A4/A5 live production-engine binding is wired in P0.15's integration) and
// `JudgeModel` (the cross-family LLM judge — a real model call in production, a fake in tests).

export type { BenchmarkArm, BenchmarkDeps, SqlExecutor };
export type { Finding };

/**
 * A provider model family (REQ-EVAL-9 C-d). An LLM judge must be from a DIFFERENT family than every arm it scores,
 * so each arm config carries its model family; offline arms (A3 Grammarly, A6 human editors) carry none.
 */
export type ModelFamily = "anthropic" | "openai" | "google" | "meta" | "mistral" | string;

/**
 * One arm's runnable configuration (REQ-EVAL-6), frozen per wave and hashed. The Rhema arms (A4/A5) additionally
 * pin the production `engineBuild` + `protocolVersion` — they run the engine as it will ship, with no eval-only
 * tuning (REQ-EVAL-6/20). A1 carries the re-steelmanned prompt owner + a published flag (REQ-EVAL-18).
 */
export interface ArmConfig {
  readonly arm: BenchmarkArm;
  /** The model id(s) driving the arm (a frontier candidate for A1, the Rhema engine's model for A4/A5). */
  readonly model?: string;
  /** The provider family — null for offline arms (A3/A6); read by the cross-family judge gate (C-d). */
  readonly modelFamily?: ModelFamily;
  /**
   * The API PROVIDER whose no-training/retention terms gate transmission (REQ-EVAL-3). Distinct from `modelFamily`:
   * a model family may be served by a different provider (e.g. a Llama family via a cloud provider). Defaults to
   * `modelFamily` when omitted (they coincide for first-party APIs). Null for offline arms (A3/A6 — nothing transmitted).
   */
  readonly provider?: string;
  /** Free-form settings the pre-registration freezes (reasoning level, search on/off, best-of-two, rigor…). */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** The exact prompt/recipe (published verbatim for A1/A2 — REQ-EVAL-18). */
  readonly prompt?: string;
  /** Rhema arms (A4/A5): the pinned production engine build (REQ-EVAL-20/6). */
  readonly engineBuild?: string;
  /** Rhema arms: the pinned `protocol@version` (REQ-EVAL-20/6). */
  readonly protocolVersion?: string;
  /** A1: the owner who re-steelmanned the prompt this wave (REQ-EVAL-6). */
  readonly steelmanOwner?: string;
  /** A1 prompt / A2 recipe published-with-results (REQ-EVAL-18). */
  readonly published?: boolean;
}

/** The raw, un-normalized output of one arm on one draft — before de-branding + blind extraction (REQ-EVAL-7). */
export interface RawArmOutput {
  readonly arm: BenchmarkArm;
  readonly draftId: string;
  /** The arm's raw prose review / findings text, exactly as the arm produced it (may name the arm's brand). */
  readonly text: string;
  /** For a Rhema arm, the run-ledger run_id (joins usage_records for the economics metric — REQ-EVAL-14/20). */
  readonly runId?: string;
  readonly model?: string;
  readonly latencyMs?: number;
}

/**
 * The arm-execution seam. A production binding runs the arm to produce its raw output: A1/A2 call a frontier/generic
 * model, A4/A5 drive the Rhema production engine (bound in P0.15's integration), A3/A6 return externally-produced
 * results (A6 = the human-editor intake path — results entered, not executed). Deterministic fakes implement it in
 * tests + the dev-set dry run (running the pilot wave itself is P0.15).
 */
export interface ArmExecutor {
  /** Produce the arm's raw output for one draft in a wave (or `null` if the arm does not run this draft). */
  run(input: { waveId: string; draftId: string; arm: BenchmarkArm }): Promise<RawArmOutput | null>;
}

/**
 * The LLM-judge seam (REQ-EVAL-9, SECONDARY metrics only). A judge carries its model `family` (the cross-family gate
 * C-d reads it) and completes a prompt. Deterministic fakes implement it in tests.
 */
export interface JudgeModel {
  readonly id: string;
  readonly model: string;
  readonly family: ModelFamily;
  complete(prompt: string): Promise<string>;
}
