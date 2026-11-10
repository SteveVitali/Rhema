import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FindingView, Claim } from "@rhema/contracts";
import {
  deriveRunCardInput,
  buildRunCardView,
  groupFindingsForList,
  detectReconciliationConflicts,
  collapsedRejected,
  summarizeReconciliation,
  buildRubricView,
  claimUrlViews,
  fetchLogFromRows,
  buildTrustChip,
  type RunEventLike,
  type TrustChipLabels,
} from "@rhema/findings-core";
import { filterFeed, type FeedEventLike } from "@rhema/findings-core";
import {
  RunCard,
  LiveFeed,
  FindingCard,
  FindingsList,
  ClaimsTable,
  RubricView,
  SecondReadView,
  LetterView,
  TrustChip,
  type RunCardLabels,
  type FindingsListLabels,
  type ClaimsTableLabels,
  type RubricLabels,
  type SecondReadLabels,
  type LetterViewLabels,
} from "./index.js";

// ---------- fixtures ----------

const user = { kind: "user", userId: "u_1" } as const;

function finding(over: Partial<FindingView>): FindingView {
  return {
    id: "f_1", correspondenceId: "c_1", draftId: "d_1", kind: "argument", severity: "major",
    origin: "editor", anchor: { blockId: "b1", quote: "q", startOffset: 0, endOffset: 1, confidence: 1 },
    title: "t", body: "b", rubricDims: [], provisional: false, ...over,
  };
}
function claim(over: Partial<Claim>): Claim {
  return { id: "cl_1", correspondenceId: "c_1", draftId: "d_1", ordinal: 1, text: "x", tier: 1, verdict: "verified", humanAdded: false, ...over };
}

const runCardLabels: RunCardLabels = {
  phaseLabel: (k) => ({ reading_the_piece: "Reading the piece", checking_claims: "Checking claims", mapping_the_field: "Mapping the field", second_read: "Second read" })[k] ?? k,
  stateLabel: (s) => s,
  creditsLabel: (spent, cap) => `${spent} / ${cap} cr`,
  etaLabel: (lo, hi) => `~${lo}\u2013${hi} min`,
  offLabel: "off",
};

// ============================================================ AC2: run card renders orchestrator state only

const AGENT_PROSE = "I secretly think the thesis is garbage and here is my reasoning";
const runEvents: RunEventLike[] = [
  { type: "run.state_changed", payload: { from: "queued", to: "running" } },
  { type: "step.started", payload: { phase: "reading_the_piece", ordinal: 1, of: 4 } },
  { type: "step.finished", payload: { phase: "reading_the_piece", ordinal: 1, of: 4, credits: 120 } },
  { type: "step.started", payload: { phase: "checking_claims", ordinal: 2, of: 4 } },
  { type: "claim.progress", payload: { checked: 23, of: 56, verified: 20 } },
  { type: "agent.note", payload: { template: "t", text: AGENT_PROSE } },
  { type: "artifact.written", payload: { kind: "editors_letter", mirrorPath: "p", versionId: "v_1", summary: AGENT_PROSE } },
  { type: "usage.tick", payload: { spentCredits: 412, capCredits: 1860 } },
];

describe("RunCard (AC2 / REQ-IDE-11)", () => {
  const input = deriveRunCardInput("run_1", runEvents, { phaseKeys: ["reading_the_piece", "checking_claims", "mapping_the_field", "second_read"], offPhases: ["mapping_the_field"], capCredits: 1860, etaBand: { lowMin: 25, highMin: 40 } });
  const html = renderToStaticMarkup(<RunCard view={buildRunCardView(input)} labels={runCardLabels} />);

  it("renders orchestrator counters/state and NONE of the agent-authored text", () => {
    expect(html).toContain("Checking claims");
    expect(html).toContain("23 / 56");
    expect(html).toContain("412 / 1,860 cr".replace(",", "")); // creditsLabel uses raw numbers
    expect(html).not.toContain(AGENT_PROSE);
  });

  it("greys opt-out phases 'off' (REQ-IDE-12)", () => {
    expect(html).toContain('data-phase-status="off"');
    expect(html).toContain(">off<");
  });

  it("renders the ETA band", () => {
    expect(html).toContain("~25\u201340 min");
  });
});

