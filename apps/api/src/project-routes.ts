import { Hono } from "hono";
import { buildEstimate } from "@rhema/run-sheet";
import { parseQuarantineKey, parseUserPrefs } from "@rhema/contracts";
import { PROTOCOL_CARDS, defaultProtocolId } from "@rhema/protocols";
import { recordAnalyticsEvent } from "@rhema/ledger";
import type { ContentStore } from "@rhema/mirror";
import type { Principal } from "./run-routes.js";
import type { SqlClient } from "./invite.js";
import type { Converter } from "./import.js";
import { createImportedDraft, createOutlineArtifact } from "./import.js";
import { indexProjectDoc, upsertProjectSearchDoc } from "./search.js";
import { isShowcaseProject } from "./showcase.js";

// P1.04 — the §5.2/§5.3 project-home routes: `POST /projects` (the three-entry create — scratch /
// upload-an-outline / upload-a-draft — adopting the quarantined conversion the workspace-scoped preview
// produced), the row actions (rename / duplicate / archive / restore / delete), the per-user grouping
// preference, and the protocol-card read. No route ever writes a lifecycle `status`/`state` column —
// archived_at/deleted_at are visibility markers, and every row's state re-derives through projectState.

const ENTRIES = new Set(["scratch", "outline", "draft"]);
const GROUPINGS = new Set(["attention", "voice"]);
const TITLE_MAX = 200;

export interface ProjectApiDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  readonly db: SqlClient;
  readonly txRunner: { run<T>(workspaceId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> };
  readonly ids: () => string;
  readonly clock: { now(): Date };
  /** the convert seam + byte store — required for the upload entries + the apparatus probe. */
  readonly converter?: Converter;
  readonly contentStore?: ContentStore;
}

/** title → slug (lowercase, hyphenated, ≤60 chars) — matches the seed's slug shape. */
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "untitled";
}

