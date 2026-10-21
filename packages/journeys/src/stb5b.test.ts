// STB.5b — unit coverage for the BL-16–19 leg harness: the run-body builders' exact shape (the
// absence properties are the legs — no `sidecar` key on B16, no `preview` on B19A), per-leg cap
// discipline, the SSE frame parser, the structured-edit row injectors, and each pure assert
// evaluator (happy path + each assert's negative — the "fails if the behaviour is removed" rule).

import { describe, expect, it } from "vitest";
import { legCapUsdFor, STEP_REGISTRY } from "./registry.js";
import { CapOverrunError } from "./spend-guard.js";
import { STB5B_IMPLS } from "./stb5b.js";
import {
  STB5B_CAPS,
  STB5B_TOTAL_CAP_USD,
  assertLegCapUsd,
  baitUserSource,
  buildFullBoardFetchBody,
  buildHighWaterReviewBody,
  buildMemoFetchBody,
  buildOutlinePromotionBody,
  buildPinnedReviewBody,
  buildQuickDraftBody,
  evalB16Asserts,
  evalB17Asserts,
  evalB18aAsserts,
  evalB18bAsserts,
  evalB19Asserts,
  markerGateEdit,
  parseSseFrames,
  sseSeqs,
  stb5bOutlineDraft,
  stb5bReviewDraft,
} from "./stb5b-helpers.js";

// ---------------------------------------------------------------- caps

describe("per-leg caps (REQ-ECON-9 — the §5.3 table verbatim on the registry)", () => {
  // §5.3 verbatim (basis levered-expected; unlevered-measured is the opt-out fallback).
  const FIVE_THREE: Readonly<Record<string, number>> = {
    B16: 0.5, B17: 1.0, B18A: 1.0, B18B: 1.0, B19A: 3.5, B19B: 1.5, B19C: 15.0,
  };
  it("every STB.5b leg's registry row carries the §5.3 capUsd verbatim", () => {
    for (const [id, cap] of Object.entries(FIVE_THREE)) {
      expect(legCapUsdFor(id), id).toBe(cap);
    }
  });
  it("the derived STB5B_CAPS view reads the same registry figures and the runnable set stays inside the legacy $25 combined cap", () => {
    for (const id of Object.keys(FIVE_THREE)) {
      expect(STB5B_CAPS[id], id).toBe(FIVE_THREE[id]);
    }
    // B19C is the pre-registered drop — the remaining legs must fit the ticket cap.
    const runnable = Object.entries(FIVE_THREE)
      .filter(([id]) => id !== "B19C")
      .reduce((a, [, v]) => a + v, 0);
    expect(runnable).toBeLessThanOrEqual(STB5B_TOTAL_CAP_USD);
    expect(STB5B_TOTAL_CAP_USD).toBe(25);
  });
});

// R5ECON.1 (REQ-ECON-7, B3-F1) — the caps are ENFORCED at leg close, not just recorded:
// `finishLeg` calls this before the owed arm — an overrun is the distinct `cap_overrun`
// verdict (the runner pauses the funded window), never a silent pass.
describe("assertLegCapUsd (REQ-ECON-7)", () => {
  it("under or at the declared cap ⇒ the leg closes normally", () => {
    expect(() => assertLegCapUsd("B16", 0.5, STB5B_CAPS["B16"])).not.toThrow();
    expect(() => assertLegCapUsd("B16", STB5B_CAPS["B16"]!, STB5B_CAPS["B16"])).not.toThrow();
  });
  it("over the cap ⇒ CapOverrunError carrying the verdict + both figures", () => {
    try {
      assertLegCapUsd("B16", 1.5, 1.0);
      expect.unreachable("an over-cap leg must never close silently");
    } catch (e) {
      expect(e).toBeInstanceOf(CapOverrunError);
      expect((e as CapOverrunError).message).toContain("cap_overrun");
      expect((e as CapOverrunError).message).toContain("$1.50");
      expect((e as CapOverrunError).message).toContain("$1.00");
    }
  });
  it("fails closed: an unmeasurable meter or an undeclared cap is a leg failure, not a pass", () => {
    expect(() => assertLegCapUsd("B16", Number.NaN, 1)).toThrow(/unmeasurable/);
    expect(() => assertLegCapUsd("B16", Number.POSITIVE_INFINITY, 15)).toThrow(/unmeasurable/);
    expect(() => assertLegCapUsd("B16", 0.5, undefined)).toThrow(/no declared leg cap/);
    expect(() => assertLegCapUsd("ZZZ", 0.5, STB5B_CAPS["ZZZ"])).toThrow(/no declared leg cap/);
  });
});

