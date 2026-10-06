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
//   GET  /voices/:id/estimate           the ≤500 ms estimate (Quick `40 + 0.09·words` at Base; REQ-PERSONA-3)
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
import { policyFor, artifactKindSchema, parseQuarantineKey, type ModelTier } from "@rhema/contracts";
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
  routeVoiceUpdate,
  routeVoiceUpgrade,
  voiceFactsPanel,
  approveSampleCard,
  checkVoiceBuildGate,
  pickHoldout,
  holdoutMirrorPath,
  holdoutRevealed,
  PROFILE_SECTION_ORDER,
  FULL_PROFILE_MIN_READABLE_WORDS,
  guidanceSection,
  reseededCharter,
  lineDiff,
  type VoiceStatus,
  type HoldoutSpec,
} from "@rhema/findings-core";
import { measureCorpus, measureProse, calibrationRows, type CorpusMeasures } from "@rhema/measure";
import { checkBatchSize, checkWordCount, sampleCaps } from "@rhema/ingest";
import { normalizeUrl } from "@rhema/hooks";
import { sha256Hex, type ContentStore } from "@rhema/mirror";
import type { Principal } from "./run-routes.js";
import { recordAnalyticsEvent } from "@rhema/ledger";
import { loadVoiceStatus } from "./voice-status.js";
import type { Converter } from "./import.js";

/** The fetcher-only URL ingestion seam (§12.6; REQ-PERSONA-11): URL samples for a persona arrive
 *  through the persona builder's client-side fetcher service — SSRF-guarded, robots-respecting,
 *  parsing nothing — then the PRB.02 converter normalizes the page to canonical markdown. There is
 *  NO credentialed/session URL path (AC-I-B is structural: connections carry no auth material). Prod
 *  binds this to the fetcher Cloud Run + convert Job; tests inject a fake. */
export interface UrlSampleFetcher {
  fetch(url: string): Promise<{ readonly ok: true; readonly markdown: string; readonly title?: string | null } | { readonly ok: false; readonly reason: string }>;
}

export interface VoiceApiDeps extends OrchestratorDeps {
  readonly principal: (c: { req: { header(name: string): string | undefined } }) => Principal | null;
  /** the workspace-bound store the seed + sample bodies persist through (same seam as import's). */
  readonly contentStore?: ContentStore;
  /** the deploy's per-workspace store factory (prod binds this; same seam as the editor's storeFor). */
  readonly contentStoreFor?: (workspaceId: string) => Promise<ContentStore> | ContentStore;
  /** the PRB.02 convert-service seam (a sample upload previews through it — REQ-INGEST-1). */
  readonly converter?: Converter;
  /** the fetcher-only URL path (§12.6) — unset ⇒ the URL-sample route 501s rather than degrade to a
   *  server-side fetch (there is no credentialed path to fall back to). */
  readonly urlFetcher?: UrlSampleFetcher;
}

const MODES = new Set(["self", "consented", "house", "study"]);
// PRB.20 — the wire shape is the full minted key `quarantine/<ws>/<id>` (was a bare id); the workspace
// segment must be the session's tenant — a voice sample can never read another workspace's upload.
const safeKey = (v: unknown, workspaceId: string): string | null =>
  parseQuarantineKey(v, workspaceId) ? (v as string) : null;
const asText = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asTextArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const wordCountOf = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** `{itemId → content_sha256}` over the included rows of the detail sample query — the same map
 *  shape the snapshot freezes, so the popover's deltas compare like with like. */
/** Corpus membership (§9.5): `included` AND `removed_remote` (kept, badged, still included). */
const CORPUS_STATES = new Set(["included", "removed_remote"]);
const parseSampleRows = (rows: unknown[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const r of rows as { id: string; state: string; content_sha256: string | null }[]) {
    if (CORPUS_STATES.has(r.state) && r.content_sha256) out[r.id] = r.content_sha256;
  }
  return out;
};

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

/** Slug-uniquify for the fork hatch (same convention as POST /projects/:id/duplicate). */
async function uniqueVoiceSlug(
  tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  workspaceId: string,
  base: string,
): Promise<string> {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
  let slug = cleaned;
  for (let i = 2; ; i += 1) {
    const res = await tx.query(`select id from projects where workspace_id = $1 and slug = $2`, [
      workspaceId,
      slug,
    ]);
    if (res.rows.length === 0) return slug;
    slug = `${cleaned}-${i}`;
  }
}

