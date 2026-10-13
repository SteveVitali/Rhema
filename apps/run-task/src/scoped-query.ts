// @rhema/run-task — the scoped producer query (DEF.1 / D-P0.15h-5; §12.6). Runs as the DISTINCT scoped
// uid inside a private mount namespace (`unshare --mount` + `scoped-runner.js` ro-binds ONLY the
// enumerated input files into its cwd before the uid drop). argv: `scoped-query.js <spec.json>` — the
// serialized `ScopedLaunchSpec` plus a `query` block ({prompt, model, maxBudgetUsd, maxTurns}) the
// harness wrote.
//
// It runs ONE vendored-SDK `query()` with `tools/allowedTools: ["Read"]`, cwd = the scoped root, and a
// scrubbed env (no token, no credential — the loopback injector URL only, same as a seat agent). The
// kernel is the input-scoping boundary (nothing else exists in the namespace); no hook daemon is wired
// because there is nothing else to reach. The query has no Write tool by design — its answer is the
// final assistant message's text, printed as a single JSON line on stdout for the harness to persist
// (the scoped-private tmpfs dies with the namespace; stdout is the only channel back).

import type { AgentSdkQueryOptions, SdkMessage, UsageSnapshot } from "@rhema/engine";
import { emptyUsage } from "@rhema/engine";
import { loadSdkQuery, resolveClaudeCodeExecutable } from "./sdk-adapter.js";

interface ScopedQuerySpec {
  readonly role?: string;
  readonly producerQueryId?: string;
  readonly mountPlan?: { readonly rootDir?: string };
  readonly query: {
    readonly prompt: string;
    readonly model?: string;
    readonly maxBudgetUsd?: number;
    readonly maxTurns?: number;
  };
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`scoped-query: missing env ${name}`);
  return v;
}

async function main(): Promise<void> {
  // SEC.3 — the direct identity line: the DISTINCT scoped uid (agentUid + roleOffset), proving the
  // setpriv drop to a uid that is neither harness nor agent. Ids + cap names only.
  {
    const { identityLine } = await import("./identity.js");
    console.error(identityLine("scoped-query"));
  }
  const { readFile, mkdir } = await import("node:fs/promises");
  const specPath = process.argv[2];
  if (!specPath) throw new Error("scoped-query: usage: scoped-query.js <spec.json> [--cwd <dir>]");
  const spec = JSON.parse(await readFile(specPath, "utf8")) as ScopedQuerySpec;
  const cwdFlag = process.argv.indexOf("--cwd");
  const cwd =
    (cwdFlag > 0 ? process.argv[cwdFlag + 1] : undefined) ?? spec.mountPlan?.rootDir ?? "/work/scoped";
  const configDir = env("CLAUDE_CONFIG_DIR");
  await mkdir(configDir, { recursive: true }).catch(() => undefined);

  const query = await loadSdkQuery();
  const { existsSync } = await import("node:fs");
  const claudeCodeExecutablePath = resolveClaudeCodeExecutable(existsSync);

  const controller = new AbortController();
  const options: AgentSdkQueryOptions = {
    cwd,
    model: spec.query.model ?? "claude-sonnet-5",
    skillsDir: "",
    skills: [], // no skills inside the scoped namespace — the prompt IS the contract
    ...(claudeCodeExecutablePath ? { pathToClaudeCodeExecutable: claudeCodeExecutablePath } : {}),
    agents: {},
    hooks: { PreToolUse: [] },
    permissionMode: "dontAsk",
    allowedTools: ["Read"],
    disallowedTools: [],
    tools: ["Read"],
    settings: { autoCompactWindow: 80_000 },
    maxBudgetUsd: spec.query.maxBudgetUsd ?? 1,
    maxTurns: spec.query.maxTurns ?? 10,
    env: {
      RUN_ID: env("RUN_ID"),
      ANTHROPIC_BASE_URL: env("ANTHROPIC_BASE_URL"),
      ANTHROPIC_API_KEY: env("ANTHROPIC_API_KEY"),
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      CLAUDE_CONFIG_DIR: configDir,
      // the options.env REPLACES the vendored CLI subprocess env — without HOME the Bun binary's
      // uv_os_homedir() ENOENTs for the passwd-less scoped uid (F-StageB-7). Scoped to the writable
      // root (the uid's only writable area), never a real home.
      HOME: configDir,
      ENABLE_PROMPT_CACHING_1H: "1",
      CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION: "0",
    },
    maxSubagentDepth: 1,
    maxConcurrentSubagents: 0,
    cacheControlTtl: "1h",
    sessionStore: { kind: "none" },
    abortController: controller,
  };

  let text = "";
  let subtype = "error_during_execution";
  const usage: UsageSnapshot = emptyUsage();
  try {
    for await (const message of query({ prompt: spec.query.prompt, options })) {
      const m = message as SdkMessage;
      if (m.type === "assistant") {
        const t = m.message.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        if (t.trim()) text = t; // the LAST assistant text turn is the answer (the read report)
      } else if (m.type === "result") {
        subtype = m.subtype;
        const u = m.usage;
        if (u) {
          usage.inputTokens = u.input_tokens ?? 0;
          usage.outputTokens = u.output_tokens ?? 0;
          usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
          usage.cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
          usage.webSearchRequests = u.server_tool_use?.web_search_requests ?? 0;
          usage.webFetchRequests = u.server_tool_use?.web_fetch_requests ?? 0;
        }
        usage.costUsd = m.total_cost_usd ?? 0;
      }
    }
  } catch (err) {
    // Report the failure as a result line anyway (subtype error) so the harness writes an honest
    // `blocked` phase-result instead of the phase dying on a missing file.
    console.error(`[scoped-query] ${spec.role ?? "scoped"} query failed:`, err);
    subtype = "error_during_execution";
  }
  // stdout is the only channel that crosses the private namespace back to the harness.
  process.stdout.write(JSON.stringify({ text, subtype, usage }));
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error("[scoped-query] fatal:", err);
    // still emit a result line so the harness marks the phase blocked, not lost
    try {
      process.stdout.write(JSON.stringify({ text: "", subtype: "error_during_execution", usage: emptyUsage() }));
    } catch {
      /* nothing left to do */
    }
    process.exit(1);
  },
);
