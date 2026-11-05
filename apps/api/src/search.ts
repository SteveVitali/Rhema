import { Hono } from "hono";
import type {
  WorkspaceSearchGroups,
  WorkspaceSearchHit,
  WorkspaceSearchResponse,
} from "@rhema/contracts";
import type { Principal } from "./run-routes.js";
import type { SqlClient } from "./invite.js";

// P1.04 — the §5.2/§11.4 server-side search index (`project_search_docs`, migration 0029). One row per
// indexed document: ('project','') = title + venue + linked Voice name; ('draft', draftId) = the draft's
// materialized canonical markdown; ('letter', correspondenceId) = the delivered letter's text. Writes
// happen on the content write paths (project create/rename/voice/venue, import create, autosave) and the
// search handler self-heals the per-project rows (title/voice/venue freshness is never stale).

/** Compose the indexed `project` document body from the row's searchable fields. */
export function projectDocBody(args: { title: string; venue: string | null; voiceName: string | null }): string {
  return [args.title, args.venue ?? "", args.voiceName ?? ""].filter((s) => s.length > 0).join("\n");
}

/**
 * Upsert one search doc. `refId` is '' for the project doc, the draft id for drafts, the correspondence
 * id for letters. Non-fatal by contract: callers wrap writes that must never fail (save, import).
 */
export async function upsertProjectSearchDoc(
  db: SqlClient,
  args: {
    projectId: string;
    workspaceId: string;
    kind: "project" | "draft" | "letter";
    refId: string;
    body: string;
    id: () => string;
  },
): Promise<void> {
  await db.query(
    `insert into project_search_docs (id, project_id, workspace_id, kind, ref_id, body, updated_at)
       values ($1,$2,$3,$4,$5,$6, now())
       on conflict (project_id, kind, ref_id)
       do update set body = excluded.body, updated_at = excluded.updated_at`,
    [args.id(), args.projectId, args.workspaceId, args.kind, args.refId, args.body],
  );
}

/**
 * Refresh a project's `('project','')` doc (title + venue + linked Voice name). Called on project
 * create/rename/voice/venue writes AND inside the search handler so a never-indexed or renamed project
 * still matches by title/voice/venue.
 */
export async function indexProjectDoc(
  db: SqlClient,
  args: { projectId: string; workspaceId: string; id: () => string },
): Promise<void> {
  const row = (
    await db.query(
      `select p.title, p.venue, pe.display_name as voice_name
         from projects p left join personas pe on pe.id = p.persona_id
        where p.id = $1`,
      [args.projectId],
    )
  ).rows[0] as { title: string; venue: string | null; voice_name: string | null } | undefined;
  if (!row) return;
  await upsertProjectSearchDoc(db, {
    projectId: args.projectId,
    workspaceId: args.workspaceId,
    kind: "project",
    refId: "",
    body: projectDocBody({ title: row.title, venue: row.venue, voiceName: row.voice_name }),
    id: args.id,
  });
}

export interface SearchApiDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  readonly db: SqlClient;
  readonly ids: () => string;
}

export interface ProjectSearchHit {
  readonly projectId: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: "project" | "draft" | "letter";
  readonly snippet: string;
  /** P1.06 — the doc's ref ('' project · draft id · correspondence id) so a palette hit deep-links. */
  readonly refId?: string;
}

interface SearchDocRow {
  readonly project_id: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: "project" | "draft" | "letter";
  readonly ref_id: string;
  readonly snippet: string;
  readonly draft_n: number | null;
}

/**
 * The shared indexed-doc read `/projects/search` and `GET /search` both run (R7SHELL.1c): the
 * self-heal refresh of every `('project','')` doc (title/voice/venue freshness is never stale)
 * then the tsvector match over `project_search_docs`, ALWAYS pinned to `d.workspace_id = $1`
 * inside the request's `withTenant` scope (RLS backstops the predicate — REQ-SPEC-30). Deleted
 * and archived projects never hit; the draft ordinal joins so a draft hit deep-links `/v/:n`.
 */
