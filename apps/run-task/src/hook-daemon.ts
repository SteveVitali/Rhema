// @rhema/run-task — the local Unix-socket PreToolUse hook daemon (§12.4 step 4; §12.6 tool layer).
//
// SDK hooks run as uid `harness`, not `agent`: the daemon holds the run token and the audit writer, and the
// `agent` uid cannot read the socket's credentials. The mechanism: the daemon listens on a Unix socket owned
// by `harness` (chmod 0666 so the agent uid can connect — only the decision crosses it), and answers
// tool-use queries with an ALLOW/DENY decision ONLY — the token and
// the audit rows never cross the socket. The agent-side hook connects, asks "may I run this tool?", and gets
// a `PreToolUseResult`; it can learn nothing else. Policy is per-run DATA (REQ-ARCH-17): the daemon is
// constructed with a compiled `SeatPolicy` + a per-phase `DenialState`, and it delegates every decision to
// `@rhema/hooks` `evaluateToolUse` — the SAME code every seat and engine runs.

import { createServer, type Server } from "node:net";
import { chmodSync } from "node:fs";
import {
  evaluateToolUse,
  toPreToolUseResult,
  type AuditSink,
  type DenialState,
  type RealpathResolver,
  type SeatPolicy,
  type ToolUse,
} from "@rhema/hooks";

export interface HookDaemonOptions {
  readonly socketPath: string;
  readonly policy: SeatPolicy;
  readonly state: DenialState;
  /** the harness-side audit sink (ships rows to the internal API with the token — never over the socket). */
  readonly audit?: AuditSink;
  readonly resolveRealpath?: RealpathResolver;
  /** notified with the control signal on a threshold breach (P0.08 acts on it out of band). */
  readonly onControl?: (signal: "abort_failed_boundary" | "hiccup_retry") => void;
}

export interface HookDaemon {
  readonly server: Server;
  close(): Promise<void>;
}

/** Max bytes buffered per connection before a newline (a tool-use request is far smaller). */
export const MAX_LINE_BYTES = 256 * 1024;

/** A single request over the socket: a tool use to evaluate, tagged by an id for the reply. */
interface HookRequest {
  id: number;
  use: ToolUse;
}

/**
 * Start the hook daemon on a Unix socket. Returns a handle to close it. The response carries ONLY the
 * PreToolUse decision (+ the control signal for the daemon's own callback) — never the token or audit rows.
 */
export function createHookDaemon(opts: HookDaemonOptions): Promise<HookDaemon> {
  const server = createServer((socket) => {
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      // Bound the per-connection buffer: a tool-use request is small (paths + small inputs). A peer that
      // streams bytes with no newline must not grow the harness process without limit (a local DoS).
      if (buf.length > MAX_LINE_BYTES) {
        socket.write(JSON.stringify({ id: -1, error: "request too large" }) + "\n");
        socket.destroy();
        return;
      }
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        handleLine(line, socket);
      }
    });
  });

  function handleLine(line: string, socket: NodeJS.WritableStream): void {
    let req: HookRequest;
    try {
      req = JSON.parse(line) as HookRequest;
    } catch {
      socket.write(JSON.stringify({ id: -1, error: "bad request" }) + "\n");
      return;
    }
    // Fail CLOSED on a malformed envelope: the agent sends `use` as `ToolUse{tool,input}`; anything else
    // (e.g. the SDK's `tool_name`/`tool_input` envelope forwarded verbatim — the PRB.17 live finding) makes
    // evaluateToolUse see `tool === undefined` and hit its "outside remit — pass through, no audit" branch,
    // silently allowing every tool with zero audit rows. A boundary that can't name the tool denies + logs.
    if (typeof req?.use?.tool !== "string" || req.use.tool === "") {
      console.warn(`[hook] malformed tool-use envelope (no tool name) — denying`);
      socket.write(
        JSON.stringify({
          id: typeof req?.id === "number" ? req.id : -1,
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "malformed tool-use envelope: no tool name",
          },
        }) + "\n",
      );
      return;
    }
    const decision = evaluateToolUse(req.use, opts.policy, opts.state, {
      ...(opts.audit ? { sink: opts.audit } : {}),
      ...(opts.resolveRealpath ? { resolveRealpath: opts.resolveRealpath } : {}),
    });
    // Diagnostic (harness-side, no secret): log each tool decision with its classified path(s) to stdout so a
    // phase's write targets + any denials are visible in the pod log even when the DB access-log sink is not
    // wired. Paths are not secrets; this is the boundary observability the §12.6 attestation wants.
    for (const row of decision.accessRows) {
      console.log(`[hook] ${row.tool} ${row.decision}${row.path ? ` ${row.path}` : ""}${decision.reason ? ` — ${decision.reason}` : ""}`);
    }
    if (decision.control) opts.onControl?.(decision.control);
    const result = toPreToolUseResult(decision);
    // The reply is the DECISION ONLY — `hookSpecificOutput`. The control signal (`rhemaControl`) is handled
    // harness-side via `onControl` and deliberately NOT sent to the agent, along with the token, audit rows,
    // and policy internals: nothing but allow/deny + reason crosses the socket (§12.6 attestation).
    socket.write(JSON.stringify({ id: req.id, hookSpecificOutput: result.hookSpecificOutput }) + "\n");
  }

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(opts.socketPath, () => {
      try {
        // The socket MUST be connectable by the AGENT uid: the SDK's PreToolUse hook runs inside the agent
        // process (uid `agent`, 10002), and it connects here to ask allow/deny. A `0600` harness-only socket
        // (the earlier default) meant the agent got EACCES on connect, the hook threw, and the SDK fell through
        // to ALLOW — so the §12.6 boundary NEVER ran live and `boundary.attested` was vacuous (diagnosed live
        // P0.15h: 0 hook decisions logged; an out-of-namespace write succeeded). This is SAFE: by design ONLY the
        // allow/deny decision crosses the socket — never the token, audit rows, or policy internals (see the
        // reply above) — so a world-connectable socket leaks nothing. The token stays with uid `harness` via the
        // 0400 Secret mount, not this socket's permissions.
        chmodSync(opts.socketPath, 0o666);
      } catch {
        /* some platforms disallow chmod on a socket; the token never crosses it regardless */
      }
      resolve({
        server,
        // The daemon is per-phase: closing flushes the buffered audit sink so each phase's access/fetch rows
        // ship to the internal API (append-only — a failed flush keeps the rows buffered, but the daemon is
        // closing so we log and move on rather than wedge the phase teardown).
        close: async () => {
          if (opts.audit) {
            try {
              await opts.audit.flush();
            } catch (e) {
              console.warn(`[hook] audit flush failed at close: ${e instanceof Error ? e.message : e}`);
            }
          }
          await new Promise<void>((res) => {
            server.close(() => res());
          });
        },
      });
    });
  });
}
