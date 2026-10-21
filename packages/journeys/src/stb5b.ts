// STB.5b (BL-16/17/18/19) — the bounded paid live-leg steps. Each step drives the real api on
// the session's own magic-link cookie (apiFetch) and reads truth from the stage Postgres (db(),
// JOURNEY_DATABASE_URL — tenant-scoped for the FORCE-RLS tables). Steps are registered `red`:
// an unexercised/unreachable leg reports `owed`, a passing leg flips green with evidence.
// Per-leg caps live in STB5B_CAPS (stb5b-helpers.ts) — declared in advance, never raised.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright";
import type { StepCtx, StepFn } from "./runner.js";
import { apiFetch, db } from "./stb5a.js";
import { SEED_SPEND_EXCLUSION_SQL } from "./spend-guard.js";
import {
  STB5B_CAPS,
  assertLegCapUsd,
  baitUserSource,
  buildFullBoardFetchBody,
  buildHighWaterReviewBody,
  buildMemoFetchBody,
  buildOutlinePromotionBody,
  buildPinnedReviewBody,
  buildQuickDraftBody,
  evalB16Asserts,
  evalB17Asserts,
  evalB18aAsserts,
  evalB18bAsserts,
  evalB19Asserts,
  markerGateEdit,
  parseSseFrames,
  sseSeqs,
  stb5bOutlineDraft,
  stb5bReviewDraft,
  type Stb5bAssert,
} from "./stb5b-helpers.js";

const TERMINAL = new Set(["completed", "completed_partial", "failed", "cancelled"]);

// ---------------------------------------------------------------- plumbing

/** The signed-in workspace id (tenant key) for the leg's fresh test identity — resolves the
 *  same `app.tenant_id` the api would scope to. Read off the non-RLS auth tables. */
async function tenantIdFor(email: string): Promise<string> {
  const r = await db().query(
    `select wm.workspace_id as id from workspace_members wm
       join "user" u on u.id = wm.user_id
      where u.email = $1 order by wm.workspace_id limit 1`,
    [email],
  );
  const id = (r.rows[0] as { id: string } | undefined)?.id;
  if (!id) throw new Error(`no workspace row for ${email} (tenant not provisioned yet)`);
  return id;
}

/** A tenant-scoped read (the FORCE-RLS tables: runs, run_events, usage_records, artifacts,
 *  projects). Read-only transaction — the same seam stb5a-scoped-query.mjs uses. */
async function scopedQuery(tenantId: string, sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const c = await db().connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const r = await c.query(sql, params);
    await c.query("rollback");
    return r.rows as Record<string, unknown>[];
  } finally {
    c.release();
  }
}

/** An unscoped read — safe ONLY on the non-RLS tables (steps, gates, decisions, fetch_log,
 *  pause_signals, artifact_versions, workspace_members, drafts). */
async function plainQuery(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  return (await db().query(sql, params)).rows as Record<string, unknown>[];
}

interface SignedInLeg {
  readonly context: BrowserContext;
  readonly email: string;
  readonly tenantId: string;
}

async function signInLeg(ctx: StepCtx, tag: string): Promise<SignedInLeg> {
  // Funded-window mode: `JOURNEY_FUNDED_STABLE_TAG` (e.g. "a" → test+jrn-a@…) points the leg at
  // the operator-funded STABLE tenant instead of a fresh test tenant. A fresh flagged tenant
  // carries only the 10-cr daily allowance — no paid run's hold clears it (402
  // insufficient_balance), so without a per-tenant grant the paid legs are unexecutable by
  // construction. Unset ⇒ the original fresh-tenant shape (nightly/weekly CI).
  const stableTag = process.env.JOURNEY_FUNDED_STABLE_TAG;
  const s = stableTag ? await ctx.returningUser(stableTag) : await ctx.freshUser(tag);
  // the tenant exists by the time magic-link provisioning returns; retry briefly for the join row
  let tenantId: string | null = null;
  for (let i = 0; i < 10 && !tenantId; i++) {
    tenantId = await tenantIdFor(s.email).catch(() => null);
    if (!tenantId) await s.page.waitForTimeout(2_000);
  }
  if (!tenantId) throw new Error(`no workspace for ${s.email}`);
  return { context: s.context, email: s.email, tenantId };
}

