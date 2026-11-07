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

import { type ReactNode } from "react";
import {
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
import type { EditorDocDto } from "@rhema/api-client";
import { COPY } from "./copy.js";
import { DemoDocMarkers, DemoLedgerDecisions } from "./demo-markers.js";
import type { ReadOnlyReason } from "@rhema/contracts";
import type { PageData } from "./page-data.js";

/** pages.tsx `fmt` verbatim — `{key}` placeholders in a copy template. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const E = COPY.editor;
const V = COPY.revision;
const VR = COPY.versions;
const CP = COPY.compare;

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
  /**
   * R7RO.1 (REQ-DWEB-14) — the read-only reason (demo/showcase/run_lock) when the project is
   * read-only: the rail's restore-apply and the proposal cards' accept/reject withhold with a
   * reason tooltip. `run_lock` keeps comments (DS §5.4 — they become Guidance); a frozen
   * version is never a reason (typing forks v(N+1), REQ-WRITE-7).
   */
  readonly readOnlyReason?: ReadOnlyReason | null;
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
  const { page, compact, readOnlyReason } = props;
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
            // R7RO.1 — the restore apply is a write control: withheld under every reason with
            // its tooltip (a run lock would 409 it anyway — hidden before any request).
            ...(readOnlyReason == null
              ? { restoreAction: (pid: string) => `/p/${slug}/v/${rail.currentN}/restore/${pid}` }
              : { disabledTitle: COPY.readOnly.reason[readOnlyReason] }),
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
        {...(readOnlyReason != null
          ? { readOnlyReason, readOnlyTooltip: COPY.readOnly.reason[readOnlyReason] }
          : {})}
      />
      {/* R7DEM.5 — the demo record markers (REQ-CONV-14 import-rule labels, REQ-TOUR-6 "not
          published" refs, the fragments note) mount only when the twin carried a `demo` marker
          block — a live workspace doc never has one, so this block is demo-only by data. */}
      {doc.demo != null ? <DemoDocMarkers demo={doc.demo} /> : null}
      {/* REQ-TOUR-7 — a response-ledger artifact in the demo renders its escalation rows as
          Decisions (verbatim cells). The demo gate is the read-only reason (the ledger DTO
          itself carries no `demo` markers — artifact pages only mark `notPublishedRefs`). */}
      {readOnlyReason === "demo" && doc.artifactKind === "response_ledger" ? (
        <DemoLedgerDecisions markdown={doc.markdown} />
      ) : null}
    </>
  );
}

// =========================================================================================================
// The project overview (P1.01 — the IDE's Page surface; P1.04/P1.09/P1.14/PRB.10/ONB.1 verbatim).
// =========================================================================================================

export interface ProjectOverviewProps {
  readonly project?: NonNullable<PageData["project"]>;
  readonly compact?: boolean;
  /**
   * R7RO.1 (REQ-DWEB-14) — the read-only reason when the project is read-only: every write
   * affordance on the overview withholds (rename, the import/run/export action row, the empty-head
   * affordance row, the working-head Page's proposals/restore).
   */
  readonly readOnly?: ReadOnlyReason | null;
  readonly page?: PageData["page"];
  /** SPA.23 pass-throughs — forwarded into `PageChrome` for the working-head mount. */
  readonly pageHost?: ReactNode;
  readonly pageEmbeds?: boolean;
  readonly onProposalAccept?: (p: PageProposalView) => void;
  readonly onProposalReject?: (id: string) => void;
}

/**
 * `ProjectPage`'s body verbatim — everything inside the SSR `<IdeFrame>`: the §5.9 empty-project
 * state, the rename form, the next-step card, the action row, the `data-page-mount="working"`
 * Page mount, the §5.11 Needs-you rows, the approval settings section, the §9.6 voice picker +
 * hatches, and the Decisions list.
 */