// ---------------------------------------------------------------- run-body builders (absence properties ARE the legs)

describe("run-body builders", () => {
  it("B16 posts a pinned mid-phase review with NO sidecar key anywhere in inputs (BL-16a+BL-16b)", () => {
    const body = buildPinnedReviewBody({ idempotencyKey: "k1" });
    expect(body["workflow"]).toBe("review");
    expect(body["idempotencyKey"]).toBe("k1");
    const inputs = body["inputs"] as Record<string, unknown>;
    expect(inputs["phase"]).toBe("4");
    expect(body["modelTier"]).toBe("base"); // trial's plan gate refuses any other/omitted tier
    expect("sidecar" in inputs).toBe(false); // D-P0.03-2 — the absent-flag leg
    expect(JSON.stringify(body)).not.toContain("sidecar");
  });
  it("every builder pins modelTier:'base' (the trial plan gate refuses undefined ≠ 'base')", () => {
    expect(buildHighWaterReviewBody({ idempotencyKey: "k" })["modelTier"]).toBe("base");
    expect(buildFullBoardFetchBody({ idempotencyKey: "k" })["modelTier"]).toBe("base");
    expect(buildMemoFetchBody({ idempotencyKey: "k", userSources: [] })["modelTier"]).toBe("base");
    expect(buildQuickDraftBody({ idempotencyKey: "k", draftId: "d" })["modelTier"]).toBe("base");
    expect(buildOutlinePromotionBody({ slug: "s" })["modelTier"]).toBe("base");
  });
  it("B17 rides the same cheap pinned shape", () => {
    const inputs = buildHighWaterReviewBody({ idempotencyKey: "k" })["inputs"] as Record<string, unknown>;
    expect(inputs["phase"]).toBe("4");
    expect("sidecar" in inputs).toBe(false);
  });
  it("B18A is a full_board review pinned to verification (skillPhase '1')", () => {
    const body = buildFullBoardFetchBody({ idempotencyKey: "k" });
    expect(body["rigor"]).toBe("full_board");
    expect((body["inputs"] as Record<string, unknown>)["phase"]).toBe("1");
  });
  it("B18B is a memo-protocol review carrying the user_sources", () => {
    const sources = [{ name: "s", text: "t", url: "https://h.example/register.csv" }];
    const body = buildMemoFetchBody({ idempotencyKey: "k", userSources: sources });
    expect(body["protocol"]).toBe("memo");
    expect(body["userSources"]).toEqual(sources);
    expect((body["inputs"] as Record<string, unknown>)["phase"]).toBe("1");
  });
  it("B19A is a Quick NON-preview draft (preview pre-resolves the gate by:'trial')", () => {
    const body = buildQuickDraftBody({ idempotencyKey: "k", draftId: "d1" });
    expect(body["workflow"]).toBe("draft");
    expect(body["draftId"]).toBe("d1");
    expect(body["rigor"]).toBe("quick");
    expect("preview" in body).toBe(false); // the approve_plan gate must open for a user edit
    expect(JSON.stringify(body)).not.toContain("preview");
  });
  it("B19B promotion posts scope:'research' at quick/base", () => {
    const body = buildOutlinePromotionBody({ slug: "s1" });
    expect(body["scope"]).toBe("research");
    expect(body["slug"]).toBe("s1");
    expect(body["rigor"]).toBe("quick");
  });
});

// ---------------------------------------------------------------- fixtures

