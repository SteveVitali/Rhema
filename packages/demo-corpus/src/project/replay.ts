// The run/record-side projectors (218a_R7DEM.3b; REQ-DWEB-15, REQ-CORPUS-7, REQ-TOUR-1,
// REQ-SYNC-2; S-7/S-9/S-10; ADR-126): replayed runs inferred from the delivered files, the
// dossier, the run report, the timeline, the imported-figure image DTO, and the hub-card
// facts/counts (`demoCardFacts` — the sole owner of the card counts, P4-6). Pure: no I/O, no
// clock. 213's `composeDeliveredSummary`/`deliveredRecordCounts` and `parseLetterSections` are
// CALLED on the snapshot record, never re-implemented; `statusMeters` supplies the one word
// count. No fabricated number — an unrecorded field is omitted and named in `notRecorded`.

import type {
  DeliverableChip,
  LetterSectionLike,
  PhaseProgress,
  ReplayedApprovalFact,
  ReplayedNotRecorded,
  ReplayedRunCardView,
  ReplayedReportPhase,
  ReplayedRunReportView,
  ReplayedRunSummaryView,
  ReportPhase,
  RubricRowInput,
  RoundSummaryPart,
} from "@rhema/findings-core";
import {
  buildFindingView,
  composeDeliveredSummary,
  deliveredRecordCounts,
  parseLetterSections,
  runCardActions,
  SLOT_PATTERNS,
} from "@rhema/findings-core";
import type { Claim, Finding, ObligationState, RunState } from "@rhema/contracts";
import { statusMeters } from "@rhema/editor";
import type {
  DemoCardFactsDto,
  DemoDossierDto,
  DemoMarkersDto,
  DemoRunReportDto,
  DemoTimelineDto,
  FigureImageCardDto,
  ProjectRow,
  ReplayedTimelineRunDto,
} from "@rhema/api-client";
import type { DemoVersion } from "./versions.js";
import { artifactKindFor } from "./files-tree.js";
import { registerSnapshotKind } from "./harness.js";
import type { SnapshotFile } from "./model.js";

// ---------------------------------------------------------------- record shapes (sidecars)

export interface DemoSlugFacts {
  readonly sourceCommit?: string;
  readonly writerDirected?: readonly string[];
  readonly approvals?: readonly ReplayedApprovalFact[];
}

/** The `_rules/facts.json` file's shape (214's PROVENANCE facts schema). */
export interface DemoFactsFile {
  readonly slugs?: Readonly<Record<string, DemoSlugFacts>>;
}

export function readFacts(text: string): DemoFactsFile {
  return JSON.parse(text) as DemoFactsFile;
}

interface LabelsFile {
  readonly claims?: readonly { readonly ordinal: number; readonly id: string }[];
  readonly findings?: readonly { readonly ordinal: number; readonly id: string }[];
  readonly importRule?: Readonly<Record<string, string>>;
  readonly roles?: Readonly<Record<string, string>>;
}

interface FindingsSidecar {
  readonly findings?: readonly {
    readonly ordinal: number;
    readonly kind?: Finding["kind"];
    readonly severity?: Finding["severity"];
    readonly origin?: Finding["origin"];
    readonly reconciliation?: Finding["reconciliation"];
    readonly anchor: Finding["anchor"];
    readonly title: string;
    readonly body: string;
    readonly evidence?: Finding["evidence"];
    readonly suggestion?: Finding["suggestion"];
    readonly rubricDims?: Finding["rubricDims"];
    readonly letterSection?: Finding["letterSection"];
  }[];
}

interface ClaimSidecar {
  readonly claims?: readonly (Omit<Claim, "id" | "correspondenceId" | "draftId"> & {
    readonly ordinal: number;
  })[];
}

interface RubricSidecar {
  readonly dimensions?: readonly RubricRowInput[];
}

interface ResponseLedgerSidecar {
  readonly entries?: readonly {
    readonly findingOrdinal: number;
    readonly disposition: {
      readonly kind: string;
      readonly status?: string;
      readonly rationale?: string;
      readonly moveOrdinal?: number;
    };
  }[];
}

interface IndexJson {
  readonly artifacts?: readonly { readonly path: string; readonly kind: string }[];
}

