import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ApiError,
  type ProjectRow,
  type EditorDocDto,
  type VersionRailDto,
  type VersionDiffDto,
  type RestorePointDto,
  type RestorePreviewDto,
  type FilesDto,
} from "@rhema/api-client";
import { VersionRail, type RestorePreviewData } from "@rhema/ui";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";
import { PageDataContext } from "./page-data.js";
import { ComparePage } from "./pages.js";
import { railLabels } from "./page-chrome.js";

// P1.08 — the version story's web wiring (§5.8, §5.13): the version rail over the Page (chips +
// compare-previous + the grouped restore-points dropdown + the ?restore preview / ?restored notice),
// the three-layout compare at /v/:n/diff/:m with hunk comments → Guidance, and the Files pane's
// typed sections (SE/SR rows, I behind Advanced, H as sealed counts — never rows, never routes).

const SLUG = "the-piece";

// R7RO.1 — the only forced-SSR arm left is PHONE (ADR-128: the `showcase` arm is deleted; a
// showcase row on desktop serves the shell). The rail/diff/artifact render asserts below pin
// that arm — requests expecting SSR markup send PHONE.
const PHONE = { headers: { "sec-ch-ua-mobile": "?1" } };

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_v",
    slug: SLUG,
    title: "The Piece",
    headDraftId: "d_2",
    // R7RO.1 — `showcase: true` is a read-only row fact now (the twins carry
    // `project.readOnlyProject{showcase}`); it no longer forces SSR — the PHONE request does.
    showcase: true,
    state: { key: "edited_by_you", pill: "Edited by you", overlay: null, suggested: { action: "revise_using_edits", label: "Revise using your edits" } },
  },
];

const DOC: EditorDocDto = {
  draftId: "d_2",
  draftN: 2,
  origin: "human_revision",
  state: "working",
  baseDraftId: "d_1",
  baseDraftN: 1,
  markdown: "# Title\n\nA revised paragraph.\n",
  sha256: "sha",
  lock: null,
  findings: [],
  provenance: {},
};

const RAIL: VersionRailDto = {
  workingN: 2,
  chip: { open: 2, addressed: 1 },
  outline: { artifactId: "art_outline", createdAt: "2026-08-01T00:00:00Z", words: 120 },
  drafts: [
    {
      draftId: "d_1", n: 1, origin: "agent_revision", state: "frozen", frozen: true,
      frozenAt: "2026-08-02T00:00:00Z", createdAt: "2026-08-01T12:00:00Z", words: 900,
      reviewed: true, answered: true, claimsPendingVerification: false,
      obligations: { open: 1, addressed: 1 },
    },
    {
      draftId: "d_2", n: 2, origin: "human_revision", state: "working", frozen: false,
      frozenAt: null, createdAt: "2026-08-03T00:00:00Z", words: 940,
      reviewed: false, answered: false, claimsPendingVerification: true,
      obligations: { open: 1, addressed: 0 },
    },
  ],
};

const POINTS: RestorePointDto[] = [
  { id: "rp_today", kind: "snapshot", cause: "blur", label: null, createdAt: "2026-09-02T08:00:00Z", group: "earlier_today", advanced: false },
  { id: "rp_named", kind: "snapshot", cause: "named", label: "before the rewrite", createdAt: "2026-07-01T00:00:00Z", group: "named", advanced: false },
  { id: "rp_old", kind: "snapshot", cause: "timer", label: null, createdAt: "2026-06-01T00:00:00Z", group: "earlier", advanced: true },
];

const BLOCK_B = { blockId: "b1", text: "The old paragraph.", index: 0, startOffset: 0, endOffset: 18 };
const BLOCK_A = { blockId: "b1", text: "A revised paragraph.", index: 0, startOffset: 0, endOffset: 20 };
const HUNK = { id: "h1", kind: "edited" as const, before: [BLOCK_B], after: [BLOCK_A], charsChanged: 12 };
const WC_VIEW = {
  strip: { addressed: 0, rebutted: 0, stillOpen: 0, moves: 0, hunks: 1 },
  moves: [],
  unlinked: { hunks: [HUNK], entries: [] },
  rebutted: [],
};

