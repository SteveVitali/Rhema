// Outline routes (P1.12; §7.3) — the promotion + the durable outline surface. Thin Hono adapters:
//   • `GET  /projects/:id/outline/promotion`  — the promotion sheet's facts (slug, sources the run
//     will copy, thread tokens / url count the estimate prices, the estimate itself).
//   • `POST /projects/:id/outline/promotions` — create the `outline` run (Assistant seat; the
//     promotion sheet's click is the consent — `sheetLaunched`).
//   • `GET  /projects/:id/outline`            — the editor DTO: the outline artifact's head, its
//     parsed `outline.json` twin, the provenance header, and the drafts that cite it.
//   • `PATCH /projects/:id/outline`           — the editor's autosave: a full structured document
//     or a `GateStructuredEdits` delta → one new content-addressed version pair (`.md` + `.json`).
//   • `DELETE /projects/:id/outline`          — refused while a draft cites the outline (§7.3's
//     deletion protection: the citation is the draft run's frozen `inputs.outlineArtifactId`).
//   • `POST /projects/:id/outline/gaps/:gap/answer` — a gap's Answer lands as a `user_typed` claim
//     row in the gap's section (the gate card's Answer affordance posts the same shape).
//
// Provenance is DATA (REQ-DATA-23): on a full-document save the server re-stamps every surviving
// claim's `provenance`/`unverified` from the prior version — the client can never strip a badge by
// rewriting the row.

import { Hono } from "hono";
import { persistHarvest, sha256Hex, type ContentStore, type NewVersion } from "@rhema/mirror";
import {
  MODEL_TIERS,
  RIGORS,
  CURRENT_RATE_TABLE_VERSION,
  capFromEstimate,
  outlineSidecarSchema,
  type ModelTier,
  type Rigor,
} from "@rhema/contracts";
import {
  createRun,
  phaseClassesForWorkflow,
  seatForWorkflow,
  RUN_JOBS,
} from "@rhema/orchestrator";
import type { OrchestratorDeps, SqlClient } from "@rhema/orchestrator";
import { estimatorSpec, estimateCredits, serializeOutline } from "@rhema/protocols";
import { listThreads, threadPaths, parseIndex, RESEARCH_ROOT, type ResearchIndexEntry } from "@rhema/assistant";
import { applyGateEdits, type GateStructuredEdits } from "@rhema/findings-core";
import type { Principal } from "./run-routes.js";
import { showcaseReadOnlyGuard } from "./showcase.js";

/** The outline surface's deps — the orchestrator bundle + session principal + tenant db + store. */
export interface OutlineApiDeps extends OrchestratorDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** tenant-scoped reads/writes outside txRunner (the other route files' `db`). */
  readonly db: SqlClient;
  /** the workspace-bound blob store the outline + research-note bytes live in. */
  readonly contentStore?: ContentStore;
}

const ASSISTANT_RESEARCH = RESEARCH_ROOT; // "agents/assistant/research/"
const AUTHOR_RESEARCH = "agents/author/research/";
const AUTHOR_OUTLINE = "agents/author/outline/";
const OUTLINE_PHASES = 4; // the manifest's phase count — the estimate's perPhase input.

type PromotionScope = "thread" | "turn" | "research";
const SCOPES = new Set<PromotionScope>(["thread", "turn", "research"]);

interface OutlineArtifactRow {
  id: string;
  mirror_path: string;
  head_version_id: string | null;
  ordinal: number | null;
  word_count: number | null;
  created_at: string | Date;
}

// -----------------------------------------------------------------------------------------------
// helpers

/** A project row (slug + lifecycle gates) for the CALLER'S tenant or null — SEC.1 explicit
 *  workspace predicate (RLS is the backstop, not the check). */
async function loadProject(deps: OutlineApiDeps, projectId: string, workspaceId: string) {
  return (
    ((await deps.db.query(
      `select id, slug, archived_at, deleted_at from projects where id = $1 and workspace_id = $2`,
      [projectId, workspaceId],
    ))
      .rows[0] as
      | { id: string; slug: string; archived_at: string | Date | null; deleted_at: string | Date | null }
      | undefined) ?? null
  );
}

