// The weekly beta dashboard (PRB.12; REQ-BETA-18, REQ-PROD-15/16, design/9 §7.2). Two halves:
//
//  • `materializeRunAnalytics` — the intake projector. Live emitters write analytics events at their
//    surfaces; for catalogued events whose owning surface is 1.x (or a server-only fact with no user
//    surface), this projects the system-of-record rows (runs/steps/gates/decisions/correspondence/
//    credit_ledger/run_events/timeline_events) into the analytics stream, idempotently
//    (`dedupe_key = 'mat:<event>:<row key>'`, absorbed by the 0024 partial unique index).
//  • `computeBetaDashboard` + `renderBetaDashboard` — the report. Every REQ-BETA-18 gate metric is
//    read from the stream (or the named domain source) and rendered beside its registered threshold
//    (`BETA_GATE_THRESHOLDS`) with a mechanical pass/fail reading. This report READS the gates; the
//    gate decision itself belongs to the human beta review (28a), not to this code.
//
// Telemetry rules hold here too: ids, counts, enum labels — never prompt/tool/draft content, never a
// protocol string (REQ-ARCH-33).

import {
  BETA_GATE_THRESHOLDS,
  type AnalyticsEventName,
  type BetaGateThreshold,
} from "@rhema/contracts";
import type { SqlClient } from "@rhema/orchestrator";
import { recordAnalyticsEvent } from "./analytics.js";
import type { EntryDeps } from "./entries.js";
import { listAnalyticsEvents, type AnalyticsRow } from "./analytics-query.js";

/** The reporting window (inclusive `from`, exclusive `to`). */
export interface DashboardWindow {
  readonly from: Date;
  readonly to: Date;
}

// --------------------------------------------------------------------------- the materializer

interface EnvelopeIds {
  readonly userId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly runId?: string;
}

/**
 * Project domain facts into the analytics stream for catalogued events with no live emitter.
 * Idempotent: every projected row carries a `dedupe_key`, so re-running over the same window is a
 * no-op. Returns the number of rows actually inserted.
 */