const DIFF: VersionDiffDto = {
  ok: true,
  responseId: null, // a human-revision pair — no response ledger, every hunk Unlinked
  reviewId: null,
  before: { draftId: "d_1", n: 1, origin: "agent_revision", state: "frozen", frozenAt: "2026-08-02T00:00:00Z", createdAt: "2026-08-01T12:00:00Z", claimsPendingVerification: false },
  after: { draftId: "d_2", n: 2, origin: "human_revision", state: "working", frozenAt: null, createdAt: "2026-08-03T00:00:00Z", claimsPendingVerification: true },
  diff: { hunks: [HUNK], unchanged: 3, beforeBlocks: [BLOCK_B], afterBlocks: [BLOCK_A] },
  view: WC_VIEW,
};

const FILES: FilesDto = {
  sections: [
    {
      key: "outline",
      rows: [
        {
          artifactId: "art_outline", kind: "outline", label: "Outline", level: "SE",
          editMode: "readonly", lock: "immutable", readOnly: true, words: 120,
          createdAt: "2026-08-01T00:00:00Z", provenance: { actor: "agent", seat: "drafter", runId: "run_0", workflow: "draft", phase: "outline" },
        },
      ],
      advancedRows: [],
      sealedCount: 0,
    },
    {
      key: "drafts",
      rows: [
        {
          artifactId: "art_d2", kind: "draft", label: "Draft", level: "SE",
          editMode: "collab", lock: "editable", readOnly: false, words: 940,
          createdAt: "2026-08-03T00:00:00Z", provenance: { actor: "you" },
          draftRef: { n: 2, state: "working" },
        },
      ],
      advancedRows: [],
      sealedCount: 0,
    },
    {
      key: "rounds",
      rows: [
        {
          artifactId: "art_letter", kind: "letter", label: "Editor's letter", level: "SR",
          editMode: "readonly", lock: "immutable", readOnly: true, words: 300,
          createdAt: "2026-08-02T00:00:00Z", provenance: { actor: "agent", seat: "editor", runId: "run_1", workflow: "review", phase: "letter" },
          freshness: { subjectDraftN: 1, stale: true },
        },
      ],
      advancedRows: [
        {
          artifactId: "art_dossier", kind: "drafting_dossier", label: "Drafting dossier", level: "I",
          editMode: "readonly", lock: "inspect", readOnly: true, words: null,
          createdAt: "2026-08-01T00:00:00Z", provenance: { actor: "agent", runId: "run_0", workflow: "draft" },
        },
      ],
      sealedCount: 3, // H kinds — count only, never a row
    },
  ],
};

const PREVIEW: RestorePreviewDto = {
  ok: true,
  point: { id: "rp_named", kind: "snapshot", cause: "named", label: "before the rewrite", createdAt: "2026-07-01T00:00:00Z" },
  view: WC_VIEW,
};

function makeDeps(over: Partial<DataSource> = {}, session: WebDeps["session"] = () => ({ "x-rhema-user-id": "u_1" })): WebDeps {
  return {
    dataSource: {
      listProjects: async () => PROJECTS,
      resolveEditorDraft: async (_s: unknown, _p: unknown, v: string) =>
        v === "working" || v === "2"
          ? { draftId: "d_2", draftN: 2, state: "working", origin: "human_revision" }
          : v === "1"
            ? { draftId: "d_1", draftN: 1, state: "frozen", origin: "agent_revision" }
            : Promise.reject(new ApiError(404, "/x")),
      getEditorDoc: async (_s: unknown, _p: unknown, draftId: string) =>
        draftId === "d_1" ? { ...DOC, draftId: "d_1", draftN: 1, state: "frozen" } : DOC,
      getVersions: async () => RAIL,
      getVersionDiff: async (_s: unknown, _p: unknown, n: string, m: string) =>
        ["1", "2", "working"].includes(n) && ["1", "2", "working"].includes(m)
          ? DIFF
          : Promise.reject(new ApiError(404, "/x")),
      commentOnCompareHunk: async () => ({ guidanceId: "g_1", hunkId: "h1" }),
      getFiles: async () => FILES,
      listRestorePoints: async () => ({ draftId: "d_2", liveDocId: "doc_2", points: POINTS }),
      previewRestorePoint: async () => PREVIEW,
      applyRestorePoint: async () => ({
        ok: true as const, draftId: "d_2", draftN: 2, forked: false,
        restorePointId: "rp_new", undoPointId: "rp_undo", restoredFrom: "rp_named",
      }),
      getArtifactPage: async (_s: unknown, _p: unknown, artifactId: string) =>
        artifactId === "art_outline" ? DOC : Promise.reject(new ApiError(404, "/x")),
      ...over,
    } as DataSource,
    session,
  };
}

