import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedGate, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { probeSlos, sloWeeklyReview, SLO_SIGNALS } from "./slo.js";

// P1.22 W9 — the §13.5 SLO probe (REQ-ARCH-34): every signal is either probed against real rows, marked
// measured_elsewhere, or named-unmeasured — never fabricated. These tests run the probes on the migrated
// schema (PGlite) and assert the reading shape + breach semantics.

let db: OrchestratorTestDb;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

function reading(readings: Awaited<ReturnType<typeof probeSlos>>, key: string) {
  const r = readings.find((x) => x.key === key);
  expect(r, `signal ${key} missing from probeSlos output`).toBeTruthy();
  return r!;
}

describe("probeSlos — the §13.5 signal registry (REQ-ARCH-34)", () => {
  it("covers every §13.5 row: probed, measured_elsewhere, or named-unmeasured — never silent", async () => {
    const readings = await probeSlos(db.client);
    expect(readings.length).toBe(SLO_SIGNALS.length);
    for (const sig of SLO_SIGNALS) {
      // every registry entry is either a probe or a named gap.
      expect(sig.probe !== undefined || sig.unmeasuredReason !== undefined, sig.key).toBe(true);
    }
    // the named-unmeasured set: api_availability + cost_drift stay gap-named (a Metrics-API read and a
    // nightly job respectively); STB.2 instrumented the two samples-backed signals (0042 slo_samples).
    const unmeasured = readings.filter((r) => r.status === "unmeasured").map((r) => r.key);
    expect(unmeasured.sort()).toEqual(
      ["api_availability_monthly_pct", "cost_drift_pct_nightly"].sort(),
    );
  });

  it("STB.2 — slo_samples rows drive event_delivery/autosave readings; a breach sample breaches", async () => {
    // empty table ⇒ `empty` (never a fabricated value)
    let readings = await probeSlos(db.client);
    expect(reading(readings, "event_delivery_latency_p95_s").status).toBe("empty");
    expect(reading(readings, "autosave_roundtrip_p95_ms").status).toBe("empty");
    // 9 samples under threshold + 1 over ⇒ p95 interpolates under → ok
    // SLO.1 — only `detail='tail'` (live-tail) samples count; the streamer tags every real sample.
    for (let i = 0; i < 9; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('event_delivery_ms', 100, $1, 'tail')`,
        [seed.workspaceId],
      );
    }
    await db.client.query(
      `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('event_delivery_ms', 9000, $1, 'tail')`,
      [seed.workspaceId],
    );
    readings = await probeSlos(db.client);
    const r = reading(readings, "event_delivery_latency_p95_s");
    expect(["ok", "empty"]).toContain(r.status);
    // all-overs ⇒ p95 sits above the 5 s threshold → breach (value is seconds)
    await db.client.query(`delete from slo_samples`, []);
    for (let i = 0; i < 10; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('event_delivery_ms', 8000, $1, 'tail')`,
        [seed.workspaceId],
      );
    }
    const r2 = reading(await probeSlos(db.client), "event_delivery_latency_p95_s");
    expect(r2.status).toBe("breach");
    expect(r2.value).toBe(8);
    // an old sample (outside the 10-minute window) never counts
    await db.client.query(
      `update slo_samples set at = now() - interval '1 hour'`,
      [],
    );
    expect(reading(await probeSlos(db.client), "event_delivery_latency_p95_s").status).toBe("empty");
  });

  it("an empty database reads every probed signal `empty` or `ok` — nothing fabricates a breach", async () => {
    const readings = await probeSlos(db.client);
    for (const r of readings) {
      expect(["ok", "empty", "unmeasured"], `${r.key} status ${r.status}`).toContain(r.status);
      expect(r.status).not.toBe("breach");
    }
  });

  it("a run stuck orphaned > 10 min breaches `orphaned_runs`", async () => {
    const run = await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "orphaned" });
    void run;
    // state_since is now() → inside the 10-minute window → breach reads immediately.
    const readings = await probeSlos(db.client);
    const r = reading(readings, "orphaned_runs");
    expect(r.status).toBe("breach");
    expect(r.value).toBe(1);
  });

  it("a boundary.violation internal event breaches the zero-tolerance mirror/boundary signal", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await db.client.query(
      `insert into run_events_internal (run_id, seq, workspace_id, type, payload, at)
       values ('run1', 1, $1, 'boundary.violation', '{}'::jsonb, now())`,
      [seed.workspaceId],
    );
    const r = reading(await probeSlos(db.client), "mirror_errors_10m");
    expect(r.status).toBe("breach");
  });

  it("a fetch_log denial breaches the egress-denied spike; an allowed 5xx breaches provider share", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await db.client.query(
      `insert into fetch_log (run_id, ts, agent_label, kind, decision, status)
       values ('run1', now(), 'a', 'fetch', 'deny', 403),
              ('run1', now(), 'a', 'fetch', 'allow', 502),
              ('run1', now(), 'a', 'fetch', 'allow', 200)`,
      [],
    );
    const readings = await probeSlos(db.client);
    expect(reading(readings, "egress_denied_10m").status).toBe("breach");
    // 1 of 2 allowed upstreams is 5xx → 50% > 5% → breach.
    expect(reading(readings, "provider_429_5xx_pct_5m").status).toBe("breach");
  });

  it("a completed run inside the window keeps success at 100% (no breach); a failed one drops it below 95%", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "completed" });
    // mark it ended in-window
    await db.client.query(`update runs set ended_at = now() where id = 'run1'`, []);
    let r = reading(await probeSlos(db.client), "run_success_rate_24h_pct");
    expect(r.status).toBe("ok");
    await seedRun(db, { runId: "run2", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "failed" });
    await db.client.query(`update runs set ended_at = now() where id = 'run2'`, []);
    r = reading(await probeSlos(db.client), "run_success_rate_24h_pct");
    // 1 of 2 → 50% < 95% → breach.
    expect(r.status).toBe("breach");
  });
});

