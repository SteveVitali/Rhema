// @rhema/hooks — shared types for the boundary hook (spec §12.6, §11.3).
//
// The tool layer of the three concentric boundary layers: one hook, the same code for every seat and
// engine; policy is per-run DATA (REQ-ARCH-17). These types are the vocabulary that data speaks.

import type { AgentTypeKey } from "@rhema/contracts";

/**
 * Project + persona namespaces (§11.1). Every artifact and every mounted path carries one; enforcement
 * (§12.6) and visibility (§8) both key on it. `persona:<id>` is the per-run persona directory.
 */
export type Namespace =
  | "shared"
  | "agent:author"
  | "agent:editor"
  | "agent:assistant"
  | "agent:persona_builder"
  | `persona:${string}`;

/** Which mount root a glob is anchored to. */
export type MountRoot = "project" | "persona";

/** A single mount-table cell (§12.6): a path glob under one root, its access mode, and its namespace. */
export interface MountSpec {
  /** Glob relative to the root. Only two forms are used: an exact path, or a `prefix/**` subtree. */
  readonly glob: string;
  readonly root: MountRoot;
  readonly mode: "read" | "readwrite";
  readonly namespace: Namespace;
}

/** A compiled mount rule: the glob resolved to an absolute pattern against this run's mount roots. */
export interface MountRule extends MountSpec {
  /** Absolute directory this rule's glob is relative to (e.g. `/work/project`). */
  readonly base: string;
}

/**
 * Per-run URL policy (REQ-DATA-15, amended). Hold-outs and user exclusions are denied; the calibrator
 * alone may reach a hold-out, and only once the prediction file has been written (the precondition flag).
 * The persona builder and calibrator have server-side `web_fetch` disabled — they fetch only through the
 * client-side `fetcher` — so a `WebFetch` tool call from them is denied regardless of URL.
 */
export interface UrlPolicy {
  /** Hold-out URLs that must never leave the sandbox (path-level, normalized). */
  readonly holdouts: readonly string[];
  /** User-excluded sources. */
  readonly userExclusions: readonly string[];
  /** Hold-out URLs the calibrator may fetch — honored only when `predictionFileWritten` is true. */
  readonly calibratorAllow: readonly string[];
  /** The prediction-file precondition (§12.6): the calibrator's allow-list is inert until this is set. */
  readonly predictionFileWritten: boolean;
  /** True for the persona builder and calibrator: server `web_fetch` is disabled (client `fetcher` only). */
  readonly serverFetchDisabled: boolean;
  /** Globally blocked (robots/paywall) registrable domains — reported as denied, never cookie-fetched. */
  readonly blockedDomains?: readonly string[];
  /**
   * P1.21 (REQ-WF-8/REQ-GENRE-6; §16.4's Memo-confidentiality row) — the registrable domains of a Memo
   * run's `user_sources[]`: content the user supplied confidentially. A fetch to one is a user-data
   * fetch — `web_fetch_of_user_data: 'forbidden'` — denied with `denyReason: "user_source"` and never
   * sent upstream; the proxy enforces the same set (enforced, never advised — §12.6 posture).
   */
  readonly userSourceDomains?: readonly string[];
}

export const EMPTY_URL_POLICY: UrlPolicy = {
  holdouts: [],
  userExclusions: [],
  calibratorAllow: [],
  predictionFileWritten: false,
  serverFetchDisabled: false,
};

/** The calibrator's prediction file (§12.6): the input-scoped holdout-calibrator writes this BEFORE
 *  it may fetch the hold-out URL — the hook daemon flips `urlPolicy.predictionFileWritten` the moment
 *  it observes this write land (P1.14). Persona-rooted path. */
export const CALIBRATION_PREDICTION_PATH = "profile/calibration-prediction.md";

/** The four phase classes (§12.2). Judge-class phases reject `Agent` (the parent may not spawn its own second read). */
export type PhaseClass = "research" | "judge" | "generate" | "package";