function form(fields: Record<string, string>): { body: string; headers: Record<string, string> } {
  return { body: new URLSearchParams(fields).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } };
}

/** R7RO.1 — the desktop-shaped rail render has NO served arm left (the showcase arm is deleted
 *  and every surviving SSR document is the §10.1-compact phone variant, which withholds the rail
 *  wholesale). The rail's markup is pinned at the shared component the SSR `PageChrome` and the
 *  SPA leaf both mount — same props the server feeds it. */
function railMarkup(props: { preview?: RestorePreviewData; restoredN?: number } = {}): string {
  return renderToStaticMarkup(
    createElement(VersionRail, {
      versions: RAIL.drafts,
      outline: RAIL.outline,
      chip: RAIL.chip,
      currentN: 2,
      hrefs: {
        version: (n: number) => `/p/${SLUG}/v/${n}`,
        artifact: (id: string) => `/p/${SLUG}/a/${id}`,
        diff: (b: number, a: number | "working") => `/p/${SLUG}/v/${b}/diff/${a}`,
        restorePreview: (pid: string) => `/p/${SLUG}/v/2?restore=${pid}`,
      },
      restore: {
        points: POINTS,
        restoreAction: (pid: string) => `/p/${SLUG}/v/2/restore/${pid}`,
        ...(props.preview ? { preview: props.preview } : {}),
      },
      ...(props.restoredN != null ? { restoredN: props.restoredN } : {}),
      labels: railLabels,
    }),
  );
}

/** The shared `ComparePage` element rendered with a non-compact PageData bag — the identical
 *  desktop markup the SSR route emitted before R7RO.1 (the phone arm's compact variant is
 *  asserted on the request legs). */
function compareMarkup(bag: { layout: "side" | "inline" | "moves"; commentedHunkId?: string }): string {
  return renderToStaticMarkup(
    createElement(
      PageDataContext.Provider,
      { value: { compare: { slug: SLUG, n: "1", m: "2", layout: bag.layout, data: DIFF, ...(bag.commentedHunkId ? { commentedHunkId: bag.commentedHunkId } : {}) }, compact: false } },
      createElement(ComparePage),
    ),
  );
}

