import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSeatPolicy, newDenialState, lexicalRealpath, type CompileInput } from "@rhema/hooks";
import { createHookDaemon, type HookDaemon } from "./hook-daemon.js";
import { buildPreToolUseHook } from "./agent-entry.js";

// Residue 3 (P0.15h): PROVE the §12.6 PreToolUse `deny` actually BLOCKS a write to a read-only mount, so
// `boundary.attested violations = 0` is a TRUE zero, not vacuous. This drives the FULL enforcement path the
// live pod runs — the agent-side hook (`buildPreToolUseHook`) → the real Unix-socket daemon → the real compiled
// Editor `SeatPolicy` (`compileSeatPolicy`, the same call `runspec` + `harness-main` use) → `evaluateToolUse` —
// minus only the vendored, proprietary SDK itself. The SDK's contract (vendored `sdk.d.ts` PreToolUse) is that
// it refuses to run a tool IFF the hook returns `hookSpecificOutput.permissionDecision === "deny"`; the D-P0.06-1
// bug was the hook returning the BARE inner object (no wrapper), leaving the SDK nothing to read so a deny
// silently did not block. So the assertions here are exactly: (1) the wrapper the SDK needs is present, and
// (2) the exact live case — a Write to the read-only `correspondence/` mount — resolves to `deny`.

const dirs: string[] = [];
let daemon: HookDaemon | undefined;
function sockPath(): string {
  const d = mkdtempSync(join(tmpdir(), "rhema-hookenf-"));
  dirs.push(d);
  return join(d, "hook.sock");
}
afterEach(async () => {
  await daemon?.close();
  daemon = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** The real Editor seat policy for a craft phase, compiled exactly as the harness compiles it from the run spec. */
function editorCraftPolicy() {
  const input: CompileInput = {
    seat: "editor",
    roots: { project: "/work/project" },
    tools: ["read", "write"],
    phase: { key: "craft", phaseClass: "judge", allowsSubagents: false },
    runId: "run_1",
  };
  return compileSeatPolicy(input);
}

describe("PreToolUse enforcement — a deny BLOCKS a read-only-mount write (residue 3)", () => {
  it("denies a Write to the read-only correspondence/ mount, in the SDK-blocking wrapper shape (the live case)", async () => {
    const socketPath = sockPath();
    daemon = await createHookDaemon({ socketPath, policy: editorCraftPolicy(), state: newDenialState(), resolveRealpath: lexicalRealpath });
    const hook = buildPreToolUseHook(socketPath);

    // the exact write that SUCCEEDED live before the output_dir fix (the seat delivers to correspondence via the
    // server delivery tx, never by writing the mount itself — §12.6: correspondence/** is a READ mount).
    const res = (await hook({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "/work/project/correspondence/v1-review/00-piece-brief.md" } })) as {
      hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason?: string };
    };

    // (1) the SDK-blocking wrapper the vendored SDK reads (the D-P0.06-1 contract): NOT the bare inner object.
    expect(res.hookSpecificOutput).toBeDefined();
    expect(res.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    // (2) the decision is deny — the SDK blocks the tool on this value.
    expect(res.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(res.hookSpecificOutput.permissionDecisionReason).toMatch(/read-only/);
  });

  it("allows a Write to the seat's writable agents/editor/** namespace (where the dossier belongs)", async () => {
    const socketPath = sockPath();
    daemon = await createHookDaemon({ socketPath, policy: editorCraftPolicy(), state: newDenialState(), resolveRealpath: lexicalRealpath });
    const hook = buildPreToolUseHook(socketPath);

    const res = (await hook({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "/work/project/agents/editor/04-craft-notes.md" } })) as {
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(res.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("denies a write to the Drafter's namespace and a path escape too (the wall holds, blocking shape each time)", async () => {
    const socketPath = sockPath();
    daemon = await createHookDaemon({ socketPath, policy: editorCraftPolicy(), state: newDenialState(), resolveRealpath: lexicalRealpath });
    const hook = buildPreToolUseHook(socketPath);

    for (const path of ["/work/project/agents/author/notebook.md", "/work/project/../etc/passwd"]) {
      const res = (await hook({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: path } })) as {
        hookSpecificOutput: { permissionDecision: string };
      };
      expect(res.hookSpecificOutput.permissionDecision, `write to ${path}`).toBe("deny");
    }
  });
});