describe("LiveFeed (deliverable 2 / REQ-IDE-14 densities)", () => {
  // findings-core filters by density; the app labels each row (no raw agent text). Verbose adds the verbose rows.
  const feedEvents: FeedEventLike[] = [
    { type: "step.finished", payload: {} },
    { type: "source.read", payload: {} },
    { type: "search.performed", payload: {} },
    { type: "tool.audit", payload: {} }, // internal — never shown
  ];
  const label = (t: string) => ({ "step.finished": "Finished a phase", "source.read": "Read a source", "search.performed": "Searched" })[t] ?? t;
  const labels = { heading: "Live feed", densityLabel: (d: string) => d };

  it("Details shows summary+normal rows and never internal events", () => {
    const rows = filterFeed(feedEvents, "details").map((e) => ({ type: e.type, label: label(e.type) }));
    const out = renderToStaticMarkup(<LiveFeed density="details" rows={rows} labels={labels} />);
    expect(out).toContain('data-density="details"');
    expect(out).toContain("Finished a phase");
    expect(out).toContain("Read a source");
    expect(out).not.toContain("Searched"); // verbose-only
    expect(out).not.toContain("tool.audit"); // internal never shown
  });

  it("Verbose adds the verbose rows", () => {
    const rows = filterFeed(feedEvents, "verbose").map((e) => ({ type: e.type, label: label(e.type) }));
    const out = renderToStaticMarkup(<LiveFeed density="verbose" rows={rows} labels={labels} />);
    expect(out).toContain("Searched");
    expect(out).not.toContain("tool.audit");
  });
});

// ============================================================ AC3: provisional cards no controls; conflict row

describe("FindingCard / FindingsList (AC3 / REQ-IDE-15)", () => {
  const controls = <button data-verb="accept">Accept</button>;

  it("a provisional card exposes NO disposition controls even when a controls slot is passed", () => {
    const html = renderToStaticMarkup(
      <FindingCard
        view={finding({ provisional: true })}
        labels={{ kindLabel: (k) => k, severityLabel: (s) => s, provisionalLabel: "streaming\u2026" }}
        controls={controls}
      />,
    );
    expect(html).toContain('data-provisional="true"');
    expect(html).toContain('data-can-dispose="false"');
    expect(html).not.toContain("data-disposition-controls");
    expect(html).not.toContain('data-verb="accept"');
  });

  it("a delivered (non-provisional, unfrozen) card WOULD host controls — proving the guard is real", () => {
    const html = renderToStaticMarkup(
      <FindingCard
        view={finding({ provisional: false })}
        labels={{ kindLabel: (k) => k, severityLabel: (s) => s, provisionalLabel: "streaming\u2026" }}
        controls={controls}
      />,
    );
    expect(html).toContain('data-can-dispose="true"');
    expect(html).toContain("data-disposition-controls");
  });

  it("renders the conflict row on the pre-triage-then-rejected fixture", () => {
    const views = [
      finding({ id: "f_conf", title: "the 2019 Home Office guidance", reconciliation: "rejected", disposition: { kind: "accept", by: user, at: "t", frozen: false } }),
      finding({ id: "f_ok" }),
    ];
    const labels: FindingsListLabels = {
      kindLabel: (k) => k, severityLabel: (s) => s, provisionalLabel: "streaming\u2026",
      conflictLine: (v) => `You ${v}ed this; the Editor withdrew it \u2014 keep your disposition?`,
      conflictsHeading: "Conflicts",
    };
    const html = renderToStaticMarkup(
      <FindingsList groups={groupFindingsForList(views)} conflicts={detectReconciliationConflicts(views)} labels={labels} />,
    );
    expect(html).toContain('data-conflict-row="f_conf"');
    expect(html).toContain("the Editor withdrew it");
  });
});

// ============================================================ AC4: fetched-✓ chip iff in log; two-source stances