// JOURNEY.1 — flagged test tenants are excluded from every SLO reading (REQ-SPEC-29; ADR-020):
// test traffic must never move the platform numbers in EITHER direction.
describe("probeSlos — test-tenant exclusion (JOURNEY.1)", () => {
  it("a flagged workspace's failed run cannot drop run_success_rate", async () => {
    await db.client.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    await seedRun(db, { runId: "run_t", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "failed" });
    await db.client.query(`update runs set ended_at = now() where id = 'run_t'`, []);
    // the test run is the ONLY failed row in-window — excluded, so the rate is empty, not breach.
    const r = reading(await probeSlos(db.client), "run_success_rate_24h_pct");
    expect(r.status).not.toBe("breach");
  });
  it("a flagged workspace's orphan cannot trip orphaned_runs; an unflagged one still can", async () => {
    await db.client.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    await seedRun(db, { runId: "run_t", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "orphaned" });
    let r = reading(await probeSlos(db.client), "orphaned_runs");
    expect(r.status).not.toBe("breach");
    // seed a SECOND (real) workspace's orphan — it still breaches.
    const real = await seedProject(db, { workspaceId: "ws_real", userId: "usr_real", projectId: "prj_real" });
    await seedRun(db, { runId: "run_r", workspaceId: real.workspaceId, projectId: real.projectId, state: "orphaned" });
    r = reading(await probeSlos(db.client), "orphaned_runs");
    expect(r.status).toBe("breach");
    expect(r.value).toBe(1);
  });
  it("a flagged workspace's fetch_log denial cannot trip egress_denied_10m", async () => {
    await db.client.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    await seedRun(db, { runId: "run_t", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await db.client.query(
      `insert into fetch_log (run_id, ts, agent_label, kind, decision, status) values ('run_t', now(), 'a', 'fetch', 'deny', 403)`,
      [],
    );
    expect(reading(await probeSlos(db.client), "egress_denied_10m").status).not.toBe("breach");
  });
  it("NULL-workspace slo_samples still count (platform-level samples are not test traffic)", async () => {
    for (let i = 0; i < 10; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('event_delivery_ms', 8000, null, 'tail')`,
        [],
      );
    }
    expect(reading(await probeSlos(db.client), "event_delivery_latency_p95_s").status).toBe("breach");
    // …but flagged-workspace samples are excluded.
    await db.client.query(`delete from slo_samples`, []);
    await db.client.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    for (let i = 0; i < 10; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('event_delivery_ms', 8000, $1, 'tail')`,
        [seed.workspaceId],
      );
    }
    expect(reading(await probeSlos(db.client), "event_delivery_latency_p95_s").status).not.toBe("breach");
  });

  it("ONB.1 — import_preview_ms samples drive import_preview_p95_s; detail scopes to text formats; test tenants out", async () => {
    expect(reading(await probeSlos(db.client), "import_preview_p95_s").status).toBe("empty");
    // 10 text-format samples at 5 s → p95 = 5 s ≤ 40 → ok
    for (let i = 0; i < 10; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('import_preview_ms', 5000, $1, 'md')`,
        [seed.workspaceId],
      );
    }
    let r = reading(await probeSlos(db.client), "import_preview_p95_s");
    expect(r.status).toBe("ok");
    expect(r.value).toBe(5);
    // a slow PDF through the same route is out of the SLO's scope — never a breach
    await db.client.query(`delete from slo_samples`, []);
    for (let i = 0; i < 10; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('import_preview_ms', 240000, $1, 'pdf')`,
        [seed.workspaceId],
      );
    }
    expect(reading(await probeSlos(db.client), "import_preview_p95_s").status).toBe("empty");
    // a 60 s text-format preview breaches the 40 s alert threshold
    await db.client.query(`update slo_samples set detail = 'docx'`, []);
    r = reading(await probeSlos(db.client), "import_preview_p95_s");
    expect(r.status).toBe("breach");
    expect(r.value).toBe(240);
    // a flagged (JOURNEY.1) tenant's import never counts
    await db.client.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    expect(reading(await probeSlos(db.client), "import_preview_p95_s").status).toBe("empty");
  });
});

