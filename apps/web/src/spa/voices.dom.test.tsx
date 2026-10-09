// @vitest-environment happy-dom
//
// SPA.13 — the `voices` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/2/5/16, REQ-DAT-4, REQ-UX-6/16; design/22 §2 + design/25 §voices). Mounted through the
// production router (memory history + a stub fetch) at `/voices`, `/voices/new`, `/v/$persona`
// (each of the five tabs), and `/p/$project/voice/reseed`: the three-group library, the creation
// sheet's JSON mutation (submitter `intent` capture + the presign→direct-PUT→`quarantineKey` file
// leg — bytes never ride a JSON field and never proxy through the BFF), the detail page's five
// tabs (gate decisions, seed/corrections, sources review-confirm with array fields, sample
// include/omit submitter, reconstruction tiers, delete), the reseed diff + adopt submitter, the
// REQ-UX-16 `aria-busy`/disabled in-flight affordance, degraded-twin legs, the SSR-parity legs
// against `VoicesPage`/`VoiceNewPage`/`VoiceDetailPage`/`VoiceReseedPage` under PageDataContext,
// the SsrHandoff no-BFF leg, and component axe on the mounted surfaces.
//
// The fixtures cover every conditional branch the surface can render so the parity legs compare
// the two renderers on the SAME data.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  VoiceConnectionDto,
  VoiceDetailDto,
  VoiceListDto,
  VoiceListRowDto,
  VoiceSampleDetailDto,
  VoiceSampleDto,
  VoiceStatusDto,
} from "@rhema/api-client";
import { PageDataContext } from "../page-data.js";
import { VoiceDetailPage, VoiceNewPage, VoiceReseedPage, VoicesPage } from "../pages.js";
import { hooksForSurface } from "../dom-contract.js";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import { spaRuntime } from "./dom.js";
import { axeCheck, expectManifestEmission } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "acme";
const PID = "p1";
const VC = COPY.voice;

// ---- fixtures — every conditional branch populated ------------------------------------------------

const STATUS: VoiceStatusDto = {
  state: "seed_changed",
  pill: { label: "Needs update", tone: "warn" },
  action: "update_voice",
  detail: { seedChanged: true, samples: { added: 1, removed: 0, changed: 0 }, growthRatio: null, ageDays: 4 },
};

const CARD_YOURS: VoiceListRowDto = {
  personaId: PID,
  name: "Voice One",
  byline: "S. Seed",
  mode: "self",
  kind: "leaf",
  group: "your_voices",
  readOnly: false,
  sampleCount: 5,
  sources: ["substack", "paste"],
  projectCount: 2,
  lastBuiltAt: "2026-10-01T00:00:00Z",
  tier: "quick",
  members: [],
  registers: ["essay"],
  status: STATUS,
};

const CARD_HOUSE: VoiceListRowDto = {
  personaId: "p2",
  name: "House Style",
  byline: null,
  mode: "house",
  kind: "leaf",
  group: "house_styles",
  readOnly: true,
  sampleCount: 3,
  sources: [],
  projectCount: 0,
  lastBuiltAt: null,
  tier: "full",
  members: [],
  registers: [],
  status: { ...STATUS, action: "none", state: "resting" },
};

const CARD_COMPOSITE: VoiceListRowDto = {
  personaId: "p3",
  name: "Composite Voice",
  byline: null,
  mode: "self",
  kind: "composite",
  group: "shared_with_you",
  readOnly: true,
  sampleCount: 0,
  sources: [],
  projectCount: 0,
  lastBuiltAt: null,
  tier: null,
  members: [
    { personaId: PID, name: "Voice One" },
    { personaId: "p9", name: null },
  ],
  registers: [],
  status: { ...STATUS, action: "none", state: "resting" },
};

const VOICES_LIST: VoiceListDto = {
  voices: [CARD_YOURS, CARD_HOUSE, CARD_COMPOSITE],
  groups: {
    your_voices: [CARD_YOURS],
    house_styles: [CARD_HOUSE],
    shared_with_you: [CARD_COMPOSITE],
  },
};

const SAMPLE_INCLUDED: VoiceSampleDto = {
  id: "s1",
  title: "Essay one",
  state: "included",
  access: "free",
  date: "2026-09-01",
  connection_id: "cn1",
  url: null,
  external_id: "e1",
  version_id: "v1",
  content_sha256: "aaa",
  word_count: 1234,
  quality: "clean",
  n: 1,
};

const SAMPLE_OMITTED: VoiceSampleDto = {
  id: "s2",
  title: "Paywalled post",
  state: "omitted",
  access: "paywalled",
  date: null,
  connection_id: "cn1",
  url: "https://example.test/post",
  external_id: "e2",
  version_id: "v2",
  content_sha256: "bbb",
  word_count: 90,
  quality: "partial",
  n: 2,
};

const SAMPLE_NEW: VoiceSampleDto = {
  id: "s3",
  title: "Fresh discovery",
  state: "new",
  access: "free",
  date: null,
  connection_id: "cn1",
  url: null,
  external_id: "e3",
  version_id: null,
  content_sha256: null,
  word_count: null,
  quality: null,
  n: null,
};

/** A second pending item — paywalled, so its box starts UNCHECKED: the confirm step's array fold
 *  is exercised honestly (`known` carries both ids; `include` only the checked one). */
const SAMPLE_NEW_PAYWALLED: VoiceSampleDto = {
  id: "s4",
  title: "Paid post",
  state: "new",
  access: "paywalled",
  date: null,
  connection_id: "cn1",
  url: null,
  external_id: "e4",
  version_id: null,
  content_sha256: null,
  word_count: null,
  quality: null,
  n: null,
};

const CONNECTION: VoiceConnectionDto = {
  id: "cn1",
  provider: "substack",
  handle: "seed.substack.com",
  status: "ok",
  last_sync_at: "2026-10-05T00:00:00Z",
  schedule: "daily",
  auto_include_new: true,
  error: "token nearly expired",
  items: 3,
  included: 1,
};

