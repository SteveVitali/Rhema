// @rhema/ui — presentational React primitives for the beta flat shell (REQ-BETA-21 stopgap #2). Text-agnostic:
// every user-facing string is a prop, so the vocabulary lint lives over the app's copy table, not here. The
// full IDE design system (panes, tokens-as-components) is P1.01.

export const PACKAGE_NAME = "@rhema/ui" as const;

export { Pill, Chip, FetchedUrlChip, ActionLink, severityColor } from "./primitives.js";
export type { Tone, Severity } from "./primitives.js";
export { Shell, PageTitle, SectionTitle } from "./shell.js";
export { ProjectList, ProjectRow, ProjectGroupList, VoiceGroupList } from "./project-list.js";
export type {
  ProjectRowView,
  ProjectGroupView,
  ProjectGroupKey,
  VoiceGroupView,
  RowActionView,
  SecondaryChipView,
  VoiceOptionView,
  RowIndicator,
} from "./project-list.js";
export { ConversionPreview, ConversionNotesCard } from "./conversion.js";
export type { ConversionPreviewProps, PreviewWarning } from "./conversion.js";
export { RunSheet, RunButton, AskButton, Paywall } from "./run-sheet.js";
export type { RunSheetProps, RunSheetLabels, RunButtonProps, RunButtonEstimate } from "./run-sheet.js";
export { DossierView, honorsContradictedTierOneRule } from "./dossier.js";
export type {
  DossierViewProps,
  DossierClaim,
  DossierFinding,
  DossierSource,
  DossierLabels,
} from "./dossier.js";

// The beta dossier reading surfaces (PRB.04, §5.5/§5.7/§6.6). All text-agnostic; they render the read models
// @rhema/findings-core builds. Disposition verb controls + gate cards are PRB.05; diffs PRB.06.
export { TrustChip, ObligationChip, VersionObligationChip, BalanceChip } from "./chips.js";
export type { ObligationStateKind } from "./chips.js";
export { RunCard, LiveFeed } from "./run-card.js";
export type { RunCardLabels, RunCardHrefs, LiveFeedLabels, FeedRow } from "./run-card.js";
// P1.05 — the Timeline pane's round log (§5.5) + the Level-3/4 run report (§14.5).
export { TimelinePane } from "./timeline.js";
export type { TimelineViewWire, TimelineRoundWire, TimelineLabels, TimelineHrefs } from "./timeline.js";
export { RunReport } from "./run-report.js";
export type { RunReportLabels } from "./run-report.js";
export { FindingCard, FindingsList, ConflictRow } from "./findings.js";
export type { FindingCardProps, FindingCardLabels, FindingsListProps, FindingsListLabels, ConflictRowLabels } from "./findings.js";
// P1.07 — the Margin surface + the Desk's findings table (§5.7's "three surfaces, one list").
export { MarginSurface, MarginTicks } from "./margin.js";
export type { MarginSurfaceProps, MarginLabels } from "./margin.js";
export { FindingsDesk } from "./findings-desk.js";
export type { FindingsDeskProps, FindingsDeskLabels } from "./findings-desk.js";
export { ChatDesk } from "./chat-panel.js";
export type {
  ChatDeskProps,
  ChatDeskLabels,
  ChatDeskEndpoints,
  ChatThreadWire,
  ChatTurnWire,
  ChatMessageWire,
  ChatPinWire,
  ChatSourceWire,
  ChatStripWire,
  ChatPlanCardWire,
  ChatEmptyStateWire,
  ChatAskAboutWire,
} from "./chat-panel.js";
export { ClaimsTable } from "./claims.js";
export type { ClaimsTableLabels, ClaimTableRow } from "./claims.js";
export { RubricView } from "./rubric.js";
export type { RubricLabels } from "./rubric.js";
export { SecondReadView } from "./second-read.js";
export type { SecondReadLabels, SecondReadViewProps } from "./second-read.js";
export { LetterView } from "./letter.js";
export type { LetterViewProps, LetterViewLabels, LetterSection, LetterFindingRef } from "./letter.js";

