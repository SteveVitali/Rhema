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
    command: ["/usr/local/bin/node", "/app/dist/agent-entry.js"],
  });

  it("drops to the agent uid/gid, clears groups, and strips every capability vector (absolute setpriv — no PATH in the scrubbed env)", () => {
    // setpriv MUST be absolute: the scrubbed agent env has no PATH, so a bare `setpriv` → `spawn … ENOENT` and
    // the agent never launches (the live D-P0.15e-2 root cause). Same for the exec'd `node` (caller passes it).
    // F-SEC3-2: ambient caps survive execve of unmarked binaries — without the explicit clear the agent
    // inherits the harness's ambient CAP_SETUID (a kernel path back to uid 10001 / the harness token).
    expect(launch.argv.slice(0, 12)).toEqual([
      "/usr/bin/setpriv", "--reuid", "10000", "--regid", "10000", "--clear-groups",
      "--inh-caps", "-all", "--ambient-caps", "-all", "--no-new-privs", "--",
    ]);
    expect(launch.argv.slice(12)).toEqual(["/usr/local/bin/node", "/app/dist/agent-entry.js"]);
    expect(launch.uid).toBe(10000);
  });

  it("honors an overridden setprivPath", () => {
    const l = buildAgentLaunch({
      runId: "r", proxyBaseUrl: "http://p", configDir: "/c", agentUid: 1, agentGid: 1, cwd: "/w",
      command: ["/usr/local/bin/node", "x.js"], setprivPath: "/sbin/setpriv",
    });
    expect(l.argv[0]).toBe("/sbin/setpriv");
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