/** Upload `text` as a .md through the real quarantine→convert→project flow ($0) and return the
 *  created project. `entry:'draft'` lands the conversion as Draft v1. */
async function createProjectWithDraft(
  ctx: StepCtx,
  leg: SignedInLeg,
  args: { title: string; text: string; protocolId?: string },
): Promise<{ projectId: string; slug: string; draftId: string | null }> {
  const presign = await apiFetch(ctx, leg.context, `/import/presign`, {
    method: "POST",
    json: {},
  });
  if (presign.status !== 200 && presign.status !== 201) {
    throw new Error(`presign → ${presign.status}: ${presign.text.slice(0, 200)}`);
  }
  const up = presign.body as { url: string; key: string; requiredHeaders?: Record<string, string> };
  const put = await fetch(up.url, {
    method: "PUT",
    headers: { "content-type": "text/markdown", ...(up.requiredHeaders ?? {}) },
    body: args.text,
  });
  if (!put.ok) throw new Error(`quarantine PUT → ${put.status}`);
  // create — the conversion is async; retry through `conversion_pending` (the convert Job runs
  // ~4 min cold on prod; 25 s in-route waits usually suffice on a warm pool).
  const deadline = Date.now() + 6 * 60_000;
  for (;;) {
    const create = await apiFetch(ctx, leg.context, `/projects`, {
      method: "POST",
      json: {
        title: ctx.marker(args.title),
        entry: "draft",
        quarantineKey: up.key,
        ...(args.protocolId ? { protocolId: args.protocolId } : {}),
      },
    });
    if (create.status === 201 || create.status === 200) {
      // POST /projects returns {project:{id, slug, draftId, draftN, conversionNotes}}
      const body = (create.body as { project?: { id?: string; slug?: string; draftId?: string } }).project;
      if (!body?.id || !body.slug) {
        throw new Error(`project create → ${JSON.stringify(create.body).slice(0, 200)}`);
      }
      return { projectId: body.id, slug: body.slug, draftId: body.draftId ?? null };
    }
    if (create.status === 409 && /conversion_pending/.test(create.text)) {
      if (Date.now() > deadline) throw new Error(`conversion still pending after 6 min (${up.key})`);
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    throw new Error(`project create → ${create.status}: ${create.text.slice(0, 240)}`);
  }
}

/** The project's newest drafts-row id (the draft the upload landed as — the create response's
 *  `draftId` is preferred; this is the DB fallback when it came back null). */
async function headDraftId(projectId: string): Promise<string> {
  const rows = await plainQuery(
    `select id from drafts where project_id = $1 order by n desc limit 1`,
    [projectId],
  );
  const id = (rows[0] as { id: string } | undefined)?.id;
  if (!id) throw new Error(`no drafts row on project ${projectId}`);
  return id;
}

interface RunReport {
  /** the report's own shape: state + steps are top-level INSIDE it (the route wraps it —
   *  `GET /runs/:id/report` returns `{kind:"ok", report, projectSlug, refundWindow?}`). */
  runId?: string;
  state?: string;
  steps?: { phase: string; ordinal: number; state: string; credits: number }[];
  [k: string]: unknown;
}

async function runReport(ctx: StepCtx, leg: SignedInLeg, runId: string): Promise<RunReport> {
  const r = await apiFetch(ctx, leg.context, `/runs/${runId}/report`);
  if (r.status !== 200) throw new Error(`GET /runs/${runId}/report → ${r.status}: ${r.text.slice(0, 160)}`);
  const body = r.body as { kind?: string; report?: RunReport } & RunReport;
  // unwrap the route's `{kind:"ok", report:{…}}` envelope — a bare RunReport body is tolerated too.
  return body.report ?? body;
}

/** Poll `/runs/:id/report` until the run reaches `until` (a state name or "terminal"). */
async function waitRun(
  ctx: StepCtx,
  leg: SignedInLeg,
  runId: string,
  until: "terminal" | "waiting_gate",
  timeoutMs: number,
  onTick?: (report: RunReport) => void,
): Promise<RunReport> {
  const deadline = Date.now() + timeoutMs;
  let last: RunReport = {};
  for (;;) {
    last = await runReport(ctx, leg, runId).catch(() => last);
    onTick?.(last);
    const state = last.state ?? "";
    if (until === "terminal" && TERMINAL.has(state)) return last;
    if (until === "waiting_gate" && (state === "waiting_gate" || TERMINAL.has(state))) return last;
    if (Date.now() > deadline) {
      throw new Error(`run ${runId} never reached ${until} (state=${state || "?"}, waited ${timeoutMs / 1000}s)`);
    }
    await new Promise((r) => setTimeout(r, 8_000));
  }
}

async function createRun(
  ctx: StepCtx,
  leg: SignedInLeg,
  projectId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const r = await apiFetch(ctx, leg.context, `/projects/${projectId}/runs`, { method: "POST", json: body });
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`POST /projects/${projectId}/runs → ${r.status}: ${r.text.slice(0, 240)}`);
  }
  const runId = (r.body as { runId?: string }).runId;
  if (!runId) throw new Error(`run create → ${JSON.stringify(r.body).slice(0, 200)}`);
  return runId;
}

