import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClaimLedgerSidecar } from "@rhema/contracts";
import { InMemoryContentStore, normalizeUrl, type DeliveryArgs, type VerdictSourceContext } from "@rhema/mirror";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "./testing/index.js";
import { SqlEventWriter, InMemoryRunEventBus, publishCommittedEventHighWater, type RunEventPublisher } from "./event-store.js";
import { streamRunEvents, readUserEventsAfter } from "./event-stream.js";
import { finalizeRun, failRun, failStep } from "./internal-api.js";
import { deliverRun } from "./delivery.js";
import { cancelRun } from "./cancel.js";
import { resolveGate } from "./gate-resolution.js";
import { handleGateExpiry } from "./gate-expiry.js";
import { reap } from "./reaper.js";
import { sweepStrandedRuns, STUCK_PROVISIONING_MS, type StrandedSweepDeps } from "./stranded-sweep.js";
import type { SqlClient, TxRunner } from "./tx.js";
import type { IdFactory } from "./ids.js";

// REQ-ENG-2 — the finalize-path post-commit wakeup (D-SLO.1-6). `SqlEventWriter.append` publishes the
// run's seq INSIDE the uncommitted transaction; a woken SSE tail pumps immediately, reads committed
// rows, sees nothing, and — when that batch was the run's LAST — waits for the 10 s `pollIntervalMs`
// safety poll (six measured terminal flushes ~2.2 s → event-delivery p95 2,238 ms). Mid-run batches
// are masked because the next append's wakeup re-reads and catches them (p50 34 ms); terminal batches
// have no next publish. These tests pin the fix: after every run-end commit the writer republishes
// the run's COMMITTED high-water seq, so the terminal batch arrives on a wakeup, not the poll.
//
// Determinism note: PGlite is single-connection, so a subscriber pump fired by an in-tx publish sees
// the uncommitted rows on the same wire — the prod race cannot be reproduced at the Postgres-visibility
// level here. It is pinned at the seam instead: (a) a commit-boundary probe records whether each
// `publish` call fired while a transaction was still in flight; (b) the in-tx wakeup is modelled LOST
// (the prod outcome — the early pump found no committed rows) so delivery attribution to the
// post-commit wakeup vs the safety poll is exact, not timed.

interface PublishRec {
  readonly runId: string;
  readonly seq: number;
  /** transactions in flight at publish time: >0 ⇒ the publish fired pre-commit (the race). */
  readonly inFlight: number;
}

/** Wraps `db.txRunner`, recording how many transactions were in flight at each publish. */
function commitBoundaryProbe(db: OrchestratorTestDb): {
  readonly txRunner: TxRunner;
  readonly published: PublishRec[];
  readonly publisher: RunEventPublisher;
  readonly bus: InMemoryRunEventBus;
} {
  let inFlight = 0;
  const txRunner: TxRunner = {
    run<T>(tenantId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      inFlight++;
      return db.txRunner
        .run(tenantId, fn)
        .finally(() => {
          inFlight--;
        });
    },
  };
  const published: PublishRec[] = [];
  const bus = new InMemoryRunEventBus();
  const publisher: RunEventPublisher = {
    publish(runId: string, seq: number) {
      published.push({ runId, seq, inFlight });
      return bus.publish(runId, seq);
    },
  };
  return { txRunner, published, publisher, bus };
}

const PAST = new Date("2026-09-02T00:00:00Z"); // before the FixedClock's 2026-09-02T12:00:00Z