const NOT_RECORDED_RUN: readonly ReplayedNotRecorded[] = [
  "time",
  "credits",
  "model",
  "estimate",
];

// ---------------------------------------------------------------- S-9 replayed runs

/** The S-9 file → phase map (verbatim spec): a phase is shown iff its artifact exists, ordered
 *  by the record's own numeric prefixes; the letter closes the run. */
const PHASE_FILES: readonly { readonly re: RegExp; readonly key: string }[] = [
  { re: /^00-piece-brief\.md$/, key: "intake" },
  { re: /^01-claim-ledger(-[A-Z])?\.md$/, key: "verification" },
  { re: /^02-discourse-report.*\.md$/, key: "discourse" },
  { re: /^03-argument-notes\.md$/, key: "argument" },
  { re: /^04-craft-notes\.md$/, key: "craft" },
  { re: /^05-second-read\.md$/, key: "second_read" },
  { re: /^editors-letter\.md$/, key: "letter" },
];

export const REPLAY_RUN_KIND = "review" as const;

/** One replayed run per reviewed round (S-9; REQ-DWEB-15). */
export function inferRuns(ctx: {
  readonly versions: readonly DemoVersion[];
  readonly files: ReadonlyMap<string, string>;
}): readonly InferredRun[] {
  return ctx.versions.filter((v) => v.reviewed).map((v) => inferRun(v, ctx.files));
}

/** The reviewed-round key — the correspondence dir name doubles as the replayed run's id. */
export function replayRunId(v: DemoVersion): string {
  return `${v.draftId}-review`;
}

export interface InferredRun {
  readonly runId: string;
  readonly v: DemoVersion;
  readonly dir: string;
  readonly phases: readonly PhaseProgress[];
  readonly artifacts: readonly string[];
  readonly reportPhases: readonly ReplayedReportPhase[];
}

/** Infer one replayed run's phase set from the delivered files (S-9; REQ-DWEB-15). */
function inferRun(
  v: DemoVersion,
  files: ReadonlyMap<string, string>,
): InferredRun {
  const dir = `correspondence/${v.draftId}-review`;
  const artifacts = [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).sort();
  if (artifacts.length === 0) throw new Error(`projector: reviewed ${v.draftId} has no ${dir}/`);
  const phases: PhaseProgress[] = [];
  const reportPhases: ReplayedReportPhase[] = [];
  for (const p of artifacts) {
    const name = p.split("/").pop()!;
    const m = PHASE_FILES.find((f) => f.re.test(name));
    if (m === undefined) continue;
    phases.push({ key: m.key, ordinal: phases.length + 1, status: "done" });
    reportPhases.push({
      key: m.key,
      ordinal: reportPhases.length + 1,
      status: "done" as ReportPhase["status"],
      seat: null,
      source: "inferred_from_delivered_files" as const,
    });
  }
  return { runId: replayRunId(v), v, dir, phases, artifacts, reportPhases };
}

/** The PROVENANCE approval facts for one round — verbatim; "not_recorded" when none exist. */
function approvalsFor(
  v: DemoVersion,
  facts: DemoSlugFacts | undefined,
): readonly ReplayedApprovalFact[] | "not_recorded" {
  const round = `${v.draftId} review`;
  const hits = (facts?.approvals ?? []).filter((a) => a.round === round);
  return hits.length > 0 ? hits : "not_recorded";
}

export function labelsAt(outputs: ReadonlyMap<string, string>, dir: string): LabelsFile | undefined {
  const t = outputs.get(`${dir}/labels.json`);
  return t === undefined ? undefined : (JSON.parse(t) as LabelsFile);
}

