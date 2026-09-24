import { Hono } from "hono";
import { projectState, NON_TERMINAL_RUN_STATES } from "@rhema/orchestrator";
import type { ProjectState, ProjectStateInput } from "@rhema/orchestrator";
import {
  deriveVoiceStatus,
  type VoiceCurrentFacts,
  type VoiceRunInProgress,
  type VoiceSnapshotFacts,
  type VoiceStatus,
} from "@rhema/findings-core";
import type { Principal } from "./run-routes.js";
import type { SqlClient, InviteGate } from "./invite.js";
import { parseSampleSet, personaPhaseCount } from "./voice-status.js";

// The beta project list (PRB.01; REQ-PROD-9 / REQ-SPEC-3), extended for P1.04's §5.2 workspace home:
// each row's pill + primary action is DERIVED from the §6.3 state function — the project table stores no
// `status` column. This module reads the project's row-sets (drafts, outline artifacts, review/response
// correspondence, runs + their gates/steps, the accepted version, archive flag), assembles the pure
// `ProjectStateInput`, returns `projectState(input)` per project, and derives the row's §5.2 attention
// group + ≤120-char status line from the SAME output — the web layer renders, it never re-derives.

export type ProjectGroupKey = "needs_you" | "running" | "ready_to_read" | "quiet";

export interface ProjectListRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly state: ProjectState;
  /** The highest-n draft head — the source editor's entry point (PRB.07). Null only for a draft-less row. */
  readonly headDraftId: string | null;
  /** P1.04 — the head draft's ordinal for the row's "vN" version label. */
  readonly headDraftN: number | null;
  /**
   * PRB.21 / D-PRB.20-1 — the project's ONE non-terminal run when it has one (the run sheet renders its
   * in-progress state + links here instead of a Run affordance; creation 409s `run_in_progress`).
   */
  readonly activeRun: { readonly runId: string; readonly state: string; readonly workflow: string | null } | null;
  /**
   * PRB.10 — the linked voice's chip (§9.6): the persona + the ONE shared status pill, derived at read
   * time from the same assembler every surface uses. Null for a project with no voice linked (ad-hoc).
   * `usesOlderProfile` marks a project pinned to a snapshot behind the voice's current profile.
   */
  readonly voice: {
    readonly personaId: string;
    readonly name: string | null;
    readonly status: VoiceStatus;
    readonly usesOlderProfile: boolean;
  } | null;
  /** P1.01 — the per-project paper pin ('light'|'follow'|'dark'; REQ-IDE-38) for the IDE shell's SSR stamp. */
  readonly paperTheme: "light" | "follow" | "dark";
  /** P1.04 — the project's protocol + venue picks (secondary chips + search facets). */
  readonly protocolId: string | null;
  readonly venue: string | null;
  /** P1.04 — archived rows hide behind the Archived affordance (soft; runs block). */
  readonly archivedAt: string | null;
  /** P1.04 — soft-deleted rows leave every read; the 30-day restore window reads them back scoped. */
  readonly deletedAt: string | null;
  /** P1.04 — the latest run ended failed/cancelled (the row's red indicator). */
  readonly lastRunFailed: boolean;
  /** P1.04 — the soonest unresolved blocking-gate deadline (Needs-you ordering). */
  readonly needsYouDeadlineAt: string | null;
  /** P1.04 — the latest review letter has been opened (Ready-to-read clears). */
  readonly letterOpened: boolean;
  /** P1.04 — the assembled status line (state + phase + counts; ≤120 chars, deterministic). */
  readonly statusLine: string;
  /** P1.04 — the row's §5.2 attention group (derived, never persisted). */
  readonly group: ProjectGroupKey;
}

interface ProjectRowDb {
  id: string;
  slug: string;
  title: string;
  accepted_draft_id: string | null;
  archived_at: string | Date | null;
  deleted_at: string | Date | null;
  persona_id: string | null;
  persona_profile_snapshot_id: string | null;
  paper_theme: "light" | "follow" | "dark";
  protocol_id: string | null;
  venue: string | null;
}

interface DraftRowDb {
  project_id: string;
  id: string;
  n: number;
  origin: string;
}

// ---- P1.04 — the §5.2 derivations (pure, deterministic, testable) ----

const STATUS_LINE_MAX = 120;

