import { describe, expect, it, vi } from "vitest";
import { createBufferedAuditWriter, RETENTION_DAYS } from "./audit.js";
import type { AccessLogRow, FetchLogRow } from "./types.js";

const accessRow = (path: string): AccessLogRow => ({
  runId: "r1",
  ts: "T",
  agentLabel: "editor",
  tool: "Read",
  path,
  namespace: "shared",
  decision: "allow",
});
const fetchRow = (): FetchLogRow => ({ runId: "r1", ts: "T", agentLabel: "editor", kind: "search", decision: "allow" });

describe("retention", () => {
  it("is 90 days (REQ-ARCH-18/29)", () => {
    expect(RETENTION_DAYS).toBe(90);
  });
});

describe("buffered audit writer", () => {
  it("buffers until flush, then ships append-only in order", async () => {
    const sent: AccessLogRow[][] = [];
    const transport = {
      sendAccess: vi.fn(async (rows: readonly AccessLogRow[]) => {
        sent.push([...rows]);
      }),
      sendFetch: vi.fn(async () => {}),
    };
    const sink = createBufferedAuditWriter(transport);
    sink.writeAccess(accessRow("/a"));
    sink.writeAccess(accessRow("/b"));
    expect(sink.pending()).toEqual({ access: 2, fetch: 0 });
    expect(transport.sendAccess).not.toHaveBeenCalled();

    await sink.flush();
    expect(sent[0]?.map((r) => r.path)).toEqual(["/a", "/b"]);
    expect(sink.pending()).toEqual({ access: 0, fetch: 0 });
  });

  it("auto-flushes when the buffer reaches flushAt", async () => {
    const transport = { sendAccess: vi.fn(async () => {}), sendFetch: vi.fn(async () => {}) };
    const sink = createBufferedAuditWriter(transport, { flushAt: 2 });
    sink.writeAccess(accessRow("/a"));
    sink.writeFetch(fetchRow()); // second row hits flushAt=2
    await Promise.resolve();
    expect(transport.sendAccess).toHaveBeenCalledTimes(1);
    expect(transport.sendFetch).toHaveBeenCalledTimes(1);
  });

  it("re-buffers rows (append-only) when a flush fails, so nothing is dropped", async () => {
    let attempt = 0;
    const transport = {
      sendAccess: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("transport down");
      }),
      sendFetch: vi.fn(async () => {}),
    };
    const sink = createBufferedAuditWriter(transport);
    sink.writeAccess(accessRow("/a"));
    await expect(sink.flush()).rejects.toThrow("transport down");
    expect(sink.pending()).toEqual({ access: 1, fetch: 0 }); // still buffered

    await sink.flush(); // second attempt succeeds
    expect(sink.pending()).toEqual({ access: 0, fetch: 0 });
    expect(transport.sendAccess).toHaveBeenCalledTimes(2);
  });
});