const DETAIL: VoiceDetailDto = {
  persona: {
    id: PID,
    display_name: "Voice One",
    slug: "voice-one",
    byline: "S. Seed",
    mode: "self",
    registers: ["essay"],
    seed_artifact_id: "a-seed",
    seed_sha256: "seedhash",
    seed_authored_by: "persona_builder",
    seed_updated_at: "2026-10-01T00:00:00Z",
    current_profile_id: "prof1",
    active_run_id: "r9",
  },
  status: STATUS,
  snapshot: {
    builtAt: "2026-10-01T00:00:00Z",
    seedSha256: "oldseed",
    sampleSet: { s1: "aaa" },
    corpusWordsAtBuild: 4000,
    calibrationStatus: "tested",
    tier: "quick",
  },
  seedMarkdown: "A seed description.",
  samples: [SAMPLE_INCLUDED, SAMPLE_OMITTED, SAMPLE_NEW, SAMPLE_NEW_PAYWALLED],
  profiles: [
    {
      id: "prof1",
      built_at: "2026-10-01T00:00:00Z",
      tier: "quick",
      corpus_size_at_build: 4000,
      calibration_status: "tested",
      built_by_run_id: "r1",
    },
  ],
  runs: [
    {
      id: "r1",
      state: "completed",
      workflow: "profile_voice",
      spent_credits: 120,
      created_at: "2026-10-01T00:00:00Z",
      ended_at: "2026-10-01T00:10:00Z",
    },
  ],
  artifacts: [
    { id: "a1", kind: "profile", mirror_path: "profile/voice.md", version_id: "av1", created_at: "2026-10-01T00:00:00Z" },
  ],
  projects: [{ id: "pj1", slug: SLUG, title: "Acme Essay" }],
  factsPanel: {
    facts: [
      { key: "seed", label: "Description", line: "changed since the build", changed: true },
      { key: "samples", label: "Samples", line: "1 added", changed: true },
    ],
    ageDays: 4,
    corpusWords: { built: 4000, current: 5200 },
    verb: "Update voice",
    route: { scope: "delta", workflow: "refresh_voice", inputs: {}, sentence: "Re-run the changed phases." },
  },
  updateRoute: { scope: "delta", workflow: "refresh_voice", inputs: {}, sentence: "Re-run the changed phases." },
  upgradeRoute: { scope: "full_from_quick", workflow: "profile_voice", inputs: {}, sentence: "Build the full profile." },
  holdout: { held: true, revealed: true, itemId: "s2", title: "Paywalled post", revealedAt: "2026-10-01T00:00:00Z" },
  measures: { corpus: { words: 5200 } } as VoiceDetailDto["measures"],
  calibration: {
    verdict: "tested",
    rows: [
      { feature: "sentence_length", target: 18, prediction: 17, actual: 19, withinBand: true },
      { feature: "hedging_rate", target: 0.2, prediction: null, actual: 0.6, withinBand: false },
    ],
    withinCount: 1,
    totalCount: 2,
  },
  corrections: [
    {
      id: "cr1",
      profile_id: "prof1",
      target_artifact_id: null,
      statement_ref: null,
      text: "Less hedging.",
      source: "user",
      consumed_by_profile_id: null,
      at: "2026-10-02T00:00:00Z",
    },
  ],
  gate: {
    gateId: "g1",
    runId: "r9",
    workflow: "profile_voice",
    card: {
      includedLine: "1 of 3 pieces",
      exclusions: [{ title: "Paywalled post", reason: "paywalled" }],
      holdoutLine: "one of your pieces is held back to test the profile — you won't see which until after calibration",
      estimate: { credits: 60, capCredits: 150 },
      knobs: { sampleCap: 40, calibration: true, modelTier: "base" },
      calibrationWarning: "Calibration is off for this build.",
      waitingUntil: null,
    },
  },
  members: [{ id: "pm1", display_name: "Member Voice", byline: null }],
  buildNotes: [{ id: "bn1", profile_id: "prof1", body: "Last build notes.", created_at: "2026-10-01T00:00:00Z" }],
  hubMarkdown: "Profile hub paragraph.",
  profileSections: [
    { key: "voice-core", path: "profile/voice.md", collapsed: false, advanced: false },
    { key: "voice-measures", path: null, collapsed: true, advanced: true },
  ],
  tier: "quick",
};

const SAMPLE_DETAIL: VoiceSampleDetailDto = {
  item: {
    id: "s2",
    external_id: "e2",
    title: "Paywalled post",
    url: "https://example.test/post",
    date: null,
    word_count: 90,
    access: "paywalled",
    state: "omitted",
    provider: "substack",
    connection_id: "cn1",
  },
  versions: [
    { id: "v2", n: 2, content_sha256: "bbb", original_sha256: null, quality: "partial", quality_notes: ["scanned page — try the visual tier"], word_count: 90 },
    { id: "v0", n: 1, content_sha256: "aa0", original_sha256: null, quality: "unreadable", quality_notes: null, word_count: null },
  ],
  document: "The canonical document text.",
};

const RESEED = {
  slug: SLUG,
  projectId: "pj1",
  preview: {
    charterFound: true,
    current: "old charter",
    next: "new charter",
    diff: [
      { kind: "same" as const, line: "Voice: Voice One" },
      { kind: "removed" as const, line: "old guidance" },
      { kind: "added" as const, line: "new guidance" },
    ],
    guidancePreserved: true,
  },
};

// ---- the fetch stub -------------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FetchOpts {
  voicesStatus?: number;
  voices?: { voices: VoiceListDto | null };
  detailStatus?: number;
  detail?: VoiceDetailDto;
  connections?: { connections: readonly VoiceConnectionDto[] };
  sampleDetail?: VoiceSampleDetailDto;
  reseedStatus?: number;
  presignStatus?: number;
  /** per-path deferred replies — the REQ-UX-16 in-flight leg holds a POST open. */
  hold?: Record<string, Promise<Response>>;
  /** captured PUTs to the presigned URL — `{url, init}`. */
  puts?: { url: string; init?: RequestInit }[];
}