describe("ClaimsTable (AC4 / REQ-IDE-25, REQ-OBJ-18/19)", () => {
  const log = fetchLogFromRows([{ normalizedUrl: "https://courtlistener.com/o/1" }]);
  const labels: ClaimsTableLabels = {
    heading: "Claim ledger",
    tierLabel: (t) => `Tier ${t}`,
    fetchedLabel: "fetched",
    stanceLabel: (s) => s,
    notCheckableLabel: (k) => `${k} \u2014 not a matter of verification`,
    accessedLabel: (a) => a.slice(0, 10),
  };

  it("shows a fetched-\u2713 chip for a URL in the log and none for a URL absent from it", () => {
    const rows = [
      {
        ordinal: 12, text: "The court struck it down.", tier: 1 as const, verdict: "contradicted", verdictLabel: "Contradicted", checkable: true,
        urls: claimUrlViews(claim({ url: "https://www.courtlistener.com/o/1?x=1", normalizedUrl: "https://courtlistener.com/o/1", accessedAt: "2026-09-16T00:00:00Z" }), log),
      },
      {
        ordinal: 20, text: "Asserted from memory.", tier: 1 as const, verdict: "unsupported", verdictLabel: "Unsupported", checkable: true,
        urls: claimUrlViews(claim({ url: "https://memory.example/x", normalizedUrl: "https://memory.example/x" }), log),
      },
    ];
    const html = renderToStaticMarkup(<ClaimsTable rows={rows} labels={labels} />);
    // the in-log URL row carries a fetched chip; the memory URL row does not.
    expect(html).toContain('data-fetched="true"');
    expect(html).toContain('data-claim-url="https://courtlistener.com/o/1"');
    // exactly one fetched chip (from the primitive) even across both rows
    expect((html.match(/data-fetched="true"/g) ?? []).length).toBe(1);
  });

  it("renders BOTH stance edges of a two-source claim (REQ-OBJ-18)", () => {
    const c = claim({
      sources: [
        { url: "https://a.test/s", normalizedUrl: "https://a.test/s", accessedAt: "2026-09-16T00:00:00Z", stance: "supports" },
        { url: "https://courtlistener.com/o/1", normalizedUrl: "https://courtlistener.com/o/1", accessedAt: "2026-09-16T00:00:00Z", stance: "contradicts" },
      ],
    });
    const html = renderToStaticMarkup(<ClaimsTable rows={[{ ordinal: 1, text: "x", tier: 1, verdict: "misleading_in_context", verdictLabel: "Misleading", checkable: true, urls: claimUrlViews(c, log) }]} labels={labels} />);
    expect(html).toContain('data-stance="supports"');
    expect(html).toContain('data-stance="contradicts"');
  });

  it("renders 'not a matter of verification' for a non-checkable kind (REQ-OBJ-19)", () => {
    const html = renderToStaticMarkup(<ClaimsTable rows={[{ ordinal: 5, text: "This is the most important essay of the decade.", tier: 3, verdict: "unverifiable", verdictLabel: "Unverifiable", kind: "interpretive", checkable: false, urls: [] }]} labels={labels} />);
    expect(html).toContain('data-not-checkable="true"');
    expect(html).toContain("interpretive \u2014 not a matter of verification");
  });

  it("P1.13 — a figure-linked Tier-1 claim carries the card link (§7.5; REQ-VIZ-13)", () => {
    const html = renderToStaticMarkup(
      <ClaimsTable
        rows={[
          { ordinal: 3, text: "score: 0.71", tier: 1, verdict: "verified", verdictLabel: "Verified", checkable: true, urls: [], figureHref: "/p/slug/figures/fig01", figureLabel: "Figure" },
        ]}
        labels={labels}
      />,
    );
    expect(html).toContain('data-figure-claim="true"');
    expect(html).toContain('href="/p/slug/figures/fig01"');
    // an ordinary claim renders no figure chip
    const plain = renderToStaticMarkup(
      <ClaimsTable rows={[{ ordinal: 4, text: "x", tier: 1, verdict: "verified", verdictLabel: "Verified", checkable: true, urls: [] }]} labels={labels} />,
    );
    expect(plain).not.toContain('data-figure-claim');
  });
});

