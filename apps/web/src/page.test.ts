import { describe, it, expect, vi } from "vitest";
import { ApiError, type ProjectRow, type EditorDocDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// P1.02 — the Page web surface (§5.4; REQ-DATA-28/29 amended): the /v/:v + /v/working routes render the
// schema-first editor (SSR preview + the embedded doc/provenance/findings JSON the page.js island mounts),
// the project overview mounts the working head, and the transport endpoints carry the provenance capture.
// R7RO.1 — the only SSR Page left is the forced-SSR PHONE arm (ADR-128/REQ-ED-12 amended: the
// `showcase` arm is deleted — a showcase row on desktop serves the shell and renders read-only INSIDE
// the SPA). The fixture keeps `showcase: true` so the SSR render asserts below pin a showcase row's
// read-only posture on the surviving phone arm.

const PHONE = { headers: { "sec-ch-ua-mobile": "?1" } };

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_1",
    slug: "the-piece",
    title: "The Piece",
    headDraftId: "d_2",
    // R7RO.1 — `showcase: true` no longer forces SSR on desktop (the phone request does — PHONE
    // below). Read-only posture: the surviving SSR arm is reader-only by design — the editable
    // Page is the SPA leaf's alone.
    showcase: true,
    state: { key: "edited_by_you", pill: "Edited by you", overlay: null, suggested: { action: "revise_using_edits", label: "Revise using your edits" } },
  },
];

/** A non-showcase row for the removal-detecting legs (desktop + editable ⇒ the shell answers). */
const SPA_PROJECTS: ProjectRow[] = PROJECTS.map((r) => ({ ...r, showcase: undefined }));

const DOC: EditorDocDto = {
  draftId: "d_2",
  draftN: 2,
  origin: "human_revision",
  state: "working",
  baseDraftId: "d_1",
  baseDraftN: 1,
  markdown: "# Title\n\nA paragraph with the quote inside and a cite [@doe2020].\n",
  sha256: "sha",
  lock: null,
  findings: [
    {
      findingId: "f_1",
      title: "The quote drifted.",
      severity: "major",
      sourceLabel: "from Review of v1",
      anchor: { blockId: "b2", quote: "the quote", startOffset: 14, endOffset: 23, confidence: 1 },
      method: "normalized",
      lost: false,
    },
  ],
  provenance: { b1: { kind: "agent", runId: "run_1", draftN: 1 }, b2: { kind: "human" } },
  meters: { words: 12, readMin: 1 },
  proposals: [
    {
      id: "prop_1",
      kind: "replace",
      from: 10,
      to: 40,
      markdown: "A tightened paragraph.",
      origin: "agent:assistant:run_9",
      label: "Tighten the quote's lead-in",
    },
  ],
};

function makeDeps(over: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      listProjects: async () => PROJECTS,
      resolveEditorDraft: async (_s: unknown, _p: unknown, v: string) =>
        v === "working" || v === "2"
          ? { draftId: "d_2", draftN: 2, state: "working", origin: "human_revision" }
          : Promise.reject(new ApiError(404, "/x")),
      getEditorDoc: async () => DOC,
      saveEditorDraft: async () => ({
        draftId: "d_2", draftN: 2, versionId: "av_2", sha256: "sha2",
        forked: false, changed: true, restorePointId: "rp_1", sync: "synced" as const,
      }),
      postEditorNote: async () => ({ guidanceId: "g_1" }),
      cancelEditorRun: async () => ({ ok: true as const, state: "cancelled", alreadyTerminal: false }),
      reviseWithEdits: async () => ({ runId: "run_9", state: "queued", deduped: false, mootedFindingIds: [] }),
      ...over,
    } as DataSource,
    session: () => ({ "x-rhema-user-id": "u_1" }),
  };
}

