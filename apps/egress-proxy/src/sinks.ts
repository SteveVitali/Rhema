// @rhema/egress-proxy — durable sinks: the DB writers, the DB-backed cap Σ, and the provider-key source.
//
// The proxy writes the rows of record (`usage_records{source:'proxy'}`) and the fetch log of record
// (`fetch_log`) through a structural `SqlExecutor` (node-postgres and PGlite both satisfy it), so the writers
// are engine-agnostic and unit-testable against in-process Postgres. Provider keys live ONLY here (REQ-ARCH-30):
// read at start and on SIGHUP, never handed to the model's process. In-memory fakes back the deterministic tests.

import type { CapAccountant } from "./cap.js";
import type { FetchLogRow } from "./fetch-log.js";
import type { UsageRecordRow } from "./metering.js";
import { PLATFORM_RATE, USD_PER_CREDIT } from "./rates.js";

/** The minimal SQL target the writers need — `node-postgres` (`pg.Pool`) and PGlite both satisfy it. */
export interface SqlExecutor {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Persists metered `usage_records` rows — the rows of record. */
export interface UsageWriter {
  write(row: UsageRecordRow): Promise<void> | void;
}

/** Persists `fetch_log` rows — the fetch log of record. */
export interface FetchLogWriter {
  write(row: FetchLogRow): Promise<void> | void;
}

const USAGE_COLUMNS = [
  "id",
  "ts",
  "workspace_id",
  "billing_account_id",
  "user_id",
  "project_id",
  "persona_id",
  "run_id",
  "attempt",
  "step_id",
  "role",
  "agent_instance_id",
  "subagent_label",
  "provider",
  "model",
  "model_tier",
  "rate_table_version",
  "input_tokens",
  "cache_write_tokens",
  "cache_read_tokens",
  "output_tokens",
  "searches",
  "fetches",
  "list_cost_usd",
  "credits",
  "source",
] as const;

export class SqlUsageWriter implements UsageWriter {
  constructor(private readonly db: SqlExecutor) {}

  async write(row: UsageRecordRow): Promise<void> {
    const values: unknown[] = [
      row.id,
      row.ts,
      row.workspaceId,
      row.billingAccountId,
      row.userId,
      row.projectId,
      row.personaId,
      row.runId,
      row.attempt,
      row.stepId,
      row.role,
      row.agentInstanceId,
      row.subagentLabel,
      row.provider,
      row.model,
      row.modelTier,
      row.rateTableVersion,
      row.inputTokens,
      row.cacheWriteTokens,
      row.cacheReadTokens,
      row.outputTokens,
      row.searches,
      row.fetches,
      row.listCostUsd,
      row.credits,
      row.source,
    ];
    const placeholders = USAGE_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
    await this.db.query(
      `insert into usage_records (${USAGE_COLUMNS.join(", ")}) values (${placeholders})`,
      values,
    );
  }
}

const FETCH_LOG_COLUMNS = [
  "run_id",
  "ts",
  "agent_label",
  "attempt",
  "kind",
  "query",
  "url",
  "normalized_url",
  "status",
  "bytes",
  "decision",
  "deny_reason",
] as const;

export class SqlFetchLogWriter implements FetchLogWriter {
  constructor(private readonly db: SqlExecutor) {}

  async write(row: FetchLogRow): Promise<void> {
    const values: unknown[] = [
      row.runId,
      row.ts,
      row.agentLabel,
      row.attempt,
      row.kind,
      row.query,
      row.url,
      row.normalizedUrl,
      row.status,
      row.bytes,
      row.decision,
      row.denyReason,
    ];
    const placeholders = FETCH_LOG_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
    await this.db.query(
      `insert into fetch_log (${FETCH_LOG_COLUMNS.join(", ")}) values (${placeholders})`,
      values,
    );
  }
}

/**
 * DB-backed cap Σ: the run's spent credits are Σ `list_cost_usd` over its committed proxy rows × the platform
 * rate ÷ $0.01 — a single rounding-free read, so the cap never drifts. `record` is a no-op: the usage-row
 * insert IS the record. Use this in the live service; `InMemoryCapAccountant` backs the tests.
 */
export class SqlCapAccountant implements CapAccountant {
  constructor(private readonly db: SqlExecutor) {}

  async spentCredits(runId: string): Promise<number> {
    const res = await this.db.query(
      `select coalesce(sum(list_cost_usd), 0) as list_usd from usage_records where run_id = $1 and source = 'proxy'`,
      [runId],
    );
    const first = res.rows[0] as { list_usd?: unknown } | undefined;
    const listUsd = Number(first?.list_usd ?? 0);
    return (listUsd * PLATFORM_RATE) / USD_PER_CREDIT;
  }

  record(): void {
    // no-op: spentCredits reads the persisted Σ.
  }
}

/** Collects written rows in memory (tests). */
export class InMemoryUsageWriter implements UsageWriter {
  readonly rows: UsageRecordRow[] = [];
  write(row: UsageRecordRow): void {
    this.rows.push(row);
  }
}

export class InMemoryFetchLogWriter implements FetchLogWriter {
  readonly rows: FetchLogRow[] = [];
  write(row: FetchLogRow): void {
    this.rows.push(row);
  }
}

/** Supplies the provider (Anthropic) API key. The ONLY place a provider key lives (REQ-ARCH-30). */
export interface SecretProvider {
  anthropicApiKey(): string;
}

/** A fixed key (tests, or a single-shot process). */
export class StaticSecretProvider implements SecretProvider {
  constructor(private readonly key: string) {}
  anthropicApiKey(): string {
    return this.key;
  }
}

/**
 * A provider key read from a loader at start and re-read on demand — the live service calls `reload()` from a
 * SIGHUP handler so a rotated Secret Manager value is picked up without a restart (REQ-ARCH-30; §12.7).
 */
export class ReloadableSecretProvider implements SecretProvider {
  private key: string;
  constructor(private readonly load: () => string) {
    this.key = load();
  }
  anthropicApiKey(): string {
    return this.key;
  }
  /** Re-read the key (call from the SIGHUP handler). */
  reload(): void {
    this.key = this.load();
  }
}