/** Metered USD for one run (the same proxy-source rows the weekly guard sums — REQ-ECON-6's
 *  seed-marker exclusion applies here too: the cap's meter never counts seeded fiction). */
async function runSpendUsd(tenantId: string, runId: string): Promise<number> {
  const rows = await scopedQuery(
    tenantId,
    `select coalesce(sum(u.list_cost_usd),0)::float8 as usd from usage_records u where u.run_id = $1 and u.source = 'proxy' and ${SEED_SPEND_EXCLUSION_SQL}`,
    [runId],
  );
  return Number((rows[0] as { usd: number } | undefined)?.usd ?? 0);
}

/** Persist the step's evidence blob into the run's report dir (picked up under docs/build/reports). */
async function writeEvidence(ctx: StepCtx, stepId: string, evidence: Record<string, unknown>): Promise<void> {
  await writeFile(
    path.join(ctx.outDir, `${stepId}-evidence.json`),
    JSON.stringify({ step: stepId, nonce: ctx.nonce, at: new Date().toISOString(), ...evidence }, null, 2),
  ).catch(() => undefined);
}

/** Fold asserts → throw `owed` when any assert failed (red steps report owed, never fail).
 *  R5ECON.1 (REQ-ECON-7): the declared per-leg cap is ENFORCED at close — the evidence blob is
 *  written first (capUsd + meteredUsd always land), then a `meteredUsd > capUsd` leg throws
 *  `CapOverrunError` (the runner's `cap_overrun` verdict; it pauses the funded window) BEFORE
 *  the owed arm — an overrun is a budget emergency, never a silent pass nor a plain owed. */
async function finishLeg(
  ctx: StepCtx,
  stepId: string,
  asserts: Stb5bAssert[],
  meteredUsd: number,
  extra: Record<string, unknown>,
): Promise<void> {
  const capUsd = STB5B_CAPS[stepId];
  const failed = asserts.filter((a) => !a.pass);
  await writeEvidence(ctx, stepId, { capUsd, meteredUsd, asserts, ...extra });
  assertLegCapUsd(stepId, meteredUsd, capUsd);
  if (failed.length > 0) {
    throw new Error(
      `${stepId} owed — ${failed.map((a) => `${a.id}: ${a.evidence.slice(0, 220)}`).join(" | ")}`,
    );
  }
}

// ---------------------------------------------------------------- B16 — BL-16 sidecar-absent + mid-phase pin

const B16: StepFn = async (ctx) => {
  const leg = await signInLeg(ctx, "b16");
  const project = await createProjectWithDraft(ctx, leg, {
    title: "b16 pin leg",
    text: stb5bReviewDraft(),
  });
  const runId = await createRun(ctx, leg, project.projectId, buildPinnedReviewBody({ idempotencyKey: `b16-${ctx.nonce}` }));
  await waitRun(ctx, leg, runId, "terminal", 15 * 60_000);

  const run = (await scopedQuery(leg.tenantId, `select state, inputs from runs where id = $1`, [runId]))[0] as
    | { state: string; inputs: Record<string, unknown> }
    | undefined;
  const steps = (await plainQuery(
    `select phase, ordinal, state, result from steps where run_id = $1 order by ordinal`,
    [runId],
  )) as unknown as { phase: string; ordinal: number; state: string; result: { status?: string; predicatesPassed?: boolean } | null }[];
  const artifactPaths = (
    await scopedQuery(
      leg.tenantId,
      `select distinct a.mirror_path as p from artifacts a
         join artifact_versions av on av.artifact_id = a.id
        where a.project_id = $1`,
      [project.projectId],
    )
  ).map((r) => String(r.p));

  const usd = await runSpendUsd(leg.tenantId, runId);
  const asserts = evalB16Asserts({
    runInputs: (run?.inputs as Record<string, unknown>) ?? {},
    runState: run?.state ?? "?",
    steps,
    artifactPaths,
  });
  await finishLeg(ctx, "B16", asserts, usd, { runId, projectId: project.projectId });
};