describe("the Page — /p/:project/v/:v SSR (P1.02; the forced-SSR phone arm — REQ-ED-12 as amended by ADR-128)", () => {
  it("the retired escape signals are INERT on a non-showcase row — ?ssr=1 / x-rhema-renderer: ssr ⇒ the shell (REQ-SEQ-4 removal)", async () => {
    // Removal-detecting: the only SSR arms left are phone/showcase. A resurrected consult that
    // honors either signal would render the SSR Page here; the correct answer is the shell.
    const app = createWebApp(makeDeps({ listProjects: async () => SPA_PROJECTS }));
    for (const init of [
      {},
      { headers: { "x-rhema-renderer": "ssr" } },
    ]) {
      const res = await app.request("/p/the-piece/v/working?ssr=1", init);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('data-renderer="spa"');
      expect(html).not.toContain('data-page-root="1"');
      // ARMB-1 — and no forced-SSR cause stamp rides a shell document.
      expect(html).not.toContain("data-ssr-cause");
    }
  });

  it("redirects to /login unauthenticated", async () => {
    const app = createWebApp({ ...makeDeps(), session: () => null });
    const res = await app.request("/p/the-piece/v/working");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("renders /v/working: the page root, embedded doc JSON, static preview, island script", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-piece/v/working", PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-page-root="1"');
    expect(html).toContain('data-draft-id="d_2"');
    expect(html).toContain('src="/assets/page.js"');
    // the doc JSON island payload + the static preview share the same nodes
    expect(html).toContain("data-page-doc");
    expect(html).toContain("data-page-preview");
    expect(html).toContain("A paragraph with the quote inside");
    // the lock-poll/resync URL — the same /edit/:draftId/doc endpoint the beta island used.
    // SPA.24 (REQ-ED-16): `data-save-url` is GONE — collab is the transport; /save stays server-side.
    expect(html).not.toContain("data-save-url");
    expect(html).toContain('data-doc-url="/p/the-piece/edit/d_2/doc"');
    // the read-only posture the surviving SSR arm always carries (REQ-ED-12): the
    // version/fork banner stays suppressed (it describes an edit affordance) and the read-only
    // note renders instead.
    expect(html).toContain('data-readonly="1"');
    expect(html).toContain("This version is read-only.");
    expect(html).not.toContain("Editing v2");
    // ARMB-1 — the forced arm self-reports its cause so the journeys renderer assert can honor
    // it. R7RO.1: the cause is phone-only now — a showcase row stamps it through the same verdict.
    expect(html).toContain('data-ssr-cause="phone"');
    // the provenance + findings sidecars embed as JSON for the island
    expect(html).toContain("data-page-prov");
    expect(html).toContain("data-page-findings");
  });

  it("the data-page-* embeds are RAW parseable JSON — entity-escaping kills the island (EDIT.1, found on the N8 prod walk)", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-piece/v/working", PHONE)).text();
    for (const sel of ["data-page-doc", "data-page-prov", "data-page-findings"]) {
      const m = new RegExp(`<script[^>]*${sel}[^>]*>([\\s\\S]*?)</script>`).exec(html);
      expect(m, `${sel} embed missing`).toBeTruthy();
      expect(m![1]).not.toContain("&quot;");
      expect(() => JSON.parse(m![1]!) as unknown, `${sel} embed is not raw JSON`).not.toThrow();
    }
  });

  it("renders /v/2 (a versioned draft) through the same surface", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-piece/v/2", PHONE);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-page-root="1"');
  });

  it("404s on an unknown version", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-piece/v/99", PHONE);
    expect(res.status).toBe(404);
  });

  it("has NO Save button and no unsaved-changes dialog (ticket AC)", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-piece/v/working", PHONE)).text();
    expect(html).not.toContain('action="/p/the-piece/edit/d_2/save"'); // no form saves
    expect(html).not.toMatch(/>\s*Save\s*</);
    expect(html).not.toContain("beforeunload");
    expect(html).not.toContain("unsaved");
  });

  it("renders the findings rail + the dangling cite callout", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-piece/v/working", PHONE)).text();
    expect(html).toContain("from Review of v1");
    expect(html).toContain("The quote drifted.");
    expect(html).toContain("Citations without a bibliography entry");
    expect(html).toContain("@doe2020");
  });

  it("a held lock shows the run banner + marks the root locked + readonly", async () => {
    const locked: EditorDocDto = { ...DOC, lock: { runId: "run_5", kind: "writer", workflow: "revise" } };
    const app = createWebApp(makeDeps({ getEditorDoc: async () => locked }));
    const html = await (await app.request("/p/the-piece/v/working", PHONE)).text();
    expect(html).toContain('data-locked="1"');
    expect(html).toContain('data-readonly="1"');
    expect(html).toContain("A revise run is writing this draft");
    expect(html).toContain('action="/p/the-piece/edit/d_2/cancel-run"');
  });

  it("a PHONE request on a non-showcase row stamps the phone cause — the same REQ-ED-12 verdict, different trigger", async () => {
    const app = createWebApp(makeDeps({ listProjects: async () => SPA_PROJECTS }));
    const res = await app.request("/p/the-piece/v/working", {
      headers: { "user-agent": "Mobi iPhone" },
    });
    const html = await res.text();
    expect(html).toContain('data-renderer="ssr"');
    expect(html).toContain('data-ssr-cause="phone"');
    expect(html).not.toContain('data-renderer="spa"');
  });

  it("a frozen draft under the forced-SSR arm renders read-only — the fork-on-type posture is the SPA leaf's", async () => {
    const frozen: EditorDocDto = { ...DOC, state: "frozen" };
    const app = createWebApp(makeDeps({ getEditorDoc: async () => frozen }));
    const html = await (await app.request("/p/the-piece/v/2", PHONE)).text();
    // The surviving SSR arm is reader-only (REQ-ED-12): no fork banner (it describes typing),
    // the read-only note instead. The editable fork behavior lives on the SPA leaf's mount.
    expect(html).toContain('data-readonly="1"');
    expect(html).toContain("This version is read-only.");
    expect(html).not.toContain("v2 is frozen");
  });

  it("/v/working resolves a frozen head on the read — the import-only project renders (EDIT.1)", async () => {
    const frozen: EditorDocDto = { ...DOC, draftId: "d_1", draftN: 1, origin: "human_upload", state: "frozen", baseDraftId: null, baseDraftN: null };
    const app = createWebApp(makeDeps({
      resolveEditorDraft: async () => ({ draftId: "d_1", draftN: 1, state: "frozen", origin: "human_upload" }),
      getEditorDoc: async () => frozen,
    }));
    const res = await app.request("/p/the-piece/v/working", PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-draft-id="d_1"');
    expect(html).toContain('data-readonly="1"'); // the forced-SSR read-only arm — never an editable mount
    // REQ-ED-12 — a read-only SSR Page gets NO collab wire (the attr emits empty).
    expect(html).toContain('data-collab-url=""');
  });

  it("/v/working on a draft-less project redirects to /p/:slug instead of dead-ending on a 404", async () => {
    const app = createWebApp(makeDeps({
      resolveEditorDraft: async () => Promise.reject(new ApiError(404, "/x")),
    }));
    const res = await app.request("/p/the-piece/v/working", PHONE);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-piece");
    // …while a numeric miss keeps the truthful 404
    const miss = await app.request("/p/the-piece/v/7", PHONE);
    expect(miss.status).toBe(404);
  });

  it("the CSP's connect-src carries the configured collab wss origin explicitly (EDIT.1 — engine-independent)", async () => {
    const app = createWebApp({ ...makeDeps(), collabWsUrl: "wss://app.example.test/collab" });
    const res = await app.request("/p/the-piece/v/working", PHONE);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("connect-src 'self' wss://app.example.test");
  });

  it("renders exactly ONE sync indicator — the [data-sync-pill]; the status bar carries no second one", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-piece/v/working", PHONE)).text();
    expect(html.match(/data-sync-pill/g) ?? []).toHaveLength(1);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('class="ide-sync"'); // the shell's dead second indicator is gone
  });

  it("the Showcase renders its Page read-only (§15.4) — banner + host flag, no edit affordance", async () => {
    // The base fixture is already `showcase: true` — the read-only posture needs no extra flag.
    // R7RO.1: on desktop this row now serves the shell (the SPA leaf renders read-only — pinned
    // by read-only.dom.test.tsx); on the surviving phone arm the SSR render is still read-only.
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-piece/v/working", PHONE)).text();
    expect(html).toContain('data-readonly="1"');
    expect(html).toContain("This version is read-only.");
    // no note form under the read-only arm
    expect(html).not.toContain('action="/p/the-piece/edit/d_2/note"');
  });

  it("a stale /edit/:draftId deep link lands on the working child's /v/<n>, not the frozen view", async () => {
    const app = createWebApp(makeDeps({ getEditorDoc: async () => ({ ...DOC, draftId: "d_9", draftN: 3 }) }));
    const res = await app.request("/p/the-piece/edit/d_1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-piece/v/3");
  });

  it("renders proposal cards with accept/reject + the agent origin", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-piece/v/working", PHONE)).text();
    expect(html).toContain("Proposed changes");
    expect(html).toContain("Tighten the quote&#x27;s lead-in");
    expect(html).toContain('data-proposal-accept="prop_1"');
    expect(html).toContain('data-proposal-reject="prop_1"');
    expect(html).toContain('data-proposal-origin="agent:assistant:run_9"');
  });

  it("renders /a/:artifactId as a read-only Page (any markdown artifact)", async () => {
    const artifact: EditorDocDto = { ...DOC, draftId: "art_1", origin: "artifact", state: "frozen" };
    const app = createWebApp(makeDeps({ getArtifactPage: async () => artifact }));
    const res = await app.request("/p/the-piece/a/art_1", PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-page-root="1"');
    expect(html).toContain('data-readonly="1"');
    expect(html).toContain("This version is read-only.");
  });

  it("the project overview mounts the Page on the working head (cutover)", async () => {
    const app = createWebApp(makeDeps({
      listGates: async () => [],
      listDecisions: async () => [],
      getApprovalOverrides: async () => ({}),
    }));
    const res = await app.request("/p/the-piece", PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-page-mount="working"');
    expect(html).toContain('data-page-root="1"');
    // the Edit CTA points at the Page route, not the dormant CodeMirror surface
    expect(html).toContain('href="/p/the-piece/v/working"');
  });

  it("the status bar carries the server-computed meters", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-piece/v/working", PHONE)).text();
    expect(html).toContain("12 words");
    expect(html).toContain("1 min read");
  });
});

describe("the Page — provenance-aware save passthrough (P1.02)", () => {
  it("POST save forwards the live provenance capture to the api", async () => {
    const save = vi.fn(async () => ({
      draftId: "d_2", draftN: 2, versionId: "av_2", sha256: "s",
      forked: false, changed: true, restorePointId: null, sync: "synced" as const,
    }));
    const app = createWebApp(makeDeps({ saveEditorDraft: save }));
    const res = await app.request("/p/the-piece/edit/d_2/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        markdown: "# T\n\nnew text\n",
        provenanceSpans: [{ blockId: "b1", source: { kind: "human" } }],
        agentSpans: [{ blockId: "b1", from: 0, to: 10 }],
      }),
    });
    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalledWith(
      expect.anything(),
      "proj_1",
      "d_2",
      "# T\n\nnew text\n",
      {
        provenanceSpans: [{ blockId: "b1", source: { kind: "human" } }],
        agentSpans: [{ blockId: "b1", from: 0, to: 10 }],
      },
    );
  });
});