export function findingsAt(
  outputs: ReadonlyMap<string, string>,
  dir: string,
  labels: LabelsFile | undefined,
  draftId: string,
): Finding[] {
  const t = outputs.get(`${dir}/findings.json`);
  if (t === undefined) return [];
  const sidecar = JSON.parse(t) as FindingsSidecar;
  const ids = new Map((labels?.findings ?? []).map((f) => [f.ordinal, f.id]));
  return (sidecar.findings ?? []).map((f) => ({
    id: ids.get(f.ordinal) ?? `F${f.ordinal + 1}`,
    correspondenceId: dir,
    draftId,
    ordinal: f.ordinal,
    kind: f.kind ?? "craft",
    severity: f.severity ?? "note",
    origin: f.origin ?? "editor",
    ...(f.reconciliation !== undefined ? { reconciliation: f.reconciliation } : {}),
    anchor: f.anchor,
    title: f.title,
    body: f.body,
    ...(f.evidence !== undefined ? { evidence: f.evidence } : {}),
    ...(f.suggestion !== undefined ? { suggestion: f.suggestion } : {}),
    rubricDims: f.rubricDims ?? [],
    ...(f.letterSection !== undefined ? { letterSection: f.letterSection } : {}),
    projections: [],
  }));
}

export function claimsAt(
  outputs: ReadonlyMap<string, string>,
  dir: string,
  labels: LabelsFile | undefined,
  draftId: string,
): Claim[] {
  const t = outputs.get(`${dir}/01-claim-ledger.json`);
  if (t === undefined) return [];
  const sidecar = JSON.parse(t) as ClaimSidecar;
  const ids = new Map((labels?.claims ?? []).map((c) => [c.ordinal, c.id]));
  return (sidecar.claims ?? []).map((c) => ({
    ...c,
    id: ids.get(c.ordinal) ?? `C${c.ordinal + 1}`,
    correspondenceId: dir,
    draftId,
    humanAdded: c.humanAdded ?? false,
  }));
}

/** The letter's parsed sections + the slot → findingRefs join (the same join the api route does
 *  on the same SLOT_PATTERNS — the composer never re-implements this join either way). */
function letterSections(
  markdown: string | undefined,
  findings: readonly Finding[],
): LetterSectionLike[] {
  if (markdown === undefined) return [];
  const sections = parseLetterSections(markdown);
  if (sections.length === 0) return sections;
  const slotToIdx = new Map<string, number>();
  for (const [slot, patterns] of Object.entries(SLOT_PATTERNS)) {
    const idx = sections.findIndex((s) => patterns.some((p) => p.test(s.title)));
    if (idx >= 0) slotToIdx.set(slot, idx);
  }
  const refs = new Map<number, { findingId: string; label: string }[]>();
  for (const f of findings) {
    if (f.letterSection == null) continue;
    const idx = slotToIdx.get(f.letterSection);
    if (idx == null) continue;
    const list = refs.get(idx) ?? [];
    list.push({ findingId: f.id, label: `See finding ${f.ordinal + 1}` });
    refs.set(idx, list);
  }
  return sections.map((s, i) => (refs.has(i) ? { ...s, findingRefs: refs.get(i)! } : s));
}

interface ObligationMapResult {
  readonly findingObligations: Record<string, ObligationState>;
  open: number;
  addressed: number;
}

/** Response-ledger dispositions → per-finding obligation states (the declared map — the record's
 *  own status vocabulary, never invented). */
function obligationsFromResponse(
  outputs: ReadonlyMap<string, string>,
  v: DemoVersion,
  labels: LabelsFile | undefined,
): ObligationMapResult {
  const out: ObligationMapResult = { findingObligations: {}, open: 0, addressed: 0 };
  const ids = new Map((labels?.findings ?? []).map((f) => [f.ordinal, f.id]));
  for (const agent of ["author", "editor"]) {
    const t = outputs.get(`agents/${agent}/ledgers/${v.draftId}-response-ledger.json`);
    if (t === undefined) continue;
    for (const e of (JSON.parse(t) as ResponseLedgerSidecar).entries ?? []) {
      const fid = ids.get(e.findingOrdinal);
      if (fid === undefined) continue;
      const k = e.disposition.kind;
      const st = e.disposition.status ?? "open";
      const state: ObligationState =
        k === "rebut"
          ? "rebutted"
          : st === "done" || st === "verified" || st === "honored"
            ? "addressed"
            : st === "deferred"
              ? "deferred"
              : st === "mooted"
                ? "mooted"
                : "open";
      out.findingObligations[fid] = state;
      if (state === "open") out.open++;
      else if (state === "addressed") out.addressed++;
    }
  }
  return out;
}