// ============================================================ AC5: rubric dot rows + caps, no aggregate

describe("RubricView (AC5 / REQ-IDE-30)", () => {
  const view = buildRubricView([
    { dimension: "thesis_contribution", score: 4 },
    { dimension: "argument_rigor", score: 3 },
    { dimension: "evidence_accuracy", score: 2, cap: { at: 2, reason: "a contradicted Tier-1 claim caps Evidence at 2", entailedByFindingOrdinal: 12 } },
    { dimension: "originality_situatedness", score: 3 },
    { dimension: "structure", score: 4 },
    { dimension: "prose", score: 5 },
    { dimension: "voice_audience_fit", score: 4 },
    { dimension: "intellectual_honesty", score: 5 },
  ]);
  const labels: RubricLabels = { heading: "Rubric", dimensionLabel: (d) => d, capLabel: (c) => `capped at ${c.at} \u2014 ${c.reason}` };
  const html = renderToStaticMarkup(<RubricView view={view} labels={labels} />);

  it("renders eight dot rows with inline cap reasons", () => {
    expect((html.match(/data-rubric-row=/g) ?? []).length).toBe(8);
    expect(html).toContain("capped at 2");
    expect(html).toContain("a contradicted Tier-1 claim caps Evidence at 2");
  });

  it("shows NO aggregate/total/score-out-of-40 anywhere in the DOM", () => {
    expect(html).not.toMatch(/\/\s*40/);
    expect(html.toLowerCase()).not.toContain("total");
    expect(html.toLowerCase()).not.toContain("aggregate");
    expect(html.toLowerCase()).not.toContain("overall score");
  });
});

// ============================================================ AC6: trust chip text from access_report only

const trustLabels: TrustChipLabels = {
  boundary: "The Editor's sandbox never had the Drafter's notes mounted \u2014 verified by the hydration manifest and the proxy log",
  fetched: "{n} URLs fetched",
  secondRead: "second read received the draft only",
  blockedOne: "{n} blocked attempt",
  blockedMany: "{n} blocked attempts",
};

describe("TrustChip (AC6 / REQ-PROD-2)", () => {
  it("renders exactly the findings-core-derived text (from access_report) and its data-facts", () => {
    const chip = buildTrustChip(
      { seat: "editor", mountedPathCount: 12, fetches: 52, deniedAttempts: 1, violations: 0, subagents: [{ label: "Second read", inputsKind: "explicit_files", fileCount: 1 }] },
      trustLabels,
    );
    const html = renderToStaticMarkup(<TrustChip chip={chip} />);
    expect(html).toContain("52 URLs fetched");
    expect(html).toContain("second read received the draft only");
    expect(html).toContain("1 blocked attempt");
    expect(html).toContain('data-fetches="52"');
    expect(html).toContain('data-denied="1"');
    expect(html).toContain('data-trust-chip="true"');
  });
});

// ============================================================ AC7: unanchored under "Whole piece", never dropped

describe("FindingsList (AC7 / REQ-IDE-23)", () => {
  it("lists unanchored findings under 'Whole piece' and drops nothing", () => {
    const views = [
      finding({ id: "a", anchor: { blockId: "b2", quote: "x", startOffset: 0, endOffset: 1, confidence: 1 } }),
      finding({ id: "b", anchor: null, title: "A whole-piece concern" }),
      finding({ id: "c", anchor: { blockId: "b1", quote: "y", startOffset: 0, endOffset: 1, confidence: 1 } }),
    ];
    const labels: FindingsListLabels = { kindLabel: (k) => k, severityLabel: (s) => s, provisionalLabel: "streaming", conflictLine: () => "" };
    const html = renderToStaticMarkup(<FindingsList groups={groupFindingsForList(views)} labels={labels} />);
    expect(html).toContain('data-group="Whole piece"');
    expect(html).toContain("A whole-piece concern");
    // all three findings present (never dropped)
    expect(html).toContain('data-finding="a"');
    expect(html).toContain('data-finding="b"');
    expect(html).toContain('data-finding="c"');
  });
});

// ============================================================ letter + second read (deliverables 3 & 5)

