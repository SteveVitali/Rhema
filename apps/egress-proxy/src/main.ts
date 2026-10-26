// The LIVE egress-proxy entrypoint (D-P0.07-1/2/3/4). Constructs the running proxy against real infrastructure:
// the DB-backed run-context resolver + usage/fetch-log writers + cap accountant over a pg.Pool, the Secret
// Manager provider key (SIGHUP-refreshable), and the undici STREAMING forwarder to the provider. The sandbox's
// ONLY egress route points `ANTHROPIC_BASE_URL` here; it terminates, runs the pipeline (`streamProxyRequest`),
// and pipes the response back over its own TLS. Deploy wiring only — the pipeline + every seam are unit-tested
// in-process; this file needs a live deploy.

import pg from "pg";
import { createProxyServer, undiciStreamForwarder } from "./server.js";
import { createDbRunContextResolver } from "./resolver.js";
import {
  ANTHROPIC_KEY_REFRESH_INTERVAL_MS,
  ReloadableAnthropicSecretProvider,
  createSecretAccessor,
} from "./secret-manager.js";
import { SqlUsageWriter, SqlFetchLogWriter, SqlCapAccountant, type SqlExecutor } from "./sinks.js";
import { SqlSignalSink } from "./signal-sink.js";
import { NovelDomainTracker, ResearchUsageTracker } from "./outbound-limits.js";
import { ulid } from "./ids.js";

interface ProxyEnv {
  readonly port: number;
  readonly databaseUrl: string;
  /** the Secret Manager `anthropic-api-key` version resource name. */
  readonly anthropicKeySecret: string;
  /** the provider host every request is forwarded to (`api.anthropic.com`). */
  readonly providerHost: string;
}

function readProxyEnv(): ProxyEnv {
  const req = (n: string): string => {
    const v = process.env[n];
    if (!v) throw new Error(`egress-proxy: missing required env ${n}`);
    return v;
  };
  return {
    port: Number(process.env.PORT ?? 8443),
    databaseUrl: req("DATABASE_URL"),
    anthropicKeySecret: req("ANTHROPIC_KEY_SECRET"),
    providerHost: process.env.PROVIDER_HOST ?? "api.anthropic.com",
  };
}

export async function startProxy(): Promise<void> {
  const env = readProxyEnv();
  const pool = new pg.Pool({ connectionString: env.databaseUrl });
  // the proxy's SqlExecutor over the pool (the non-RLS proxy tables + usage/fetch-log writes).
  const db: SqlExecutor = {
    query: (sql, params) => pool.query(sql, params ?? undefined).then((r) => ({ rows: r.rows as unknown[] })),
  };

  const secrets = await ReloadableAnthropicSecretProvider.create(env.anthropicKeySecret, await createSecretAccessor());
  // rotate the provider key on SIGHUP without a restart (REQ-ARCH-30). (createProxyServer only auto-wires SIGHUP
  // for the base ReloadableSecretProvider; this async provider installs its own handler.)
  process.on("SIGHUP", () => {
    void secrets.refresh().catch((err: unknown) => console.error("[egress-proxy] key refresh failed:", err));
  });
  // F-R6GLD.1-1 — SIGHUP-only refresh meant a dead upstream key never propagated to running
  // instances (the 2026-10-23 research-401 outage: the MIG instance held a cached dead version for
  // hours until an operator recycled the VM). The bounded interval re-reads the same version name;
  // a failed fetch keeps the last good key; the timer is unref'd. `ANTHROPIC_KEY_REFRESH_MS`
  // overrides the 5-minute default.
  secrets.startPeriodicRefresh(
    Number(process.env.ANTHROPIC_KEY_REFRESH_MS ?? ANTHROPIC_KEY_REFRESH_INTERVAL_MS),
    { onError: (err) => console.error("[egress-proxy] periodic key refresh failed:", err) },
  );

  const server = createProxyServer({
    providerHost: env.providerHost,
    resolver: createDbRunContextResolver(db),
    secrets,
    // stream the upstream response through to the sandbox incrementally (D-P0.07-5); the SDK's stream:true
    // responses arrive frame-by-frame instead of waiting for the whole buffered body.
    streamForward: undiciStreamForwarder("https"),
    usageWriter: new SqlUsageWriter(db),
    fetchLogWriter: new SqlFetchLogWriter(db),
    capAccountant: new SqlCapAccountant(db),
    // P1.22 (REQ-ARCH-32) — the DURABLE sink: `egress.denied` → run_events_internal; a PauseSignal →
    // pause_signals, which the worker's drainPauseSignals sweep applies `pauseRun` to (the run parks
    // at a refusal-class card within the sweep interval). The old InMemoryEventSink dropped them.
    events: new SqlSignalSink(db),
    novelDomains: new NovelDomainTracker(), // cross-request novel-domain state (§12.8d)
    researchUsage: new ResearchUsageTracker(), // cross-request research budgets (PRB.22)
    newId: () => ulid(),
  });
  server.listen(env.port, () => {
    console.log(`[egress-proxy] listening on :${env.port} → ${env.providerHost}`);
  });
}

// Run when invoked as the container entrypoint (`node dist/main.js`), not when imported.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startProxy().catch((err: unknown) => {
    console.error("[egress-proxy] failed to start:", err);
    process.exit(1);
  });
}
