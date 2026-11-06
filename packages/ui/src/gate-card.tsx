import type { ReactNode } from "react";
import type { GateKind } from "@rhema/contracts";
import { Button } from "./primitives/button.js";
import { TextField } from "./primitives/fields.js";
import {
  presenceCountdown,
  remainingParts,
  type DoNothingOutcome,
  type GateCardAction,
  type GateCardModel,
  type GateCutListView,
  type GateDecisionView,
  type GatePlanView,
  type GateScopeView,
  type GateStructuredView,
} from "@rhema/findings-core";
import { OutlineSections, type OutlineSectionsLabels } from "./outline-sections.js";

// The §6.4 gate card — ONE generic component for every beta gate kind (REQ-BETA-1). Cards, never modals:
// each card is a plain <form> whose action buttons POST the decision; the model comes from
// `buildGateCard` (@rhema/findings-core), so the web and the 1.x mobile card share every rule
// (REQ-SPEC-20). `compact` is the §10.1 phone-width input set (Approve / Wait for me / Stop).
// Text-agnostic: every string arrives via `labels` from the app's lint-checked copy.

export interface GateCardLabels {
  /** the card's title ("Approve triage", "Confirm cost", "Refusal", …). */
  readonly kindLabel: (kind: GateKind) => string;
  /** the primary Approve label — "Approve proposals" for approve_triage, "Approve" elsewhere. */
  readonly approveLabel: (kind: GateKind) => string;
  readonly approveAutonomousLabel: string;
  readonly keepPlanningLabel: string;
  readonly waitLabel: string;
  readonly stopLabel: string;
  /** shown instead of a countdown when the gate has no deadline ("Waiting for you — no deadline."). */
  readonly waitingLine: string;
  /** the deadline line; parts = {absolute, remaining} the app formats ("due Fri 14:02 · ~3 h 12 min"). */
  readonly deadlineLine: (absolute: string, remainingLabel: string) => string;
  /** the expired-deadline line ("overdue — resolves on the next sweep"). */
  readonly expiredLine: string;
  /** "If you do nothing: …" — one sentence per outcome key. */
  readonly doNothingLine: (outcome: DoNothingOutcome) => string;
  /** "Spent 320 credits · cap 500 · ~180 left on the estimate." */
  readonly spendLine: (spent: number, cap: number, remaining: number | null) => string;
  /** the presence countdown ("Proposed to proceed in 9:41 unless you say otherwise."). */
  readonly presenceLine: (countdown: string) => string;
  /** "Paused while you read." */
  readonly pausedNote: string;
  /** the held line after "Wait for me" ("Waiting for you — the deadline is cleared."). */
  readonly heldLine: string;
  /** the guidance input label ("Add guidance for the run"). */
  readonly guidanceLabel: string;
  /** the standing-rule checkbox label ("…and remember this for this project"). */
  readonly standingLabel: string;
  /** the informational approve_scope note ("Informational — the run continues while you read."). */
  readonly informationalNote: string;
  /** the escalation flag on approve_triage ("This ledger has escalations — they are decided only by you."). */
  readonly escalationNote: string;
  // ---- P1.09 — the structured-edit + decision-record + explainer labels (§6.4 items 4/8, §5.11) ----
  /** generic read-only fact lines' heading ("The facts") — continue_rounds/cost/refusal bodies. */
  readonly factsHeading?: string;
  /** one fact line's wording — `factLine("estimateCredits", 1240)` → "Estimate: 1,240 credits". */
  readonly factLine?: (key: string, value: string | number | boolean | null) => string;
  /** the "re-priced estimate exceeds the cap — this approval waits" line on the spend-scope variant. */
  readonly exceedsCapLine?: string;
  /** the scope card's labeled correction fields (stage/venue/audience/concerns/narrow/…). */
  readonly scopeFieldLabel?: (field: string) => string;
  /** the scope card's correction-field heading ("Corrections — applied as guidance"). */
  readonly scopeFieldsHeading?: string;
  /** plan editor labels (§6.4 item 4: spine claims, section rows, the apparatus budget). */
  readonly plan?: {
    readonly spineHeading: string;
    readonly sectionsHeading: string;
    readonly alternativesHeading: string;
    readonly gapsHeading: string;
    readonly orderLabel: string;
    readonly strikeLabel: string;
    readonly notePlaceholder: string;
    readonly addClaimLabel: string;
    readonly addClaimPlaceholder: string;
    readonly addNotePlaceholder: string;
    readonly targetWordsLabel: string;
    readonly purposeLabel: string;
    readonly apparatusLabel: string;
  };
  /** the thesis pick field on choose_thesis ("Thesis — name your pick"). */
  readonly thesisLabel?: string;
  /** cut-list toggle labels ("Protect" keeps the text; "target N words" is the sidecar's target). */
  readonly cutList?: {
    readonly heading: string;
    readonly targetLine: (targetWords: number) => string;
    readonly protectLabel: string;
    readonly wordsLabel: (words: number) => string;
  };
  /** P1.12 — the Approve-outline spine-and-sections labels (the shared editor component's copy). */
  readonly outline?: OutlineSectionsLabels;
  /** the permanent decision lines under the card (§6.4 item 8 — one per recorded decision). */
  readonly decisionsHeading?: string;
  readonly decisionLabel?: (decision: GateDecisionView) => string;
  /** the first-run inline explainer (§5.11/§6.4 — one-time, inline, dismissible; never a modal). */
  readonly explainer?: {
    readonly title: string;
    readonly body: string;
    readonly dismissLabel: string;
  };
}