/** Clamp the assembled status line to §5.2's 120 chars (ellipsis-truncated, deterministic). */
export function clampStatusLine(line: string): string {
  if (line.length <= STATUS_LINE_MAX) return line;
  return `${line.slice(0, STATUS_LINE_MAX - 1).trimEnd()}…`;
}

/** snake_case key → a title-case label ("approve_triage" → "Approve triage"). */
function humanize(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const WORKFLOW_LABELS: Record<string, string> = {
  review: "Review",
  revise: "Revise",
  draft: "Draft",
  outline: "Outline",
  fact_check: "Fact-check",
  figure: "Figure",
};

/**
 * The row's §5.2 attention group from the derived state + row facts:
 *   needs_you      — the needs_you overlay (a blocking gate waits; ordered by soonest deadline)
 *   running        — the running overlay (a non-terminal run executes)
 *   ready_to_read  — a delivered review the user has not opened (the letter is the deliverable)
 *   quiet          — everything else (incl. archived rows, which only show under the Archived affordance)
 */
export function projectGroupKey(args: { state: ProjectState; letterOpened: boolean }): ProjectGroupKey {
  if (args.state.overlay === "needs_you") return "needs_you";
  if (args.state.overlay === "running") return "running";
  if (args.state.key === "reviewed" && !args.letterOpened) return "ready_to_read";
  return "quiet";
}

/** The row's ≤120-char status line — assembled from stored facts per group (§5.2). */
export function buildStatusLine(args: {
  group: ProjectGroupKey;
  state: ProjectState;
  headDraftN: number | null;
  activeRun: { state: string; workflow: string | null; spentCredits: number | null; capCredits: number | null } | null;
  stepsDone: number | null;
  stepsTotal: number | null;
  waitingGateKind: string | null;
  needsYouDeadlineAt: string | null;
  latestReviewFindings: number | null;
  latestReviewMajors: number | null;
  lastRunFailed: boolean;
}): string {
  const v = args.headDraftN != null ? `v${args.headDraftN}` : null;
  let line: string;
  if (args.group === "needs_you") {
    const gate = args.waitingGateKind ? humanize(args.waitingGateKind) : "Waiting on you";
    const due = args.needsYouDeadlineAt ? ` · due ${args.needsYouDeadlineAt.slice(0, 10)}` : "";
    line = `${gate}${due}`;
  } else if (args.group === "running" && args.activeRun) {
    const wf = WORKFLOW_LABELS[args.activeRun.workflow ?? ""] ?? humanize(args.activeRun.workflow ?? "Run");
    const credits =
      args.activeRun.spentCredits != null && args.activeRun.capCredits != null
        ? ` · ${args.activeRun.spentCredits} / ${args.activeRun.capCredits} cr`
        : "";
    const steps =
      args.stepsTotal != null && args.stepsTotal > 0
        ? ` · ${args.stepsDone ?? 0}/${args.stepsTotal} steps`
        : "";
    line = `${wf}${v ? ` of ${v}` : ""} · ${args.activeRun.state}${steps}${credits}`;
  } else if (args.group === "ready_to_read") {
    const counts =
      args.latestReviewFindings != null
        ? ` · ${args.latestReviewFindings} findings${(args.latestReviewMajors ?? 0) > 0 ? `, ${args.latestReviewMajors} major` : ""}`
        : "";
    line = `Review${v ? ` of ${v}` : ""} ready${counts}`;
  } else {
    const failed = args.lastRunFailed ? " · last run failed" : "";
    line = `${args.state.pill}${v ? ` · ${v}` : ""}${failed}`;
  }
  return clampStatusLine(line);
}

/** Assemble the §6.3 state inputs for one project from its already-fetched row-sets (pure, testable). */
export function assembleProjectStateInput(args: {
  drafts: readonly { n: number; origin: string }[];
  reviews: readonly { draftN: number; letterOpenedAt?: string | Date | null }[];
  responses: readonly { reviewDraftN: number }[];
  runs: readonly { state: string }[];
  acceptedVersionN: number | null;
  archivedAt: string | Date | null;
  /** P1.04 — an `outline` artifact exists (the Upload-an-outline entry writes one). */
  outlinePresent?: boolean;
}): ProjectStateInput {
  return {
    outlinePresent: args.outlinePresent ?? false,
    versions: args.drafts.map((d) => ({ n: d.n, origin: d.origin })),
    reviews: args.reviews.map((r) => ({ draftN: r.draftN, letterOpenedAt: r.letterOpenedAt ?? null })),
    responses: args.responses.map((r) => ({ reviewDraftN: r.reviewDraftN })),
    runs: args.runs.map((r) => ({ state: r.state })),
    acceptedVersionN: args.acceptedVersionN,
    exports: [], // no export table yet (PRB.11)
    archivedAt: args.archivedAt,
    // chat omitted — no Assistant/chat yet (P1.11; defaults to zero turns)
  };
}

/**
 * List every project in the principal's workspace with its derived §6.3 state. Batched (no N+1): one query
 * per row-set over all the workspace's projects. Filters by `workspace_id` explicitly; the live deploy runs it
 * inside a `withTenant` transaction so RLS is the backstop.
 */
/** PRB.10 — the voice chips for every linked persona on the list, batched (3 queries, no N+1). Each
 *  persona's snapshot facts + current corpus + in-flight build → the ONE shared `deriveVoiceStatus`. */
async function loadVoiceChips(
  db: SqlClient,
  personaIds: readonly string[],
): Promise<Map<string, { name: string | null; status: VoiceStatus; currentProfileId: string | null }>> {
  const out = new Map<string, { name: string | null; status: VoiceStatus; currentProfileId: string | null }>();
  if (personaIds.length === 0) return out;

  interface PersonaDb {
    id: string;
    display_name: string | null;
    seed_sha256: string | null;
    current_profile_id: string | null;
  }
  const personas = (
    await db.query(
      `select id, display_name, seed_sha256, current_profile_id from personas where id = any($1::text[])`,
      [personaIds],
    )
  ).rows as PersonaDb[];
  // Latest profile per persona (current_profile_id wins when set) — LATERAL keeps it one query.
  interface ProfDb {
    persona_id: string;
    built_at: string | Date;
    tier: string | null;
    seed_sha256: string | null;
    sample_set: unknown;
    corpus_size_at_build: number | null;
    calibration_status: string | null;
  }
  const profRes = await db.query(
    `select p.id as persona_id, pp.* from personas p
       join lateral (
         select built_at, tier, seed_sha256, sample_set, corpus_size_at_build, calibration_status
           from persona_profiles where persona_id = p.id
          order by (id = p.current_profile_id) desc, built_at desc, id desc limit 1
       ) pp on true
      where p.id = any($1::text[])`,
    [personaIds],
  );
  const profileByPersona = new Map<string, ProfDb>();
  for (const r of profRes.rows as ProfDb[]) {
    profileByPersona.set(r.persona_id, r);
  }

  // Current included corpus per persona.
  interface ItemDb {
    persona_id: string;
    id: string;
    content_sha256: string;
    word_count: number | null;
  }
  const items = (
    await db.query(
      `select cn.persona_id, di.id, sv.content_sha256, sv.word_count
         from connections cn
         join discovered_items di on di.connection_id = cn.id
         join sample_versions sv on sv.id = di.current_sample_id
        where cn.persona_id = any($1::text[]) and di.state = 'included'`,
      [personaIds],
    )
  ).rows as ItemDb[];
  const corpusByPersona = new Map<string, { samples: Record<string, string>; words: number }>();
  for (const it of items) {
    const c = corpusByPersona.get(it.persona_id) ?? { samples: {}, words: 0 };
    c.samples[it.id] = it.content_sha256;
    c.words += it.word_count ?? 0;
    corpusByPersona.set(it.persona_id, c);
  }

  // In-flight build/refresh runs (latest per persona wins the "Building · phase N of M" chip).
  interface BuildDb {
    persona_id: string;
    tier: string | null;
    committed: string | number;
  }
  const builds = (
    await db.query(
      `select distinct on (r.persona_id) r.persona_id, r.inputs->>'tier' as tier,
              (select count(*) from steps s where s.run_id = r.id and s.state = 'done') as committed
         from runs r
        where r.persona_id = any($1::text[])
          and r.workflow in ('profile_voice','refresh_voice','calibrate_voice')
          and r.state = any($2::text[])
        order by r.persona_id, r.created_at desc`,
      [personaIds, ["created", "awaiting_consent", "queued", "provisioning", "running", "waiting_gate", "cancelling", "finalizing"]],
    )
  ).rows as BuildDb[];
  const buildByPersona = new Map<string, BuildDb>(builds.map((b) => [b.persona_id, b]));

  for (const persona of personas) {
    const prof = profileByPersona.get(persona.id);
    const snapshot: VoiceSnapshotFacts | null = prof
      ? {
          builtAt: prof.built_at,
          seedSha256: prof.seed_sha256,
          sampleSet: parseSampleSet(prof.sample_set),
          corpusWordsAtBuild: prof.corpus_size_at_build,
          calibrationStatus: prof.calibration_status,
          tier: prof.tier,
        }
      : null;
    const corpus = corpusByPersona.get(persona.id) ?? { samples: {}, words: 0 };
    const current: VoiceCurrentFacts = {
      seedSha256: persona.seed_sha256,
      samples: corpus.samples,
      corpusWords: corpus.words,
    };
    const b = buildByPersona.get(persona.id);
    const runInProgress: VoiceRunInProgress | null = b
      ? {
          ordinal: Math.min(Number(b.committed) + 1, personaPhaseCount(b.tier)),
          of: personaPhaseCount(b.tier),
        }
      : null;
    out.set(persona.id, {
      name: persona.display_name,
      status: deriveVoiceStatus({ snapshot, current, runInProgress }),
      currentProfileId: persona.current_profile_id,
    });
  }
  return out;
}

export async function listProjectStates(
  db: SqlClient,
  principal: Principal,
  opts?: { deletedOnly?: boolean },
): Promise<ProjectListRow[]> {
  // `deletedOnly` serves the 30-day restore window (§5.2 — soft delete): it flips the predicate so ONLY
  // the soft-deleted rows come back. The default list never sees them.
  const projRes = await db.query(
    `select id, slug, title, accepted_draft_id, archived_at, deleted_at, persona_id, persona_profile_snapshot_id,
            paper_theme, protocol_id, venue
       from projects where workspace_id = $1 and deleted_at is ${opts?.deletedOnly ? "not " : ""}null
       order by created_at desc, id`,
    [principal.workspaceId],
  );
  const projects = projRes.rows as ProjectRowDb[];
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);

  const draftsRes = await db.query(
    `select project_id, id, n, origin from drafts where project_id = any($1::text[])`,
    [ids],
  );
  const drafts = draftsRes.rows as DraftRowDb[];
  const draftNById = new Map(drafts.map((d) => [d.id, d.n]));

  // reviews / responses: join to the reviewed draft's ordinal (`n`) — the state function keys on version N.
  // P1.04 — the review also carries letter_opened_at (the Ready-to-read clearing signal).
  const reviewsRes = await db.query(
    `select ci.project_id, ci.id as correspondence_id, d.n as draft_n, ci.delivered_at, ci.letter_opened_at
       from correspondence_items ci join drafts d on d.id = ci.draft_id
      where ci.project_id = any($1::text[]) and ci.kind = 'review'`,
    [ids],
  );
  const reviews = reviewsRes.rows as {
    project_id: string;
    correspondence_id: string;
    draft_n: number;
    delivered_at: string | Date;
    letter_opened_at: string | Date | null;
  }[];

  const responsesRes = await db.query(
    `select resp.project_id, rd.n as review_draft_n
       from correspondence_items resp
       join correspondence_items rev on rev.id = resp.prior_review_id
       join drafts rd on rd.id = rev.draft_id
      where resp.project_id = any($1::text[]) and resp.kind = 'response'`,
    [ids],
  );
  const responses = responsesRes.rows as { project_id: string; review_draft_n: number }[];

  // P1.04 — outline presence feeds `outlinePresent` (the Upload-an-outline entry writes an artifact).
  const outlinesRes = await db.query(
    `select project_id from artifacts where project_id = any($1::text[]) and kind = 'outline'`,
    [ids],
  );
  const outlineProjects = new Set((outlinesRes.rows as { project_id: string }[]).map((r) => r.project_id));

  // P1.04 — runs also carry workflow + spend (the Running status line) and the failed marker.
  const runsRes = await db.query(
    `select project_id, id, state, workflow, spent_credits, cap_credits, created_at, ended_at
       from runs where project_id = any($1::text[])`,
    [ids],
  );
  const runs = runsRes.rows as {
    project_id: string;
    id: string;
    state: string;
    workflow: string | null;
    spent_credits: number | null;
    cap_credits: number | null;
    created_at: string | Date;
    ended_at: string | Date | null;
  }[];

  // P1.04 — the soonest unresolved blocking-gate deadline per waiting project (Needs-you ordering) and
  // the waiting gate's kind (the status line's "Approve triage · due …").
  const gatesRes = await db.query(
    `select r.project_id, g.kind, g.deadline_at
       from gates g join runs r on r.id = g.run_id
      where r.project_id = any($1::text[]) and r.state = 'waiting_gate'
        and g.resolved_at is null and g.blocking`,
    [ids],
  );
  const gates = gatesRes.rows as { project_id: string; kind: string; deadline_at: string | Date | null }[];

  // P1.04 — step progress for the Running status line ("3/5 steps").
  const stepsRes = await db.query(
    `select r.project_id, count(*)::int as total, count(*) filter (where s.state = 'done')::int as done
       from steps s join runs r on r.id = s.run_id
      where r.project_id = any($1::text[]) and r.state = any($2::text[])
      group by r.project_id, r.id`,
    [ids, [...NON_TERMINAL_RUN_STATES]],
  );
  const steps = stepsRes.rows as { project_id: string; total: number; done: number }[];

  // P1.04 — the latest review's finding counts for the Ready-to-read status line ("12 findings, 3 major").
  const findingsRes = await db.query(
    `select ci.project_id, ci.id as correspondence_id,
            count(*)::int as findings,
            count(*) filter (where f.severity in ('blocking','major'))::int as majors
       from findings f join correspondence_items ci on ci.id = f.correspondence_id
      where ci.project_id = any($1::text[]) and ci.kind = 'review'
      group by ci.project_id, ci.id`,
    [ids],
  );
  const findingsByCorrespondence = new Map(
    (findingsRes.rows as { correspondence_id: string; findings: number; majors: number }[]).map(
      (r) => [r.correspondence_id, r],
    ),
  );

  const byProject = <T extends { project_id: string }>(rows: readonly T[], id: string) =>
    rows.filter((r) => r.project_id === id);

  // PRB.10 — the voice chips for every linked persona (one batched read, same shared status function).
  const personaIds = [...new Set(projects.map((p) => p.persona_id).filter((x): x is string => x != null))];
  const chips = await loadVoiceChips(db, personaIds);

  return projects.map((p) => {
    const acceptedVersionN =
      p.accepted_draft_id != null ? draftNById.get(p.accepted_draft_id) ?? null : null;
    const projectReviews = byProject(reviews, p.id);
    // The latest review drives the letter-opened signal + the finding counts on the status line.
    const latestReview = projectReviews
      .slice()
      .sort((a, b) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime())[0];
    const letterOpened = latestReview?.letter_opened_at != null;
    const input = assembleProjectStateInput({
      drafts: byProject(drafts, p.id).map((d) => ({ n: d.n, origin: d.origin })),
      reviews: projectReviews.map((r) => ({ draftN: r.draft_n, letterOpenedAt: r.letter_opened_at })),
      responses: byProject(responses, p.id).map((r) => ({ reviewDraftN: r.review_draft_n })),
      runs: byProject(runs, p.id).map((r) => ({ state: r.state })),
      acceptedVersionN,
      archivedAt: p.archived_at,
      outlinePresent: outlineProjects.has(p.id),
    });
    const head = byProject(drafts, p.id).reduce<DraftRowDb | null>(
      (best, d) => (best == null || d.n > best.n ? d : best),
      null,
    );
    // PRB.21 — the project's non-terminal run (at most one — the create guard enforces it). Surfaced so
    // the run sheet can render "run in progress" + a link instead of a second Run affordance.
    const projectRuns = byProject(runs, p.id);
    const active = projectRuns
      .filter((r) => (NON_TERMINAL_RUN_STATES as readonly string[]).includes(r.state))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    // The latest TERMINAL run for the failed indicator (a failed/cancelled latest run shows red).
    const lastTerminal = projectRuns
      .filter((r) => !(NON_TERMINAL_RUN_STATES as readonly string[]).includes(r.state))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const lastRunFailed =
      active == null && lastTerminal != null && (lastTerminal.state === "failed" || lastTerminal.state === "cancelled");
    // Needs-you ordering + label: the soonest unresolved blocking-gate deadline + its kind.
    const projectGates = byProject(gates, p.id).sort(
      (a, b) =>
        (a.deadline_at == null ? Number.POSITIVE_INFINITY : new Date(a.deadline_at).getTime()) -
        (b.deadline_at == null ? Number.POSITIVE_INFINITY : new Date(b.deadline_at).getTime()),
    );
    const soonestGate = projectGates[0];
    const needsYouDeadlineAt = soonestGate?.deadline_at != null ? new Date(soonestGate.deadline_at).toISOString() : null;
    const projectSteps = byProject(steps, p.id)[0];
    const latestReviewFindings =
      latestReview != null ? findingsByCorrespondence.get(latestReview.correspondence_id)?.findings ?? null : null;
    const latestReviewMajors =
      latestReview != null ? findingsByCorrespondence.get(latestReview.correspondence_id)?.majors ?? null : null;
    const chip = p.persona_id != null ? chips.get(p.persona_id) : undefined;
    const usesOlderProfile =
      chip != null && p.persona_profile_snapshot_id != null && p.persona_profile_snapshot_id !== chip.currentProfileId;
    const state = projectState(input);
    const group = projectGroupKey({ state, letterOpened });
    const statusLine = buildStatusLine({
      group,
      state,
      headDraftN: head?.n ?? null,
      activeRun: active
        ? { state: active.state, workflow: active.workflow, spentCredits: active.spent_credits, capCredits: active.cap_credits }
        : null,
      stepsDone: projectSteps?.done ?? null,
      stepsTotal: projectSteps?.total ?? null,
      waitingGateKind: soonestGate?.kind ?? null,
      needsYouDeadlineAt,
      latestReviewFindings,
      latestReviewMajors,
      lastRunFailed,
    });
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      state,
      headDraftId: head?.id ?? null,
      headDraftN: head?.n ?? null,
      activeRun: active ? { runId: active.id, state: active.state, workflow: active.workflow } : null,
      voice: chip
        ? { personaId: p.persona_id as string, name: chip.name, status: chip.status, usesOlderProfile }
        : null,
      paperTheme: p.paper_theme,
      protocolId: p.protocol_id,
      venue: p.venue,
      archivedAt: p.archived_at != null ? new Date(p.archived_at).toISOString() : null,
      deletedAt: p.deleted_at != null ? new Date(p.deleted_at).toISOString() : null,
      lastRunFailed,
      needsYouDeadlineAt,
      letterOpened,
      statusLine,
      group,
    };
  });
}

