// 336_R6FIX.54 — the U4_CONTROLS dossier runId discovery. The deployed leg fetches the
// `/bff/app` project-list rows through `page.request` (the browser context's session)
// and reads the dossier-card row fact `latestReviewRunId` — the sidebar's own derivation
// source. Earlier the leg fetched `/bff/p/<slug>/timeline` anonymously: that twin is
// demo-only (404 for tenants, and the bare fetch 401s anyway), so `runId=""` for the
// leg's whole life and the surface probed the NotFound leaf, control-clean, until
// R6FIX.44's h1 guard caught the silent pass. These legs pin the real row shape +
// the preferred-slug / any-row fallback order.

import { describe, expect, it } from "vitest";
import { dossierTargetFromProjectList } from "./u4-probe.js";

describe("dossierTargetFromProjectList", () => {
  it("prefers the picked project's own review", () => {
    const rows = [
      { slug: "untitled-2", latestReviewRunId: null },
      { slug: "jrn-abc-proj", latestReviewRunId: "run_own" },
      { slug: "showcase", latestReviewRunId: "run_sc" },
    ];
    expect(dossierTargetFromProjectList(rows, "jrn-abc-proj")).toEqual({ slug: "jrn-abc-proj", runId: "run_own" });
  });

  it("falls back to the first row carrying a review — with its own slug", () => {
    const rows = [
      { slug: "untitled-2", latestReviewRunId: null },
      { slug: "showcase-copy", latestReviewRunId: null },
      { slug: "showcase", latestReviewRunId: "run_sc" },
    ];
    expect(dossierTargetFromProjectList(rows, "untitled-2")).toEqual({ slug: "showcase", runId: "run_sc" });
  });

  it("returns null when no row carries a review", () => {
    expect(dossierTargetFromProjectList([{ slug: "a", latestReviewRunId: null }], "a")).toBeNull();
    expect(dossierTargetFromProjectList([], "a")).toBeNull();
    expect(dossierTargetFromProjectList(null, "a")).toBeNull();
  });

  it("skips malformed rows (missing slug or empty runId)", () => {
    const rows = [
      { latestReviewRunId: "run_noslug" },
      { slug: "x", latestReviewRunId: "" },
      { slug: "ok", latestReviewRunId: "run_ok" },
    ];
    expect(dossierTargetFromProjectList(rows, "x")).toEqual({ slug: "ok", runId: "run_ok" });
  });
});