export interface ReplayContext {
  readonly essay: string;
  readonly versions: readonly DemoVersion[];
  readonly files: ReadonlyMap<string, string>;
  /** `convertProject`'s canonical-JSON outputs. */
  readonly outputs: ReadonlyMap<string, string>;
  /** the essay's `_rules/facts.json` entry (the only facts S-9 may cite). */
  readonly facts: DemoSlugFacts | undefined;
  readonly projectTitle: string;
}

/** One replayed run's card — badge-ready, phases inferred, every unrecorded numeric omitted. */
export function replayedRunCard(run: InferredRun, ctx: ReplayContext): ReplayedRunCardView {
  const dir = run.dir;
  const labels = labelsAt(ctx.outputs, dir);
  const findings = findingsAt(ctx.outputs, dir, labels, run.v.draftId);
  const claims = claimsAt(ctx.outputs, dir, labels, run.v.draftId);
  const letterMd = ctx.files.get(`${dir}/editors-letter.md`);
  const sections = letterSections(letterMd, findings);
  const counts = deliveredRecordCounts({
    findings: findings.map((f) => ({ letterSection: f.letterSection })),
    claims: claims.length,
  });
  // 213's composer — called on the snapshot record, never re-implemented (REQ-COPY-4).
  const delivered = composeDeliveredSummary({
    letterSections: sections,
    findings: findings.map((f) => ({ letterSection: f.letterSection })),
    claims: claims.length,
    links: ["dossier", "letter", "ledger"],
  });
  const approvals = approvalsFor(run.v, ctx.facts);
  const deliverables: DeliverableChip[] = [
    { key: "letter" },
    ...(counts.findings > 0 ? [{ key: "findings", count: counts.findings }] : []),
    ...(counts.strengths > 0 ? [{ key: "strengths", count: counts.strengths }] : []),
    ...(counts.claims > 0 ? [{ key: "claims", count: counts.claims }] : []),
    ...run.artifacts
      .map((p) => artifactKindFor(p))
      .filter((k): k is string => k !== null && k !== "editors_letter")
      .map((k) => ({ key: k })),
  ];
  const notRecorded: ReplayedNotRecorded[] = [
    ...NOT_RECORDED_RUN,
    ...(approvals === "not_recorded" ? (["approvals"] as const) : []),
  ];
  return {
    replayed: true,
    recordSource: "agent-discourse",
    runId: run.runId,
    state: "completed" as RunState,
    phases: run.phases,
    phaseSource: "inferred_from_delivered_files",
    done: run.phases.length,
    running: 0,
    total: run.phases.length,
    artifacts: run.artifacts,
    deliverables,
    delivered,
    decisions: [],
    approvals,
    notRecorded,
    actions: runCardActions({
      state: "completed",
      paused: false,
      resumable: false,
      hasDeliverable: deliverables.length > 0,
    }),
    failureCode: null,
    deliveryLabel: null,
  };
}

/** The replayed run's Level-3 report — the same facts minus every money/usage figure. */
export function replayedRunReport(run: InferredRun, ctx: ReplayContext): DemoRunReportDto {
  const labels = labelsAt(ctx.outputs, run.dir);
  const claims = claimsAt(ctx.outputs, run.dir, labels, run.v.draftId);
  const approvals = approvalsFor(run.v, ctx.facts);
  return {
    kind: "ok",
    report: {
      replayed: true,
      runId: run.runId,
      workflow: REPLAY_RUN_KIND,
      state: "completed" as RunState,
      phases: run.reportPhases,
      claims:
        claims.length > 0
          ? {
              checked: claims.length,
              verified: claims.filter(
                (c) => c.verdict === "verified" || c.verdict === "verified_against_user_source",
              ).length,
            }
          : null,
      approvals,
      notRecorded: [
        ...NOT_RECORDED_RUN,
        "usage",
        ...(approvals === "not_recorded" ? (["approvals"] as const) : []),
      ],
    } satisfies ReplayedRunReportView,
    projectSlug: ctx.essay,
    demo: {
      notRecorded: ["time", "credits", "model", "estimate", "usage"],
    },
  };
}

/** The replayed dossier — the delivered record's letter/findings/claims/rubric verbatim, with
 *  the replayed card and `notRecorded` markers where the record holds nothing. */