/** The slug a promotion lands at — `<project-slug>` sanitized; an explicit body slug wins when it
 *  already matches the one-segment grammar (never a path). */
export function outlineSlug(projectSlug: string, requested?: unknown): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/^-+|-+$/g, "");
  if (typeof requested === "string" && /^[a-z0-9][a-z0-9-]{0,47}$/.test(requested)) return requested;
  return clean(projectSlug) || "outline";
}

/** Read a project-tree file's head bytes (utf8) — null when absent or no store is bound. */
async function readTextFile(
  deps: OutlineApiDeps,
  projectId: string,
  path: string,
): Promise<string | null> {
  if (!deps.contentStore) return null;
  const row = (
    await deps.db.query(
      `select av.content_sha256 from artifacts a
         join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path = $2`,
      [projectId, path],
    )
  ).rows[0] as { content_sha256: string } | undefined;
  if (!row) return null;
  const bytes = await deps.contentStore.get(row.content_sha256);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

/** The newest outline artifact in the project, or the one `slug` names. */
async function loadOutlineArtifact(
  deps: OutlineApiDeps,
  projectId: string,
  slug?: string,
): Promise<OutlineArtifactRow | null> {
  const rows = (
    await deps.db.query(
      `select a.id, a.mirror_path, a.head_version_id, av.ordinal, av.word_count, a.created_at
         from artifacts a left join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path like $2 and a.mirror_path like '%.md'
        order by a.created_at desc`,
      [projectId, `${AUTHOR_OUTLINE}%`],
    )
  ).rows as OutlineArtifactRow[];
  if (slug) return rows.find((r) => r.mirror_path === `${AUTHOR_OUTLINE}${slug}.md`) ?? null;
  return rows[0] ?? null;
}

/**
 * The promotion's frozen facts, computed once for the preview AND the create (the sheet shows
 * exactly what the run freezes — REQ-BILL-6's server-side estimate rule).
 */
async function promotionFacts(
  deps: OutlineApiDeps,
  projectId: string,
  args: { threadId?: string; scope: PromotionScope; turnId?: string; tier: ModelTier; rigor: Rigor; slug: string },
): Promise<
  | { ok: true; slug: string; scope: PromotionScope; threadId?: string; turnId?: string; sourceCopies: { src: string; dst: string }[]; urls: string[]; threadTokens: number; urlsRefetched: number; estimateCredits: number; capCredits: number; existing: boolean }
  | { ok: false; reason: "thread_not_found" | "turn_not_found" }
> {
  // The research index is the source-note roster the scope filters (a missing index = no sources).
  const index = parseIndex(await readTextFile(deps, projectId, `${ASSISTANT_RESEARCH}index.json`));

  let entries: ResearchIndexEntry[] = [];
  let messagePaths: string[] = [];
  if (args.scope === "research") {
    entries = index.entries;
  } else {
    // scope thread|turn requires a real thread row in THIS project.
    const threads = await listThreads(deps.db, projectId);
    const thread = threads.find((t) => t.id === args.threadId);
    if (!thread) return { ok: false, reason: "thread_not_found" };
    if (args.scope === "thread") {
      entries = index.entries.filter((e) => e.threadId === args.threadId);
      messagePaths = [`${threadPaths(args.threadId!).sessionDir}%`];
    } else {
      // turn scope: the turn id → its chat_turn run (the session file + the notes it produced).
      const run = (
        await deps.db.query(
          `select id from runs where project_id = $1 and workflow = 'chat_turn'
             and inputs->>'threadId' = $2 and inputs->>'turnId' = $3`,
          [projectId, args.threadId, args.turnId],
        )
      ).rows[0] as { id: string } | undefined;
      if (!run) return { ok: false, reason: "turn_not_found" };
      entries = index.entries.filter((e) => e.runId === run.id || (e.threadId === args.threadId && e.runId == null));
      messagePaths = [`${threadPaths(args.threadId!).sessionDir}${args.turnId}-%`];
    }
  }

  // The token estimate's word sum — scoped to the thread/turn's session files when there are any;
  // bind `$2` only when the SQL references it (an unused bind param is a protocol error).
  const wordRows = (
    await deps.db.query(
      messagePaths.length > 0
        ? `select coalesce(sum(av.word_count),0)::int as words from artifacts a
             join artifact_versions av on av.id = a.head_version_id
            where a.project_id = $1 and a.mirror_path like any($2::text[])`
        : `select 0::int as words`,
      messagePaths.length > 0 ? [projectId, messagePaths] : [],
    )
  ).rows[0] as { words: number };
  const noteWords = entries.reduce((a, e) => a + (e.words ?? 0), 0);
  // tokens ≈ words × 4/3 — the estimate's `thread_tokens` input (§12.2's 0.004/token term).
  const threadTokens = Math.ceil((wordRows.words + noteWords) * 4 / 3);

  const urls = [...new Set(entries.map((e) => e.url).filter((u): u is string => typeof u === "string" && u !== ""))];
  const sourceCopies = entries.map((e) => ({
    src: e.path,
    dst: `${AUTHOR_RESEARCH}${e.path.slice(ASSISTANT_RESEARCH.length)}`,
  }));

  const estimate = estimateCredits(
    estimatorSpec("outline")!,
    { threadTokens, urlsRefetched: urls.length, phases: OUTLINE_PHASES },
    { tier: args.tier, rigor: args.rigor },
  );
  const cap = capFromEstimate(estimate);
  const existing = (await loadOutlineArtifact(deps, projectId, args.slug)) != null;

  return {
    ok: true,
    slug: args.slug,
    scope: args.scope,
    ...(args.threadId != null ? { threadId: args.threadId } : {}),
    ...(args.turnId != null ? { turnId: args.turnId } : {}),
    sourceCopies,
    urls,
    threadTokens,
    urlsRefetched: urls.length,
    estimateCredits: estimate,
    capCredits: cap,
    existing,
  };
}

/** Re-stamp a claim row's provenance + unverified from the prior document (REQ-DATA-23): on a
 *  full-document save the client supplies text/order, never the markers — a claim id that survives
 *  keeps its badge; only the run's re-fetch can clear one. */
function preserveMarkers(next: Record<string, unknown>, prior: Record<string, unknown> | null): Record<string, unknown> {
  if (!prior) return next;
  const priorClaims = new Map<string, { provenance?: unknown; unverified?: unknown }>();
  const collect = (doc: Record<string, unknown>) => {
    for (const s of (doc["sections"] as { claims?: Record<string, unknown>[] }[] | undefined) ?? []) {
      for (const cl of s.claims ?? []) {
        if (typeof cl["id"] === "string") priorClaims.set(cl["id"] as string, cl);
      }
    }
  };
  collect(prior);
  const sections = ((next["sections"] as Record<string, unknown>[] | undefined) ?? []).map((s) => ({
    ...s,
    claims: ((s["claims"] as Record<string, unknown>[] | undefined) ?? []).map((cl) => {
      const p = typeof cl["id"] === "string" ? priorClaims.get(cl["id"] as string) : undefined;
      if (!p) return cl;
      return { ...cl, provenance: p["provenance"], unverified: p["unverified"] };
    }),
  }));
  // the provenance header (thread/run/urls) is run-authored — edits never rewrite it either.
  return { ...next, sections, ...(prior["provenance"] !== undefined ? { provenance: prior["provenance"] } : {}) };
}

/** Persist a post-edit outline document: validate → serialize the `.md` + `.json` pair →
 *  content-addressed versions authored by the actor. Runs inside the caller's transaction. */
async function persistOutlineDoc(
  tx: SqlClient,
  deps: OutlineApiDeps,
  args: {
    workspaceId: string;
    projectId: string;
    mdPath: string;
    doc: Record<string, unknown>;
    actor: { kind: "user"; userId: string } | { kind: "run"; runId: string };
  },
): Promise<{ ok: true; versionIds: string[] } | { ok: false; reason: "invalid_outline"; issues: unknown }> {
  const parsed = outlineSidecarSchema.safeParse(args.doc);
  if (!parsed.success) return { ok: false, reason: "invalid_outline", issues: parsed.error.issues };
  const { markdown, json } = serializeOutline(parsed.data);
  const store = deps.contentStore;
  if (!store) return { ok: false, reason: "invalid_outline", issues: "no store bound" };
  const jsonPath = args.mdPath.replace(/\.md$/, ".json");
  const versions: NewVersion[] = [
    {
      path: args.mdPath,
      root: "project",
      kind: "outline",
      namespace: "agent:author",
      sha256: sha256Hex(markdown),
      bytes: Buffer.from(markdown, "utf8"),
      wordCount: markdown.trim().split(/\s+/).filter(Boolean).length,
    },
    {
      path: jsonPath,
      root: "project",
      kind: "sidecar",
      namespace: "agent:author",
      sha256: sha256Hex(json),
      bytes: Buffer.from(json, "utf8"),
      wordCount: 0,
    },
  ];
  const persisted = await persistHarvest(tx, store, deps, {
    workspaceId: args.workspaceId,
    projectId: args.projectId,
    createdBy: args.actor,
  }, versions);
  return { ok: true, versionIds: persisted.map((p) => p.versionId) };
}

// -----------------------------------------------------------------------------------------------

export function createOutlineRoutes(deps: OutlineApiDeps): Hono {
  const app = new Hono();

  // P1.17 (§15.4) — outline writes on the Showcase dossier get 409 showcase_read_only.
  app.use("/projects/:id/*", showcaseReadOnlyGuard(deps.db));

  /** Shared project gate: authed + project alive + not archived (writes). */
  const gate = async (
    c: { req: { param(n: string): string | undefined; header(n: string): string | undefined }; json(b: unknown, s?: number): Response },
    write: boolean,
  ): Promise<{ principal: Principal; projectId: string; slug: string } | Response> => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id")!;
    const project = await loadProject(deps, projectId, principal.workspaceId);
    if (!project || project.deleted_at != null) return c.json({ error: "not_found" }, 404);
    if (write && project.archived_at != null) return c.json({ error: "project_archived" }, 409);
    return { principal, projectId, slug: project.slug };
  };

  // ---- the promotion sheet's facts (the web's /promote page renders these verbatim) ----
  app.get("/projects/:id/outline/promotion", async (c) => {
    const g = await gate(c, false);
    if (g instanceof Response) return g;
    const scope = (c.req.query("scope") ?? "thread") as PromotionScope;
    if (!SCOPES.has(scope)) return c.json({ error: "scope must be thread|turn|research" }, 422);
    const threadId = c.req.query("threadId");
    const turnId = c.req.query("turnId") ?? undefined;
    if (scope !== "research" && !threadId) return c.json({ error: "threadId required" }, 422);
    if (scope === "turn" && !turnId) return c.json({ error: "turnId required" }, 422);
    const tier: ModelTier = MODEL_TIERS.includes(c.req.query("tier") as ModelTier)
      ? (c.req.query("tier") as ModelTier)
      : "base";
    const rigor: Rigor = RIGORS.includes(c.req.query("rigor") as Rigor) ? (c.req.query("rigor") as Rigor) : "standard";
    const slug = outlineSlug(g.slug, c.req.query("slug"));
    const facts = await promotionFacts(deps, g.projectId, {
      ...(threadId ? { threadId } : {}),
      scope,
      ...(turnId ? { turnId } : {}),
      tier,
      rigor,
      slug,
    });
    if (!facts.ok) return c.json({ error: facts.reason }, 404);
    return c.json({
      slug: facts.slug,
      scope: facts.scope,
      ...(facts.threadId ? { threadId: facts.threadId } : {}),
      ...(facts.turnId ? { turnId: facts.turnId } : {}),
      sources: facts.sourceCopies.length,
      sourceCopies: facts.sourceCopies,
      urls: facts.urls,
      threadTokens: facts.threadTokens,
      urlsRefetched: facts.urlsRefetched,
      estimateCredits: facts.estimateCredits,
      capCredits: facts.capCredits,
      modelTier: tier,
      rigor,
      existing: facts.existing,
    });
  });

  // ---- create the promotion run (the sheet's Promote click — consent given at the sheet) ----
  app.post("/projects/:id/outline/promotions", async (c) => {
    const g = await gate(c, true);
    if (g instanceof Response) return g;
    const { principal, projectId, slug: projectSlug } = g;
    const body = (await c.req.json().catch(() => null)) as {
      threadId?: unknown;
      scope?: unknown;
      turnId?: unknown;
      modelTier?: unknown;
      rigor?: unknown;
      slug?: unknown;
      thesis?: unknown;
      venue?: unknown;
      targetLength?: unknown;
      protocol?: unknown;
      voice?: unknown;
      allowSearch?: unknown;
      urlPolicy?: unknown;
      idempotencyKey?: unknown;
    } | null;
    const scope = (typeof body?.scope === "string" ? body.scope : "thread") as PromotionScope;
    if (!SCOPES.has(scope)) return c.json({ error: "scope must be thread|turn|research" }, 422);
    const threadId = typeof body?.threadId === "string" && body.threadId ? body.threadId : undefined;
    const turnId = typeof body?.turnId === "string" && body.turnId ? body.turnId : undefined;
    if (scope !== "research" && !threadId) return c.json({ error: "threadId required" }, 422);
    if (scope === "turn" && !turnId) return c.json({ error: "turnId required" }, 422);
    const tier: ModelTier = MODEL_TIERS.includes(body?.modelTier as ModelTier)
      ? (body!.modelTier as ModelTier)
      : "base";
    const rigor: Rigor = RIGORS.includes(body?.rigor as Rigor) ? (body!.rigor as Rigor) : "standard";
    const slug = outlineSlug(projectSlug, body?.slug);

    const facts = await promotionFacts(deps, projectId, {
      ...(threadId ? { threadId } : {}),
      scope,
      ...(turnId ? { turnId } : {}),
      tier,
      rigor,
      slug,
    });
    if (!facts.ok) return c.json({ error: facts.reason }, 404);

    // The frozen inputs: the skill's declared args (thread_dir / promotion_scope / urls /
    // outline_path — SKILL.md frontmatter) + the server facts the pipeline needs (outlineSlug drives
    // every `<slug>` expansion; sourceCopies is the approval consequence's copy roster).
    const inputs: Record<string, unknown> = {
      threadId: threadId ?? null,
      scope,
      ...(turnId ? { turnId } : {}),
      outlineSlug: slug,
      sourceCopies: facts.sourceCopies,
      thread_dir: threadId ? threadPaths(threadId).dir : ASSISTANT_RESEARCH.replace(/\/$/, ""),
      promotion_scope: scope === "research" ? "thread" : scope, // the skill's scope enum is thread|turn
      ...(turnId ? { turn: turnId } : {}),
      urls: facts.urls.join(","),
      outline_path: `${AUTHOR_OUTLINE}${slug}.md`,
      modelTier: tier,
      ...(typeof body?.thesis === "string" && body.thesis.trim() ? { thesis: body.thesis.trim() } : {}),
      ...(typeof body?.venue === "string" && body.venue.trim() ? { venue: body.venue.trim() } : {}),
      ...(typeof body?.targetLength === "number" && body.targetLength > 0 ? { target_length: body.targetLength } : {}),
      ...(typeof body?.protocol === "string" && body.protocol.trim() ? { protocol: body.protocol.trim() } : {}),
      ...(typeof body?.voice === "string" && body.voice.trim() ? { voice: body.voice.trim() } : {}),
      ...(body?.allowSearch === true ? { allow_search: true } : {}),
    };
    if (body?.urlPolicy && typeof body.urlPolicy === "object" && !Array.isArray(body.urlPolicy)) {
      inputs.urlPolicy = body.urlPolicy;
    }

    const res = await createRun(deps, {
      idempotencyKey:
        typeof body?.idempotencyKey === "string" && body.idempotencyKey
          ? body.idempotencyKey
          : `outline:${projectId}:${slug}:${scope}:${turnId ?? ""}`,
      workflow: "outline",
      workspaceId: principal.workspaceId,
      billingAccountId: principal.billingAccountId,
      requestedBy: principal.userId,
      projectId,
      seat: seatForWorkflow("outline"),
      modelProfile: { tier },
      modelTier: tier,
      rigor,
      estimateCredits: facts.estimateCredits,
      capCredits: facts.capCredits,
      rateTableVersion: CURRENT_RATE_TABLE_VERSION,
      phaseClassesUsed: phaseClassesForWorkflow("outline"),
      inputs,
      inputSnapshot: {
        scope,
        ...(threadId ? { threadId } : {}),
        outlineSlug: slug,
        sourceCount: facts.sourceCopies.length,
        threadTokens: facts.threadTokens,
        urlsRefetched: facts.urlsRefetched,
      },
      sheetLaunched: true, // the promotion sheet's Promote click is the consent
      lockSetSpec: { projectId },
    });
    if (!res.ok) {
      if (res.reason === "run_in_progress")
        return c.json({ error: res.reason, runId: res.activeRunId }, 409);
      if (res.reason === "insufficient_balance")
        return c.json({ error: res.reason, required: res.required }, 402);
      if (res.reason === "account_suspended") return c.json({ error: res.reason }, 403);
      return c.json({ error: res.reason }, 422);
    }
    if (!res.deduped && res.state === "queued") {
      await deps.queue
        .send(RUN_JOBS.start, { runId: res.runId, workspaceId: principal.workspaceId }, { singletonKey: res.runId })
        .catch(() => undefined);
    }
    return c.json({ runId: res.runId, state: res.state, deduped: res.deduped, slug }, 201);
  });

  // ---- the editor DTO: head artifact + parsed sidecar + the drafts that cite it ----
  app.get("/projects/:id/outline", async (c) => {
    const g = await gate(c, false);
    if (g instanceof Response) return g;
    const slug = c.req.query("slug") ?? undefined;
    const art = await loadOutlineArtifact(deps, g.projectId, slug);
    if (!art) return c.json({ error: "not_found" }, 404);
    const markdown = (await readTextFile(deps, g.projectId, art.mirror_path)) ?? "";
    const jsonPath = art.mirror_path.replace(/\.md$/, ".json");
    const raw = await readTextFile(deps, g.projectId, jsonPath);
    let outline: unknown = null;
    if (raw) {
      try {
        const parsed = outlineSidecarSchema.safeParse(JSON.parse(raw));
        outline = parsed.success ? parsed.data : null;
      } catch {
        outline = null;
      }
    }
    // the citation set (§7.3's deletion protection): every draft run frozen against this artifact.
    const citing = (
      await deps.db.query(
        `select id, inputs->>'nextDraftId' as draft_id, state from runs
          where project_id = $1 and workflow = 'draft' and inputs->>'outlineArtifactId' = $2`,
        [g.projectId, art.id],
      )
    ).rows as { id: string; draft_id: string | null; state: string }[];
    return c.json({
      artifactId: art.id,
      slug: art.mirror_path.slice(AUTHOR_OUTLINE.length).replace(/\.md$/, ""),
      mirrorPath: art.mirror_path,
      versionId: art.head_version_id,
      ordinal: art.ordinal,
      words: art.word_count,
      markdown,
      outline,
      citedBy: {
        runs: citing.map((r) => r.id),
        draftIds: citing.map((r) => r.draft_id).filter((d): d is string => typeof d === "string"),
      },
      editable: true,
    });
  });

  // ---- the autosave path: full document or a structured delta → one new version pair ----
  app.patch("/projects/:id/outline", async (c) => {
    const g = await gate(c, true);
    if (g instanceof Response) return g;
    const { principal, projectId } = g;
    const body = (await c.req.json().catch(() => null)) as {
      slug?: unknown;
      outline?: unknown;
      edit?: GateStructuredEdits;
    } | null;
    const slug = typeof body?.slug === "string" ? body.slug : undefined;
    const art = await loadOutlineArtifact(deps, projectId, slug);
    if (!art) return c.json({ error: "not_found" }, 404);
    const jsonPath = art.mirror_path.replace(/\.md$/, ".json");
    const raw = await readTextFile(deps, projectId, jsonPath);
    let prior: Record<string, unknown> | null = null;
    if (raw) {
      try {
        prior = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        prior = null;
      }
    }

    let next: Record<string, unknown>;
    if (body?.outline != null && typeof body.outline === "object" && !Array.isArray(body.outline)) {
      // full-document save — the markers re-stamp server-side (the client can't strip a badge).
      next = preserveMarkers(body.outline as Record<string, unknown>, prior);
    } else if (body?.edit != null) {
      const applied = applyGateEdits("approve_outline", prior, body.edit);
      if (applied.rows === undefined) return c.json({ error: "edit produced no rows" }, 422);
      next = applied.rows as Record<string, unknown>;
    } else {
      return c.json({ error: "outline or edit required" }, 422);
    }

    const out = await deps.txRunner.run(principal.workspaceId, (tx) =>
      persistOutlineDoc(tx, deps, {
        workspaceId: principal.workspaceId,
        projectId,
        mdPath: art.mirror_path,
        doc: next,
        actor: { kind: "user", userId: principal.userId },
      }),
    );
    if (!out.ok) return c.json({ error: out.reason, issues: out.issues }, 422);
    const head = await loadOutlineArtifact(deps, projectId, slug);
    return c.json({ ok: true, versionIds: out.versionIds, versionId: head?.head_version_id ?? null, ordinal: head?.ordinal ?? null });
  });

  // ---- deletion protection (§7.3): a cited outline never deletes ----
  app.delete("/projects/:id/outline", async (c) => {
    const g = await gate(c, true);
    if (g instanceof Response) return g;
    const slug = c.req.query("slug") ?? undefined;
    const art = await loadOutlineArtifact(deps, g.projectId, slug);
    if (!art) return c.json({ error: "not_found" }, 404);
    const citing = (
      await deps.db.query(
        `select id from runs where project_id = $1 and workflow = 'draft' and inputs->>'outlineArtifactId' = $2 limit 1`,
        [g.projectId, art.id],
      )
    ).rows[0] as { id: string } | undefined;
    if (citing) return c.json({ error: "outline_cited", runId: citing.id }, 409);
    // uncited: remove the artifact pair + every version (the content store's blobs are
    // content-addressed — shared objects stay; the ROWS are the artifact).
    const jsonPath = art.mirror_path.replace(/\.md$/, ".json");
    await deps.db.query(
      `delete from artifact_versions where artifact_id in
         (select id from artifacts where project_id = $1 and mirror_path in ($2, $3))`,
      [g.projectId, art.mirror_path, jsonPath],
    );
    await deps.db.query(
      `delete from artifacts where project_id = $1 and mirror_path in ($2, $3)`,
      [g.projectId, art.mirror_path, jsonPath],
    );
    return c.json({ ok: true });
  });

  // ---- a gap's Answer → a `user_typed` claim in the gap's section (the card posts the same) ----
  app.post("/projects/:id/outline/gaps/:gapId/answer", async (c) => {
    const g = await gate(c, true);
    if (g instanceof Response) return g;
    const { principal, projectId } = g;
    const gapId = c.req.param("gapId");
    const body = (await c.req.json().catch(() => null)) as { text?: unknown; slug?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return c.json({ error: "text required" }, 422);
    const slug = typeof body?.slug === "string" ? body.slug : undefined;
    const art = await loadOutlineArtifact(deps, projectId, slug);
    if (!art) return c.json({ error: "not_found" }, 404);
    const raw = await readTextFile(deps, projectId, art.mirror_path.replace(/\.md$/, ".json"));
    let prior: Record<string, unknown> | null = null;
    if (raw) {
      try {
        prior = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        prior = null;
      }
    }
    if (!prior) return c.json({ error: "outline_sidecar_missing" }, 409);
    const gaps = (prior["gaps"] as { id?: string }[] | undefined) ?? [];
    if (!gaps.some((x) => x.id === gapId)) return c.json({ error: "gap_not_found" }, 404);
    // the answer lands as a `user_typed` claim in the gap's named section (else the last); the gap
    // resolves — the shared apply is the same code the gate card's Answer affordance rides.
    const applied = applyGateEdits("approve_outline", prior, {
      gapAnswers: [{ gapId, text }],
    });
    const next = applied.rows as Record<string, unknown>;
    const out = await deps.txRunner.run(principal.workspaceId, (tx) =>
      persistOutlineDoc(tx, deps, {
        workspaceId: principal.workspaceId,
        projectId,
        mdPath: art.mirror_path,
        doc: next,
        actor: { kind: "user", userId: principal.userId },
      }),
    );
    if (!out.ok) return c.json({ error: out.reason, issues: out.issues }, 422);
    return c.json({ ok: true, versionIds: out.versionIds });
  });

  return app;
}
