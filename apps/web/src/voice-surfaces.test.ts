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
  kind: "leaf",
  group: "your_voices",
  readOnly: false,
  sampleCount: 2,
  sources: ["paste"],
  projectCount: 1,
  lastBuiltAt: "2026-08-20T00:00:00Z",
  tier: "quick",
  members: [],
  registers: ["essay"],
  status: STATUS("unfalsified", "Untested voice", "test"),
};

const HOUSE_ROW: VoiceListRowDto = {
  ...PERSONA_ROW,
  personaId: "per_house",
  name: "House Standard",
  group: "house_styles",
  readOnly: true,
  tier: "full",
};

const SHARED_ROW: VoiceListRowDto = {
  ...PERSONA_ROW,
  personaId: "per_shared",
  name: "Maya's column voice",
  group: "shared_with_you",
  readOnly: true,
};

const LIST = {
  voices: [PERSONA_ROW, HOUSE_ROW, SHARED_ROW],
  groups: {
    your_voices: [PERSONA_ROW],
    house_styles: [HOUSE_ROW],
    shared_with_you: [SHARED_ROW],
  },
} as const;

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
  // ---- P1.14 surfaces ----
  factsPanel: {
    facts: [
      { key: "description" as const, label: "Description", line: "changed since the build", changed: true },
      { key: "samples" as const, label: "Samples", line: "unchanged", changed: false },
      { key: "corpus" as const, label: "Corpus", line: "900 → 900 words", changed: false },
      { key: "calibration" as const, label: "Calibration", line: "untested", changed: false },
    ],
    ageDays: 12,
    corpusWords: { built: 900, current: 900 },
    verb: "Update voice" as const,
    route: { scope: "synth" as const, workflow: "refresh_voice" as const, inputs: { scope: "synth" }, sentence: "Re-render the profile prose from your description — the corpus is not re-read" },
  },
  updateRoute: { scope: "synth" as const, workflow: "refresh_voice" as const, inputs: { scope: "synth" }, sentence: "Re-render the profile prose from your description — the corpus is not re-read" },
  upgradeRoute: { scope: "full_from_quick" as const, workflow: "refresh_voice" as const, inputs: { scope: "full_from_quick" }, sentence: "Upgrade to a Full Profile" },
  holdout: { held: true, revealed: false },
  measures: null,
  calibration: null,
  corrections: [
    {
      id: "pc_1",
      profile_id: "pp_1",
      target_artifact_id: null,
      statement_ref: null,
      text: "It overstates the em-dash habit.",
      source: "user",
      consumed_by_profile_id: null,
      at: "2026-09-01T00:00:00Z",
    },
  ],
  gate: null,
  members: [],
  buildNotes: [{ id: "bn_1", profile_id: "pp_1", body: "read 2 pieces", created_at: "2026-08-20T00:04:00Z" }],
  hubMarkdown: "Ada writes short, declarative sentences.",
  profileSections: [
    { key: "calibration-report", path: "profile/calibration.md", collapsed: false, advanced: false },
    { key: "exemplars", path: "profile/exemplars.md", collapsed: false, advanced: false },
    { key: "voice-measures", path: null, collapsed: false, advanced: true },
  ],
  tier: "quick",
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
    listVoiceGroups: async () => LIST,
    getVoice: async () => DETAIL,
    getVoiceUpdatePlan: async () => ({
      route: { scope: "synth", workflow: "refresh_voice", inputs: { scope: "synth" }, sentence: "Re-render the profile prose from your description — the corpus is not re-read" },
      estimate: { estimateCredits: 40, capCredits: 60 },
      upgrade: { scope: "full_from_quick", workflow: "refresh_voice", inputs: { scope: "full_from_quick" }, sentence: "Upgrade to a Full Profile" },
      upgradeEstimate: { estimateCredits: 210, capCredits: 315 },
    }),
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
  it("GET /voices renders the three groups — yours editable, house/shared read-only + forkable", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/voices");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Your voices");
    expect(html).toContain("House styles");
    expect(html).toContain("Shared with you");
    expect(html).toContain("Ada");
    expect(html).toContain("House Standard");
    expect(html).toContain("column voice");
    expect(html).toContain("Untested voice"); // the shared pill, verbatim
    expect(html).toContain("/voices/new");
    // the read-only cards carry the fork affordance; the editable card does not
    expect(html).toContain('data-fork-voice="per_house"');
    expect(html).toContain('data-fork-voice="per_shared"');
    expect(html).not.toContain('data-fork-voice="per_ada"');
    expect(html).toContain('data-voice-group="house_styles"');
  });

  it("GET /voices requires a session", async () => {
    const app = createWebApp({ ...makeDeps(), session: () => null });
    const res = await app.request("/voices");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("POST /v/:id/fork copies a read-only card into your voices and lands on it", async () => {
    const forkVoice = vi.fn(async () => ({ personaId: "per_fork", status: null }));
    const app = createWebApp(makeDeps({ forkVoice } as Partial<DataSource>));
    const res = await app.request("/v/per_house/fork", { method: "POST" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/v/per_fork");
    expect(forkVoice).toHaveBeenCalledWith({}, "per_house");
  });
});

describe("the §9.2 creation sheet", () => {
  it("GET /voices/new renders name, optional description/sample/URL, Mode metadata, the AUP line, both tiers", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/voices/new");
    const html = await res.text();
    expect(html).toContain("New voice");
    expect(html).toContain('name="name"');
    expect(html).toContain('name="description"');
    expect(html).toContain('name="sample_text"');
    expect(html).toContain('name="sample_url"'); // P1.14 — the fetcher-only URL field
    expect(html).toContain('name="mode"');
    expect(html).toContain("the right to use"); // the one-line AUP (REQ-PERSONA-27)
    expect(html).toContain("Quick Voice");
    expect(html).toContain("Full Profile"); // P1.14 — the tier radio
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

  it("POST /voices/new — tier=full builds profile_voice{full}; a URL sample rides the fetcher path", async () => {
    const buildVoice = vi.fn(async () => ({ runId: "run_v", state: "queued" }));
    const addVoiceSampleUrl = vi.fn(async () => ({ itemId: "di_u", status: null }));
    const app = createWebApp(makeDeps({ buildVoice, addVoiceSampleUrl } as Partial<DataSource>));
    const res = await app.request("/voices/new", {
      method: "POST",
      ...form({ name: "Ada", intent: "build", tier: "full", sample_url: "https://example.com/essay", description: "Terse." }),
    });
    expect(res.status).toBe(302);
    expect(addVoiceSampleUrl).toHaveBeenCalledWith({}, "per_new", { url: "https://example.com/essay" });
    expect(buildVoice).toHaveBeenCalledWith({}, "per_new", { tier: "full" });
  });
});

describe("the voice detail page (§9.5)", () => {
  it("GET /v/:id — Overview: the pill, the five tabs, the diff-of-inputs panel, the one verb, the hold-out line", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/v/per_ada");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Description changed"); // the shared pill, verbatim
    // the five tabs render as server-side links (§9.5)
    for (const t of ["Overview", "Description", "Samples", "Profile", "Runs"]) expect(html).toContain(t);
    expect(html).toContain('data-voice-tab="samples"');
    // the diff-of-inputs panel (§9.3): facts in plain words + the routed sentence
    expect(html).toContain('data-facts-panel="true"');
    expect(html).toContain("changed since the build");
    expect(html).toContain("the corpus is not re-read"); // the routed scope's sentence
    expect(html).toContain("Update voice"); // the ONE verb
    expect(html).toContain("Upgrade to Full Profile"); // the Quick→Full offer
    // the hold-out stays generic pre-calibration (§9.4 — identity never named)
    expect(html).toContain('data-holdout-hidden="true"');
    expect(html).toContain("held back to test the profile");
    expect(html).not.toContain('data-holdout-badge');
    // the hub paragraph renders
    expect(html).toContain("Ada writes short, declarative sentences.");
  });

  it("GET /v/:id?tab=description — the seed editor, the corrections ledger, the build notes", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/v/per_ada?tab=description");
    const html = await res.text();
    expect(html).toContain("A terse register."); // the seed editor pre-fills
    expect(html).toContain("Corrections");
    expect(html).toContain("It overstates the em-dash habit.");
    expect(html).toContain("waiting for the next build"); // consume-once, unconsumed
    expect(html).toContain('data-correction="pc_1"');
    expect(html).toContain("Notes from the last build");
    expect(html).toContain("read 2 pieces");
  });

  it("GET /v/:id?tab=samples — the list, include/omit, the URL ingestion form", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/v/per_ada?tab=samples");
    const html = await res.text();
    expect(html).toContain("Essay one");
    expect(html).toContain("Omit");
    expect(html).toContain("/v/per_ada/samples/url"); // REQ-INGEST-13's fetcher path
    // the hold-out badge stays hidden pre-reveal even on the Samples tab
    expect(html).not.toContain('data-holdout-badge');
  });

  it("GET /v/:id?tab=samples — the ★ badge shows ONLY once the hold-out is revealed", async () => {
    const revealed = { ...DETAIL, holdout: { held: true, revealed: true, itemId: "di_1", title: "Essay one", revealedAt: "2026-09-02T00:00:00Z" } };
    const app = createWebApp(makeDeps({ getVoice: async () => revealed } as Partial<DataSource>));
    const res = await app.request("/v/per_ada?tab=samples");
    const html = await res.text();
    expect(html).toContain('data-holdout-badge="true"');
    expect(html).toContain("held out");
  });

  it("GET /v/:id?tab=profile — the fixed section order + read-only artifacts", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/v/per_ada?tab=profile");
    const html = await res.text();
    expect(html).toContain('data-profile-section="calibration-report"');
    expect(html).toContain('data-profile-section="exemplars"');
    expect(html).toContain("(Advanced)");
    expect(html).toContain("Profile artifacts");
    expect(html).toContain("voice_print");
    expect(html).toContain("read-only"); // derived artifacts are not editable (§9.5 row 36)
  });

  it("GET /v/:id?tab=runs — the build history + snapshots", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/v/per_ada?tab=runs");
    const html = await res.text();
    expect(html).toContain("run_b1");
    expect(html).toContain("profile_voice");
    expect(html).toContain("Snapshots");
  });

  it("GET /v/:id — an open approve_sample gate renders the census card", async () => {
    const gated: VoiceDetailDto = {
      ...DETAIL,
      persona: { ...DETAIL.persona, active_run_id: "run_g" },
      gate: {
        gateId: "gate_as",
        runId: "run_g",
        workflow: "profile_voice",
        card: {
          includedLine: "3 of 4 pieces",
          exclusions: [{ title: "Scan.pdf", reason: "couldn't read this piece" }],
          holdoutLine: "one of your pieces is held back to test the profile — you won't see which until after calibration",
          estimate: { credits: 210, capCredits: 315 },
          knobs: { sampleCap: 40, calibration: true, modelTier: "base" },
          calibrationWarning: null,
          waitingUntil: null,
        },
      },
    };
    const app = createWebApp(makeDeps({ getVoice: async () => gated } as Partial<DataSource>));
    const res = await app.request("/v/per_ada");
    const html = await res.text();
    expect(html).toContain('data-gate-card="true"');
    expect(html).toContain("3 of 4 pieces");
    expect(html).toContain("Scan.pdf"); // the exclusion carries its reason in plain words
    expect(html).toContain("/v/per_ada/gates/gate_as");
    expect(html).toContain("Approve — build the profile");
  });

  it("POST /v/:id/gates/:gid resolves the approve_sample card on its run", async () => {
    const decideRunGate = vi.fn(async () => {});
    const app = createWebApp(makeDeps({ decideRunGate } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/gates/gate_as", { method: "POST", ...form({ action: "approve", runId: "run_g" }) });
    expect(res.status).toBe(302);
    expect(decideRunGate).toHaveBeenCalledWith({}, "run_g", "gate_as", { action: "approve" });
  });

  it("POST /v/:id/update — the ONE verb posts no scope ⇒ the api routes it (§9.3)", async () => {
    const updateVoice = vi.fn(async () => ({
      runId: "run_u",
      state: "queued",
      route: { scope: "synth", workflow: "refresh_voice", inputs: {}, sentence: "x" },
      estimate: { estimateCredits: 40, capCredits: 60 },
    }));
    const app = createWebApp(makeDeps({ updateVoice } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/update", { method: "POST", ...form({}) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/v/per_ada");
    expect(updateVoice).toHaveBeenCalledWith({}, "per_ada", {});
  });

  it("POST /v/:id/update — scope=full_from_quick is the Quick→Full upgrade", async () => {
    const updateVoice = vi.fn(async () => ({
      runId: "run_u",
      state: "queued",
      route: { scope: "full_from_quick", workflow: "refresh_voice", inputs: {}, sentence: "x" },
      estimate: { estimateCredits: 210, capCredits: 315 },
    }));
    const app = createWebApp(makeDeps({ updateVoice } as Partial<DataSource>));
    await app.request("/v/per_ada/update", { method: "POST", ...form({ scope: "full_from_quick" }) });
    expect(updateVoice).toHaveBeenCalledWith({}, "per_ada", { scope: "full_from_quick" });
  });

  it("POST /v/:id/corrections — the correction lands and redirects to the Description tab", async () => {
    const addVoiceCorrection = vi.fn(async () => ({ correctionId: "pc_2", seedSha256: "s2", status: null }));
    const app = createWebApp(makeDeps({ addVoiceCorrection } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/corrections", {
      method: "POST",
      ...form({ text: "Wrong about the semicolons." }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("tab=description");
    expect(addVoiceCorrection).toHaveBeenCalledWith({}, "per_ada", { text: "Wrong about the semicolons." });
  });

  it("POST /v/:id/samples/url — the fetcher-only path (REQ-INGEST-13)", async () => {
    const addVoiceSampleUrl = vi.fn(async () => ({ itemId: "di_u", sampleVersionId: "sv_u", words: 900, status: null }));
    const app = createWebApp(makeDeps({ addVoiceSampleUrl } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/samples/url", { method: "POST", ...form({ url: "https://example.com/piece" }) });
    expect(res.status).toBe(302);
    expect(addVoiceSampleUrl).toHaveBeenCalledWith({}, "per_ada", { url: "https://example.com/piece" });
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

  // ---- P1.14 — the §9.6 hatches ----
  it("GET /p/:slug — a stale pin renders the adopt/fork hatches + the reseed-preview link", async () => {
    const app = createWebApp(
      makeDeps({
        getProjectVoice: async () => ({
          voiceMode: "linked" as const,
          personaId: "per_ada",
          name: "Ada",
          status: STATUS("current", "Voice is current", "none"),
          snapshot: { builtAt: "2026-09-01T00:00:00Z" },
          pinnedStale: true,
        }),
      } as Partial<DataSource>),
    );
    const res = await app.request("/p/the-essay");
    const html = await res.text();
    expect(html).toContain('data-pinned-stale="true"');
    expect(html).toContain("Adopt the refreshed profile");
    expect(html).toContain("/p/the-essay/voice/reseed");
    expect(html).toContain('data-fork-project="true"');
  });

  it("GET /p/:slug?voice_locked=1 — the soft lock names the two hatches", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-essay?voice_locked=1");
    const html = await res.text();
    expect(html).toContain('data-voice-locked="true"');
    expect(html).toContain("adopt the refreshed profile or fork");
  });

  it("POST /p/:slug/voice — a direct change that 409s lands on the locked notice", async () => {
    const { ApiError } = await import("@rhema/api-client");
    const setProjectVoice = vi.fn(async () => {
      throw new ApiError(409, "/projects/proj_1/voice", "voice_locked", "voice_locked");
    });
    const app = createWebApp(makeDeps({ setProjectVoice } as Partial<DataSource>));
    const res = await app.request("/p/the-essay/voice", { method: "POST", ...form({ personaId: "per_other" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-essay?voice_locked=1");
  });

  it("POST /p/:slug/voice/adopt pins the refreshed snapshot; reseed=true carries the flag", async () => {
    const adoptProjectVoice = vi.fn(async () => ({
      adopted: true as const,
      personaId: "per_ada",
      profileSnapshotId: "pp_2",
      status: null,
      reseedRun: null,
    }));
    const app = createWebApp(makeDeps({ adoptProjectVoice } as Partial<DataSource>));
    const res = await app.request("/p/the-essay/voice/adopt", { method: "POST", ...form({ reseed: "true" }) });
    expect(res.status).toBe(302);
    expect(adoptProjectVoice).toHaveBeenCalledWith({}, "proj_1", { reseed: true });
  });

  it("POST /p/:slug/voice/fork lands on the NEW project (§9.6 hatch 2)", async () => {
    const forkProjectVoice = vi.fn(async () => ({
      projectId: "proj_fork",
      slug: "the-essay-fork",
      personaId: "per_ada",
      profileSnapshotId: "pp_1",
    }));
    const app = createWebApp(makeDeps({ forkProjectVoice } as Partial<DataSource>));
    const res = await app.request("/p/the-essay/voice/fork", { method: "POST", ...form({ personaId: "per_ada" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-essay-fork");
  });

  it("GET /p/:slug/voice/reseed renders the charter diff; guidance lines never appear", async () => {
    const getVoiceReseedPreview = vi.fn(async () => ({
      charterFound: true,
      current: "seeded old\n## Guidance\nkeep this",
      next: "seeded new\n## Guidance\nkeep this",
      diff: [
        { kind: "removed" as const, line: "seeded old" },
        { kind: "added" as const, line: "seeded new" },
        { kind: "same" as const, line: "## Guidance" },
        { kind: "same" as const, line: "keep this" },
      ],
      guidancePreserved: true,
    }));
    const app = createWebApp(makeDeps({ getVoiceReseedPreview } as Partial<DataSource>));
    const res = await app.request("/p/the-essay/voice/reseed");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-reseed-diff="true"');
    expect(html).toContain('data-diff-kind="added"');
    expect(html).toContain("seeded new");
    expect(html).toContain('data-guidance-preserved="true"');
    expect(html).toContain("/p/the-essay/voice/adopt");
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

// -------------------------------------------------------------------------------------------------------------
// P1.15 — the §9.5 ingestion surface: the Sources pane (link/discover/confirm/re-sync/settings/remove),
// the items list's state + quality badges, the sample drawer (preview + versions + the priced
// reconstruction CTAs), and the voice delete.
// -------------------------------------------------------------------------------------------------------------
describe("the P1.15 ingestion surfaces (§9.5)", () => {
  const CONNECTIONS = {
    connections: [
      {
        id: "conn_1",
        provider: "substack",
        handle: "ada.substack.com",
        status: "ok",
        last_sync_at: "2026-09-01T00:00:00Z",
        schedule: "daily",
        auto_include_new: false,
        error: null,
        items: 2,
        included: 1,
      },
      {
        id: "conn_2",
        provider: "url",
        handle: "https://example.com/post",
        status: "error",
        last_sync_at: null,
        schedule: null,
        auto_include_new: true,
        error: "Fetch failed: HTTP 403 — the host refused the request",
        items: 1,
        included: 0,
      },
    ],
  };

  const DETAIL_WITH_NEW = {
    ...DETAIL,
    samples: [
      ...DETAIL.samples,
      {
        id: "di_2",
        title: "Paywalled post",
        state: "new",
        access: "paywalled",
        date: null,
        connection_id: "conn_1",
        url: "https://ada.substack.com/p/paywalled",
        external_id: "ext_p1",
        version_id: null,
        content_sha256: null,
        word_count: null,
        quality: null,
        n: null,
      },
    ],
  };

  it("GET /v/:id?tab=samples renders the Sources pane: linked providers, counts, the verbatim error, the three link flows", async () => {
    const app = createWebApp(
      makeDeps({
        getVoice: async () => DETAIL_WITH_NEW,
        listVoiceConnections: async () => CONNECTIONS,
      } as Partial<DataSource>),
    );
    const res = await app.request("/v/per_ada?tab=samples");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-sources="true"');
    expect(html).toContain('data-source="conn_1"');
    expect(html).toContain("ada.substack.com");
    expect(html).toContain("1 of 2 included");
    expect(html).toContain("HTTP 403"); // the error line renders verbatim (REQ-INGEST-11)
    // the three link flows — and NO credential field anywhere (AC-I-B)
    expect(html).toContain('data-link-substack="true"');
    expect(html).toContain('data-link-url="true"');
    expect(html).toContain('data-link-export="true"');
    expect(html).not.toMatch(/name="(cookie|token|password|credential)/i);
    expect(html).toContain('data-resync-all="true"');
  });

  it("the review step: 'new' items render as the confirm checkbox list; paywalled rows carry the badge", async () => {
    const app = createWebApp(
      makeDeps({
        getVoice: async () => DETAIL_WITH_NEW,
        listVoiceConnections: async () => CONNECTIONS,
      } as Partial<DataSource>),
    );
    const res = await app.request("/v/per_ada?tab=samples");
    const html = await res.text();
    expect(html).toContain('data-confirm="true"');
    expect(html).toContain('data-review-item="ext_p1"');
    expect(html).toContain('name="include"');
    expect(html).toContain('name="known"');
    expect(html).toContain("import your export"); // the paywall badge's remedy line
  });

  it("POST /v/:id/connections/:cid/confirm maps the checkbox post to per-item include flags", async () => {
    const confirmVoiceConnection = vi.fn(async () => ({ queued: true }));
    const app = createWebApp(makeDeps({ confirmVoiceConnection } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/connections/conn_1/confirm", {
      method: "POST",
      body: new URLSearchParams([
        ["known", "ext_p1"],
        ["known", "ext_p2"],
        ["include", "ext_p1"],
      ]).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(302);
    expect(confirmVoiceConnection).toHaveBeenCalledWith({}, "per_ada", "conn_1", {
      items: [
        { externalId: "ext_p1", include: true },
        { externalId: "ext_p2", include: false },
      ],
    });
  });

  it("the per-source actions post through: discover, re-sync, re-sync all, settings, remove", async () => {
    const discoverVoiceConnection = vi.fn(async () => ({ items: [] }));
    const syncVoiceConnection = vi.fn(async () => ({ queued: true }));
    const syncAllVoiceConnections = vi.fn(async () => ({ queued: true }));
    const patchVoiceConnection = vi.fn(async () => ({ ok: true }));
    const removeVoiceConnection = vi.fn(async () => ({ ok: true }));
    const app = createWebApp(
      makeDeps({
        discoverVoiceConnection,
        syncVoiceConnection,
        syncAllVoiceConnections,
        patchVoiceConnection,
        removeVoiceConnection,
      } as Partial<DataSource>),
    );
    await app.request("/v/per_ada/connections/conn_1/discover", { method: "POST" });
    expect(discoverVoiceConnection).toHaveBeenCalledWith({}, "per_ada", "conn_1");
    await app.request("/v/per_ada/connections/conn_1/sync", { method: "POST" });
    expect(syncVoiceConnection).toHaveBeenCalledWith({}, "per_ada", "conn_1");
    await app.request("/v/per_ada/sync", { method: "POST" });
    expect(syncAllVoiceConnections).toHaveBeenCalledWith({}, "per_ada");
    await app.request("/v/per_ada/connections/conn_1/settings", {
      method: "POST",
      ...form({ autoIncludeNew: "on" }),
    });
    expect(patchVoiceConnection).toHaveBeenCalledWith({}, "per_ada", "conn_1", {
      autoIncludeNew: true,
      dailySync: false,
    });
    await app.request("/v/per_ada/connections/conn_1/remove", { method: "POST" });
    expect(removeVoiceConnection).toHaveBeenCalledWith({}, "per_ada", "conn_1");
  });

  it("POST /v/:id/connections links a Substack publication by address — no credential field", async () => {
    const createVoiceConnection = vi.fn(async () => ({ connectionId: "conn_n", provider: "substack", handle: "ada.substack.com" }));
    const app = createWebApp(makeDeps({ createVoiceConnection } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/connections", {
      method: "POST",
      ...form({ provider: "substack", handle: "ada.substack.com" }),
    });
    expect(res.status).toBe(302);
    expect(createVoiceConnection).toHaveBeenCalledWith({}, "per_ada", {
      provider: "substack",
      handle: "ada.substack.com",
    });
  });

  it("GET /v/:id?tab=samples&sample=:id renders the drawer: preview, versions, quality notes, the priced CTAs", async () => {
    const getVoiceSample = vi.fn(async () => ({
      item: {
        id: "di_1",
        external_id: "ext_1",
        title: "Essay one",
        url: "https://ada.substack.com/p/one",
        date: null,
        word_count: 900,
        access: "free",
        state: "included",
        provider: "substack",
        connection_id: "conn_1",
      },
      versions: [
        {
          id: "sv_2",
          n: 2,
          content_sha256: "sha2",
          original_sha256: "osha2",
          quality: "partial",
          quality_notes: ["pages 3, 5 appear to be scanned images — the visual tier can rebuild them"],
          word_count: 900,
        },
        { id: "sv_1", n: 1, content_sha256: "sha1", original_sha256: "osha1", quality: "clean", quality_notes: null, word_count: 900 },
      ],
      document: "# Essay one\n\nThe canonical body.",
    }));
    const app = createWebApp(
      makeDeps({
        getVoiceSample,
        listVoiceConnections: async () => CONNECTIONS,
      } as Partial<DataSource>),
    );
    const res = await app.request("/v/per_ada?tab=samples&sample=di_1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-sample-drawer="true"');
    expect(html).toContain("Essay one");
    expect(html).toContain('data-quality-notes="true"');
    expect(html).toContain("scanned images");
    expect(html).toContain('data-sample-preview="true"');
    expect(html).toContain("The canonical body.");
    expect(html).toContain('data-sample-versions="true"');
    expect(html).toContain('data-version="2"');
    // the priced CTAs — text for a non-clean verdict; visual because the notes flag scanned pages
    expect(html).toContain('data-reconstruct-text="true"');
    expect(html).toContain('data-reconstruct-visual="true"');
  });

  it("the drawer's visual CTA stays hidden for a non-scanned partial — opt-in only when flagged", async () => {
    const getVoiceSample = vi.fn(async () => ({
      item: {
        id: "di_1",
        external_id: null,
        title: "Essay one",
        url: null,
        date: null,
        word_count: 900,
        access: "free",
        state: "included",
        provider: "paste",
        connection_id: "conn_p",
      },
      versions: [
        { id: "sv_1", n: 1, content_sha256: "sha1", original_sha256: null, quality: "partial", quality_notes: ["some spans did not convert"], word_count: 900 },
      ],
      document: "# Essay one",
    }));
    const app = createWebApp(makeDeps({ getVoiceSample } as Partial<DataSource>));
    const res = await app.request("/v/per_ada?tab=samples&sample=di_1");
    const html = await res.text();
    expect(html).toContain('data-reconstruct-text="true"');
    expect(html).not.toContain('data-reconstruct-visual="true"');
  });

  it("POST /v/:id/samples/:itemId/reconstruct posts the opt-in confirm + tier, lands back on the drawer", async () => {
    const reconstructVoiceSample = vi.fn(async () => ({ queued: true }));
    const app = createWebApp(makeDeps({ reconstructVoiceSample } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/samples/di_1/reconstruct", {
      method: "POST",
      ...form({ tier: "visual" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/v/per_ada?tab=samples&sample=di_1&reconstruct=queued");
    expect(reconstructVoiceSample).toHaveBeenCalledWith({}, "per_ada", "di_1", { tier: "visual", confirmed: true });
  });

  it("POST /v/:id/delete needs the typed 'delete' confirm; otherwise it bounces back", async () => {
    const deleteVoice = vi.fn(async () => ({ deleted: true }));
    const app = createWebApp(makeDeps({ deleteVoice } as Partial<DataSource>));
    const refused = await app.request("/v/per_ada/delete", { method: "POST", ...form({ confirm: "nope" }) });
    expect(refused.status).toBe(302);
    expect(refused.headers.get("location")).toBe("/v/per_ada");
    expect(deleteVoice).not.toHaveBeenCalled();
    const ok = await app.request("/v/per_ada/delete", { method: "POST", ...form({ confirm: "delete" }) });
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("/voices");
    expect(deleteVoice).toHaveBeenCalledWith({}, "per_ada");
  });
});
