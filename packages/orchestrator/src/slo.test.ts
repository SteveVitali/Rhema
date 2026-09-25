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
