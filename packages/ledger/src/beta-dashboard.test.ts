import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { BETA_GATE_THRESHOLDS } from "@rhema/contracts";
import { recordAnalyticsEvent } from "./analytics.js";
import {
  computeBetaDashboard,
  materializeRunAnalytics,
  renderBetaDashboard,
} from "./beta-dashboard.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  testEntryDeps,
  type LedgerTestDb,
} from "./testing/index.js";

// PRB.12 — AC4: the weekly beta dashboard renders every REQ-BETA-18 gate metric from seeded event
// data, each beside its registered threshold. The fixture is a full beta slice on real PGlite:
// runs/steps/gates/decisions, delivered reviews (rounds), findings incl. second-read, dispositions,
// imports, WTP, dwell, margin rows (ledger debits vs usage COGS), and a boundary failure — the
// materializer projects the domain facts into the stream, then the dashboard reads it back.

let db: LedgerTestDb;
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_seed";
const USER = "01JQ0000000000000000000MB1";
const PROJ = "01JQ0000000000000000000PJ1";
const RUN1 = "01JQ0000000000000000000RN1";
const RUN2 = "01JQ0000000000000000000RN2";
const D1 = "01JQ0000000000000000000DF1";
const D2 = "01JQ0000000000000000000DF2";
const C1 = "01JQ0000000000000000000CR1";
const C2 = "01JQ0000000000000000000CR2";
const NOW = new Date("2026-09-09T12:00:00Z");
const WINDOW = { from: new Date("2026-09-02T00:00:00Z"), to: new Date("2026-09-09T00:00:00Z") };

const deps = () => testEntryDeps(NOW);
const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);

