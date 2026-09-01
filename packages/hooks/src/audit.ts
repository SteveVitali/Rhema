// @rhema/hooks — the audit write interface (REQ-ARCH-18; REQ-DATA-16).
//
// Every allowed and denied call is audited, append-only, retained 90 days, then summarized into an
// `access_report` (§11.4, §13.3 / REQ-ARCH-29). This is a *secondary* attempts record — the trust chip
// rests on the server-side hydration manifest and the proxy log, not on this sandbox-adjacent audit
// (§12.6). This ticket defines the WRITE INTERFACE and buffering; the transport (the harness-side internal
// API) is P0.06/P0.08. The `fetch_log` writer is the join target for source cards and cited ⇒ fetched
// (REQ-DATA-16); the proxy/fetcher later joins post-fetch `status`/`bytes` onto these decision rows.

import type { AccessLogRow, FetchLogRow } from "./types.js";

/** Append-only retention for the raw logs before they are summarized into an `access_report` (REQ-ARCH-29). */
export const RETENTION_DAYS = 90;

/** The transport a host wires in (P0.06/P0.08): ships buffered rows to the internal API. Append-only. */
export interface AuditTransport {
  sendAccess(rows: readonly AccessLogRow[]): Promise<void>;
  sendFetch(rows: readonly FetchLogRow[]): Promise<void>;
}

/** The buffered, append-only audit sink the hook writes each decision to. */
export interface AuditSink {
  writeAccess(row: AccessLogRow): void;
  writeFetch(row: FetchLogRow): void;
  /** Rows buffered but not yet shipped. */
  pending(): { access: number; fetch: number };
  /** Ship everything buffered. Called at each phase commit (and on a full buffer). */
  flush(): Promise<void>;
}

export interface BufferedAuditOptions {
  /** Ship automatically once this many rows are buffered across both logs (default 128). */
  readonly flushAt?: number;
}

/**
 * A buffered audit sink over a transport. Rows accumulate and ship on `flush()` or when the buffer reaches
 * `flushAt`. Append-only: the sink never rewrites or drops a buffered row; a failed flush leaves the rows
 * buffered for the next attempt (the caller decides retry cadence).
 */
export function createBufferedAuditWriter(
  transport: AuditTransport,
  options: BufferedAuditOptions = {},
): AuditSink {
  const flushAt = options.flushAt ?? 128;
  let access: AccessLogRow[] = [];
  let fetch: FetchLogRow[] = [];

  const maybeAutoFlush = (): void => {
    if (access.length + fetch.length >= flushAt) void flush();
  };

  async function flush(): Promise<void> {
    const a = access;
    const f = fetch;
    access = [];
    fetch = [];
    try {
      if (a.length) await transport.sendAccess(a);
      if (f.length) await transport.sendFetch(f);
    } catch (err) {
      // Append-only: put the unshipped rows back, oldest-first, for the next flush.
      access = [...a, ...access];
      fetch = [...f, ...fetch];
      throw err;
    }
  }

  return {
    writeAccess(row) {
      access.push(row);
      maybeAutoFlush();
    },
    writeFetch(row) {
      fetch.push(row);
      maybeAutoFlush();
    },
    pending() {
      return { access: access.length, fetch: fetch.length };
    },
    flush,
  };
}
