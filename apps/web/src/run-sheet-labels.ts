// SPA.20 — the run sheet's chrome labels, hoisted from pages.tsx so the SSR `RunSheetPage` and the
// SPA leaf (`spa/surfaces/run-sheet.tsx`) bind the SAME COPY leaf references verbatim (the
// REQ-SAFE-10 leaf scan keys on the literal `COPY.…` refs inside this file).

import type { RunSheetLabels } from "@rhema/ui";
import { UI_LABELS, labelLookup } from "@rhema/contracts";
import { COPY } from "./copy.js";

/** The whole `COPY.runSheet` subtree — for leaf-internal references (the SPA leaf binds this rather
 *  than re-naming `COPY.runSheet`, which the REQ-SAFE-10 scan reads as an unresolved branch). */
export const runSheetCopy = COPY.runSheet;

/** The verb-specific Run label (§5.6) — "Run review"/"Run revise" CTA text, not the enum's display
 *  name; the three runnable verbs' COPY leaves (R7COPY.1a: a verb phrase, not a parallel map). */
export const runLabelFor: Record<string, string> = {
  review: COPY.runSheet.runReview,
  revise: COPY.runSheet.runRevise,
  fact_check: COPY.runSheet.runFactCheck,
};

/** The `RunSheet` chrome labels — the COPY leaves verbatim. */
export const runSheetLabels: RunSheetLabels = {
  rigorLegend: COPY.runSheet.rigorLegend,
  runLabel: COPY.runSheet.runReview,
  confirmLabel: COPY.runSheet.confirm,
  askLabel: COPY.runSheet.ask,
  changeLabel: COPY.runSheet.change,
  whyPrefix: COPY.runSheet.why,
  advancedLegend: COPY.runSheet.advanced,
  toggleLabels: labelLookup(UI_LABELS.runToggle),
  buyCreditsLabel: COPY.runSheet.buyCredits,
  suspendedNotice: COPY.runSheet.suspended,
  purchasePausedLabel: COPY.runSheet.purchasePaused,
  planOffer: { text: COPY.runSheet.planOffer, linkLabel: COPY.runSheet.planOfferLink },
  // P1.06 — the §5.6 collapsed-row fields + the §14.3 trial badge + the §7.2 scope comparison line.
  approvalsLabel: COPY.runSheet.approvals,
  approvalsDisplay: COPY.runSheet.approvalDisplay,
  autoRunLabel: COPY.runSheet.autoRunLabel,
  capLabel: COPY.runSheet.capLabel,
  dontAskLabel: COPY.runSheet.dontAskLabel,
  guidanceLabel: COPY.runSheet.guidanceLabel,
  guidancePlaceholder: COPY.runSheet.guidancePlaceholder,
  standingNotesFmt: COPY.runSheet.standingNotesFmt,
  protocolLabel: COPY.runSheet.protocolLabel,
  venueLabel: COPY.runSheet.venueLabel,
  stageLabel: COPY.runSheet.stageLabel,
  wholeDraftPrefix: COPY.runSheet.wholeDraftPrefix,
  includedLabel: COPY.runSheet.includedLabel,
  // EST.1 — the model-tier select, clamp notice, unmeasured-inputs state, resolution links.
  modelTierLabel: COPY.runSheet.modelTierLabel,
  tierLockedSuffix: COPY.runSheet.tierLockedSuffix,
  tierClampedFmt: COPY.runSheet.tierClampedFmt,
  estimatingLabel: COPY.runSheet.estimatingLabel,
  resolutionLabels: COPY.runSheet.resolutionLabels,
};

/** The voice line's chrome labels (§9.6; COPY-owned) — `RunSheetLabels["voiceLabels"]`. */
export const runSheetVoiceLabels: NonNullable<RunSheetLabels["voiceLabels"]> = {
  lineLabel: COPY.voice.sheet.lineLabel,
  adHocLabel: COPY.voice.sheet.adHoc,
  updateFirstFmt: COPY.voice.sheet.updateFirstFmt,
};
