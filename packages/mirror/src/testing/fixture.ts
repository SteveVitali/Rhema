// Deterministic fixtures for the mirror tests — a realistic per-seat tree seeded with REAL content (so the
// content_sha256 equals sha256(bytes) and the round-trip golden, REQ-DATA-9a, holds) across the three real
// project ids. Each project gets a shared dossier, both agent namespaces, `preferences.md`, and a persona
// profile including the voice files the Editor must never see — so the seat-mount exclusions (AC2) are proven
// against present-but-omitted files, not merely absent ones.

import type { SqlExecutor } from "../sql.js";
import { InMemoryContentStore, sha256Hex } from "../content-store.js";

const WS = "ws_mirror";
const USER = "usr_mirror";
const BILL = "bill_mirror";

/** The three real projects (ids match the @rhema/db real-project seed). */
export const REAL_PROJECTS = [
  { id: "proj_pv", personaId: "prs_pv", tag: "Politics of Visibility" },
  { id: "proj_sd", personaId: "prs_sd", tag: "Structure of Difference" },
  { id: "proj_cr", personaId: "prs_cr", tag: "Constitution of Reason" },
] as const;

export async function seedBase(exec: SqlExecutor): Promise<{ workspaceId: string; userId: string; billingAccountId: string }> {
  await exec.query(`insert into "user"(id, email) values ($1,$2) on conflict (id) do nothing`, [USER, `${USER}@example.test`]);
  await exec.query(`insert into billing_accounts(id) values ($1) on conflict (id) do nothing`, [BILL]);
  await exec.query(
    `insert into workspaces(id, kind, name, billing_account_id) values ($1,'personal','Mirror',$2) on conflict (id) do nothing`,
    [WS, BILL],
  );
  return { workspaceId: WS, userId: USER, billingAccountId: BILL };
}

let seq = 0;
function id(prefix: string): string {
  return `${prefix}_${(seq++).toString().padStart(4, "0")}`;
}

interface ArtifactSeed {
  scope: "project" | "persona";
  scopeId: string;
  kind: string;
  namespace: string;
  mirrorPath: string;
  content: string;
  immutable?: boolean;
}

/** Insert an artifact + its head version with real content stored in `store`. Returns the version id. */
export async function seedArtifact(
  exec: SqlExecutor,
  store: InMemoryContentStore,
  workspaceId: string,
  a: ArtifactSeed,
): Promise<{ artifactId: string; versionId: string; sha256: string }> {
  const sha = sha256Hex(a.content);
  const { key } = await store.put(workspaceId, sha, Buffer.from(a.content, "utf8"));
  const artifactId = id("art");
  const versionId = id("av");
  const projectId = a.scope === "project" ? a.scopeId : null;
  const personaId = a.scope === "persona" ? a.scopeId : null;
  await exec.query(
    `insert into artifacts(id, workspace_id, project_id, persona_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [artifactId, workspaceId, projectId, personaId, a.kind, a.namespace, a.mirrorPath, versionId],
  );
  await exec.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count,
       media_type, created_by, immutable)
     values ($1,$2,1,$3,$4,$5,$6,'text/markdown','{"kind":"system"}'::jsonb,$7)`,
    [versionId, artifactId, sha, key, Buffer.byteLength(a.content), a.content.split(/\s+/).length, a.immutable ?? false],
  );
  return { artifactId, versionId, sha256: sha };
}

export interface SeededMirrorProject {
  readonly projectId: string;
  readonly personaId: string;
  readonly draftId: string;
  readonly draftVersionId: string;
}

