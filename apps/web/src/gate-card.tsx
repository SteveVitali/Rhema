import type { ReactNode } from "react";
import {
  DispositionControls,
  GateCard,
  TriageLedger,
  type ApprovalRowLabels,
  type DecisionsListLabels,
  type DispositionControlsLabels,
  type GateCardLabels,
  type TriageLedgerLabels,
  type TriageLedgerRow,
} from "@rhema/ui";
import {
  buildGateCard,
  type DoNothingOutcome,
  type GateCardModel,
  type GateDecisionView,
} from "@rhema/findings-core";
import type { GateCardDto } from "@rhema/api-client";
import { GATE_DEFAULTS, type GateKind } from "@rhema/contracts";
import { COPY } from "./copy.js";

// The shared gate-card module (extracted from pages.tsx for SPA.11): the SSR pages AND the React
// surfaces render deadline gates through ONE composition — `buildGateCard` for the model, these
// COPY-bound labels for every string, `gateCardFor` for the card element — so a copy fix or a
// REQ-SPEC-1 option change lands on both renderers at once. The React twin of the inline `<script>`
// presence pings (REQ-SPEC-18) is `useGatePresence` in spa/gate-presence.ts — the inline script never
// executes inside a React mount, so the SPA mounts that effect instead (identical pings + gating).

/** Replace `{key}` placeholders in a copy template with string/number values. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const T = COPY.triage;
const G = COPY.gates;
const R = COPY.review;

export const dispositionLabels: DispositionControlsLabels = {
  verbLabel: (verb) => T.verbLabel[verb] ?? verb,
  noteLabel: T.noteLabel,
  notePlaceholder: T.notePlaceholder,
  reasonLegend: T.reasonLegend,
  reasonLabel: (code) => T.reasonLabel[code] ?? code,
  adaptLabel: T.adaptLabel,
  appliedNote: T.appliedNote,
};

/** P1.12 — the shared spine-and-sections labels: the Approve-outline card AND the unlocked outline
 *  editor render the same component with the same copy (one table, both surfaces). */
export const outlineLabels = {
  thesisLabel: G.outline.thesisLabel,
  venueLabel: G.outline.venueLabel,
  targetLengthLabel: G.outline.targetLengthLabel,
  protocolLabel: G.outline.protocolLabel,
  voiceLabel: G.outline.voiceLabel,
  spineHeading: G.outline.spineHeading,
  sectionsHeading: G.outline.sectionsHeading,
  alternativesHeading: G.outline.alternativesHeading,
  gapsHeading: G.outline.gapsHeading,
  sourcesHeading: G.outline.sourcesHeading,
  orderLabel: G.outline.orderLabel,
  strikeLabel: G.outline.strikeLabel,
  notePlaceholder: G.outline.notePlaceholder,
  addClaimLabel: G.outline.addClaimLabel,
  addClaimPlaceholder: G.outline.addClaimPlaceholder,
  addNotePlaceholder: G.outline.addNotePlaceholder,
  addClaimSectionLabel: G.outline.addClaimSectionLabel,
  targetWordsLabel: G.outline.targetWordsLabel,
  functionLabel: G.outline.functionLabel,
  entryLabel: G.outline.entryLabel,
  exitLabel: G.outline.exitLabel,
  moveLabel: G.outline.moveLabel,
  unverifiedBadge: G.outline.unverifiedBadge,
  provenanceBadge: (kind: "thread" | "source" | "user_typed" | "generated") =>
    G.outline.provenanceBadge[kind] ?? kind,
  answerLabel: G.outline.answerLabel,
  answerPlaceholder: G.outline.answerPlaceholder,
} as const;