function makeFetch(opts: FetchOpts = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (url === "/bff/voices") {
      return opts.voicesStatus != null && opts.voicesStatus !== 200
        ? jsonResponse(opts.voicesStatus, { error: "upstream_unavailable" })
        : jsonResponse(200, opts.voices ?? { voices: VOICES_LIST });
    }
    if (url === "/bff/voices/new") return jsonResponse(200, { voiceNew: {} });
    if (url.startsWith("/bff/voices/")) {
      if (opts.detailStatus != null && opts.detailStatus !== 200) {
        return jsonResponse(opts.detailStatus, { error: "not_found" });
      }
      const d = opts.detail ?? DETAIL;
      const isSamples = url.includes("tab=samples");
      return jsonResponse(200, {
        voice: {
          detail: d,
          estimate: { estimateCredits: 60, capCredits: 150, rateTableVersion: 1, provisional: false, levers: {} },
          updatePlan: { route: { scope: "delta", workflow: "refresh_voice", inputs: {}, sentence: "Re-run the changed phases." }, estimate: null, upgrade: null, upgradeEstimate: null },
          ...(isSamples ? { connections: opts.connections ?? { connections: [CONNECTION] } } : {}),
          ...(isSamples && url.includes("sample=") ? { sampleDetail: opts.sampleDetail ?? SAMPLE_DETAIL } : {}),
          ...(url.includes("tab=") ? { tab: new URLSearchParams(url.split("?")[1]).get("tab") } : {}),
        },
      });
    }
    if (url === `/bff/p/${SLUG}/voice/reseed`) {
      return opts.reseedStatus != null && opts.reseedStatus !== 200
        ? jsonResponse(opts.reseedStatus, { error: "not_found" })
        : jsonResponse(200, { voiceReseed: RESEED });
    }
    if (url === "/bff/import/presign") {
      return opts.presignStatus != null && opts.presignStatus !== 200
        ? jsonResponse(opts.presignStatus, { error: "upload_unavailable" })
        : jsonResponse(200, {
            url: "https://storage.example.test/quarantine/w1/u1",
            key: "quarantine/w1/u1",
            maxBytes: 10_000_000,
            requiredHeaders: { "content-type": "text/markdown" },
          });
    }
    // The direct GCS PUT — the signed URL is cross-origin; the cookie never leaves the origin.
    if (url.startsWith("https://storage.example.test/")) {
      opts.puts?.push({ url, init });
      return new Response("", { status: 200 });
    }
    if (opts.hold?.[url] != null) return opts.hold[url]!;
    // The voices mutation grammar — every SSR action path answers the JSON envelope.
    if (url === "/voices/new") return jsonResponse(200, { ok: true, redirect: "/v/p9" });
    if (url === `/v/${PID}/fork` || url === "/v/p2/fork" || url === "/v/p3/fork") {
      return jsonResponse(200, { ok: true, redirect: "/v/p9" });
    }
    if (url === `/v/${PID}/seed`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?saved=1` });
    if (url === `/v/${PID}/corrections`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?corrected=1` });
    if (url === `/v/${PID}/samples`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?tab=samples&added=1` });
    if (url === `/v/${PID}/samples/url`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?tab=samples&added=1` });
    if (url === `/v/${PID}/samples/s2`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?tab=samples` });
    if (url === `/v/${PID}/samples/s2/reconstruct`) {
      return jsonResponse(200, { ok: true, redirect: `/v/${PID}?tab=samples&sample=s2&reconstruct=queued` });
    }
    if (url === `/v/${PID}/connections`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?tab=samples` });
    if (url === `/v/${PID}/connections/cn1/confirm`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?tab=samples` });
    if (url === `/v/${PID}/connections/cn1/settings`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?tab=samples` });
    if (url === `/v/${PID}/sync`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?tab=samples` });
    if (url === `/v/${PID}/gates/g1`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}` });
    if (url === `/v/${PID}/update`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}` });
    if (url === `/v/${PID}/cancel`) return jsonResponse(200, { ok: true, redirect: `/v/${PID}?cancelled=1` });
    if (url === `/v/${PID}/delete`) return jsonResponse(200, { ok: true, redirect: "/voices?deleted=1" });
    if (url === `/p/${SLUG}/voice/adopt`) return jsonResponse(200, { ok: true, redirect: `/p/${SLUG}` });
    return jsonResponse(500, { error: "unstubbed_path" });
  });
}

function bootFor(surfaces: Record<string, "spa" | "ssr">): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass: "desktop", surfaces };
}

const SPA_ALL = {
  "/voices": "spa",
  "/voices/new": "spa",
  "/v/$persona": "spa",
  "/p/$project/voice/reseed": "spa",
} as const;

let assignSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>) {
  vi.stubGlobal("fetch", fetchImpl);
  const el = document.createElement("div");
  el.setAttribute("data-spa-root", "");
  document.body.appendChild(el);
  const { router, queryClient } = createSpaRouter({
    boot,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const root = createRoot(el);
  mounted.push(root);
  await act(async () => {
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
    await router.load();
  });
  return { router, queryClient, el };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

/** The REQ-TST-2 emission filter — which manifest entries the SSR twin emits on a markup string. */
function emittedOn(ssrMarkup: string) {
  const esc = (s: string) => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");
  return hooksForSurface("voices").filter((entry) => {
    if (entry.kind === "attr") return new RegExp(`\\b${esc(entry.hook)}(?:[\\s=>/]|$)`).test(ssrMarkup);
    if (entry.kind === "attr-prefix") return new RegExp(`\\b${esc(entry.hook)}[\\w-]`).test(ssrMarkup);
    if (entry.kind === "field") return new RegExp(`\\bname=["']${esc(entry.hook)}["']`).test(ssrMarkup);
    if (entry.kind === "field-prefix") return new RegExp(`\\bname=["'\`]${esc(entry.hook)}`).test(ssrMarkup);
    return false;
  });
}

/** A deferred Response — the REQ-UX-16 leg holds a mutation in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Submit one form inside an act — fireEvent + the mutation's microtask flush. The optional
 *  `submitter` is the clicked control: the delegated handler folds its name/value into the JSON
 *  body exactly like the SSR's pressed button rides the form post. */
async function submit(form: Element, submitter?: Element) {
  await act(async () => {
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    if (submitter != null) Object.defineProperty(ev, "submitter", { value: submitter });
    form.dispatchEvent(ev);
  });
}

/** Put a File on a file input (happy-dom's FileList is not settable — defineProperty). */
function setFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
}

