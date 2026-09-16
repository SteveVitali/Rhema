// The voice routes (PRB.10; §9.2–§9.6). Session-authenticated, server-rendered data routes — same seam as
// the PRB.05–07 surfaces. Every read calls the ONE shared status assembler (`loadVoiceStatus` →
// `deriveVoiceStatus`); every write owns its own validation. Covered surfaces:
//
//   POST /voices                        create a persona (+ Mode metadata) — §9.2 sheet
//   GET  /voices                        list personas + pills (the library's "Your voices" group)
//   GET  /voices/:id                    detail: status + samples + build history + profile artifacts
//   POST /voices/:id/samples            upload/paste → connection + discovered_item + sample v1 (§9.5)
//   PATCH /voices/:id/samples/:itemId   include/omit an item (the status re-derives at read)
//   POST /voices/:id/seed               seed save → PERSONA.md version + J9 hash recompute + live pill
//   GET  /voices/:id/estimate           the ≤500 ms estimate (Quick `40 + 0.012·words` at Base; REQ-PERSONA-3)
//   POST /voices/:id/build              "Create and build" → a profile_voice{tier} run (§9.2 item 3)
//   PATCH /runs/:id                     cancel an open build (cancelRun's legal edges)
//   PUT  /artifacts/:vid                derived-artifact write gate — 405 with `editMode` (§9.5 row 36)
//   GET  /projects/:id/voice            the project's linked voice facts (run-sheet line / picker chip)
//   PATCH /projects/:id/voice           REQ-DATA-32 pin: {personaId, profileSnapshotId}
//
// Derived profile artifacts (voice_print / lexicon / exemplars / positions / continuity / audience_venue /
// calibration_report / profile_provenance — every `editMode:"none"` kind) are NOT user-editable
// (§9.5 row 36, §8.2): a write attempt returns 405 and the response names the policy's editMode.
// The Connection model carries NO cookie/session-token field anywhere (AC-I-B — REQ-INGEST-2/16).

import { Hono } from "hono";
import { policyFor, artifactKindSchema, type ModelTier } from "@rhema/contracts";
import { buildEstimate } from "@rhema/run-sheet";
import {
  createRun,
  cancelRun,
  seatForWorkflow,
  phaseClassesForWorkflow,
  RUN_JOBS,
  type OrchestratorDeps,
} from "@rhema/orchestrator";
import {
  computeSeedHash,
  sampleSetHash,
  type VoiceStatus,
} from "@rhema/findings-core";
import { sha256Hex, type ContentStore } from "@rhema/mirror";
import type { Principal } from "./run-routes.js";
import { loadVoiceStatus } from "./voice-status.js";
import type { Converter } from "./import.js";

export interface VoiceApiDeps extends OrchestratorDeps {
  readonly principal: (c: { req: { header(name: string): string | undefined } }) => Principal | null;
  /** the workspace-bound store the seed + sample bodies persist through (same seam as import's). */
  readonly contentStore?: ContentStore;
  /** the PRB.02 convert-service seam (a sample upload previews through it — REQ-INGEST-1). */
  readonly converter?: Converter;
}

const MODES = new Set(["self", "consented", "house", "study"]);
const QUARANTINE_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const safeKey = (v: unknown): string | null =>
  typeof v === "string" && QUARANTINE_KEY.test(v) ? v : null;
const asText = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asTextArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const wordCountOf = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** Pre-terminal run states — a build in any of these holds the persona's exclusive slot. */
const PRETERMINAL_STATES = [
  "created",
  "awaiting_consent",
  "queued",
  "provisioning",
  "running",
  "waiting_gate",
  "cancelling",
  "finalizing",
] as const;