async function queryProjectSearchDocs(
  db: SqlClient,
  args: { workspaceId: string; q: string; projectId: string | null },
): Promise<SearchDocRow[]> {
  await db.query(
    `insert into project_search_docs (id, project_id, workspace_id, kind, ref_id, body)
       select 'psd_' || p.id, p.id, p.workspace_id, 'project', '',
              p.title || E'\n' || coalesce(p.venue,'') || E'\n' || coalesce(pe.display_name,'')
         from projects p left join personas pe on pe.id = p.persona_id
        where p.workspace_id = $1 and p.deleted_at is null
     on conflict (project_id, kind, ref_id)
     do update set body = excluded.body, updated_at = now()`,
    [args.workspaceId],
  );
  const res = await db.query(
    `select d.project_id, p.slug, p.title, d.kind, d.ref_id,
            dr.n as draft_n,
            ts_headline('english', d.body, websearch_to_tsquery('english', $2),
                        'MaxWords=24, MinWords=8, ShortWord=2, MaxFragments=1') as snippet
       from project_search_docs d join projects p on p.id = d.project_id
       left join drafts dr on dr.id = d.ref_id and d.kind = 'draft'
      where d.workspace_id = $1 and p.deleted_at is null and p.archived_at is null
        and d.fts @@ websearch_to_tsquery('english', $2)
        and ($3::text is null or d.project_id = $3)
      order by ts_rank(d.fts, websearch_to_tsquery('english', $2)) desc, d.updated_at desc
      limit 50`,
    [args.workspaceId, args.q, args.projectId],
  );
  return res.rows as SearchDocRow[];
}

/**
 * `GET /projects/search?q=` — matches title, linked Voice name, venue, and text inside drafts and
 * delivered letters via the `project_search_docs` tsvector index (§5.2: "Search title, Voice, venue, and
 * materialized markdown/body"). Tenant-scoped (the scoped db + the row's workspace check); deleted and
 * archived rows are excluded from hits. The ⌘K palette stays P1.06's — this is the interim endpoint.
 *
 * R7SHELL.1c (REQ-SHELL-7) — `GET /search?q=&project=` is the global palette's workspace read:
 * the same indexed docs GROUPED by kind plus Voices matched by display name, always inside the
 * `withTenant`-scoped `deps.db` with the explicit workspace predicate (gotcha 2; the two-tenant
 * probe's query-bearing leg covers it). `?project=<id>` narrows every group to one project
 * (the palette's project scope); a project's linked Voice is the only voice hit under a scope.
 */
export function createSearchRoutes(deps: SearchApiDeps): Hono {
  const app = new Hono();

  app.get("/projects/search", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const q = (c.req.query("q") ?? "").trim();
    if (q.length === 0) return c.json({ results: [] });
    // P1.06 — the ⌘K palette's "Go to" section narrows hits to the open project (`?project=<id>`);
    // unset keeps the workspace-wide §5.2 behavior unchanged.
    const projectFilter = c.req.query("project") ?? null;
    const rows = await queryProjectSearchDocs(deps.db, {
      workspaceId: principal.workspaceId,
      q,
      projectId: projectFilter,
    });
    const results: ProjectSearchHit[] = rows.map((r) => ({
      projectId: r.project_id,
      slug: r.slug,
      title: r.title,
      kind: r.kind,
      snippet: r.snippet,
      ...(r.ref_id ? { refId: r.ref_id } : {}),
    }));
    return c.json({ results });
  });

  app.get("/search", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const q = (c.req.query("q") ?? "").trim();
    const empty: WorkspaceSearchResponse = {
      results: { projects: [], drafts: [], letters: [], voices: [] },
    };
    if (q.length === 0) return c.json(empty);
    const projectFilter = c.req.query("project") ?? null;
    const rows = await queryProjectSearchDocs(deps.db, {
      workspaceId: principal.workspaceId,
      q,
      projectId: projectFilter,
    });
    const hit = (r: SearchDocRow): WorkspaceSearchHit => ({
      kind: r.kind,
      label: r.title,
      snippet: r.snippet,
      projectId: r.project_id,
      projectSlug: r.slug,
      ...(r.ref_id ? { refId: r.ref_id } : {}),
      ...(r.kind === "draft" && r.draft_n != null ? { draftN: r.draft_n } : {}),
    });
    // Voices are matched by name (the index intentionally has no voice docs — index changes are
    // a separate decision). Under a project scope only the project's LINKED Voice can hit.
    const voices = await deps.db.query(
      `select pe.id, pe.display_name
         from personas pe
        where pe.workspace_id = $1 and pe.display_name ilike '%' || $2 || '%'
          and ($3::text is null or pe.id = (select persona_id from projects where id = $3))
        order by pe.display_name
        limit 20`,
      [principal.workspaceId, q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_"), projectFilter],
    );
    const groups: WorkspaceSearchGroups = {
      projects: rows.filter((r) => r.kind === "project").map(hit),
      drafts: rows.filter((r) => r.kind === "draft").map(hit),
      letters: rows.filter((r) => r.kind === "letter").map(hit),
      voices: (voices.rows as { id: string; display_name: string | null }[]).map((v) => ({
        kind: "voice" as const,
        label: v.display_name ?? "Voice",
        personaId: v.id,
      })),
    };
    return c.json({ results: groups } satisfies WorkspaceSearchResponse);
  });

  return app;
}