// ---------------------------------------------------------------- B17 — BL-17b high-water publish (+ BL-17a finding)

/** Read the live SSE tail for `runId` until `stop`, collecting every `id:` seq seen. Runs on the
 *  leg's session cookie (Node fetch — Playwright's request API buffers, it cannot tail). */
async function tailSse(
  ctx: StepCtx,
  leg: SignedInLeg,
  runId: string,
  stop: () => boolean,
  timeoutMs: number,
): Promise<number[]> {
  const cookies = await leg.context.cookies(ctx.webBaseUrl);
  const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const buf: string[] = [];
  try {
    const res = await fetch(`${ctx.apiBaseUrl}/runs/${runId}/events`, {
      headers: { cookie: header, accept: "text/event-stream" },
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) return [];
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = "";
    // ONE pending read at a time, kept across loop iterations. Racing `reader.read()` against the
    // 4 s re-check inside the loop ABANDONS the pending read when the timeout wins — and a stream
    // reader queues pending reads, so every later chunk resolves an abandoned promise whose value
    // is silently dropped. After the first >4 s idle gap the tail could never see another chunk
    // (this is why live tails saw only the connect-time backlog — e.g. seqs 1..4). The timeout
    // here only re-checks `stop()`; the in-flight `read` is reused on the next pass.
    let pending = reader.read();
    while (!stop()) {
      const r = await Promise.race([
        pending.then(({ done, value }) => ({ done, value, timedOut: false as const })),
        new Promise<{ timedOut: true }>((res2) => setTimeout(() => res2({ timedOut: true }), 4_000)),
      ]);
      if (r.timedOut) continue; // `pending` still owns the next chunk — do not issue a second read
      const { done, value } = r;
      if (done) break;
      if (value) {
        text += dec.decode(value, { stream: true });
        const cut = text.lastIndexOf("\n\n");
        if (cut >= 0) {
          buf.push(text.slice(0, cut + 2));
          text = text.slice(cut + 2);
        }
      }
      pending = reader.read();
    }
    // release the abandoned in-flight read so the socket can drain/close cleanly
    void pending.catch(() => undefined);
    reader.cancel().catch(() => undefined);
    buf.push(text);
  } catch {
    /* abort/close ends the tail — seqs collected so far stand */
  } finally {
    clearTimeout(timer);
  }
  return sseSeqs(parseSseFrames(buf.join("")));
}

const B17: StepFn = async (ctx) => {
  const leg = await signInLeg(ctx, "b17");
  const project = await createProjectWithDraft(ctx, leg, {
    title: "b17 high-water leg",
    text: stb5bReviewDraft(),
  });
  const runId = await createRun(ctx, leg, project.projectId, buildHighWaterReviewBody({ idempotencyKey: `b17-${ctx.nonce}` }));

  // subscriber A — the live tail, open across the commit window.
  let terminal = false;
  const tail = tailSse(ctx, leg, runId, () => terminal, 15 * 60_000);
  await waitRun(ctx, leg, runId, "terminal", 15 * 60_000);
  // give the publisher a breath beyond the terminal state, then close the tail — the server's
  // safety poll is 10 s (pollIntervalMs default), so 12 s guarantees one post-commit poll cycle
  // lands inside the tail even when the Redis wakeup path is degraded.
  await new Promise((r) => setTimeout(r, 12_000));
  terminal = true;
  const liveSeqs = await tail;

  // subscriber B — the post-commit replay (`?poll=1` returns a finite snapshot then closes).
  const replayRes = await apiFetch(ctx, leg.context, `/runs/${runId}/events?poll=1`);
  const replaySeqs = sseSeqs(parseSseFrames(replayRes.text));

  const seqRow = (await scopedQuery(
    leg.tenantId,
    `select max(seq)::int as hi from run_events where run_id = $1`,
    [runId],
  ))[0] as { hi: number | null } | undefined;
  const types = (
    await scopedQuery(leg.tenantId, `select distinct type from run_events where run_id = $1 order by type`, [runId])
  ).map((r) => String(r.type));

  const usd = await runSpendUsd(leg.tenantId, runId);
  const asserts = evalB17Asserts({
    liveTailSeqs: liveSeqs,
    replaySeqs,
    maxDbSeq: seqRow?.hi ?? 0,
    commitEventTypes: types,
  });
  await finishLeg(ctx, "B17", asserts, usd, { runId, liveSeqs: liveSeqs.slice(-20), replayMax: Math.max(0, ...replaySeqs) });
};

// ---------------------------------------------------------------- B18A — BL-18a Full-board fetch leg

const B18A: StepFn = async (ctx) => {
  const leg = await signInLeg(ctx, "b18a");
  const project = await createProjectWithDraft(ctx, leg, {
    title: "b18a fetch leg",
    text: stb5bReviewDraft(),
  });
  const runId = await createRun(ctx, leg, project.projectId, buildFullBoardFetchBody({ idempotencyKey: `b18a-${ctx.nonce}` }));
  await waitRun(ctx, leg, runId, "terminal", 20 * 60_000);

  const fetchRows = (await plainQuery(
    `select url, bytes, status, agent_label as "agentLabel", kind, decision, deny_reason
       from fetch_log where run_id = $1 and kind = 'fetch' and decision = 'allow' order by ts`,
    [runId],
  )) as unknown as { url: string | null; bytes: number | null; agentLabel: string }[];
  const steps = await plainQuery(`select phase, state from steps where run_id = $1`, [runId]);
  const usd = await runSpendUsd(leg.tenantId, runId);

  const asserts = evalB18aAsserts({
    fetchAllowRows: fetchRows,
    verificationStepPresent: steps.some((s) => s.phase === "verification" && s.state === "done"),
  });
  await finishLeg(ctx, "B18A", asserts, usd, { runId, fetchRows: fetchRows.length });
};

// ---------------------------------------------------------------- B18B — BL-18b memo user-source deny

const B18B: StepFn = async (ctx) => {
  const leg = await signInLeg(ctx, "b18b");
  const host = `stb5b-${ctx.nonce}.example.internal`;
  const project = await createProjectWithDraft(ctx, leg, {
    title: "b18b memo leg",
    text: stb5bReviewDraft({ baitHost: host }),
    protocolId: "memo",
  });
  const runId = await createRun(
    ctx,
    leg,
    project.projectId,
    buildMemoFetchBody({ idempotencyKey: `b18b-${ctx.nonce}`, userSources: [baitUserSource(host)] }),
  );
  await waitRun(ctx, leg, runId, "terminal", 20 * 60_000);

  const run = (await scopedQuery(leg.tenantId, `select inputs from runs where id = $1`, [runId]))[0] as
    | { inputs: Record<string, unknown> }
    | undefined;
  const policy = (run?.inputs?.["urlPolicy"] ?? {}) as Record<string, unknown>;
  const domains = Array.isArray(policy["userSourceDomains"]) ? (policy["userSourceDomains"] as string[]) : [];

  const fetchRows = (await plainQuery(
    `select url, decision, deny_reason from fetch_log where run_id = $1 and kind = 'fetch' order by ts`,
    [runId],
  )) as { url: string | null; decision: string; deny_reason: string | null }[];
  const forHost = fetchRows.filter((r) => (r.url ?? "").includes(host));
  const denyRows = fetchRows.filter((r) => r.decision === "deny" && r.deny_reason === "user_source").length;
  const pauses = (
    await plainQuery(`select id from pause_signals where run_id = $1 and reason = 'user_source_fetch'`, [runId])
  ).length;
  const usd = await runSpendUsd(leg.tenantId, runId);

  const asserts = evalB18bAsserts({
    policyForbidden: policy["fetchUserDataForbidden"] === true,
    policyDomainsContainHost: domains.includes(host),
    transitedRowsForHost: forHost.filter((r) => r.decision === "allow").length,
    denyRows,
    pauseSignals: pauses,
    attemptObserved: forHost.length > 0 || denyRows > 0 || pauses > 0,
  });
  await finishLeg(ctx, "B18B", asserts, usd, { runId, host, domains });
};

// ---------------------------------------------------------------- B19A — BL-19a approve_plan structured edit

interface TimelineGateDto {
  readonly id: string;
  readonly kind: string;
  readonly artifactVersionId?: string;
  readonly structured?: Record<string, unknown>;
}

/** Read the run's open gate off the timeline DTO (the same card row the UI edits through —
 *  rounds[].runs + ungrouped[] each carry `runId` + `gate` when a gate is open). */
async function openGateFor(
  ctx: StepCtx,
  leg: SignedInLeg,
  projectId: string,
  runId: string,
): Promise<TimelineGateDto | null> {
  const t = await apiFetch(ctx, leg.context, `/projects/${projectId}/timeline`);
  if (t.status !== 200) return null;
  const body = t.body as {
    rounds?: { runs?: { runId: string; gate?: TimelineGateDto }[] }[];
    ungrouped?: { runId: string; gate?: TimelineGateDto }[];
  };
  const runs = [
    ...(body.rounds ?? []).flatMap((r) => r.runs ?? []),
    ...(body.ungrouped ?? []),
  ];
  return runs.find((r) => r.runId === runId)?.gate ?? null;
}

/** Post the structured `edit` decision on the CARD's real seam (`/projects/:id/gates/:gid/decide`
 *  + the `edits` delta DSL — `applyGateEdits` applies it to the server-side sidecar, the resolver
 *  serializes the write-back overlay). The marker rides `newClaims`: approve_plan appends it to the
 *  spine; approve_outline appends a `user_typed` claim — both land in the overlay pair's bytes. */
async function decideGateEdit(
  ctx: StepCtx,
  leg: SignedInLeg,
  projectId: string,
  gateId: string,
  marker: string,
): Promise<{ ok: boolean; overlayVersionIds: string[]; status: number; text: string }> {
  const r = await apiFetch(ctx, leg.context, `/projects/${projectId}/gates/${gateId}/decide`, {
    method: "POST",
    json: { action: "edit", edits: markerGateEdit(marker) },
  });
  const body = (r.body ?? {}) as { overlayVersionIds?: string[]; resolved?: boolean };
  return {
    ok: r.status === 200 && body.resolved !== false,
    overlayVersionIds: body.overlayVersionIds ?? [],
    status: r.status,
    text: r.text.slice(0, 300),
  };
}

const B19A: StepFn = async (ctx) => {
  const leg = await signInLeg(ctx, "b19a");
  const project = await createProjectWithDraft(ctx, leg, {
    title: "b19a plan-edit leg",
    text: stb5bOutlineDraft(),
  });
  const draftId = project.draftId ?? (await headDraftId(project.projectId));
  const runId = await createRun(ctx, leg, project.projectId, buildQuickDraftBody({ idempotencyKey: `b19a-${ctx.nonce}`, draftId }));

  // to the gate (intake→voice→plan→approve_plan), then drive the structured edit.
  await waitRun(ctx, leg, runId, "waiting_gate", 25 * 60_000);
  const gate = await openGateFor(ctx, leg, project.projectId, runId);
  let decisionAction: string | null = null;
  let overlayVersionIds: string[] = [];
  const marker = `${ctx.marker("STB5B")}-MARKER`;
  if (gate?.kind === "approve_plan") {
    const decided = await decideGateEdit(ctx, leg, project.projectId, gate.id, marker);
    overlayVersionIds = decided.overlayVersionIds;
    if (!decided.ok) throw new Error(`gate edit decision failed (${decided.status}): ${decided.text}`);
    decisionAction = "edit";
  }
  const finalReport = await waitRun(ctx, leg, runId, "terminal", 25 * 60_000);

  const decision = (await plainQuery(
    `select d.action, d.overlay_version_ids as ids, d.presence, d.changes
       from decisions d join gates g on g.id = d.gate_id where g.run_id = $1 order by d.at desc limit 1`,
    [runId],
  ))[0] as { action: string; ids: string[] | null } | undefined;
  const overlayIds = decision?.ids ?? overlayVersionIds;
  const overlayRows = overlayIds.length
    ? ((await scopedQuery(
        leg.tenantId,
        `select a.mirror_path as p, av.created_by->>'kind' as kind
           from artifact_versions av join artifacts a on a.id = av.artifact_id where av.id = any($1::text[])`,
        [overlayIds],
      )) as { p: string; kind: string }[])
    : [];
  const run = (await scopedQuery(leg.tenantId, `select state from runs where id = $1`, [runId]))[0] as
    | { state: string }
    | undefined;
  // the "edits land in the next phase's file" half: a phase AFTER plan committed `done` on the
  // materialized /work (which carries the user-authored overlay as the plan's head). The draft
  // manifest runs plan(2)→grounding(3)→draft(4), so either post-gate phase counts; the
  // overlay-version rows are the write-back proof.
  const nextPhaseCommitted = (finalReport.steps ?? []).some(
    (s) => (s.phase === "grounding" || s.phase === "draft") && s.state === "done",
  );
  const usd = await runSpendUsd(leg.tenantId, runId);

  const asserts = evalB19Asserts({
    gateKind: gate?.kind ?? "",
    decisionAction: decision?.action ?? decisionAction,
    overlayVersionIds: overlayIds,
    overlayPaths: overlayRows.map((r) => r.p),
    overlayCreatedByUser: overlayRows.length > 0 && overlayRows.every((r) => r.kind === "user"),
    runState: run?.state ?? "?",
    expectPath: "structure-plan",
    markerFound: overlayIds.length > 0 && nextPhaseCommitted,
    marker,
  });
  await finishLeg(ctx, "B19A", asserts, usd, {
    runId,
    overlayVersionIds: overlayIds,
    note: "content-level marker carry (the draft artifact's prose) is evidence-only — the DB-provable half is the user-authored structure-plan version the next phase materialized from",
  });
};

// ---------------------------------------------------------------- B19B — BL-19b approve_outline edit + promotion

const B19B: StepFn = async (ctx) => {
  const leg = await signInLeg(ctx, "b19b");
  const project = await createProjectWithDraft(ctx, leg, {
    title: "b19b outline leg",
    text: stb5bOutlineDraft(),
  });
  // seed the research index with a real chat turn (the promotion scope 'research' reads it).
  const thread = await apiFetch(ctx, leg.context, `/projects/${project.projectId}/chat/threads`, {
    method: "POST",
    json: { name: ctx.marker("b19b research") },
  });
  if (thread.status !== 201 && thread.status !== 200) {
    throw new Error(`chat thread create → ${thread.status}: ${thread.text.slice(0, 200)}`);
  }
  // POST /chat/threads returns {thread:{id,name,isDefault}} — the id is nested.
  const threadId = (thread.body as { thread?: { id?: string } }).thread?.id;
  if (!threadId) throw new Error(`thread create → ${JSON.stringify(thread.body).slice(0, 200)}`);
  const turn = await apiFetch(ctx, leg.context, `/projects/${project.projectId}/chat/threads/${threadId}/turns`, {
    method: "POST",
    json: {
      message: "Collect the load-bearing facts about queue depth as a budget line — arrival vs completion rates, utilisation knee, ownership patterns — with sources.",
      modelTier: "base",
    },
  });
  if (turn.status !== 201 && turn.status !== 200) {
    throw new Error(`chat turn → ${turn.status}: ${turn.text.slice(0, 240)}`);
  }
  const turnRunId = (turn.body as { runId?: string }).runId;
  if (turnRunId) await waitRun(ctx, leg, turnRunId, "terminal", 15 * 60_000);

  const slug = `b19b-${ctx.nonce}`;
  const promo = await apiFetch(ctx, leg.context, `/projects/${project.projectId}/outline/promotions`, {
    method: "POST",
    json: buildOutlinePromotionBody({ slug }),
  });
  if (promo.status !== 201) {
    throw new Error(`outline promotion → ${promo.status}: ${promo.text.slice(0, 240)}`);
  }
  const runId = (promo.body as { runId?: string }).runId;
  if (!runId) throw new Error(`promotion → ${JSON.stringify(promo.body).slice(0, 200)}`);

  await waitRun(ctx, leg, runId, "waiting_gate", 25 * 60_000);
  const gate = await openGateFor(ctx, leg, project.projectId, runId);
  let decisionAction: string | null = null;
  let overlayVersionIds: string[] = [];
  const marker = `${ctx.marker("STB5B")}-MARKER`;
  if (gate?.kind === "approve_outline") {
    const decided = await decideGateEdit(ctx, leg, project.projectId, gate.id, marker);
    overlayVersionIds = decided.overlayVersionIds;
    if (!decided.ok) throw new Error(`outline gate edit failed (${decided.status}): ${decided.text}`);
    decisionAction = "edit";
  }
  await waitRun(ctx, leg, runId, "terminal", 25 * 60_000);

  const decision = (await plainQuery(
    `select d.action, d.overlay_version_ids as ids from decisions d join gates g on g.id = d.gate_id
      where g.run_id = $1 order by d.at desc limit 1`,
    [runId],
  ))[0] as { action: string; ids: string[] | null } | undefined;
  const overlayIds = decision?.ids ?? overlayVersionIds;
  const overlayRows = overlayIds.length
    ? ((await scopedQuery(
        leg.tenantId,
        `select a.mirror_path as p, av.created_by->>'kind' as kind
           from artifact_versions av join artifacts a on a.id = av.artifact_id where av.id = any($1::text[])`,
        [overlayIds],
      )) as { p: string; kind: string }[])
    : [];
  const run = (await scopedQuery(leg.tenantId, `select state from runs where id = $1`, [runId]))[0] as
    | { state: string }
    | undefined;
  // outline.approved is an ANALYTICS event (analytics_events, user opt-out honored) — never a
  // run_event; and it only fires on action === 'approve'.
  const events = (
    await scopedQuery(
      leg.tenantId,
      `select distinct event from analytics_events where run_id = $1 and workspace_id = $2`,
      [runId, leg.tenantId],
    )
  ).map((r) => String(r.event));
  const promoted = await scopedQuery(
    leg.tenantId,
    `select a.mirror_path as p from artifacts a where a.project_id = $1 and a.mirror_path like 'agents/author/outline/%'`,
    [project.projectId],
  );
  const usd = await runSpendUsd(leg.tenantId, runId);

  const asserts = evalB19Asserts({
    gateKind: gate?.kind ?? "",
    decisionAction: decision?.action ?? decisionAction,
    overlayVersionIds: overlayIds,
    overlayPaths: overlayRows.map((r) => r.p),
    overlayCreatedByUser: overlayRows.length > 0 && overlayRows.every((r) => r.kind === "user"),
    runState: run?.state ?? "?",
    expectPath: "outline",
    markerFound: promoted.length > 0, // the promoted artifact exists under agents/author/outline/<slug>
    marker,
    approvedEventSeen: events.includes("outline.approved"),
  });
  await finishLeg(ctx, "B19B", asserts, usd, {
    runId,
    turnRunId,
    overlayVersionIds: overlayIds,
    promotedPaths: promoted.map((r) => r.p),
  });
};

// ---------------------------------------------------------------- B19C — BL-19 tail: profile approve_sample + hold-out

const B19C: StepFn = async (ctx) => {
  // Pre-registered DROP (cap discipline): a full-tier profile_voice build alone meters ≈ $15 —
  // 60% of the ticket's $25 combined cap and double the ≈$12 aim. It runs only when every earlier
  // leg landed under cap with headroom; the D-P1.14-1 rows carry forward either way.
  await writeEvidence(ctx, "B19C", {
    capUsd: STB5B_CAPS["B19C"],
    skipped: "pre-registered drop — exceeds the leg's budget slot within the ≤$25 / ≈$12 envelope; the approve_sample + hold-out/leak legs defer to the next funded window (D-P1.14-1 stays OPEN)",
  });
  throw new Error(
    `B19C owed — pre-registered drop: a full-tier profile_voice build (~$15 vs the ≈$12 aim) is deferred within cap discipline; approve_sample + calibration/hold-out legs stay OPEN on D-P1.14-1`,
  );
};

export const STB5B_IMPLS: Readonly<Record<string, StepFn>> = {
  B16,
  B17,
  B18A,
  B18B,
  B19A,
  B19B,
  B19C,
};