async function seedFixture() {
  await seedProject(db, {
    userId: USER, workspaceId: WS, billingAccountId: BA, projectId: PROJ,
    draftN: 1, draftId: D1,
  });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
  await db.pg.query("update projects set venue = 'Test Journal' where id = $1", [PROJ]);
  // A frozen human-revision draft (draft.edited materialization) — needs a promoted artifact_version
  // (the frozen-state check) and can't be 'working' (one_working_head_per_project).
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
       values ('art_hr',$1,$2,'draft','shared','drafts/v2.md')`,
    [WS, PROJ],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
       values ('av_hr','art_hr',1,$1,'k_hr',10,2,'text/markdown','{"kind":"user"}'::jsonb,true)`,
    ["a".repeat(64)],
  );
  await db.pg.query(
    "insert into drafts(id, project_id, n, origin, state, promoted_version_id, created_at) values ($1,$2,2,'human_revision','frozen','av_hr','2026-09-05T09:00:00Z')",
    [D2, PROJ],
  );

  // A completed review run + a cancelled run (cancel-rate numerator). `runs.created_at` defaults to
  // now() — pin both inside the reporting window.
  await seedRun(db, { runId: RUN1, workspaceId: WS, projectId: PROJ, state: "completed", spentCredits: 500, capCredits: 840 });
  await seedRun(db, { runId: RUN2, workspaceId: WS, projectId: PROJ, state: "cancelled", spentCredits: 40 });
  await db.pg.query("update runs set requested_by = $2, estimate_credits = 560, created_at = '2026-09-03T09:00:00Z' where id = $1", [RUN1, USER]);
  await db.pg.query("update runs set requested_by = $2, created_at = '2026-09-04T09:00:00Z' where id = $1", [RUN2, USER]);
  await db.pg.query(
    `insert into steps(id, run_id, phase, ordinal, state, started_at, ended_at, credits)
       values ('st_1', $1, 'ingest', 1, 'done', '2026-09-03T10:00:00Z', '2026-09-03T10:12:00Z', 120)`,
    [RUN1],
  );

  // A consent gate + a human decision (approval latency + the consent funnel).
  await db.pg.query(
    `insert into gates(id, run_id, step_id, kind, artifact_version_id, opened_at, deadline_at, blocking,
       on_expiry, held, paused_while_reading, presence_deadline_at)
     values ('g_consent',$1,null,'confirm_cost',null,'2026-09-03T10:00:00Z',null,true,'wait',false,false,null)`,
    [RUN1],
  );
  await db.pg.query(
    "insert into decisions(gate_id, by_actor, action, at) values ('g_consent','user','approve','2026-09-03T10:30:00Z')",
    [],
  );

  // Two delivered reviews on the same manuscript → round.completed ×2 (the repeat-cycle signal).
  const rubric = { dimensions: [{ dimension: "argument", score: 3 }] };
  const rubric2 = { dimensions: [{ dimension: "argument", score: 4 }] };
  await db.pg.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids, rubric)
       values ($1,$2,'review',$3,$4,1,'2026-09-03T12:00:00Z','{}',$5)`,
    [C1, PROJ, D1, RUN1, JSON.stringify(rubric)],
  );
  await db.pg.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids, rubric, prior_review_id)
       values ($1,$2,'review',$3,$4,2,'2026-09-06T12:00:00Z','{}',$5,$6)`,
    [C2, PROJ, D2, RUN1, JSON.stringify(rubric2), C1],
  );
  await db.pg.query(
    `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
       values ('f_1',$1,$2,1,'clarity','major','first_read','t','b'),
              ('f_2',$1,$2,2,'evidence','minor','second_read','t','b')`,
    [C2, D2],
  );

  // A user-visible run event (revision.move_traced) + an attestation WITH a violation + one internal
  // violation row → boundaryAttestationFailures = 2 (the stop clause must trip).
  await db.pg.query(
    `insert into run_events(run_id, seq, workspace_id, day, type, payload, density, at)
       values ($1,1,$2,'2026-09-03','revision.move_traced',
               '{"findingId":"01JQ0000000000000000000FD1","moveId":"01JQ0000000000000000000MV1","hunkCount":2,"charsChanged":88}',
               'normal','2026-09-03T12:30:00Z'),
              ($1,2,$2,'2026-09-03','boundary.attested',
               '{"paths_touched_count":3,"denied_count":0,"violations":1}','summary','2026-09-03T12:31:00Z')`,
    [RUN1, WS],
  );
  await db.pg.query(
    `insert into run_events_internal(run_id, seq, workspace_id, type, payload, at)
       values ($1,1,$2,'boundary.violation','{}','2026-09-03T12:31:30Z')`,
    [RUN1, WS],
  );

  // Margin: 500 credits billed ($5.00) vs $3.10 COGS → 38% margin.
  await db.pg.query(
    `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key, at)
       values ('led_1',$1,$2,'debit',500,'promo',$3,'run','idem_d1','2026-09-03T12:00:00Z'),
              ('led_2',$1,$2,'grant',200000,'promo',null,'admin','idem_g1','2026-09-02T09:00:00Z')`,
    [WS, BA, RUN1],
  );
  await db.pg.query(
    `insert into usage_records(id, ts, workspace_id, billing_account_id, run_id, role, provider, model, model_tier,
                               rate_table_version, list_cost_usd, credits, source)
       values ('u_1','2026-09-03T11:00:00Z',$1,$2,$3,'writer','anthropic','m','balanced',1,3.10,500,'proxy')`,
    [WS, BA, RUN1],
  );

  // Live-emitted stream events: dispositions, imports (second manuscript), WTP, top-up, dwell.
  const emit = (event: Parameters<typeof recordAnalyticsEvent>[2]["event"], props: Record<string, unknown>, runId?: string) =>
    inTx((tx) =>
      recordAnalyticsEvent(tx, deps(), {
        userId: USER, workspaceId: WS, projectId: PROJ, ...(runId ? { runId } : {}), event, props,
        // live emitters stamp "now"; the fixture's "now" is inside the reporting week.
        at: new Date("2026-09-05T14:00:00Z"),
      }),
    );
  await emit("finding.disposed", { disposition: "accept" }, RUN1);
  await emit("finding.disposed", { disposition: "adapt" }, RUN1);
  await emit("finding.disposed", { disposition: "rebut", reason_code: "wrong" }, RUN1);
  await emit("draft.imported", { origin: "docx", is_new_manuscript: true, venue_set: true });
  await emit("draft.imported", { origin: "md", is_new_manuscript: true, venue_set: true });
  await emit("wtp.recorded", { source: "interview", amount: 49 });
  await emit("topup.purchased", {});
  await emit("surface.dwell", { surface: "dossier", ms: 90000 });
}

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedFixture();
});
afterEach(() => db.close());

describe("materializeRunAnalytics — the domain→stream projector", () => {
  it("projects runs/gates/steps/reviews/ledger into the stream, idempotently", async () => {
    const first = await materializeRunAnalytics(db.client, deps(), WINDOW);
    expect(first.inserted).toBeGreaterThan(0);
    const second = await materializeRunAnalytics(db.client, deps(), WINDOW);
    expect(second.inserted).toBe(0); // the dedupe_key absorbed every replay
    const events = (await db.client.query("select event from analytics_events order by at, id")).rows as { event: string }[];
    const names = events.map((e) => e.event);
    for (const expected of [
      "run.launched",
      "run.completed",
      "run.stopped",
      "run.phase_started",
      "run.phase_finished",
      "run.approval_opened",
      "run.approval_decided",
      "estimate.consent_shown",
      "estimate.consent_accepted",
      "round.completed",
      "revision.move_traced",
      "credits.granted",
    ]) {
      expect(names, `missing ${expected}`).toContain(expected);
    }
    // the materialized run.completed carries REQ-PROD-15 economics.
    const completed = (
      await db.client.query("select props from analytics_events where event = 'run.completed'")
    ).rows[0] as { props: Record<string, unknown> };
    expect(completed.props).toMatchObject({ cost_actual: 500, cost_estimate: 560, rigor: "standard" });
  });
});

