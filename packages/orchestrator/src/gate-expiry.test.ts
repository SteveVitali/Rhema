import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleGateExpiry, recordGateActivity, PRESENCE_TIMER_MS } from "./gate-expiry.js";
import { resolveGate } from "./gate-resolution.js";
import { gateExpiryJob, scheduleGateExpiry, RUN_JOBS } from "./queue.js";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  readDecision,
  countDecisions,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "./testing/index.js";

const NOW = new Date("2026-09-02T12:00:00Z"); // the FixedClock default
const PAST = new Date("2026-09-02T00:00:00Z");
const FUTURE = new Date("2026-09-02T18:00:00Z");

describe("gate expiry (§6.4 item 6/7; REQ-RUN-6 amended; AC5)", () => {
  let db: OrchestratorTestDb;
  let deps: TestDeps;
  let ws: string;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedProject(db);
    ws = seed.workspaceId;
    deps = makeDeps(db);
  });
  afterEach(() => db.close());

  it("AC5 — the expiry job fires once (a second fire is a no-op)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g1", runId: "run1", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: PAST });
    const first = await handleGateExpiry(deps, { gateId: "g1", workspaceId: ws });
    const second = await handleGateExpiry(deps, { gateId: "g1", workspaceId: ws });
    expect(first).toMatchObject({ action: "resolved", onExpiry: "proceed_conservative", state: "queued" });
    expect(second).toMatchObject({ action: "noop", reason: "already_resolved" });
    expect(await countDecisions(db, "g1")).toBe(1);
    expect(deps.queue.ofName(RUN_JOBS.resume)).toHaveLength(1); // auto-proceed → run.resume
  });

  it("AC5 — reschedules itself when the deadline has moved into the future", async () => {
    await seedRun(db, { runId: "run2", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g2", runId: "run2", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: FUTURE });
    const out = await handleGateExpiry(deps, { gateId: "g2", workspaceId: ws });
    expect(out).toMatchObject({ action: "rescheduled", deadlineAt: FUTURE });
    expect(await countDecisions(db, "g2")).toBe(0); // nothing resolved yet
    expect(deps.queue.ofName(gateExpiryJob("g2"))).toHaveLength(1); // rescheduled
  });

  it("AC5 — a user resolution before the fire makes the expiry a no-op (cancelled)", async () => {
    await seedRun(db, { runId: "run3", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g3", runId: "run3", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: PAST });
    await resolveGate(deps, { runId: "run3", gateId: "g3", workspaceId: ws, userId: "usr_seed", action: "approve" });
    const out = await handleGateExpiry(deps, { gateId: "g3", workspaceId: ws });
    expect(out).toMatchObject({ action: "noop", reason: "already_resolved" });
    expect((await readDecision(db, "g3"))!.by_actor).toBe("user");
  });

  it("cancel-on-expiry (confirm_cost) → cancelled + hold released + credential revoked", async () => {
    await seedRun(db, { runId: "run4", workspaceId: ws, projectId: "prj_seed", state: "awaiting_consent", holdLedgerId: "led" });
    await db.client.query("insert into proxy_credentials(id, run_id, attempt, credential_hash) values ('pcr4','run4',1,'h')", []);
    await seedGate(db, { gateId: "g4", runId: "run4", kind: "confirm_cost", onExpiry: "cancel", deadlineAt: PAST });
    const out = await handleGateExpiry(deps, { gateId: "g4", workspaceId: ws });
    expect(out).toMatchObject({ action: "resolved", state: "cancelled" });
    expect(await readDecision(db, "g4")).toMatchObject({ by_actor: "timeout", action: "cancel" });
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
  });

  it("accept-partial-on-expiry (resume_partial) → completed_partial", async () => {
    await seedRun(db, { runId: "run5", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g5", runId: "run5", kind: "resume_partial", onExpiry: "accept_partial", deadlineAt: PAST });
    const out = await handleGateExpiry(deps, { gateId: "g5", workspaceId: ws });
    expect(out).toMatchObject({ action: "resolved", state: "completed_partial" });
    expect(await readDecision(db, "g5")).toMatchObject({ by_actor: "timeout", action: "accept_partial" });
  });

  it("AC2 (defense in depth) — a spend kind never auto-proceeds even if mis-scheduled as proceed", async () => {
    await seedRun(db, { runId: "run6", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g6", runId: "run6", kind: "spend_overrun", onExpiry: "proceed_as_proposed", deadlineAt: PAST });
    const out = await handleGateExpiry(deps, { gateId: "g6", workspaceId: ws });
    expect(out).toMatchObject({ action: "noop", reason: "no_auto_proceed" });
    expect(await countDecisions(db, "g6")).toBe(0);
  });

  it("a wait gate (no deadline) never expires", async () => {
    await seedRun(db, { runId: "run7", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g7", runId: "run7", kind: "approve_triage", onExpiry: "wait", deadlineAt: null });
    expect((await handleGateExpiry(deps, { gateId: "g7", workspaceId: ws })).action).toBe("noop");
  });

  describe("presence timer + activity extension (§6.4 item 1/2; REQ-SPEC-18)", () => {
    it("a present user gets a 10-min presence deadline on an auto-proceed gate, and it fires with presence:true", async () => {
      await seedRun(db, { runId: "runp", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
      await seedGate(db, { gateId: "gp", runId: "runp", kind: "approve_plan", onExpiry: "proceed_conservative", openedAt: NOW, deadlineAt: FUTURE });
      const r = await recordGateActivity(deps, { gateId: "gp", workspaceId: ws, activity: "present" });
      expect(r.presenceDeadlineAt).toEqual(new Date(NOW.getTime() + PRESENCE_TIMER_MS));
      expect(deps.queue.ofName(gateExpiryJob("gp"))).toHaveLength(1); // rescheduled to fire early

      // fire after the presence deadline: resolves as a timeout WITH presence:true.
      const later = makeDeps(db, { now: new Date(NOW.getTime() + 11 * 60 * 1000) });
      const out = await handleGateExpiry(later, { gateId: "gp", workspaceId: ws });
      expect(out).toMatchObject({ action: "resolved", presence: true });
      expect((await readDecision(db, "gp"))!.presence).toBe(true);
    });

    it("a wait gate never gets a presence timer", async () => {
      await seedRun(db, { runId: "runw", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
      await seedGate(db, { gateId: "gw", runId: "runw", kind: "approve_triage", onExpiry: "wait", deadlineAt: null });
      const r = await recordGateActivity(deps, { gateId: "gw", workspaceId: ws, activity: "present" });
      expect(r.presenceDeadlineAt).toBeNull();
    });

    it("reading extends the deadline (+10 min, capped +24 h) and pauses the countdown", async () => {
      await seedRun(db, { runId: "runr", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
      await seedGate(db, { gateId: "gr", runId: "runr", kind: "approve_plan", onExpiry: "proceed_conservative", openedAt: NOW, deadlineAt: new Date(NOW.getTime() + 60_000) });
      const r = await recordGateActivity(deps, { gateId: "gr", workspaceId: ws, activity: "reading" });
      expect(r.deadlineAt).toEqual(new Date(NOW.getTime() + 10 * 60 * 1000)); // pushed to now+10m
      const row = (await db.client.query("select paused_while_reading from gates where id='gr'", [])).rows[0] as { paused_while_reading: boolean };
      expect(row.paused_while_reading).toBe(true);
    });

    it("reading NEVER shortens a spend/refusal deadline (confirm_cost 7-day window is untouched)", async () => {
      await seedRun(db, { runId: "runsr", workspaceId: ws, projectId: "prj_seed", state: "awaiting_consent" });
      const sevenDays = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
      await seedGate(db, { gateId: "gsr", runId: "runsr", kind: "confirm_cost", onExpiry: "cancel", openedAt: NOW, deadlineAt: sevenDays });
      const r = await recordGateActivity(deps, { gateId: "gsr", workspaceId: ws, activity: "reading" });
      expect(r.deadlineAt).toEqual(sevenDays); // NOT collapsed to now+10m
      const row = (await db.client.query("select deadline_at from gates where id='gsr'", [])).rows[0] as { deadline_at: Date };
      expect(new Date(row.deadline_at)).toEqual(sevenDays);
    });

    it("reading never shortens a long auto-proceed deadline (a fresh 24 h plan stays 24 h)", async () => {
      await seedRun(db, { runId: "runlong", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
      const day = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
      await seedGate(db, { gateId: "glong", runId: "runlong", kind: "approve_plan", onExpiry: "proceed_conservative", openedAt: NOW, deadlineAt: day });
      const r = await recordGateActivity(deps, { gateId: "glong", workspaceId: ws, activity: "reading" });
      expect(r.deadlineAt).toEqual(day); // max(existing, now+10m) = existing; not shortened
    });

    it("reading is capped at +24 h from open", async () => {
      await seedRun(db, { runId: "runc", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
      // open 23h55m ago so a +10m extension would cross the +24h cap.
      const opened = new Date(NOW.getTime() - (23 * 60 + 55) * 60 * 1000);
      await seedGate(db, { gateId: "gc", runId: "runc", kind: "approve_plan", onExpiry: "proceed_conservative", openedAt: opened, deadlineAt: NOW });
      const r = await recordGateActivity(deps, { gateId: "gc", workspaceId: ws, activity: "reading" });
      expect(r.deadlineAt).toEqual(new Date(opened.getTime() + 24 * 60 * 60 * 1000)); // capped at open+24h
    });

    it("blur reverts to the long deadline (clears the presence timer)", async () => {
      await seedRun(db, { runId: "runb", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
      await seedGate(db, { gateId: "gb", runId: "runb", kind: "approve_plan", onExpiry: "proceed_conservative", openedAt: NOW, deadlineAt: FUTURE, presenceDeadlineAt: new Date(NOW.getTime() + PRESENCE_TIMER_MS) });
      const r = await recordGateActivity(deps, { gateId: "gb", workspaceId: ws, activity: "blur" });
      expect(r.presenceDeadlineAt).toBeNull();
      expect(r.deadlineAt).toEqual(FUTURE);
    });
  });

  it("scheduleGateExpiry keys the job by deadline instant (a moved deadline schedules a fresh job)", async () => {
    await scheduleGateExpiry(deps, { gateId: "gk", workspaceId: ws, deadlineAt: FUTURE, now: NOW });
    await scheduleGateExpiry(deps, { gateId: "gk", workspaceId: ws, deadlineAt: FUTURE, now: NOW }); // same → dedup
    await scheduleGateExpiry(deps, { gateId: "gk", workspaceId: ws, deadlineAt: new Date(FUTURE.getTime() + 3600_000), now: NOW }); // moved → new
    expect(deps.queue.ofName(gateExpiryJob("gk"))).toHaveLength(2);
    await scheduleGateExpiry(deps, { gateId: "gk", workspaceId: ws, deadlineAt: null, now: NOW }); // wait → nothing
    expect(deps.queue.ofName(gateExpiryJob("gk"))).toHaveLength(2);
  });
});
