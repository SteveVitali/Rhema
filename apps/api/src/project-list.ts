import { Hono } from "hono";
import { projectState } from "@rhema/orchestrator";
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

// The beta project list (PRB.01; REQ-PROD-9 / REQ-SPEC-3). Each row's pill + primary action is DERIVED from
// the §6.3 state function — the project table stores no `status` column. This module reads the project's
// row-sets (drafts, review/response correspondence, runs, the accepted version, archive flag), assembles the
// pure `ProjectStateInput`, and returns `projectState(input)` per project. Export/outline/chat inputs are
// empty in the beta (no export table, no outline editor, no Assistant) — those surfaces arrive later.

export interface ProjectListRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly state: ProjectState;
  /** The highest-n draft head — the source editor's entry point (PRB.07). Null only for a draft-less row. */
  readonly headDraftId: string | null;
  /**
   * PRB.10 — the linked voice's chip (§9.6): the persona + the ONE shared status pill, derived at read
   * time from the same assembler every surface uses. Null for a project with no voice linked (ad-hoc).
   */
  readonly voice: { readonly personaId: string; readonly name: string | null; readonly status: VoiceStatus } | null;
}

interface ProjectRowDb {
  id: string;
  slug: string;
  title: string;
  accepted_draft_id: string | null;
  archived_at: string | Date | null;
  persona_id: string | null;
}
interface DraftRowDb {
  project_id: string;
  id: string;
  n: number;
  origin: string;
}

/** Assemble the §6.3 state inputs for one project from its already-fetched row-sets (pure, testable). */
export function assembleProjectStateInput(args: {
  drafts: readonly { n: number; origin: string }[];
  reviews: readonly { draftN: number }[];
  responses: readonly { reviewDraftN: number }[];
  runs: readonly { state: string }[];
  acceptedVersionN: number | null;
  archivedAt: string | Date | null;
}): ProjectStateInput {
  return {
    outlinePresent: false, // no outline editor in the beta
    versions: args.drafts.map((d) => ({ n: d.n, origin: d.origin })),
    reviews: args.reviews.map((r) => ({ draftN: r.draftN })), // letterOpenedAt is a client read-signal (unset here)
    responses: args.responses.map((r) => ({ reviewDraftN: r.reviewDraftN })),
    runs: args.runs.map((r) => ({ state: r.state })),
    acceptedVersionN: args.acceptedVersionN,
    exports: [], // no export table yet (PRB.11)
    archivedAt: args.archivedAt,
    // chat omitted — no Assistant/chat in the beta (defaults to zero turns)
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
): Promise<Map<string, { name: string | null; status: VoiceStatus }>> {
  const out = new Map<string, { name: string | null; status: VoiceStatus }>();
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
    });
  }
  return out;
}

export async function listProjectStates(db: SqlClient, principal: Principal): Promise<ProjectListRow[]> {
  const projRes = await db.query(
    `select id, slug, title, accepted_draft_id, archived_at, persona_id
       from projects where workspace_id = $1 order by created_at desc, id`,
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
  const reviewsRes = await db.query(
    `select ci.project_id, d.n as draft_n
       from correspondence_items ci join drafts d on d.id = ci.draft_id
      where ci.project_id = any($1::text[]) and ci.kind = 'review'`,
    [ids],
  );
  const reviews = reviewsRes.rows as { project_id: string; draft_n: number }[];

  const responsesRes = await db.query(
    `select resp.project_id, rd.n as review_draft_n
       from correspondence_items resp
       join correspondence_items rev on rev.id = resp.prior_review_id
       join drafts rd on rd.id = rev.draft_id
      where resp.project_id = any($1::text[]) and resp.kind = 'response'`,
    [ids],
  );
  const responses = responsesRes.rows as { project_id: string; review_draft_n: number }[];

  const runsRes = await db.query(
    `select project_id, state from runs where project_id = any($1::text[])`,
    [ids],
  );
  const runs = runsRes.rows as { project_id: string; state: string }[];

  const byProject = <T extends { project_id: string }>(rows: readonly T[], id: string) =>
    rows.filter((r) => r.project_id === id);

  // PRB.10 — the voice chips for every linked persona (one batched read, same shared status function).
  const personaIds = [...new Set(projects.map((p) => p.persona_id).filter((x): x is string => x != null))];
  const chips = await loadVoiceChips(db, personaIds);

  return projects.map((p) => {
    const acceptedVersionN =
      p.accepted_draft_id != null ? draftNById.get(p.accepted_draft_id) ?? null : null;
    const input = assembleProjectStateInput({
      drafts: byProject(drafts, p.id).map((d) => ({ n: d.n, origin: d.origin })),
      reviews: byProject(reviews, p.id).map((r) => ({ draftN: r.draft_n })),
      responses: byProject(responses, p.id).map((r) => ({ reviewDraftN: r.review_draft_n })),
      runs: byProject(runs, p.id).map((r) => ({ state: r.state })),
      acceptedVersionN,
      archivedAt: p.archived_at,
    });
    const head = byProject(drafts, p.id).reduce<DraftRowDb | null>(
      (best, d) => (best == null || d.n > best.n ? d : best),
      null,
    );
    const chip = p.persona_id != null ? chips.get(p.persona_id) : undefined;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      state: projectState(input),
      headDraftId: head?.id ?? null,
      voice: chip ? { personaId: p.persona_id as string, name: chip.name, status: chip.status } : null,
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
    const rows = await listProjectStates(deps.db, principal);
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
