// SPA.23 — the Page surface's shared composition, hoisted out of `pages.tsx` (the `gate-card.js` /
// `approval-settings.js` precedent): the SSR document AND the `editor` SPA leaf render the SAME
// markup tree through these bodies, so the dom-contract's mount vocabulary is emitted by one
// source on both renderers (REQ-ED-6, REQ-TST-2).
//
//   • `PageChrome` — the `PageSurface` body verbatim: the §5.8 `VersionRail` (when the bag carries
//     `rail`) + the `<PageEditor>` chrome mapped from the `page` bag.
//   • `ProjectOverviewBody` — `ProjectPage`'s body verbatim, props-driven (the SSR wrapper feeds
//     `usePageData()`; the SPA leaf feeds the `GET /bff/p/:slug` twin + its own search-echoes).
//   • the label bags (`pageLabels`/`railLabels`/`whatChangedLabels`/`compareLabels`) + the
//     cite/anchor helpers both call sites share.
//
// SPA seams (additive, never rendered by the document): `pageHost` replaces the `data-page-host`
// block so `PageMount` owns it; `embeds={false}` drops the `data-page-doc|prov|findings` JSON
// scripts + the `/assets/page.js` island tag (REQ-ED-14 — the embeds are an SSR bootstrap; the
// SPA derives docJson via `markdownToDoc` and mounts through the registry); the proposal
// accept/reject handlers let the leaf dispatch `acceptProposalTr` on the live view.

import { Fragment, type ReactNode } from "react";
import {
  ApprovalRow,
  DecisionsList,
  EmptyProject,
  PageEditor,
  PageTitle,
  VersionRail,
  WhatChangedView,
  type PageEditorLabels,
  type PageProposalView,
  type VersionRailLabels,
  type WhatChangedLabels,
  type CompareLabels,
} from "@rhema/ui";
import { needsYouOrder, type GateDecisionView } from "@rhema/findings-core";
import type {
  ApprovalOverridesDto,
  ApprovalSettingsDto,
  DecisionItemDto,
  EditorDocDto,
  GateCardDto,
  TimelineDto,
  VoiceListRowDto,
} from "@rhema/api-client";
import { COPY } from "./copy.js";
import {
  approvalRowLabels,
  decisionsLabels,
  gateCardFor,
  gateCardModel,
} from "./gate-card.js";
import { ApprovalSettingsSection } from "./approval-settings.js";
import type { PageData } from "./page-data.js";

/** pages.tsx `fmt` verbatim — `{key}` placeholders in a copy template. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const E = COPY.editor;
const V = COPY.revision;
const VR = COPY.versions;
const CP = COPY.compare;
const VC = COPY.voice;

/** P1.19 — §10.1's ✗ column (REQ-MOBILE-3 amended): on phone width a suppressed surface renders
 *  this note instead of its controls. `pages.tsx` owns the SSR copy — this is the shared-module
 *  twin the leaf imports (the surfaces/*.tsx precedent). */
export function PhoneBlockedNote(): ReactNode {
  return (
    <p data-phone-blocked="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
      {COPY.phoneBlocked.note}
    </p>
  );
}

// =========================================================================================================
// The Page (P1.02 — §5.4) — the label bags + cite helpers + the surface body.
// =========================================================================================================

export const pageLabels: PageEditorLabels = {
  versionLabel: (n, baseN) =>
    baseN != null ? fmt(E.versionForkFmt, { n, base: baseN }) : fmt(E.versionFmt, { n }),
  frozenBanner: (n) => fmt(E.frozenBannerFmt, { n }),
  writerLockText: (workflow) => fmt(E.writerLockFmt, { workflow }),
  readerLockText: (workflow) => fmt(E.readerLockFmt, { workflow }),
  cancelRun: E.cancelRun,
  findingsHeading: E.findingsHeading,
  wholePiece: E.wholePiece,
  lostNote: E.lostNote,
  proposalsHeading: E.proposalsHeading,
  accept: E.accept,
  reject: E.reject,
  noteLabel: E.noteLabel,
  notePlaceholder: E.notePlaceholder,
  noteSubmit: E.noteSubmit,
  noteSaved: E.noteSaved,
  revise: E.revise,
  readOnlyNote: E.readOnlyNote,
  danglingCiteNote: E.danglingCiteNote,
  authorshipHint: E.authorshipHint,
  forkFmt: E.forkFmt,
  sync: {
    synced: E.sync.synced,
    syncing: E.sync.syncing,
    queued: E.sync.queued,
    locked: E.sync.locked,
    offline: E.sync.offline,
    readOnly: E.sync.readOnly,
  },
};