beforeEach(() => {
  assignSpy = vi.fn();
  spaRuntime.assign = assignSpy;
  document.documentElement.removeAttribute("data-route");
  document.documentElement.removeAttribute("data-mounted");
  document.title = "";
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  spaRuntime.assign = (href) => window.location.assign(href);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---- /voices ----------------------------------------------------------------------------------------

describe("GET /voices mounted (REQ-SEQ-9)", () => {
  const BOOT = bootFor({ ...SPA_ALL });

  it("renders the three-group library + every card's hooks verbatim", async () => {
    await mountAt("/voices", BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(VC.listHeading);
    expect(main.querySelector("[data-new-voice]")?.getAttribute("href")).toBe("/voices/new");
    for (const g of ["your_voices", "house_styles", "shared_with_you"]) {
      expect(main.querySelector(`[data-voice-group-section="${g}"]`), g).not.toBeNull();
    }
    const card = main.querySelector(`[data-voice-card="${PID}"]`);
    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-voice-group")).toBe("your_voices");
    expect(card?.querySelector(`[data-voice-pill]`)).not.toBeNull();
    expect(card?.querySelector(`[data-voice-tier]`)).not.toBeNull();
    expect(card?.querySelector("[data-voice-sources]")).not.toBeNull();
    expect(card?.textContent).toContain("Voice One");
    // The house card is read-only + forkable.
    const house = main.querySelector('[data-voice-card="p2"]');
    expect(house?.querySelector("[data-read-only]")).not.toBeNull();
    expect(house?.querySelector('[data-fork-voice="p2"]')).not.toBeNull();
    // The composite renders the members line.
    expect(main.querySelector('[data-voice-card="p3"] [data-composed-from]')?.textContent).toContain("Voice One");
  });

  it("the fork form posts the JSON branch and navigates the envelope redirect in-router", async () => {
    const f = makeFetch();
    const { router } = await mountAt("/voices", BOOT, f);
    const form = el()!.querySelector(`form[action="/v/p2/fork"]`)!;
    await submit(form);
    const post = f.mock.calls.find(([u, i]) => String(u) === "/v/p2/fork" && i != null);
    expect(post).toBeDefined();
    const init = post![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json", accept: "application/json" });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/v/p9"));
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("a degraded twin (voices: null) renders the SSR's empty-state leg verbatim", async () => {
    await mountAt("/voices", BOOT, makeFetch({ voices: { voices: null } }));
    expect(el()!.textContent).toContain(VC.listEmpty);
    expect(el()!.querySelector("[data-voice-card]")).toBeNull();
  });

  it("REQ-TST-2 parity — every voices hook the SSR page emits on this fixture is emitted", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ voices: VOICES_LIST }}>
        <VoicesPage />
      </PageDataContext.Provider>,
    );
    await mountAt("/voices", BOOT, makeFetch());
    const spaMarkup = el()!.innerHTML;
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(6);
    expectManifestEmission(spaMarkup, emitted);
    for (const literal of [
      'data-voice-card="p1"',
      'data-voice-group="your_voices"',
      'data-voice-group-section="house_styles"',
      'data-read-only="true"',
      'data-fork-voice="p2"',
      'data-composed-from="true"',
      'data-voice-sources="true"',
      'data-new-voice="true"',
    ]) {
      expect(spaMarkup, literal).toContain(literal);
      expect(ssrMarkup, literal).toContain(literal);
    }
  });

  it("component axe on the mounted library (REQ-VFY-6)", async () => {
    await mountAt("/voices", BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });

  it("an unflipped verdict hands the document back — no surface, no BFF read", async () => {
    const f = makeFetch();
    await mountAt("/voices", bootFor({ ...SPA_ALL, "/voices": "ssr" }), f);
    expect(assignSpy).toHaveBeenCalledWith("/voices");
    expect(el()?.querySelector("[data-voice-card]")).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u) === "/bff/voices")).toBe(false);
  });
});

// ---- /voices/new ------------------------------------------------------------------------------------

describe("GET /voices/new mounted (REQ-BFF-16)", () => {
  const BOOT = bootFor({ ...SPA_ALL });

  it("renders the creation sheet verbatim — fields, tier radio, mode select, the two intents", async () => {
    await mountAt("/voices/new", BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(VC.new.heading);
    const form = main.querySelector('form[action="/voices/new"]')!;
    for (const field of [
      'name="name"',
      'name="byline"',
      'name="description"',
      'name="sample_title"',
      'name="sample_text"',
      'name="sample_file"',
      'name="sample_url"',
      'name="tier"',
      'name="mode"',
      'name="intent"',
    ]) {
      expect(form.innerHTML, field).toContain(field);
    }
    expect(form.querySelector("[data-tier-full]")).not.toBeNull();
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("enctype")).toBe("multipart/form-data");
  });

  it("a save submit posts the flat JSON vocabulary with the submitter's intent", async () => {
    const f = makeFetch();
    await mountAt("/voices/new", BOOT, f);
    const form = el()!.querySelector('form[action="/voices/new"]')!;
    form.querySelector<HTMLInputElement>('[name="name"]')!.value = "Voice Two";
    form.querySelector<HTMLTextAreaElement>('[name="sample_text"]')!.value = "some words";
    const save = form.querySelector('[name="intent"][value="save"]')!;
    await submit(form, save);
    const post = f.mock.calls.find(([u, i]) => String(u) === "/voices/new" && i != null);
    expect(post).toBeDefined();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({
      name: "Voice Two",
      sample_text: "some words",
      tier: "quick",
      mode: "self",
      intent: "save",
    });
    await vi.waitFor(() => expect(el()!.querySelector("[data-voice-status]") ?? true).toBeTruthy());
  });

  it("REQ-BFF-16 — a chosen file presigns, PUTs cross-origin, and posts quarantineKey only", async () => {
    const puts: { url: string; init?: RequestInit }[] = [];
    const f = makeFetch({ puts });
    await mountAt("/voices/new", BOOT, f);
    const form = el()!.querySelector('form[action="/voices/new"]')!;
    form.querySelector<HTMLInputElement>('[name="name"]')!.value = "Upload Voice";
    const fileInput = form.querySelector<HTMLInputElement>('[name="sample_file"]')!;
    setFile(fileInput, new File(["# bytes"], "essay.md", { type: "text/markdown" }));
    const build = form.querySelector('[name="intent"][value="build"]')!;
    await submit(form, build);
    // Order: presign POST → cross-origin PUT with the signed headers verbatim → the JSON create.
    const presign = f.mock.calls.find(([u]) => String(u) === "/bff/import/presign");
    expect(presign).toBeDefined();
    expect((presign![1] as RequestInit).method).toBe("POST");
    expect(puts.length).toBe(1);
    expect(puts[0]!.url).toBe("https://storage.example.test/quarantine/w1/u1");
    expect(puts[0]!.init?.method).toBe("PUT");
    expect(puts[0]!.init?.headers).toEqual({ "content-type": "text/markdown" });
    // The presign leg's key carrier — an inert hidden input until the PUT returns.
    expect(form.querySelector('[name="quarantineKey"]')).not.toBeNull();
    const post = f.mock.calls.find(([u, i]) => String(u) === "/voices/new" && i != null);
    const body = JSON.parse(String((post![1] as RequestInit).body));
    expect(body.quarantineKey).toBe("quarantine/w1/u1");
    expect(body.intent).toBe("build");
    // The File itself never becomes a JSON field.
    expect(body.sample_file).toBeUndefined();
    // presign precedes the PUT precedes the mutation.
    const order = f.mock.calls.map(([u]) => String(u));
    expect(order.indexOf("/bff/import/presign")).toBeLessThan(order.lastIndexOf("/voices/new"));
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("a refused create (name_required) renders the SSR's inline role=alert refusal", async () => {
    const f = makeFetch();
    await mountAt("/voices/new", BOOT, f);
    const form = el()!.querySelector('form[action="/voices/new"]')!;
    // name empty → the server answers 400 {error:"name_required", detail}; simulate that answer.
    f.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url === "/voices/new" && init != null) {
        return jsonResponse(400, { error: "name_required", detail: VC.new.nameRequired });
      }
      return jsonResponse(500, { error: "unstubbed_path" });
    });
    const save = form.querySelector('[name="intent"][value="save"]')!;
    await submit(form, save);
    await vi.waitFor(() =>
      expect(el()!.querySelector('[role="alert"]')?.textContent).toBe(VC.new.nameRequired),
    );
    // Busy state settled — the form is editable again.
    expect(form.getAttribute("aria-busy")).toBeNull();
  });

  it("REQ-UX-16 — the in-flight form is aria-busy with disabled controls", async () => {
    const gate = deferred<Response>();
    const f = makeFetch({ hold: { "/voices/new": gate.promise } });
    await mountAt("/voices/new", BOOT, f);
    const form = el()!.querySelector('form[action="/voices/new"]')!;
    form.querySelector<HTMLInputElement>('[name="name"]')!.value = "Pending";
    fireEvent.submit(form);
    await vi.waitFor(() => expect(form.getAttribute("aria-busy")).toBe("true"));
    expect(form.querySelector<HTMLInputElement>('[name="name"]')!.disabled).toBe(true);
    expect(form.querySelector('[name="intent"]')!.hasAttribute("disabled")).toBe(true);
    await act(async () => {
      gate.resolve(jsonResponse(200, { ok: true, redirect: "/v/p9" }));
    });
    await vi.waitFor(() => expect(form.getAttribute("aria-busy")).toBeNull());
  });

  it("REQ-TST-2 parity — the SSR sheet's hooks + fields emit identically", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ voiceNew: {} }}>
        <VoiceNewPage />
      </PageDataContext.Provider>,
    );
    await mountAt("/voices/new", BOOT, makeFetch());
    const spaMarkup = el()!.innerHTML;
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(8);
    expectManifestEmission(spaMarkup, emitted);
  });

  it("component axe on the mounted creation sheet (REQ-VFY-6)", async () => {
    await mountAt("/voices/new", BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });
});

