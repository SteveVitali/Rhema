// @rhema/run-task — the agent-side hook client (§12.4 step 4).
//
// The SDK's `PreToolUse` hook is a tiny program that shells out to this: connect to the harness daemon's Unix
// socket, send the tool use, read back the ALLOW/DENY decision, and hand it to the SDK. It learns nothing but
// the decision — the token and audit rows stay on the harness side of the socket. Kept dependency-light so it
// can run in the minimal hook subprocess.

import { connect } from "node:net";
import type { ToolUse } from "@rhema/hooks";

/** The decision the daemon returns (the SDK PreToolUse output shape, plus the daemon's request id). */
export interface HookClientResult {
  id: number;
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow" | "deny";
    permissionDecisionReason?: string;
  };
}

/** Ask the daemon whether a tool use is permitted. Resolves with the PreToolUse decision. */
export function hookClientDecision(
  socketPath: string,
  use: ToolUse,
  id = 1,
  timeoutMs = 5000,
): Promise<HookClientResult> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let buf = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("hook daemon timed out"));
    }, timeoutMs);
    socket.on("connect", () => socket.write(JSON.stringify({ id, use }) + "\n"));
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      clearTimeout(timer);
      socket.end();
      try {
        resolve(JSON.parse(buf.slice(0, nl)) as HookClientResult);
      } catch (err) {
        reject(err as Error);
      }
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
