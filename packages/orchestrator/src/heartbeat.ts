// Heartbeats live in Redis (SETEX); Postgres sees only transitions (§11.4; §12.4 step 5). The task
// heartbeats every 20 s carrying its attempt; the record also carries `cancelRequested` (read back so Stop
// reaches the task) and `workspaceId` (so the reaper can open a tenant-scoped transaction without a
// cross-tenant DB scan). Live Redis wiring is the api/worker's; this is the interface + an in-memory store.

export const HEARTBEAT_INTERVAL_MS = 20_000; //  the task beats every 20 s (§12.4)
export const HEARTBEAT_STALE_MS = 3 * 60_000; // stale > 3 min → orphaned (§12.4)
export const HEARTBEAT_TTL_MS = HEARTBEAT_STALE_MS; // SETEX TTL

export interface HeartbeatRecord {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  readonly at: Date;
  readonly cancelRequested: boolean;
}

export interface HeartbeatStore {
  /** SETEX the run's heartbeat (overwrites; TTL = HEARTBEAT_TTL_MS). */
  beat(rec: Omit<HeartbeatRecord, "cancelRequested"> & { cancelRequested?: boolean }): Promise<void>;
  get(runId: string): Promise<HeartbeatRecord | null>;
  /** Flag the run for cancellation; the next heartbeat read returns it (§12.4 Stop). */
  requestCancel(runId: string): Promise<void>;
  /** Drop the heartbeat (terminal state / reaper stop). */
  clear(runId: string): Promise<void>;
  /** Every live heartbeat whose `at` is older than `now - staleMs` (the reaper's scan). */
  listStale(now: Date, staleMs: number): Promise<HeartbeatRecord[]>;
}

export class InMemoryHeartbeatStore implements HeartbeatStore {
  private readonly map = new Map<string, HeartbeatRecord>();

  beat(rec: Omit<HeartbeatRecord, "cancelRequested"> & { cancelRequested?: boolean }): Promise<void> {
    const prior = this.map.get(rec.runId);
    this.map.set(rec.runId, {
      runId: rec.runId,
      attempt: rec.attempt,
      workspaceId: rec.workspaceId,
      at: rec.at,
      cancelRequested: rec.cancelRequested ?? prior?.cancelRequested ?? false,
    });
    return Promise.resolve();
  }

  get(runId: string): Promise<HeartbeatRecord | null> {
    return Promise.resolve(this.map.get(runId) ?? null);
  }

  requestCancel(runId: string): Promise<void> {
    const cur = this.map.get(runId);
    if (cur) this.map.set(runId, { ...cur, cancelRequested: true });
    return Promise.resolve();
  }

  clear(runId: string): Promise<void> {
    this.map.delete(runId);
    return Promise.resolve();
  }

  listStale(now: Date, staleMs: number): Promise<HeartbeatRecord[]> {
    const cutoff = now.getTime() - staleMs;
    return Promise.resolve([...this.map.values()].filter((r) => r.at.getTime() < cutoff));
  }
}
