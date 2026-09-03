// @rhema/run-task — the two-uid Agent SDK task (one Fargate task per run; §12.1, §12.4 step 4).
//
// The image contract (ledger M11): the task starts as uid `harness` (holds `RUN_TOKEN`, `API_INTERNAL_URL`
// and the per-run proxy credential in a harness-only file; runs the hooks, heartbeat/commit client and audit
// writer, and the local Unix-socket hook daemon), then launches the SDK as uid `agent` with a SCRUBBED env
// (@rhema/engine). Root filesystem read-only; a writable tmpfs only for the seat's writable namespaces. This
// index wires those pieces; the individual modules carry the logic and the tests.

export const PACKAGE_NAME = "@rhema/run-task" as const;

export * from "./secrets.js";
export * from "./hook-daemon.js";
export * from "./hook-client.js";
export * from "./proxy-injector.js";
export * from "./bootstrap.js";
export * from "./event-buffer.js";
export * from "./event-transport.js";
export * from "./sdk-adapter.js";
export { runAgentPhase, buildPreToolUseHook, type AgentPhaseResult } from "./agent-entry.js";

/** Marker export retained for the build graph / provenance job. */
export function packageInfo(): { name: string } {
  return { name: PACKAGE_NAME };
}