export function replayedDossier(run: InferredRun, ctx: ReplayContext): DemoDossierDto {
  const dir = run.dir;
  const labels = labelsAt(ctx.outputs, dir);
  const findings = findingsAt(ctx.outputs, dir, labels, run.v.draftId);
  const claims = claimsAt(ctx.outputs, dir, labels, run.v.draftId);
  const sections = letterSections(ctx.files.get(`${dir}/editors-letter.md`), findings);
  const rubricT = ctx.outputs.get(`${dir}/rubric.json`);
  const rubric =
    rubricT === undefined ? [] : ((JSON.parse(rubricT) as RubricSidecar).dimensions ?? []);
  // REQ-IDE-30 — a re-review's dossier carries the prior round's rubric verbatim.
  const priorReviewed = ctx.versions
    .filter((u) => u.reviewed && u.n < run.v.n)
    .sort((a, b) => b.n - a.n)[0];
  const priorRubricT =
    priorReviewed !== undefined
      ? ctx.outputs.get(`correspondence/${priorReviewed.draftId}-review/rubric.json`)
      : undefined;
  const priorRubric =
    priorRubricT === undefined
      ? undefined
      : ((JSON.parse(priorRubricT) as RubricSidecar).dimensions ?? []);
  const obligations = obligationsFromResponse(ctx.outputs, run.v, labels);
  const card = replayedRunCard(run, ctx);
  const approvals = approvalsFor(run.v, ctx.facts);
  const summary: ReplayedRunSummaryView = {
    runId: run.runId,
    workflow: REPLAY_RUN_KIND,
    state: "completed" as RunState,
    createdAt: null,
    card,
  };
  const notRecorded: string[] = [
    "time",
    "credits",
    "model",
    "estimate",
    "rigor",
    "fetch_log",
    "access_report",
    ...(approvals === "not_recorded" ? ["approvals"] : []),
  ];
  const demo: DemoMarkersDto = {
    ...(labels?.importRule !== undefined ? { importRule: labels.importRule } : {}),
    ...(labels?.roles !== undefined ? { roles: labels.roles } : {}),
    notRecorded,
  };
  return {
    replayed: true,
    slug: ctx.essay,
    runId: run.runId,
    projectTitle: ctx.projectTitle,
    versionLabel: `Review of ${run.v.draftId}`,
    reviewedDraftId: run.v.draftId,
    openObligations: obligations.open,
    addressedObligations: obligations.addressed,
    runSummary: summary,
    letterTitle: ctx.projectTitle,
    letterSections: sections,
    claims,
    fetchLog: [], // no proxy fetch log exists in this record — the marker says "not recorded"
    findings: findings.map((f) => buildFindingView(f)),
    rubric,
    ...(priorRubric !== undefined ? { priorRubric } : {}),
    findingObligations: obligations.findingObligations,
    demo,
  } satisfies DemoDossierDto;
}

// ---------------------------------------------------------------- the demo Timeline (REQ-CORPUS-7)