describe("P1.08 — the version rail over the Page (§5.8, REQ-IDE-32)", () => {
  it("the phone arm withholds the rail wholesale (§10.1 ✗); the desktop rail renders at the shared component", async () => {
    const app = createWebApp(makeDeps());
    // R7RO.1 — the only forced-SSR arm left is phone: `railData && !phone` withholds the rail;
    // the SPA leaf mounts it off the twin (editor.dom.test.tsx pins that mount).
    const res = await app.request(`/p/${SLUG}/v/2`, PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-page-root="1"');
    expect(html).toContain('data-ssr-cause="phone"');
    expect(html).not.toContain("data-version-rail");
    expect(html).not.toContain("data-compare-previous");
    expect(html).not.toContain("data-restore-menu");

    // the desktop rail (the shared component's non-compact render — what the leaf mounts):
    const rail = railMarkup();
    expect(rail).toContain("data-version-rail");
    expect(rail).toContain('data-version-chip="outline"');
    expect(rail).toContain('data-version-chip="1"');
    expect(rail).toContain('data-version-chip="2"');
    // 🔒 on the frozen v1, the working dot + claims-pending flag on the human_revision head.
    expect(rail).toContain("data-lock");
    expect(rail).toContain("data-working-dot");
    expect(rail).toContain("data-claims-pending");
    expect(rail).toContain("data-reviewed");
    expect(rail).toContain("data-answered");
    // the ⚑ project chip + the compare-previous deep link (v1 → v2).
    expect(rail).toContain("data-obligations-chip");
    expect(rail).toContain('data-open="2"');
    expect(rail).toContain(`href="/p/${SLUG}/v/1/diff/2"`);
    expect(rail).toContain("data-compare-previous");
    // the grouped restore-points dropdown — named always listed, older points ride Advanced.
    expect(rail).toContain("data-restore-menu");
    expect(rail).toContain('data-restore-group="earlier_today"');
    expect(rail).toContain('data-restore-group="named"');
    expect(rail).toContain('data-restore-group="earlier" data-tier="advanced"');
    expect(rail).toContain('data-restore-point="rp_named"');
    expect(rail).toContain(`?restore=rp_named`);
  });

  it("?restore=<id> renders the preview card with the undoable apply form", async () => {
    const app = createWebApp(makeDeps());
    // the phone arm withholds the preview card (it rides the rail — §10.1 ✗).
    const res = await app.request(`/p/${SLUG}/v/2?restore=rp_named`, PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-page-root="1"');
    expect(html).not.toContain("data-restore-preview");

    // the desktop render (the shared component — same preview bag `pageRailBag` assembles):
    const rail = railMarkup({
      preview: {
        point: POINTS.find((p) => p.id === PREVIEW.point.id)!,
        view: PREVIEW.view,
      },
    });
    expect(rail).toContain("data-restore-preview");
    expect(rail).toContain("before the rewrite");
    expect(rail).toContain("data-restore-apply");
    expect(rail).toContain(`action="/p/${SLUG}/v/2/restore/rp_named"`);
  });

  it("?restored=<n> renders the undoable-apply notice", async () => {
    const app = createWebApp(makeDeps());
    // the phone arm withholds the notice (it rides the rail).
    const html = await (await app.request(`/p/${SLUG}/v/2?restored=2`, PHONE)).text();
    expect(html).not.toContain("data-restored-notice");
    // the desktop render:
    expect(railMarkup({ restoredN: 2 })).toContain("data-restored-notice");
  });

  it("the restore apply POSTs through and redirects with ?restored=<n>", async () => {
    const applyRestorePoint = vi.fn(async () => ({
      ok: true as const, draftId: "d_2", draftN: 2, forked: false,
      restorePointId: "rp_new", undoPointId: "rp_undo", restoredFrom: "rp_named",
    }));
    const app = createWebApp(makeDeps({ applyRestorePoint }));
    const res = await app.request(`/p/${SLUG}/v/2/restore/rp_named`, { method: "POST", ...form({}) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/v/2?restored=2`);
    expect(applyRestorePoint).toHaveBeenCalledWith(expect.anything(), "proj_v", "d_2", "rp_named");
  });

  it("a refused apply (locked/unknown) bounces back to the version — no notice", async () => {
    const applyRestorePoint = vi.fn(async () => {
      throw new ApiError(409, "locked");
    });
    const app = createWebApp(makeDeps({ applyRestorePoint }));
    const res = await app.request(`/p/${SLUG}/v/2/restore/rp_named`, { method: "POST", ...form({}) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/v/2`);
  });
});

describe("P1.08 — the compare page (§5.8, REQ-IDE-33)", () => {
  it("the phone arm renders the §10.1 blocked note; the desktop layouts render at the shared element", async () => {
    const app = createWebApp(makeDeps());
    // R7RO.1 — the only forced-SSR arm left is phone, where diffs are the §10.1 ✗ column
    // (PhoneBlockedNote); the SPA leaf mounts the compare off the twin (editor.dom.test.tsx
    // pins `data-compare` + the hook parity). The desktop markup is pinned on the same
    // `ComparePage` element with a non-compact PageData bag — what the route emitted before.
    const res = await app.request(`/p/${SLUG}/v/1/diff/2`, PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-ssr-cause="phone"');
    expect(html).toContain('data-phone-blocked="true"');
    expect(html).not.toContain("data-compare=");

    const side = compareMarkup({ layout: "side" });
    expect(side).toContain('data-ide="1"');
    expect(side).toContain('data-compare="true" data-layout="side"');
    expect(side).toContain('data-compare-layout="side"');
    expect(side).toContain('data-hunk="h1"');
    expect(side).toContain('data-diff-side="before"');
    expect(side).toContain('data-diff-side="after"');
    // the three layout links + the version line.
    expect(side).toContain('data-layout-link="side"');
    expect(side).toContain('data-layout-link="inline"');
    expect(side).toContain('data-layout-link="moves"');
    expect(side).toContain(`href="/p/${SLUG}/v/1/diff/2?layout=inline"`);
    // read-only: no edit affordances — but the hunk comment form renders on ANY layout.
    expect(side).toContain('data-hunk-comment="h1"');
    expect(side).not.toContain("contenteditable");
  });

  it("?layout=inline renders the sequential hunk list; ?layout=moves renders What-changed", async () => {
    const inline = compareMarkup({ layout: "inline" });
    expect(inline).toContain('data-compare-layout="inline"');
    expect(inline).toContain('data-hunk-comment="h1"');
    const moves = compareMarkup({ layout: "moves" });
    // the unledgered pair shows the "coherence read" caption + the unlinked hunks.
    expect(moves).toContain("data-unlinked-note");
    expect(moves).toContain('data-hunk="h1"');
  });

  it("404s on an unknown version", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/v/1/diff/9`, PHONE);
    expect(res.status).toBe(404);
  });

  it("a hunk comment POSTs through (→ Guidance) and bounces back with ?commented=", async () => {
    const commentOnCompareHunk = vi.fn(async () => ({ guidanceId: "g_1", hunkId: "h1" }));
    const app = createWebApp(makeDeps({ commentOnCompareHunk }));
    const res = await app.request(`/p/${SLUG}/v/1/diff/2/hunks/h1/comments`, {
      method: "POST",
      ...form({ text: "This paragraph still hedges." }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/v/1/diff/2?commented=h1`);
    expect(commentOnCompareHunk).toHaveBeenCalledWith(
      expect.anything(), "proj_v", "1", "2", "h1", "This paragraph still hedges.",
    );
  });

  it("an empty comment never reaches the api; ?commented= renders the saved marker", async () => {
    const commentOnCompareHunk = vi.fn(async () => ({ guidanceId: "g_1", hunkId: "h1" }));
    const app = createWebApp(makeDeps({ commentOnCompareHunk }));
    const res = await app.request(`/p/${SLUG}/v/1/diff/2/hunks/h1/comments`, {
      method: "POST",
      ...form({ text: "   " }),
    });
    expect(res.status).toBe(302);
    expect(commentOnCompareHunk).not.toHaveBeenCalled();
    // the `?commented=` marker rides the compare render — withheld with it on the phone arm
    // (§10.1), and pinned on the shared element's desktop render.
    const html = await (await app.request(`/p/${SLUG}/v/1/diff/2?commented=h1`, PHONE)).text();
    expect(html).toContain('data-phone-blocked="true"');
    expect(compareMarkup({ layout: "side", commentedHunkId: "h1" })).toContain('data-comment-saved="true"');
  });
});

describe("P1.08 — the Files pane (§5.13, REQ-IDE-35/36/37, REQ-VIS-3)", () => {
  // R7SHELL.2 — the pane is deleted: the typed-sections DTO now feeds the SIDEBAR's project
  // tree via `?view=tree` (covered by the app-shell DOM tests). The SSR phone document renders
  // none of it (the reader never did show Files).
  it("the SSR document carries no Files pane markup (R7SHELL.2 — the region is deleted)", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request(`/p/${SLUG}/v/2`, PHONE)).text();
    expect(html).not.toContain("data-files-pane");
    expect(html).not.toContain("ide-files");
    expect(html).not.toContain("ide-rail");
    // the `?view=tree` twin still serves the sections for the sidebar tree.
    const tree = await (await app.request(`/bff/p/${SLUG}?view=tree`, PHONE)).json();
    expect(tree.files).not.toBeNull();
    expect(tree.project.slug).toBe(SLUG);
    const sections = (tree.files.sections as { key: string }[]).map((s) => s.key);
    expect(sections).toContain("drafts");
  });

  it("the artifact deep link renders the read-only Page inside the IDE shell", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/a/art_outline`, PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-ide="1"');
    expect(html).toContain('data-page-root="1"');
    // read-only — the island mounts with the readonly flag; no editing affordance renders.
    expect(html).toContain('data-readonly="1"');
  });

  it("an H-kind (or unknown) artifact 404s — there is no route for it", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/a/art_hidden`, PHONE);
    expect(res.status).toBe(404);
  });
});