export async function materializeRunAnalytics(
  exec: SqlClient,
  deps: EntryDeps,
  window: DashboardWindow,
): Promise<{ readonly inserted: number; readonly attempted: number }> {
  let inserted = 0;
  let attempted = 0;
  const emit = async (
    key: string,
    env: EnvelopeIds,
    event: AnalyticsEventName,
    props: Record<string, unknown>,
    at?: Date,
  ) => {
    attempted++;
    const id = await recordAnalyticsEvent(exec, deps, {
      ...env,
      event,
      props,
      dedupeKey: `mat:${event}:${key}`,
      // a backfilled event happened when the fact happened — stamp it so week-windowed reads see it.
      at,
    });
    if (id != null) inserted++;
  };

  // Runs launched in the window (envelope user = the requester, else the project owner).
  const runs = (
    await exec.query(
      `select r.id, r.workspace_id, r.project_id, r.workflow, r.state, r.rigor, r.estimate_credits,
              r.cap_credits, r.spent_credits, r.requested_by, r.failure, r.created_at, r.ended_at,
              coalesce(r.requested_by, p.owner_id) as user_id, p.venue
         from runs r left join projects p on p.id = r.project_id
        where r.created_at >= $1 and r.created_at < $2`,
      [window.from, window.to],
    )
  ).rows as {
    id: string; workspace_id: string; project_id: string | null; workflow: string; state: string;
    rigor: string; estimate_credits: number; cap_credits: number; spent_credits: number;
    requested_by: string | null; failure: Record<string, unknown> | null;
    created_at: Date; ended_at: Date | null;
    user_id: string | null; venue: string | null;
  }[];
  for (const r of runs) {
    if (r.user_id == null) continue; // a run with no resolvable author can't fill the envelope
    const env: EnvelopeIds = {
      userId: r.user_id,
      workspaceId: r.workspace_id,
      ...(r.project_id != null ? { projectId: r.project_id } : {}),
      runId: r.id,
    };
    const economics = {
      cost_actual: r.spent_credits,
      cost_estimate: r.estimate_credits,
      rigor: r.rigor,
    };
    await emit(r.id, env, "run.launched", {
      kind: r.workflow,
      estimate: r.estimate_credits,
      ...economics,
    }, r.created_at);
    const endedAt = r.ended_at ?? r.created_at;
    if (r.state === "completed" || r.state === "completed_partial") {
      await emit(r.id, env, "run.completed", {
        cap_hit: r.spent_credits >= r.cap_credits,
        ...(r.state === "completed_partial" ? { verdict: "partial" } : {}),
        ...economics,
      }, endedAt);
    } else if (r.state === "failed") {
      await emit(r.id, env, "run.failed", {
        stage: typeof r.failure?.stage === "string" ? r.failure.stage : "run",
        refunded: false,
        ...economics,
      }, endedAt);
    } else if (r.state === "cancelled" || r.state === "cancelling") {
      await emit(r.id, env, "run.stopped", { phase: r.workflow, ...economics }, endedAt);
    }
  }

  // Phase spans (steps) — started/finished events with duration + per-phase cost.
  const steps = (
    await exec.query(
      `select s.id, s.run_id, s.phase, s.started_at, s.ended_at, s.credits,
              r.workspace_id, r.project_id, r.rigor, r.estimate_credits, r.spent_credits,
              coalesce(r.requested_by, p.owner_id) as user_id
         from steps s
         join runs r on r.id = s.run_id
         left join projects p on p.id = r.project_id
        where (s.started_at >= $1 and s.started_at < $2) or (s.ended_at >= $1 and s.ended_at < $2)`,
      [window.from, window.to],
    )
  ).rows as {
    id: string; run_id: string; phase: string; started_at: Date | null; ended_at: Date | null;
    credits: number; workspace_id: string; project_id: string | null; rigor: string;
    estimate_credits: number; spent_credits: number; user_id: string | null;
  }[];
  for (const s of steps) {
    if (s.user_id == null) continue;
    const env: EnvelopeIds = {
      userId: s.user_id,
      workspaceId: s.workspace_id,
      ...(s.project_id != null ? { projectId: s.project_id } : {}),
      runId: s.run_id,
    };
    const economics = {
      cost_actual: s.credits,
      cost_estimate: s.estimate_credits,
      rigor: s.rigor,
    };
    if (s.started_at && s.started_at >= window.from && s.started_at < window.to) {
      await emit(`${s.id}:start`, env, "run.phase_started", { phase: s.phase, ...economics },
        new Date(s.started_at));
    }
    if (s.ended_at && s.ended_at >= window.from && s.ended_at < window.to) {
      const duration =
        s.started_at != null ? new Date(s.ended_at).getTime() - new Date(s.started_at).getTime() : undefined;
      await emit(`${s.id}:end`, env, "run.phase_finished", {
        phase: s.phase,
        ...(duration !== undefined ? { duration } : {}),
        cost: s.credits,
        ...economics,
      }, new Date(s.ended_at));
    }
  }

  // Gates → approval_opened; decisions → approval_decided (latency in ms, auto_proceeded when the
  // resolver was not the human: 'timeout' | 'policy' | 'trial' — GATE_RESOLUTION_BY).
  const gates = (
    await exec.query(
      `select g.id, g.kind, g.opened_at, d.action, d.by_actor, d.at as decided_at,
              r.workspace_id, r.project_id, r.id as run_id,
              coalesce(r.requested_by, p.owner_id) as user_id
         from gates g
         join runs r on r.id = g.run_id
         left join projects p on p.id = r.project_id
         left join decisions d on d.gate_id = g.id
        where g.opened_at >= $1 and g.opened_at < $2`,
      [window.from, window.to],
    )
  ).rows as {
    id: string; kind: string; opened_at: Date; action: string | null; by_actor: string | null;
    decided_at: Date | null; workspace_id: string; project_id: string | null; run_id: string;
    user_id: string | null;
  }[];
  for (const g of gates) {
    if (g.user_id == null) continue;
    const env: EnvelopeIds = {
      userId: g.user_id,
      workspaceId: g.workspace_id,
      ...(g.project_id != null ? { projectId: g.project_id } : {}),
      runId: g.run_id,
    };
    await emit(g.id, env, "run.approval_opened", { approval: g.kind }, g.opened_at);
    if (g.action != null) {
      await emit(`${g.id}:decision`, env, "run.approval_decided", {
        decision: g.action,
        latency: new Date(g.decided_at!).getTime() - new Date(g.opened_at).getTime(),
        auto_proceeded: g.by_actor !== "user",
      }, new Date(g.decided_at!));
    }
    // The consent funnel (§5.6): a confirm_cost gate IS the consent step at beta.
    if (g.kind === "confirm_cost") {
      await emit(`${g.id}:consent`, env, "estimate.consent_shown", {}, g.opened_at);
      if (g.action != null) {
        await emit(`${g.id}:consent-d`, env,
          g.action === "approve" || g.action === "approve_autonomous"
            ? "estimate.consent_accepted"
            : "estimate.consent_declined",
          {}, new Date(g.decided_at!));
      }
    }
  }

  // Voice facts: builds → voice.built (the profile's calibration status); project links →
  // project.voice_linked (persona_locked_at is the link's timestamp).
  const profiles = (
    await exec.query(
      `select pp.id, pp.calibration_status, pp.built_at, pe.workspace_id,
              (select wm.user_id from workspace_members wm
                where wm.workspace_id = pe.workspace_id order by wm.role = 'admin' desc, wm.user_id limit 1)
                as user_id
         from persona_profiles pp join personas pe on pe.id = pp.persona_id
        where pp.built_at >= $1 and pp.built_at < $2`,
      [window.from, window.to],
    )
  ).rows as { id: string; calibration_status: string | null; built_at: Date; workspace_id: string; user_id: string | null }[];
  for (const pp of profiles) {
    if (pp.user_id == null) continue;
    await emit(pp.id, { userId: pp.user_id, workspaceId: pp.workspace_id }, "voice.built", {
      calibration_status: pp.calibration_status ?? "unprofiled",
    }, pp.built_at);
  }
  // voice.refreshed — a profile built for a persona that already had one; delta_pieces = the
  // sample-set entries added or changed vs the prior profile (id→sha map diff).
  const refreshes = (
    await exec.query(
      `select pp.id, pp.sample_set, pp.built_at, pe.workspace_id, prior.sample_set as prior_set,
              (select wm.user_id from workspace_members wm
                where wm.workspace_id = pe.workspace_id order by wm.role = 'admin' desc, wm.user_id limit 1)
                as user_id
         from persona_profiles pp
         join personas pe on pe.id = pp.persona_id
         join lateral (
           select p2.sample_set from persona_profiles p2
            where p2.persona_id = pp.persona_id and p2.built_at < pp.built_at
            order by p2.built_at desc limit 1) prior on true
        where pp.built_at >= $1 and pp.built_at < $2`,
      [window.from, window.to],
    )
  ).rows as {
    id: string; sample_set: unknown; prior_set: unknown; built_at: Date; workspace_id: string; user_id: string | null;
  }[];
  const setMap = (v: unknown): Record<string, string> => {
    const raw = typeof v === "string" ? (JSON.parse(v) as unknown) : v;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
      else if (val && typeof val === "object") {
        const h = (val as Record<string, unknown>).content_sha256;
        if (typeof h === "string") out[k] = h;
      }
    }
    return out;
  };
  for (const r of refreshes) {
    if (r.user_id == null) continue;
    const cur = setMap(r.sample_set);
    const prior = setMap(r.prior_set);
    const delta = Object.keys(cur).filter((k) => prior[k] !== cur[k]).length +
      Object.keys(prior).filter((k) => !(k in cur)).length;
    await emit(`${r.id}:refresh`, { userId: r.user_id, workspaceId: r.workspace_id }, "voice.refreshed", {
      delta_pieces: delta,
    }, r.built_at);
  }
  const linked = (
    await exec.query(
      `select id, workspace_id, owner_id, persona_locked_at from projects
        where persona_locked_at >= $1 and persona_locked_at < $2 and persona_id is not null`,
      [window.from, window.to],
    )
  ).rows as { id: string; workspace_id: string; owner_id: string; persona_locked_at: Date }[];
  for (const p of linked) {
    await emit(p.id, { userId: p.owner_id, workspaceId: p.workspace_id, projectId: p.id },
      "project.voice_linked", {}, p.persona_locked_at);
  }

  // Human edits on a reviewed draft → draft.edited (origin='human_revision' rows; the beta editor's
  // save path writes the fork — the event is materialized, not coupled to the writer).
  const edited = (
    await exec.query(
      `select d.id, d.n, d.project_id, d.created_at, p.workspace_id, p.owner_id as user_id,
              exists(select 1 from correspondence_items c where c.project_id = d.project_id and c.kind = 'review')
                as reviewed
         from drafts d join projects p on p.id = d.project_id
        where d.origin = 'human_revision' and d.created_at >= $1 and d.created_at < $2`,
      [window.from, window.to],
    )
  ).rows as { id: string; n: number; project_id: string; created_at: Date; workspace_id: string; user_id: string; reviewed: boolean }[];
  for (const d of edited) {
    await emit(d.id, { userId: d.user_id, workspaceId: d.workspace_id, projectId: d.project_id },
      "draft.edited", { version: d.n, reviewed: d.reviewed, forked: true }, d.created_at);
  }

  // Delivered reviews → round.completed (REQ-BETA-9's first-class counter; one per delivered review,
  // ordinal = its round number on that manuscript). `important` = a venue is set on the project —
  // the partner declared the manuscript matters.
  const reviews = (
    await exec.query(
      `select c.id, c.project_id, c.ordinal, c.delivered_at, p.workspace_id, p.owner_id as user_id, p.venue,
              (select count(*) from correspondence_items c2
                where c2.project_id = c.project_id and c2.kind = 'review' and c2.delivered_at <= c.delivered_at)
                as round_ordinal
         from correspondence_items c join projects p on p.id = c.project_id
        where c.kind = 'review' and c.delivered_at >= $1 and c.delivered_at < $2`,
      [window.from, window.to],
    )
  ).rows as {
    id: string; project_id: string; round_ordinal: number | string; delivered_at: Date;
    workspace_id: string; user_id: string; venue: string | null;
  }[];
  for (const c of reviews) {
    await emit(c.id, { userId: c.user_id, workspaceId: c.workspace_id, projectId: c.project_id },
      "round.completed", {
        ordinal: Number(c.round_ordinal),
        manuscript_id: c.project_id,
        important: c.venue != null,
      }, c.delivered_at);
  }

  // The revision-loop analytics copies of the §12.5 run/timeline events (PRB.06/07 own the
  // run-domain writes; this projects them into the product stream — REQ-BETA-7/8).
  const moves = (
    await exec.query(
      `select e.run_id, e.seq, e.payload, e.workspace_id, e.day, e.at,
              r.project_id, coalesce(r.requested_by, p.owner_id) as user_id
         from run_events e
         join runs r on r.id = e.run_id
         left join projects p on p.id = r.project_id
        where e.type in ('revision.move_traced','rereview.lineage')
          and e.day >= $1::date and e.day <= $2::date`,
      [window.from, window.to],
    )
  ).rows as {
    run_id: string; seq: number; payload: Record<string, unknown>; workspace_id: string; at: Date;
    project_id: string | null; user_id: string | null;
  }[];
  for (const m of moves) {
    if (m.user_id == null) continue;
    const env: EnvelopeIds = {
      userId: m.user_id,
      workspaceId: m.workspace_id,
      ...(m.project_id != null ? { projectId: m.project_id } : {}),
      runId: m.run_id,
    };
    const p = m.payload;
    if (p.moveId != null || p.hunkCount != null) {
      await emit(`${m.run_id}:${m.seq}:move`, env, "revision.move_traced", {
        finding_id: p.findingId ?? m.run_id,
        move_id: p.moveId ?? m.run_id,
        hunk_count: p.hunkCount ?? 0,
        chars_changed: p.charsChanged ?? 0,
      }, m.at);
    } else {
      await emit(`${m.run_id}:${m.seq}:lineage`, env, "rereview.lineage", {
        carried: p.carried ?? 0,
        closed: p.closed ?? 0,
        new: p.new ?? 0,
        reopened: p.reopened ?? 0,
      }, m.at);
    }
  }
  const manualMoves = (
    await exec.query(
      `select t.id, t.project_id, t.payload, t.workspace_id, t.at, p.owner_id as user_id
         from timeline_events t join projects p on p.id = t.project_id
        where t.type = 'revision.move_traced' and t.at >= $1 and t.at < $2`,
      [window.from, window.to],
    )
  ).rows as {
    id: string; project_id: string; payload: Record<string, unknown>; workspace_id: string; at: Date; user_id: string;
  }[];
  for (const m of manualMoves) {
    const p = m.payload;
    await emit(`tl:${m.id}`, { userId: m.user_id, workspaceId: m.workspace_id, projectId: m.project_id },
      "revision.move_traced", {
        finding_id: p.findingId ?? m.project_id,
        move_id: p.moveId ?? m.id,
        hunk_count: p.hunkCount ?? 0,
        chars_changed: p.charsChanged ?? 0,
      }, m.at);
  }

  // Ledger facts → credits.granted / refund.issued (envelope user = the workspace's first admin).
  const ledgerRows = (
    await exec.query(
      `select l.id, l.kind, l.source, l.reason, l.workspace_id, l.at,
              (select wm.user_id from workspace_members wm
                where wm.workspace_id = l.workspace_id order by wm.role = 'admin' desc, wm.user_id limit 1)
                as user_id
         from credit_ledger l
        where l.kind in ('grant','refund') and l.at >= $1 and l.at < $2`,
      [window.from, window.to],
    )
  ).rows as {
    id: string; kind: string; source: string; reason: string | null; workspace_id: string; at: Date;
    user_id: string | null;
  }[];
  for (const l of ledgerRows) {
    if (l.user_id == null) continue;
    if (l.kind === "grant") {
      await emit(l.id, { userId: l.user_id, workspaceId: l.workspace_id }, "credits.granted", {
        source: l.source,
      }, l.at);
    } else {
      await emit(l.id, { userId: l.user_id, workspaceId: l.workspace_id }, "refund.issued", {
        reason: l.reason ?? "refund",
      }, l.at);
    }
  }

  return { inserted, attempted };
}

