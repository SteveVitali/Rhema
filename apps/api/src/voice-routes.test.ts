import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import { createApp, type Principal } from "./index.js";

// PRB.10 — the voice surface end-to-end over PGlite (the deterministic AC legs): creation → paste →
// estimate → profile_voice{quick} build → the shared pill on every surface → the project pin → the run's
// FROZEN voice facts → the 405 derived-artifact gate → the no-cookie-shaped-column assertion (AC-I-B).
// Driven via Hono's app.request (no network, no live provider — AC1's live leg is DEFERRED).

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;
let store: InMemoryContentStore;
let app: ReturnType<typeof createApp>;

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
  store = new InMemoryContentStore();
  app = createApp({ ...deps, principal: () => principal(), db: db.client, contentStore: store });
});
afterEach(() => db.close());

const post = (path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patch = (path: string, body: unknown) =>
  app.request(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const put = (path: string, body: unknown) =>
  app.request(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function createVoice(name = "Ada"): Promise<string> {
  const res = await post("/voices", { name, description: "A terse register." });
  expect(res.status).toBe(201);
  return ((await res.json()) as { personaId: string }).personaId;
}
async function addSample(personaId: string, text: string, title = "S"): Promise<string> {
  const res = await post(`/voices/${personaId}/samples`, { text, title });
  expect(res.status).toBe(201);
  return ((await res.json()) as { itemId: string }).itemId;
}
/** Insert a finished profile snapshot (what the package phase writes on build completion). Defaults the
 *  frozen seed_sha256 to the persona's CURRENT hash — the build froze exactly what the seed was then. */
async function insertProfile(personaId: string, over: Record<string, unknown> = {}): Promise<string> {
  const id = `pp_${personaId}_${Math.random().toString(36).slice(2, 8)}`;
  const currentSeed = (
    (await db.pg.query(`select seed_sha256 from personas where id = $1`, [personaId])).rows[0] as
      | { seed_sha256: string | null }
      | undefined
  )?.seed_sha256;
  const sampleSet = (over.sample_set as Record<string, string>) ?? {};
  await db.pg.query(
    `insert into persona_profiles (id, persona_id, built_by_run_id, built_at, tier, seed_sha256,
        sample_set_hash, sample_set, corpus_size_at_build, calibration_status, artifact_ids)
       values ($1,$2,$3, now(), $4, $5, $6, $7::jsonb, $8, $9, '{}')`,
    [
      id,
      personaId,
      (over.built_by_run_id as string) ?? null,
      (over.tier as string) ?? "quick",
      over.seed_sha256 !== undefined ? (over.seed_sha256 as string | null) : currentSeed,
      (over.sample_set_hash as string) ?? null,
      JSON.stringify(sampleSet),
      (over.corpus_size_at_build as number) ?? 0,
      (over.calibration_status as string) ?? "untested",
    ],
  );
  return id;
}

describe("POST /voices + GET /voices — the §9.2 sheet + library", () => {
  it("creates a persona and the library row carries the never_built pill", async () => {
    const res = await post("/voices", { name: "Ada", description: "Short. Exact." });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { personaId: string; seedAuthoredBy: string; status: { state: string } };
    expect(created.seedAuthoredBy).toBe("user"); // a description was supplied
    expect(created.status.state).toBe("never_built");

    const list = await app.request("/voices");
    const { voices } = (await list.json()) as {
      voices: { personaId: string; name: string; status: { state: string; pill: { label: string } } }[];
    };
    const row = voices.find((v) => v.personaId === created.personaId);
    expect(row?.name).toBe("Ada");
    expect(row?.status.state).toBe("never_built");
    expect(row?.status.pill.label).toBe("No voice profile");
  });

  it("a blank description leaves the seed agent-drafted (marked until the first user edit)", async () => {
    const res = await post("/voices", { name: "Blank" });
    const created = (await res.json()) as { seedAuthoredBy: string };
    expect(created.seedAuthoredBy).toBe("persona_builder");
  });

  it("401 without a principal", async () => {
    const anon = createApp({ ...deps, principal: () => null, contentStore: store });
    expect((await anon.request("/voices", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await anon.request("/voices")).status).toBe(401);
  });
});

describe("samples (REQ-INGEST-1/4) + the live estimate (REQ-PERSONA-3)", () => {
  it("a pasted sample persists through the connection model and refreshes the corpus estimate", async () => {
    const personaId = await createVoice();
    const res = await post(`/voices/${personaId}/samples`, { text: "one two three four five" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { itemId: string; words: number };
    expect(body.words).toBe(5);

    const detail = (await (await app.request(`/voices/${personaId}`)).json()) as {
      samples: { id: string; state: string; word_count: number }[];
    };
    expect(detail.samples).toHaveLength(1);
    expect(detail.samples[0]!.state).toBe("included");
    expect(detail.samples[0]!.word_count).toBe(5);

    const est = (await (await app.request(`/voices/${personaId}/estimate?tier=quick`)).json()) as {
      estimateCredits: number;
      words: number;
      samples: number;
      tier: string;
    };
    expect(est.tier).toBe("quick");
    expect(est.words).toBe(5);
    expect(est.samples).toBe(1);
    expect(est.estimateCredits).toBeGreaterThan(0);
  });

  it("the include/omit toggle keeps the bytes but drops the item from the corpus", async () => {
    const personaId = await createVoice();
    const itemId = await addSample(personaId, "a b c");
    const res = await patch(`/voices/${personaId}/samples/${itemId}`, { included: false });
    expect(res.status).toBe(200);
    const est = (await (await app.request(`/voices/${personaId}/estimate`)).json()) as { words: number };
    expect(est.words).toBe(0); // omitted ⇒ out of the included corpus
    const detail = (await (await app.request(`/voices/${personaId}`)).json()) as {
      samples: { state: string }[];
    };
    expect(detail.samples[0]!.state).toBe("omitted");
  });
});

describe("POST /voices/:id/build — profile_voice{quick}", () => {
  it("requires at least one sample", async () => {
    const personaId = await createVoice();
    const res = await post(`/voices/${personaId}/build`, { tier: "quick" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("at least one sample required");
  });

  it("creates a profile_voice run with the §9.3 snapshot facts frozen; a second build is a 409", async () => {
    const personaId = await createVoice();
    await addSample(personaId, "alpha beta gamma");
    const res = await post(`/voices/${personaId}/build`, { tier: "quick" });
    expect(res.status).toBe(201);
    const built = (await res.json()) as { runId: string; state: string; deduped: boolean };
    expect(built.deduped).toBe(false);

    const row = (
      await db.pg.query(`select workflow, persona_id, inputs from runs where id = $1`, [built.runId])
    ).rows[0] as { workflow: string; persona_id: string; inputs: { tier: string; snapshot: Record<string, unknown> } };
    expect(row.workflow).toBe("profile_voice");
    expect(row.persona_id).toBe(personaId);
    expect(row.inputs.tier).toBe("quick");
    expect(row.inputs.snapshot.tier).toBe("quick");
    expect(row.inputs.snapshot.corpus_size_at_build).toBe(3);
    expect(typeof row.inputs.snapshot.seed_sha256).toBe("string");
    expect(Object.keys(row.inputs.snapshot.sample_set as Record<string, string>)).toHaveLength(1);

    // personas.active_run_id points at the open build.
    const p = (await db.pg.query(`select active_run_id from personas where id = $1`, [personaId])).rows[0] as {
      active_run_id: string;
    };
    expect(p.active_run_id).toBe(built.runId);

    // Exclusivity: a second build while the first is open → 409 naming the open run.
    const again = await post(`/voices/${personaId}/build`, { tier: "quick" });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { runId: string }).runId).toBe(built.runId);

    // The shared pill reads "Building" everywhere the assembler runs (the detail read here).
    const detail = (await (await app.request(`/voices/${personaId}`)).json()) as {
      status: { state: string; pill: { label: string } };
    };
    expect(detail.status.state).toBe("building");
    expect(detail.status.pill.label).toMatch(/^Building · phase \d of 4$/); // Quick Voice runs 4 phases
  });
});

describe("the shared pill — one projection, every surface (AC5)", () => {
  it("seed edit flips a snapshotted voice to seed_changed on the detail read AND the project chip", async () => {
    const personaId = await createVoice();
    const profileId = await insertProfile(personaId, { corpus_size_at_build: 0 });
    // Pin the project to the persona; the PATCH resolves the latest profile as the pinned snapshot.
    const link = await patch(`/projects/${seed.projectId}/voice`, { personaId });
    expect(link.status).toBe(200);
    const linked = (await link.json()) as { voiceMode: string; profileSnapshotId: string; status: { state: string } };
    expect(linked.voiceMode).toBe("linked");
    expect(linked.profileSnapshotId).toBe(profileId);
    expect(linked.status.state).toBe("unfalsified"); // a Quick Voice rests untested — a fact, never a nag

    // The seed edit flips the pill — read-time derivation, no stored flag.
    const seedRes = await post(`/voices/${personaId}/seed`, { description: "A different register now." });
    expect((await seedRes.json() as { status: { state: string } }).status.state).toBe("seed_changed");

    const chip = (await (await app.request(`/projects/${seed.projectId}/voice`)).json()) as {
      status: { state: string; pill: { label: string } };
    };
    expect(chip.status.state).toBe("seed_changed");
    expect(chip.status.pill.label).toBe("Description changed");

    // …and the project list's chip is the same projection.
    const projects = (await (await app.request("/projects")).json()) as {
      projects: { id: string; voice: { personaId: string; status: { state: string } } | null }[];
    };
    const row = projects.projects.find((p) => p.id === seed.projectId);
    expect(row?.voice?.personaId).toBe(personaId);
    expect(row?.voice?.status.state).toBe("seed_changed");
  });

  it("a main run freezes the project's voice facts into inputs.voice (REQ-PERSONA-17)", async () => {
    const personaId = await createVoice();
    const profileId = await insertProfile(personaId);
    await patch(`/projects/${seed.projectId}/voice`, { personaId });

    const res = await post(`/projects/${seed.projectId}/runs`, {
      idempotencyKey: "idem-voice-1",
      workflow: "review",
      modelProfile: { tier: "balanced" },
      modelTier: "balanced",
      rigor: "standard",
      estimateCredits: 560,
      capCredits: 840,
      rateTableVersion: 1,
      inputs: { draftId: seed.draftId, sidecar: true },
      inputSnapshot: { wordCount: 5180 },
      draftId: seed.draftId,
      corrKind: "review",
      corrK: 1,
    });
    expect(res.status).toBe(201);
    const { runId } = (await res.json()) as { runId: string };
    const row = (
      await db.pg.query(`select persona_id, inputs from runs where id = $1`, [runId])
    ).rows[0] as {
      persona_id: string;
      inputs: { voice: { mode: string; personaId: string; profileSnapshotId: string; snapshotAt: string } };
    };
    expect(row.persona_id).toBe(personaId);
    expect(row.inputs.voice.mode).toBe("linked");
    expect(row.inputs.voice.personaId).toBe(personaId);
    expect(row.inputs.voice.profileSnapshotId).toBe(profileId); // the project's pin wins
    expect(row.inputs.voice.snapshotAt).toBeTruthy();
  });

  it("an unlinked project freezes voice mode 'ad_hoc' (the no-voice label)", async () => {
    const res = await post(`/projects/${seed.projectId}/runs`, {
      idempotencyKey: "idem-voice-2",
      workflow: "review",
      modelProfile: { tier: "balanced" },
      modelTier: "balanced",
      rigor: "standard",
      estimateCredits: 560,
      capCredits: 840,
      rateTableVersion: 1,
      inputs: { draftId: seed.draftId },
      draftId: seed.draftId,
      corrKind: "review",
      corrK: 1,
    });
    expect(res.status).toBe(201);
    const { runId } = (await res.json()) as { runId: string };
    const row = (await db.pg.query(`select inputs from runs where id = $1`, [runId])).rows[0] as {
      inputs: { voice: { mode: string } };
    };
    expect(row.inputs.voice.mode).toBe("ad_hoc");
  });

  it("'No voice' (personaId null) unlinks the project — the ad-hoc default", async () => {
    const personaId = await createVoice();
    await patch(`/projects/${seed.projectId}/voice`, { personaId });
    const res = await patch(`/projects/${seed.projectId}/voice`, { personaId: null });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { voiceMode: string }).voiceMode).toBe("ad_hoc");
    const p = (
      await db.pg.query(`select persona_id, persona_profile_snapshot_id from projects where id = $1`, [seed.projectId])
    ).rows[0] as { persona_id: string | null; persona_profile_snapshot_id: string | null };
    expect(p.persona_id).toBeNull();
    expect(p.persona_profile_snapshot_id).toBeNull();
  });
});

describe("PUT /artifacts/:vid — the derived-artifact write gate (§9.5 row 36)", () => {
  it("a voice_print version rejects writes with 405 + the policy's editMode", async () => {
    const personaId = await createVoice();
    await db.pg.query(
      `insert into artifacts (id, workspace_id, persona_id, kind, namespace, mirror_path)
         values ('art_vp', $1, $2, 'voice_print', 'persona', 'profile/VOICE_PRINT.md')`,
      [seed.workspaceId, personaId],
    );
    await db.pg.query(
      `insert into artifact_versions
         (id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by, immutable)
         values ('av_vp', 'art_vp', 1, 'sha', 'k', 10, 'text/markdown', '{}'::jsonb, true)`,
    );
    const res = await put("/artifacts/av_vp", { markdown: "edit me" });
    expect(res.status).toBe(405);
    const body = (await res.json()) as { error: string; editMode: string };
    expect(body.error).toBe("read_only_artifact");
    expect(body.editMode).toBe("none");
  });
});

describe("AC-I-B — the Connection model has nowhere a cookie/session token could live", () => {
  it("no cookie/session-shaped column exists on connections (or anywhere the voice writes touch)", async () => {
    const cols = (
      await db.pg.query(
        `select table_name, column_name from information_schema.columns
          where table_name in ('connections','discovered_items','sample_versions','personas')
            and (column_name ilike '%cookie%' or column_name ilike '%session%' or column_name ilike '%token%'
                 or column_name ilike '%password%' or column_name ilike '%credential%')`,
      )
    ).rows;
    expect(cols).toEqual([]);
  });
});