/** The projected finding's display quote — null when the anchor is unanchored (Whole piece) or lost. */
export function anchorQuote(f: EditorDocDto["findings"][number]): string | null {
  const a = f.anchor as { quote?: string; unanchored?: true } | null | undefined;
  if (!a || a.unanchored || !a.quote) return null;
  return a.quote;
}

/** The cite keys in the doc that resolve to no bibliography item — rendered visibly (never dropped). */
function danglingCites(doc: EditorDocDto): string[] {
  const keys = citeKeysInMarkdown(doc.markdown);
  const have = new Set((doc.bibliography ?? []).map((b) => b.citeKey));
  return [...keys].filter((k) => !have.has(k));
}

/** Scan the canonical markdown for `[@key]` / `[@a; @b]` cite refs (server-side parity with cite.ts). */
function citeKeysInMarkdown(markdown: string): Set<string> {
  const out = new Set<string>();
  const re = /\[@([^\]]+)\]/g;
  for (const m of markdown.matchAll(re)) {
    for (const part of (m[1] ?? "").split(";")) {
      const key = part.trim().replace(/^@/, "").split(/\s/)[0];
      if (key) out.add(key);
    }
  }
  return out;
}

export const whatChangedLabels: WhatChangedLabels = {
  heading: V.heading,
  versionLabel: (beforeN, afterN) =>
    fmt(V.versionFmt, { before: beforeN, after: afterN ?? beforeN + 1 }),
  stripLabel: (s) =>
    `${fmt(V.stripFmt, { addressed: s.addressed, rebutted: s.rebutted, stillOpen: s.stillOpen })} · ${fmt(V.movesFmt, { moves: s.moves, hunks: s.hunks })}`,
  moveHeading: (m) => fmt(V.moveHeadingFmt, { ordinal: m.moveOrdinal, title: m.title }),
  findingLine: (f) =>
    fmt(V.findingLineFmt, { ordinal: String(f.findingOrdinal).padStart(2, "0"), kind: f.kind }),
  dischargeLine: (l) =>
    l.verifiedBy
      ? fmt(V.dischargeVerifiedFmt, { label: l.label, lineage: l.lineage ?? "", by: V.verifiedByLabel[l.verifiedBy] ?? l.verifiedBy })
      : fmt(V.dischargePlainFmt, { label: l.label, lineage: l.lineage ?? "", state: l.state }),
  hunkKindLabel: (kind) => V.hunkKindLabel[kind] ?? kind,
  unlinkedHeading: V.unlinkedHeading,
  rebuttedHeading: V.rebuttedHeading,
  rebutLabel: V.rebutLabel,
  commentLabel: V.commentLabel,
  commentPlaceholder: V.commentPlaceholder,
  commentSubmit: V.commentSubmit,
};

export const railLabels: VersionRailLabels = {
  outline: VR.outline,
  originLabel: (origin) => VR.originLabel[origin] ?? origin,
  workingLabel: VR.workingLabel,
  frozenTitle: VR.frozenTitle,
  reviewedFlag: VR.reviewedFlag,
  answeredFlag: VR.answeredFlag,
  claimsPending: VR.claimsPending,
  obligationsFmt: (open, addressed) => fmt(VR.obligationsFmt, { open, addressed }),
  wordsFmt: (n) => fmt(VR.wordsFmt, { n }),
  dateFmt: (iso) => iso.slice(0, 10),
  compare: VR.compare,
  comparePrevious: VR.comparePrevious,
  restorePoints: VR.restorePoints,
  restoreEmpty: VR.restoreEmpty,
  restoreGroupLabel: (group, beforeReviewN) =>
    group === "before_review" && beforeReviewN != null
      ? fmt(VR.restoreGroup[group] ?? group, { n: beforeReviewN })
      : (VR.restoreGroup[group] ?? group),
  restorePointLabel: (p) => p.label ?? fmt(VR.restoreTimeFmt, { time: p.createdAt.slice(0, 16).replace("T", " "), cause: p.cause }),
  restorePreviewHeading: VR.restorePreviewHeading,
  restoreApply: VR.restoreApply,
  restoreUndoHint: VR.restoreUndoHint,
  restoredNotice: (draftN) => fmt(VR.restoredFmt, { n: draftN }),
  compareWhatChanged: whatChangedLabels,
};

