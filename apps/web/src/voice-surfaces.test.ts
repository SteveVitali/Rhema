import { describe, it, expect, vi } from "vitest";
import type { ProjectRow, VoiceDetailDto, VoiceListRowDto, VoiceStatusDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// PRB.10 — the SSR voice surfaces (§9.2–§9.6): the library, the creation sheet, the detail page, the
// project picker, and the run sheet's voice line. Driven via Hono's app.request (no network) with an
// in-memory DataSource — the pill labels asserted here come verbatim from the shared status fixture.

const STATUS = (state: string, label: string, action: string, tone = "neutral"): VoiceStatusDto => ({
  state: state as VoiceStatusDto["state"],
  pill: { label, tone },
  action: action as VoiceStatusDto["action"],
  detail: { seedChanged: false, samples: { added: 0, removed: 0, changed: 0 }, growthRatio: null, ageDays: null },
});

const PERSONA_ROW: VoiceListRowDto = {
  personaId: "per_ada",
  name: "Ada",
  byline: "Substack",
  mode: "self",
  sampleCount: 2,
  status: STATUS("unfalsified", "Untested voice", "test"),
};

const DETAIL: VoiceDetailDto = {
  persona: {
    id: "per_ada",
    display_name: "Ada",
    slug: null,
    byline: "Substack",
    mode: "self",
    registers: ["essay"],
    seed_artifact_id: "art_seed",
    seed_sha256: "sha",
    seed_authored_by: "user",
    seed_updated_at: "2026-09-01T00:00:00Z",
    current_profile_id: null,
    active_run_id: null,
  },
  status: STATUS("seed_changed", "Description changed", "update_voice", "attention"),
  snapshot: {
    builtAt: "2026-08-20T00:00:00Z",
    seedSha256: "old",
    sampleSet: { di_1: "sha1" },
    corpusWordsAtBuild: 900,
    calibrationStatus: "untested",
    tier: "quick",
  },
  seedMarkdown: "A terse register.",
  samples: [
    {
      id: "di_1",
      title: "Essay one",
      state: "included",
      access: "free",
      date: null,
      version_id: "sv_1",
      content_sha256: "sha1",
      word_count: 900,
      quality: "ok",
      n: 1,
    },
  ],
  profiles: [
    { id: "pp_1", built_at: "2026-08-20T00:00:00Z", tier: "quick", corpus_size_at_build: 900, calibration_status: "untested", built_by_run_id: "run_b1" },
  ],
  runs: [{ id: "run_b1", state: "completed", workflow: "profile_voice", spent_credits: 61, created_at: "2026-08-20T00:00:00Z", ended_at: "2026-08-20T00:04:00Z" }],
  artifacts: [{ id: "art_vp", kind: "voice_print", mirror_path: "profile/VOICE_PRINT.md", version_id: "av_1", created_at: "2026-08-20T00:00:00Z" }],
  projects: [],
};

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_1",
    slug: "the-essay",
    title: "The Essay",
    state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "review", label: "Review" } },
    voice: { personaId: "per_ada", name: "Ada", status: STATUS("seed_changed", "Description changed", "update_voice", "attention") },
  },
];

function makeDeps(over: Partial<DataSource> = {}): WebDeps {
  const dataSource = {
    listProjects: async () => PROJECTS,
    checkInvite: async () => ({ ok: true }),
    getBillingBalance: async () => ({ spendableCredits: 200_000, suspended: false, clawbackDebt: 0 }),
    listGates: async () => [],
    listDecisions: async () => [],
    getApprovalOverrides: async () => ({}),
    listVoices: async () => [PERSONA_ROW],
    getVoice: async () => DETAIL,
    estimateVoice: async () => ({ estimateCredits: 61, capCredits: 92, words: 900, samples: 1, tier: "quick" }),
    createVoice: async () => ({ personaId: "per_new", mode: "self", seedAuthoredBy: "user", status: null }),
    addVoiceSample: async () => ({ itemId: "di_n", sampleVersionId: "sv_n", words: 10, status: null }),
    saveVoiceSeed: async () => ({ seedSha256: "s", status: null }),
    buildVoice: async () => ({ runId: "run_v", state: "queued" }),
    getProjectVoice: async () => ({
      voiceMode: "linked" as const,
      personaId: "per_ada",
      name: "Ada",
      status: STATUS("seed_changed", "Description changed", "update_voice", "attention"),
      snapshot: { builtAt: "2026-08-20T00:00:00Z" },
    }),
    setProjectVoice: async () => ({ voiceMode: "linked" as const, personaId: "per_ada", status: null }),
    createRun: async () => ({ runId: "run_n", state: "queued", deduped: false }),
    ...over,
  } as unknown as DataSource;
  return { dataSource, session: () => ({}) };
}

const form = (fields: Record<string, string>) => ({
  body: new URLSearchParams(fields).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded" },
});

describe("the voice library (§9.1)", () => {
  it("GET /voices renders every persona with its shared pill label", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/voices");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Your voices");
    expect(html).toContain("Ada");
    expect(html).toContain("Untested voice"); // the shared pill, verbatim
    expect(html).toContain("/voices/new");
  });

  it("GET /voices requires a session", async () => {
    const app = createWebApp({ ...makeDeps(), session: () => null });
    const res = await app.request("/voices");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });
});

