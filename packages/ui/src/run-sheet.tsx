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
}

export interface RunSheetProps {
  readonly view: RunSheetView;
  readonly labels: RunSheetLabels;
  /** the form action the Run click POSTs to (`/p/:slug/run`). */
  readonly runAction: string;
  /** the form action the Ask button POSTs to (the Assistant). */
  readonly askAction?: string;
}

const boxStyle: CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: "10px",
  padding: "14px 16px",
  background: "var(--shell-raised)",
  margin: "12px 0",
};

export function RunSheet({ view, labels, runAction, askAction }: RunSheetProps): ReactNode {
  const est = view.estimate;
  const insufficient = view.insufficient;
  return (
    <form method="post" action={runAction} data-run-sheet={view.workflow}>
      <input type="hidden" name="workflow" value={view.workflow} />
      <input type="hidden" name="idempotencyKey" value={view.idempotencyKey} />
      <input type="hidden" name="estimateCredits" value={est.estimateCredits} />
      <input type="hidden" name="capCredits" value={est.capCredits} />
      <input type="hidden" name="modelTier" value={view.modelTier} />
      {/* REQ-BILL-6: the run record freezes rate-table version + the word/claim counts the estimate was for. */}
      <input type="hidden" name="rateTableVersion" value={est.rateTableVersion} />
      <input type="hidden" name="words" value={view.title.words} />
      {view.title.claims != null ? <input type="hidden" name="claims" value={view.title.claims} /> : null}

      {/* title line: "Review v2 · 5,180 words · 21 claims" */}
      <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
        {view.title.verbLabel} {view.title.targetVersion} · {view.title.words.toLocaleString("en-US")} words
        {view.title.claims != null ? ` · ${view.title.claims.toLocaleString("en-US")} claims` : ""}
      </h2>

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
        {insufficient ? (
          <div style={boxStyle} role="alert" data-insufficient="true">
            {insufficient.sentences.map((s, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : "6px 0 0", fontSize: "14px", color: i === 0 ? "var(--sev-major)" : "var(--shell-fg)" }}>
                {s}
              </p>
            ))}
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
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          {askAction ? <AskButton label={labels.askLabel} formAction={askAction} /> : null}
          <RunButton
            estimate={{ estimateCredits: est.estimateCredits, capCredits: est.capCredits }}
            label={labels.runLabel}
            confirmLabel={labels.confirmLabel}
            needsSecondClick={view.consent.needsSecondClick}
            disabled={!!insufficient}
          />
        </div>
      </Paywall>

      {/* the obligation scope line (REQ-OBJ-6). */}
      {view.scopeLine ? (
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }} data-scope-line>
          {view.scopeLine}
        </p>
      ) : null}

      {/* the collapsed row → expands to the scope summary + Advanced per-phase toggles with signed deltas. */}
      <details style={{ marginTop: "10px" }}>
        <summary style={{ fontSize: "13px", color: "var(--shell-fg-muted)", cursor: "pointer" }}>
          {view.collapsedSummary} · {labels.changeLabel}
        </summary>
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
function upd(){var sel=f.querySelector('input[name=rigor]:checked');if(!sel)return;var s=R.byRigor[sel.value];if(!s)return;
var cap=s.capCredits,est=s.estimateCredits,ba=R.spendableCredits-cap,insuf=cap>R.spendableCredits;
var d=f.querySelector('[data-dollars-line]');if(d)d.firstChild.nodeValue='\\u2248 '+usd(est)+' \\u00b7 never more than '+usd(cap);
var cl=f.querySelector('[data-credits-line]');if(cl)cl.textContent=cr(est)+' credits \\u00b7 cap '+cr(cap)+' \\u00b7 '+cr(ba)+' left after the cap';
var t=f.querySelector('[data-time-line]');if(t)t.textContent='~'+s.lowMinutes+'\\u2013'+s.highMinutes+' min';
var b=f.querySelector('[data-run-button]');if(b){var need=consent(est);b.textContent=need?b.getAttribute('data-confirm-label'):b.getAttribute('data-run-label');b.setAttribute('data-needs-consent',need?'true':'false');b.setAttribute('data-estimate-credits',String(est));b.disabled=insuf;}
var eh=f.querySelector('input[name=estimateCredits]');if(eh)eh.value=String(est);var ch=f.querySelector('input[name=capCredits]');if(ch)ch.value=String(cap);
var mt=f.querySelector('input[name=modelTier]');if(mt&&s.modelTier)mt.value=s.modelTier;}
f.querySelectorAll('input[name=rigor]').forEach(function(r){r.addEventListener('change',upd);});})();`;
}