// --------------------------------------------------------------------------- the report

export type MetricUnit = "rate" | "usd" | "count" | "ms" | "share";

export interface BetaMetric {
  readonly key: string;
  readonly name: string;
  /** the observed value; null = no data in the window. */
  readonly observed: number | null;
  readonly display: string;
  readonly unit: MetricUnit;
  /** the registered REQ-BETA-18 threshold, when this metric is gate-bearing. */
  readonly threshold?: BetaGateThreshold;
  readonly thresholdKey?: string;
  /** pass | fail | no data — mechanical, never editorialized. */
  readonly reading?: "pass" | "fail" | "no data";
  /** where the number is read from (the audit trail for the readout). */
  readonly source: string;
  readonly note?: string;
}

export interface PerRunMargin {
  readonly runId: string;
  readonly workflow: string;
  readonly billedCredits: number;
  readonly cogsUsd: number;
  readonly marginUsd: number;
  /** margin ÷ billed; null when nothing was billed. */
  readonly marginPct: number | null;
}

export interface BetaDashboard {
  readonly window: DashboardWindow;
  readonly generatedAt: Date;
  /** the gate-bearing metrics in BETA_GATE_THRESHOLDS order + supporting metrics after. */
  readonly metrics: BetaMetric[];
  readonly perRunMargin: PerRunMargin[];
  readonly reasonCodeDistribution: { readonly code: string; readonly count: number }[];
  readonly rubricDeltaDistribution: {
    readonly dimension: string;
    readonly medianDelta: number;
    readonly deltas: Record<string, number>;
  }[];
  readonly dwellBySurface: { readonly surface: string; readonly ms: number }[];
  /** the mechanical clause readout (the report reads; it does not decide). */
  readonly readout: {
    readonly proceedMet: boolean | "no data";
    readonly stopTripped: boolean;
    readonly stopReasons: string[];
  };
}