// RES.2 (REQ-SPEC-31(3)) — an Unverified delivery is never a success: it stays in the rate's
// denominator (the run DID complete — the platform failed its research) but leaves the numerator,
// and the weekly `unverified_review_rate_7d_pct` signal counts it.
describe("probeSlos — Unverified exclusions (RES.2)", () => {
  async function seedLabelled(runId: string, label: string | null) {
    await seedRun(db, { runId, workspaceId: seed.workspaceId, projectId: seed.projectId, state: "completed" });
    await db.client.query(
      `update runs set ended_at = now(), delivery = $2::jsonb where id = $1`,
      [runId, label ? JSON.stringify({ label, checkableClaims: 9, coveredClaims: 0 }) : null],
    );
  }

  it("an Unverified run leaves the success numerator — 1 unverified + 0 ordinary → 0% breach", async () => {
    await seedLabelled("run_uv", "unverified");
    const r = reading(await probeSlos(db.client), "run_success_rate_24h_pct");
    expect(r.status).toBe("breach"); // 0/1 — the run counts, just never as a success
    expect(r.value).toBe(0);
  });

  it("an unlabelled completed run is still a success (the label is read, not inferred)", async () => {
    await seedLabelled("run_ok", null);
    await seedLabelled("run_uv", "unverified");
    const r = reading(await probeSlos(db.client), "run_success_rate_24h_pct");
    expect(r.value).toBe(50); // 1 of 2 — the label, not the outcome, is the exclusion
  });

  it("the weekly Unverified rate computes on fixtures: 1 of 2 completed Reviews → 50% breach", async () => {
    await seedLabelled("run_ok", null);
    await seedLabelled("run_uv", "unverified");
    const r = reading(await probeSlos(db.client), "unverified_review_rate_7d_pct");
    expect(r.status).toBe("breach");
    expect(r.value).toBe(50);
  });

  it("the weekly rate ignores non-review workflows and test tenants", async () => {
    await seedLabelled("run_uv", "unverified");
    // a fact_check Unverified — in the denominator only if the probe scoped to it (it scopes to review)
    await seedRun(db, { runId: "run_fc", workspaceId: seed.workspaceId, projectId: seed.projectId, workflow: "fact_check", state: "completed" });
    await db.client.query(
      `update runs set ended_at = now(), delivery = '{"label":"unverified","checkableClaims":3,"coveredClaims":0}'::jsonb where id = 'run_fc'`,
      [],
    );
    // a test tenant's unverified Review — excluded entirely.
    const t = await seedProject(db, { workspaceId: "ws_t", userId: "usr_t", projectId: "prj_t" });
    await db.client.query(`update workspaces set is_test = true where id = $1`, [t.workspaceId]);
    await seedRun(db, { runId: "run_tt", workspaceId: t.workspaceId, projectId: t.projectId, state: "completed" });
    await db.client.query(
      `update runs set ended_at = now(), delivery = '{"label":"unverified","checkableClaims":2,"coveredClaims":0}'::jsonb where id = 'run_tt'`,
      [],
    );
    const r = reading(await probeSlos(db.client), "unverified_review_rate_7d_pct");
    // only run_uv is a real review → 1/1 = 100% (fact_check + test tenant excluded).
    expect(r.value).toBe(100);
    expect(r.status).toBe("breach");
  });
});