// The triage write surfaces (PRB.05, §5.7/§6.4/§10.1). Same components on desktop and phone widths
// (REQ-SPEC-20): `compact` renders the §10.1 input set.
export { DispositionControls, DEFER_PREFILL } from "./dispositions.js";
export type { DispositionControlsProps, DispositionControlsLabels } from "./dispositions.js";
export { GateCard, TriageLedger, remainingLabel } from "./gate-card.js";
export type { GateCardProps, GateCardLabels, TriageLedgerRow, TriageLedgerLabels } from "./gate-card.js";
export { DecisionsList } from "./decisions.js";
export type { DecisionsListProps, DecisionsListLabels } from "./decisions.js";
// P1.09 — the §5.11 approval row (Needs-you/Inbox): read-before-approve side sheet over the same card.
export { ApprovalRow } from "./approval-row.js";
export type { ApprovalRowProps, ApprovalRowLabels } from "./approval-row.js";

// The revision surfaces (PRB.06, §5.8): What-changed move cards + the Inline hunk list + the rubric delta
// (per-dimension before/after, never an aggregate — REQ-IDE-30).
export { WhatChangedView, RubricDelta } from "./what-changed.js";
export type { WhatChangedProps, WhatChangedLabels, RubricDeltaLabels } from "./what-changed.js";

// The Page (P1.02) — the schema-first editor surface. SSR renders the full chrome + a static typeset
// render of the PM doc (PmPreview); the page.js island mounts ProseMirror over the embedded doc JSON.
export { PageEditor, PmPreview, type PmPreviewContext } from "./page-editor.js";
export type {
  PageEditorProps,
  PageEditorLabels,
  PageFindingView,
  PageLockView,
  PageProposalView,
} from "./page-editor.js";

// SPA.24 (REQ-ED-16) — the source editor's SSR region (`SourceEditor`/`SyncPill`/
// `EditorLockBanner`/`EditorFindingsRail` + the `source-editor.tsx` module) is RETIRED: the
// `/edit/:draftId` GET has 302'd to `/v/:n` since P1.02 so nothing rendered it, and the editor.js
// island stack went with it. Source mode's return is a designed SPA feature (SPA.25), not a port.

// P1.12 — the shared spine-and-sections structured editor (§7.3): the Approve-outline gate card and
// the unlocked outline editor render the SAME rows; `editable:false` is the phone/read-only surface.
export { OutlineSections } from "./outline-sections.js";
export type { OutlineSectionsLabels } from "./outline-sections.js";

// P1.01 — the §5.1 IDE shell (seven regions) + the §5.9 state catalogue. SSR-static markup; the
// apps/web ide.js island enhances it (panes/theme/menus/keyboard). All copy arrives via labels.
export { IdeShell } from "./ide-shell.js";
export type { IdeShellProps, IdeLabels } from "./ide-shell.js";
export {
  EmptyProject,
  EmptyFindings,
  ShellSkeleton,
  StreamingBlock,
  SyncPill2,
  RunFailed,
  ConflictBanner,
  OfflineQueued,
  InsufficientBalanceSwap,
  FrozenBanner,
  CancelRunModal,
} from "./ide-states.js";

// P1.08 — §5.8 (version rail + the three-layout compare) and §5.13 (the Files pane's typed artifact
// browser). Server-rendered, text-agnostic; all copy arrives via labels from apps/web's COPY table.
export { VersionRail } from "./version-rail.js";
export type {
  VersionRailProps,
  VersionRailLabels,
  RailVersion,
  RestorePointRow,
  RestorePreviewData,
} from "./version-rail.js";
export { CompareView } from "./compare.js";
export type { CompareProps, CompareLabels, CompareLayout } from "./compare.js";
export { FilesPane } from "./files-pane.js";
export type { FilesPaneProps, FilesPaneLabels, FileRowView, FileSectionView } from "./files-pane.js";
