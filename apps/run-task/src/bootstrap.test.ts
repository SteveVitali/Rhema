import { describe, it, expect } from "vitest";
import { buildAgentLaunch } from "./bootstrap.js";
import { FORBIDDEN_AGENT_ENV_KEYS } from "@rhema/engine";

// The harness→agent launch (REQ-SPEC-10; §12.4 step 4). The spec must drop to uid `agent`, clear groups, and
// carry a scrubbed env with no token/credential.

describe("buildAgentLaunch (REQ-SPEC-10)", () => {
  const launch = buildAgentLaunch({
    runId: "run_7",
    proxyBaseUrl: "http://proxy.internal:8080",
    configDir: "/work/.config",
    agentUid: 10000,
    agentGid: 10000,
    cwd: "/work/project",
    command: ["node", "/app/dist/agent-entry.js"],
  });

  it("drops to the agent uid/gid and clears supplementary groups (setpriv)", () => {
    expect(launch.argv.slice(0, 7)).toEqual(["setpriv", "--reuid", "10000", "--regid", "10000", "--clear-groups", "--"]);
    expect(launch.argv.slice(7)).toEqual(["node", "/app/dist/agent-entry.js"]);
    expect(launch.uid).toBe(10000);
  });

  it("runs in the seat mount", () => {
    expect(launch.cwd).toBe("/work/project");
  });

  it("carries a SCRUBBED env — no token, no proxy credential", () => {
    for (const k of FORBIDDEN_AGENT_ENV_KEYS) expect(k in launch.env).toBe(false);
    expect(launch.env.ANTHROPIC_BASE_URL).toBe("http://proxy.internal:8080");
    expect(launch.env.RUN_ID).toBe("run_7");
  });
});
