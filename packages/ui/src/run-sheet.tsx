import type { CSSProperties, ReactNode } from "react";
import type { RunSheetView } from "@rhema/run-sheet";

// The run sheet (§5.6) — the launcher, and the product's ONLY paywall (REQ-GROWTH-13) and consent gate.
// Presentational + text-agnostic: it renders a precomputed RunSheetView (from @rhema/run-sheet) plus a
// chrome-labels object the app supplies from its lint-checked COPY. Progressive enhancement: the sheet is a
// plain <form> that POSTs the Run click; an optional inline script recomputes the estimate in place on a
// lever change from the embedded lever matrix (no client bundle — REQ-BETA-21). The full-IDE sheet (P1.6)
// restyles THIS component; the contracts do not change.

// ---------------------------------------------------------------------------------------------------------
// Paywall — the single mount point (REQ-GROWTH-13: exactly one `<Paywall>`, only on the run sheet, never
// mid-run or on reading/editing/exporting). A semantic wrapper: the sheet is the one place it appears.
// ---------------------------------------------------------------------------------------------------------
export function Paywall({ children }: { children: ReactNode }): ReactNode {
  return (
    <div data-paywall="run-sheet" role="group" aria-label="Run cost and consent">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// RunButton / AskButton — the ONLY components that trigger agent work (REQ-GROWTH-16). `RunButton` REQUIRES
// an `estimate` prop (lint-enforced by eslint-plugin-rhema/require-estimate-prop): a run is never launched
// without a shown estimate. `AskButton` opens an Assistant turn (free; not a run) — no estimate.
// ---------------------------------------------------------------------------------------------------------

const buttonBase: CSSProperties = {
  padding: "9px 16px",
  borderRadius: "8px",
  border: "none",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

export interface RunButtonEstimate {
  readonly estimateCredits: number;
  readonly capCredits: number;
}

export interface RunButtonProps {
  /** the shown estimate — REQUIRED (REQ-GROWTH-16; a run is never launched without a shown estimate). */
  readonly estimate: RunButtonEstimate;
  /** the primary label ("Run review"). */
  readonly label: string;
  /** the label when a consent second click is required ("Confirm and run"). */
  readonly confirmLabel?: string;
  /** true ⇒ show the confirm label and require the deliberate second click (client-side; §5.6 item 5). */
  readonly needsSecondClick?: boolean;
  /** true ⇒ the run cannot fit (insufficient balance); the button is disabled (§5.6 item 6). */
  readonly disabled?: boolean;
}

/** The primary paywall button (REQ-GROWTH-16). Submits the sheet's form; `estimate` is required by lint. */
export function RunButton(props: RunButtonProps): ReactNode {
  const label = props.needsSecondClick && props.confirmLabel ? props.confirmLabel : props.label;
  return (
    <button
      type="submit"
      disabled={props.disabled}
      data-run-button="true"
      data-estimate-credits={props.estimate.estimateCredits}
      data-needs-consent={props.needsSecondClick ? "true" : "false"}
      data-run-label={props.label}
      data-confirm-label={props.confirmLabel ?? props.label}
      style={{
        ...buttonBase,
        background: props.disabled ? "var(--shell-raised)" : "var(--accent)",
        color: props.disabled ? "var(--shell-fg-faint)" : "var(--shell-bg)",
        cursor: props.disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

/** "Ask a question first" — opens an Assistant turn (§5.6). A trigger of agent work, but not a run: no estimate. */
export function AskButton({ label, formAction }: { label: string; formAction?: string }): ReactNode {
  return (
    <button
      type="submit"
      formAction={formAction}
      style={{ ...buttonBase, background: "var(--shell-raised)", color: "var(--shell-fg)", border: "1px solid var(--shell-border)" }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------
// RunSheet — the two-tier launcher (§5.6). Top: title line, Rigor, the dollars-first estimate box, the
// buttons. Collapsed row: the scope summary that expands to Protocol · Venue · Stage · Model tier · Advanced
// toggles with signed deltas. An insufficient balance turns the estimate box into the resolution panel.
// ---------------------------------------------------------------------------------------------------------

export interface RunSheetLabels {
  readonly rigorLegend: string;
  readonly runLabel: string;
  readonly confirmLabel: string;
  readonly askLabel: string;
  readonly changeLabel: string;
  readonly whyPrefix: string;
  readonly advancedLegend: string;
  /** display for each toggle key (app-owned, from COPY). */
  readonly toggleLabels: Readonly<Record<string, string>>;
  /** PRB.08 — the exhaustion panel's add-credits button label (opens the Payment Link). */
  readonly buyCreditsLabel?: string;
  /** PRB.08 — the suspended-account notice (a chargeback; REQ-SPEC-24.7). */
  readonly suspendedNotice?: string;
  /** PRB.08 — the final-month beta-plan offer copy + link text (copy + link only, no subscription UI). */
  readonly planOffer?: { readonly text: string; readonly linkLabel: string };
  /** PRB.10 — the voice line's chrome labels (§9.6; COPY-owned). */
  readonly voiceLabels?: {
    readonly lineLabel: string;
    readonly adHocLabel: string;
    /** "Update voice first (≈{n} cr)" — `{n}` interpolates the priced estimate. */
    readonly updateFirstFmt: string;
  };
  /** P1.06 — the collapsed-row fields' chrome labels (COPY-owned; §5.6). */
  readonly approvalsLabel?: string;
  readonly approvalsDisplay?: Readonly<Record<string, string>>;
  readonly capLabel?: string;
  readonly dontAskLabel?: string;
  readonly guidanceLabel?: string;
  readonly guidancePlaceholder?: string;
  /** "{n} standing notes apply" — beside the guidance box. */
  readonly standingNotesFmt?: string;
  /** P1.06 — the editable scope fields' labels (Protocol · Venue · Stage). */
  readonly protocolLabel?: string;
  readonly venueLabel?: string;
  readonly stageLabel?: string;
  /** the whole-draft comparison line's prefix ("Whole draft:") — scoped sheets only. */
  readonly wholeDraftPrefix?: string;
  /** the §14.3 trial badge text when the entitlement covers the run. */
  readonly includedLabel?: string;
}

export interface RunSheetProps {
  readonly view: RunSheetView;
  readonly labels: RunSheetLabels;
  /** the form action the Run click POSTs to (`/p/:slug/run`). */
  readonly runAction: string;
  /** the form action the Ask button POSTs to (the Assistant). */
  readonly askAction?: string;
  /** PRB.08 — the form action the exhaustion panel's Payment-Link button POSTs to (records
   *  `credits.exhausted_prompt{action_taken}` then 302s to the Payment Link — telemetry without JS). */
  readonly exhaustedAction?: string;
}

const boxStyle: CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: "10px",
  padding: "14px 16px",
  background: "var(--shell-raised)",
  margin: "12px 0",
};

export function RunSheet({ view, labels, runAction, askAction, exhaustedAction }: RunSheetProps): ReactNode {
  const est = view.estimate;
  const insufficient = view.insufficient;
  return (
    <form method="post" action={runAction} data-run-sheet={view.workflow}>
      <input type="hidden" name="workflow" value={view.workflow} />
      <input type="hidden" name="idempotencyKey" value={view.idempotencyKey} />
      <input type="hidden" name="estimateCredits" value={est.estimateCredits} />
      <input type="hidden" name="modelTier" value={view.modelTier} />
      {/* P1.06 (§7.2) — the command scope round-trips verbatim (canonical serialized form); the cap's
          editable field lives in the collapsed row (upward-only), so NO hidden capCredits here. */}
      {view.commandScope ? <input type="hidden" name="scope" value={view.commandScope.serialized} /> : null}
      {/* REQ-BILL-6: the run record freezes rate-table version + the word/claim counts the estimate was for. */}
      <input type="hidden" name="rateTableVersion" value={est.rateTableVersion} />
      <input type="hidden" name="words" value={view.title.words} />
      {view.title.claims != null ? <input type="hidden" name="claims" value={view.title.claims} /> : null}
      {/* PRB.23 — the sentinel listing every toggle this form rendered. An UNCHECKED checkbox
          submits no field, so the run POST cannot otherwise distinguish "user turned it off"
          from "not on this sheet": the server resolves each listed key as on/off. */}
      <input type="hidden" name="toggleKeys" value={view.toggleDeltas.map((d) => d.toggle).join(",")} />

      {/* title line: "Review v2 · 5,180 words · 21 claims" + the §7.2 scope pills (P1.06 — the typed
          @scope renders as human labels; the grammar syntax never reaches the surface). */}
      <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
        {view.title.verbLabel} {view.title.targetVersion} · {view.title.words.toLocaleString("en-US")} words
        {view.title.claims != null ? ` · ${view.title.claims.toLocaleString("en-US")} claims` : ""}
      </h2>
      {view.commandScope ? (
        <div data-command-scope style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
          {view.commandScope.labels.map((label) => (
            <span
              key={label}
              data-scope-pill
              style={{
                fontSize: "12px",
                padding: "2px 8px",
                borderRadius: "10px",
                border: "1px solid var(--shell-border)",
                background: "var(--shell-raised)",
                color: "var(--shell-fg-muted)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {/* P1.06 (§5.6 item 7) — the promote-on-launch line: a working head freezes to vN with the run. */}
      {view.promoteLine ? (
        <p data-promote-line style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>
          {view.promoteLine}
        </p>
      ) : null}

      {/* Rigor — the one first-class lever (§5.6 item 2). */}
      <fieldset style={{ border: "none", padding: 0, margin: "14px 0 0" }}>
        <legend style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{labels.rigorLegend}</legend>
        <div style={{ display: "flex", gap: "16px", marginTop: "6px" }}>
          {view.rigorOptions.map((o) => (
            <label key={o.rigor} style={{ fontSize: "14px", display: "inline-flex", gap: "6px", alignItems: "center" }}>
              <input type="radio" name="rigor" value={o.rigor} defaultChecked={o.selected} />
              {o.display}
            </label>
          ))}
        </div>
      </fieldset>

      {/* the estimate box — dollars first, credits/cap/balance second (§5.6 item 5) — OR the resolution panel. */}
      <Paywall>
        {view.suspended ? (
          <div style={boxStyle} role="alert" data-suspended="true">
            <p style={{ margin: 0, fontSize: "14px", color: "var(--sev-major)" }}>
              {labels.suspendedNotice ?? "This account is suspended while a payment dispute is open. No runs can start until it resolves."}
            </p>
          </div>
        ) : insufficient ? (
          <div style={boxStyle} role="alert" data-insufficient="true">
            {insufficient.sentences.map((s, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : "6px 0 0", fontSize: "14px", color: i === 0 ? "var(--sev-major)" : "var(--shell-fg)" }}>
                {s}
              </p>
            ))}
            {/* PRB.08 — the beta's ONE real-money channel: the Stripe Payment Link (§14.6). The button POSTs
                the whole form to the exhausted-prompt route (telemetry lands server-side, then a 302 to the
                link) — the `action_taken` value is the telemetry field. No nested form: `formAction`
                retargets this submit. */}
            {view.paymentLinkUrl && exhaustedAction ? (
              <p style={{ margin: "10px 0 0" }}>
                <button
                  type="submit"
                  formAction={exhaustedAction}
                  name="action_taken"
                  value="open_payment_link"
                  data-payment-link={view.paymentLinkUrl}
                  style={{ ...buttonBase, background: "var(--accent)", color: "var(--shell-bg)" }}
                >
                  {labels.buyCreditsLabel ?? "Add credits"}
                </button>
              </p>
            ) : null}
          </div>
        ) : view.included ? (
          /* P1.06 (§14.3; REQ-BILL-4) — the trial entitlement renders `Included`: no dollar/cap
             arithmetic, no consent click, no cap line. The entitlement covers the run. */
          <div style={boxStyle} data-estimate-box data-included="true">
            <div style={{ fontSize: "16px", fontWeight: 600 }}>
              {labels.includedLabel ?? "Included"}
              <span style={{ float: "right", color: "var(--shell-fg-muted)", fontWeight: 400 }} data-time-line>
                ~{est.time.lowMinutes}–{est.time.highMinutes} min
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "4px" }} data-entitlement-line>
              {view.entitlementLine}
            </div>
          </div>
        ) : (
          <div style={boxStyle} data-estimate-box>
            <div style={{ fontSize: "16px", fontWeight: 600 }} data-dollars-line>
              {est.dollarsLine}
              {est.provisional ? <span style={{ color: "var(--shell-fg-faint)", fontWeight: 400 }}> · refining…</span> : null}
              <span style={{ float: "right", color: "var(--shell-fg-muted)", fontWeight: 400 }} data-time-line>
                ~{est.time.lowMinutes}–{est.time.highMinutes} min
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "4px" }} data-credits-line>
              {est.creditsLine}
            </div>
            {/* P1.06 (§5.6) — the scoped sheet shows the whole-draft figure beside the scoped price. */}
            {view.commandScope?.wholeEstimateCredits != null ? (
              <div style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "4px" }} data-whole-line>
                {labels.wholeDraftPrefix ?? "Whole draft:"} ≈ ${(view.commandScope.wholeEstimateCredits / 100).toFixed(2)}
                {view.commandScope.wholeCapCredits != null
                  ? ` · cap $${(view.commandScope.wholeCapCredits / 100).toFixed(2)}`
                  : ""}
              </div>
            ) : null}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          {askAction ? <AskButton label={labels.askLabel} formAction={askAction} /> : null}
          <RunButton
            estimate={{ estimateCredits: est.estimateCredits, capCredits: est.capCredits }}
            label={labels.runLabel}
            confirmLabel={labels.confirmLabel}
            needsSecondClick={view.consent.needsSecondClick}
            disabled={!!insufficient || !!view.suspended}
          />
        </div>
      </Paywall>

      {/* PRB.08 — the final-month beta-plan offer: copy + a link only (no subscription machinery;
          REQ-BETA-14). */}
      {view.planOfferUrl && labels.planOffer ? (
        <p data-plan-offer style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }}>
          {labels.planOffer.text}{" "}
          <a href={view.planOfferUrl} style={{ color: "var(--shell-fg)" }}>{labels.planOffer.linkLabel}</a>
        </p>
      ) : null}

      {/* the obligation scope line (REQ-OBJ-6). */}
      {view.scopeLine ? (
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }} data-scope-line>
          {view.scopeLine}
        </p>
      ) : null}

      {/* P1.06 (REQ-SPEC-17's sheet half) — the scope-approval consequence at launch: informational /
          blocking-2h / waits-for-you, from the same gate-policy facts the run freezes. */}
      <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }} data-scope-approval>
        {view.scopeApprovalLine}
      </p>

      {/* PRB.10 — the voice line (§9.6): the linked persona's name + the shared pill, or the ad-hoc
          default. A stale/untested/never-built voice NEVER blocks the run; when the pill's action is
          `update_voice` the priced chained action renders beside it (its submit retargets via
          formAction — the same progressive-enhancement pattern as the exhaustion button). */}
      {view.voice && labels.voiceLabels ? (
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }} data-voice-line>
          {labels.voiceLabels.lineLabel}:{" "}
          {view.voice.mode === "ad_hoc" ? (
            <span data-voice-mode="ad_hoc">{labels.voiceLabels.adHocLabel}</span>
          ) : (
            <span data-voice-mode="linked">
              {view.voice.name ?? view.voice.personaId}
              {view.voice.pill ? (
                <>
                  {" · "}
                  <span data-voice-pill={view.voice.pill.tone}>{view.voice.pill.label}</span>
                </>
              ) : null}
            </span>
          )}
          {view.voice.updateAction && view.voice.updateEstimateCredits != null ? (
            <>
              {" · "}
              <input type="hidden" name="voice_persona" value={view.voice.personaId ?? ""} />
              <button
                type="submit"
                formAction={view.voice.updateAction}
                data-update-voice="true"
                style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "13px", padding: 0 }}
              >
                {labels.voiceLabels.updateFirstFmt.replace("{n}", String(view.voice.updateEstimateCredits))}
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {/* the collapsed row → expands to the scope summary + the editable rows (Approvals · budget cap ·
          don't-ask pref · Guidance) + Advanced per-phase toggles with signed deltas (§5.6). */}
      <details style={{ marginTop: "10px" }}>
        <summary style={{ fontSize: "13px", color: "var(--shell-fg-muted)", cursor: "pointer" }}>
          {view.collapsedSummary} · {labels.changeLabel}
        </summary>
        <div style={{ fontSize: "13px", marginTop: "8px", display: "grid", gap: "10px" }} data-sheet-fields>
          {/* the editable scope facts (§5.6 collapsed row): Protocol · Venue · Stage ride the form and
              freeze into the run's inputs — a changed protocol/venue also flips REQ-SPEC-17's
              scope gate to blocking (the api re-derives the flag server-side, never client-trusted). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.protocolLabel ?? "Protocol"}</span>
            <input type="text" name="protocol" defaultValue={view.scope.protocol} style={{ width: "180px" }} />
          </label>
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.venueLabel ?? "Venue"}</span>
            <input type="text" name="venue" defaultValue={view.scope.venue ?? ""} style={{ width: "180px" }} />
          </label>
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.stageLabel ?? "Stage"}</span>
            <input type="text" name="stage" defaultValue={view.scope.stage ?? ""} style={{ width: "180px" }} />
          </label>
          {/* Approvals — the project's policy, edited here (§5.6 collapsed row; the run POST persists it). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.approvalsLabel ?? "Approvals"}</span>
            <select name="approval" defaultValue={view.approvalPolicy}>
              {(["named", "wait_each", "run_to_completion"] as const).map((p) => (
                <option key={p} value={p}>
                  {labels.approvalsDisplay?.[p] ??
                    (p === "named" ? "Named approvals" : p === "wait_each" ? "Wait for me at each gate" : "Run to completion")}
                </option>
              ))}
            </select>
          </label>
          {/* Budget cap — editable UPWARD only (§5.6): the input's floor is the computed cap; a lower
              value can never submit (min=, and the server floors it again). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.capLabel ?? "Budget cap (credits)"}</span>
            <input
              type="number"
              name="capCredits"
              min={view.capFloorCredits}
              defaultValue={est.capCredits}
              data-cap-input
              style={{ width: "90px" }}
            />
          </label>
          {/* "Don't ask me to confirm runs under N credits" — the per-user pref (REQ-BILL-4; ≤1,000). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.dontAskLabel ?? "Confirm runs under (credits)"}</span>
            <input type="number" name="dontAskUnder" min={0} max={1000} defaultValue={view.dontAskUnder} style={{ width: "90px" }} />
          </label>
          {/* Guidance — the grammar's free-text tail, run-scope (§6.5; delivered at phase boundaries). */}
          <label style={{ display: "block" }}>
            <span style={{ color: "var(--shell-fg-muted)" }}>{labels.guidanceLabel ?? "Guidance"}</span>
            <textarea
              name="guidance"
              rows={2}
              defaultValue={view.guidance ?? ""}
              placeholder={labels.guidancePlaceholder ?? "Anything this run should know?"}
              style={{ display: "block", width: "100%", marginTop: "4px", font: "inherit", background: "var(--shell-bg)", color: "var(--shell-fg)", border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "6px 8px" }}
            />
          </label>
          {/* §5.6 — "N standing notes apply" beside the guidance box (standing guidance is server-scoped). */}
          {view.standingNotes != null && view.standingNotes > 0 ? (
            <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: 0 }} data-standing-notes>
              {labels.standingNotesFmt
                ? labels.standingNotesFmt.replace("{n}", String(view.standingNotes))
                : `${view.standingNotes} standing notes apply`}
            </p>
          ) : null}
        </div>
        {view.toggleDeltas.length > 0 ? (
          <fieldset style={{ border: "none", padding: "8px 0 0", margin: 0 }}>
            <legend style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>{labels.advancedLegend}</legend>
            {view.toggleDeltas.map((d) => (
              <label key={d.toggle} style={{ display: "block", fontSize: "13px", marginTop: "6px" }}>
                <input type="checkbox" name={`toggle.${d.toggle}`} defaultChecked={d.enabled} />{" "}
                {labels.toggleLabels[d.toggle] ?? d.toggle}{" "}
                <span style={{ color: "var(--shell-fg-faint)" }} data-delta={d.toggle}>
                  ({d.deltaLabel} credits)
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
      </details>

      {/* "Why this estimate?" (§5.6). */}
      {view.whyLine ? (
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "8px" }} data-why-line>
          {labels.whyPrefix} {view.whyLine}
        </p>
      ) : null}

      {/* Progressive enhancement (§5.6 item 2): recompute the estimate box in place on a Rigor change from
          the embedded per-rigor table (no client bundle — REQ-BETA-21). With JS off the levers still submit
          the form. Advanced toggles recompute on submit (they are under the fold). */}
      <script dangerouslySetInnerHTML={{ __html: recomputeScript(view.recompute) }} />
    </form>
  );
}

/** The inline recompute script (§5.6 item 2). Scoped to the sheet's <form>; pure DOM text swaps from the
 *  embedded per-rigor table. Formatting is the trivial $0.01/credit peg — not the estimator (that ran on the
 *  server). Numbers only in the payload; JSON.stringify keeps it injection-safe. */
function recomputeScript(recompute: RunSheetView["recompute"]): string {
  const R = JSON.stringify(recompute);
  return `(function(){var R=${R};var f=document.currentScript.closest('form');if(!f)return;
function usd(c){return '$'+(c/100).toFixed(2);}function cr(c){return Math.round(c).toLocaleString('en-US');}
function consent(e){if(R.entitlement)return false;if(e<R.dontAskUnder)return false;if(e>500)return true;return e>200&&e>0.25*R.spendableCredits;}
var ci=f.querySelector('[data-cap-input]');if(ci)ci.addEventListener('change',function(){if(Number(ci.value)<Number(ci.min))ci.value=ci.min;else ci.setAttribute('data-touched','1');});
function upd(){var sel=f.querySelector('input[name=rigor]:checked');if(!sel)return;var s=R.byRigor[sel.value];if(!s)return;
var cap=s.capCredits,est=s.estimateCredits,ba=R.spendableCredits-cap,insuf=cap>R.spendableCredits;
var d=f.querySelector('[data-dollars-line]');if(d&&!R.entitlement)d.firstChild.nodeValue='\\u2248 '+usd(est)+' \\u00b7 never more than '+usd(cap);
var cl=f.querySelector('[data-credits-line]');if(cl&&!R.entitlement)cl.textContent=cr(est)+' credits \\u00b7 cap '+cr(cap)+' \\u00b7 '+cr(ba)+' left after the cap';
var t=f.querySelector('[data-time-line]');if(t)t.textContent='~'+s.lowMinutes+'\\u2013'+s.highMinutes+' min';
var b=f.querySelector('[data-run-button]');if(b){var need=consent(est);b.textContent=need?b.getAttribute('data-confirm-label'):b.getAttribute('data-run-label');b.setAttribute('data-needs-consent',need?'true':'false');b.setAttribute('data-estimate-credits',String(est));b.disabled=insuf;}
var eh=f.querySelector('input[name=estimateCredits]');if(eh)eh.value=String(est);
var ch=f.querySelector('input[name=capCredits]');if(ch){ch.min=String(cap);if(!ch.getAttribute('data-touched'))ch.value=String(cap);else if(Number(ch.value)<cap)ch.value=String(cap);}
var mt=f.querySelector('input[name=modelTier]');if(mt&&s.modelTier)mt.value=s.modelTier;}
f.querySelectorAll('input[name=rigor]').forEach(function(r){r.addEventListener('change',upd);});})();`;
}