const gateCardLabels: GateCardLabels = {
  kindLabel: (kind) => G.kindLabel[kind] ?? kind,
  approveLabel: (kind) =>
    kind === "approve_triage" ? G.approveLabel.approve_triage : G.approveLabel.default,
  approveAutonomousLabel: G.approveAutonomousLabel,
  keepPlanningLabel: G.keepPlanningLabel,
  waitLabel: G.waitLabel,
  stopLabel: G.stopLabel,
  waitingLine: G.waitingLine,
  deadlineLine: (absolute, remaining) => fmt(G.deadlineFmt, { absolute, remaining }),
  expiredLine: G.expiredLine,
  doNothingLine: (outcome: DoNothingOutcome) => G.doNothingLine[outcome],
  spendLine: (spent, cap, remaining) =>
    fmt(G.spendFmt, {
      spent: spent.toLocaleString("en-US"),
      cap: cap.toLocaleString("en-US"),
      remaining:
        remaining != null ? fmt(G.remainingFmt, { n: remaining.toLocaleString("en-US") }) : "",
    }),
  presenceLine: (countdown) => fmt(G.presenceFmt, { countdown }),
  pausedNote: G.pausedNote,
  heldLine: G.heldLine,
  guidanceLabel: G.guidanceLabel,
  standingLabel: G.standingLabel,
  informationalNote: G.informationalNote,
  escalationNote: G.escalationNote,
  // ---- P1.09 — the structured bodies, decision record, per-run override (§6.4 items 3/4/8) ----
  factsHeading: G.factsHeading,
  factLine: (key, value) =>
    `${G.factLabel[key] ?? key}: ${typeof value === "number" ? value.toLocaleString("en-US") : String(value ?? "—")}`,
  exceedsCapLine: G.exceedsCapLine,
  scopeFieldsHeading: G.scopeFieldsHeading,
  scopeFieldLabel: (field) => G.scopeFieldLabel[field] ?? field,
  plan: {
    spineHeading: G.plan.spineHeading,
    sectionsHeading: G.plan.sectionsHeading,
    alternativesHeading: G.plan.alternativesHeading,
    gapsHeading: G.plan.gapsHeading,
    orderLabel: G.plan.orderLabel,
    strikeLabel: G.plan.strikeLabel,
    notePlaceholder: G.plan.notePlaceholder,
    addClaimLabel: G.plan.addClaimLabel,
    addClaimPlaceholder: G.plan.addClaimPlaceholder,
    addNotePlaceholder: G.plan.addNotePlaceholder,
    targetWordsLabel: G.plan.targetWordsLabel,
    purposeLabel: G.plan.purposeLabel,
    apparatusLabel: G.plan.apparatusLabel,
  },
  thesisLabel: G.thesisLabel,
  // P1.12 — the Approve-outline spine-and-sections labels (the standalone outline editor reuses the
  // same COPY.gates.outline table via `outlineLabels` above).
  outline: outlineLabels,
  cutList: {
    heading: G.cutList.heading,
    targetLine: (targetWords) =>
      fmt(G.cutList.targetFmt, { n: targetWords.toLocaleString("en-US") }),
    protectLabel: G.cutList.protectLabel,
    wordsLabel: (words) => fmt(G.cutList.wordsFmt, { n: words.toLocaleString("en-US") }),
  },
  decisionsHeading: G.decisionsHeading,
  decisionLabel: (decision) => decisionLine(decision),
};

/** The permanent decision line (§6.4 item 8): "approved by you at 14:02 · with 3 changes". Shared by the
 *  gate card's record list and the run card's decision lines — one wording, both surfaces. */
export function decisionLine(d: GateDecisionView): string {
  return fmt(G.decisionLineFmt, {
    action: G.decisionActionLabel[d.action] ?? d.action,
    actor: G.decisionActorLabel[d.byActor] ?? d.byActor,
    time: d.at.slice(11, 16),
    changes: d.changes != null && d.changes > 0 ? fmt(G.decisionChangesFmt, { n: d.changes }) : "",
  });
}