describe("fixtures", () => {
  it("the review fixture carries fetchable URL claims (example.org)", () => {
    const text = stb5bReviewDraft();
    expect(text).toContain("https://example.org/");
    expect(text.split(/\s+/).length).toBeLessThan(400);
  });
  it("the baited variant invites a fetch at the user-source host", () => {
    const text = stb5bReviewDraft({ baitHost: "stb5b-x.example.internal" });
    expect(text).toContain("https://stb5b-x.example.internal/register.csv");
  });
  it("the bait user source's url + text both land on its own host", () => {
    const s = baitUserSource("stb5b-y.example.internal");
    expect(s.url).toBe("https://stb5b-y.example.internal/register.csv");
    expect(s.text).toContain("stb5b-y.example.internal");
    expect(s.name.length).toBeGreaterThan(0);
  });
  it("the outline draft is outline-shaped (thesis + sections + claims)", () => {
    const text = stb5bOutlineDraft();
    expect(text).toContain("## Thesis");
    expect(text).toContain("### ");
    expect(text).toContain("Claim:");
  });
});

// ---------------------------------------------------------------- SSE parsing

describe("parseSseFrames", () => {
  it("parses formatSse-shaped frames and skips ping comments", () => {
    const text =
      ": ping\n\n" +
      `id: 12\nevent: run.started\ndata: {"seq":12,"type":"run.started","payload":{},"density":"summary","at":"2026-10-04T00:00:00Z"}\n\n` +
      `id: 13\nevent: step.committed\ndata: {"seq":13,"type":"step.committed","payload":{"phase":"craft"},"density":"summary","at":"2026-10-04T00:01:00Z"}\n\n`;
    const frames = parseSseFrames(text);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.id).toBe(12);
    expect(frames[1]!.event).toBe("step.committed");
    expect(sseSeqs(frames)).toEqual([12, 13]);
    const payload = JSON.parse(frames[1]!.data) as { seq: number };
    expect(payload.seq).toBe(13);
  });
  it("handles a trailing partial frame and empty input", () => {
    expect(parseSseFrames("")).toEqual([]);
    expect(sseSeqs(parseSseFrames(": ping\n\n"))).toEqual([]);
  });
});

// ---------------------------------------------------------------- structured-edit delta

describe("markerGateEdit", () => {
  it("builds the card's decide-POST delta: a marker newClaim + the change note", () => {
    const delta = markerGateEdit("STB5B-MARKER");
    const claims = delta["newClaims"] as { text: string; note: string }[];
    expect(claims).toHaveLength(1);
    expect(claims[0]!.text).toBe("STB5B-MARKER");
    expect(String(delta["note"])).toContain("STB5B-MARKER");
    // the delta is exactly the GateStructuredEdits surface — no full-document rows
    expect("rows" in delta).toBe(false);
    expect("artifactVersionId" in delta).toBe(false);
  });
});

// ---------------------------------------------------------------- evalB16Asserts (BL-16)

const b16Base = {
  runInputs: { phase: "4" },
  runState: "completed",
  // `.rhema/phase-result.json` is transient harness-control — never mirrored to artifacts (the
  // committed done+predicatesPassed step IS the proof: the oracle's phase_result leg gates it).
  steps: [
    {
      phase: "craft",
      ordinal: 1,
      state: "done",
      result: { status: "done", predicatesPassed: true },
    },
  ],
  artifactPaths: ["agents/editor/04-craft-notes.md", "drafts/v1.md"],
};

describe("evalB16Asserts", () => {
  it("all asserts pass on the healthy pinned run", () => {
    expect(evalB16Asserts(b16Base).every((a) => a.pass)).toBe(true);
  });
  it("sidecar-absent fails when the flag was sent (the leg's whole point)", () => {
    const a = evalB16Asserts({ ...b16Base, runInputs: { phase: "4", sidecar: true } });
    expect(a.find((x) => x.id === "sidecar-absent")!.pass).toBe(false);
  });
  it("phase-pinned fails on the wrong pin", () => {
    const a = evalB16Asserts({ ...b16Base, runInputs: { phase: "0" } });
    expect(a.find((x) => x.id === "phase-pinned")!.pass).toBe(false);
  });
  it("single-phase-commit fails when other phases ran or the step failed", () => {
    expect(
      evalB16Asserts({
        ...b16Base,
        steps: [
          { phase: "intake", ordinal: 0, state: "done" },
          { phase: "craft", ordinal: 1, state: "done" },
        ],
      }).find((x) => x.id === "single-phase-commit")!.pass,
    ).toBe(false);
    expect(
      evalB16Asserts({ ...b16Base, steps: [{ phase: "craft", ordinal: 1, state: "failed" }] }).find(
        (x) => x.id === "single-phase-commit",
      )!.pass,
    ).toBe(false);
  });
  it("phase-result-written fails when the commit predicate never ran clean; run-stopped fails on non-completed", () => {
    expect(
      evalB16Asserts({
        ...b16Base,
        steps: [{ phase: "craft", ordinal: 1, state: "done", result: { status: "done", predicatesPassed: false } }],
      }).find((x) => x.id === "phase-result-written")!.pass,
    ).toBe(false);
    expect(
      evalB16Asserts({
        ...b16Base,
        steps: [{ phase: "craft", ordinal: 1, state: "done", result: null }],
      }).find((x) => x.id === "phase-result-written")!.pass,
    ).toBe(false);
    expect(evalB16Asserts({ ...b16Base, runState: "running" }).find((x) => x.id === "run-stopped")!.pass).toBe(false);
  });
});