// ---- /v/:persona — overview -------------------------------------------------------------------------

describe("GET /v/:persona mounted (overview)", () => {
  const BOOT = bootFor({ ...SPA_ALL });

  it("renders the pill row, tab bar, facts panel, gate card, hub, projects, delete", async () => {
    await mountAt(`/v/${PID}`, BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe("Voice One");
    expect(main.querySelector("[data-voice-status]")).not.toBeNull();
    expect(main.querySelector(`[data-voice-pill]`)).not.toBeNull();
    // The five-tab bar — `?tab=` hrefs stay document anchors (strangler re-decides).
    const tabs = main.querySelector("[data-voice-tabs]");
    expect(tabs).not.toBeNull();
    expect(tabs?.querySelector('[data-voice-tab="overview"]')?.getAttribute("aria-current")).toBe("page");
    expect(tabs?.querySelector('[data-voice-tab="samples"]')?.getAttribute("href")).toBe(`/v/${PID}?tab=samples`);
    // Facts panel + routed sentence.
    expect(main.querySelector("[data-facts-panel]")).not.toBeNull();
    expect(main.querySelector('[data-fact="seed"]')?.getAttribute("data-changed")).toBe("true");
    expect(main.querySelector("[data-update-route]")?.textContent).toContain("Re-run the changed phases");
    // The gate card + its three decisions.
    const gateCard = main.querySelector("[data-gate-card]")!;
    expect(gateCard.querySelector("[data-gate-approve]")).not.toBeNull();
    expect(gateCard.querySelector("[data-holdout-line]")).not.toBeNull();
    expect(gateCard.querySelector("[data-calibration-warning]")).not.toBeNull();
    expect(gateCard.querySelector('form')?.getAttribute("action")).toBe(`/v/${PID}/gates/g1`);
    // Hub + projects + delete.
    expect(main.querySelector("[data-hub]")?.textContent).toContain("Profile hub paragraph");
    expect(main.querySelector("[data-projects] a")?.getAttribute("href")).toBe(`/p/${SLUG}`);
    const del = main.querySelector("[data-voice-delete]")!;
    expect(del.querySelector('[name="confirm"]')).not.toBeNull();
    expect(del.querySelector("[data-delete-voice]")).not.toBeNull();
    // The composed-from line (members fixture) + the cancel form (active run).
    expect(main.querySelector("[data-composed-from]")).not.toBeNull();
    expect(main.querySelector(`form[action="/v/${PID}/cancel"] [name="runId"]`)).not.toBeNull();
    // The update + upgrade verbs.
    expect(main.querySelector("[data-update-voice]")).not.toBeNull();
    expect(main.querySelector("[data-upgrade-voice]")).not.toBeNull();
  });

  it("the gate approve submit posts action=approve + the hidden runId", async () => {
    const f = makeFetch();
    await mountAt(`/v/${PID}`, BOOT, f);
    const form = el()!.querySelector(`form[action="/v/${PID}/gates/g1"]`)!;
    const approve = form.querySelector('[name="action"][value="approve"]')!;
    await submit(form, approve);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/gates/g1` && i != null);
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ runId: "r9", action: "approve" });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("the upgrade verb posts scope=full_from_quick", async () => {
    const f = makeFetch();
    await mountAt(`/v/${PID}`, BOOT, f);
    const upgrade = el()!.querySelector("[data-upgrade-voice]")!;
    const form = upgrade.closest("form")!;
    await submit(form, upgrade);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/update` && i != null);
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ scope: "full_from_quick" });
  });

  it("the typed delete posts {confirm:'delete'} and lands on /voices?deleted=1", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/v/${PID}`, BOOT, f);
    const form = el()!.querySelector(`form[action="/v/${PID}/delete"]`)!;
    form.querySelector<HTMLInputElement>('[name="confirm"]')!.value = "delete";
    await submit(form, form.querySelector("[data-delete-voice]")!);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/delete` && i != null);
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ confirm: "delete" });
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe("/voices");
      expect(router.state.location.href).toContain("deleted=1");
    });
  });

  it("the notice flash arrives from ?saved=1 — the document's composition verbatim", async () => {
    await mountAt(`/v/${PID}?saved=1`, BOOT, makeFetch());
    expect(el()!.textContent).toContain(VC.detail.seedSaved);
  });

  it("the ?build_failed=1 flash explains the refused build gate", async () => {
    await mountAt(`/v/${PID}?build_failed=1`, BOOT, makeFetch());
    expect(el()!.textContent).toContain(VC.new.fullRequired);
  });

  it("the build verb + the gate's waiting line render when the action is build", async () => {
    const buildable: VoiceDetailDto = {
      ...DETAIL,
      status: { ...STATUS, action: "build" },
      gate: {
        ...DETAIL.gate!,
        card: { ...DETAIL.gate!.card, waitingUntil: "2099-01-02T00:00:00Z" },
      },
    };
    await mountAt(`/v/${PID}`, BOOT, makeFetch({ detail: buildable }));
    expect(el()!.querySelector(`form[action="/v/${PID}/build"] [data-build-voice]`)).not.toBeNull();
    expect(el()!.querySelector("[data-gate-waiting]")?.textContent).toContain("Available after");
  });

  it("REQ-TST-2 parity — the overview's SSR hooks emit identically", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ voice: { detail: DETAIL, tab: "overview" } }}>
        <VoiceDetailPage />
      </PageDataContext.Provider>,
    );
    await mountAt(`/v/${PID}`, BOOT, makeFetch());
    const spaMarkup = el()!.innerHTML;
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(10);
    expectManifestEmission(spaMarkup, emitted);
    for (const literal of [
      'data-voice-status="true"',
      'data-voice-tabs="true"',
      'data-facts-panel="true"',
      'data-gate-card="true"',
      'data-hub="true"',
      'data-projects="true"',
      'data-voice-delete="true"',
      'data-update-voice="true"',
      'data-upgrade-voice="true"',
      'name="scope"',
      'name="runId"',
      'name="action"',
      'name="confirm"',
    ]) {
      expect(spaMarkup, literal).toContain(literal);
      expect(ssrMarkup, literal).toContain(literal);
    }
  });

  it("component axe on the mounted overview tab (REQ-VFY-6)", async () => {
    await mountAt(`/v/${PID}`, BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });

  it("a twin 404 renders not-found; a non-401 twin failure renders the designed error", async () => {
    await mountAt(`/v/${PID}`, BOOT, makeFetch({ detailStatus: 404 }));
    expect(el()!.textContent).toContain(COPY.notFound.heading);
    document.body.innerHTML = "";
    await mountAt(`/v/${PID}`, BOOT, makeFetch({ detailStatus: 502 }));
    expect(el()?.querySelector("[data-spa-error]")).not.toBeNull();
    expect(assignSpy).not.toHaveBeenCalledWith("/login");
  });
});