export const compareLabels: CompareLabels = {
  heading: CP.heading,
  versionLabel: (beforeN, afterN) => fmt(CP.versionFmt, { before: beforeN, after: afterN ?? "…" }),
  layouts: CP.layouts as CompareLabels["layouts"],
  beforeCol: CP.beforeCol,
  afterCol: CP.afterCol,
  unchangedFmt: (n) => fmt(CP.unchangedFmt, { n }),
  hunkKindLabel: (kind) => V.hunkKindLabel[kind] ?? kind,
  unlinkedNote: CP.unlinkedNote,
  noChanges: CP.noChanges,
  commentLabel: V.commentLabel,
  commentPlaceholder: V.commentPlaceholder,
  commentSubmit: V.commentSubmit,
  moves: whatChangedLabels,
};

/** The `page` bag minus the SSR `docJson` embed — the SPA leaf fills `docJson` itself through the
 *  same canonical `markdownToDoc(...).toJSON()` derivation before handing the bag down. */
export type PageChromeBag = NonNullable<PageData["page"]>;

export interface PageChromeProps {
  readonly page: PageChromeBag;
  readonly compact?: boolean;
  /** SPA.23 — replaces the `data-page-host` block (the SPA's `PageMount` owns it). */
  readonly host?: ReactNode;
  /** SPA.23 — `false` omits the `script[type=json]` embeds + the `/assets/page.js` island tag. */
  readonly embeds?: boolean;
  /** SPA.23 — the proposal cards' click seam (the leaf dispatches `acceptProposalTr`). */
  readonly onProposalAccept?: (p: PageProposalView) => void;
  readonly onProposalReject?: (id: string) => void;
}

/**
 * `PageSurface`'s element — shared by the /v/:v routes, the artifact read, and the project
 * overview's working-head mount (P1.02 item 12). The `page` bag's `docJson` must already be the
 * PM doc JSON — the SSR path computes it server-side; the SPA leaf derives it with the same
 * `markdownToDoc` call before render.
 */
export function PageChrome(props: PageChromeProps): ReactNode {
  const { page, compact } = props;
  const { slug, doc } = page;
  const base = `/p/${slug}/edit/${doc.draftId}`;
  const rail = page.rail;
  return (
    <>
      {rail ? (
        // P1.08 — the §5.8 chip strip over the Page (the compare-previous link + the restore-points
        // dropdown live here; ⌘⇧C in the island follows the same link). P1.19 — §10.1 ✗: at phone
        // width the rail keeps only the version chips (diffs + restore are desktop surfaces).
        <VersionRail
          compact={compact === true}
          versions={rail.data.drafts}
          outline={rail.data.outline}
          chip={rail.data.chip}
          currentN={rail.currentN}
          hrefs={{
            version: (n) => `/p/${slug}/v/${n}`,
            artifact: (id) => `/p/${slug}/a/${id}`,
            diff: (b, a) => `/p/${slug}/v/${b}/diff/${a}`,
            restorePreview: (pid) => `/p/${slug}/v/${rail.currentN}?restore=${pid}`,
          }}
          restore={{
            points: rail.points,
            restoreAction: (pid) => `/p/${slug}/v/${rail.currentN}/restore/${pid}`,
            ...(rail.preview
              ? {
                  preview: {
                    point: rail.preview.point,
                    // the wire shape is the findings-core view model modulo `unlinked.entries`.
                    view: rail.preview.view as unknown as Parameters<typeof WhatChangedView>[0]["view"],
                  },
                }
              : {}),
          }}
          {...(rail.restoredN != null ? { restoredN: rail.restoredN } : {})}
          labels={railLabels}
        />
      ) : null}
      <PageEditor
        docJson={page.docJson}
        draftId={doc.draftId}
        draftN={doc.draftN}
        baseDraftN={doc.baseDraftN}
        origin={doc.origin}
        state={doc.state}
        lock={doc.lock}
        findings={doc.findings.map((f) => ({
          findingId: f.findingId,
          title: f.title,
          severity: f.severity,
          sourceLabel: f.sourceLabel,
          quote: anchorQuote(f),
          lost: f.lost,
          anchor: f.anchor,
          kind: f.kind,
          suggestion: f.suggestion,
        }))}
        proposals={(doc.proposals ?? []).map((p) => ({
          id: p.id,
          label: p.label ?? p.id,
          markdown: p.markdown,
          kind: p.kind,
          from: p.from,
          to: p.to,
          origin: p.origin,
        }))}
        provenance={doc.provenance ?? null}
        danglingCites={danglingCites(doc)}
        // P1.19 — §10.1: the Page is reader-only at phone width (editing is the ✗ column) — the
        // island mounts read-only too (readOnly flows to the editor island verbatim).
        readOnly={page.readOnly === true || compact === true}
        {...(page.collabWsUrl ? { collabWsUrl: page.collabWsUrl } : {})}
        saveUrl={`${base}/save`}
        docUrl={`${base}/doc`}
        noteUrl={`${base}/note`}
        cancelUrl={`${base}/cancel-run`}
        reviseUrl={`${base}/revise`}
        noteSaved={page.noteSaved}
        {...(page.focusFindingId ? { focusFindingId: page.focusFindingId } : {})}
        figureHrefFor={(figureId) => `/p/${slug}/figures/${figureId}`}
        editFigureLabel={COPY.figureCard.editFigureLabel}
        labels={pageLabels}
        {...(props.host != null ? { host: props.host } : {})}
        {...(props.embeds != null ? { embeds: props.embeds } : {})}
        {...(props.onProposalAccept ? { onProposalAccept: props.onProposalAccept } : {})}
        {...(props.onProposalReject ? { onProposalReject: props.onProposalReject } : {})}
      />
    </>
  );
}