// ---------------------------------------------------------------- evalB17Asserts (BL-17)

describe("evalB17Asserts", () => {
  const happy = { liveTailSeqs: [1, 2, 3], replaySeqs: [1, 2, 3], maxDbSeq: 3, commitEventTypes: ["run.started", "step.committed", "run.completed"] };
  it("the publish asserts pass when both subscribers see the high-water seq", () => {
    const a = evalB17Asserts(happy);
    expect(a.find((x) => x.id === "live-tail-saw-commit")!.pass).toBe(true);
    expect(a.find((x) => x.id === "second-subscriber-high-water")!.pass).toBe(true);
    expect(a.find((x) => x.id === "postgres-source-of-truth")!.pass).toBe(true);
  });
  it("the audit-cap assert always reports the unreachable-by-construction finding", () => {
    const a = evalB17Asserts(happy).find((x) => x.id === "audit-iteration-cap")!;
    expect(a.pass).toBe(false);
    expect(a.evidence).toContain("ITERATION_CAPS");
  });
  it("fails when the replay subscriber misses the high-water or the tail missed the commit", () => {
    expect(
      evalB17Asserts({ ...happy, replaySeqs: [1, 2] }).find((x) => x.id === "second-subscriber-high-water")!.pass,
    ).toBe(false);
    expect(
      evalB17Asserts({ ...happy, liveTailSeqs: [1, 2] }).find((x) => x.id === "live-tail-saw-commit")!.pass,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------- evalB18aAsserts (BL-18a)

describe("evalB18aAsserts", () => {
  const rows = [{ url: "https://example.org/", bytes: 1200, agentLabel: "editor" }];
  it("the provable asserts pass on landed fetch rows + a committed verification step", () => {
    const a = evalB18aAsserts({ fetchAllowRows: rows, verificationStepPresent: true });
    expect(a.find((x) => x.id === "fetch-rows-landed")!.pass).toBe(true);
    expect(a.find((x) => x.id === "fetch-row-attribution")!.pass).toBe(true);
    expect(a.find((x) => x.id === "verification-phase-committed")!.pass).toBe(true);
  });
  it("the fetcher-binding assert always reports the unbound-path finding", () => {
    const a = evalB18aAsserts({ fetchAllowRows: rows, verificationStepPresent: true }).find(
      (x) => x.id === "fetch-via-fetcher-bound",
    )!;
    expect(a.pass).toBe(false);
    expect(a.evidence).toContain("fetchViaFetcher");
  });
  it("fails when no fetch rows landed", () => {
    const a = evalB18aAsserts({ fetchAllowRows: [], verificationStepPresent: true });
    expect(a.find((x) => x.id === "fetch-rows-landed")!.pass).toBe(false);
  });
});

// ---------------------------------------------------------------- evalB18bAsserts (BL-18b)

describe("evalB18bAsserts", () => {
  const base = {
    policyForbidden: true,
    policyDomainsContainHost: true,
    transitedRowsForHost: 0,
    denyRows: 1,
    pauseSignals: 1,
    attemptObserved: true,
  };
  it("all asserts pass when an attempt was denied pre-forward", () => {
    expect(evalB18bAsserts(base).every((a) => a.pass)).toBe(true);
  });
  it("deny-on-attempt reports owed-not-failed when no attempt was observed (STB.3 L9's outcome)", () => {
    const a = evalB18bAsserts({ ...base, attemptObserved: false, denyRows: 0, pauseSignals: 0 }).find(
      (x) => x.id === "deny-on-attempt",
    )!;
    expect(a.pass).toBe(false);
    expect(a.evidence).toContain("unexercised");
  });
  it("source-not-transited fails if any allow row carries the host; policy-frozen fails unfrozen", () => {
    expect(
      evalB18bAsserts({ ...base, transitedRowsForHost: 1 }).find((x) => x.id === "source-not-transited")!.pass,
    ).toBe(false);
    expect(
      evalB18bAsserts({ ...base, policyForbidden: false }).find((x) => x.id === "policy-frozen")!.pass,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------- evalB19Asserts (BL-19)

describe("evalB19Asserts", () => {
  const base = {
    gateKind: "approve_plan",
    decisionAction: "edit",
    overlayVersionIds: ["v1", "v2"],
    overlayPaths: ["agents/author/drafting/v2/02-structure-plan.md", "agents/author/drafting/v2/02-structure-plan.json"],
    overlayCreatedByUser: true,
    runState: "completed",
    expectPath: "structure-plan",
    markerFound: true,
    marker: "M",
  };
  it("all asserts pass on the healthy gate-edit round-trip", () => {
    expect(evalB19Asserts(base).every((a) => a.pass)).toBe(true);
  });
  it("fails cleanly per assert: no gate, no edit decision, non-user overlay, undelivered, no carry", () => {
    expect(evalB19Asserts({ ...base, gateKind: "" }).find((x) => x.id === "gate-opened")!.pass).toBe(false);
    expect(
      evalB19Asserts({ ...base, decisionAction: "approve" }).find((x) => x.id === "structured-edit-decided")!.pass,
    ).toBe(false);
    expect(
      evalB19Asserts({ ...base, overlayPaths: ["x/02-structure-plan.md"] }).find(
        (x) => x.id === "edit-lands-in-next-phase-file",
      )!.pass,
    ).toBe(false);
    expect(evalB19Asserts({ ...base, runState: "failed" }).find((x) => x.id === "run-finalized")!.pass).toBe(false);
    expect(
      evalB19Asserts({ ...base, markerFound: false }).find((x) => x.id === "marker-in-committed-artifact")!.pass,
    ).toBe(false);
  });
  it("the outline variant asserts approve-event consistency (approve-only by design)", () => {
    // an `edit` decision must NOT emit outline.approved; an `approve` must.
    expect(
      evalB19Asserts({ ...base, expectPath: "outline", approvedEventSeen: false }).find(
        (x) => x.id === "outline-approved-event-consistency",
      )!.pass,
    ).toBe(true);
    expect(
      evalB19Asserts({ ...base, expectPath: "outline", approvedEventSeen: true }).find(
        (x) => x.id === "outline-approved-event-consistency",
      )!.pass,
    ).toBe(false); // event present on an edit = a defect signal
    expect(
      evalB19Asserts({ ...base, expectPath: "outline", decisionAction: "approve", approvedEventSeen: true }).find(
        (x) => x.id === "outline-approved-event-consistency",
      )!.pass,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------- wiring

describe("STB.5b step wiring", () => {
  it("every B-step has a registry row (paid, owner STB.5b; red until the owner flips it on live proof) and a wired impl", () => {
    // B16 flipped red→green 2026-10-06 (funded window B continuation): the pinned phase-4,
    // sidecar-absent review proved live (D-P0.03-2 → DONE). The rest stay red on owed asserts.
    const flippedGreen = new Set(["B16"]);
    for (const id of Object.keys(STB5B_IMPLS)) {
      const row = STEP_REGISTRY.find((s) => s.id === id);
      expect(row, id).toBeDefined();
      expect(row!.paid, id).toBe(true);
      expect(row!.expected, id).toBe(flippedGreen.has(id) ? "green" : "red");
      expect(row!.owner, id).toBe("STB.5b");
      expect(STB5B_IMPLS[id]).toBeTypeOf("function");
    }
  });
  it("§5.3 row order: registry order matches the cap table's row order with B19C last-and-conditional", () => {
    const order = STEP_REGISTRY.map((s) => s.id).filter((id) => id.startsWith("B"));
    expect(order).toEqual(["B16", "B17", "B18A", "B18B", "B19A", "B19B", "B19C"]);
    expect(order.at(-1)).toBe("B19C"); // the $15 conditional is always the last launcher
  });
});