describe("REQ-ENG-2 — post-commit wakeup on every run-end terminal commit", () => {
  let db: OrchestratorTestDb;
  let seed: Awaited<ReturnType<typeof seedProject>>;
  let probe: ReturnType<typeof commitBoundaryProbe>;
  let deps: TestDeps;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    seed = await seedProject(db);
    probe = commitBoundaryProbe(db);
    deps = {
      ...makeDeps(db),
      txRunner: probe.txRunner,
      eventWriter: new SqlEventWriter(probe.publisher), // in-tx publishes (the racy arm)
      eventPublisher: probe.publisher, // the post-commit republish seam
    };
  });
  afterEach(() => db.close());

  /** The committed high-water seq for a run (run_event_seq is the seq counter of record). */
  async function highWater(runId: string): Promise<number> {
    const row = (await db.client.query("select seq from run_event_seq where run_id = $1", [runId]))
      .rows[0] as { seq: number } | undefined;
    return row?.seq ?? 0;
  }

  /**
   * The race pin: the run's LAST publish must be a post-commit republish carrying the committed
   * high-water seq. Pre-fix every publish records `inFlight > 0` (fired inside the uncommitted tx)
   * and this assertion fails.
   */
  async function expectPostCommitWakeup(runId: string): Promise<void> {
    const forRun = probe.published.filter((p) => p.runId === runId);
    expect(forRun.length).toBeGreaterThan(0);
    const inTx = forRun.filter((p) => p.inFlight > 0);
    const postCommit = forRun.filter((p) => p.inFlight === 0);
    expect(inTx.length).toBeGreaterThan(0); // the in-tx publishes still fired (best-effort wakeups)
    expect(postCommit.length).toBe(1); // exactly one republish, after the commit resolved
    expect(postCommit[0].seq).toBe(await highWater(runId)); // the COMMITTED high-water seq
    // …and it is the last publish for the run (nothing racy follows it).
    expect(forRun[forRun.length - 1]).toBe(postCommit[0]);
  }

  it("finalizeRun (finalizing → completed): the terminal batch's wakeup lands after commit", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "finalizing" });
    const res = await finalizeRun(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      spentCredits: 10,
      capCredits: 100,
    });
    expect(res).toMatchObject({ ok: true, state: "completed" });
    await expectPostCommitWakeup("run1");
  });

  it("failRun (running → failed): same post-commit republish", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const res = await failRun(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      from: "running",
      failure: { code: "validation", message: "bad sidecar", retryable: false },
      refundCredits: 0,
    });
    expect(res).toMatchObject({ ok: true, state: "failed" });
    await expectPostCommitWakeup("run1");
  });

  it("failStep terminal leg (running → failed in the step-fail tx): same", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "intake",
      ordinal: 0,
      errorClass: "budget", // terminal: cap reached → running → failed in this tx
      reason: "run reached its cap of 840 credits",
    });
    expect(res).toMatchObject({ ok: true, terminal: "cap_reached" });
    await expectPostCommitWakeup("run1");
  });

  it("cancelRun (running → cancelling → cancelled): same", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const res = await cancelRun(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(res).toMatchObject({ ok: true, state: "cancelled" });
    await expectPostCommitWakeup("run1");
  });

  it("resolveGate stop (waiting_gate → cancelled): same", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    await seedGate(db, { gateId: "g1", runId: "run1", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: PAST });
    const res = await resolveGate(deps, {
      runId: "run1",
      gateId: "g1",
      workspaceId: seed.workspaceId,
      userId: "usr_seed",
      action: "stop",
    });
    expect(res).toMatchObject({ ok: true, state: "cancelled" });
    await expectPostCommitWakeup("run1");
  });

  it("handleGateExpiry cancel arm (awaiting_consent → cancelled): same", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "awaiting_consent", holdLedgerId: "led" });
    await seedGate(db, { gateId: "g1", runId: "run1", kind: "confirm_cost", onExpiry: "cancel", deadlineAt: PAST });
    const res = await handleGateExpiry(deps, { gateId: "g1", workspaceId: seed.workspaceId });
    expect(res).toMatchObject({ action: "resolved", state: "cancelled" });
    await expectPostCommitWakeup("run1");
  });

  it("the orphan reaper completing a cancel (cancelling → cancelled): same", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "cancelling", currentAttempt: 1 });
    await deps.heartbeats.beat({
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      at: new Date(deps.clock.now().getTime() - 4 * 60_000), // stale
    });
    const out = await reap(deps);
    expect(out).toEqual([{ runId: "run1", action: "cancelled" }]);
    await expectPostCommitWakeup("run1");
  });

  it("the stranded sweep failing a stuck launch (provisioning → failed): same", async () => {
    const now = deps.clock.now();
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "provisioning",
      stateSince: new Date(now.getTime() - STUCK_PROVISIONING_MS - 60_000),
    });
    const sweepDeps: StrandedSweepDeps = { ...deps, systemExec: db.client };
    const out = await sweepStrandedRuns(sweepDeps);
    expect(out).toEqual([{ kind: "provisioning_failed", runId: "run1", workspaceId: seed.workspaceId }]);
    await expectPostCommitWakeup("run1");
  });

  it("a rolled-back terminal commit publishes NO post-commit wakeup (rolled-back rows get no phantom seq)", async () => {
    // `running` has no legal edge to `completed` — applyTransition throws inside the tx, the commit
    // never happens, and the post-commit republish must never fire for rows that rolled back.
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await expect(
      finalizeRun(deps, {
        runId: "run1",
        workspaceId: seed.workspaceId,
        billingAccountId: seed.billingAccountId,
        spentCredits: 10,
        capCredits: 100,
      }),
    ).rejects.toThrow();
    expect(probe.published.filter((p) => p.inFlight === 0)).toHaveLength(0);
  });
});