const CREDIT_USD = 0.01; // REQ-BETA-14 — 1 credit = $0.01

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

const p90 = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)]!;
};

const share = (num: number, den: number): number | null => (den === 0 ? null : num / den);

const reading = (observed: number | null, t?: BetaGateThreshold): "pass" | "fail" | "no data" | undefined => {
  if (t == null) return undefined;
  if (observed == null) return "no data";
  if (t.direction === "floor") return observed >= t.value ? "pass" : "fail";
  if (t.direction === "ceiling") return observed <= t.value ? "pass" : "fail";
  return observed === t.value ? "pass" : "fail";
};

const fmt = (v: number | null, unit: MetricUnit): string => {
  if (v == null) return "—";
  if (unit === "rate" || unit === "share") return `${(v * 100).toFixed(1)}%`;
  if (unit === "usd") return `$${v.toFixed(2)}`;
  if (unit === "ms") return `${Math.round(v)} ms`;
  return String(v);
};

const fmtThreshold = (t: BetaGateThreshold): string => {
  const op = t.direction === "floor" ? "≥" : t.direction === "ceiling" ? "≤" : "=";
  const v = t.value <= 1 && t.value > 0 ? `${(t.value * 100).toFixed(0)}%` : String(t.value);
  return `${op} ${v}`;
};