export function createVoiceRoutes(deps: VoiceApiDeps): Hono {
  const app = new Hono();

  const store = (): ContentStore | null => deps.contentStore ?? null;

  /** Persist a markdown body as a persona artifact + immutable v1 version; returns the ids. */
  const writePersonaArtifact = async (
    tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    args: {
      workspaceId: string;
      personaId: string;
      kind: string;
      mirrorPath: string;
      markdown: string;
      actor: Record<string, unknown>;
      wordCount?: number;
    },
  ): Promise<{ artifactId: string; versionId: string; contentSha256: string }> => {
    const cs = store();
    if (!cs) throw new Error("content store unavailable");
    const bytes = new TextEncoder().encode(args.markdown);
    const contentSha256 = sha256Hex(bytes);
    const { key } = await cs.put(args.workspaceId, contentSha256, bytes);
    const artifactId = deps.ids("art");
    const versionId = deps.ids("av");
    await tx.query(
      `insert into artifacts (id, workspace_id, persona_id, kind, namespace, mirror_path)
         values ($1,$2,$3,$4,'persona',$5)`,
      [artifactId, args.workspaceId, args.personaId, args.kind, args.mirrorPath],
    );
    await tx.query(
      `insert into artifact_versions
         (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
         values ($1,$2,1,$3,$4,$5,$6,'text/markdown',$7::jsonb,true)`,
      [
        versionId,
        artifactId,
        contentSha256,
        key,
        bytes.byteLength,
        args.wordCount ?? wordCountOf(args.markdown),
        JSON.stringify(args.actor),
      ],
    );
    await tx.query(`update artifacts set head_version_id = $2 where id = $1`, [artifactId, versionId]);
    return { artifactId, versionId, contentSha256 };
  };

  /** Append a new PERSONA.md version on the persona's seed artifact (creating it on first save). */
  const writeSeedVersion = async (
    tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    args: { workspaceId: string; personaId: string; seedArtifactId: string | null; markdown: string; actor: Record<string, unknown> },
  ): Promise<string> => {
    const cs = store();
    if (!cs) throw new Error("content store unavailable");
    const bytes = new TextEncoder().encode(args.markdown);
    const contentSha256 = sha256Hex(bytes);
    const { key } = await cs.put(args.workspaceId, contentSha256, bytes);
    const versionId = deps.ids("av");
    if (args.seedArtifactId == null) {
      const artifactId = deps.ids("art");
      await tx.query(
        `insert into artifacts (id, workspace_id, persona_id, kind, namespace, mirror_path)
           values ($1,$2,$3,'persona_seed','persona','PERSONA.md')`,
        [artifactId, args.workspaceId, args.personaId],
      );
      await tx.query(
        `insert into artifact_versions
           (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
           values ($1,$2,1,$3,$4,$5,$6,'text/markdown',$7::jsonb,false)`,
        [versionId, artifactId, contentSha256, key, bytes.byteLength, wordCountOf(args.markdown), JSON.stringify(args.actor)],
      );
      await tx.query(`update artifacts set head_version_id = $2 where id = $1`, [artifactId, versionId]);
      await tx.query(`update personas set seed_artifact_id = $2 where id = $1`, [args.personaId, artifactId]);
      return versionId;
    }
    const ordRes = await tx.query(
      `select coalesce(max(ordinal),0)+1 as n from artifact_versions where artifact_id = $1`,
      [args.seedArtifactId],
    );
    const n = Number((ordRes.rows[0] as { n: string | number }).n);
    await tx.query(
      `insert into artifact_versions
         (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
         values ($1,$2,$3,$4,$5,$6,$7,'text/markdown',$8::jsonb,false)`,
      [versionId, args.seedArtifactId, n, contentSha256, key, bytes.byteLength, wordCountOf(args.markdown), JSON.stringify(args.actor)],
    );
    await tx.query(`update artifacts set head_version_id = $2 where id = $1`, [args.seedArtifactId, versionId]);
    return versionId;
  };

  /** The persona's manual-ingest connection for a provider ('upload'|'paste'), created on first use.
   *  Connections carry no auth material for these providers — nothing cookie-shaped exists to store. */
  const ensureConnection = async (
    tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    personaId: string,
    provider: "upload" | "paste",
  ): Promise<string> => {
    const found = await tx.query(
      `select id from connections where persona_id = $1 and provider = $2 limit 1`,
      [personaId, provider],
    );
    const row = found.rows[0] as { id: string } | undefined;
    if (row) return row.id;
    const id = deps.ids("cn");
    await tx.query(
      `insert into connections (id, persona_id, provider, status, auto_include_new)
         values ($1,$2,$3,'ok',true)`,
      [id, personaId, provider],
    );
    return id;
  };

  /** The included-corpus words for the estimate + the sample-set facts a build freezes. */
  const corpusFacts = async (
    tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    personaId: string,
  ): Promise<{ words: number; sampleSet: Record<string, string> }> => {
    const res = await tx.query(
      `select di.id, sv.content_sha256, sv.word_count
         from discovered_items di
         join connections cn on cn.id = di.connection_id
         join sample_versions sv on sv.id = di.current_sample_id
        where cn.persona_id = $1 and di.state = 'included'`,
      [personaId],
    );
    const sampleSet: Record<string, string> = {};
    let words = 0;
    for (const r of res.rows as { id: string; content_sha256: string; word_count: number | null }[]) {
      sampleSet[r.id] = r.content_sha256;
      words += r.word_count ?? 0;
    }
    return { words, sampleSet };
  };

  // ---- POST /voices — the §9.2 sheet's create (name required; byline/description/mode optional).
  // A blank description leaves the seed agent-drafted (seed_authored_by 'persona_builder' — shown marked
  // *Drafted by Rhema — correct it* until the first user edit flips it to 'user'; REQ-PERSONA-4). ----
  app.post("/voices", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      byline?: string;
      description?: string;
      mode?: string;
      registers?: string[];
    };
    if (!body.name || !body.name.trim()) return c.json({ error: "name required" }, 400);
    const mode = MODES.has(body.mode ?? "") ? (body.mode as string) : "self";
    const registers = asTextArray(body.registers);
    const description = asText(body.description) ?? "";
    const personaId = deps.ids("persona");
    const seedSha256 = computeSeedHash({ description, byline: body.byline, registers });
    const agentDrafted = description.trim() === "";
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      await tx.query(
        `insert into personas (id, workspace_id, display_name, byline, mode, kind, provenance,
                               registers, seed_sha256, seed_authored_by, seed_updated_at)
           values ($1,$2,$3,$4,$5,'leaf','user',$6,$7,$8,now())`,
        [
          personaId,
          principal.workspaceId,
          body.name!.trim(),
          body.byline?.trim() || null,
          mode,
          registers,
          seedSha256,
          agentDrafted ? "persona_builder" : "user",
        ],
      );
      if (!agentDrafted) {
        await writeSeedVersion(tx, {
          workspaceId: principal.workspaceId,
          personaId,
          seedArtifactId: null,
          markdown: description,
          actor: { kind: "user", userId: principal.userId },
        });
      }
      const v = await loadVoiceStatus(tx, { personaId });
      return v?.status ?? null;
    });
    return c.json({ personaId, mode, seedAuthoredBy: agentDrafted ? "persona_builder" : "user", status: res }, 201);
  });

  // ---- GET /voices — the library's "Your voices" group (cards: name, byline, pill, counts). ----
  app.get("/voices", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const rows = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const res = await tx.query(`select id from personas order by id`);
      const out: {
        personaId: string;
        name: string | null;
        byline: string | null;
        mode: string;
        sampleCount: number;
        status: VoiceStatus;
      }[] = [];
      for (const r of res.rows as { id: string }[]) {
        const v = await loadVoiceStatus(tx, { personaId: r.id });
        if (!v) continue;
        const n = await tx.query(
          `select count(*) as n from discovered_items di
             join connections cn on cn.id = di.connection_id
            where cn.persona_id = $1 and di.state = 'included'`,
          [r.id],
        );
        out.push({
          personaId: v.persona.id,
          name: v.persona.display_name,
          byline: v.persona.byline,
          mode: v.persona.mode,
          sampleCount: Number((n.rows[0] as { n: string | number }).n),
          status: v.status,
        });
      }
      return out;
    });
    return c.json({ voices: rows });
  });

  // ---- GET /voices/:id — the detail page's data (status + samples + profiles + runs + artifacts). ----
  app.get("/voices/:id", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const v = await loadVoiceStatus(tx, { personaId });
      if (!v) return null;
      const samples = await tx.query(
        `select di.id, di.title, di.state, di.access, di.date, sv.id as version_id, sv.content_sha256,
                sv.word_count, sv.quality, sv.n
           from discovered_items di
           join connections cn on cn.id = di.connection_id
           left join sample_versions sv on sv.id = di.current_sample_id
          where cn.persona_id = $1
          order by di.id`,
        [personaId],
      );
      const profiles = await tx.query(
        `select id, built_at, tier, corpus_size_at_build, calibration_status, built_by_run_id
           from persona_profiles where persona_id = $1 order by built_at desc`,
        [personaId],
      );
      const runs = await tx.query(
        `select id, state, workflow, spent_credits, created_at, ended_at from runs
          where persona_id = $1 order by created_at desc limit 20`,
        [personaId],
      );
      const artifacts = await tx.query(
        `select a.id, a.kind, a.mirror_path, av.id as version_id, av.created_at
           from artifacts a join artifact_versions av on av.id = a.head_version_id
          where a.persona_id = $1
          order by av.created_at desc`,
        [personaId],
      );
      const project = await tx.query(
        `select id, slug, title, register, persona_profile_snapshot_id from projects where persona_id = $1`,
        [personaId],
      );
      // The seed's current text (the editor pre-fills it) — read from the head seed version's store bytes.
      let seedMarkdown = "";
      if (v.persona.seed_artifact_id && deps.contentStore) {
        const head = await tx.query(
          `select av.content_sha256 from artifact_versions av
             join artifacts a on a.id = av.artifact_id
            where a.id = $1 and av.id = a.head_version_id`,
          [v.persona.seed_artifact_id],
        );
        const sha = (head.rows[0] as { content_sha256: string } | undefined)?.content_sha256;
        if (sha) {
          const bytes = await deps.contentStore.get(sha).catch(() => null);
          if (bytes) seedMarkdown = new TextDecoder().decode(bytes);
        }
      }
      return {
        persona: v.persona,
        status: v.status,
        snapshot: v.snapshot,
        seedMarkdown,
        samples: samples.rows,
        profiles: profiles.rows,
        runs: runs.rows,
        artifacts: artifacts.rows,
        projects: project.rows,
      };
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    return c.json(res);
  });

  // ---- POST /voices/:id/samples — upload/paste through the §9.5 model (REQ-INGEST-1): the text goes
  // through the same converter-normalized canonical markdown (a `quarantineKey` previews via the PRB.02
  // convert seam; a raw `text` paste is already canonical) → a `sample` artifact + discovered_item v1,
  // state 'included'. The response carries the refreshed corpus words + the re-derived status so the
  // sheet's estimate can re-render in the same round-trip (REQ-PERSONA-3's ≤500 ms refresh). ----
  app.post("/voices/:id/samples", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      quarantineKey?: string;
      text?: string;
      title?: string;
    };
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const persona = await tx.query(`select id, slug from personas where id = $1`, [personaId]);
      if (!persona.rows[0]) return null;
      let markdown: string;
      const title = body.title?.trim() || "Sample";
      let provider: "upload" | "paste" = "paste";
      let quality: string | null = null;
      let qualityNotes: string[] = [];
      const qk = safeKey(body.quarantineKey);
      if (qk) {
        if (!deps.converter) throw new Error("converter unavailable");
        const pv = await deps.converter.preview(qk);
        markdown = pv.markdown;
        quality = pv.quality;
        qualityNotes = pv.qualityNotes;
        provider = "upload";
      } else if (typeof body.text === "string" && body.text.trim()) {
        markdown = body.text;
      } else {
        return { error: "text or quarantineKey required" };
      }
      const connectionId = await ensureConnection(tx, personaId, provider);
      const itemId = deps.ids("di");
      const words = wordCountOf(markdown);
      const { versionId } = await writePersonaArtifact(tx, {
        workspaceId: principal.workspaceId,
        personaId,
        kind: "sample",
        mirrorPath: `samples/${itemId}.md`,
        markdown,
        wordCount: words,
        actor: { kind: "user", userId: principal.userId },
      });
      const sampleVersionId = deps.ids("sv");
      // The item lands first (the version FKs to it), then its v1, then the head pointer — one tx.
      await tx.query(
        `insert into discovered_items (id, connection_id, external_id, title, word_count, access, state)
           values ($1,$2,$3,$4,$5,'free','included')`,
        [itemId, connectionId, itemId, title, words],
      );
      await tx.query(
        `insert into sample_versions (id, discovered_item_id, n, content_sha256, artifact_version_id, quality, quality_notes, word_count)
           values ($1,$2,1,$3,$4,$5,$6,$7)`,
        [sampleVersionId, itemId, sha256Hex(new TextEncoder().encode(markdown)), versionId, quality, qualityNotes, words],
      );
      await tx.query(`update discovered_items set current_sample_id = $2 where id = $1`, [
        itemId,
        sampleVersionId,
      ]);
      const facts = await corpusFacts(tx, personaId);
      const v = await loadVoiceStatus(tx, { personaId });
      return { itemId, sampleVersionId, words: facts.words, status: v?.status ?? null };
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    if ("error" in res) return c.json({ error: res.error }, 400);
    return c.json(res, 201);
  });

  // ---- PATCH /voices/:id/samples/:itemId — the per-item include/omit toggle (REQ-INGEST-4). Omitting
  // keeps the bytes + versions; the corpus set for the next build (and the read-time pill) just changes. ----
  app.patch("/voices/:id/samples/:itemId", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { included?: boolean };
    if (typeof body.included !== "boolean") return c.json({ error: "included required" }, 400);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      // connections/discovered_items are NOT RLS tables — the tenant check goes through the RLS'd
      // `personas` row (invisible ⇒ no update), so a foreign persona/item id can never write here.
      const owns = await tx.query(`select id from personas where id = $1`, [c.req.param("id")]);
      if (!owns.rows[0]) return null;
      const upd = await tx.query(
        `update discovered_items di set state = $3
           from connections cn
          where di.connection_id = cn.id and cn.persona_id = $2 and di.id = $1
          returning di.id`,
        [c.req.param("itemId"), c.req.param("id"), body.included ? "included" : "omitted"],
      );
      if (!upd.rows[0]) return null;
      const v = await loadVoiceStatus(tx, { personaId: c.req.param("id") });
      return v?.status ?? null;
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    return c.json({ status: res });
  });

  // ---- POST /voices/:id/seed — the seed editor's save (§9.5): a new PERSONA.md version + byline +
  // registers + the J9 hash recompute in one write; `seed_authored_by` flips to 'user' on the FIRST user
  // edit (the agent-drafted marker drops). The response re-derives the status so the pill flips live to
  // *Description changed* when a snapshot exists (§9.3 row 3; REQ-PERSONA-13). ----
  app.post("/voices/:id/seed", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      description?: string;
      byline?: string;
      registers?: string[];
    };
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const pres = await tx.query(
        `select id, byline, registers, seed_artifact_id from personas where id = $1`,
        [personaId],
      );
      const persona = pres.rows[0] as
        | { id: string; byline: string | null; registers: string[] | null; seed_artifact_id: string | null }
        | undefined;
      if (!persona) return null;
      const description = asText(body.description) ?? "";
      const byline = body.byline !== undefined ? asText(body.byline) : persona.byline;
      const registers = body.registers !== undefined ? asTextArray(body.registers) : (persona.registers ?? []);
      const seedSha256 = computeSeedHash({ description, byline, registers });
      await writeSeedVersion(tx, {
        workspaceId: principal.workspaceId,
        personaId,
        seedArtifactId: persona.seed_artifact_id,
        markdown: description,
        actor: { kind: "user", userId: principal.userId },
      });
      await tx.query(
        `update personas set byline = $2, registers = $3, seed_sha256 = $4,
            seed_authored_by = 'user', seed_updated_at = now() where id = $1`,
        [personaId, byline, registers, seedSha256],
      );
      const v = await loadVoiceStatus(tx, { personaId });
      return { seedSha256, status: v?.status ?? null };
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    return c.json(res);
  });

  // ---- GET /voices/:id/estimate — the tier figure over the current included corpus (§9.2 item 2;
  // REQ-PERSONA-3: refreshes within 500 ms of any sample change — the same server call the sample POST
  // returns, so the sheet never waits on a second round-trip). ----
  app.get("/voices/:id/estimate", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const tier = c.req.query("tier") === "full" ? "full" : "quick";
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const persona = await tx.query(`select id from personas where id = $1`, [personaId]);
      if (!persona.rows[0]) return null;
      return corpusFacts(tx, personaId);
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    const est = buildEstimate({
      workflow: "profile_voice",
      rigor: "standard",
      modelTier: "base",
      inputs: { words: res.words, piecesRead: Object.keys(res.sampleSet).length },
      variant: tier,
    });
    return c.json({ ...est, words: res.words, samples: Object.keys(res.sampleSet).length, tier });
  });

  // ---- POST /voices/:id/build — "Create and build" (§9.2 item 3): requires ≥1 sample for Quick Voice
  // (a bare seed is allowed only for "save the description — build later", which isn't a build). Freezes
  // the §9.3 snapshot facts into the run's FROZEN inputs, sets the persona's active_run_id, and queues the
  // start job — the same create→hold→queue path the sheet's Run click takes. ----
  app.post("/voices/:id/build", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      tier?: string;
      projectId?: string;
      sheetLaunched?: boolean;
      modelTier?: string;
      idempotencyKey?: string;
    };
    const tier = body.tier === "full" ? "full" : "quick";
    const modelTier: ModelTier =
      body.modelTier === "frontier" ? "frontier" : body.modelTier === "balanced" ? "balanced" : "base";
    const ctx = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const pres = await tx.query(
        `select id, byline, registers, seed_sha256 from personas where id = $1`,
        [personaId],
      );
      const persona = pres.rows[0] as
        | { id: string; byline: string | null; registers: string[] | null; seed_sha256: string | null }
        | undefined;
      if (!persona) return null;
      // Persona exclusivity (§12.3): one open build/refresh/calibrate run per persona — a second click is
      // a 409 naming the open run, not a second run row.
      const open = await tx.query(
        `select id from runs
          where persona_id = $1 and workflow in ('profile_voice','refresh_voice','calibrate_voice')
            and state = any($2::text[])
          order by created_at desc limit 1`,
        [personaId, PRETERMINAL_STATES],
      );
      const openRun = (open.rows[0] as { id: string } | undefined)?.id;
      if (openRun) return { error: "build_in_progress", runId: openRun };
      const facts = await corpusFacts(tx, personaId);
      if (Object.keys(facts.sampleSet).length === 0) return { error: "at least one sample required" };
      return { persona, facts };
    });
    if (!ctx) return c.json({ error: "not_found" }, 404);
    if ("error" in ctx) return c.json({ error: ctx.error, ...("runId" in ctx ? { runId: ctx.runId } : {}) }, ctx.error === "build_in_progress" ? 409 : 400);
    const est = buildEstimate({
      workflow: "profile_voice",
      rigor: "standard",
      modelTier,
      inputs: { words: ctx.facts.words, piecesRead: Object.keys(ctx.facts.sampleSet).length },
      variant: tier,
    });
    // The §9.3 snapshot facts frozen at build time — the profile row + every later staleness read diffs
    // against exactly these (seed_sha256, sample_set, corpus_size_at_build, calibration_status, tier).
    const snapshotFacts = {
      seed_sha256: ctx.persona.seed_sha256,
      sample_set_hash: sampleSetHash(ctx.facts.sampleSet),
      sample_set: ctx.facts.sampleSet,
      corpus_size_at_build: ctx.facts.words,
      calibration_status: tier === "quick" ? "untested" : "pending",
      tier,
    };
    const res = await createRun(deps, {
      idempotencyKey: body.idempotencyKey ?? `voice-build:${personaId}:${deps.ids("idem")}`,
      workflow: "profile_voice",
      workspaceId: principal.workspaceId,
      billingAccountId: principal.billingAccountId,
      requestedBy: principal.userId,
      personaId,
      ...(body.projectId ? { projectId: body.projectId } : {}),
      seat: seatForWorkflow("profile_voice"),
      modelProfile: { tier: modelTier },
      modelTier,
      rigor: "standard",
      estimateCredits: est.estimateCredits,
      capCredits: est.capCredits,
      rateTableVersion: est.rateTableVersion,
      phaseClassesUsed: phaseClassesForWorkflow("profile_voice"),
      inputs: { personaId, tier, snapshot: snapshotFacts },
      inputSnapshot: {
        wordCount: ctx.facts.words,
        sampleCount: Object.keys(ctx.facts.sampleSet).length,
        tier,
      },
      sheetLaunched: body.sheetLaunched !== false,
      lockSetSpec: { personaId },
    });
    if (!res.ok) {
      if (res.reason === "insufficient_balance") return c.json({ error: res.reason, required: res.required }, 402);
      if (res.reason === "account_suspended") return c.json({ error: res.reason }, 403);
      return c.json({ error: res.reason }, 422);
    }
    if (!res.deduped) {
      await deps.txRunner.run(principal.workspaceId, (tx) =>
        tx.query(`update personas set active_run_id = $2 where id = $1`, [personaId, res.runId]),
      );
      if (res.state === "queued") {
        await deps.queue.send(
          RUN_JOBS.start,
          { runId: res.runId, workspaceId: principal.workspaceId },
          { singletonKey: res.runId },
        );
      }
    }
    return c.json({ runId: res.runId, state: res.state, deduped: res.deduped, estimate: est }, res.deduped ? 200 : 201);
  });

  // ---- PATCH /runs/:id — cancel an open build (the detail page's Cancel; cancelRun's legal edges). ----
  app.patch("/runs/:id", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "cancel") return c.json({ error: "unsupported action" }, 400);
    const r = await cancelRun(deps, { runId: c.req.param("id"), workspaceId: principal.workspaceId });
    if (!r.ok) return c.json({ error: r.reason, ...(r.state ? { state: r.state } : {}) }, 409);
    await deps.txRunner.run(principal.workspaceId, (tx) =>
      tx.query(`update personas set active_run_id = null where active_run_id = $1`, [c.req.param("id")]),
    );
    return c.json({ runId: c.req.param("id"), state: "cancelling" });
  });

  // ---- PUT /artifacts/:vid — the §9.5 row-36 gate: a derived profile artifact is not user-editable.
  // The artifact's KIND decides via the §8.2 policy (editMode "none" ⇒ 405); the response names the mode
  // so a caller can render "read-only" without a second lookup (AC-P-C's write leg). ----
  app.put("/artifacts/:vid", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.txRunner.run(principal.workspaceId, (tx) =>
      tx.query(
        `select a.kind from artifact_versions av join artifacts a on a.id = av.artifact_id where av.id = $1`,
        [c.req.param("vid")],
      ),
    );
    const row = res.rows[0] as { kind: string } | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);
    const kind = artifactKindSchema.safeParse(row.kind);
    const policy = kind.success ? policyFor(kind.data) : null;
    if (!policy || policy.editMode === "none") {
      return c.json({ error: "read_only_artifact", editMode: "none" }, 405);
    }
    return c.json({ error: "edits_not_implemented", editMode: policy.editMode }, 405);
  });

  // ---- GET /projects/:id/voice — the project's linked voice facts (the run sheet's voice line, the
  // project chip, the picker option all read this ONE projection; §9.6). ----
  app.get("/projects/:id/voice", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const proj = await tx.query(
        `select id, persona_id, persona_profile_snapshot_id, register from projects where id = $1`,
        [c.req.param("id")],
      );
      const p = proj.rows[0] as
        | { id: string; persona_id: string | null; persona_profile_snapshot_id: string | null; register: string | null }
        | undefined;
      if (!p) return null;
      if (!p.persona_id) return { voiceMode: "ad_hoc" as const, personaId: null, snapshotId: null, status: null };
      const v = await loadVoiceStatus(tx, { personaId: p.persona_id });
      if (!v) return { voiceMode: "ad_hoc" as const, personaId: null, snapshotId: null, status: null };
      return {
        voiceMode: "linked" as const,
        personaId: p.persona_id,
        name: v.persona.display_name,
        snapshotId: p.persona_profile_snapshot_id,
        status: v.status,
        snapshot: v.snapshot,
      };
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    return c.json(res);
  });

  // ---- PATCH /projects/:id/voice — REQ-DATA-32's project voice pin. The snapshot resolves to the
  // persona's current profile unless the caller names one (§9.6: the project pins the profile used).
  // `personaId: null` selects "No voice" — the ad-hoc default (REQ-PERSONA-20). ----
  app.patch("/projects/:id/voice", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      personaId?: string | null;
      profileSnapshotId?: string | null;
    };
    const projectId = c.req.param("id");
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const proj = await tx.query(`select id from projects where id = $1`, [projectId]);
      if (!proj.rows[0]) return null;
      if (body.personaId == null) {
        await tx.query(
          `update projects set persona_id = null, persona_profile_snapshot_id = null where id = $1`,
          [projectId],
        );
        return { voiceMode: "ad_hoc" as const, personaId: null, profileSnapshotId: null, status: null };
      }
      const persona = await tx.query(`select id from personas where id = $1`, [body.personaId]);
      if (!persona.rows[0]) return { error: "persona_not_found" };
      let snapshotId = typeof body.profileSnapshotId === "string" ? body.profileSnapshotId : null;
      if (!snapshotId) {
        const p = await tx.query(
          `select id from persona_profiles where persona_id = $1 order by built_at desc limit 1`,
          [body.personaId],
        );
        snapshotId = (p.rows[0] as { id: string } | undefined)?.id ?? null;
      }
      await tx.query(
        `update projects set persona_id = $2, persona_profile_snapshot_id = $3, persona_locked_at = now() where id = $1`,
        [projectId, body.personaId, snapshotId],
      );
      const v = await loadVoiceStatus(tx, { personaId: body.personaId });
      return {
        voiceMode: "linked" as const,
        personaId: body.personaId,
        profileSnapshotId: snapshotId,
        status: v?.status ?? null,
      };
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    if ("error" in res) return c.json({ error: res.error }, 400);
    return c.json(res);
  });

  return app;
}
