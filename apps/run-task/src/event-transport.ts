// The LIVE fetch transport behind the run-task `EventTransport` seam (D-P0.08b-4). Binds `post` to a
// `POST /internal/runs/:id/events` against the api, carrying the run token; rejects on any network/HTTP
// failure so the `EventBufferClient` spills the batch to disk and drains it, in order, on recovery. Chunking
// (≤250) + back-pressure live in the buffer client; this transport adds a bounded retry-with-backoff for
// transient failures, then rejects. `fetch` is a global (no dependency); it is injected so this is testable.

import type { EventTransport, OutboundEvent } from "./event-buffer.js";

type FetchLike = (input: string, init: RequestInit) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface FetchEventTransportOptions {
  /** the internal api base URL (e.g. the run's `INTERNAL_API_URL`). */
  readonly baseUrl: string;
  readonly runId: string;
  /** the harness's run token (Bearer) — the harness uid holds it; the agent uid never sees it. */
  readonly runToken: string;
  /** injected for tests; defaults to the global fetch. */
  readonly fetchImpl?: FetchLike;
  /** bounded retries on a transient failure (default 2 → 3 attempts total). */
  readonly retries?: number;
  /** base backoff in ms (exponential); default 100. */
  readonly backoffMs?: number;
  /** sleep, injected for deterministic tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A 5xx / network error is transient (retry); a 4xx is not (fail fast — the batch is malformed or unauthorized). */
function isTransientStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

export function createFetchEventTransport(opts: FetchEventTransportOptions): EventTransport {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const retries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 100;
  const sleep = opts.sleep ?? defaultSleep;
  const url = `${opts.baseUrl.replace(/\/$/, "")}/internal/runs/${encodeURIComponent(opts.runId)}/events`;

  return {
    async post(events: readonly OutboundEvent[]): Promise<void> {
      let lastError: Error | undefined;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
        let res: { ok: boolean; status: number; text(): Promise<string> };
        try {
          res = await fetchImpl(url, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${opts.runToken}` },
            body: JSON.stringify({ events }),
          });
        } catch (cause) {
          lastError = new Error(`event-transport: POST failed (network)`, { cause });
          continue; // network error is transient — retry
        }
        if (res.ok) return;
        const detail = await res.text().catch(() => "");
        lastError = new Error(`event-transport: POST ${url} → ${res.status} ${detail}`.trim());
        if (!isTransientStatus(res.status)) break; // a 4xx will not succeed on retry — fail fast
      }
      throw lastError ?? new Error("event-transport: POST failed");
    },
  };
}