export function ProjectOverviewBody(props: ProjectOverviewProps): ReactNode {
  const { project, compact, page } = props;
  const slug = project?.slug ?? "";
  // R7RO.1 — `demo`/`showcase` withhold EVERY write affordance.
  const withhold = props.readOnly === "demo" || props.readOnly === "showcase";
  // R7HOME.2b (REQ-HOME-2/3, ADR-128's REQ-IDE-5/48 items) — the overview IS the Page now: title,
  // pill, the action row, then the head draft's Page — nothing below the document body. The admin
  // block (approvals policy, deadlines, standing notes, voice, the Needs-you rows, decisions)
  // moved to the Project settings page and the Inbox/Timeline; "Edit source" is gone (the Page
  // right here IS the draft). The empty-head affordance row is the §5.3 entries' new home.
  const emptyHead = page != null && (page.doc.markdown ?? "").trim() === "";
  return (
    <>
      {/* A project with NO head at all (a legacy head-less row — new creates always land a blank
          working draft) keeps the §5.9 empty-project state as the honest floor. */}
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
      {project?.created?.entry === "scratch" ? (
        // R7HOME.2b — the blank Page's inline title IS the heading (I2: no placeholder heading
        // above the real title): autofocused "Untitled" the writer renames in place, posting the
        // existing `/p/:slug/rename` write (JSON via the delegated submit; a plain form post for
        // no-JS).
        <form
          method="post"
          action={`/p/${slug}/rename`}
          data-rename-form="true"
          data-inline-title="true"
          style={{ margin: "4px 0" }}
        >
          <input
            type="text"
            name="title"
            required
            defaultValue={project.title}
            placeholder={COPY.newProject.untitledTitle}
            aria-label={COPY.newProject.untitledTitle}
            autoFocus
            className="ide-title-field"
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              font: "inherit",
              fontSize: "2em",
              fontWeight: 600,
              color: "inherit",
              outline: "none",
            }}
          />
        </form>
      ) : (
        <PageTitle>{project?.title ?? ""}</PageTitle>
      )}
      {project?.rename && compact !== true && !withhold ? (
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
      {project?.created?.notes &&
      (project.created.notes.warnings > 0 || project.created.notes.unconverted > 0) ? (
        // the conversion-notes line survives the retired next-step card — a quiet line above the
        // document, never an admin element.
        <p data-conversion-notes="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "8px 0 0" }}>
          {`${COPY.newProject.conversionNotes}: ${project.created.notes.warnings} · ${COPY.newProject.unconvertedNote}`}
        </p>
      ) : null}
      {project ? (
        // UX.2 (ADR-067) — `.ide-actions`: ≥24-px targets everywhere; at phone width the surviving
        // §10.1 navigations render as bordered ≥ 44-px controls (button-styled links — they are
        // navigations, so `<a>` stays the correct element).
        <p className="ide-actions" style={{ display: "flex", gap: "16px" }}>
          {/* P1.19 — §10.1 ✗: import / run start / export are never offered on phone width.
              R7RO.1 — under a read-only reason the WHOLE row withholds.
              R7HOME.2b — the "Edit source" `/v/working` link is gone: the mounted Page below IS
              the head draft. */}
          {compact === true || withhold ? null : (
            <>
              <a href={`/p/${slug}/import`}>{COPY.project.importCta}</a>
              <a href={`/p/${slug}/run`}>{COPY.runSheet.runReview}</a>
              <a href={`/p/${slug}/export`}>{COPY.project.exportCta}</a>
            </>
          )}
        </p>
      ) : null}
      {page ? (
        <div data-page-mount="working" style={{ marginTop: "12px" }}>
          {emptyHead && compact !== true && !withhold ? (
            // R7HOME.2b (REQ-HOME-3) — the empty Page's quiet affordance row: the §5.3 entry
            // points' new home, each opening its existing flow. "Ask in chat" rides the IDE
            // controller's delegated `[data-ide-panel-tab]` click (the panel tabs' own arm) —
            // never a paid run (the run sheet stays the only creator).
            <p data-empty-page-actions="true" style={{ display: "flex", gap: "16px", fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 12px" }}>
              <a href={`/p/${slug}/import`}>{COPY.emptyPage.importFile}</a>
              <a href={`/p/${slug}/import`}>{COPY.emptyPage.pasteText}</a>
              <a href={`/p/${slug}/outline`}>{COPY.emptyPage.startOutline}</a>
              <button
                type="button"
                data-ide-panel-tab="chat"
                style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontSize: "13px", cursor: "pointer" }}
              >
                {COPY.emptyPage.askChat}
              </button>
            </p>
          ) : null}
          <PageChrome
            page={page}
            compact={compact}
            {...(props.readOnly != null ? { readOnlyReason: props.readOnly } : {})}
            {...(props.pageHost != null ? { host: props.pageHost } : {})}
            {...(props.pageEmbeds != null ? { embeds: props.pageEmbeds } : {})}
            {...(props.onProposalAccept ? { onProposalAccept: props.onProposalAccept } : {})}
            {...(props.onProposalReject ? { onProposalReject: props.onProposalReject } : {})}
          />
        </div>
      ) : null}
    </>
  );
}
