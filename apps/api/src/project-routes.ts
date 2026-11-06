import { Hono } from "hono";
import { resolveSheetConfig, surfaceEstimate } from "@rhema/run-sheet";
import { allowedModelTiers, parseQuarantineKey, parseUserPrefs, type DurationBand } from "@rhema/contracts";
import { PROTOCOL_CARDS, defaultProtocolId } from "@rhema/protocols";
import { durationCells, effectivePlanTier, recordAnalyticsEvent, sizeBandFor } from "@rhema/ledger";
import type { ContentStore } from "@rhema/mirror";
import type { Queue } from "@rhema/orchestrator";
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
  /**
   * The pg-boss queue: a soft delete enqueues `project.purge` at the tombstone's grace end
   * (startAfterMs = the 30-day window; the worker handler re-reads `deleted_at` so a restore inside
   * the window no-ops). Unset ⇒ the tombstone still lands; the purge sweep leg is skipped.
   */
  readonly queue?: Queue;
}

/** The retention sweep queue the worker consumes (`apps/worker` `handleProjectPurge`). */
export const PROJECT_PURGE_QUEUE = "project.purge";
/** §5.2/REQ-ARCH-28 — the soft-delete grace window before the purge job fires. */
const PROJECT_PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

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
  // the surface estimator (a Standard Review over the card's typical length AT THE CALLER'S RESOLVED
  // TIER — EST.1: explicit choice → account pref → the notch default, clamped to the plan) — never a
  // hand-typed price, and never a tier the caller's plan locks (BL-57/BL-58). A failed estimate omits
  // the figure; the card renders "—" rather than a stale or modelled number.
  app.get("/protocols", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);

    // EST.1 — the same default chain the run sheet opens on (account pref → rigor-notch column),
    // clamped to the plan's permitted tiers. Reads fail CLOSED: a prefs/plan read error prices the
    // cards at the unconstrained notch default rather than 500ing a decorative read.
    const prefsRow = (
      await deps.db
        .query(`select prefs from "user" where id = $1`, [principal.userId])
        .catch(() => ({ rows: [] }))
    ).rows[0] as { prefs: unknown } | undefined;
    const prefs = parseUserPrefs(prefsRow?.prefs);
    const planTier = await effectivePlanTier(deps.db, principal.billingAccountId).catch(() => null);
    const allowed = planTier != null ? allowedModelTiers(planTier) : undefined;
    const { modelTier } = resolveSheetConfig({
      workflow: "review",
      rigor: "standard",
      prefs,
      ...(allowed ? { allowedModelTiers: allowed } : {}),
    });

    // EST.1 — the calibrated duration cells for a Review at each card's size band (the protocol card,
    // the sheet and the run card's initial ETA all render the same band; null ⇒ the shared prior).
    const bandCache = new Map<string, Awaited<ReturnType<typeof durationCells>>>();
    const cellsFor = async (words: number) => {
      const band = sizeBandFor({ words });
      if (!bandCache.has(band)) bandCache.set(band, await durationCells(deps.db, "review", band).catch(() => null));
      return bandCache.get(band) ?? null;
    };

    const protocols = await Promise.all(
      PROTOCOL_CARDS.map(async (card) => {
        let typicalReviewCredits: number | undefined;
        let typicalReviewDuration: DurationBand | undefined;
        try {
          const durations = (await cellsFor(card.typicalWords)) ?? undefined;
          const est = surfaceEstimate({
            workflow: "review",
            rigor: "standard",
            modelTier,
            inputs: { words: card.typicalWords },
            ...(durations ? { durations } : {}),
          });
          typicalReviewCredits = est.estimateCredits;
          typicalReviewDuration = est.duration;
        } catch {
          typicalReviewCredits = undefined; // a card without a priced band still renders
          typicalReviewDuration = undefined;
        }
        return { ...card, typicalReviewCredits, typicalReviewDuration };
      }),
    );
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
    const typedTitle = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) : "";
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
    // ONB.1 — the conversion resolves BEFORE the title check: the document's own leading H1
    // (`ConversionResult.title`) is the project-title default when none was typed — an explicitly
    // typed title still wins. Scratch keeps the typed-title requirement unchanged.
    let result = null;
    if (entry !== "scratch") {
      const parsed = parseQuarantineKey(body.quarantineKey);
      if (!parsed) return c.json({ error: "quarantineKey required" }, 400);
      if (parsed.workspaceId !== principal.workspaceId) return c.json({ error: "forbidden" }, 403);
      if (!deps.converter || !deps.contentStore) return c.json({ error: "import_not_wired" }, 503);
      result = await deps.converter.preview(body.quarantineKey as string, { waitMs: 25_000 });
      if (result == null) return c.json({ error: "conversion_pending", quarantineKey: body.quarantineKey }, 409);
    }
    const title = (typedTitle || result?.title || "").slice(0, TITLE_MAX);
    if (!title) return c.json({ error: "title required" }, 422);

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
    let draftId: string | null = null;
    let draftN: number | null = null;
    if (entry === "scratch") {
      // R7HOME.2b (REQ-HOME-3, ADR-128's REQ-IDE-5 item) — a scratch create is born with its blank
      // editable head: ONE tenant transaction writes the project row, the admin member, the
      // `working` draft (`human_revision` — the person's editable lineage, the same origin the
      // Page's own save path writes), and the seeded live_docs row (the collab extension's
      // `'\\x'` insert shape verbatim), so the first keystroke edits in place through the standard
      // wire — never a lazy second write, never a fork, never a half-created project.
      await deps.txRunner.run(principal.workspaceId, async (tx) => {
        await tx.query(
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
        await tx.query(
          `insert into project_members (project_id, user_id, role) values ($1,$2,'admin') on conflict do nothing`,
          [projectId, principal.userId],
        );
        const newDraftId = deps.ids();
        const liveDocId = deps.ids();
        await tx.query(
          `insert into drafts (id, project_id, n, origin, state) values ($1,$2,1,'human_revision','working')`,
          [newDraftId, projectId],
        );
        await tx.query(
          `insert into live_docs (id, draft_id, y_state, state_vector) values ($1,$2,'\\x'::bytea,'\\x'::bytea)`,
          [liveDocId, newDraftId],
        );
        await tx.query(`update drafts set live_doc_id = $2 where id = $1`, [newDraftId, liveDocId]);
        draftId = newDraftId;
        draftN = 1;
      });
    } else {
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
    }
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
        { db: deps.db, contentStore: deps.contentStore!, ids: deps.ids, txRunner: deps.txRunner },
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
  // clears it (and any archive flag) inside the window. STB.2 (D-P1.04-2): the tombstone also
  // enqueues `project.purge` at the grace end — the worker handler re-reads `deleted_at`, so a
  // restore inside the window no-ops (same re-check shape as `account.hard-delete`).
  app.post("/projects/:id/delete", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    // P1.17 (§15.4) — the Showcase can be archived and restored but never deleted (a deleted showcase
    // would leave the account without its worked example; archive is the hide affordance).
    if (await isShowcaseProject(deps.db, projectId)) {
      return c.json({ error: "showcase_not_deletable" }, 409);
    }
    const tombstonedAt = deps.clock.now();
    const res = await deps.db.query(
      `update projects set deleted_at = $2 where id = $1 and deleted_at is null returning id`,
      [projectId, tombstonedAt],
    );
    if (res.rows.length === 0) return c.json({ error: "not_found" }, 404);
    if (deps.queue) {
      // The enqueue never fails the delete (the tombstone is the state); singleton-keyed on the
      // project so a delete → restore → delete re-drive refreshes the pending job's timing only
      // through a NEW send once the first has run.
      await deps.queue
        .send(
          PROJECT_PURGE_QUEUE,
          {
            tenantId: principal.workspaceId,
            projectId,
            tombstonedAt: tombstonedAt.toISOString(),
          },
          {
            startAfterMs: PROJECT_PURGE_AFTER_MS,
            singletonKey: `project.purge:${projectId}`,
          },
        )
        .catch(() => undefined);
    }
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
