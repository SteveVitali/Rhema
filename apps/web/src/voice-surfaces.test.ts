import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectRow, VoiceDetailDto, VoiceListRowDto, VoiceStatusDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";
import { ProjectOverviewBody } from "./page-chrome.js";

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

// R7RO.1 — the only forced-SSR arm left is PHONE (ADR-128: the `showcase` arm is deleted; a
// showcase row on desktop serves the shell). The voice-notice render asserts below pin that
// arm — GETs expecting SSR markup send PHONE.
const PHONE = { headers: { "sec-ch-ua-mobile": "?1" } };

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_1",
    slug: "the-essay",
    title: "The Essay",
    // R7RO.1 — `showcase: true` is a read-only row fact now; it no longer forces SSR — the
    // PHONE request does.
    showcase: true,
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
  // SPA.27 (REQ-TST-1) — the SSR library render asserts retired with the document (the voices leaf
  // paints the three groups + fork affordances off the /bff/voices twin; spa voice tests own it).

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
    expect(forkVoice).toHaveBeenCalledWith(expect.objectContaining({}), "per_house");
  });
});

describe("the §9.2 creation sheet", () => {
  // SPA.27 (REQ-TST-1) — the creation-sheet render asserts retired with the document (the leaf
  // paints the fields/AUP line/tiers; the AC-I-B no-token input invariant is dom-pinned there).

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
    expect(buildVoice).toHaveBeenCalledWith(expect.objectContaining({}), "per_new", { tier: "quick" });
  });

  it("POST /voices/new — name/sample refusals bounce to the sheet with the err code; JSON keeps the 400", async () => {
    const app = createWebApp(makeDeps());
    // SPA.27 — the SSR re-render is deleted: a form-mode refusal lands back on the sheet URL with
    // the `?err=` code the leaf paints (the JSON caller still gets the stable code at 400).
    const noName = await app.request("/voices/new", { method: "POST", ...form({ intent: "save" }) });
    expect(noName.status).toBe(302);
    expect(noName.headers.get("location")).toBe("/voices/new?err=name_required");
    const noSample = await app.request("/voices/new", { method: "POST", ...form({ name: "X", intent: "build" }) });
    expect(noSample.status).toBe(302);
    expect(noSample.headers.get("location")).toBe("/voices/new?err=sample_required");
    const noNameJson = await app.request("/voices/new", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ intent: "save" }),
    });
    expect(noNameJson.status).toBe(400);
    expect(((await noNameJson.json()) as { error: string }).error).toBe("name_required");
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
    expect(addVoiceSampleUrl).toHaveBeenCalledWith(expect.objectContaining({}), "per_new", { url: "https://example.com/essay" });
    expect(buildVoice).toHaveBeenCalledWith(expect.objectContaining({}), "per_new", { tier: "full" });
  });
});