/** The essay's Timeline snapshot: one round per reviewed version, newest first. */
export function demoTimeline(
  row: Pick<ProjectRow, "id" | "slug" | "title" | "state">,
  ctx: ReplayContext,
): DemoTimelineDto {
  const drafts = new Map(ctx.versions.map((v) => [v.n, v]));
  const rounds = ctx.versions
    .filter((v) => v.reviewed)
    .sort((a, b) => b.n - a.n)
    .map((v) => {
      const run = inferRun(v, ctx.files);
      const card = replayedRunCard(run, ctx);
      // The round's produced version: the response's product — the next version whose origin is
      // `response_to_review` (a declared derivation; a writer-directed next version produced none).
      const next = drafts.get(v.n + 1);
      const producedN =
        v.answered && next?.origin === "response_to_review" ? next.n : null;
      const counts = deliveredRecordCounts({
        findings: findingsAt(
          ctx.outputs,
          run.dir,
          labelsAt(ctx.outputs, run.dir),
          v.draftId,
        ).map((f) => ({ letterSection: f.letterSection })),
        claims: claimsAt(ctx.outputs, run.dir, labelsAt(ctx.outputs, run.dir), v.draftId).length,
      });
      const parts: RoundSummaryPart[] = [
        { kind: "version", n: v.n },
        { kind: "run", workflow: REPLAY_RUN_KIND, ...(counts.findings > 0 ? { count: counts.findings } : {}) },
        ...(producedN !== null ? ([{ kind: "version", n: producedN }] as const) : []),
      ];
      const runDto: ReplayedTimelineRunDto = {
        runId: run.runId,
        workflow: REPLAY_RUN_KIND,
        state: "completed" as RunState,
        createdAt: null,
        subjectN: v.n,
        producedN,
        card,
      };
      const anchor = drafts.get(v.n);
      return {
        n: v.n,
        anchor:
          anchor !== undefined
            ? { draftId: anchor.draftId, n: anchor.n, origin: anchor.origin }
            : null,
        producedN,
        parts,
        runs: [runDto],
      };
    });
  const head = ctx.versions[ctx.versions.length - 1]!;
  const first = ctx.versions[0]!;
  return {
    project: { id: row.id, slug: row.slug, title: row.title },
    state: row.state,
    nextStep: { verb: "none", label: null, estimateCredits: null, headDraftN: head.n },
    rounds,
    ungrouped: [],
    originChip:
      first.origin === "drafted_from_outline"
        ? { kind: "outline" }
        : first.origin === "human_upload" || first.origin === "imported"
          ? { kind: "imported_draft" }
          : null,
    demo: { notRecorded: ["time", "credits", "model", "estimate"] },
  } satisfies DemoTimelineDto;
}

// ------------------------------------------------------- figure image DTO variant (S-7, RV-8)

/** The REQ-DWEB-17 route shape a figure asset reference takes (`:file` is corpus-relative). */
export function demoAssetUri(essay: string, corpusPath: string): string {
  return `/bff/demo/asset/${essay}/${corpusPath}`;
}

/** Every inline `![](…)` image ref in a markdown body resolved against its own directory. */
export function markdownImageRefs(file: string, markdown: string): readonly string[] {
  const dir = file.split("/").slice(0, -1).join("/");
  const refs: string[] = [];
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
    const raw = m[1]!;
    if (raw.startsWith("http") || raw.startsWith("/")) continue;
    refs.push(dir === "" ? raw : `${dir}/${raw}`);
  }
  return refs;
}

/** The imported-figure card set: one card per index.json image artifact. No spec, no run
 *  provenance, no generated SVG — the variant carries none of those fields (S-7). */
export function figureImages(
  ctx: ReplayContext & { readonly index: IndexJson },
): readonly { readonly id: string; readonly dto: FigureImageCardDto }[] {
  const out: { id: string; dto: FigureImageCardDto }[] = [];
  for (const a of ctx.index.artifacts ?? []) {
    if (a.kind !== "image") continue;
    const name = a.path.split("/").pop()!;
    const id = name.replace(/\.[^.]+$/, "");
    out.push({
      id,
      dto: {
        id,
        assetUri: demoAssetUri(ctx.essay, a.path),
        title: id,
        caption: "",
        alt: id,
        sourceLine: "",
        specKind: "image",
        provenance: "imported",
        versions: [{ n: 1, label: "imported" }],
        demo: { notRecorded: ["spec", "svg", "run_provenance", "caption", "source_line"] },
      } satisfies FigureImageCardDto,
    });
  }
  return out;
}

// ------------------------------------------------- card facts + counts — sole owner (P4-6)

export interface DemoCardFactsInput {
  readonly essay: string;
  readonly versions: readonly DemoVersion[];
  /** the Published node's recorded facts (versions.json `published`). */
  readonly published: { readonly fetched: string; readonly url: string; readonly label: string } | null;
  /** the Published markdown (the same bytes the status bar meters) — head draft when unpublished. */
  readonly publishedMarkdown: string;
  /** every reviewed round's finding facts across the essay's record. */
  readonly findings: readonly { readonly letterSection?: string | null; readonly severity?: string }[];
  readonly claimsChecked: number;
  readonly markers?: DemoMarkersDto;
}