// =========================================================================================================
// The project overview (P1.01 — the IDE's Page surface; P1.04/P1.09/P1.14/PRB.10/ONB.1 verbatim).
// =========================================================================================================

export interface ProjectOverviewProps {
  readonly project?: NonNullable<PageData["project"]>;
  readonly gates?: readonly GateCardDto[];
  readonly decisions?: readonly DecisionItemDto[];
  readonly approvalOverrides?: ApprovalOverridesDto;
  readonly approvalSettings?: ApprovalSettingsDto;
  readonly explainersDismissed?: readonly string[];
  readonly compact?: boolean;
  readonly triage?: PageData["triage"];
  readonly projectVoice?: {
    readonly current: NonNullable<PageData["projectVoice"]>["current"];
    readonly options: readonly VoiceListRowDto[];
    readonly locked?: boolean;
  };
  readonly page?: PageData["page"];
  /** the Timeline pane's structured read — the Needs-you card reads the run cards' decision lines. */
  readonly timelineView?: TimelineDto;
  /**
   * SPA.23 — `true` under the `editor` leaf: the Needs-you rows render `gateCardFor` with
   * `presenceScript: false` (an innerHTML `<script>` never executes inside a React mount) and
   * `renderApprovalRow` mounts `useGatePresence` on the row's `<details>` — REQ-SPEC-18's
   * identical pings.
   */
  readonly spa?: boolean;
  /** SPA.23 — overrides the Needs-you row render (the leaf wraps it with `useGatePresence`). */
  readonly renderApprovalRow?: (spec: ApprovalRowSpec) => ReactNode;
  /** SPA.23 pass-throughs — forwarded into `PageChrome` for the working-head mount. */
  readonly pageHost?: ReactNode;
  readonly pageEmbeds?: boolean;
  readonly onProposalAccept?: (p: PageProposalView) => void;
  readonly onProposalReject?: (id: string) => void;
}

/** The Needs-you row spec — `renderApprovalRow` renders it verbatim by default (`<ApprovalRow>`
 *  with the same props); the `editor` leaf overrides it to mount `useGatePresence` on the row's
 *  `<details>` (the inline presence `<script>` never executes inside a React mount). */
export interface ApprovalRowSpec {
  readonly gateId: string;
  readonly model: ReturnType<typeof gateCardModel>;
  readonly artifact?: { readonly title: string; readonly href?: string };
  readonly card: ReactNode;
}

/**
 * `ProjectPage`'s body verbatim — everything inside the SSR `<IdeFrame>`: the §5.9 empty-project
 * state, the rename form, the next-step card, the action row, the `data-page-mount="working"`
 * Page mount, the §5.11 Needs-you rows, the approval settings section, the §9.6 voice picker +
 * hatches, and the Decisions list.
 */