describe("the §9.2 creation sheet", () => {
  it("GET /voices/new renders name, optional description/sample, Mode metadata, the AUP line, Quick tier", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/voices/new");
    const html = await res.text();
    expect(html).toContain("New voice");
    expect(html).toContain('name="name"');
    expect(html).toContain('name="description"');
    expect(html).toContain('name="sample_text"');
    expect(html).toContain('name="mode"');
    expect(html).toContain("the right to use"); // the one-line AUP (REQ-PERSONA-27)
    expect(html).toContain("Quick Voice");
    expect(html).toContain("Create and build");
    // No cookie/session-token input exists anywhere (AC-I-B).
    expect(html).not.toMatch(/cookie|session.?token/i);
  });

  it("POST /voices/new — create + sample + Create-and-build → profile_voice{quick} run, redirect to detail", async () => {
    const createVoice = vi.fn(async () => ({ personaId: "per_new", mode: "self", seedAuthoredBy: "user", status: null }));
    const addVoiceSample = vi.fn(async () => ({ itemId: "di_n", sampleVersionId: "sv_n", words: 10, status: null }));
    const buildVoice = vi.fn(async () => ({ runId: "run_v", state: "queued" }));
    const app = createWebApp(makeDeps({ createVoice, addVoiceSample, buildVoice } as Partial<DataSource>));
    const res = await app.request("/voices/new", {
      method: "POST",
      ...form({ name: "Ada", description: "Terse.", sample_text: "one two three", intent: "build", mode: "self" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/v/per_new");
    expect(createVoice).toHaveBeenCalledOnce();
    expect(addVoiceSample).toHaveBeenCalledOnce();
    expect(buildVoice).toHaveBeenCalledWith({}, "per_new", { tier: "quick" });
  });

  it("POST /voices/new — name required; Create-and-build without a sample re-renders the §9.2 rule", async () => {
    const app = createWebApp(makeDeps());
    const noName = await app.request("/voices/new", { method: "POST", ...form({ intent: "save" }) });
    expect(noName.status).toBe(400);
    expect(await noName.text()).toContain("A name is required");
    const noSample = await app.request("/voices/new", { method: "POST", ...form({ name: "X", intent: "build" }) });
    expect(noSample.status).toBe(400);
    expect(await noSample.text()).toContain("at least one sample");
  });
});

describe("the voice detail page (§9.5)", () => {
  it("GET /v/:id renders the pill, seed editor, samples with include/omit, build history, profile artifacts", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/v/per_ada");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Description changed"); // the shared pill, verbatim
    expect(html).toContain("A terse register."); // the seed editor pre-fills
    expect(html).toContain("Essay one");
    expect(html).toContain("Omit");
    expect(html).toContain("Build history");
    expect(html).toContain("run_b1");
    expect(html).toContain("Profile artifacts");
    expect(html).toContain("voice_print");
    expect(html).toContain("read-only"); // derived artifacts are not editable (§9.5 row 36)
    expect(html).toContain("Update voice");
  });
});

describe("the project picker + the run sheet's voice line (§9.6)", () => {
  it("GET /p/:slug renders the picker with the linked voice's pill", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-essay");
    const html = await res.text();
    expect(html).toContain('name="personaId"');
    expect(html).toContain("Ada");
    expect(html).toContain("Description changed");
    expect(html).toContain("No voice (ad-hoc)");
  });

  it("POST /p/:slug/voice pins the persona server-side (REQ-DATA-32)", async () => {
    const setProjectVoice = vi.fn(async () => ({ voiceMode: "linked" as const, personaId: "per_ada", status: null }));
    const app = createWebApp(makeDeps({ setProjectVoice } as Partial<DataSource>));
    const res = await app.request("/p/the-essay/voice", { method: "POST", ...form({ personaId: "per_ada" }) });
    expect(res.status).toBe(302);
    expect(setProjectVoice).toHaveBeenCalledWith({}, "proj_1", { personaId: "per_ada" });
  });

  it("GET /p/:slug/run renders the voice line: linked name + pill + the priced chained action", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-essay/run");
    const html = await res.text();
    expect(html).toContain("Voice");
    expect(html).toContain("Ada");
    expect(html).toContain("Description changed");
    expect(html).toContain("Update voice first"); // ≈N cr — a fact + an action, never a gate
    expect(html).toContain("/p/the-essay/update-voice");
  });

  it("POST /p/:slug/update-voice launches the Quick-Voice build and lands back on the sheet", async () => {
    const buildVoice = vi.fn(async () => ({ runId: "run_v", state: "queued" }));
    const app = createWebApp(makeDeps({ buildVoice } as Partial<DataSource>));
    const res = await app.request("/p/the-essay/update-voice", { method: "POST", ...form({ voice_persona: "per_ada" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/p/the-essay/run");
    expect(buildVoice).toHaveBeenCalledWith({}, "per_ada", { tier: "quick", projectId: "proj_1" });
  });
});

describe("the seed editor + sample posts", () => {
  it("POST /v/:id/seed saves and redirects back (the pill re-derives on the next read)", async () => {
    const saveVoiceSeed = vi.fn(async () => ({ seedSha256: "s", status: null }));
    const app = createWebApp(makeDeps({ saveVoiceSeed } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/seed", {
      method: "POST",
      ...form({ description: "New.", byline: "B", registers: "essay, polemic" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/v/per_ada?saved=1");
    expect(saveVoiceSeed).toHaveBeenCalledWith({}, "per_ada", {
      description: "New.",
      byline: "B",
      registers: ["essay", "polemic"],
    });
  });

  it("POST /v/:id/samples pastes through the §9.5 model", async () => {
    const addVoiceSample = vi.fn(async () => ({ itemId: "di_n", sampleVersionId: "sv_n", words: 4, status: null }));
    const app = createWebApp(makeDeps({ addVoiceSample } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/samples", { method: "POST", ...form({ text: "a b c d", title: "New sample" }) });
    expect(res.status).toBe(302);
    expect(addVoiceSample).toHaveBeenCalledWith({}, "per_ada", { text: "a b c d", title: "New sample" });
  });
});