describe("computeBetaDashboard + renderBetaDashboard (AC4)", () => {
  it("renders every REQ-BETA-18 gate metric beside its registered threshold", async () => {
    await materializeRunAnalytics(db.client, deps(), WINDOW);
    const d = await computeBetaDashboard(db.client, { window: WINDOW, now: NOW });
    const md = renderBetaDashboard(d);

    // every registered gate metric is a rendered row: observed + threshold + reading.
    for (const key of Object.keys(BETA_GATE_THRESHOLDS)) {
      const m = d.metrics.find((x) => x.thresholdKey === key);
      expect(m, `missing gate metric ${key}`).toBeTruthy();
      expect(m!.reading).toMatch(/pass|fail|no data/);
      expect(md).toContain(m!.name);
      expect(md).toContain(m!.threshold!.label);
    }

    // the seeded numbers land where the fixture put them.
    const byKey = new Map(d.metrics.map((m) => [m.key, m]));
    expect(byKey.get("repeatCycleRate")!.observed).toBeCloseTo(1); // 1/1 partner, 2 rounds
    expect(byKey.get("round2Rate")!.observed).toBeCloseTo(1); // 1/1 manuscript past round 1
    expect(byKey.get("acceptAdaptShare")!.observed).toBeCloseTo(2 / 3);
    expect(byKey.get("secondManuscriptImport")!.observed).toBeCloseTo(1); // 2 new-manuscript imports
    expect(byKey.get("paidConversion")!.observed).toBeCloseTo(1); // topup.purchased
    expect(byKey.get("medianStatedWtp")!.observed).toBe(49);
    expect(byKey.get("cancelRate")!.observed).toBeCloseTo(1 / 2); // 1 cancelled of 2 launched
    expect(byKey.get("autoProceedShare")!.observed).toBeCloseTo(0); // the human decided
    expect(byKey.get("boundaryAttestationFailures")!.observed).toBe(2); // attested violations + internal row

    // the stop clause trips on the boundary failure; the readout is mechanical.
    expect(d.readout.stopTripped).toBe(true);
    expect(md).toContain("TRIPPED");

    // supporting metrics render too: latency, second-read yield, margin, run count.
    expect(byKey.get("approvalLatencyMedian")!.observed).toBe(30 * 60 * 1000); // 10:00 → 10:30
    expect(byKey.get("secondReadYield")!.observed).toBeCloseTo(1 / 2);
    const margin = d.perRunMargin.find((r) => r.runId === RUN1);
    expect(margin).toMatchObject({ billedCredits: 500, cogsUsd: 3.1 });
    expect(margin!.marginUsd).toBeCloseTo(1.9);
    expect(d.reasonCodeDistribution).toContainEqual({ code: "wrong", count: 1 });
    expect(d.rubricDeltaDistribution).toContainEqual(
      expect.objectContaining({ dimension: "argument", medianDelta: 1 }),
    );
    expect(d.dwellBySurface).toContainEqual({ surface: "dossier", ms: 90000 });
  });

  it("an opted-out partner's stream events vanish from the dashboard inputs (AC3)", async () => {
    await materializeRunAnalytics(db.client, deps(), WINDOW);
    const before = await computeBetaDashboard(db.client, { window: WINDOW, now: NOW });
    expect(before.metrics.find((m) => m.key === "activePartners")!.observed).toBe(1);
    await db.pg.query('update "user" set analytics_opt_out = true where id = $1', [USER]);
    const after = await computeBetaDashboard(db.client, { window: WINDOW, now: NOW });
    // stream-derived cohorts drop the opted-out user's events (the materializer's writes vanish on read):
    // the round.completed rows are gone → the numerator collapses to 0 (the partner still counts as
    // active via their run rows — runs are system-of-record, not telemetry).
    expect(after.metrics.find((m) => m.key === "repeatCycleRate")!.observed).toBe(0);
    expect(after.metrics.find((m) => m.key === "acceptAdaptShare")!.observed).toBeNull(); // no stream rows at all
  });
});
