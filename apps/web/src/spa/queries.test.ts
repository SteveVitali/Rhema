// NAVC.3 (REQ-NAVC-18) — the per-surface Query freshness policy pin. Which twin GETs carry
// server-side mark-read/view side effects decides each query's `staleTime`; the per-twin parity
// decision (accept-stale vs compensate-by-refetch) is recorded in the run ledger
// (docs/build/runs/NAVC.3.md's side-effect census) — this file pins the code half of it.
//
//   • `projectPageQuery` — ACCEPT-STALE: the keep-alive window as TTL, so a leave→return inside
//     it paints from cache with zero twin GETs (R10). The twin's only composition side effect
//     (`gate.presence_timer_shown`) mints per SERVED composition — a cached paint isn't one.
//   • `dossierQuery` / `runReportQuery` — COMPENSATE-BY-REFETCH: `staleTime` 0 means every mount
//     re-fires the twin GET, so `markInboxRunRead` + view telemetry fire per open exactly as
//     each document navigation did.
//   • `projectRunSheetQuery` — same arm: `voice.staleness_shown` mints per served composition.
//   • `sessionQuery` — the REQ-NAVC-20 30 s re-verify window, pinned here too.

import { describe, expect, it } from "vitest";
import { PAGE_SESSION_IDLE_TTL_MS } from "./page-sessions.js";
import {
  dossierQuery,
  projectPageQuery,
  projectRunSheetQuery,
  runReportQuery,
  sessionQuery,
} from "./queries.js";

describe("SPA Query freshness policy (NAVC.3 / REQ-NAVC-18)", () => {
  it("projectPageQuery carries the keep-alive TTL — the R10 warm-return window", () => {
    const staleTime = projectPageQuery("a-slug").staleTime;
    expect(staleTime).toBe(PAGE_SESSION_IDLE_TTL_MS);
    expect(staleTime).toBeGreaterThan(0);
  });

  it("the mark-read twins keep staleTime 0 — refetch-per-mount is the read-receipt parity", () => {
    // `dossierComposition` + `runReportComposition` run `markInboxRunRead` (+ view emissions)
    // per GET; a settled cache must never suppress that leg — `staleTime` unset/0 ⇒ every mount
    // refetches, the same per-open parity document navs had.
    expect(dossierQuery("s", "r_1").staleTime ?? 0).toBe(0);
    expect(runReportQuery("s", "r_1").staleTime ?? 0).toBe(0);
  });

  it("projectRunSheetQuery keeps staleTime 0 — the voice.staleness_shown mint rides the GET", () => {
    expect(projectRunSheetQuery("s").staleTime ?? 0).toBe(0);
  });

  it("sessionQuery keeps the 30 s re-verify window (REQ-NAVC-20 / Q-A4-2)", () => {
    expect(sessionQuery.staleTime).toBe(30_000);
    // and it stays REFETCHABLE — the boot embed is a seed, not a grant.
    expect(sessionQuery.queryFn).toBeTypeOf("function");
  });
});
