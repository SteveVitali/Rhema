// The viewer-facing SSE route (§12.5): `GET /runs/:id/events?after=<seq>`. NOT an internal/run-token route —
// this is authenticated as the SIGNED-IN VIEWER (session principal). It replays the run's user events with
// `seq > after` from Postgres, then tails new ones (Redis wakeups + a safety poll), all through
// @rhema/orchestrator's `streamRunEvents`. It reads ONLY `run_events` (user rows) inside the viewer's tenant
// transaction, so an internal event can never leak (REQ-ARCH-12) and cross-tenant reads are RLS-denied.
// Viewers receive Summary density; the run's requester may receive up to Verbose (REQ-DATA-38). Mobile polls
// the same endpoint (`?poll=1` returns a finite replay and closes — REQ-MOBILE-5, shape only).

import { Hono } from "hono";
import {
  streamRunEvents,
  readUserEventsAfter,
  formatSse,
  type RunEventSubscriber,
  type OrchestratorDeps,
  type StreamedEvent,
} from "@rhema/orchestrator";
import type { EventDensity } from "@rhema/contracts";
import type { Principal } from "./run-routes.js";

export interface SseApiDeps extends OrchestratorDeps {
  /** Resolve the authenticated VIEWER (session cookie in prod). Shared with the run-creation route. */
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** the fan-out subscriber (Redis); omitted → the safety poll still serves (degrades, never fails). */
  readonly eventSubscriber?: RunEventSubscriber;
  /** SSE tuning (tests shorten the intervals; prod uses the §12.5 defaults). */
  readonly sseOptions?: { pingIntervalMs?: number; pollIntervalMs?: number };
}

/** SSE response headers. `x-accel-buffering: no` disables proxy buffering on the route (REQ-ARCH-13). */
const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

interface RunAccessRow {
  requested_by: string | null;
}

export interface SseAccess {
  readonly ok: boolean;
  readonly status: number;
  readonly maxDensity: EventDensity;
}

/**
 * Resolve the viewer's access to a run's feed inside the viewer's tenant transaction. The run is scoped
 * explicitly to the viewer's workspace (`workspace_id = $2`) — defense in depth alongside RLS, and the actual
 * authorization gate under a superuser connection where RLS is bypassed — so another tenant's run is 404 (deny
 * by default). The requester sees up to Verbose; any other viewer is capped at Summary (REQ-DATA-38).
 */
export async function resolveSseAccess(
  deps: SseApiDeps,
  runId: string,
  principal: Principal,
): Promise<SseAccess> {
  const row = await deps.txRunner.run(principal.workspaceId, async (tx) => {
    const res = await tx.query("select requested_by from runs where id = $1 and workspace_id = $2", [
      runId,
      principal.workspaceId,
    ]);
    return res.rows[0] as RunAccessRow | undefined;
  });
  if (!row) return { ok: false, status: 404, maxDensity: "summary" };
  const isRequester = row.requested_by != null && row.requested_by === principal.userId;
  return { ok: true, status: 200, maxDensity: isRequester ? "verbose" : "summary" };
}

/** Parse the resume point: `?after=<seq>` wins, else the `Last-Event-ID` header, else 0 (from the start). */
export function parseAfterSeq(afterQuery: string | undefined, lastEventId: string | undefined): number {
  const raw = afterQuery ?? lastEventId;
  const n = raw != null ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function createSseRoutes(deps: SseApiDeps): Hono {
  const app = new Hono();

  app.get("/runs/:id/events", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const runId = c.req.param("id");

    const access = await resolveSseAccess(deps, runId, principal);
    if (!access.ok) return c.json({ error: "not_found" }, access.status as 404);

    const afterSeq = parseAfterSeq(c.req.query("after"), c.req.header("last-event-id"));
    const read = (after: number): Promise<StreamedEvent[]> =>
      deps.txRunner.run(principal.workspaceId, (tx) =>
        readUserEventsAfter(tx, runId, after, { maxDensity: access.maxDensity }),
      );

    // Mobile poll (REQ-MOBILE-5, shape only): a finite replay of everything past `after`, then close.
    if (c.req.query("poll") != null) {
      const rows = await read(afterSeq);
      const body = rows.map(formatSse).join("");
      return new Response(body, { headers: SSE_HEADERS });
    }

    // Browser SSE: replay-then-tail until the client disconnects (request abort).
    const encoder = new TextEncoder();
    const signal = c.req.raw.signal;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void streamRunEvents({
          runId,
          afterSeq,
          read,
          sink: (chunk) => controller.enqueue(encoder.encode(chunk)),
          subscriber: deps.eventSubscriber,
          signal,
          pingIntervalMs: deps.sseOptions?.pingIntervalMs,
          pollIntervalMs: deps.sseOptions?.pollIntervalMs,
          // STB.2 / D-P0.08b-3 — the §13.5 event-delivery metric's data path: one `slo_samples`
          // row per flush batch carrying the batch's max append→flush ms (0042; probed by the
          // worker's `slo.probe` sweep as `event_delivery_latency_p95_s`). Fire-and-forget —
          // telemetry never blocks or fails the stream, and a pre-0042 deploy simply drops it.
          onFlush: (sample) => {
            void deps.txRunner
              .run(principal.workspaceId, (tx) =>
                tx.query(
                  `insert into slo_samples (signal, value_ms, workspace_id, run_id)
                     values ('event_delivery_ms', $1, $2, $3)`,
                  [sample.maxDeliveryMs, principal.workspaceId, runId],
                ),
              )
              .catch(() => undefined);
          },
        }).finally(() => {
          try {
            controller.close();
          } catch {
            /* already closed by the client disconnect */
          }
        });
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  });

  return app;
}