describe("REQ-ENG-2 — deliverRun (the completed-run path D-SLO.1-6 measured)", () => {
  const WS = "ws_seed";
  const PROJECT = "prj_seed";
  const RUN = "run_deliver";
  const FETCHED = "https://a.example/one";
  const VCTX: VerdictSourceContext = { citationDomains: new Set(), reputableDomains: new Set(), searchResultDomains: new Set() };
  const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  function ulidIds(): IdFactory {
    let n = 0;
    return () => {
      let s = "";
      let v = ++n;
      while (v > 0) {
        s = CROCKFORD[v % 32] + s;
        v = Math.floor(v / 32);
      }
      return s.padStart(26, "0");
    };
  }

  let db: OrchestratorTestDb;
  let probe: ReturnType<typeof commitBoundaryProbe>;
  let deps: TestDeps;
  let store: InMemoryContentStore;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    await seedProject(db, { draftN: 2 });
    await seedRun(db, { runId: RUN, workspaceId: WS, projectId: PROJECT, state: "finalizing" });
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_v2',$1,$2,'draft','shared','drafts/v2.md','av_v2')`,
      [WS, PROJECT],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v2','art_v2',1,$1,'k',4,'text/markdown','{"kind":"system"}'::jsonb)`,
      ["b".repeat(64)],
    );
    await db.pg.query(
      `insert into fetch_log(run_id, ts, agent_label, attempt, kind, url, normalized_url, decision)
       values ($1, now(), 'editor', 1, 'fetch', $2, $3, 'allow')`,
      [RUN, FETCHED, normalizeUrl(FETCHED)],
    );
    probe = commitBoundaryProbe(db);
    store = new InMemoryContentStore();
    deps = {
      ...makeDeps(db),
      ids: ulidIds(),
      txRunner: probe.txRunner,
      eventWriter: new SqlEventWriter(probe.publisher),
      eventPublisher: probe.publisher,
    };
  });
  afterEach(() => db.close());

  function delivery(over: Partial<DeliveryArgs> = {}): DeliveryArgs {
    const claimLedger: ClaimLedgerSidecar = {
      sidecar: "claim_ledger",
      version: 1,
      claims: [{ ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: FETCHED, normalizedUrl: normalizeUrl(FETCHED), humanAdded: false }],
    } as ClaimLedgerSidecar;
    return {
      runId: RUN,
      attempt: 1,
      workspaceId: WS,
      projectId: PROJECT,
      draftId: "dft_prj_seed_2",
      correspondenceKind: "review",
      deliveredVersionIds: ["av_v2"],
      draftPromotedVersionId: "av_v2",
      sidecars: [{ filename: "01-claim-ledger.json", json: claimLedger }],
      claimLedger,
      verdictContext: VCTX,
      ...over,
    };
  }

  it("a committed delivery republishes the committed high-water seq after commit", async () => {
    const res = await deliverRun(
      { ...deps, store },
      { billingAccountId: "ba_seed", spentCredits: 42, capCredits: 100, delivery: delivery() },
    );
    expect(res).toMatchObject({ ok: true, state: "completed" });
    const forRun = probe.published.filter((p) => p.runId === RUN);
    const postCommit = forRun.filter((p) => p.inFlight === 0);
    expect(postCommit.length).toBe(1);
    const hw = (await db.client.query("select seq from run_event_seq where run_id = $1", [RUN]))
      .rows[0] as { seq: number };
    expect(postCommit[0].seq).toBe(hw.seq);
    expect(forRun[forRun.length - 1]).toBe(postCommit[0]);
  });
});