// -------------------------------------------------------------------------------------------------
// SLO.1 — the corrected §13.5 probes (ADR pending). Each case below is the regression the pre-SLO.1
// query got wrong: started_at-overwrite, decision-time-as-resume, replay-as-tail, user-cancel-as-
// failure, engine.error-as-mirror-error, run-level (attempt-mixed) cost cross-check. `sloWeeklyReview`
// is the REQ-ARCH-34 weekly readout — every signal over a 7-day window.
// -------------------------------------------------------------------------------------------------

describe("probeSlos — SLO.1 corrected probes", () => {
  /** Insert a `run.state_changed` (or other) user-visible event row directly (superuser client — RLS-bypass). */
  async function runEvent(
    runId: string,
    seq: number,
    payload: Record<string, unknown>,
    atSql: string,
    type = "run.state_changed",
  ) {
    await db.client.query(
      `insert into run_events (run_id, seq, workspace_id, day, type, payload, density, at)
       values ($1,$2,$3, (${atSql})::date, $4, $5::jsonb, 'normal', (${atSql})::timestamptz)`,
      [runId, seq, seed.workspaceId, type, JSON.stringify(payload)],
    );
  }

  it("run start pairs each running to ITS OWN latest queued — a parked-then-resumed run reads seconds, not days", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    // first launch: queued → running in 10 s, two days ago
    await runEvent("run1", 1, { from: "created", to: "queued" }, "now() - interval '2 days'");
    await runEvent("run1", 2, { from: "provisioning", to: "running" }, "now() - interval '2 days' + interval '10 seconds'");
    // parked at a gate for ~2 days (the pre-SLO.1 probe folded ALL of this into started_at − created_at)
    await runEvent("run1", 3, { from: "running", to: "waiting_gate" }, "now() - interval '2 days' + interval '20 seconds'");
    // resume: requeued, running 30 s later — its OWN episode
    await runEvent("run1", 4, { from: "waiting_gate", to: "queued" }, "now() - interval '40 seconds'");
    await runEvent("run1", 5, { from: "provisioning", to: "running" }, "now() - interval '10 seconds'");
    const r = reading(await probeSlos(db.client), "run_start_latency_p95_s");
    // episodes [10 s, 30 s] → p95 interpolates to ~29.5 s — under the 90 s alert, never ~2 days.
    expect(r.status).toBe("ok");
    expect(r.value).toBeGreaterThan(25);
    expect(r.value).toBeLessThan(35);
  });

  it("run start ignores running transitions outside the window and test-tenant episodes", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    // an episode whose `running` transition is 2 hours old — outside the 60-minute probe window
    await runEvent("run1", 1, { to: "queued" }, "now() - interval '3 hours'");
    await runEvent("run1", 2, { to: "running" }, "now() - interval '2 hours'");
    let r = reading(await probeSlos(db.client), "run_start_latency_p95_s");
    expect(r.status).toBe("empty");
    // a flagged tenant's in-window episode never counts
    await db.client.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    await seedRun(db, { runId: "run_t", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await runEvent("run_t", 1, { to: "queued" }, "now() - interval '50 seconds'");
    await runEvent("run_t", 2, { to: "running" }, "now() - interval '10 seconds'");
    r = reading(await probeSlos(db.client), "run_start_latency_p95_s");
    expect(r.status).toBe("empty");
  });

  it("gate resume measures decision → running, NOT the human's decision duration", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    // the run went running once (before the gate), then parked; the gate opened TWO DAYS ago and was
    // resolved 30 s ago; the resume reached `running` 20 s after resolution.
    await runEvent("run1", 1, { to: "running" }, "now() - interval '2 days'");
    await runEvent("run1", 2, { to: "waiting_gate" }, "now() - interval '2 days' + interval '30 seconds'");
    await seedGate(db, { gateId: "g1", runId: "run1", kind: "confirm_cost", onExpiry: "cancel", openedAt: new Date(Date.now() - 2 * 86400e3) });
    await db.client.query(`update gates set resolved_at = now() - interval '30 seconds' where id = 'g1'`, []);
    await runEvent("run1", 3, { to: "queued" }, "now() - interval '30 seconds'");
    await runEvent("run1", 4, { to: "running" }, "now() - interval '10 seconds'");
    const r = reading(await probeSlos(db.client), "gate_resume_latency_p95_s");
    // resolved→running = 20 s → ok; the old resolved_at − opened_at read ~2 days → breach.
    expect(r.status).toBe("ok");
    expect(r.value).toBeGreaterThan(15);
    expect(r.value).toBeLessThan(25);
  });

  it("a gate resolved with no subsequent running (stop/finalize) never enters the resume distribution", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "cancelled" });
    await seedGate(db, { gateId: "g1", runId: "run1", kind: "confirm_cost", onExpiry: "cancel", openedAt: new Date(Date.now() - 86400e3) });
    await db.client.query(`update gates set resolved_at = now() - interval '10 seconds' where id = 'g1'`, []);
    // no running event after resolution → nothing pairs → empty
    const r = reading(await probeSlos(db.client), "gate_resume_latency_p95_s");
    expect(r.status).toBe("empty");
  });

  it("event delivery counts ONLY live-tail samples — replay-era unmarked rows and 'replay' details stay out", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    // 10 huge UNMARKED samples (pre-SLO.1 replay/tail-mixed rows) → never read as tail
    for (let i = 0; i < 10; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id) values ('event_delivery_ms', 60000, $1)`,
        [seed.workspaceId],
      );
    }
    let r = reading(await probeSlos(db.client), "event_delivery_latency_p95_s");
    expect(r.status).toBe("empty");
    // an explicit 'replay' detail is excluded the same way
    await db.client.query(`update slo_samples set detail = 'replay'`, []);
    expect(reading(await probeSlos(db.client), "event_delivery_latency_p95_s").status).toBe("empty");
    // a real tail sample lands the reading
    await db.client.query(
      `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('event_delivery_ms', 700, $1, 'tail')`,
      [seed.workspaceId],
    );
    r = reading(await probeSlos(db.client), "event_delivery_latency_p95_s");
    expect(r.status).toBe("ok");
    expect(r.value).toBeCloseTo(0.7, 2);
  });

  it("success rate: user-cancelled runs leave the fraction; system/reasonless cancels stay in the denominator", async () => {
    await seedRun(db, { runId: "run_ok", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "completed" });
    await db.client.query(`update runs set ended_at = now() where id = 'run_ok'`, []);
    // user stop — the cancelled transition carries reason 'stop'
    await seedRun(db, { runId: "run_user", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "cancelled" });
    await db.client.query(`update runs set ended_at = now() where id = 'run_user'`, []);
    await runEvent("run_user", 1, { from: "running", to: "cancelled", reason: "stop" }, "now()");
    let r = reading(await probeSlos(db.client), "run_success_rate_24h_pct");
    // 1 completed / 1 total (user cancel excluded) = 100% → ok. Old code counted it: 50% → breach.
    expect(r.status).toBe("ok");
    expect(r.value).toBe(100);
    // a cancel with NO recorded reason is a system cancel — it stays in the denominator
    await seedRun(db, { runId: "run_sys", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "cancelled" });
    await db.client.query(`update runs set ended_at = now() where id = 'run_sys'`, []);
    r = reading(await probeSlos(db.client), "run_success_rate_24h_pct");
    // 1 completed / 2 = 50% → breach
    expect(r.status).toBe("breach");
    expect(r.value).toBe(50);
  });

  it("success rate: 'expired'/'declined'/'cancel_to_edit' cancels are user-side and excluded", async () => {
    await seedRun(db, { runId: "run_ok", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "completed" });
    await db.client.query(`update runs set ended_at = now() where id = 'run_ok'`, []);
    for (const [id, reason] of [
      ["run_exp", "expired"],
      ["run_dec", "declined"],
      ["run_cte", "cancel_to_edit"],
    ] as const) {
      await seedRun(db, { runId: id, workspaceId: seed.workspaceId, projectId: seed.projectId, state: "cancelled" });
      await db.client.query(`update runs set ended_at = now() where id = $1`, [id]);
      await runEvent(id, 1, { to: "cancelled", reason }, "now()");
    }
    const r = reading(await probeSlos(db.client), "run_success_rate_24h_pct");
    expect(r.status).toBe("ok");
    expect(r.value).toBe(100);
  });

  it("mirror errors: engine.error is OUT (a phase record, already in the success rate); validation failures + boundary.violation are IN", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "failed" });
    // the pre-SLO.1 probe counted engine.error — a retried-phase artifact hiccup — as a mirror error.
    await db.client.query(
      `insert into run_events_internal (run_id, seq, workspace_id, type, payload, at)
       values ('run1', 1, $1, 'engine.error', '{"code":"artifact_missing"}'::jsonb, now())`,
      [seed.workspaceId],
    );
    let r = reading(await probeSlos(db.client), "mirror_errors_10m");
    expect(r.status).toBe("ok");
    expect(r.value).toBe(0);
    // a delivery-validation reject (to='failed' reason='validation') counts
    await runEvent("run1", 2, { to: "failed", reason: "validation" }, "now()");
    r = reading(await probeSlos(db.client), "mirror_errors_10m");
    expect(r.status).toBe("breach");
    expect(r.value).toBe(1);
  });

  it("proxy-vs-SDK compares per (run, attempt): a proxy-only attempt is skipped; a divergent attempt flags", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const usage = (id: string, attempt: number, source: string, cost: number) =>
      db.client.query(
        `insert into usage_records
           (id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
            rate_table_version, list_cost_usd, credits, source)
         values ($1, now(), $2, $3, 'run1', $4, 'writer', 'anthropic', 'm', 'balanced', 1, $5, 0, $6)`,
        [id, seed.workspaceId, seed.billingAccountId, attempt, cost, source],
      );
    // attempt 1 clean (proxy 1.00 vs sdk 0.98 = 2%); attempt 2 proxy-only (crashed before harvest — the
    // old per-run grouping diluted it against attempt 1's sdk: |0.98−1.50|/1.50 = 35% → a phantom flag…
    // wait — the old shape flagged here, the new correctly attributes nothing to a one-sided attempt).
    await usage("u1", 1, "proxy", 1.0);
    await usage("u2", 1, "sdk_estimate", 0.98);
    await usage("u3", 2, "proxy", 0.5);
    let r = reading(await probeSlos(db.client), "proxy_vs_sdk_cost_runs_over5pct_1h");
    expect(r.value).toBe(0);
    // now attempt 2's sdk lands at 1.00 vs proxy 0.50 → 100% divergence on THAT attempt → flag.
    await usage("u4", 2, "sdk_estimate", 1.0);
    r = reading(await probeSlos(db.client), "proxy_vs_sdk_cost_runs_over5pct_1h");
    expect(r.status).toBe("breach");
    expect(r.value).toBe(1);
  });

  it("autosave: the collab-path sample ('collab' detail) counts alongside 'http' — the Page's real save path", async () => {
    for (let i = 0; i < 5; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id, detail) values ('autosave_save_ms', 120, $1, 'collab')`,
        [seed.workspaceId],
      );
    }
    const r = reading(await probeSlos(db.client), "autosave_roundtrip_p95_ms");
    expect(r.status).toBe("ok");
    expect(r.value).toBeCloseTo(0.12, 3);
  });
});