describe("LetterView (REQ-IDE-31)", () => {
  it("renders read-mode sections, a sticky mini-TOC, passage links, and the trust chip as the attestation", () => {
    const chip = buildTrustChip({ seat: "editor", mountedPathCount: 12, fetches: 52, deniedAttempts: 0, violations: 0, subagents: [{ label: "Second read", inputsKind: "explicit_files", fileCount: 1 }] }, trustLabels);
    const labels: LetterViewLabels = { tocHeading: "Contents", attestationHeading: "Attestation" };
    const html = renderToStaticMarkup(
      <LetterView
        title="The Politics of Visibility"
        sections={[
          { id: "verdict", title: "Verdict", paragraphs: ["The center holds."] },
          { id: "one-thing", title: "The one thing", paragraphs: ["Answer the strongest counterargument."], findingRefs: [{ findingId: "f_1", label: "See finding 1" }] },
        ]}
        trustChip={chip}
        labels={labels}
      />,
    );
    expect(html).toContain('data-letter-view="true"');
    expect(html).toContain('data-letter-toc="true"');
    expect(html).toContain('data-passage-link="f_1"');
    expect(html).toContain('href="#finding-f_1"');
    expect(html).toContain('data-letter-section="attestation"');
    expect(html).toContain("52 URLs fetched"); // the trust chip replaces the attestation prose
  });
});

describe("SecondReadView (REQ-IDE-26)", () => {
  it("renders the corroborated/kept counts and the promotable rejected group", () => {
    const views = [
      finding({ id: "a", origin: "both" }),
      finding({ id: "b", origin: "second_read", reconciliation: "kept" }),
      finding({ id: "c", reconciliation: "rejected", title: "A withdrawn concern" }),
    ];
    const labels: SecondReadLabels = {
      heading: "Second read",
      corroboratedLabel: (n) => `${n} corroborated`,
      secondReadOnlyLabel: (n) => `${n} second-read only`,
      rejectedHeading: "Considered and rejected",
      promoteLabel: "Address anyway",
    };
    const html = renderToStaticMarkup(
      <SecondReadView summary={summarizeReconciliation(views)} rejected={collapsedRejected(views)} labels={labels} />,
    );
    expect(html).toContain("1 corroborated");
    expect(html).toContain("1 second-read only");
    expect(html).toContain('data-promotable="true"');
    expect(html).toContain("A withdrawn concern");
  });
});

// R7COPY.1b (REQ-COPY-3) — every prose site renders through the ONE sanitized renderer.
describe("the one sanitized markdown renderer — per-site legs (R7COPY.1b)", () => {
  const md = finding({ body: "scaled off *Paradoxides* — see <https://ex.com/a>" });
  it("FindingCard bodies render markdown through MarkdownProse — emphasis, no asterisks", () => {
    const html = renderToStaticMarkup(
      <FindingCard view={md} labels={{ kindLabel: (k) => k, severityLabel: (s) => s, provisionalLabel: "p" }} />,
    );
    expect(html).toContain("data-md-block");
    expect(html).toContain("<em>Paradoxides</em>");
    expect(html).not.toContain("*Paradoxides*");
  });
  it("FindingCard evidence URLs are safe truncated links (C8)", () => {
    const html = renderToStaticMarkup(
      <FindingCard view={md} labels={{ kindLabel: (k) => k, severityLabel: (s) => s, provisionalLabel: "p" }}
        evidence={{ urls: [{ url: "https://ex.com/".padEnd(80, "x"), fetched: true }], verdictLabel: "v" }} />,
    );
    expect(html).toContain("ui-md-url");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("…");
  });
  it("LetterView paragraphs render markdown through the one renderer", () => {
    const html = renderToStaticMarkup(
      <LetterView title="L" trustChip={null}
        sections={[{ id: "s1", title: "S", paragraphs: ["the *letter* reads"] }]}
        labels={{ tocHeading: "Contents", attestationHeading: "Attestation" } as LetterViewLabels} />,
    );
    expect(html).toContain("data-md-block");
    expect(html).toContain("<em>letter</em>");
  });
});