export const approvalRowLabels: ApprovalRowLabels = {
  kindLabel: (kind) => G.kindLabel[kind] ?? kind,
  deadlineLine: (absolute, remaining) => fmt(G.deadlineFmt, { absolute, remaining }),
  waitingLine: G.waitingLine,
  doNothingLine: (outcome: DoNothingOutcome) => G.doNothingLine[outcome],
  openLabel: `${G.rowOpenLabel} ▸`,
  artifactLabel: G.rowArtifactLabel,
};

/**
 * The card's "This run only" deadline select (§6.4; REQ-SPEC-1): options legal for the kind only —
 * spend/refusal kinds get no control; wait-default kinds may ADD a ≥2 h deadline; defaulted kinds may
 * remove (→ wait) or lengthen. `ed.runOverride` posts `"" | "wait" | <ms>`.
 */
function runOverrideFor(
  kind: GateKind,
): { label: string; options: { value: string; label: string }[] } | undefined {
  const def = GATE_DEFAULTS[kind];
  if (def.neverAutoProceed) return undefined;
  const options: { value: string; label: string }[] = [{ value: "", label: G.thisRunDefault }];
  if (def.deadlineMs == null) {
    options.push(
      { value: String(2 * 60 * 60 * 1000), label: fmt(COPY.approvals.overrideHoursFmt, { n: 2 }) },
      { value: String(24 * 60 * 60 * 1000), label: G.thisRun24h },
      { value: String(72 * 60 * 60 * 1000), label: G.thisRun72h },
    );
  } else {
    options.push({ value: "wait", label: G.thisRunWait });
    options.push({
      value: String(def.deadlineMs * 2),
      label: fmt(COPY.approvals.overrideHoursFmt, {
        n: Math.round((def.deadlineMs * 2) / 3600000),
      }),
    });
  }
  return { label: G.thisRunLabel, options };
}

const triageLedgerLabels: TriageLedgerLabels = {
  dispositionLabel: (kind) => (kind ? (T.verbLabel[kind] ?? kind) : G.undecidedLabel),
  userActorLabel: G.userActorLabel,
  severityLabel: (s) => R.severityLabel[s] ?? s,
};

export const decisionsLabels: DecisionsListLabels = {
  heading: COPY.decisions.heading,
  emptyLabel: COPY.decisions.empty,
  optionLabel: (option) => COPY.decisions.optionLabel[option] ?? option,
};

export function gateCardModel(gate: GateCardDto, compact: boolean): GateCardModel {
  return buildGateCard(
    {
      kind: gate.kind as Parameters<typeof buildGateCard>[0]["kind"],
      onExpiry: gate.onExpiry as Parameters<typeof buildGateCard>[0]["onExpiry"],
      blocking: gate.blocking,
      held: gate.held,
      openedAt: gate.openedAt,
      deadlineAt: gate.deadlineAt ?? null,
      presenceDeadlineAt: gate.presenceDeadlineAt ?? null,
      pausedWhileReading: gate.pausedWhileReading,
      spentCredits: gate.spentCredits,
      capCredits: gate.capCredits,
      remainingEstimateCredits: gate.remainingEstimateCredits ?? null,
    },
    new Date(),
    compact ? "phone" : "full",
  );
}

/**
 * P1.09 — THE gate card (§6.4): one render path for the Needs-you ApprovalRow sheet, the Timeline's
 * run-card mount, and (SPA.11) the React inbox — the "identical card" contract. Structured fields post
 * `ed.*` through the decision form; `decisions` render the permanent record; `explainer` mounts the
 * one-time inline explainer.
 *
 * `presenceScript` (default true) keeps the SSR inline `<script>` pings. A React mount must pass
 * `presenceScript: false` — innerHTML scripts never execute under React — and run `useGatePresence`
 * for the auto-proceed card instead (same pings, REQ-SPEC-18).
 */