/** The current phase's policy row, supplied per run from the workflow manifest (§12.2). */
export interface PhasePolicy {
  readonly key: string;
  readonly phaseClass: PhaseClass;
  /** `false` for judge-class phases (REQ-SPEC-13 / §12.2). */
  readonly allowsSubagents: boolean;
}

/**
 * The compiled, per-run seat policy the hook evaluates against. Everything here is DATA: the same hook
 * code runs for every seat and engine (REQ-ARCH-17). Identity fields stamp every audit row (REQ-DATA-12).
 */
export interface SeatPolicy {
  readonly seat: AgentTypeKey;
  /** Absolute mount roots for this run. `persona` is absent for seats with no persona mount (system). */
  readonly roots: { readonly project: string; readonly persona?: string };
  /** The compiled mount allowlist (§12.6 seat table for this seat). */
  readonly mounts: readonly MountRule[];
  /** The seat's permitted tool tokens (from the `agent_types` row); `web_fetch` gating is in `urlPolicy`. */
  readonly tools: ReadonlySet<string>;
  readonly urlPolicy: UrlPolicy;
  readonly phase: PhasePolicy;
  readonly runId: string;
  /** The attributing `agent_id` for this (sub)agent (REQ-DATA-12). */
  readonly agentLabel: string;
  /** True only for the input-scoped holdout-calibrator subagent (§12.6): unlocks the hold-out allow-list. */
  readonly isCalibrator?: boolean;
}

/** A tool invocation as the PreToolUse hook sees it. */
export interface ToolUse {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/** An `access_log` row (§11.3 `AccessLogEntry`; mirrors the `access_log` DDL). */
export interface AccessLogRow {
  readonly runId: string;
  readonly ts: string;
  readonly agentLabel: string;
  readonly tool: string;
  readonly path: string;
  readonly namespace: Namespace | null;
  readonly decision: "allow" | "deny" | "rewrite";
}

export type FetchDenyReason = "holdout" | "paywall" | "robots" | "policy" | "user_source";

/** A `fetch_log` row (§11.3 `FetchLogEntry`; mirrors the `fetch_log` DDL). Post-fetch `status`/`bytes`
 * are joined in later by the proxy/fetcher (REQ-DATA-16); the hook emits the pre-fetch decision row. */
export interface FetchLogRow {
  readonly runId: string;
  readonly ts: string;
  readonly agentLabel: string;
  readonly kind: "search" | "fetch";
  readonly query?: string;
  readonly url?: string;
  readonly normalizedUrl?: string;
  readonly status?: number;
  readonly bytes?: number;
  readonly decision: "allow" | "deny";
  readonly denyReason?: FetchDenyReason;
}

/** A control signal for the orchestrator (P0.08 acts on it — §12.6 denial thresholds). */
export type ControlSignal = "abort_failed_boundary" | "hiccup_retry";

/** The hook's verdict for one tool use, plus the audit rows it produced. */
export interface HookDecision {
  readonly decision: "allow" | "deny";
  /** A one-line reason (denials always carry one; §12.6). */
  readonly reason?: string;
  readonly control?: ControlSignal;
  readonly accessRows: readonly AccessLogRow[];
  readonly fetchRows: readonly FetchLogRow[];
}

/** The nine tools the PreToolUse hook matches (§12.6). */
export const MATCHER_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Glob",
  "Grep",
  "Bash",
  "WebFetch",
  "WebSearch",
] as const;
export type MatcherTool = (typeof MATCHER_TOOLS)[number];

/** Tool names that spawn a subagent (rejected in judge-class phases). `Task` is the SDK's name for `Agent`. */
export const SUBAGENT_TOOLS = ["Agent", "Task"] as const;

/** Tools that write (a matched read-only path is a denial for these). */
export const WRITE_TOOLS = ["Write", "Edit", "MultiEdit"] as const;