/** Pick a workspace-unique slug for `title` (appends -2, -3, … on collision). */
async function uniqueSlug(db: SqlClient, workspaceId: string, title: string): Promise<string> {
  const base = slugify(title);
  const res = await db.query(`select slug from projects where workspace_id = $1 and slug like $2`, [
    workspaceId,
    `${base}%`,
  ]);
  const taken = new Set((res.rows as { slug: string }[]).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * REQ-GENRE-4's apparatus probe: read the linked Voice's `structure_repertoire` artifact head and look
 * for `apparatus: full`. Best-effort — a missing artifact/store answers null (the sheet asks once).
 */
async function readStructureRepertoire(
  db: SqlClient,
  store: ContentStore | undefined,
  personaId: string,
): Promise<string | null> {
  if (!store) return null;
  const row = (
    await db.query(
      `select av.content_sha256 from artifacts a
         join artifact_versions av on av.id = a.head_version_id
        where a.persona_id = $1 and a.kind = 'structure_repertoire'`,
      [personaId],
    )
  ).rows[0] as { content_sha256: string } | undefined;
  if (!row?.content_sha256) return null;
  const bytes = await store.get(row.content_sha256).catch(() => null);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

export function createProjectRoutes(deps: ProjectApiDeps): Hono {
  const app = new Hono();

  // ---- GET /protocols — the four §5.3 protocol cards. The card's "typical cost band" is COMPUTED by
  // the estimator (a Standard/Balanced Review over the card's typical length) — never a hand-typed price.
  app.get("/protocols", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const protocols = PROTOCOL_CARDS.map((card) => {
      let typicalReviewCredits: number | undefined;
      try {
        typicalReviewCredits = buildEstimate({
          workflow: "review",
          rigor: "standard",
          modelTier: "balanced",
          inputs: { words: card.typicalWords },
        }).estimateCredits;
      } catch {
        typicalReviewCredits = undefined; // a card without a priced band still renders
      }
      return { ...card, typicalReviewCredits };
    });
    return c.json({ protocols });
  });

  // ---- POST /projects — the §5.3 create. `entry` picks the path: 'scratch' (empty project), 'outline'
  // (the conversion becomes the outline artifact → lands `outlined`), 'draft' (the conversion becomes
  // Draft vN — `startVersion` for REQ-PROD-8 labels). Uploads reuse the preview's quarantined result.
  app.post("/projects", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: unknown;
      entry?: unknown;
      protocolId?: unknown;
      venue?: unknown;
      personaId?: unknown;
      startVersion?: unknown;
      quarantineKey?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) : "";
    if (!title) return c.json({ error: "title required" }, 422);
    const entry = typeof body.entry === "string" && ENTRIES.has(body.entry) ? body.entry : null;
    if (!entry) return c.json({ error: "entry must be 'scratch' | 'outline' | 'draft'" }, 422);
    const personaId = typeof body.personaId === "string" ? body.personaId : null;
    const venue = typeof body.venue === "string" && body.venue.trim() ? body.venue.trim() : null;
    let protocolId = typeof body.protocolId === "string" ? body.protocolId : null;
    if (personaId) {
      const persona = await deps.db.query(`select id from personas where id = $1`, [personaId]);
      if (persona.rows.length === 0) return c.json({ error: "persona_not_found" }, 400);
    }

    // REQ-GENRE-4 — the default rule runs server-side too: Essay for Unfiled; Academic when the linked
    // Voice's structure repertoire records apparatus:full; otherwise the sheet was asked (null stays).
    if (personaId) {
      const repertoire = await readStructureRepertoire(deps.db, deps.contentStore, personaId);
      if (protocolId == null) protocolId = defaultProtocolId({ personaId, structureRepertoire: repertoire });
    } else if (protocolId == null) {
      protocolId = "essay";
    }

    // Upload entries need the quarantined conversion (preview is free — the SAME converted_result row).
    let result = null;
    if (entry !== "scratch") {
      const parsed = parseQuarantineKey(body.quarantineKey);
      if (!parsed) return c.json({ error: "quarantineKey required" }, 400);
      if (parsed.workspaceId !== principal.workspaceId) return c.json({ error: "forbidden" }, 403);
      if (!deps.converter || !deps.contentStore) return c.json({ error: "import_not_wired" }, 503);
      result = await deps.converter.preview(body.quarantineKey as string, { waitMs: 25_000 });
      if (result == null) return c.json({ error: "conversion_pending", quarantineKey: body.quarantineKey }, 409);
    }

    const slug = await uniqueSlug(deps.db, principal.workspaceId, title);
    const projectId = deps.ids();
    const actor = { kind: "user" as const, userId: principal.userId };

    // The persona pin mirrors PATCH /projects/:id/voice (REQ-DATA-32): the persona's current profile.
    let snapshotId: string | null = null;
    if (personaId) {
      const p = await deps.db.query(
        `select id from persona_profiles where persona_id = $1 order by built_at desc limit 1`,
        [personaId],
      );
      snapshotId = (p.rows[0] as { id: string } | undefined)?.id ?? null;
    }

    // P1.20 (§14.7) — the account defaults stamp at create: the approval policy + editor paper
    // theme land as project values (NOT NULL columns need a concrete pick); rigor/tier stay NULL —
    // NULL means "inherit the account default live" (per-project overrides win only when the user
    // actually picks one on /p/:id/settings).
    const accountPrefs = parseUserPrefs(
      (
        await deps.db
          .query(`select prefs from "user" where id = $1`, [principal.userId])
          .catch(() => ({ rows: [] }))
      ).rows[0] as { prefs: unknown } | undefined,
    );
    await deps.db.query(
      `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id, venue, persona_id,
                             persona_profile_snapshot_id, persona_locked_at,
                             approval_policy, model_tier_default, paper_theme)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, case when $8::text is null then null else now() end,
               $10,$11,$12)`,
      [
        projectId,
        principal.workspaceId,
        principal.userId,
        title,
        slug,
        protocolId,
        venue,
        personaId,
        snapshotId,
        accountPrefs.approvalPolicy ?? "named",
        // NULL = "inherit the account default live" — stamping the current default here would
        // freeze it into a project override and sever later account-level changes.
        null,
        accountPrefs.editor?.paperTheme ?? "light",
      ],
    );
    await deps.db.query(
      `insert into project_members (project_id, user_id, role) values ($1,$2,'admin') on conflict do nothing`,
      [projectId, principal.userId],
    );

    let draftId: string | null = null;
    let draftN: number | null = null;
    if (entry === "outline" && result) {
      await createOutlineArtifact(
        { db: deps.db, contentStore: deps.contentStore!, ids: deps.ids },
        { projectId, workspaceId: principal.workspaceId, actor, result },
      );
    } else if (entry === "draft" && result) {
      const declaredN =
        typeof body.startVersion === "number" && Number.isInteger(body.startVersion) && body.startVersion >= 1
          ? body.startVersion
          : undefined;
      const created = await createImportedDraft(
        { db: deps.db, contentStore: deps.contentStore!, ids: deps.ids },
        { projectId, workspaceId: principal.workspaceId, actor, result, ...(declaredN != null ? { declaredN } : {}) },
      );
      draftId = created.draftId;
      draftN = created.n;
      await recordAnalyticsEvent(deps.db, { ids: deps.ids, clock: deps.clock }, {
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        projectId,
        event: "draft.imported",
        props: { origin: result.sourceFormat, is_new_manuscript: true, venue_set: venue != null },
      }).catch(() => undefined);
    }

    // The project search doc (title + venue + Voice name) indexes at create — never lazily on read.
    await indexProjectDoc(deps.db, { projectId, workspaceId: principal.workspaceId, id: deps.ids }).catch(
      () => undefined,
    );
    // P1.17 (§3.5) — `entry.chosen` is the onboarding funnel's cohort key (scratch / outline / draft).
    await recordAnalyticsEvent(deps.db, { ids: deps.ids, clock: deps.clock }, {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      projectId,
      event: "entry.chosen",
      props: { entry: entry as "scratch" | "outline" | "draft" },
    }).catch(() => undefined);
    if (result && draftId) {
      await upsertProjectSearchDoc(deps.db, {
        projectId,
        workspaceId: principal.workspaceId,
        kind: "draft",
        refId: draftId,
        body: result.markdown,
        id: deps.ids,
      }).catch(() => undefined);
    }

    return c.json(
      {
        project: {
          id: projectId,
          slug,
          draftId,
          draftN,
          conversionNotes: result
            ? { warnings: result.warnings.length, unconverted: result.unconverted?.length ?? 0 }
            : null,
        },
      },
      201,
    );
  });

  // ---- Row actions (§5.2's "…" menu). Each is a small POST the web shell forms into; all are
  // tenant-scoped (the scoped db refuses cross-workspace ids) and deleted rows refuse everything. ----

  const loadProject = async (projectId: string) =>
    (
      (await deps.db.query(
        `select id, slug, title, archived_at, deleted_at from projects where id = $1`,
        [projectId],
      )).rows[0] as
        | { id: string; slug: string; title: string; archived_at: string | Date | null; deleted_at: string | Date | null }
        | undefined
    ) ?? null;

  app.post("/projects/:id/rename", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) : "";
    if (!title) return c.json({ error: "title required" }, 422);
    const projectId = c.req.param("id");
    const project = await loadProject(projectId);
    if (!project || project.deleted_at != null) return c.json({ error: "not_found" }, 404);
    await deps.db.query(`update projects set title = $2 where id = $1`, [projectId, title]);
    await indexProjectDoc(deps.db, { projectId, workspaceId: principal.workspaceId, id: deps.ids }).catch(
      () => undefined,
    );
    return c.json({ ok: true });
  });

  app.post("/projects/:id/duplicate", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const copy = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const src = (
        await tx.query(
          `select id, title, slug, protocol_id, protocol_version, venue, persona_id,
                  persona_profile_snapshot_id, register, approval_policy, approval_overrides,
                  rigor_default, model_tier_default, paper_theme
             from projects where id = $1 and deleted_at is null`,
          [projectId],
        )
      ).rows[0] as
        | {
            id: string; title: string; slug: string; protocol_id: string | null; protocol_version: number;
            venue: string | null; persona_id: string | null; persona_profile_snapshot_id: string | null;
            register: string | null; approval_policy: string; approval_overrides: unknown;
            rigor_default: string; model_tier_default: string | null; paper_theme: string;
          }
        | undefined;
      if (!src) return null;
      const newId = deps.ids();
      const slug = await uniqueSlug(tx, principal.workspaceId, `${src.slug}-copy`);
      await tx.query(
        `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id, protocol_version, venue,
                               persona_id, persona_profile_snapshot_id, register, persona_locked_at,
                               approval_policy, approval_overrides, rigor_default, model_tier_default, paper_theme)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          newId, principal.workspaceId, principal.userId, `${src.title} copy`, slug,
          src.protocol_id, src.protocol_version, src.venue, src.persona_id, src.persona_profile_snapshot_id,
          src.register, src.persona_id != null ? deps.clock.now() : null, src.approval_policy,
          src.approval_overrides == null ? null : JSON.stringify(src.approval_overrides),
          src.rigor_default, src.model_tier_default, src.paper_theme,
        ],
      );
      await tx.query(
        `insert into project_members (project_id, user_id, role) values ($1,$2,'admin') on conflict do nothing`,
        [newId, principal.userId],
      );
      // Drafts copy (REQ §5.2): new ids, origin='duplicate', the SAME content-addressed promoted versions,
      // base_draft_id remapped within the copy. Correspondence/runs/live_docs are NEVER copied.
      const srcDrafts = (
        await tx.query(
          `select id, n, state, promoted_version_id, base_draft_id, frozen_at, frozen_by,
                  claims_pending_verification, created_at
             from drafts where project_id = $1 order by n`,
          [projectId],
        )
      ).rows as {
        id: string; n: number; state: string; promoted_version_id: string | null;
        base_draft_id: string | null; frozen_at: string | Date | null; frozen_by: unknown;
        claims_pending_verification: boolean; created_at: string | Date;
      }[];
      const draftIdMap = new Map<string, string>();
      for (const d of srcDrafts) draftIdMap.set(d.id, deps.ids());
      for (const d of srcDrafts) {
        await tx.query(
          `insert into drafts (id, project_id, n, origin, state, promoted_version_id, base_draft_id,
                               frozen_at, frozen_by, claims_pending_verification)
             values ($1,$2,$3,'duplicate',$4,$5,$6,$7,$8,$9)`,
          [
            draftIdMap.get(d.id), newId, d.n, d.state, d.promoted_version_id,
            d.base_draft_id != null ? draftIdMap.get(d.base_draft_id) ?? null : null,
            d.frozen_at, d.frozen_by == null ? null : JSON.stringify(d.frozen_by),
            d.claims_pending_verification,
          ],
        );
      }
      // The outline artifact copies (new rows sharing the content-addressed head versions).
      const srcArtifacts = (
        await tx.query(
          `select id, kind, namespace, mirror_path, head_version_id from artifacts
             where project_id = $1 and kind = 'outline'`,
          [projectId],
        )
      ).rows as { id: string; kind: string; namespace: string; mirror_path: string; head_version_id: string | null }[];
      for (const a of srcArtifacts) {
        await tx.query(
          `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
             values ($1,$2,$3,$4,$5,$6,$7)`,
          [deps.ids(), principal.workspaceId, newId, a.kind, a.namespace, a.mirror_path, a.head_version_id],
        );
      }
      return { id: newId, slug };
    });
    if (!copy) return c.json({ error: "not_found" }, 404);
    await indexProjectDoc(deps.db, { projectId: copy.id, workspaceId: principal.workspaceId, id: deps.ids }).catch(
      () => undefined,
    );
    return c.json({ project: { id: copy.id, slug: copy.slug } }, 201);
  });

  app.post("/projects/:id/archive", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.db.query(
      `update projects set archived_at = now() where id = $1 and deleted_at is null returning id`,
      [c.req.param("id")],
    );
    if (res.rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/projects/:id/unarchive", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.db.query(
      `update projects set archived_at = null where id = $1 and deleted_at is null returning id`,
      [c.req.param("id")],
    );
    if (res.rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  // Delete is SOFT (§5.2 — the 30-day window): sets deleted_at; the row leaves every read. Restore
  // clears it (and any archive flag) inside the window; the purge sweep is the ops leg's, not this ticket's.
  app.post("/projects/:id/delete", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    // P1.17 (§15.4) — the Showcase can be archived and restored but never deleted (a deleted showcase
    // would leave the account without its worked example; archive is the hide affordance).
    if (await isShowcaseProject(deps.db, c.req.param("id"))) {
      return c.json({ error: "showcase_not_deletable" }, 409);
    }
    const res = await deps.db.query(
      `update projects set deleted_at = now() where id = $1 and deleted_at is null returning id`,
      [c.req.param("id")],
    );
    if (res.rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/projects/:id/restore", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.db.query(
      `update projects set deleted_at = null, archived_at = null where id = $1 and deleted_at is not null returning id`,
      [c.req.param("id")],
    );
    if (res.rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  // ---- The per-user /app grouping preference ('attention' | 'voice') — same pattern as app_theme (0027).
  app.get("/settings/project-grouping", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const row = (
      await deps.db.query(`select project_group_by from "user" where id = $1`, [principal.userId])
    ).rows[0] as { project_group_by: string } | undefined;
    const groupBy = GROUPINGS.has(row?.project_group_by ?? "") ? row!.project_group_by : "attention";
    return c.json({ groupBy });
  });

  app.put("/settings/project-grouping", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { groupBy?: unknown };
    if (typeof body.groupBy !== "string" || !GROUPINGS.has(body.groupBy)) {
      return c.json({ error: "groupBy must be 'attention' | 'voice'" }, 422);
    }
    await deps.txRunner.run(principal.workspaceId, async (tx) => {
      await tx.query(`update "user" set project_group_by = $2, updated_at = $3 where id = $1`, [
        principal.userId,
        body.groupBy,
        deps.clock.now(),
      ]);
    });
    return c.json({ ok: true });
  });

  return app;
}