/** The demo-card bucket rule on top of 213's count rule (this ticket's one owned selection):
 *  strengths ride the count rule's own split; a letter-filed `major`/`one_thing` is a major (the
 *  one thing restates a major — counted ONCE, there); anything else falls back to severity
 *  (blocking/major → major; the rest → minor). Never counted twice. */
function bucketOf(f: { letterSection?: string | null; severity?: string }): "major" | "minor" | "strength" {
  if (f.letterSection === "strength") return "strength";
  if (f.letterSection === "one_thing" || f.letterSection === "major") return "major";
  if (f.letterSection === "roadmap" || f.letterSection === "considered_rejected") return "minor";
  return f.severity === "blocking" || f.severity === "major" ? "major" : "minor";
}

/**
 * The hub card's facts + counts — the ONLY card-count function in the repo (P4-6): 221a renders
 * these structured numbers and asserts equality against this function; it never recomputes.
 * Finding/claim counts call 213's single REQ-SYNC-2 rule; the bucket split is declared above.
 */
export function demoCardFacts(input: DemoCardFactsInput): DemoCardFactsDto {
  const head = input.versions[input.versions.length - 1]!;
  const first = input.versions[0]!;
  const counts = deliveredRecordCounts({
    findings: input.findings.map((f) => ({ letterSection: f.letterSection })),
    claims: input.claimsChecked,
  });
  let major = 0;
  let minor = 0;
  for (const f of input.findings) {
    const b = bucketOf(f);
    if (b === "major") major++;
    else if (b === "minor") minor++;
  }
  const retitle = (() => {
    if (first.title === null) return null;
    const changed = input.versions.find((v) => v.title !== null && v.title !== first.title);
    if (changed === undefined || changed.draftId === first.draftId) return null;
    return {
      from: first.title,
      to: changed.title!,
      atVersion: changed.draftId,
      atLabel: changed.label,
    };
  })();
  const arc = input.versions.flatMap((v) => {
    const step = { kind: "draft" as const, draftId: v.draftId, n: v.n, label: v.label };
    return v.reviewed
      ? [step, { kind: "review" as const, runId: replayRunId(v), subjectN: v.n }]
      : [step];
  });
  return {
    essay: input.essay,
    title: head.title ?? first.title ?? input.essay,
    subtitle: head.subtitle ?? first.subtitle ?? null,
    retitle,
    publishedOn: input.published?.fetched ?? null,
    publishedLabel: input.published?.label ?? null,
    publishedUrl: input.published?.url ?? null,
    words: statusMeters(input.publishedMarkdown).words,
    arc,
    counts: { major, minor, strengths: counts.strengths, claimsChecked: counts.claims },
    ...(input.markers !== undefined ? { demo: input.markers } : {}),
  } satisfies DemoCardFactsDto;
}

// ------------------------------------------------------------- harness registration (deliv. 7)

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null;
const has = (x: unknown, ...keys: string[]): string[] =>
  isObj(x) ? keys.filter((k) => !(k in x)) : keys;

/** The card's replay invariants: marked absent fields may NEVER hold a number. */
function replayCardViolations(card: unknown, prefix: string): string[] {
  const bad: string[] = [];
  if (!isObj(card)) return [`${prefix} not an object`];
  if (card["replayed"] !== true) bad.push(`${prefix}.replayed ≠ true`);
  for (const k of ["spentCredits", "capCredits", "creditFraction", "elapsedMs", "estimateCredits", "modelTier"])
    if (k in card) bad.push(`${prefix}.${k} present — a replayed field must be omitted, not serialized`);
  if (!Array.isArray(card["notRecorded"]) || (card["notRecorded"] as unknown[]).length === 0)
    bad.push(`${prefix}.notRecorded empty`);
  if (!Array.isArray(card["phases"])) bad.push(`${prefix}.phases not an array`);
  return bad;
}

function dossierShape(env: SnapshotFile): readonly string[] {
  const d = env.dto;
  const missing = has(
    d,
    "slug",
    "runId",
    "projectTitle",
    "versionLabel",
    "openObligations",
    "addressedObligations",
    "runSummary",
    "letterTitle",
    "letterSections",
    "claims",
    "fetchLog",
    "findings",
    "rubric",
    "replayed",
  );
  if (missing.length > 0) return [`dossier missing: ${missing.join(",")}`];
  const o = d as Record<string, unknown>;
  if (o["replayed"] !== true) return ["dossier.replayed ≠ true"];
  return replayCardViolations((o["runSummary"] as Record<string, unknown>)?.["card"], "dossier.runSummary.card");
}