/** Seed one project's full tree (both seats' namespaces + the persona profile). */
export async function seedMirrorProject(
  exec: SqlExecutor,
  store: InMemoryContentStore,
  workspaceId: string,
  p: { id: string; personaId: string; tag: string },
): Promise<SeededMirrorProject> {
  await exec.query(
    `insert into projects(id, workspace_id, owner_id, title, slug) values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
    [p.id, workspaceId, USER, p.tag, `slug-${p.id}`],
  );
  await exec.query(
    `insert into personas(id, workspace_id, slug, display_name, mode, kind) values ($1,$2,$3,$4,'self','leaf')
       on conflict (id) do nothing`,
    [p.personaId, workspaceId, `voice-${p.id}`, `${p.tag} voice`],
  );

  const draft = await seedArtifact(exec, store, workspaceId, {
    scope: "project", scopeId: p.id, kind: "draft", namespace: "shared",
    mirrorPath: "drafts/v1.md", content: `# ${p.tag}\n\nThe draft body for ${p.tag}.\n`, immutable: true,
  });
  const draftId = id("dft");
  await exec.query(
    `insert into drafts(id, project_id, n, origin, state, promoted_version_id) values ($1,$2,1,'imported','frozen',$3)
       on conflict (id) do nothing`,
    [draftId, p.id, draft.versionId],
  );

  const projectArtifacts: ArtifactSeed[] = [
    { scope: "project", scopeId: p.id, kind: "editors_letter", namespace: "shared", mirrorPath: "correspondence/v1-review-1/editors-letter.md", content: `# Editor's letter — ${p.tag}\n` },
    { scope: "project", scopeId: p.id, kind: "source_note", namespace: "agent:author", mirrorPath: "agents/author/notebook.md", content: `Author notebook — ${p.tag}\n` },
    { scope: "project", scopeId: p.id, kind: "response_ledger", namespace: "agent:author", mirrorPath: "agents/author/ledgers/v1-response-ledger.md", content: `Response ledger — ${p.tag}\n` },
    { scope: "project", scopeId: p.id, kind: "source_note", namespace: "agent:editor", mirrorPath: "agents/editor/notes.md", content: `Editor notes — ${p.tag}\n` },
    { scope: "project", scopeId: p.id, kind: "preference_profile", namespace: "shared", mirrorPath: "preferences.md", content: `Preferences — ${p.tag}\n` },
  ];
  const personaArtifacts: ArtifactSeed[] = [
    { scope: "persona", scopeId: p.personaId, kind: "persona_seed", namespace: "persona", mirrorPath: "PERSONA.md", content: `Persona — ${p.tag}\n` },
    { scope: "persona", scopeId: p.personaId, kind: "profile_index", namespace: "persona", mirrorPath: "profile/index.md", content: `Profile index — ${p.tag}\n` },
    { scope: "persona", scopeId: p.personaId, kind: "voice_print", namespace: "persona", mirrorPath: "profile/voice-print.md", content: `Voice print — ${p.tag}\n` },
    { scope: "persona", scopeId: p.personaId, kind: "lexicon", namespace: "persona", mirrorPath: "profile/lexicon.md", content: `Lexicon — ${p.tag}\n` },
    { scope: "persona", scopeId: p.personaId, kind: "exemplars", namespace: "persona", mirrorPath: "profile/exemplars.md", content: `Exemplars — ${p.tag}\n` },
    { scope: "persona", scopeId: p.personaId, kind: "positions", namespace: "persona", mirrorPath: "profile/positions.md", content: `Positions — ${p.tag}\n` },
    { scope: "persona", scopeId: p.personaId, kind: "structure_repertoire", namespace: "persona", mirrorPath: "profile/structure-repertoire.md", content: `Structure — ${p.tag}\n` },
    { scope: "persona", scopeId: p.personaId, kind: "audience_venue", namespace: "persona", mirrorPath: "profile/audience-and-venue.md", content: `Audience — ${p.tag}\n` },
    { scope: "persona", scopeId: p.personaId, kind: "continuity", namespace: "persona", mirrorPath: "profile/continuity.md", content: `Continuity — ${p.tag}\n` },
  ];
  for (const a of [...projectArtifacts, ...personaArtifacts]) await seedArtifact(exec, store, workspaceId, a);

  return { projectId: p.id, personaId: p.personaId, draftId, draftVersionId: draft.versionId };
}

/** Seed all three real projects; returns their handles. */
export async function seedAllRealProjects(
  exec: SqlExecutor,
  store: InMemoryContentStore,
): Promise<{ workspaceId: string; projects: SeededMirrorProject[] }> {
  const { workspaceId } = await seedBase(exec);
  const projects: SeededMirrorProject[] = [];
  for (const p of REAL_PROJECTS) projects.push(await seedMirrorProject(exec, store, workspaceId, p));
  return { workspaceId, projects };
}

/** Insert a `runs` row for delivery/attestation tests. */
export async function seedRun(
  exec: SqlExecutor,
  args: { runId: string; workspaceId: string; projectId?: string; state?: string; attempt?: number },
): Promise<void> {
  await exec.query(
    `insert into runs(id, workspace_id, project_id, workflow, state, current_attempt, inputs, model_profile,
       model_tier, rigor, estimate_credits, cap_credits, rate_table_version)
     values ($1,$2,$3,'review',$4,$5,'{}'::jsonb,'balanced','balanced','standard',100,840,1)`,
    [args.runId, args.workspaceId, args.projectId ?? null, args.state ?? "finalizing", args.attempt ?? 1],
  );
}

/** Insert an allowed proxy fetch-log row (the meter of record) so cited⇒fetched passes for a url. */
export async function seedFetchLog(
  exec: SqlExecutor,
  args: { runId: string; url: string; normalizedUrl: string; kind?: string; decision?: string; attempt?: number },
): Promise<void> {
  await exec.query(
    `insert into fetch_log(run_id, ts, agent_label, attempt, kind, url, normalized_url, status, decision)
     values ($1, now(), 'editor', $2, $3, $4, $5, 200, $6)`,
    [args.runId, args.attempt ?? 1, args.kind ?? "fetch", args.url, args.normalizedUrl, args.decision ?? "allow"],
  );
}
