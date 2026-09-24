// @rhema/ui — presentational React primitives for the beta flat shell (REQ-BETA-21 stopgap #2). Text-agnostic:
// every user-facing string is a prop, so the vocabulary lint lives over the app's copy table, not here. The
// full IDE design system (panes, tokens-as-components) is P1.01.

export const PACKAGE_NAME = "@rhema/ui" as const;

export { Pill, Chip, FetchedUrlChip, ActionLink, severityColor } from "./primitives.js";
export type { Tone, Severity } from "./primitives.js";
export { Shell, SectionTitle } from "./shell.js";
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
export type { RunCardLabels, LiveFeedLabels, FeedRow } from "./run-card.js";
export { FindingCard, FindingsList, ConflictRow } from "./findings.js";
export type { FindingCardProps, FindingCardLabels, FindingsListProps, FindingsListLabels, ConflictRowLabels } from "./findings.js";
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

// The revision surfaces (PRB.06, §5.8): What-changed move cards + the Inline hunk list + the rubric delta
// (per-dimension before/after, never an aggregate — REQ-IDE-30).
export { WhatChangedView, RubricDelta } from "./what-changed.js";
export type { WhatChangedProps, WhatChangedLabels, RubricDeltaLabels } from "./what-changed.js";

// The Page (P1.02) — the schema-first editor surface. SSR renders the full chrome + a static typeset
// render of the PM doc (PmPreview); the page.js island mounts ProseMirror over the embedded doc JSON.
export { PageEditor, PmPreview } from "./page-editor.js";
export type {
  PageEditorProps,
  PageEditorLabels,
  PageFindingView,
  PageLockView,
  PageProposalView,
} from "./page-editor.js";

// The source editor (PRB.07; REQ-BETA-21 stopgap #1 → 1.x Source mode): the SSR region the CodeMirror
// client bundle upgrades — lock banner, sync pill, projected-findings rail, note field, Revise action.
export { SourceEditor, SyncPill, EditorLockBanner, EditorFindingsRail } from "./source-editor.js";
export type {
  SourceEditorProps,
  SourceEditorLabels,
  SyncPillLabels,
  EditorLockView,
  EditorFindingView,
} from "./source-editor.js";

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
