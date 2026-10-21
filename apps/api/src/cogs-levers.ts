// @rhema/api — the ONE COGS-lever resolution site for run creation (ECON.2 / REQ-SPEC-32(c);
// R5ECON.2 / REQ-ECON-1/2/3/10).
//
// Every route that calls `createRun` resolves the lever set through `resolveRunCogsLevers` and
// freezes the resolved arms into BOTH `inputs.cogsLevers` (the consumers — runspec → PhaseRequest
// → engine options, the worker's provisioning webTools policy) and `input_snapshot.cogsLevers`
// (the REQ-BILL-6 measurement record the on/off comparison joins). Wiring it per-route — rather
// than inside `createRun` — keeps the is_test read on the app's own `txRunner` (the orchestrator
// package cannot reach @rhema/ledger's workspace flag) and keeps the freeze visible at the call
// site. A route that skips the helper freezes nothing — the pre-ECON.2 all-off shape — which is
// safe but forfeits the test-tenant arm; the run-routes test matrix guards the freeze on every
// route a journey leg launches.
//
// Resolution semantics (contracts/cogs-levers.ts owns the pure function):
//   · `deps.cogsLevers`      — the `COGS_LEVERS` env default (unset ⇒ all-off);
//   · `deps.cogsLeversTest`  — the `COGS_LEVERS_TEST` is_test-scoped overlay (R5ECON.2; the
//                              ratified Q-ECON.e posture — cheap routing default-ON for
//                              test-tenant runs incl. UI-launched legs);
//   · the client's `inputs.cogsLevers`/`body.cogsLevers` — a per-leg override honored ONLY on
//     `workspaces.is_test` (the measurement arms + the REQ-ECON-11 `testCheapRoute:false`
//     opt-outs); discarded anywhere else;
//   · `testCheapRoute` is double-gated — it can never freeze ON off-test regardless of envs.

import { isTestWorkspace } from "@rhema/ledger";
import {
  resolveCogsLevers,
  sanitizeCogsLevers,
  type CogsLevers,
} from "@rhema/contracts";
import type { OrchestratorDeps } from "@rhema/orchestrator";

type CogsLeverDeps = Pick<OrchestratorDeps, "txRunner" | "cogsLevers" | "cogsLeversTest">;

/**
 * Resolve the lever set to freeze for a run on `workspaceId`. `client` is whatever lever payload
 * the caller accepted (`inputs.cogsLevers` on the run route; `body.cogsLevers` on the launch
 * routes). An is_test flag-read failure fails CLOSED: the workspace is treated as non-test — the
 * server default freezes and the cheap-route arm can never leak on.
 */
export async function resolveRunCogsLevers(
  deps: CogsLeverDeps,
  workspaceId: string,
  client: unknown,
): Promise<CogsLevers> {
  const isTest = await deps.txRunner
    .run(workspaceId, (tx) => isTestWorkspace(tx, workspaceId))
    .catch(() => false);
  return resolveCogsLevers({
    client,
    isTest,
    ...(deps.cogsLevers ? { defaults: sanitizeCogsLevers(deps.cogsLevers) } : {}),
    ...(deps.cogsLeversTest ? { testDefaults: deps.cogsLeversTest } : {}),
  });
}