function runReportShape(env: SnapshotFile): readonly string[] {
  const d = env.dto;
  const missing = has(d, "kind", "report");
  if (missing.length > 0) return [`run-report missing: ${missing.join(",")}`];
  const r = (d as Record<string, unknown>)["report"];
  if (!isObj(r) || r["replayed"] !== true) return ["run-report.report.replayed ≠ true"];
  for (const k of ["spentCredits", "capCredits", "meteredCredits", "estimateCredits"])
    if (k in r) return [`run-report.report.${k} present — omitted, never serialized`];
  if (!Array.isArray(r["phases"])) return ["run-report.report.phases not an array"];
  return [];
}

function timelineShape(env: SnapshotFile): readonly string[] {
  const d = env.dto;
  const missing = has(d, "project", "state", "nextStep", "rounds", "ungrouped");
  if (missing.length > 0) return [`timeline missing: ${missing.join(",")}`];
  const o = d as Record<string, unknown>;
  const bad: string[] = [];
  const ns = o["nextStep"];
  if (isObj(ns) && ns["estimateCredits"] !== null && ns["estimateCredits"] !== undefined)
    bad.push("timeline.nextStep.estimateCredits present — no estimate exists in this record");
  for (const [i, r] of (Array.isArray(o["rounds"]) ? (o["rounds"] as unknown[]) : []).entries())
    for (const [j, run] of (Array.isArray((r as Record<string, unknown>)?.["runs"])
      ? ((r as Record<string, unknown>)["runs"] as unknown[])
      : []
    ).entries())
      bad.push(...replayCardViolations((run as Record<string, unknown>)?.["card"], `rounds[${i}].runs[${j}].card`));
  return bad;
}

function cardFactsShape(env: SnapshotFile): readonly string[] {
  const d = env.dto;
  const missing = has(d, "essay", "title", "words", "arc", "counts");
  if (missing.length > 0) return [`card-facts missing: ${missing.join(",")}`];
  const o = d as Record<string, unknown>;
  const bad: string[] = [];
  if (typeof o["words"] !== "number") bad.push("card-facts.words not a number");
  const c = o["counts"];
  for (const k of ["major", "minor", "strengths", "claimsChecked"])
    if (!isObj(c) || typeof c[k] !== "number") bad.push(`card-facts.counts.${k} not a number`);
  if (!Array.isArray(o["arc"])) bad.push("card-facts.arc not an array");
  return bad;
}

function figureShape(env: SnapshotFile): readonly string[] {
  const d = env.dto;
  const missing = has(d, "id", "assetUri", "specKind", "provenance", "versions");
  if (missing.length > 0) return [`figure missing: ${missing.join(",")}`];
  const o = d as Record<string, unknown>;
  const bad: string[] = [];
  if (o["specKind"] !== "image") bad.push('figure.specKind ≠ "image"');
  if (o["provenance"] !== "imported") bad.push('figure.provenance ≠ "imported"');
  for (const k of ["spec", "svg", "svgLight", "svgDark", "latestRunId", "files"])
    if (k in o) bad.push(`figure.${k} present — no spec/SVG/run provenance is invented`);
  if (typeof o["assetUri"] === "string" && !o["assetUri"].startsWith("/bff/demo/asset/"))
    bad.push("figure.assetUri not in the REQ-DWEB-17 route shape");
  return bad;
}

/** 218a's kind set — registered beside 218's `registerDocumentKinds` through the same seam. */
export function registerRunKinds(): void {
  registerSnapshotKind("dossier", dossierShape);
  registerSnapshotKind("run-report", runReportShape);
  registerSnapshotKind("timeline", timelineShape);
  registerSnapshotKind("card-facts", cardFactsShape);
  registerSnapshotKind("figure-image", figureShape);
}

/** Emit one snapshot envelope. */
export function env(
  kind: string,
  essay: string,
  key: string,
  dto: unknown,
): SnapshotFile {
  return { format: 1, kind, essay, key, dto };
}