describe("the voice detail page (§9.5)", () => {
  // SPA.27 (REQ-TST-1) — the detail-page render asserts retired with the document: the overview
  // pill/tabs/diff-of-inputs/hold-out line, the seed editor + corrections ledger, the samples
  // list + URL ingestion form, the ★ hold-out reveal, the profile section order, the runs history,
  // and the approve_sample census card are the voice leaf's DOM off the `/bff/voices/:persona`
  // twin (spa voice surface tests). The write legs stay server-owned below.

  it("POST /v/:id/gates/:gid resolves the approve_sample card on its run", async () => {
    const decideRunGate = vi.fn(async () => {});
    const app = createWebApp(makeDeps({ decideRunGate } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/gates/gate_as", { method: "POST", ...form({ action: "approve", runId: "run_g" }) });
    expect(res.status).toBe(302);
    expect(decideRunGate).toHaveBeenCalledWith(expect.objectContaining({}), "run_g", "gate_as", { action: "approve" });
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
    expect(updateVoice).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", {});
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
    expect(updateVoice).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", { scope: "full_from_quick" });
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
    expect(addVoiceCorrection).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", { text: "Wrong about the semicolons." });
  });

  it("POST /v/:id/samples/url — the fetcher-only path (REQ-INGEST-13)", async () => {
    const addVoiceSampleUrl = vi.fn(async () => ({ itemId: "di_u", sampleVersionId: "sv_u", words: 900, status: null }));
    const app = createWebApp(makeDeps({ addVoiceSampleUrl } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/samples/url", { method: "POST", ...form({ url: "https://example.com/piece" }) });
    expect(res.status).toBe(302);
    expect(addVoiceSampleUrl).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", { url: "https://example.com/piece" });
  });
});

describe("the project picker + the run sheet's voice line (§9.6)", () => {
  it("GET /p/:slug renders the picker with the linked voice's pill", async () => {
    const app = createWebApp(makeDeps());
    // R7RO.1 — the only forced-SSR arm left is phone, where voice configuration is the §10.1 ✗
    // column: the picker is withheld there. The desktop render is pinned on the shared
    // `ProjectOverviewBody` the leaf mounts (non-compact).
    const res = await app.request("/p/the-essay", PHONE);
    const html = await res.text();
    expect(html).not.toContain('data-voice-picker="true"');
    expect(html).not.toContain('name="personaId"');

    const body = renderToStaticMarkup(
      createElement(ProjectOverviewBody, {
        project: { slug: "the-essay" },
        projectVoice: {
          current: {
            voiceMode: "linked",
            personaId: "per_ada",
            name: "Ada",
            status: STATUS("seed_changed", "Description changed", "update_voice", "attention"),
            snapshot: { builtAt: "2026-08-20T00:00:00Z" },
          } as never,
          options: [PERSONA_ROW],
        },
      }),
    );
    expect(body).toContain('name="personaId"');
    expect(body).toContain("Ada");
    expect(body).toContain("Description changed");
    expect(body).toContain("No voice (ad-hoc)");
  });

  it("POST /p/:slug/voice pins the persona server-side (REQ-DATA-32)", async () => {
    const setProjectVoice = vi.fn(async () => ({ voiceMode: "linked" as const, personaId: "per_ada", status: null }));
    const app = createWebApp(makeDeps({ setProjectVoice } as Partial<DataSource>));
    const res = await app.request("/p/the-essay/voice", { method: "POST", ...form({ personaId: "per_ada" }) });
    expect(res.status).toBe(302);
    expect(setProjectVoice).toHaveBeenCalledWith(expect.objectContaining({}), "proj_1", { personaId: "per_ada" });
  });

  it("the run-sheet twin carries the voice line: linked name + pill + the priced chained action", async () => {
    const app = createWebApp(makeDeps());
    // SPA.27 — the sheet document is deleted; `view.voice` rides the `/bff` twin (the leaf paints
    // the 'Update voice first ≈N cr' chained action off it — a fact + an action, never a gate).
    const res = await app.request("/bff/p/the-essay/run");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runSheet: {
        view: {
          voice?: {
            mode: string; name?: string; pill?: unknown;
            updateEstimateCredits?: number; updateAction?: string;
          };
        };
      };
    };
    expect(body.runSheet.view.voice).toMatchObject({
      mode: "linked",
      name: "Ada",
      updateAction: "/p/the-essay/update-voice",
    });
    expect(body.runSheet.view.voice?.pill).toBeTruthy();
    expect(typeof body.runSheet.view.voice?.updateEstimateCredits).toBe("number");
  });

  it("POST /p/:slug/update-voice launches the Quick-Voice build and lands back on the sheet", async () => {
    const buildVoice = vi.fn(async () => ({ runId: "run_v", state: "queued" }));
    const app = createWebApp(makeDeps({ buildVoice } as Partial<DataSource>));
    const res = await app.request("/p/the-essay/update-voice", { method: "POST", ...form({ voice_persona: "per_ada" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/p/the-essay/run");
    expect(buildVoice).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", { tier: "quick", projectId: "proj_1" });
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
    const res = await app.request("/p/the-essay", PHONE);
    const html = await res.text();
    // R7RO.1 — the hatches ride the picker: withheld with it on the phone arm (§10.1 ✗); the
    // desktop render is pinned on the shared `ProjectOverviewBody`.
    expect(html).not.toContain('data-pinned-stale="true"');
    const body = renderToStaticMarkup(
      createElement(ProjectOverviewBody, {
        project: { slug: "the-essay" },
        projectVoice: {
          current: {
            voiceMode: "linked",
            personaId: "per_ada",
            name: "Ada",
            status: STATUS("current", "Voice is current", "none"),
            snapshot: { builtAt: "2026-09-01T00:00:00Z" },
            pinnedStale: true,
          } as never,
          options: [PERSONA_ROW],
        },
      }),
    );
    expect(body).toContain('data-pinned-stale="true"');
    expect(body).toContain("Adopt the refreshed profile");
    expect(body).toContain("/p/the-essay/voice/reseed");
    expect(body).toContain('data-fork-project="true"');
  });

  it("GET /p/:slug?voice_locked=1 — the soft lock names the two hatches", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-essay?voice_locked=1", PHONE);
    const html = await res.text();
    // the notice rides the picker — withheld on the phone arm; the desktop render carries it.
    expect(html).not.toContain('data-voice-locked="true"');
    const body = renderToStaticMarkup(
      createElement(ProjectOverviewBody, {
        project: { slug: "the-essay" },
        projectVoice: {
          current: {
            voiceMode: "linked",
            personaId: "per_ada",
            name: "Ada",
            status: STATUS("current", "Voice is current", "none"),
          } as never,
          options: [PERSONA_ROW],
          locked: true,
        },
      }),
    );
    expect(body).toContain('data-voice-locked="true"');
    expect(body).toContain("adopt the refreshed profile or fork");
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
    expect(adoptProjectVoice).toHaveBeenCalledWith(expect.objectContaining({}), "proj_1", { reseed: true });
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
    // SPA.27 — the diff sheet's document is deleted; the charter diff rides the
    // `/bff/p/:slug/voice/reseed` twin verbatim (the leaf renders it; guidance lines are data).
    const res = await app.request("/bff/p/the-essay/voice/reseed");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      voiceReseed: { preview?: { charterFound?: boolean; diff?: { kind: string; line: string }[]; guidancePreserved?: boolean } };
    };
    const payload = body.voiceReseed.preview;
    expect(payload?.charterFound).toBe(true);
    expect(payload?.diff?.some((d) => d.kind === "added" && d.line === "seeded new")).toBe(true);
    expect(payload?.guidancePreserved).toBe(true);
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
    expect(saveVoiceSeed).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", {
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
    expect(addVoiceSample).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", { text: "a b c d", title: "New sample" });
  });
});

// -------------------------------------------------------------------------------------------------------------
// P1.15 — the §9.5 ingestion surface: the Sources pane (link/discover/confirm/re-sync/settings/remove),
// the items list's state + quality badges, the sample drawer (preview + versions + the priced
// reconstruction CTAs), and the voice delete.
// -------------------------------------------------------------------------------------------------------------
describe("the P1.15 ingestion surfaces (§9.5)", () => {
  // SPA.27 (REQ-TST-1) — the Sources pane + review-step render asserts retired with the voice
  // document (the leaf paints providers/counts/the verbatim error, the confirm checkbox list, and
  // the paywall badge off the twin; the AC-I-B no-credential-field invariant is dom-pinned there).
  // The connection write legs below stay server-owned.

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
    expect(confirmVoiceConnection).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", "conn_1", {
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
    expect(discoverVoiceConnection).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", "conn_1");
    await app.request("/v/per_ada/connections/conn_1/sync", { method: "POST" });
    expect(syncVoiceConnection).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", "conn_1");
    await app.request("/v/per_ada/sync", { method: "POST" });
    expect(syncAllVoiceConnections).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada");
    await app.request("/v/per_ada/connections/conn_1/settings", {
      method: "POST",
      ...form({ autoIncludeNew: "on" }),
    });
    expect(patchVoiceConnection).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", "conn_1", {
      autoIncludeNew: true,
      dailySync: false,
    });
    await app.request("/v/per_ada/connections/conn_1/remove", { method: "POST" });
    expect(removeVoiceConnection).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", "conn_1");
  });

  it("POST /v/:id/connections links a Substack publication by address — no credential field", async () => {
    const createVoiceConnection = vi.fn(async () => ({ connectionId: "conn_n", provider: "substack", handle: "ada.substack.com" }));
    const app = createWebApp(makeDeps({ createVoiceConnection } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/connections", {
      method: "POST",
      ...form({ provider: "substack", handle: "ada.substack.com" }),
    });
    expect(res.status).toBe(302);
    expect(createVoiceConnection).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", {
      provider: "substack",
      handle: "ada.substack.com",
    });
  });

  // SPA.27 (REQ-TST-1) — the sample-drawer render asserts (preview/versions/quality notes/the
  // priced CTAs, and the non-scanned visual-CTA hiding) retired with the voice document — the leaf
  // paints the drawer off the twin's `sample` slice.

  it("POST /v/:id/samples/:itemId/reconstruct posts the opt-in confirm + tier, lands back on the drawer", async () => {
    const reconstructVoiceSample = vi.fn(async () => ({ queued: true }));
    const app = createWebApp(makeDeps({ reconstructVoiceSample } as Partial<DataSource>));
    const res = await app.request("/v/per_ada/samples/di_1/reconstruct", {
      method: "POST",
      ...form({ tier: "visual" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/v/per_ada?tab=samples&sample=di_1&reconstruct=queued");
    expect(reconstructVoiceSample).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada", "di_1", { tier: "visual", confirmed: true });
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
    expect(deleteVoice).toHaveBeenCalledWith(expect.objectContaining({}), "per_ada");
  });
});