// 243_R7KIT.3d — the card's action buttons are the kit's Button; the `ed.*` text/number fields
// are TextFields (real inputs — the no-JS decision post keeps working). The checkbox + select
// carriers stay KIT-1-styled natives inside `GateCheck`/`GateSelect` — named GUARD-1
// exemptions: the card posts with zero client JS, so a Radix toggle is inert there (RV-36).

/** The no-JS checkbox carrier — a native `ed.*`/standing checkbox inside the decision form. */
function GateCheck({ name, defaultChecked, value, hook }: { name: string; defaultChecked?: boolean; value?: string; hook?: string }): ReactNode {
  return <input type="checkbox" name={name} value={value ?? "1"} defaultChecked={defaultChecked} {...(hook ? { [hook]: "true" } : {})} />;
}

/** The no-JS select carrier — the per-run deadline override posts `ed.runOverride`. */
function GateSelect({ name, options, hook }: { name: string; options: readonly { value: string; label: string }[]; hook?: string }): ReactNode {
  return (
    <select name={name} {...(hook ? { [hook]: "true" } : {})}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const ACTION_ORDER: Record<GateCardAction, number> = {
  approve: 0,
  approve_autonomous: 1,
  keep_planning: 2,
  wait: 3,
  stop: 4,
};

export interface GateCardProps {
  readonly model: GateCardModel;
  /** the artifact the gate presents ("Response ledger", "Estimated cost") — a link when readable. */
  readonly artifact?: { readonly title: string; readonly href?: string };
  /** the form action the decision buttons POST to (`/p/:slug/gates/:gateId`). */
  readonly formAction: string;
  /**
   * Where the presence script POSTs activity pings (`/p/:slug/gates/:gateId/activity`). Rendered only
   * when the model says the gate auto-proceeds — wait-default cards emit no script and can never arm
   * the timer (REQ-SPEC-18). Omit to disable pings (e.g. server-rendered docs, tests).
   */
  readonly activityUrl?: string;
  /** §10.1 phone-width input set: Approve / Wait for me / Stop only. */
  readonly compact?: boolean;
  /** true when the approve_triage ledger contains an escalation (the "only you" flag). */
  readonly hasEscalations?: boolean;
  readonly labels: GateCardLabels;
  /** the artifact slot — the Approve-triage card mounts its ledger rows here. */
  readonly children?: ReactNode;
  /**
   * P1.09 — the kind's structured parts (§6.4 item 4). Editable slots post `ed.*` fields the server
   * applies to the artifact's sidecar; `facts` are read-only lines. Absent ⇒ nothing renders.
   */
  readonly structured?: GateStructuredView;
  /** the run's permanent decision records rendered under the card (§6.4 item 8; REQ-RUN-5/6). */
  readonly decisions?: readonly GateDecisionView[];
  /**
   * P1.09 — the first-run inline explainer (§6.4/§5.11): rendered ONCE per user on the first approval
   * card; dismiss POSTs to this URL (a plain form — never a modal). Omit ⇒ no explainer.
   */
  readonly explainerDismissAction?: string;
  /**
   * P1.09 (§6.4) — the per-run deadline override ("this run only"): a select posting `ed.runOverride`
   * — `""` = project default, `"wait"` = remove the deadline, an ms number = set/lengthen. The app
   * supplies only options legal for this kind (REQ-SPEC-1); absent ⇒ no control.
   */
  readonly runOverride?: {
    readonly label: string;
    readonly options: readonly { readonly value: string; readonly label: string }[];
  };
}

function actionLabel(action: GateCardAction, kind: GateKind, labels: GateCardLabels): string {
  switch (action) {
    case "approve":
      return labels.approveLabel(kind);
    case "approve_autonomous":
      return labels.approveAutonomousLabel;
    case "keep_planning":
      return labels.keepPlanningLabel;
    case "wait":
      return labels.waitLabel;
    case "stop":
      return labels.stopLabel;
  }
}

/** Format a remaining duration for the deadline line ("~3 h 12 min", "~8 min", "under a minute"). */
export function remainingLabel(remainingMs: number | null): string {
  const p = remainingParts(remainingMs);
  if (p.underAMinute) return "under a minute";
  if (p.hours > 0) return `~${p.hours} h ${p.minutes} min`;
  return `~${p.minutes} min`;
}

/** The §6.4 gate card. One component, all beta gate kinds; a card, never a modal. */
/**
 * The presence-ping script (REQ-SPEC-18): `present` while the tab is focused/visible, `blur` when it
 * leaves, `reading` when the reader opens the gate's artifact. Progressive enhancement — with no JS the
 * card simply never arms the presence timer (the gate keeps its long deadline). Numbers only in the
 * payload; JSON.stringify keeps the URL injection-safe.
 */
function presenceScript(url: string): string {
  const U = JSON.stringify(url);
  return `(function(){var U=${U};
function send(k){var b=new FormData();b.set('activity',k);try{if(navigator.sendBeacon&&navigator.sendBeacon(U,b))return;fetch(U,{method:'POST',body:b,credentials:'same-origin'});}catch(e){}}
function vis(){send(document.hidden?'blur':'present');}
document.addEventListener('visibilitychange',vis);window.addEventListener('focus',function(){send('present');});
window.addEventListener('blur',function(){send('blur');});
var s=document.currentScript&&document.currentScript.closest('[data-gate-card]');
var a=s&&s.querySelector('[data-gate-artifact]');if(a)a.addEventListener('click',function(){send('reading');});
vis();})();`;
}

// ---- P1.09 — the per-kind structured bodies (§6.4 item 4). The card chrome stays generic; each kind's
// structured rows render through these slots. Every editable control is a named form field (`ed.*`
// grammar — findings-core `decodeGateEditFields` decodes it; the api applies it to the sidecar).
// Prose stays read-only — an edit is a field, never free mutation of the artifact text. ----

/** Approve-plan: spine claims (reorder/strike/add-with-note), section rows, the apparatus budget. */
function PlanEditor({ plan, labels }: { plan: GatePlanView; labels: NonNullable<GateCardLabels["plan"]> }): ReactNode {
  return (
    <div data-gate-plan="true" className="ui-d-g10" style={{ display: "flex", flexDirection: "column" }}>
      <fieldset className="ui-os-fs">
        <legend className="ui-d-l">{labels.spineHeading}</legend>
        <ol data-spine="true" className="ui-d-ol" style={{ display: "flex", flexDirection: "column" }}>
          {plan.spine.map((claim, i) => (
            <li key={i} data-spine-claim={i} data-struck={claim.struck ? "true" : "false"}>
              <span className="ui-d-fd" style={{ textDecoration: claim.struck ? "line-through" : "none" }}>
                {claim.text}
              </span>
              {claim.note ? (
                <span data-claim-note="true" className="ui-d-i"> — {claim.note}</span>
              ) : null}
              <span className="ui-set-inline ui-d-acts" style={{ display: "inline-flex", alignItems: "baseline" }}>
                <label className="ui-d-l">
                  {labels.orderLabel}
                  <TextField type="number" name={`ed.spine.${i}.ord`} min={1} defaultValue={i + 1} className="ui-os-ml1 ui-d-w48" />
                </label>
                <label className="ui-d-l">
                  <GateCheck name={`ed.spine.${i}.strike`} defaultChecked={claim.struck === true} /> {labels.strikeLabel}
                </label>
                <TextField type="text" name={`ed.spine.${i}.note`} placeholder={labels.notePlaceholder} defaultValue={claim.note ?? ""} />
              </span>
            </li>
          ))}
        </ol>
        <div data-add-claim="true" className="ui-d-mt6 ui-d-acts" style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
          <span className="ui-d-l">{labels.addClaimLabel}</span>
          <TextField type="text" name="ed.spine.new.text" placeholder={labels.addClaimPlaceholder} style={{ flex: "1 1 200px" }} />
          <TextField type="text" name="ed.spine.new.note" placeholder={labels.addNotePlaceholder} style={{ flex: "1 1 160px" }} />
        </div>
      </fieldset>
      {plan.sections.length > 0 ? (
        <fieldset className="ui-os-fs">
          <legend className="ui-d-l">{labels.sectionsHeading}</legend>
          <table data-plan-sections="true" className="ui-d-mt6 ui-d-fs" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {plan.sections.map((sec, i) => (
                <tr key={i} data-plan-section={sec.ref}>
                  <td className="ui-d-td">{sec.ref}</td>
                  <td className="ui-d-td ui-d-l">{sec.title}</td>
                  <td className="ui-d-td">
                    <TextField type="number" name={`ed.sec.${i}.ord`} min={1} defaultValue={i + 1} aria-label={labels.orderLabel} className="ui-os-n4" />
                  </td>
                  <td className="ui-d-td">
                    <TextField type="number" name={`ed.sec.${i}.targetWords`} min={0} defaultValue={sec.targetWords ?? ""} aria-label={labels.targetWordsLabel} className="ui-os-n7" />
                  </td>
                  <td>
                    <TextField type="text" name={`ed.sec.${i}.purpose`} defaultValue={sec.purpose ?? ""} aria-label={labels.purposeLabel} className="ui-d-w180" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      ) : null}
      {plan.alternativesConsidered && plan.alternativesConsidered.length > 0 ? (
        <div data-alternatives="true">
          <span className="ui-d-l">{labels.alternativesHeading}</span>
          <ul className="ui-os-ul">
            {plan.alternativesConsidered.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {plan.gaps && plan.gaps.length > 0 ? (
        <div data-gaps="true">
          <span className="ui-d-l">{labels.gapsHeading}</span>
          <ul className="ui-os-ul">
            {plan.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className="ui-d-l">
        {labels.apparatusLabel}
        <TextField type="number" name="ed.values.apparatusBudget" min={0} defaultValue={plan.apparatusBudget ?? ""} className="ui-os-ml1 ui-d-w88" />
      </label>
    </div>
  );
}

/** Approve-scope: the labeled correction fields (post as `ed.values.*` → recorded + composed). */
function ScopeFields({ scope, labels }: { scope: GateScopeView; labels: GateCardLabels }): ReactNode {
  const field = (name: string): ReactNode => (
    <label key={name} className="ui-d-l ui-c2-g1" style={{ display: "flex", flexDirection: "column" }}>
      {labels.scopeFieldLabel?.(name) ?? name}
      <TextField type="text" name={`ed.values.${name}`} />
    </label>
  );
  return (
    <div data-gate-scope="true" className="ui-d-acts" style={{ display: "flex", flexDirection: "column" }}>
      {scope.exceedsCap && labels.exceedsCapLine ? (
        <p data-exceeds-cap="true" className="ui-c2-m0 ui-d-wn">{labels.exceedsCapLine}</p>
      ) : null}
      {labels.scopeFieldsHeading ? <span className="ui-d-l">{labels.scopeFieldsHeading}</span> : null}
      <div className="ui-d-acts" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        {["stage", "venue", "audience", "concerns", "narrow"].map(field)}
      </div>
    </div>
  );
}

/** Approve-cutlist: the protect/restore toggles (§6.4 item 4). */
function CutListToggles({ cutList, labels }: { cutList: GateCutListView; labels: NonNullable<GateCardLabels["cutList"]> }): ReactNode {
  return (
    <div data-gate-cutlist="true">
      <span className="ui-d-l">{labels.heading}</span>
      {cutList.targetWords != null ? (
        <span data-cut-target="true" className="ui-d-i ui-set-inline">
          {labels.targetLine(cutList.targetWords)}
        </span>
      ) : null}
      <ul className="ui-os-ul ui-c2-g1" style={{ display: "flex", flexDirection: "column" }}>
        {cutList.cuts.map((cut, i) => (
          <li key={i} data-cut={cut.ordinal} className="ui-d-fs">
            <label className="ui-d-g6" style={{ display: "inline-flex", alignItems: "baseline" }}>
              <GateCheck name={`ed.cut.${i}.protect`} defaultChecked={cut.protect} />
              {labels.protectLabel}
            </label>
            <span className="ui-os-ml1 ui-d-l">
              {labels.wordsLabel(cut.words)} — {cut.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Choose-thesis: the pick field posts `ed.values.thesis` (recorded + composed into guidance). */
function ThesisPick({ label }: { label: string }): ReactNode {
  return (
    <label data-gate-thesis="true" className="ui-d-l" style={{ display: "block" }}>
      {label}
      <TextField type="text" name="ed.values.thesis" className="ui-os-mr" />
    </label>
  );
}

/** The kind's structured body — the registry maps kind → its slot; `facts` lines render for any kind. */
function GateStructuredFields({
  kind,
  structured,
  labels,
  compact,
}: {
  kind: GateKind;
  structured: GateStructuredView;
  labels: GateCardLabels;
  compact?: boolean;
}): ReactNode {
  return (
    <div data-gate-structured={kind} className="ui-d-mt10 ui-d-g10" style={{ display: "flex", flexDirection: "column" }}>
      {kind === "approve_plan" && structured.plan && labels.plan ? (
        <PlanEditor plan={structured.plan} labels={labels.plan} />
      ) : null}
      {kind === "approve_outline" && structured.outline && labels.outline ? (
        // P1.12 — the shared spine-and-sections editor (the unlocked outline editor renders the same
        // component); phone-width renders it read-only (§10.1's reduced input set).
        <OutlineSections outline={structured.outline} editable={compact !== true} labels={labels.outline} />
      ) : null}
      {kind === "approve_scope" && structured.scope ? (
        <ScopeFields scope={structured.scope} labels={labels} />
      ) : null}
      {kind === "approve_cutlist" && structured.cutList && labels.cutList ? (
        <CutListToggles cutList={structured.cutList} labels={labels.cutList} />
      ) : null}
      {kind === "choose_thesis" && labels.thesisLabel ? <ThesisPick label={labels.thesisLabel} /> : null}
      {structured.facts && Object.keys(structured.facts).length > 0 ? (
        <div data-gate-facts="true">
          {labels.factsHeading ? <span className="ui-d-l">{labels.factsHeading}</span> : null}
          <ul className="ui-os-ul ui-c2-g1" style={{ display: "flex", flexDirection: "column" }}>
            {Object.entries(structured.facts).map(([key, value]) => (
              <li key={key} data-fact={key}>{labels.factLine?.(key, value) ?? `${key}: ${String(value)}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function GateCard({
  model,
  artifact,
  formAction,
  activityUrl,
  compact,
  hasEscalations,
  labels,
  children,
  structured,
  decisions,
  explainerDismissAction,
  runOverride,
}: GateCardProps): ReactNode {
  return (
    <section
      data-gate-card={model.kind}
      data-blocking={model.blocking ? "true" : "false"}
      data-held={model.held ? "true" : "false"}
      data-compact={compact ? "true" : "false"}
      role="region"
      aria-label={labels.kindLabel(model.kind)}
      className="ui-vc-card"
      style={{
        border: "1px solid var(--shell-border)",
        borderLeft: `3px solid ${model.blocking ? "var(--sev-major)" : "var(--shell-border)"}`,
      }}
    >
      <div className="ui-d-acts" style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 className="ui-d-h">{labels.kindLabel(model.kind)}</h3>
        {artifact ? (
          artifact.href ? (
            <a href={artifact.href} data-gate-artifact="true" className="ui-d-fd ui-c2-ca">
              {artifact.title}
            </a>
          ) : (
            <span data-gate-artifact="true" className="ui-d-t">
              {artifact.title}
            </span>
          )
        ) : null}
        {model.informational ? (
          <span data-informational="true" className="ui-d-i">
            {labels.informationalNote}
          </span>
        ) : null}
      </div>

      {/* P1.09 — the first-run inline explainer (§6.4/§5.11): shown once per user, dismissible via a
          plain form post — inline coaching, never a modal (§14.2). */}
      {labels.explainer && explainerDismissAction ? (
        <aside data-gate-explainer="true" className="ui-set-card ui-d-l ui-d-eb">
          <strong>{labels.explainer.title}</strong>
          <p className="ui-set-note">{labels.explainer.body}</p>
          <form method="post" action={explainerDismissAction} className="ui-d-mt6">
            <Button type="submit" size="sm">
              {labels.explainer.dismissLabel}
            </Button>
          </form>
        </aside>
      ) : null}

      {/* the artifact slot — the approve_triage card mounts its ledger rows here (§6.4 item 1). */}
      {children}

      {/* deadline or "waiting for you" — wait-default gates never carry a countdown. */}
      <p data-deadline-line="true" className="ui-d-mt10 ui-d-t">
        {model.held
          ? labels.heldLine
          : model.deadline.deadlineAt == null
            ? labels.waitingLine
            : model.deadline.expired
              ? labels.expiredLine
              : labels.deadlineLine(
                  model.deadline.deadlineAt,
                  remainingLabel(model.deadline.remainingMs),
                )}
      </p>

      {/* the do-nothing sentence (§6.4 item 3). */}
      <p data-do-nothing="true" className="ui-d-mt6 ui-d-t">
        {labels.doNothingLine(model.doNothing)}
      </p>

      {/* cost so far + remaining (§6.4). */}
      <p data-spend-line="true" className="ui-d-mt6 ui-d-i">
        {labels.spendLine(model.spentCredits, model.capCredits, model.remainingEstimateCredits)}
      </p>

      {/* the presence countdown — only an auto-proceed gate with a server-set presence deadline ever
          shows it (REQ-SPEC-18); wait-default and spend/refusal cards can never reach this branch. */}
      {model.presence.active ? (
        <p
          data-presence-timer="true"
          data-paused={model.presence.paused ? "true" : "false"}
          className="ui-c2-mt ui-d-w"
        >
          {labels.presenceLine(presenceCountdown(model.presence.remainingMs ?? 0))}
          {model.presence.paused ? (
            <span data-paused-note="true" className="ui-d-t">
              {" "}
              {labels.pausedNote}
            </span>
          ) : null}
        </p>
      ) : null}

      {hasEscalations ? (
        <p data-escalation-note="true" className="ui-c2-mt ui-d-wn">
          {labels.escalationNote}
        </p>
      ) : null}

      <form method="post" action={formAction} data-gate-form="true" className="ui-c2-mt3">
        {/* P1.09 — the kind's structured editable parts (§6.4 item 4): `ed.*` fields post WITH the
            decision button, the server applies them to the artifact's sidecar + records the edit. */}
        {structured ? <GateStructuredFields kind={model.kind} structured={structured} labels={labels} compact={compact} /> : null}
        <div
          data-gate-actions="true"
          className="ui-d-acts"
          style={{ display: "flex", flexDirection: compact ? "column" : "row", flexWrap: "wrap" }}
        >
          {model.actions
            .slice()
            .sort((a, b) => ACTION_ORDER[a] - ACTION_ORDER[b])
            .map((action) => (
              <Button
                key={action}
                type="submit"
                name="action"
                value={action}
                data-action={action}
                variant={action === "approve" ? "primary" : "secondary"}
              >
                {actionLabel(action, model.kind, labels)}
              </Button>
            ))}
        </div>

        {!compact ? (
          <div className="ui-d-mt10 ui-d-g6" style={{ display: "flex", flexDirection: "column" }}>
            {runOverride ? (
              <label className="ui-d-l ui-d-g6" style={{ display: "inline-flex", alignItems: "baseline" }}>
                {runOverride.label}
                <GateSelect name="ed.runOverride" hook="data-run-override" options={runOverride.options} />
              </label>
            ) : null}
            <label className="ui-d-l">
              {labels.guidanceLabel}
              <TextField type="text" name="guidance" data-guidance="true" className="ui-os-mr" />
            </label>
            <label className="ui-d-l ui-d-g6" style={{ display: "inline-flex" }}>
              <GateCheck name="standing" value="true" hook="data-standing" />
              {labels.standingLabel}
            </label>
          </div>
        ) : null}
      </form>

      {/* P1.09 — the permanent decision record (§6.4 item 8; REQ-RUN-5/6): every resolved approval on
          this run renders one line — user-approved (with its change count), auto-continued, expired,
          or policy-skipped. Never editable, never removed. */}
      {decisions && decisions.length > 0 && labels.decisionLabel ? (
        <div data-gate-decisions="true" className="ui-d-sect">
          {labels.decisionsHeading ? (
            <span className="ui-d-i">{labels.decisionsHeading}</span>
          ) : null}
          <ul className="ui-os-ul ui-c2-g1" style={{ display: "flex", flexDirection: "column" }}>
            {decisions.map((d) => (
              <li key={d.id} data-decision={d.id} data-action={d.action} data-by={d.byActor}>
                {labels.decisionLabel!(d)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* presence pings — only an auto-proceed card carries them; a wait-default card can never arm the
          timer even if the URL were provided (the server rejects it there too). */}
      {model.autoProceed && activityUrl ? (
        <script dangerouslySetInnerHTML={{ __html: presenceScript(activityUrl) }} />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------
// ApproveTriageCard — the Approve-triage card renders the response ledger it is approving (§6.4 item 1):
// the same row list the findings UI writes, escalation-pinned, with per-row override forms. The primary
// action is "Approve proposals" (the app's `approveLabel("approve_triage")`).
// ---------------------------------------------------------------------------------------------------------

/** A row of the ledger under decision (finding + its current/proposed disposition). */
export interface TriageLedgerRow {
  readonly findingId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly severity: string;
  readonly disposition?: {
    readonly kind: string;
    readonly rationale?: string;
    /** "user" marks a row the human wrote (REQ-SPEC-9). */
    readonly actor?: string;
  };
}

export interface TriageLedgerLabels {
  /** display for a row's disposition kind ("Accept", "Rebut", …) or "Undecided". */
  readonly dispositionLabel: (kind: string | undefined) => string;
  /** the "by you" marker on a user-authored row. */
  readonly userActorLabel: string;
  /** the severity display. */
  readonly severityLabel: (severity: string) => string;
}

/** The ledger rows inside an Approve-triage card — already in §5.7 triage order (escalations first). */
export function TriageLedger({
  rows,
  labels,
  children,
}: {
  readonly rows: readonly TriageLedgerRow[];
  readonly labels: TriageLedgerLabels;
  /** per-row override controls (a compact DispositionControls form) — mounted after the row text. */
  readonly children?: (row: TriageLedgerRow) => ReactNode;
}): ReactNode {
  return (
    <ol data-triage-ledger="true" className="ui-d-mt10 ui-d-p0" style={{ listStyle: "none" }}>
      {rows.map((row) => (
        <li
          key={row.findingId}
          data-triage-row={row.findingId}
          data-ordinal={row.ordinal}
          data-disposition={row.disposition?.kind ?? "undecided"}
          data-actor={row.disposition?.actor ?? "drafter"}
          data-severity={row.severity}
          className="ui-d-row"
        >
          <span className="ui-d-i">{row.ordinal}. </span>
          <span className="ui-d-tt">{row.title}</span>{" "}
          <span className="ui-d-l">
            {labels.severityLabel(row.severity)}
          </span>{" "}
          <span data-row-disposition="true" className="ui-d-l">
            {labels.dispositionLabel(row.disposition?.kind)}
            {row.disposition?.actor === "user" ? ` · ${labels.userActorLabel}` : ""}
          </span>
          {children ? <div className="ui-d-mt6">{children(row)}</div> : null}
        </li>
      ))}
    </ol>
  );
}