describe("REQ-ENG-2 — the terminal batch arrives on a wakeup, not the safety poll", () => {
  let db: OrchestratorTestDb;
  let seed: Awaited<ReturnType<typeof seedProject>>;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    seed = await seedProject(db);
  });
  afterEach(() => db.close());

  const reader = () => (afterSeq: number) =>
    db.txRunner.run(seed.workspaceId, (tx) => readUserEventsAfter(tx, "run1", afterSeq, { maxDensity: "verbose" }));

  function collectSink(): { chunks: string[]; sink: (c: string) => void } {
    const chunks: string[] = [];
    return { chunks, sink: (c) => void chunks.push(c) };
  }
  function seqsOf(chunks: string[]): number[] {
    return chunks
      .flatMap((c) => c.split("\n"))
      .filter((l) => l.startsWith("id: "))
      .map((l) => Number(l.slice(4)));
  }
  async function waitFor(cond: () => boolean, ms = 3000): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (cond()) return true;
      await new Promise((r) => setTimeout(r, 10));
    }
    return cond();
  }

  it("with the in-tx wakeup lost (the prod race), the post-commit republish still wakes the tail — poll disabled", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "finalizing" });
    const bus = new InMemoryRunEventBus();
    // the in-tx publish is modelled LOST: in prod its wakeup pumps before commit and finds no rows —
    // for this test's purposes identical to the publish never reaching subscribers.
    const lostInTx: RunEventPublisher = { publish: () => undefined };
    const deps: TestDeps = {
      ...makeDeps(db),
      eventWriter: new SqlEventWriter(lostInTx),
      eventPublisher: bus, // the post-commit seam wakes the SAME bus the tail subscribes to
    };

    const a = collectSink();
    const ac = new AbortController();
    const done = streamRunEvents({
      runId: "run1",
      read: reader(),
      sink: a.sink,
      subscriber: bus,
      signal: ac.signal,
      pingIntervalMs: 3_600_000, // never fires in-test
      pollIntervalMs: 3_600_000, // never fires in-test: delivery can ONLY come via a wakeup
    });
    await new Promise((r) => setTimeout(r, 20)); // let replay + subscribe settle

    await finalizeRun(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      spentCredits: 10,
      capCredits: 100,
    });

    // run.state_changed + cost.final must arrive WITHOUT any poll — the post-commit wakeup did it.
    const delivered = await waitFor(() => seqsOf(a.chunks).length >= 2);
    ac.abort();
    await done;
    expect(delivered).toBe(true);
    const types = a.chunks
      .flatMap((c) => c.split("\n"))
      .filter((l) => l.startsWith("event: "))
      .map((l) => l.slice(7));
    expect(types).toEqual(["run.state_changed", "cost.final"]);
  });

  it("WITHOUT the post-commit seam bound, the same lost-wakeup batch waits for the safety poll", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "finalizing" });
    const bus = new InMemoryRunEventBus();
    const lostInTx: RunEventPublisher = { publish: () => undefined };
    const deps: TestDeps = {
      ...makeDeps(db),
      eventWriter: new SqlEventWriter(lostInTx),
      // eventPublisher deliberately UNBOUND — the pre-fix shape: the only wakeups are the lost in-tx ones.
    };

    const a = collectSink();
    const ac = new AbortController();
    const done = streamRunEvents({
      runId: "run1",
      read: reader(),
      sink: a.sink,
      subscriber: bus,
      signal: ac.signal,
      pingIntervalMs: 3_600_000,
      pollIntervalMs: 60, // the 10 s safety poll, shortened — the ONLY remaining delivery mechanism
    });
    await new Promise((r) => setTimeout(r, 20));
    await finalizeRun(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      spentCredits: 10,
      capCredits: 100,
    });
    // no wakeup can ever reach the tail (nothing was published to the bus at all)…
    expect(bus.published).toHaveLength(0);
    // …yet the events still arrive — proof they rode the safety poll, the exact D-SLO.1-6 shape.
    const delivered = await waitFor(() => seqsOf(a.chunks).length >= 2);
    ac.abort();
    await done;
    expect(delivered).toBe(true);
  });
});

describe("REQ-ENG-2 — the wakeup seam itself (publishCommittedEventHighWater)", () => {
  let db: OrchestratorTestDb;
  let seed: Awaited<ReturnType<typeof seedProject>>;
  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    seed = await seedProject(db);
  });
  afterEach(() => db.close());

  it("publishes the committed high-water seq on the run's channel", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    const bus = new InMemoryRunEventBus();
    const writer = new SqlEventWriter(bus);
    await db.txRunner.run(seed.workspaceId, (tx) =>
      writer.append(tx, { runId: "run1", type: "run.started", payload: {}, at: new Date() }),
    );
    bus.published.length = 0; // observe only the republish
    await publishCommittedEventHighWater({ txRunner: db.txRunner, eventPublisher: bus }, seed.workspaceId, "run1");
    expect(bus.published).toEqual([{ runId: "run1", seq: 1 }]);
  });

  it("is a no-op when no publisher is bound and swallows a failing publisher", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    // unbound → resolves without touching the store
    await publishCommittedEventHighWater({ txRunner: db.txRunner }, seed.workspaceId, "run1");
    // throwing publisher → swallowed (the wakeup is best-effort; the poll stays the backstop)
    const throwing: RunEventPublisher = {
      publish: () => {
        throw new Error("redis down");
      },
    };
    await publishCommittedEventHighWater({ txRunner: db.txRunner, eventPublisher: throwing }, seed.workspaceId, "run1");
  });

  it("a throwing publisher never breaks finalizeRun (best-effort wakeup)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "finalizing" });
    const deps: TestDeps = {
      ...makeDeps(db),
      eventPublisher: {
        publish: () => {
          throw new Error("redis down");
        },
      },
    };
    const res = await finalizeRun(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      spentCredits: 10,
      capCredits: 100,
    });
    expect(res).toMatchObject({ ok: true, state: "completed" });
  });
});