export function gateCardFor(
  gate: GateCardDto,
  slug: string,
  compact: boolean,
  error?: { findingId: string; message: string },
  opts?: {
    readonly decisions?: readonly GateDecisionView[];
    /** true ⇒ the one-time inline explainer mounts on this card (the first undismissed approval). */
    readonly explainer?: boolean;
    /** false ⇒ no inline presence script (React renderers mount `useGatePresence` instead). */
    readonly presenceScript?: boolean;
    /** R7RO.1 — read-only projects withhold the card's decide controls: the form area renders
     *  inside a disabled fieldset with this reason tooltip (the run-lifecycle arms under
     *  `run_lock` are never fed this flag — withholding them would deadlock the run). */
    readonly readOnlyTitle?: string;
  },
): ReactNode {
  const model = gateCardModel(gate, compact);
  const labels: GateCardLabels = opts?.explainer
    ? { ...gateCardLabels, explainer: G.explainer }
    : gateCardLabels;
  const runOverride = compact ? undefined : runOverrideFor(gate.kind as GateKind);
  const rows: TriageLedgerRow[] | undefined = gate.triage?.rows.map((r) => ({
    findingId: r.findingId,
    ordinal: r.ordinal,
    title: r.title,
    severity: r.severity,
    ...(r.disposition != null
      ? {
          disposition: {
            kind: r.disposition.kind,
            ...(r.disposition.rationale != null ? { rationale: r.disposition.rationale } : {}),
            ...(r.disposition.actor != null ? { actor: r.disposition.actor } : {}),
          },
        }
      : {}),
  }));
  const hasEscalations = rows?.some((r) => r.disposition?.kind === "escalate") ?? false;
  const card = (
    <GateCard
      key={gate.id}
      model={model}
      compact={compact}
      formAction={`/p/${slug}/gates/${gate.id}`}
      {...(opts?.presenceScript === false
        ? {}
        : { activityUrl: `/p/${slug}/gates/${gate.id}/activity` })}
      labels={labels}
      {...(gate.artifactTitle != null
        ? {
            artifact: {
              title: gate.artifactTitle,
              // the read-before-approve sheet links the artifact's Page (P1.02's read-only read).
              ...(gate.artifactId != null ? { href: `/p/${slug}/a/${gate.artifactId}` } : {}),
            },
          }
        : {})}
      hasEscalations={hasEscalations}
      {...(gate.structured != null ? { structured: gate.structured } : {})}
      {...(opts?.decisions != null ? { decisions: opts.decisions } : {})}
      {...(opts?.explainer
        ? { explainerDismissAction: `/p/${slug}/explainers/approvals/dismiss` }
        : {})}
      {...(runOverride ? { runOverride } : {})}
    >
      {rows != null ? (
        <TriageLedger
          rows={rows}
          labels={triageLedgerLabels}
          children={(row) => (
            // the per-row override — the same disposition control the dossier uses (REQ-SPEC-20).
            <DispositionControls
              formAction={`/p/${slug}/findings/${row.findingId}/disposition`}
              next={`/p/${slug}`}
              compact
              labels={dispositionLabels}
              {...(error && error.findingId === row.findingId ? { error: error.message } : {})}
              {...(row.disposition
                ? {
                    current: {
                      kind: row.disposition.kind as
                        "accept" | "adapt" | "rebut" | "defer" | "escalate",
                      ...(row.disposition.rationale != null
                        ? { rationale: row.disposition.rationale }
                        : {}),
                    },
                  }
                : {})}
            />
          )}
        />
      ) : undefined}
    </GateCard>
  );
  // R7RO.1 — a disabled fieldset withholds every control the card carries (the decide form AND
  // the ledger's per-row dispositions) with the reason tooltip — no request is ever issued.
  return opts?.readOnlyTitle != null ? (
    <fieldset
      disabled
      title={opts.readOnlyTitle}
      className="ui-c2-m0 ui-d-p0 ui-t-mw0"
      style={{ border: 0 }}
    >
      {card}
    </fieldset>
  ) : (
    card
  );
}