describe("sloWeeklyReview — the REQ-ARCH-34 weekly readout (SLO.1)", () => {
  it("reads every signal over the 7-day window — an episode days old lands weekly but not in the alert window", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    // a 3-day-old 30 s start episode: invisible to the 60-minute alert probe, counted by the weekly read.
    await db.client.query(
      `insert into run_events (run_id, seq, workspace_id, day, type, payload, density, at) values
         ('run1', 1, $1, (now() - interval '3 days')::date, 'run.state_changed', '{"to":"queued"}'::jsonb, 'normal', now() - interval '3 days'),
         ('run1', 2, $1, (now() - interval '3 days')::date, 'run.state_changed', '{"to":"running"}'::jsonb, 'normal', now() - interval '3 days' + interval '30 seconds')`,
      [seed.workspaceId],
    );
    const alert = reading(await probeSlos(db.client), "run_start_latency_p95_s");
    expect(alert.status).toBe("empty"); // outside the 60-minute alert window
    const weekly = (await sloWeeklyReview(db.client)).find((r) => r.key === "run_start_latency_p95_s")!;
    expect(weekly.status).toBe("ok");
    expect(weekly.value).toBe(30);
  });

  it("returns one reading per registered signal with the same status semantics (never skipped)", async () => {
    const readings = await sloWeeklyReview(db.client);
    expect(readings.length).toBe(SLO_SIGNALS.length);
    for (const r of readings) {
      expect(["ok", "empty", "unmeasured", "error", "breach"]).toContain(r.status);
    }
    // the weekly readout names the same unmeasured rows as the alert sweep
    expect(readings.filter((r) => r.status === "unmeasured").map((r) => r.key).sort()).toEqual(
      ["api_availability_monthly_pct", "cost_drift_pct_nightly"].sort(),
    );
  });
});