/**
 * Compute the weekly beta dashboard: every REQ-BETA-18 gate metric from the analytics stream
 * (`listAnalyticsEvents` — opt-out already excluded) and the named domain sources, beside its
 * registered threshold. Pure reads; call `materializeRunAnalytics` first so the stream carries
 * the domain-derived events for the window.
 */
export async function computeBetaDashboard(
  exec: SqlClient,
  args: { readonly window: DashboardWindow; readonly now: Date },
): Promise<BetaDashboard> {
  const { window } = args;
  const events = await listAnalyticsEvents(exec, { from: window.from, to: window.to });
  const byEvent = new Map<string, AnalyticsRow[]>();
  for (const e of events) {
    const list = byEvent.get(e.event) ?? [];
    list.push(e);
    byEvent.set(e.event, list);
  }
  const of = (name: string) => byEvent.get(name) ?? [];

  // --- cohort: active partners = users with ≥1 stream event or ≥1 run in the window.
  const runUsers = (
    await exec.query(
      `select distinct coalesce(r.requested_by, p.owner_id) as user_id
         from runs r left join projects p on p.id = r.project_id
        where r.created_at >= $1 and r.created_at < $2`,
      [window.from, window.to],
    )
  ).rows as { user_id: string | null }[];
  const active = new Set<string>();
  for (const e of events) if (e.userId) active.add(e.userId);
  for (const r of runUsers) if (r.user_id) active.add(r.user_id);
  const activePartners = active.size;

  // --- north star: repeat-cycle rate (REQ-BETA-2/9) — partners with a manuscript through ≥2 rounds.
  const rounds = of("round.completed");
  const roundsByUser = new Map<string, Map<string, number>>(); // user → manuscript → max ordinal
  for (const e of rounds) {
    const ms = String(e.props.manuscript_id ?? "");
    const ord = Number(e.props.ordinal ?? 0);
    const m = roundsByUser.get(e.userId!) ?? new Map<string, number>();
    m.set(ms, Math.max(m.get(ms) ?? 0, ord));
    roundsByUser.set(e.userId!, m);
  }
  const repeatUsers = [...roundsByUser.values()].filter((m) => [...m.values()].some((o) => o >= 2)).length;
  const repeatCycleRate = share(repeatUsers, activePartners);
  const manuscripts = new Map<string, number>(); // manuscript → max ordinal
  for (const m of roundsByUser.values()) for (const [ms, o] of m) manuscripts.set(ms, Math.max(manuscripts.get(ms) ?? 0, o));
  const round2Rate = share(
    [...manuscripts.values()].filter((o) => o >= 2).length,
    manuscripts.size,
  );

  // --- dispositions: accept+adapt share + the reason-code distribution (REQ-BETA-6).
  const disposals = of("finding.disposed");
  const accepts = disposals.filter((e) => e.props.disposition === "accept" || e.props.disposition === "adapt").length;
  const acceptAdaptShare = share(accepts, disposals.length);
  const reasonCounts = new Map<string, number>();
  for (const e of disposals) {
    const code = typeof e.props.reason_code === "string" ? e.props.reason_code : "(none)";
    reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
  }
  const reasonCodeDistribution = [...reasonCounts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);

  // --- second-manuscript import rate (draft.imported{is_new_manuscript}).
  const imports = of("draft.imported");
  const importers = new Set(imports.map((e) => e.userId!));
  const importCounts = new Map<string, number>();
  for (const e of imports.filter((e2) => e2.props.is_new_manuscript === true)) {
    importCounts.set(e.userId!, (importCounts.get(e.userId!) ?? 0) + 1);
  }
  const secondManuscriptImport = share(
    [...importCounts.values()].filter((n) => n >= 2).length,
    importers.size,
  );

  // --- paid conversion (REQ-BETA-18: topup.purchased in the window → paid).
  const paidUsers = new Set(of("topup.purchased").map((e) => e.userId));
  const paidConversion = share([...paidUsers].filter((u) => active.has(u!)).length, activePartners);

  // --- stated WTP median (operator interview entries + purchase-path signal).
  const wtpMedian = median(of("wtp.recorded").map((e) => Number(e.props.amount)).filter(Number.isFinite));

  // --- gate metrics: approval latency, auto-proceed share (materialized approval_decided rows).
  const decided = of("run.approval_decided");
  const latencies = decided.map((e) => Number(e.props.latency)).filter(Number.isFinite);
  const autoProceedShare = share(decided.filter((e) => e.props.auto_proceeded === true).length, decided.length);

  // --- cancel rate (materialized run.stopped vs run.launched).
  const cancelRate = share(of("run.stopped").length, of("run.launched").length);

  // --- boundary-attestation failures (§12.5 internal stream — a system fact, not user telemetry):
  //     boundary.attested with violations > 0, plus every boundary.violation row.
  const boundary = (
    await exec.query(
      `select
         (select count(*) from run_events
           where type = 'boundary.attested' and (payload->>'violations')::int > 0
             and day >= $1::date and day <= $2::date)::int as attested_failures,
         (select count(*) from run_events_internal
           where type = 'boundary.violation' and at >= $1 and at < $2)::int as violations`,
      [window.from, window.to],
    )
  ).rows[0] as { attested_failures: number; violations: number };
  const boundaryAttestationFailures = Number(boundary.attested_failures) + Number(boundary.violations);

  // --- second-read yield: findings unique to the second read kept at reconciliation (REQ-BETA-3).
  const secondRead = (
    await exec.query(
      `select count(*) filter (where f.origin = 'second_read')::int as second_read,
              count(*)::int as total
         from findings f
         join correspondence_items c on c.id = f.correspondence_id
        where c.delivered_at >= $1 and c.delivered_at < $2`,
      [window.from, window.to],
    )
  ).rows[0] as { second_read: number; total: number };
  const secondReadYield = share(Number(secondRead.second_read), Number(secondRead.total));

  // --- rubric-delta distribution: re-review rubric dims vs the prior review on the same project.
  const rubricRows = (
    await exec.query(
      `select c.rubric, p.rubric as prior_rubric
         from correspondence_items c
         join correspondence_items p on p.id = c.prior_review_id
        where c.delivered_at >= $1 and c.delivered_at < $2`,
      [window.from, window.to],
    )
  ).rows as { rubric: unknown; prior_rubric: unknown }[];
  const dimDeltas = new Map<string, number[]>();
  const dimScores = (rubric: unknown): Map<string, number> => {
    const dims = (rubric as { dimensions?: { dimension?: string; score?: number }[] } | null)?.dimensions;
    const out = new Map<string, number>();
    for (const d of dims ?? []) if (d.dimension != null && typeof d.score === "number") out.set(d.dimension, d.score);
    return out;
  };
  for (const r of rubricRows) {
    const cur = dimScores(r.rubric);
    const prior = dimScores(r.prior_rubric);
    for (const [dim, score] of cur) {
      const before = prior.get(dim);
      if (before != null) {
        const list = dimDeltas.get(dim) ?? [];
        list.push(score - before);
        dimDeltas.set(dim, list);
      }
    }
  }
  const rubricDeltaDistribution = [...dimDeltas.entries()].map(([dimension, deltas]) => {
    const hist: Record<string, number> = {};
    for (const d of deltas) hist[String(d)] = (hist[String(d)] ?? 0) + 1;
    return { dimension, medianDelta: median(deltas) ?? 0, deltas: hist };
  });

  // --- per-run gross margin (P0.11 data): billed credits (Σ ledger debits) vs COGS (Σ list_cost_usd).
  const marginRows = (
    await exec.query(
      `select r.id, r.workflow,
              coalesce((select sum(l.credits) from credit_ledger l where l.run_id = r.id and l.kind = 'debit'), 0)::int
                as billed_credits,
              coalesce((select sum(u.list_cost_usd) from usage_records u where u.run_id = r.id), 0)::float
                as cogs_usd
         from runs r where r.created_at >= $1 and r.created_at < $2
        order by r.created_at`,
      [window.from, window.to],
    )
  ).rows as { id: string; workflow: string; billed_credits: number; cogs_usd: number }[];
  const perRunMargin: PerRunMargin[] = marginRows.map((r) => {
    const billedUsd = r.billed_credits * CREDIT_USD;
    const cogs = Number(r.cogs_usd);
    return {
      runId: r.id,
      workflow: r.workflow,
      billedCredits: r.billed_credits,
      cogsUsd: cogs,
      marginUsd: billedUsd - cogs,
      marginPct: billedUsd > 0 ? (billedUsd - cogs) / billedUsd : null,
    };
  });
  const billedTotal = perRunMargin.reduce((a, r) => a + r.billedCredits * CREDIT_USD, 0);
  const cogsTotal = perRunMargin.reduce((a, r) => a + r.cogsUsd, 0);
  const grossMarginPct = billedTotal > 0 ? (billedTotal - cogsTotal) / billedTotal : null;

  // --- dwell by surface (surface.dwell — web surfaces only at beta: no chat half exists; the
  //     chat-half blindness is documented on the PR per REQ-BETA-10's acceptance).
  const dwell = new Map<string, number>();
  for (const e of of("surface.dwell")) {
    const s = String(e.props.surface ?? "unknown");
    dwell.set(s, (dwell.get(s) ?? 0) + Number(e.props.ms ?? 0));
  }
  const dwellBySurface = [...dwell.entries()].map(([surface, ms]) => ({ surface, ms }));

  // --- the gate-bearing metrics, in registry order, each beside its threshold.
  const T = BETA_GATE_THRESHOLDS;
  const gateMetrics: BetaMetric[] = [
    {
      key: "repeatCycleRate",
      name: "repeat-cycle rate (north star)",
      observed: repeatCycleRate,
      display: fmt(repeatCycleRate, "rate"),
      unit: "rate",
      threshold: T.repeatCycleRate,
      thresholdKey: "repeatCycleRate",
      reading: reading(repeatCycleRate, T.repeatCycleRate),
      source: "analytics stream: round.completed (materialized from delivered reviews)",
      note: `${repeatUsers}/${activePartners} partners with a manuscript through ≥2 rounds`,
    },
    {
      key: "acceptAdaptShare",
      name: "accept+adapt share",
      observed: acceptAdaptShare,
      display: fmt(acceptAdaptShare, "share"),
      unit: "share",
      threshold: T.acceptAdaptShare,
      thresholdKey: "acceptAdaptShare",
      reading: reading(acceptAdaptShare, T.acceptAdaptShare),
      source: "analytics stream: finding.disposed",
      note: `${accepts}/${disposals.length} dispositions`,
    },
    {
      key: "secondManuscriptImport",
      name: "second-manuscript import rate",
      observed: secondManuscriptImport,
      display: fmt(secondManuscriptImport, "rate"),
      unit: "rate",
      threshold: T.secondManuscriptImport,
      thresholdKey: "secondManuscriptImport",
      reading: reading(secondManuscriptImport, T.secondManuscriptImport),
      source: "analytics stream: draft.imported{is_new_manuscript}",
      note: `${[...importCounts.values()].filter((n) => n >= 2).length}/${importers.size} importing partners`,
    },
    {
      key: "paidConversion",
      name: "paid conversion",
      observed: paidConversion,
      display: fmt(paidConversion, "rate"),
      unit: "rate",
      threshold: T.paidConversion,
      thresholdKey: "paidConversion",
      reading: reading(paidConversion, T.paidConversion),
      source: "analytics stream: topup.purchased",
      note: `${paidUsers.size}/${activePartners} partners purchased a top-up`,
    },
    {
      key: "round2Rate",
      name: "round-2 rate",
      observed: round2Rate,
      display: fmt(round2Rate, "rate"),
      unit: "rate",
      threshold: T.round2Rate,
      thresholdKey: "round2Rate",
      reading: reading(round2Rate, T.round2Rate),
      source: "analytics stream: round.completed",
      note: `${[...manuscripts.values()].filter((o) => o >= 2).length}/${manuscripts.size} reviewed manuscripts past round 1`,
    },
    {
      key: "medianStatedWtp",
      name: "median stated WTP",
      observed: wtpMedian,
      display: fmt(wtpMedian, "usd"),
      unit: "usd",
      threshold: T.medianStatedWtp,
      thresholdKey: "medianStatedWtp",
      reading: reading(wtpMedian, T.medianStatedWtp),
      source: "analytics stream: wtp.recorded",
    },
    {
      key: "autoProceedShare",
      name: "auto-proceed share",
      observed: autoProceedShare,
      display: fmt(autoProceedShare, "share"),
      unit: "share",
      threshold: T.autoProceedShare,
      thresholdKey: "autoProceedShare",
      reading: reading(autoProceedShare, T.autoProceedShare),
      source: "analytics stream: run.approval_decided{auto_proceeded}",
    },
    {
      key: "cancelRate",
      name: "cancel rate",
      observed: cancelRate,
      display: fmt(cancelRate, "rate"),
      unit: "rate",
      threshold: T.cancelRate,
      thresholdKey: "cancelRate",
      reading: reading(cancelRate, T.cancelRate),
      source: "analytics stream: run.stopped / run.launched",
    },
    {
      key: "boundaryAttestationFailures",
      name: "boundary-attestation failures",
      observed: boundaryAttestationFailures,
      display: fmt(boundaryAttestationFailures, "count"),
      unit: "count",
      threshold: T.boundaryAttestationFailures,
      thresholdKey: "boundaryAttestationFailures",
      reading: reading(boundaryAttestationFailures, T.boundaryAttestationFailures),
      source: "run_events boundary.attested{violations>0} + run_events_internal boundary.violation",
    },
  ];

  const supporting: BetaMetric[] = [
    {
      key: "activePartners",
      name: "active partners",
      observed: activePartners,
      display: fmt(activePartners, "count"),
      unit: "count",
      source: "analytics stream ∪ runs in window",
      note: "REQ-BETA-18 proceed clause reads ≥15 active partners",
    },
    {
      key: "approvalLatencyMedian",
      name: "approval latency (median)",
      observed: median(latencies),
      display: fmt(median(latencies), "ms"),
      unit: "ms",
      source: "analytics stream: run.approval_decided{latency}",
      note: `p90 ${fmt(p90(latencies), "ms")}`,
    },
    {
      key: "secondReadYield",
      name: "second-read yield",
      observed: secondReadYield,
      display: fmt(secondReadYield, "share"),
      unit: "share",
      source: "domain: findings.origin='second_read' on delivered reviews",
      note: `${secondRead.second_read}/${secondRead.total} findings`,
    },
    {
      key: "grossMargin",
      name: "per-run gross margin (aggregate)",
      observed: grossMarginPct,
      display: grossMarginPct == null ? "—" : fmt(grossMarginPct, "share"),
      unit: "share",
      source: "domain: credit_ledger debits vs usage_records.list_cost_usd",
      note: `billed $${billedTotal.toFixed(2)} vs COGS $${cogsTotal.toFixed(2)}`,
    },
    {
      key: "runCount",
      name: "runs launched",
      observed: of("run.launched").length,
      display: fmt(of("run.launched").length, "count"),
      unit: "count",
      source: "analytics stream: run.launched",
    },
  ];

  const metrics = [...gateMetrics, ...supporting];
  const proceedMetrics = metrics.filter((m) => m.threshold?.clause === "proceed");
  const stopMetrics = metrics.filter((m) => m.threshold?.clause === "stop");
  const stopReasons = stopMetrics
    .filter((m) => m.reading === "fail")
    .map((m) => `${m.name}: ${m.display} vs ${fmtThreshold(m.threshold!)} (${m.threshold!.label})`);
  const proceedAnyNoData = proceedMetrics.some((m) => m.reading === "no data");
  return {
    window,
    generatedAt: args.now,
    metrics,
    perRunMargin,
    reasonCodeDistribution,
    rubricDeltaDistribution,
    dwellBySurface,
    readout: {
      proceedMet: proceedAnyNoData
        ? "no data"
        : proceedMetrics.every((m) => m.reading === "pass") && activePartners >= 15,
      stopTripped: stopReasons.length > 0,
      stopReasons,
    },
  };
}