export interface ShellApiDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  readonly db: SqlClient;
  /** The invite gate — mounts the public `POST /invite/check` used by the web signup gate (REQ-BETA-19). */
  readonly inviteGate?: InviteGate;
}

/** The beta shell's data routes: the project list (session-authed) + the public invite check. */
export function createShellRoutes(deps: ShellApiDeps): Hono {
  const app = new Hono();
  app.get("/projects", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    // `?scope=deleted` reads back the soft-deleted rows for the 30-day restore window (§5.2).
    const rows = await listProjectStates(deps.db, principal, {
      deletedOnly: c.req.query("scope") === "deleted",
    });
    return c.json({ projects: rows });
  });
  // Public: the web /login gate validates an invite BEFORE any auth request is made (no valid code ⇒ no
  // signup). This only reports validity for a code the caller supplies; it consumes nothing. NOTE: it is an
  // unauthenticated validity oracle — for the private, operator-issued, revocable beta codes that is an
  // accepted risk; a public launch adds rate-limiting / coarser reasons here (follow-up, tracked in the PRB.01
  // run ledger security note).
  if (deps.inviteGate) {
    const gate = deps.inviteGate;
    app.post("/invite/check", async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { code?: unknown; email?: unknown };
      const code = typeof body.code === "string" ? body.code : "";
      const email = typeof body.email === "string" ? body.email : undefined;
      return c.json(await gate.check(code, email));
    });
  }
  return app;
}
