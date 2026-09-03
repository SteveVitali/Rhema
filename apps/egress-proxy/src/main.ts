// The LIVE egress-proxy entrypoint (D-P0.07-1/2/3/4). Constructs the running proxy against real infrastructure:
// the DB-backed run-context resolver + usage/fetch-log writers + cap accountant over a pg.Pool, the Secret
// Manager provider key (SIGHUP-refreshable), and the undici forwarder to the provider. The sandbox's ONLY egress
// route points `ANTHROPIC_BASE_URL` here; it terminates, runs `handleProxyRequest`, and forwards over its own
// TLS. Deploy wiring only — the pipeline + every seam are unit-tested in-process; this file needs a live deploy.

import pg from "pg";
import { createProxyServer, undiciForwarder } from "./server.js";
import { createDbRunContextResolver } from "./resolver.js";
import { ReloadableAnthropicSecretProvider, createSecretAccessor } from "./secret-manager.js";
import { SqlUsageWriter, SqlFetchLogWriter, SqlCapAccountant, type SqlExecutor } from "./sinks.js";
import { InMemoryEventSink } from "./signals.js";
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

  const server = createProxyServer({
    providerHost: env.providerHost,
    resolver: createDbRunContextResolver(db),
    secrets,
    forward: undiciForwarder("https"),
    usageWriter: new SqlUsageWriter(db),
    fetchLogWriter: new SqlFetchLogWriter(db),
    capAccountant: new SqlCapAccountant(db),
    events: new InMemoryEventSink(), // pause/denial signal delivery to the run is P0.08b's transport
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
