import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { probeSlos, SLO_SIGNALS } from "./slo.js";

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
    for (let i = 0; i < 9; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id) values ('event_delivery_ms', 100, $1)`,
        [seed.workspaceId],
      );
    }
    await db.client.query(
      `insert into slo_samples (signal, value_ms, workspace_id) values ('event_delivery_ms', 9000, $1)`,
      [seed.workspaceId],
    );
    readings = await probeSlos(db.client);
    const r = reading(readings, "event_delivery_latency_p95_s");
    expect(["ok", "empty"]).toContain(r.status);
    // all-overs ⇒ p95 sits above the 5 s threshold → breach (value is seconds)
    await db.client.query(`delete from slo_samples`, []);
    for (let i = 0; i < 10; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id) values ('event_delivery_ms', 8000, $1)`,
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
        `insert into slo_samples (signal, value_ms, workspace_id) values ('event_delivery_ms', 8000, null)`,
        [],
      );
    }
    expect(reading(await probeSlos(db.client), "event_delivery_latency_p95_s").status).toBe("breach");
    // …but flagged-workspace samples are excluded.
    await db.client.query(`delete from slo_samples`, []);
    await db.client.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    for (let i = 0; i < 10; i++) {
      await db.client.query(
        `insert into slo_samples (signal, value_ms, workspace_id) values ('event_delivery_ms', 8000, $1)`,
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