/** Render the dashboard as the weekly markdown report (`rhema admin beta-report` output). */
export function renderBetaDashboard(d: BetaDashboard): string {
  const lines: string[] = [
    `# Weekly beta dashboard — ${d.window.from.toISOString().slice(0, 10)} → ${d.window.to
      .toISOString()
      .slice(0, 10)}`,
    ``,
    `_Generated ${d.generatedAt.toISOString()} from the analytics stream + system-of-record rows.`,
    `_Instrumentation, not marketing: every gate metric is read against its pre-registered`,
    `_REQ-BETA-18 threshold. This report reads the gates; the gate decision is the beta review's._`,
    ``,
    `## REQ-BETA-18 gate metrics`,
    ``,
    `| metric | observed | threshold | reading | source |`,
    `| --- | --- | --- | --- | --- |`,
  ];
  for (const m of d.metrics.filter((m2) => m2.threshold != null)) {
    lines.push(
      `| ${m.name} | ${m.display}${m.note ? ` (${m.note})` : ""} | ${fmtThreshold(m.threshold!)} — ${m.threshold!.label} | ${m.reading} | ${m.source} |`,
    );
  }
  lines.push(``, `## Supporting metrics`, ``, `| metric | observed | source |`, `| --- | --- | --- |`);
  for (const m of d.metrics.filter((m2) => m2.threshold == null)) {
    lines.push(`| ${m.name} | ${m.display}${m.note ? ` (${m.note})` : ""} | ${m.source} |`);
  }
  if (d.reasonCodeDistribution.length > 0) {
    lines.push(``, `## Reason-code distribution (REQ-BETA-6)`, ``);
    for (const r of d.reasonCodeDistribution) lines.push(`- ${r.code}: ${r.count}`);
  }
  if (d.rubricDeltaDistribution.length > 0) {
    lines.push(``, `## Rubric-delta distribution (re-review vs prior review)`, ``, `| dimension | median Δ | histogram |`, `| --- | --- | --- |`);
    for (const r of d.rubricDeltaDistribution) {
      lines.push(`| ${r.dimension} | ${r.medianDelta} | ${Object.entries(r.deltas).map(([k, v]) => `${k}:×${v}`).join(" ")} |`);
    }
  }
  if (d.dwellBySurface.length > 0) {
    lines.push(``, `## Dwell (surface.dwell — web surfaces only; no chat half exists at beta)`, ``);
    for (const r of d.dwellBySurface) lines.push(`- ${r.surface}: ${Math.round(r.ms / 1000)}s`);
  }
  if (d.perRunMargin.length > 0) {
    lines.push(``, `## Per-run gross margin`, ``, `| run | workflow | billed (cr) | COGS ($) | margin ($) | margin % |`, `| --- | --- | --- | --- | --- | --- |`);
    for (const r of d.perRunMargin) {
      lines.push(
        `| ${r.runId} | ${r.workflow} | ${r.billedCredits} | ${r.cogsUsd.toFixed(2)} | ${r.marginUsd.toFixed(2)} | ${r.marginPct == null ? "—" : `${(r.marginPct * 100).toFixed(0)}%`} |`,
      );
    }
  }
  lines.push(``, `## Readout (mechanical — the gate decision itself is the beta review's)`, ``);
  lines.push(`- proceed clause: ${d.readout.proceedMet === "no data" ? "no data" : d.readout.proceedMet ? "all proceed conditions met" : "not all proceed conditions met"}`);
  lines.push(`- stop clause: ${d.readout.stopTripped ? "TRIPPED" : "not tripped"}`);
  for (const r of d.readout.stopReasons) lines.push(`  - ${r}`);
  return lines.join("\n");
}