export function ProjectOverviewBody(props: ProjectOverviewProps): ReactNode {
  const {
    project,
    gates = [],
    decisions = [],
    approvalOverrides = {},
    approvalSettings,
    explainersDismissed,
    compact,
    triage,
    projectVoice,
    page,
    timelineView,
  } = props;
  const slug = project?.slug ?? "";
  const triageOptedIn = typeof approvalOverrides.approve_triage === "number";
  // P1.09 — the §5.11 ordering: blocked-on-you first by soonest deadline, waiting next, informational last.
  const orderedGates = needsYouOrder(gates);
  // the run's permanent decision records ride the Timeline read (server-projected) — the Needs-you
  // card renders the same lines its run card does (§6.4 item 8).
  const decisionsByRun = new Map<string, readonly GateDecisionView[]>();
  for (const r of [
    ...(timelineView?.rounds ?? []).flatMap((round) => round.runs),
    ...(timelineView?.ungrouped ?? []),
  ]) {
    const ds = (r.card as { decisions?: readonly GateDecisionView[] }).decisions;
    if (ds && ds.length > 0) decisionsByRun.set(r.runId, ds);
  }
  // the one-time explainer (§5.11) mounts on the first Approval card until dismissed.
  const showExplainer = !(explainersDismissed ?? []).includes("approvals");
  return (
    <>
      {/* P1.01 — the project overview IS the IDE's Page surface. An empty project (no draft head) renders
          the §5.9 empty-project state: three entry cards + the quiet serif title field. P1.02 item 12 —
          a project WITH a working head opens the Page on it; the overview affordances stay below. */}
      {project && !project.headDraftId ? (
        compact === true ? (
          /* P1.19 — §10.1 ✗: the empty-project's entries are import/run — both suppressed on
             phone width; the honest note replaces them. */
          <PhoneBlockedNote />
        ) : (
        <EmptyProject
          labels={{
            titlePlaceholder: COPY.ide.emptyProject.titlePlaceholder,
            cards: COPY.ide.emptyProject.cards,
          }}
          paths={[`/p/${slug}/import`, `/p/${slug}/import`, `/p/${slug}/run`]}
        />
        )
      ) : null}
      <PageTitle>{project?.title ?? ""}</PageTitle>
      {project?.rename && compact !== true ? (
        // P1.04 — the row action's Rename: an inline title form posting to /p/:slug/rename.
        // P1.19 — §10.1 ✗: a configuration control — suppressed on phone width.
        <form method="post" action={`/p/${slug}/rename`} data-rename-form="true" style={{ display: "flex", gap: "8px", alignItems: "center", margin: "8px 0" }}>
          <input
            type="text"
            name="title"
            required
            defaultValue={project.title}
            placeholder={COPY.projectHome.renamePlaceholder}
            style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "14px", minWidth: "280px" }}
          />
          <button type="submit" style={{ fontSize: "13px" }}>{COPY.projectHome.renameSave}</button>
        </form>
      ) : null}
      {project ? <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{project.pill}</p> : null}
      {project?.created ? (
        // P1.04 — the §5.3 per-entry landing: the next-step card at the head. Scratch points at the
        // Desk's Chat (the Assistant surface is P1.11's); outline lands Draft v1; draft lands the
        // Review — its estimate lives on the run sheet the card links to.
        <section data-next-step-card={project.created.entry} style={{ margin: "12px 0", padding: "12px 14px", border: "1px solid var(--shell-border)", borderRadius: "10px", background: "var(--shell-surface)", maxWidth: "68ch" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>
            {COPY.newProject.nextStepHeading}
          </h2>
          <p style={{ fontSize: "14px", color: "var(--shell-fg)", margin: 0 }}>
            {project.created.entry === "scratch"
              ? COPY.newProject.nextStepScratch
              : project.created.entry === "outline"
                ? fmt(COPY.newProject.nextStepOutlineFmt, { v: "v1" })
                : fmt(COPY.newProject.nextStepDraftFmt, { v: `v${project.created.draftN ?? 1}` })}
          </p>
          {project.created.entry === "draft" && compact !== true ? (
            // P1.19 — §10.1 ✗: run start is never offered on phone width.
            <p style={{ margin: "8px 0 0" }}>
              <a href={`/p/${slug}/run`} style={{ fontSize: "13px" }}>{COPY.runSheet.runReview}</a>
            </p>
          ) : null}
          {project.created.notes && (project.created.notes.warnings > 0 || project.created.notes.unconverted > 0) ? (
            <p data-conversion-notes="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "8px 0 0" }}>
              {`${COPY.newProject.conversionNotes}: ${project.created.notes.warnings} · ${COPY.newProject.unconvertedNote}`}
            </p>
          ) : null}
        </section>
      ) : null}
      {project ? (
        // UX.2 (ADR-067) — `.ide-actions`: ≥24-px targets everywhere; at phone width the surviving
        // §10.1 navigations render as bordered ≥ 44-px controls (button-styled links — they are
        // navigations, so `<a>` stays the correct element).
        <p className="ide-actions" style={{ display: "flex", gap: "16px" }}>
          {/* P1.19 — §10.1 ✗: import / run start / export are never offered on phone width; the
              reader link stays (the Page mounts read-only at that width). */}
          {compact === true ? null : (
            <>
              <a href={`/p/${slug}/import`}>{COPY.project.importCta}</a>
              <a href={`/p/${slug}/run`}>{COPY.runSheet.runReview}</a>
              <a href={`/p/${slug}/export`}>{COPY.project.exportCta}</a>
            </>
          )}
          {project.headDraftId ? (
            <a data-edit-source="true" href={`/p/${slug}/v/working`}>
              {COPY.project.editCta}
            </a>
          ) : null}
        </p>
      ) : null}
      {page ? (
        <div data-page-mount="working" style={{ marginTop: "12px" }}>
          <PageChrome
            page={page}
            compact={compact}
            {...(props.pageHost != null ? { host: props.pageHost } : {})}
            {...(props.pageEmbeds != null ? { embeds: props.pageEmbeds } : {})}
            {...(props.onProposalAccept ? { onProposalAccept: props.onProposalAccept } : {})}
            {...(props.onProposalReject ? { onProposalReject: props.onProposalReject } : {})}
          />
        </div>
      ) : null}
      {orderedGates.length > 0 ? (
        <section data-needs-you="true" style={{ marginTop: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 10px" }}>
            {COPY.gates.heading}
          </h2>
          {/* P1.09 — the §5.11 approval rows: kind + artifact + deadline/waiting + do-nothing on the
              row; expanding mounts the IDENTICAL §6.4 card (read before approving). */}
          {orderedGates.map((g, i) => {
            const model = gateCardModel(g, compact ?? false);
            const card = gateCardFor(g, slug, compact ?? false, triage?.dispositionError, {
              ...(decisionsByRun.has(g.runId) ? { decisions: decisionsByRun.get(g.runId) } : {}),
              explainer: i === 0 && showExplainer,
              ...(props.spa ? { presenceScript: false } : {}),
            });
            const artifact =
              g.artifactTitle != null
                ? {
                    title: g.artifactTitle,
                    ...(g.artifactId != null ? { href: `/p/${slug}/a/${g.artifactId}` } : {}),
                  }
                : undefined;
            // SPA.23 — a React mount swaps the inline presence script for `useGatePresence` on the
            // row's <details> (the leaf's `renderApprovalRow`; REQ-SPEC-18 verbatim).
            return props.renderApprovalRow ? (
              <Fragment key={g.id}>
                {props.renderApprovalRow({ gateId: g.id, model, ...(artifact ? { artifact } : {}), card })}
              </Fragment>
            ) : (
              <ApprovalRow
                key={g.id}
                gateId={g.id}
                model={model}
                {...(artifact ? { artifact } : {})}
                labels={approvalRowLabels}
                card={card}
              />
            );
          })}
        </section>
      ) : null}
      {/* P1.09 — the §6.4 item 3 approval settings: the policy pick + the per-kind deadline grid +
          the standing-guidance manager (§6.5; REQ-GATE-10). Falls back to the PRB.05 opt-in when the
          settings read is absent. */}
      {/* P1.19 — §10.1 ✗: approval policy is a configuration control — suppressed on phone width. */}
      {project && compact !== true ? (
        approvalSettings ? (
        <ApprovalSettingsSection slug={slug} settings={approvalSettings} />
        ) : (
        <form
          method="post"
          action={`/p/${slug}/approval-overrides`}
          data-approval-opt-in="true"
          style={{ marginTop: "20px", padding: "10px 14px", border: "1px solid var(--shell-border)", borderRadius: "8px", maxWidth: "68ch" }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 6px" }}>
            {COPY.gates.optInHeading}
          </h2>
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--shell-fg-muted)" }}>
            <input type="checkbox" name="approve_triage_24h" defaultChecked={triageOptedIn} />
            {COPY.gates.optInLabel}
          </label>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 8px" }}>{COPY.gates.optInNote}</p>
          <button type="submit" style={{ fontSize: "12px" }}>{COPY.gates.optInSave}</button>
        </form>
        )
      ) : null}
      {/* PRB.10 — the project voice picker (§9.6; REQ-DATA-32): the linked persona + "No voice"
          (the ad-hoc default, REQ-PERSONA-20). Selecting a persona pins its current profile snapshot
          server-side; the shared pill renders beside the name.
          P1.19 — §10.1 ✗: voice configuration is suppressed on phone width. */}
      {project && projectVoice && compact !== true ? (
        <div
          data-voice-picker="true"
          style={{ marginTop: "20px", padding: "10px 14px", border: "1px solid var(--shell-border)", borderRadius: "8px", maxWidth: "68ch" }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 6px" }}>
            {COPY.voice.picker.heading}
          </h2>
          <form method="post" action={`/p/${slug}/voice`}>
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--shell-fg-muted)", flexWrap: "wrap" }}>
              <select name="personaId" defaultValue={projectVoice.current.personaId ?? ""} style={{ fontSize: "13px" }}>
                <option value="">{COPY.voice.picker.noVoice}</option>
                {projectVoice.options.map((o) => (
                  <option key={o.personaId} value={o.personaId}>
                    {o.name ?? o.personaId}
                  </option>
                ))}
              </select>
              {/* P1.14 — ONE register pick on a multi-register voice (§9.6): a run input, never a pin. */}
              {(() => {
                const cur = projectVoice.options.find((o) => o.personaId === projectVoice.current.personaId);
                const regs = cur?.registers ?? [];
                return regs.length > 1 ? (
                  <select name="register" data-register-pick="true" defaultValue="" style={{ fontSize: "13px" }}>
                    <option value="">{COPY.voice.picker.registerDefault}</option>
                    {regs.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : null;
              })()}
              {projectVoice.current.voiceMode === "linked" && projectVoice.current.status ? (
                <span data-voice-pill={projectVoice.current.status.pill.tone} style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                  {projectVoice.current.status.pill.label}
                </span>
              ) : (
                <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>{COPY.voice.picker.noVoiceNote}</span>
              )}
            </label>
            <button type="submit" style={{ fontSize: "12px", marginTop: "6px" }}>{COPY.voice.picker.save}</button>
          </form>
          {/* P1.14 — the §9.6 hatches: the pin trails a refreshed profile (or a direct change just
              hit the soft lock) ⇒ Adopt (+ reseed preview) / Fork, never a silent override. */}
          {projectVoice.locked ? (
            <p data-voice-locked="true" role="alert" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "8px 0 0" }}>
              {VC.detail.voiceLockedNotice}
            </p>
          ) : null}
          {projectVoice.current.pinnedStale ? (
            <div data-pinned-stale="true" style={{ marginTop: "8px", fontSize: "12px" }}>
              <p style={{ color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{VC.detail.pinnedStaleNotice}</p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <form method="post" action={`/p/${slug}/voice/adopt`} style={{ margin: 0 }}>
                  <button type="submit" data-adopt-voice="true" style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}>
                    {VC.detail.adoptCta}
                  </button>
                </form>
                <a href={`/p/${slug}/voice/reseed`} style={{ fontSize: "12px", color: "var(--accent)" }}>
                  {VC.detail.reseedPreviewCta}
                </a>
                <form method="post" action={`/p/${slug}/voice/fork`} style={{ margin: 0 }}>
                  <input type="hidden" name="personaId" value={projectVoice.current.personaId ?? ""} />
                  <button type="submit" data-fork-project="true" style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}>
                    {VC.detail.forkProjectCta}
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div style={{ marginTop: "20px" }}>
        <DecisionsList
          items={decisions.map((d) => ({
            id: d.id,
            projectId: d.projectId,
            obligationId: d.obligationId,
            text: d.text,
            options: d.options,
            createdAt: d.createdAt,
          }))}
          formActionFor={(id) => `/p/${slug}/decisions/${id}`}
          labels={decisionsLabels}
        />
      </div>
    </>
  );
}