export function createVoiceRoutes(deps: VoiceApiDeps): Hono {
  const app = new Hono();

  const storeFor = async (workspaceId: string): Promise<ContentStore | null> =>
    (deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.contentStore) ?? null;

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
    const cs = await storeFor(args.workspaceId);
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
    const cs = await storeFor(args.workspaceId);
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

  /** The persona's ingest connection for a provider ('upload'|'paste'|'url'), created on first use.
   *  Connections carry no auth material for these providers — nothing cookie-shaped exists to store. */
  const ensureConnection = async (
    tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    personaId: string,
    provider: "upload" | "paste" | "url",
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
        where cn.persona_id = $1 and di.state in ('included','removed_remote')`,
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
    // voice.created (PRB.12 emission audit — this route owns it): the beta creates Quick voices only —
    // the Full build is a later tier; `samples` counts the uploads already attached (0 at create). The
    // write is post-commit and non-fatal: a telemetry failure is logged, never a failed create.
    await deps.txRunner
      .run(principal.workspaceId, (tx) =>
        recordAnalyticsEvent(tx, deps, {
          userId: principal.userId,
          workspaceId: principal.workspaceId,
          event: "voice.created",
          props: { tier: "quick", samples: 0 },
        }),
      )
      .catch((err: unknown) =>
        console.error("[api] voice.created analytics failed:", err instanceof Error ? err.message : err),
      );
    return c.json({ personaId, mode, seedAuthoredBy: agentDrafted ? "persona_builder" : "user", status: res }, 201);
  });

  // ---- GET /voices — the §9.1 destination: three fixed groups (Your voices / House styles /
  // Shared with you) of cards carrying name + byline + the shared pill + sample count + source
  // summary + projects using + last built — never credits (§9.1 card anatomy). ----
  app.get("/voices", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const rows = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      // SEC.1 (PR-S1; REQ-SPEC-30) — the explicit workspace predicate: the compensating control that
      // closes the confirmed cross-tenant /voices leak even if the role switch window slips. Personas
      // always live in the requester's own workspace (house/shared voices are per-workspace rows;
      // workspaces.kind is personal|team — there is no global persona workspace), so scoping to
      // $principal.workspaceId loses nothing. RLS is the backstop, never the only filter.
      const res = await tx.query(
        `select id from personas where deleted_at is null and workspace_id = $1 order by id`,
        [principal.workspaceId],
      );
      const out: {
        personaId: string;
        name: string | null;
        byline: string | null;
        mode: string;
        kind: string;
        group: "your_voices" | "house_styles" | "shared_with_you";
        readOnly: boolean;
        sampleCount: number;
        sources: string[];
        projectCount: number;
        lastBuiltAt: string | Date | null;
        tier: string | null;
        members: { personaId: string; name: string | null }[];
        registers: string[];
        status: VoiceStatus;
      }[] = [];
      for (const r of res.rows as { id: string }[]) {
        const v = await loadVoiceStatus(tx, { personaId: r.id });
        if (!v) continue;
        const n = await tx.query(
          `select count(*) as n, coalesce(array_agg(distinct cn.provider) filter (where cn.provider is not null), '{}') as providers
             from discovered_items di
             join connections cn on cn.id = di.connection_id
            where cn.persona_id = $1 and di.state in ('included','removed_remote')`,
          [r.id],
        );
        const projN = await tx.query(`select count(*) as n from projects where persona_id = $1`, [r.id]);
        const members =
          v.persona.kind === "composite"
            ? (((
                await tx.query(
                  `select p.id, p.display_name from persona_members pm join personas p on p.id = pm.member_id
                    where pm.composite_id = $1 order by p.display_name`,
                  [r.id],
                )
              ).rows as { id: string; display_name: string | null }[]).map((m) => ({
                personaId: m.id,
                name: m.display_name,
              })) as { personaId: string; name: string | null }[])
            : [];
        const group =
          v.persona.mode === "house" || v.persona.provenance === "house"
            ? ("house_styles" as const)
            : v.persona.provenance === "shared"
              ? ("shared_with_you" as const)
              : ("your_voices" as const);
        const providers = (n.rows[0] as { providers: string[] | null }).providers ?? [];
        out.push({
          personaId: v.persona.id,
          name: v.persona.display_name,
          byline: v.persona.byline,
          mode: v.persona.mode,
          kind: v.persona.kind,
          group,
          // House styles + shared personas are read-only on this surface (§9.1: forkable, not editable).
          readOnly: group !== "your_voices",
          sampleCount: Number((n.rows[0] as { n: string | number }).n),
          sources: providers,
          projectCount: Number((projN.rows[0] as { n: string | number }).n),
          lastBuiltAt: v.snapshot?.builtAt ?? null,
          tier: v.snapshot?.tier ?? null,
          members,
          registers: v.persona.registers ?? [],
          status: v.status,
        });
      }
      return out;
    });
    const groups = {
      your_voices: rows.filter((r) => r.group === "your_voices"),
      house_styles: rows.filter((r) => r.group === "house_styles"),
      shared_with_you: rows.filter((r) => r.group === "shared_with_you"),
    };
    return c.json({ voices: rows, groups });
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
        `select di.id, di.title, di.state, di.access, di.date, di.connection_id, di.url, di.external_id,
                sv.id as version_id, sv.content_sha256,
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
      const readStore = await storeFor(principal.workspaceId);
      if (v.persona.seed_artifact_id && readStore) {
        const head = await tx.query(
          `select av.content_sha256 from artifact_versions av
             join artifacts a on a.id = av.artifact_id
            where a.id = $1 and av.id = a.head_version_id`,
          [v.persona.seed_artifact_id],
        );
        const sha = (head.rows[0] as { content_sha256: string } | undefined)?.content_sha256;
        if (sha) {
          const bytes = await readStore.get(sha).catch(() => null);
          if (bytes) seedMarkdown = new TextDecoder().decode(bytes);
        }
      }

      // ---- P1.14: the diff-of-inputs panel + the ONE verb's route (§9.3) ----
      const delta = v.status.detail.samples;
      const titleRows =
        delta.added + delta.removed + delta.changed > 0
          ? (
              await tx.query(
                `select di.id, di.title from discovered_items di
                    join connections cn on cn.id = di.connection_id
                   where cn.persona_id = $1`,
                [personaId],
              )
            ).rows
          : [];
      const titleOf = (id: string) =>
        (titleRows as { id: string; title: string | null }[]).find((t) => t.id === id)?.title ?? null;
      const snapSet = v.snapshot?.sampleSet ?? {};
      const curSet = v.status && samples.rows ? parseSampleRows(samples.rows) : {};
      const firstDelta = (kind: "added" | "removed" | "changed"): string[] => {
        const out: string[] = [];
        for (const id of Object.keys(kind === "removed" ? snapSet : curSet)) {
          const isAdded = !(id in snapSet);
          const isRemoved = !(id in curSet);
          const isChanged = id in snapSet && id in curSet && snapSet[id] !== curSet[id];
          if ((kind === "added" && isAdded) || (kind === "removed" && isRemoved) || (kind === "changed" && isChanged)) {
            const t = titleOf(id);
            if (t) out.push(t);
          }
        }
        return out.slice(0, 1);
      };
      const factsPanel = voiceFactsPanel({
        status: v.status,
        snapshot: v.snapshot,
        currentCorpusWords: v.currentCorpusWords,
        titles: { added: firstDelta("added"), removed: firstDelta("removed"), changed: firstDelta("changed") },
      });
      const updateRoute = routeVoiceUpdate({ status: v.status, snapshot: v.snapshot });
      const upgradeRoute = routeVoiceUpgrade(v.snapshot);

      // ---- P1.14: the hold-out — identity gated on calibration (§9.4; REQ-INGEST-13). Pre-calibration
      // the API carries ONLY the fact that a piece was held back; `itemId`/`title`/`url` stay server-side. ----
      const holdSpec = (v.profile?.buildNote?.holdouts ?? null) as HoldoutSpec | null;
      const revealed = holdoutRevealed(holdSpec);
      const holdout = holdSpec
        ? {
            held: true,
            revealed,
            ...(revealed
              ? { itemId: holdSpec.itemId, title: titleOf(holdSpec.itemId), revealedAt: holdSpec.revealedAt }
              : {}),
          }
        : { held: false, revealed: false };

      // ---- P1.14: deterministic Voice-measures (§9.4 Advanced section — ranges beside means). ----
      const sampleTexts: string[] = [];
      if (readStore) {
        for (const s of samples.rows as { content_sha256: string | null; state: string }[]) {
          if (!CORPUS_STATES.has(s.state) || !s.content_sha256) continue;
          const bytes = await readStore.get(s.content_sha256).catch(() => null);
          if (bytes) sampleTexts.push(new TextDecoder().decode(bytes));
        }
      }
      const measures: CorpusMeasures | null = sampleTexts.length > 0 ? measureCorpus(sampleTexts) : null;

      // ---- P1.14: the calibration comparison table (§9.4 — target vs prediction vs real, one band
      //  wide). Rendered only post-reveal: the target is the corpus the profile measured (the
      //  deterministic re-measure of the current included texts), the prediction is the calibrator's
      //  recorded `profile/calibration-prediction.md` measured with the same function, and "real" is
      //  the revealed hold-out piece itself. ----
      let calibration: Record<string, unknown> | null = null;
      if (revealed && holdSpec && readStore) {
        const heldRow = (samples.rows as { id: string; content_sha256: string | null }[]).find(
          (s) => s.id === holdSpec.itemId,
        );
        const predRow = (artifacts.rows as { mirror_path: string; version_id: string }[]).find(
          (a) => a.mirror_path === "profile/calibration-prediction.md",
        );
        const textFor = async (versionId: string): Promise<string | null> => {
          const sha = (
            await tx.query(`select content_sha256 from artifact_versions where id = $1`, [versionId])
          ).rows[0] as { content_sha256: string } | undefined;
          const bytes = sha ? await readStore.get(sha.content_sha256).catch(() => null) : null;
          return bytes ? new TextDecoder().decode(bytes) : null;
        };
        const heldText = heldRow?.content_sha256
          ? await readStore.get(heldRow.content_sha256).then((b) => new TextDecoder().decode(b)).catch(() => null)
          : null;
        const predText = predRow ? await textFor(predRow.version_id) : null;
        if (measures && heldText) {
          const rows = calibrationRows(measures.corpus, predText ? measureProse(predText) : null, measureProse(heldText));
          calibration = {
            verdict: v.snapshot?.calibrationStatus ?? null,
            rows,
            withinCount: rows.filter((r) => r.withinBand).length,
            totalCount: rows.length,
          };
        }
      }

      // ---- P1.14: profile corrections (§9.4 "Correct this…" ledger). ----
      const corrections = (
        await tx.query(
          `select id, profile_id, target_artifact_id, statement_ref, text, source, consumed_by_profile_id, at
             from profile_corrections where persona_id = $1 order by at`,
          [personaId],
        )
      ).rows;

      // ---- P1.14: the approve_sample gate card (§9.2/§6.4) — when the active build waits on it. ----
      let gate: Record<string, unknown> | null = null;
      if (v.activeRun) {
        const g = (
          await tx.query(
            `select id, deadline_at from gates where run_id = $1 and kind = 'approve_sample' and resolved_at is null
               order by opened_at desc limit 1`,
            [v.activeRun.id],
          )
        ).rows[0] as { id: string; deadline_at: string | Date | null } | undefined;
        if (g) {
          const all = (
            await tx.query(
              `select di.id, di.title, di.state, sv.quality_notes
                 from discovered_items di join connections cn on cn.id = di.connection_id
                  left join sample_versions sv on sv.id = di.current_sample_id
                where cn.persona_id = $1`,
              [personaId],
            )
          ).rows as { id: string; title: string | null; state: string; quality_notes: string[] | null }[];
          const runInputs = v.activeRun.inputs;
          const holdSpecRun = (runInputs.holdouts ?? null) as HoldoutSpec | null;
          const calibrationOn = runInputs.calibration !== false;
          gate = {
            gateId: g.id,
            runId: v.activeRun.id,
            workflow: v.activeRun.workflow,
            card: approveSampleCard({
              census: {
                total: all.length,
                included: all.filter((r) => CORPUS_STATES.has(r.state)).length,
                excluded: all
                  .filter((r) => !CORPUS_STATES.has(r.state))
                  .map((r) => ({
                    title: r.title ?? r.id,
                    reason:
                      r.state === "omitted"
                        ? "you left this piece out"
                        : (r.quality_notes ?? [])[0] ?? "couldn't read this piece",
                  })),
              },
              holdout: holdSpecRun != null,
              calibration: calibrationOn,
              sampleCap: typeof runInputs.sampleCap === "number" ? runInputs.sampleCap : 40,
              modelTier: runInputs.modelTier === "deep" ? "deep" : "base",
              estimateCredits:
                typeof runInputs.estimateCredits === "number" ? runInputs.estimateCredits : null,
              capCredits: typeof runInputs.capCredits === "number" ? runInputs.capCredits : null,
              waitingUntil: g.deadline_at ? new Date(g.deadline_at).toISOString() : null,
            }),
          };
        }
      }

      // ---- P1.14: composite members ("Composed from A, B") + multi-register flag (§9.6). ----
      const members =
        v.persona.kind === "composite"
          ? (
              await tx.query(
                `select p.id, p.display_name, p.byline from persona_members pm join personas p on p.id = pm.member_id
                  where pm.composite_id = $1 order by p.display_name`,
                [personaId],
              )
            ).rows
          : [];

      // ---- P1.14: build notes (the Description tab's "Notes from the last build" + the Overview's
      //  decisions checklist). ----
      const buildNotes = (
        await tx.query(
          `select id, profile_id, body, created_at from persona_build_notes where persona_id = $1
             order by created_at desc limit 10`,
          [personaId],
        )
      ).rows;

      // The Overview tab's hub paragraph — profile/index.md's head text when a build produced it.
      let hubMarkdown: string | null = null;
      const hubRow = (artifacts.rows as { mirror_path: string; version_id: string }[]).find(
        (a) => a.mirror_path === "profile/index.md",
      );
      if (hubRow && readStore) {
        const sha = (
          await tx.query(`select content_sha256 from artifact_versions where id = $1`, [hubRow.version_id])
        ).rows[0] as { content_sha256: string } | undefined;
        const bytes = sha ? await readStore.get(sha.content_sha256).catch(() => null) : null;
        if (bytes) hubMarkdown = new TextDecoder().decode(bytes);
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
        // ---- P1.14 surfaces ----
        factsPanel,
        updateRoute,
        upgradeRoute,
        holdout,
        measures,
        calibration,
        corrections,
        gate,
        members,
        buildNotes,
        hubMarkdown,
        profileSections: PROFILE_SECTION_ORDER,
        tier: v.snapshot?.tier ?? null,
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
      /** P1.15 — batch upload (§9.5: ≤50 files/batch). */
      quarantineKeys?: string[];
      text?: string;
      title?: string;
    };
    const keys = Array.isArray(body.quarantineKeys)
      ? body.quarantineKeys
      : body.quarantineKey
        ? [body.quarantineKey]
        : [];
    if (keys.length > 0 && !checkBatchSize(keys.length).ok) {
      return c.json({ error: "batch_too_large", limit: 50 }, 400);
    }
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const persona = await tx.query(`select id, slug from personas where id = $1 and deleted_at is null`, [personaId]);
      if (!persona.rows[0]) return null;
      const title = body.title?.trim() || "Sample";
      // One item write per file — the REQ-INGEST-8 verdict lands on the row: over-cap/unreadable
      // files still LIST, auto-omitted, counting against coverage.
      const writeItem = async (args: {
        markdown: string;
        title: string;
        provider: "upload" | "paste";
        quality: string | null;
        qualityNotes: string[];
        /** non-null ⇒ caps rejected the file: list it auto-omitted, no sample version needed. */
        rejectReason: string | null;
      }) => {
        const connectionId = await ensureConnection(tx, personaId, args.provider);
        const itemId = deps.ids("di");
        const words = wordCountOf(args.markdown);
        const { versionId } = await writePersonaArtifact(tx, {
          workspaceId: principal.workspaceId,
          personaId,
          kind: "sample",
          // PRB.16b F18 — the persona_builder seat mounts `docs/**` only (§12.6 verbatim; conventions/
          // personas.md: "docs/ is human-supplied and agent-read"). A `samples/` path was structurally
          // invisible — census self-reported blocked with "no docs/ directory". Corpus files the operator
          // supplies belong under `docs/`; the item id stays in the filename so the snapshot's sample_set
          // (itemId → sha) still correlates to the mounted file.
          mirrorPath: `docs/samples/${itemId}.md`,
          markdown: args.markdown,
          wordCount: words,
          actor: { kind: "user", userId: principal.userId },
        });
        const sampleVersionId = deps.ids("sv");
        const state = args.rejectReason ? "omitted" : "included";
        const quality = args.rejectReason ? "unreadable" : args.quality;
        const notes = args.rejectReason ? [args.rejectReason] : args.qualityNotes;
        // The item lands first (the version FKs to it), then its v1, then the head pointer — one tx.
        await tx.query(
          `insert into discovered_items (id, connection_id, external_id, title, word_count, access, state)
             values ($1,$2,$3,$4,$5,'free',$6)`,
          [itemId, connectionId, itemId, args.title, words, state],
        );
        await tx.query(
          `insert into sample_versions (id, discovered_item_id, n, content_sha256, artifact_version_id, quality, quality_notes, word_count)
             values ($1,$2,1,$3,$4,$5,$6,$7)`,
          [sampleVersionId, itemId, sha256Hex(new TextEncoder().encode(args.markdown)), versionId, quality, notes, words],
        );
        await tx.query(`update discovered_items set current_sample_id = $2 where id = $1`, [
          itemId,
          sampleVersionId,
        ]);
        return { itemId, sampleVersionId, rejected: args.rejectReason };
      };

      if (keys.length > 0) {
        if (!deps.converter) throw new Error("converter unavailable");
        const results: { itemId: string; rejected: string | null }[] = [];
        let pending = false;
        for (const raw of keys) {
          const qk = safeKey(raw, principal.workspaceId);
          if (!qk) return { error: "bad quarantineKey" };
          // PRB.21 — bound the wait (a cold convert Job runs ~2.5–4 min): still-converting ⇒
          // conversion_pending, never a multi-minute hold inside this transaction.
          const pv = await deps.converter.preview(qk, { waitMs: 25_000 });
          if (pv == null) {
            pending = true;
            continue; // report the rest; the client retries the pending key
          }
          const caps = sampleCaps({ format: pv.sourceFormat, words: pv.counts.words });
          results.push(
            await writeItem({
              markdown: pv.markdown,
              title,
              provider: "upload",
              quality: pv.quality,
              qualityNotes: [...pv.qualityNotes],
              rejectReason: caps.ok ? null : caps.reason,
            }),
          );
        }
        const facts = await corpusFacts(tx, personaId);
        const v = await loadVoiceStatus(tx, { personaId });
        return { items: results, pending, words: facts.words, status: v?.status ?? null };
      }

      if (typeof body.text !== "string" || !body.text.trim()) {
        return { error: "text or quarantineKey required" };
      }
      const caps = checkWordCount(wordCountOf(body.text));
      const out = await writeItem({
        markdown: body.text,
        title,
        provider: "paste",
        quality: null,
        qualityNotes: [],
        rejectReason: caps.ok ? null : caps.reason,
      });
      const facts = await corpusFacts(tx, personaId);
      const v = await loadVoiceStatus(tx, { personaId });
      return { itemId: out.itemId, sampleVersionId: out.sampleVersionId, words: facts.words, status: v?.status ?? null };
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    // a still-converting upload is a retryable 409, not a 400 bad-request (PRB.21).
    if ("error" in res) return c.json({ error: res.error }, res.error === "conversion_pending" ? 409 : 400);
    return c.json(res, 201);
  });

  // ---- POST /voices/:id/samples/url — the fetcher-only URL path (§12.6; REQ-PERSONA-11). A
  // publication link becomes a corpus piece through the persona builder's fetcher service
  // (SSRF-guarded, robots-respecting, parsing nothing) + the converter's canonical markdown —
  // NEVER a credentialed/session fetch: the api holds no auth material to fetch with (AC-I-B is
  // structural). The discovered_item records the canonical URL so the hold-out spec can carry it
  // into the run's URL policy. ----
  app.post("/voices/:id/samples/url", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { url?: string; title?: string };
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!/^https?:\/\//i.test(rawUrl)) return c.json({ error: "http(s) url required" }, 400);
    if (!deps.urlFetcher) return c.json({ error: "url_fetch_unavailable" }, 501);
    const url = normalizeUrl(rawUrl);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const persona = await tx.query(`select id from personas where id = $1 and deleted_at is null`, [personaId]);
      if (!persona.rows[0]) return null;
      // Dedupe on the canonical URL — re-adding a link returns the existing item (the include
      // toggle, not a second copy, is the "use it again" path).
      const existing = await tx.query(
        `select di.id from discovered_items di join connections cn on cn.id = di.connection_id
          where cn.persona_id = $1 and di.url = $2 limit 1`,
        [personaId, url],
      );
      const ex = existing.rows[0] as { id: string } | undefined;
      if (ex) return { itemId: ex.id, deduped: true };
      return { itemId: null };
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    if (res.deduped) {
      const v = await deps.txRunner.run(principal.workspaceId, (tx) => loadVoiceStatus(tx, { personaId }));
      return c.json({ itemId: res.itemId, deduped: true, status: v?.status ?? null }, 200);
    }
    // Fetch OUTSIDE the write tx (network bound; the fetcher is the only egress path).
    const fetched = await deps.urlFetcher.fetch(url);
    if (!fetched.ok) return c.json({ error: "fetch_failed", reason: fetched.reason }, 422);
    const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const persona = await tx.query(`select id from personas where id = $1 and deleted_at is null`, [personaId]);
      if (!persona.rows[0]) return null;
      const connectionId = await ensureConnection(tx, personaId, "url");
      const itemId = deps.ids("di");
      const words = wordCountOf(fetched.markdown);
      const { versionId } = await writePersonaArtifact(tx, {
        workspaceId: principal.workspaceId,
        personaId,
        kind: "sample",
        mirrorPath: `docs/samples/${itemId}.md`,
        markdown: fetched.markdown,
        wordCount: words,
        actor: { kind: "user", userId: principal.userId },
      });
      const sampleVersionId = deps.ids("sv");
      await tx.query(
        `insert into discovered_items (id, connection_id, external_id, title, url, word_count, access, state)
           values ($1,$2,$3,$4,$5,$6,'free','included')`,
        [itemId, connectionId, url, body.title?.trim() || fetched.title || url, url, words],
      );
      await tx.query(
        `insert into sample_versions (id, discovered_item_id, n, content_sha256, artifact_version_id, word_count)
           values ($1,$2,1,$3,$4,$5)`,
        [sampleVersionId, itemId, sha256Hex(new TextEncoder().encode(fetched.markdown)), versionId, words],
      );
      await tx.query(`update discovered_items set current_sample_id = $2 where id = $1`, [
        itemId,
        sampleVersionId,
      ]);
      const facts = await corpusFacts(tx, personaId);
      const v = await loadVoiceStatus(tx, { personaId });
      return { itemId, sampleVersionId, words: facts.words, status: v?.status ?? null };
    });
    if (!out) return c.json({ error: "not_found" }, 404);
    return c.json(out, 201);
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
      const owns = await tx.query(`select id from personas where id = $1 and deleted_at is null`, [c.req.param("id")]);
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
        `select id, byline, registers, seed_artifact_id from personas where id = $1 and deleted_at is null`,
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
      const persona = await tx.query(`select id from personas where id = $1 and deleted_at is null`, [personaId]);
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
      /** §9.2 approve_sample knobs frozen into inputs. */
      sampleCap?: number;
      calibration?: boolean;
      /** multi-register voices pick ONE register for the run (§9.6; feeds `inputs.register`). */
      register?: string;
    };
    const tier = body.tier === "full" ? "full" : "quick";
    const modelTier: ModelTier =
      body.modelTier === "frontier" ? "frontier" : body.modelTier === "balanced" ? "balanced" : "base";
    const ctx = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const pres = await tx.query(
        `select id, display_name, byline, registers, seed_sha256, seed_artifact_id from personas where id = $1 and deleted_at is null`,
        [personaId],
      );
      const persona = pres.rows[0] as
        | { id: string; display_name: string | null; byline: string | null; registers: string[] | null; seed_sha256: string | null; seed_artifact_id: string | null }
        | undefined;
      if (!persona) return null;
      // Persona exclusivity (§12.3): one open build/refresh/calibrate run per persona — a second click is
      // a 409 naming the open run, not a second run row.
      const open = await tx.query(
        `select id from runs
          where persona_id = $1 and workflow in ('profile_voice','refresh_voice','calibrate_voice','reseed_charter')
            and state = any($2::text[])
          order by created_at desc limit 1`,
        [personaId, PRETERMINAL_STATES],
      );
      const openRun = (open.rows[0] as { id: string } | undefined)?.id;
      if (openRun) return { error: "build_in_progress", runId: openRun };
      const facts = await corpusFacts(tx, personaId);
      // The §9.2 gates: name + (description OR ≥1 sample); Full Profile additionally needs ≥4
      // included samples with ≥2 readable pieces of ≥10 words (the hold-out math).
      const readStore = await storeFor(principal.workspaceId);
      let description = "";
      if (persona.seed_artifact_id && readStore) {
        const head = await tx.query(
          `select av.content_sha256 from artifact_versions av join artifacts a on a.id = av.artifact_id
            where a.id = $1 and av.id = a.head_version_id`,
          [persona.seed_artifact_id],
        );
        const sha = (head.rows[0] as { content_sha256: string } | undefined)?.content_sha256;
        if (sha) {
          const bytes = await readStore.get(sha).catch(() => null);
          if (bytes) description = new TextDecoder().decode(bytes);
        }
      }
      const itemRows = (
        await tx.query(
          `select di.id, di.url, sv.word_count from discovered_items di
             join connections cn on cn.id = di.connection_id
             join sample_versions sv on sv.id = di.current_sample_id
            where cn.persona_id = $1 and di.state in ('included','removed_remote')`,
          [personaId],
        )
      ).rows as { id: string; url: string | null; word_count: number | null }[];
      const gateCheck = checkVoiceBuildGate({
        name: persona.display_name ?? "",
        description,
        tier,
        includedSamples: itemRows.length,
        readableSamples: itemRows.filter((r) => (r.word_count ?? 0) >= FULL_PROFILE_MIN_READABLE_WORDS).length,
      });
      if (!gateCheck.ok) return { error: gateCheck.reason, message: gateCheck.message };
      // The deterministic hold-out pick (§9.5): the first ≥100-word included piece by item id —
      // a Full build only (Quick Voice has no calibration phase to hold out for).
      const heldId = tier === "full" ? pickHoldout(itemRows.map((r) => ({ itemId: r.id, words: r.word_count ?? 0 }))) : null;
      const heldRow = heldId ? itemRows.find((r) => r.id === heldId)! : null;
      const holdouts: HoldoutSpec | null = heldRow
        ? {
            itemId: heldRow.id,
            url: heldRow.url,
            mirrorPath: holdoutMirrorPath(heldRow.id),
            words: heldRow.word_count ?? 0,
            revealedAt: null,
          }
        : null;
      return { persona, facts, holdouts, itemRows };
    });
    if (!ctx) return c.json({ error: "not_found" }, 404);
    if ("error" in ctx) {
      const code = ctx.error === "build_in_progress" ? 409 : 400;
      return c.json({ error: ctx.error, message: "message" in ctx ? ctx.message : undefined, ...("runId" in ctx ? { runId: ctx.runId } : {}) }, code);
    }
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
      inputs: {
        personaId,
        tier,
        snapshot: snapshotFacts,
        // §12.6 — the persona builder's URL policy: the hold-out URL is denied to every non-calibrator
        // fetch and opened to the calibrator only after its prediction file exists; every fetch rides
        // the client fetcher (serverFetchDisabled) — there is no credentialed path to abuse.
        ...(ctx.holdouts ? { holdouts: ctx.holdouts } : {}),
        urlPolicy: {
          holdouts: ctx.holdouts?.url ? [ctx.holdouts.url] : [],
          userExclusions: [],
          calibratorAllow: ctx.holdouts?.url ? [ctx.holdouts.url] : [],
          predictionFileWritten: false,
          serverFetchDisabled: true,
          blockedDomains: [],
        },
        // the approve_sample card's knobs (§9.2): the decision's structured edits ride back on the
        // gate resolution; the card reads the frozen defaults.
        sampleCap: typeof body.sampleCap === "number" ? body.sampleCap : 40,
        calibration: body.calibration !== false,
        ...(typeof body.register === "string" && body.register ? { register: body.register } : {}),
        estimateCredits: est.estimateCredits,
        capCredits: est.capCredits,
        modelTier,
      },
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

  // ---- The Update-voice verb's routed estimate + launch (§9.3; REQ-SPEC-27). GET returns the
  // routed scope + sentence + estimate BEFORE consent — the sheet shows exactly these. ----
  const updatePlan = async (workspaceId: string, personaId: string) =>
    deps.txRunner.run(workspaceId, async (tx) => {
      const v = await loadVoiceStatus(tx, { personaId });
      if (!v) return null;
      const route = routeVoiceUpdate({ status: v.status, snapshot: v.snapshot });
      const upgrade = routeVoiceUpgrade(v.snapshot);
      const facts = await corpusFacts(tx, personaId);
      return { v, route, upgrade, facts };
    });

  app.get("/voices/:id/update", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const plan = await updatePlan(principal.workspaceId, c.req.param("id"));
    if (!plan) return c.json({ error: "not_found" }, 404);
    const estimate = plan.route.workflow
      ? estimateForRoute(plan)
      : null;
    const upgradeEstimate = plan.upgrade?.workflow ? estimateForWorkflow("refresh_voice", "full", plan.facts) : null;
    return c.json({ route: plan.route, estimate, upgrade: plan.upgrade, upgradeEstimate });
  });

  const estimateForWorkflow = (
    workflow: "profile_voice" | "refresh_voice" | "calibrate_voice",
    variant: string | undefined,
    facts: { words: number; sampleSet: Record<string, string> },
  ) =>
    buildEstimate({
      workflow,
      rigor: "standard",
      modelTier: "base",
      inputs: {
        words: facts.words,
        piecesRead: Object.keys(facts.sampleSet).length,
        holdouts: 1,
      },
      ...(variant ? { variant } : {}),
    });

  const estimateForRoute = (
    plan: { route: ReturnType<typeof routeVoiceUpdate>; facts: { words: number; sampleSet: Record<string, string> }; v: { snapshot: { sampleSet: Record<string, string> } | null } },
  ) => {
    const { route, facts, v } = plan;
    if (!route.workflow) return null;
    if (route.scope === "delta") {
      // REQ-PERSONA-16 — the delta prices only the changed pieces (per-hash corpus notes persist),
      // sized against the same estimator shape the full build uses so the <30% claim is checkable.
      const snapSet = v.snapshot?.sampleSet ?? {};
      const changedIds = Object.keys(facts.sampleSet).filter(
        (id) => !(id in snapSet) || snapSet[id] !== facts.sampleSet[id],
      );
      return buildEstimate({
        workflow: "refresh_voice",
        rigor: "standard",
        modelTier: "base",
        inputs: { words: Math.ceil(facts.words * (changedIds.length / Math.max(1, Object.keys(facts.sampleSet).length))), piecesRead: Math.max(1, changedIds.length), holdouts: 1 },
        variant: "full",
      });
    }
    return estimateForWorkflow(
      route.workflow,
      route.workflow === "profile_voice" ? (route.inputs.tier ?? "full") : route.workflow === "refresh_voice" ? "full" : undefined,
      facts,
    );
  };

  app.post("/voices/:id/update", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      /** 'full_from_quick' opts into the upgrade; absent ⇒ the routed scope wins (§9.3 one verb). */
      scope?: string;
      register?: string;
      modelTier?: string;
      idempotencyKey?: string;
    };
    const plan = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const v = await loadVoiceStatus(tx, { personaId });
      if (!v) return null;
      const route =
        body.scope === "full_from_quick"
          ? routeVoiceUpgrade(v.snapshot)
          : routeVoiceUpdate({ status: v.status, snapshot: v.snapshot });
      if (!route || !route.workflow) return { error: "nothing_to_update" as const };
      // Persona exclusivity — same guard as /build.
      const open = await tx.query(
        `select id from runs
          where persona_id = $1 and workflow in ('profile_voice','refresh_voice','calibrate_voice','reseed_charter')
            and state = any($2::text[])
          order by created_at desc limit 1`,
        [personaId, PRETERMINAL_STATES],
      );
      const openRun = (open.rows[0] as { id: string } | undefined)?.id;
      if (openRun) return { error: "build_in_progress" as const, runId: openRun };
      const facts = await corpusFacts(tx, personaId);
      // The refresh's hold-out: the current profile's recorded hold-out first, else a fresh pick
      // (§9.5 — the same piece stays held out across refreshes once chosen).
      const priorHold = (v.profile?.buildNote?.holdouts ?? null) as HoldoutSpec | null;
      let holdouts: HoldoutSpec | null = priorHold;
      if (!holdouts && route.scope !== "synth") {
        const itemRows = (
          await tx.query(
            `select di.id, di.url, sv.word_count from discovered_items di
               join connections cn on cn.id = di.connection_id
               join sample_versions sv on sv.id = di.current_sample_id
              where cn.persona_id = $1 and di.state in ('included','removed_remote')`,
            [personaId],
          )
        ).rows as { id: string; url: string | null; word_count: number | null }[];
        const heldId = pickHoldout(itemRows.map((r) => ({ itemId: r.id, words: r.word_count ?? 0 })));
        const heldRow = heldId ? itemRows.find((r) => r.id === heldId) : null;
        if (heldRow) {
          holdouts = {
            itemId: heldRow.id,
            url: heldRow.url,
            mirrorPath: holdoutMirrorPath(heldRow.id),
            words: heldRow.word_count ?? 0,
            revealedAt: null,
          };
        }
      }
      return { v, route, facts, holdouts };
    });
    if (!plan) return c.json({ error: "not_found" }, 404);
    if ("error" in plan) return c.json({ error: plan.error, ...("runId" in plan ? { runId: plan.runId } : {}) }, plan.error === "build_in_progress" ? 409 : 400);
    const modelTier: ModelTier =
      body.modelTier === "frontier" ? "frontier" : body.modelTier === "balanced" ? "balanced" : "base";
    const { route } = plan;
    const workflow = route.workflow!;
    const tier = route.inputs.tier ?? (plan.v.snapshot?.tier === "quick" ? "quick" : "full");
    const est = estimateForRoute(plan) ?? estimateForWorkflow(workflow, undefined, plan.facts);
    const snapshotFacts = {
      seed_sha256: plan.v.persona.seed_sha256,
      sample_set_hash: sampleSetHash(plan.facts.sampleSet),
      sample_set: plan.facts.sampleSet,
      corpus_size_at_build: plan.facts.words,
      calibration_status: workflow === "calibrate_voice" ? "pending" : plan.v.snapshot?.calibrationStatus ?? "untested",
      tier,
    };
    const res = await createRun(deps, {
      idempotencyKey: body.idempotencyKey ?? `voice-update:${personaId}:${deps.ids("idem")}`,
      workflow,
      workspaceId: principal.workspaceId,
      billingAccountId: principal.billingAccountId,
      requestedBy: principal.userId,
      personaId,
      seat: seatForWorkflow(workflow),
      modelProfile: { tier: modelTier },
      modelTier,
      rigor: "standard",
      estimateCredits: est.estimateCredits,
      capCredits: est.capCredits,
      rateTableVersion: est.rateTableVersion,
      phaseClassesUsed: phaseClassesForWorkflow(workflow),
      inputs: {
        personaId,
        ...route.inputs,
        tier,
        snapshot: snapshotFacts,
        ...(plan.holdouts ? { holdouts: plan.holdouts } : {}),
        urlPolicy: {
          holdouts: plan.holdouts?.url ? [plan.holdouts.url] : [],
          userExclusions: [],
          calibratorAllow: plan.holdouts?.url ? [plan.holdouts.url] : [],
          predictionFileWritten: false,
          serverFetchDisabled: true,
          blockedDomains: [],
        },
        ...(typeof body.register === "string" && body.register ? { register: body.register } : {}),
      },
      inputSnapshot: {
        wordCount: plan.facts.words,
        sampleCount: Object.keys(plan.facts.sampleSet).length,
        scope: route.scope,
      },
      sheetLaunched: true,
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
    return c.json({ runId: res.runId, state: res.state, deduped: res.deduped, route, estimate: est }, res.deduped ? 200 : 201);
  });

  // ---- POST /voices/:id/corrections — the ONLY profile-correction path (§9.4; REQ-PERSONA-7).
  // "Correct this in your description": the wrong statement lands as a blockquote on PERSONA.md
  // (a new seed version) + a profile_corrections row targets it; the NEXT build consumes it
  // (consumed_by_profile_id stamps at finalize) and never re-applies it. ----
  app.post("/voices/:id/corrections", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      text?: string;
      statementRef?: string;
      artifactId?: string;
      source?: string;
    };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return c.json({ error: "text required" }, 400);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const v = await loadVoiceStatus(tx, { personaId });
      if (!v) return null;
      // 1 — the blockquote insert: the correction lands on PERSONA.md as a quoted observation with a
      //     prompt line (§9.4's correction affordance — the seed is the only authority a correction
      //     can amend). The seed hash recomputes; the pill flips to Description changed live.
      const readStore = await storeFor(principal.workspaceId);
      let seedMarkdown = "";
      if (v.persona.seed_artifact_id && readStore) {
        const head = await tx.query(
          `select av.content_sha256 from artifact_versions av join artifacts a on a.id = av.artifact_id
            where a.id = $1 and av.id = a.head_version_id`,
          [v.persona.seed_artifact_id],
        );
        const sha = (head.rows[0] as { content_sha256: string } | undefined)?.content_sha256;
        if (sha) {
          const bytes = await readStore.get(sha).catch(() => null);
          if (bytes) seedMarkdown = new TextDecoder().decode(bytes);
        }
      }
      const blockquote = `> ${text.replace(/\n/g, "\n> ")}\n\n_What the profile got wrong — carry this correction into the next build._\n`;
      const newSeed = seedMarkdown.trim() === "" ? blockquote : `${seedMarkdown.replace(/\s+$/, "")}\n\n${blockquote}`;
      await writeSeedVersion(tx, {
        workspaceId: principal.workspaceId,
        personaId,
        seedArtifactId: v.persona.seed_artifact_id,
        markdown: newSeed,
        actor: { kind: "user", userId: principal.userId },
      });
      const seedSha256 = computeSeedHash({
        description: newSeed,
        byline: v.persona.byline,
        registers: v.persona.registers,
      });
      await tx.query(
        `update personas set seed_sha256 = $2, seed_authored_by = 'user', seed_updated_at = now() where id = $1`,
        [personaId, seedSha256],
      );
      // 2 — the correction row: profile_id targets the profile it corrects (null-safe for a
      //     never-built voice); consumed_by_profile_id stays NULL until the next build consumes it.
      const correctionId = deps.ids("pc");
      await tx.query(
        `insert into profile_corrections (id, persona_id, profile_id, target_artifact_id, statement_ref, text, source)
           values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          correctionId,
          personaId,
          v.profile?.id ?? null,
          typeof body.artifactId === "string" ? body.artifactId : null,
          typeof body.statementRef === "string" ? body.statementRef : null,
          text,
          typeof body.source === "string" ? body.source : "user",
        ],
      );
      const after = await loadVoiceStatus(tx, { personaId });
      return { correctionId, seedSha256, status: after?.status ?? null };
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    return c.json(res, 201);
  });

  // ---- POST /voices/:id/fork — the House-style/shared fork affordance (§9.1): a read-only card's
  //  copy becomes an editable persona in YOUR voices — the seed text + included sample references
  //  copy; nothing on the source persona changes. ----
  app.post("/voices/:id/fork", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const v = await loadVoiceStatus(tx, { personaId });
      if (!v) return null;
      const forkId = deps.ids("persona");
      await tx.query(
        `insert into personas (id, workspace_id, display_name, byline, mode, kind, provenance, registers,
                               seed_sha256, seed_authored_by, seed_updated_at)
           values ($1,$2,$3,$4,$5,'leaf','user',$6,$7,'persona_builder',now())`,
        [
          forkId,
          principal.workspaceId,
          `${v.persona.display_name ?? "Voice"} (fork)`,
          v.persona.byline,
          v.persona.mode === "house" ? "self" : v.persona.mode,
          v.persona.registers ?? [],
          v.persona.seed_sha256,
        ],
      );
      // Copy the seed text (new artifact on the fork; the content-addressed bytes are shared).
      if (v.persona.seed_artifact_id) {
        const head = await tx.query(
          `select av.content_sha256, av.s3_key, av.bytes, av.word_count from artifact_versions av
             join artifacts a on a.id = av.artifact_id where a.id = $1 and av.id = a.head_version_id`,
          [v.persona.seed_artifact_id],
        );
        const hv = head.rows[0] as { content_sha256: string; s3_key: string; bytes: number; word_count: number | null } | undefined;
        if (hv) {
          const artId = deps.ids("art");
          const verId = deps.ids("av");
          await tx.query(
            `insert into artifacts (id, workspace_id, persona_id, kind, namespace, mirror_path, head_version_id)
               values ($1,$2,$3,'persona_seed','persona','PERSONA.md',$4)`,
            [artId, principal.workspaceId, forkId, verId],
          );
          await tx.query(
            `insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
               values ($1,$2,1,$3,$4,$5,$6,'text/markdown',$7::jsonb,false)`,
            [verId, artId, hv.content_sha256, hv.s3_key, hv.bytes, hv.word_count, JSON.stringify({ kind: "user", userId: principal.userId })],
          );
          await tx.query(`update personas set seed_artifact_id = $2 where id = $1`, [forkId, artId]);
        }
      }
      // Copy the included corpus by reference: a new 'url'-less fork connection + discovered_items
      // + sample_versions rows pointing at the SAME content-addressed artifact versions.
      const connId = deps.ids("cn");
      await tx.query(
        `insert into connections (id, persona_id, provider, status, auto_include_new)
           values ($1,$2,'fork','ok',true)`,
        [connId, forkId],
      );
      const items = (
        await tx.query(
          `select di.id, di.external_id, di.title, di.url, di.date, di.word_count, di.access,
                  sv.id as sv_id, sv.content_sha256, sv.artifact_version_id, sv.quality, sv.quality_notes, sv.word_count as sv_words
             from discovered_items di join connections cn on cn.id = di.connection_id
              join sample_versions sv on sv.id = di.current_sample_id
            where cn.persona_id = $1 and di.state in ('included','removed_remote')`,
          [personaId],
        )
      ).rows as {
        id: string; external_id: string | null; title: string | null; url: string | null; date: string | null;
        word_count: number | null; access: string | null; sv_id: string; content_sha256: string;
        artifact_version_id: string | null; quality: string | null; quality_notes: string[] | null; sv_words: number | null;
      }[];
      for (const it of items) {
        const newItem = deps.ids("di");
        const newSv = deps.ids("sv");
        await tx.query(
          `insert into discovered_items (id, connection_id, external_id, title, url, date, word_count, access, state)
             values ($1,$2,$3,$4,$5,$6,$7,$8,'included')`,
          [newItem, connId, newItem, it.title, it.url, it.date, it.sv_words ?? it.word_count, it.access],
        );
        await tx.query(
          `insert into sample_versions (id, discovered_item_id, n, content_sha256, artifact_version_id, quality, quality_notes, word_count)
             values ($1,$2,1,$3,$4,$5,$6,$7)`,
          [newSv, newItem, it.content_sha256, it.artifact_version_id, it.quality, it.quality_notes, it.sv_words],
        );
        await tx.query(`update discovered_items set current_sample_id = $2 where id = $1`, [newItem, newSv]);
      }
      const after = await loadVoiceStatus(tx, { personaId: forkId });
      return { personaId: forkId, status: after?.status ?? null };
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    return c.json(res, 201);
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
        // P1.14 — the pin trails the persona's current profile ⇒ the adopt/fork hatches show (§9.6).
        pinnedStale: p.persona_profile_snapshot_id != null && p.persona_profile_snapshot_id !== v.profile?.id,
      };
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    return c.json(res);
  });

  // ---- PATCH /projects/:id/voice — REQ-DATA-32's project voice pin. The snapshot resolves to the
  // persona's current profile unless the caller names one (§9.6: the project pins the profile used).
  // `personaId: null` selects "No voice" — the ad-hoc default (REQ-PERSONA-20). `register` picks ONE
  // register on a multi-register voice (§9.6; feeds `inputs.register` at run launch).
  //
  // THE SOFT LOCK (§9.6; REQ-DATA-30/31): once the project has a v1 (a committed draft), a DIRECT
  // voice change is rejected — the response names the two hatches: Fork under another voice
  // (POST …/voice/fork) or Adopt the refreshed profile (POST …/voice/adopt). Register-only changes
  // stay open (they're a run input, not a voice change). ----
  app.patch("/projects/:id/voice", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      personaId?: string | null;
      profileSnapshotId?: string | null;
      register?: string | null;
    };
    const projectId = c.req.param("id");
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const proj = await tx.query(
        `select id, persona_id, persona_profile_snapshot_id, register from projects where id = $1`,
        [projectId],
      );
      const p = proj.rows[0] as
        | { id: string; persona_id: string | null; persona_profile_snapshot_id: string | null; register: string | null }
        | undefined;
      if (!p) return null;
      // A voice change is any personaId write that differs from the pin — including `null`
      // ("No voice"). The soft lock fires on ALL of them once a draft exists (§9.6).
      const voiceChange = body.personaId !== undefined && body.personaId !== p.persona_id;
      if (voiceChange) {
        const v1 = await tx.query(`select id from drafts where project_id = $1 limit 1`, [projectId]);
        if (v1.rows[0]) {
          return {
            error: "voice_locked" as const,
            // The two hatches, named verbatim for the UI (§9.6).
            hatches: ["fork", "adopt"] as const,
          };
        }
      }
      // A register-only patch is always allowed — it feeds the run input, never the pin.
      if (body.register !== undefined) {
        await tx.query(`update projects set register = $2 where id = $1`, [projectId, body.register]);
      }
      if (body.personaId === undefined) {
        // Register-only (or no-op) patch — echo the current facts.
        const after = await tx.query(`select register from projects where id = $1`, [projectId]);
        return {
          voiceMode: p.persona_id ? ("linked" as const) : ("ad_hoc" as const),
          personaId: p.persona_id,
          profileSnapshotId: p.persona_profile_snapshot_id,
          register: (after.rows[0] as { register: string | null }).register,
          status: null,
        };
      }
      if (body.personaId == null) {
        await tx.query(
          `update projects set persona_id = null, persona_profile_snapshot_id = null where id = $1`,
          [projectId],
        );
        return { voiceMode: "ad_hoc" as const, personaId: null, profileSnapshotId: null, status: null };
      }
      const persona = await tx.query(`select id from personas where id = $1 and deleted_at is null`, [body.personaId]);
      if (!persona.rows[0]) return { error: "persona_not_found" };
      let snapshotId = typeof body.profileSnapshotId === "string" ? body.profileSnapshotId : null;
      if (!snapshotId) {
        const p2 = await tx.query(
          `select id from persona_profiles where persona_id = $1 order by built_at desc limit 1`,
          [body.personaId],
        );
        snapshotId = (p2.rows[0] as { id: string } | undefined)?.id ?? null;
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
    if ("error" in res) {
      if (res.error === "voice_locked") return c.json({ error: "voice_locked", hatches: res.hatches }, 409);
      return c.json({ error: res.error }, 400);
    }
    return c.json(res);
  });

  // ---- POST /projects/:id/voice/adopt — hatch 1 (§9.6; REQ-DATA-31): the project KEEPS its voice and
  //  adopts the persona's newer profile snapshot (`persona_profile_snapshot_id` → the current build).
  //  `reseed: true` additionally launches a `reseed_charter` run that re-seeds the voice-derived
  //  charter lines — never the guidance lines — and the decision lands in the project's Decisions
  //  log (REQ-WF-11's persona half). ----
  app.post("/projects/:id/voice/adopt", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { reseed?: boolean; modelTier?: string; idempotencyKey?: string };
    const ctx = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const proj = await tx.query(
        `select id, persona_id, persona_profile_snapshot_id from projects where id = $1`,
        [projectId],
      );
      const p = proj.rows[0] as
        | { id: string; persona_id: string | null; persona_profile_snapshot_id: string | null }
        | undefined;
      if (!p) return null;
      if (!p.persona_id) return { error: "no_voice" as const };
      const latest = await tx.query(
        `select id from persona_profiles where persona_id = $1 order by built_at desc limit 1`,
        [p.persona_id],
      );
      const snapshotId = (latest.rows[0] as { id: string } | undefined)?.id ?? null;
      if (!snapshotId) return { error: "no_profile" as const };
      await tx.query(
        `update projects set persona_profile_snapshot_id = $2, persona_locked_at = now() where id = $1`,
        [projectId, snapshotId],
      );
      // The decision log (§9.6 "logs the decision"): an answered decision_request records the adopt —
      // it lands in the project's Decisions list alongside the run card when a reseed launches.
      await tx.query(
        `insert into decision_requests (id, project_id, text, options, state, answer)
           values ($1,$2,$3,$4,'answered',$5)`,
        [
          deps.ids("dr"),
          projectId,
          `Adopted the refreshed voice profile${body.reseed ? " and reseeded the charter" : ""}`,
          ["adopt", "fork"],
          "adopt",
        ],
      );
      const v = await loadVoiceStatus(tx, { personaId: p.persona_id });
      return { p, snapshotId, status: v?.status ?? null, personaId: p.persona_id };
    });
    if (!ctx) return c.json({ error: "not_found" }, 404);
    if ("error" in ctx) return c.json({ error: ctx.error }, 400);
    // The optional charter reseed (§9.6): a reseed_charter run over the adopted snapshot — the run
    // rewrites the charter's voice-derived lines only; guidance lines are never its output's scope.
    let reseedRun: { runId: string; state: string } | null = null;
    if (body.reseed) {
      const est = buildEstimate({
        workflow: "reseed_charter",
        rigor: "standard",
        modelTier: "base",
        inputs: { words: 0 },
      });
      const res = await createRun(deps, {
        idempotencyKey: body.idempotencyKey ?? `voice-adopt:${projectId}:${deps.ids("idem")}`,
        workflow: "reseed_charter",
        workspaceId: principal.workspaceId,
        billingAccountId: principal.billingAccountId,
        requestedBy: principal.userId,
        projectId,
        personaId: ctx.personaId,
        seat: seatForWorkflow("reseed_charter"),
        modelProfile: { tier: "base" },
        modelTier: "base",
        rigor: "standard",
        estimateCredits: est.estimateCredits,
        capCredits: est.capCredits,
        rateTableVersion: est.rateTableVersion,
        phaseClassesUsed: phaseClassesForWorkflow("reseed_charter"),
        inputs: {
          projectId,
          personaId: ctx.personaId,
          profileSnapshotId: ctx.snapshotId,
          priorSnapshotId: ctx.p.persona_profile_snapshot_id,
        },
        inputSnapshot: { adopt: true },
        sheetLaunched: true,
        lockSetSpec: { personaId: ctx.personaId },
      });
      if (!res.ok) {
        if (res.reason === "insufficient_balance") return c.json({ error: res.reason, required: res.required }, 402);
        return c.json({ error: res.reason }, 422);
      }
      reseedRun = { runId: res.runId, state: res.state };
      if (res.state === "queued") {
        await deps.queue.send(
          RUN_JOBS.start,
          { runId: res.runId, workspaceId: principal.workspaceId },
          { singletonKey: res.runId },
        );
      }
    }
    return c.json({
      adopted: true,
      personaId: ctx.personaId,
      profileSnapshotId: ctx.snapshotId,
      status: ctx.status,
      reseedRun,
    });
  });

  // ---- POST /projects/:id/voice/fork — hatch 2 (§9.6; REQ-DATA-30): a NEW project at `outlined`
  //  with the copied outline + the new voice; the original project is untouched. ----
  app.post("/projects/:id/voice/fork", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { personaId?: string; title?: string };
    if (!body.personaId) return c.json({ error: "personaId required" }, 400);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const src = (
        await tx.query(
          `select id, title, slug, protocol_id, protocol_version, venue, register, approval_policy,
                  approval_overrides, rigor_default, model_tier_default, paper_theme
             from projects where id = $1`,
          [projectId],
        )
      ).rows[0] as
        | {
            id: string; title: string; slug: string; protocol_id: string | null; protocol_version: number;
            venue: string | null; register: string | null; approval_policy: string; approval_overrides: unknown;
            rigor_default: string; model_tier_default: string | null; paper_theme: string;
          }
        | undefined;
      if (!src) return null;
      const persona = await tx.query(`select id from personas where id = $1 and deleted_at is null`, [body.personaId]);
      if (!persona.rows[0]) return { error: "persona_not_found" as const };
      const snapshot = (
        await tx.query(
          `select id from persona_profiles where persona_id = $1 order by built_at desc limit 1`,
          [body.personaId],
        )
      ).rows[0] as { id: string } | undefined;
      const newId = deps.ids("proj");
      const slug = await uniqueVoiceSlug(tx, principal.workspaceId, `${src.slug}-fork`);
      // The fork lands at `outlined`: outline artifacts copy, drafts do NOT (no draft ⇒ the derived
      // project state is `outlined` — the copy resumes from the outline, never mid-draft).
      await tx.query(
        `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id, protocol_version, venue,
                               persona_id, persona_profile_snapshot_id, register, persona_locked_at,
                               approval_policy, approval_overrides, rigor_default, model_tier_default, paper_theme)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          newId, principal.workspaceId, principal.userId, body.title?.trim() || `${src.title} (fork)`, slug,
          src.protocol_id, src.protocol_version, src.venue, body.personaId, snapshot?.id ?? null,
          src.register, deps.clock.now(), src.approval_policy,
          src.approval_overrides == null ? null : JSON.stringify(src.approval_overrides),
          src.rigor_default, src.model_tier_default, src.paper_theme,
        ],
      );
      await tx.query(
        `insert into project_members (project_id, user_id, role) values ($1,$2,'admin') on conflict do nothing`,
        [newId, principal.userId],
      );
      const srcArtifacts = (
        await tx.query(
          `select kind, namespace, mirror_path, head_version_id from artifacts
             where project_id = $1 and kind = 'outline'`,
          [projectId],
        )
      ).rows as { kind: string; namespace: string; mirror_path: string; head_version_id: string | null }[];
      for (const a of srcArtifacts) {
        await tx.query(
          `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
             values ($1,$2,$3,$4,$5,$6,$7)`,
          [deps.ids("art"), principal.workspaceId, newId, a.kind, a.namespace, a.mirror_path, a.head_version_id],
        );
      }
      return { projectId: newId, slug, personaId: body.personaId, profileSnapshotId: snapshot?.id ?? null };
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    if ("error" in res) return c.json({ error: res.error }, 400);
    return c.json(res, 201);
  });

  // ---- GET /projects/:id/voice/reseed-preview — the adopt dialog's diff (§9.6 "shows the diff
  //  before commit"): the current charter's seeded lines vs the reseeded rendering. Guidance lines
  //  (everything under the charter's Guidance heading) NEVER appear in the diff — reseed cannot
  //  touch them (editMode guidance_only). ----
  app.get("/projects/:id/voice/reseed-preview", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const proj = await tx.query(
        `select id, persona_id, persona_profile_snapshot_id from projects where id = $1`,
        [c.req.param("id")],
      );
      const p = proj.rows[0] as
        | { id: string; persona_id: string | null; persona_profile_snapshot_id: string | null }
        | undefined;
      if (!p || !p.persona_id) return null;
      const v = await loadVoiceStatus(tx, { personaId: p.persona_id });
      if (!v) return null;
      const readStore = await storeFor(principal.workspaceId);
      let current = "";
      const charter = (
        await tx.query(
          `select av.content_sha256 from artifacts a join artifact_versions av on av.id = a.head_version_id
            where a.project_id = $1 and a.mirror_path = 'agents/author/voice-charter.md'`,
          [p.id],
        )
      ).rows[0] as { content_sha256: string } | undefined;
      if (charter && readStore) {
        const bytes = await readStore.get(charter.content_sha256).catch(() => null);
        if (bytes) current = new TextDecoder().decode(bytes);
      }
      const next = reseededCharter({
        name: v.persona.display_name,
        byline: v.persona.byline,
        registers: v.persona.registers,
        currentCharter: current,
      });
      const guidance = guidanceSection(current);
      return {
        charterFound: current !== "",
        current,
        next,
        diff: lineDiff(current, next),
        // the server guarantees the guidance bytes carry verbatim — the diff can never show a
        // guidance line as changed (§9.6: reseed never touches guidance lines).
        guidancePreserved: guidance != null ? next.includes(guidance) : true,
      };
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    return c.json(res);
  });

  return app;
}