// ---- /v/:persona — description + samples + profile + runs ------------------------------------------

describe("GET /v/:persona?tab=… mounted", () => {
  const BOOT = bootFor({ ...SPA_ALL });

  it("description tab — the seed editor posts flat fields; corrections ledger + form render", async () => {
    const f = makeFetch();
    await mountAt(`/v/${PID}?tab=description`, BOOT, f);
    const main = el()!;
    expect(main.querySelector("[data-seed-editor]")).not.toBeNull();
    expect(main.querySelector("[data-agent-drafted]")).not.toBeNull();
    // The corrections ledger + row + the correction form's `text` field — asserted BEFORE any
    // submit: a mutation's redirect envelope drops `?tab`, so the remount lands on overview.
    expect(main.querySelector("[data-corrections]")).not.toBeNull();
    expect(main.querySelector('[data-correction="cr1"]')?.getAttribute("data-consumed")).toBe("false");
    const corrForm = main.querySelector(`form[action="/v/${PID}/corrections"]`)!;
    expect(corrForm.querySelector('[name="text"]')).not.toBeNull();
    corrForm.querySelector<HTMLTextAreaElement>('[name="text"]')!.value = "fix this";
    await submit(corrForm);
    const cpost = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/corrections` && i != null);
    expect(JSON.parse(String((cpost![1] as RequestInit).body))).toEqual({ text: "fix this" });
    // After the ?corrected=1 envelope-nav the leaf remounts on overview — re-render the tab.
    document.body.innerHTML = "";
    await mountAt(`/v/${PID}?tab=description`, BOOT, f);
    const main2 = el()!;
    // Build notes render their rows.
    expect(main2.querySelector("[data-build-notes]")).not.toBeNull();
    expect(main2.querySelector('[data-build-note="bn1"]')).not.toBeNull();
    const form = main2.querySelector(`form[action="/v/${PID}/seed"]`)!;
    form.querySelector<HTMLInputElement>('[name="byline"]')!.value = "New Byline";
    form.querySelector<HTMLInputElement>('[name="registers"]')!.value = "essay, review";
    form.querySelector<HTMLTextAreaElement>('[name="description"]')!.value = "revised seed";
    await submit(form);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/seed` && i != null);
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      byline: "New Byline",
      registers: "essay, review",
      description: "revised seed",
    });
  });

  it("samples tab — sources pane, review confirm arrays, item badges, drawer, add forms", async () => {
    const f = makeFetch();
    await mountAt(`/v/${PID}?tab=samples&sample=s2`, BOOT, f);
    const main = el()!;
    // The samples section wraps the sources pane + item rows + add forms.
    expect(main.querySelector("[data-samples]")).not.toBeNull();
    // Sources pane — the connection card's hooks + actions.
    const src = main.querySelector('[data-source="cn1"]')!;
    expect(src.getAttribute("data-provider")).toBe("substack");
    expect(src.querySelector("[data-source-error]")).not.toBeNull();
    expect(src.querySelector("[data-discover]")).not.toBeNull();
    expect(src.querySelector("[data-resync]")).not.toBeNull();
    expect(src.querySelector("[data-remove-source]")).not.toBeNull();
    expect(src.querySelector("[data-source-settings-form] [name=\"autoIncludeNew\"]")).not.toBeNull();
    expect(src.querySelector('[name="dailySync"]')).not.toBeNull();
    // Re-sync all + the three link flows.
    expect(main.querySelector("[data-resync-all]")).not.toBeNull();
    expect(main.querySelector("[data-link-substack]")).not.toBeNull();
    expect(main.querySelector("[data-link-url]")).not.toBeNull();
    expect(main.querySelector("[data-link-export]")).not.toBeNull();
    // The open drawer — preview + versions + the priced reconstruction (partial ⇒ text; the
    // "scanned" note offers the visual tier too).
    const drawer = main.querySelector("[data-sample-drawer]")!;
    expect(drawer.querySelector("[data-sample-preview]")?.textContent).toContain("canonical document");
    expect(drawer.querySelector("[data-quality-notes]")).not.toBeNull();
    expect(drawer.querySelector("[data-sample-versions] [data-version]")).not.toBeNull();
    expect(drawer.querySelector("[data-reconstruct-text]")).not.toBeNull();
    expect(drawer.querySelector("[data-reconstruct-visual]")).not.toBeNull();
    // The item rows — state/paywalled/quality badges + the hold-out badge (revealed fixture).
    const row = main.querySelector('[data-sample="s2"]')!;
    expect(row.querySelector('[data-sample-state="omitted"]')).not.toBeNull();
    expect(row.querySelector("[data-sample-paywalled]")).not.toBeNull();
    expect(row.querySelector('[data-sample-quality="partial"]')).not.toBeNull();
    expect(row.querySelector("[data-holdout-badge]")).not.toBeNull();
    expect(row.querySelector(`a[data-sample-open="s2"]`)).not.toBeNull();
    // The review step — 'new' items ride the confirm form.
    const confirm = src.querySelector("form[data-confirm]")!;
    expect(confirm.getAttribute("action")).toBe(`/v/${PID}/connections/cn1/confirm`);
    expect(confirm.querySelector('[data-review-item="e3"]')).not.toBeNull();
    expect(confirm.querySelector('[data-review-item="e4"]')).not.toBeNull();
    expect(confirm.querySelector("[data-confirm-cta]")).not.toBeNull();
    await submit(confirm);
    const cpost = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/connections/cn1/confirm` && i != null);
    const cbody = JSON.parse(String((cpost![1] as RequestInit).body));
    // The multi-value grammar — `known` folds both discovered ids into the array; `include`
    // carries the one checked (free) id — a scalar, exactly like a form post's single field.
    // The paywalled row stays omitted and is never fetched (REQ-INGEST-4).
    expect(cbody.known).toEqual(["e3", "e4"]);
    expect(cbody.include).toBe("e3");
    // The envelope-nav dropped `?sample` — the twin's key changed, so the repaint is a fresh
    // (refetched) read; wait for it rather than asserting through the pending shell.
    await vi.waitFor(() => expect(el()!.querySelector("[data-sources]")).not.toBeNull());
    // Include/omit — the submitter's name/value carries the toggle (re-queried post-remount).
    const toggle = el()!.querySelector('[data-sample="s2"] [name="included"]')!;
    await submit(toggle.closest("form")!, toggle);
    const tpost = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/samples/s2` && i != null);
    expect(JSON.parse(String((tpost![1] as RequestInit).body))).toEqual({ included: "true" });
  });

  it("the paste-sample form rides the presign→PUT leg; the URL form posts flat fields", async () => {
    const puts: { url: string; init?: RequestInit }[] = [];
    const f = makeFetch({ puts });
    await mountAt(`/v/${PID}?tab=samples`, BOOT, f);
    const form = el()!.querySelector(`form[action="/v/${PID}/samples"]`)!;
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = "New sample";
    setFile(form.querySelector<HTMLInputElement>('[name="file"]')!, new File(["body"], "s.md"));
    await submit(form);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/samples` && i != null);
    const body = JSON.parse(String((post![1] as RequestInit).body));
    expect(body.quarantineKey).toBe("quarantine/w1/u1");
    expect(body.title).toBe("New sample");
    expect(body.file).toBeUndefined();
    expect(puts.length).toBe(1);
    // The URL form — flat fields, no upload leg.
    const urlForm = el()!.querySelector(`form[action="/v/${PID}/samples/url"]`)!;
    urlForm.querySelector<HTMLInputElement>('[name="url"]')!.value = "https://example.test/a";
    await submit(urlForm);
    const upost = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/samples/url` && i != null);
    expect(JSON.parse(String((upost![1] as RequestInit).body))).toEqual({ url: "https://example.test/a" });
  });

  it("the substack export link rides presign→PUT→quarantineKey with provider=substack_export", async () => {
    const f = makeFetch();
    await mountAt(`/v/${PID}?tab=samples`, BOOT, f);
    const exportForm = el()!.querySelector(`form[action="/v/${PID}/connections"][enctype="multipart/form-data"]`)!;
    setFile(exportForm.querySelector<HTMLInputElement>('[name="file"]')!, new File(["zip"], "export.zip"));
    await submit(exportForm);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/v/${PID}/connections` && i != null && JSON.parse(String(i.body)).provider === "substack_export");
    const body = JSON.parse(String((post![1] as RequestInit).body));
    expect(body).toEqual({ provider: "substack_export", quarantineKey: "quarantine/w1/u1" });
  });

  it("profile tab — snapshot line, calibration table, fixed sections, measures, artifacts", async () => {
    await mountAt(`/v/${PID}?tab=profile`, BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector("[data-calibration]")).not.toBeNull();
    expect(main.querySelector('[data-calibration-verdict="tested"]')).not.toBeNull();
    const row = main.querySelector('[data-calibration-row="hedging_rate"]')!;
    expect(row.getAttribute("data-within-band")).toBe("false");
    expect(main.querySelector("[data-profile-sections]")).not.toBeNull();
    expect(main.querySelector('[data-profile-section="voice-core"]')).not.toBeNull();
    expect(main.querySelector('[data-profile-section="voice-measures"]')).not.toBeNull();
    expect(main.querySelector("[data-voice-measures]")).not.toBeNull();
    expect(main.querySelector("[data-artifacts]")).not.toBeNull();
    expect(main.querySelector('[data-artifact-kind="profile"]')?.textContent).toContain("profile/voice.md");
    expect(main.querySelector("[data-upgrade-voice]")).not.toBeNull();
  });

  it("runs tab — build history + snapshots", async () => {
    await mountAt(`/v/${PID}?tab=runs`, BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector("[data-runs]")).not.toBeNull();
    expect(main.querySelector('[data-run="r1"]')?.textContent).toContain("profile_voice");
    expect(main.querySelector('[data-profile="prof1"]')).not.toBeNull();
  });

  it("REQ-TST-2 parity — the samples tab's SSR hooks emit identically", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider
        value={{ voice: { detail: DETAIL, tab: "samples", connections: { connections: [CONNECTION] }, sampleDetail: SAMPLE_DETAIL } }}
      >
        <VoiceDetailPage />
      </PageDataContext.Provider>,
    );
    await mountAt(`/v/${PID}?tab=samples&sample=s2`, BOOT, makeFetch());
    const spaMarkup = el()!.innerHTML;
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(10);
    expectManifestEmission(spaMarkup, emitted);
    for (const literal of [
      'data-sources="true"',
      'data-source="cn1"',
      'data-provider="substack"',
      'data-source-error="true"',
      'data-confirm="true"',
      'data-review-item="e3"',
      'data-confirm-cta="true"',
      'data-sample="s2"',
      'data-sample-state="omitted"',
      'data-sample-paywalled="true"',
      'data-sample-quality="partial"',
      'data-holdout-badge="true"',
      'data-sample-drawer="true"',
      'data-sample-preview="true"',
      'data-sample-versions="true"',
      'data-quality-notes="true"',
      'data-reconstruct-text="true"',
      'data-reconstruct-visual="true"',
      'data-samples-form="true"',
      'data-add-url="true"',
      'name="include"',
      'name="known"',
      'name="provider"',
      'name="handle"',
      'name="url"',
      'name="text"',
      'name="title"',
      'name="included"',
      'name="autoIncludeNew"',
      'name="dailySync"',
      'name="tier"',
    ]) {
      expect(spaMarkup, literal).toContain(literal);
      expect(ssrMarkup, literal).toContain(literal);
    }
  });

  it("REQ-TST-2 parity — description/profile/runs hooks emit identically to SSR", async () => {
    for (const [tab, literals] of [
      ["description", ['data-seed-editor="true"', 'data-agent-drafted="true"', 'data-corrections="true"', 'data-correction="cr1"', 'data-consumed="false"', 'data-build-notes="true"', 'data-build-note="bn1"', 'name="byline"', 'name="registers"']],
      ["profile", ['data-calibration="true"', 'data-calibration-verdict="tested"', 'data-calibration-row="sentence_length"', 'data-within-band="false"', 'data-profile-sections="true"', 'data-profile-section="voice-measures"', 'data-voice-measures="true"', 'data-artifacts="true"', 'data-artifact-kind="profile"']],
      ["runs", ['data-runs="true"', 'data-run="r1"', 'data-profile="prof1"']],
    ] as const) {
      const ssrMarkup = renderToStaticMarkup(
        <PageDataContext.Provider value={{ voice: { detail: DETAIL, tab } }}>
          <VoiceDetailPage />
        </PageDataContext.Provider>,
      );
      document.body.innerHTML = "";
      await mountAt(`/v/${PID}?tab=${tab}`, BOOT, makeFetch());
      const spaMarkup = el()!.innerHTML;
      for (const literal of literals) {
        expect(spaMarkup, literal).toContain(literal);
        expect(ssrMarkup, literal).toContain(literal);
      }
    }
  });

  it("component axe on the mounted samples tab (REQ-VFY-6)", async () => {
    await mountAt(`/v/${PID}?tab=samples`, BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });
});

// ---- /p/:project/voice/reseed ------------------------------------------------------------------------

describe("GET /p/:project/voice/reseed mounted (REQ-BFF-11)", () => {
  const BOOT = bootFor({ ...SPA_ALL });

  it("renders the charter diff + guidance line and posts the adopt submitter's reseed flag", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/voice/reseed`, BOOT, f);
    const main = el()!;
    const diff = main.querySelector("[data-reseed-diff]")!;
    expect(diff.querySelector('[data-diff-kind="added"]')?.textContent).toContain("new guidance");
    expect(diff.querySelector('[data-diff-kind="removed"]')?.textContent).toContain("old guidance");
    expect(main.querySelector('[data-guidance-preserved="true"]')).not.toBeNull();
    const form = main.querySelector(`form[action="/p/${SLUG}/voice/adopt"]`)!;
    const adoptReseed = form.querySelector('[name="reseed"][value="true"]')!;
    expect(adoptReseed.getAttribute("data-adopt-reseed")).toBe("true");
    await submit(form, adoptReseed);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/p/${SLUG}/voice/adopt` && i != null);
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ reseed: "true" });
  });

  it("the plain adopt button posts reseed=false", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/voice/reseed`, BOOT, f);
    const form = el()!.querySelector(`form[action="/p/${SLUG}/voice/adopt"]`)!;
    await submit(form, form.querySelector('[name="reseed"][value="false"]')!);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/p/${SLUG}/voice/adopt` && i != null);
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ reseed: "false" });
  });

  it("a twin 404 renders not-found", async () => {
    await mountAt(`/p/${SLUG}/voice/reseed`, BOOT, makeFetch({ reseedStatus: 404 }));
    expect(el()!.textContent).toContain(COPY.notFound.heading);
  });

  it("REQ-TST-2 parity — the reseed page's SSR hooks emit identically", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ voiceReseed: RESEED }}>
        <VoiceReseedPage />
      </PageDataContext.Provider>,
    );
    await mountAt(`/p/${SLUG}/voice/reseed`, BOOT, makeFetch());
    const spaMarkup = el()!.innerHTML;
    const emitted = emittedOn(ssrMarkup);
    expectManifestEmission(spaMarkup, emitted);
    for (const literal of ['data-reseed-diff="true"', 'data-diff-kind="added"', 'data-guidance-preserved="true"', 'data-adopt-reseed="true"', 'name="reseed"']) {
      expect(spaMarkup, literal).toContain(literal);
      expect(ssrMarkup, literal).toContain(literal);
    }
  });

  it("component axe on the mounted reseed surface (REQ-VFY-6)", async () => {
    await mountAt(`/p/${SLUG}/voice/reseed`, BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });
});
