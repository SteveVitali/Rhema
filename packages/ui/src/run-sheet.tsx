import type { CSSProperties, ReactNode } from "react";
import { MODEL_TIER_DISPLAY, type ModelTier } from "@rhema/contracts";
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
  /** P1.09 (§5.6) — the "this run only, autonomously" check's label (posts `autoRun`; the api freezes
   *  gates_off on THIS run — the project policy above is untouched). */
  readonly autoRunLabel?: string;
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
  /** P1.21 — the memo sheet's `user_sources` field chrome (§6.7/REQ-WF-8). */
  readonly userSourcesLabel?: string;
  readonly userSourcesHint?: string;
  readonly userSourcesPlaceholder?: string;
  /** the whole-draft comparison line's prefix ("Whole draft:") — scoped sheets only. */
  readonly wholeDraftPrefix?: string;
  /** the §14.3 trial badge text when the entitlement covers the run. */
  readonly includedLabel?: string;
  /** BILL.3 — the exhaustion panel's line while purchase is closed for the account. */
  readonly purchasePausedLabel?: string;
  /** EST.1 — the collapsed row's Model-tier select label. */
  readonly modelTierLabel?: string;
  /** EST.1 — the plan-clamp notice: "{requested} isn't on your plan — priced on {resolved}." */
  readonly tierClampedFmt?: string;
  /** EST.1 — the locked-tier suffix in the select ("(not on your plan)"). */
  readonly tierLockedSuffix?: string;
  /** EST.1 — the unmeasured-inputs state ("Estimate pending — the draft is still being counted."). */
  readonly estimatingLabel?: string;
  /** EST.1 — the resolution options' link labels, keyed by action id. */
  readonly resolutionLabels?: Readonly<Record<string, string>>;
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
  /** EST.1 — the sheet's own GET URL; the insufficient-balance resolution options link back to it
   *  with the lever applied (`?tier=base` / `?rigor=quick` / `?toggle.fact_check=off`) — a resolution
   *  is a re-render with the fitting lever, not a dead-end sentence. */
  readonly selfHref?: string;
}

const boxStyle: CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: "10px",
  padding: "14px 16px",
  background: "var(--shell-raised)",
  margin: "12px 0",
};

/** EST.1 — a resolution option's sheet re-render URL (the lever applied via the query): rigor one
 *  notch down, the Base tier, or fact-check off. `add_credits` has no href — the Payment Link button
 *  renders separately. */
function resolutionHref(base: string, view: RunSheetView, action: string): string | null {
  const q = new URLSearchParams();
  q.set("workflow", view.workflow);
  // the lever levers ride the query; every OTHER toggle keeps its current state on the re-render.
  const toggles = { ...view.leverMatrix.current.toggles };
  if (action === "lower_rigor") {
    const ladder = ["quick", "standard", "full_board"];
    q.set("rigor", ladder[Math.max(0, ladder.indexOf(view.rigor) - 1)] ?? "quick");
    q.set("tier", view.modelTier);
  } else if (action === "use_base") {
    q.set("rigor", view.rigor);
    q.set("tier", "base");
  } else if (action === "turn_off_fact_check") {
    q.set("rigor", view.rigor);
    q.set("tier", view.modelTier);
    toggles.fact_check = false;
  } else {
    return null;
  }
  for (const [k, on] of Object.entries(toggles)) q.set(`toggle.${k}`, on ? "on" : "off");
  if (view.commandScope?.serialized) q.set("scope", view.commandScope.serialized);
  return `${base}?${q.toString()}`;
}

const RESOLUTION_FALLBACK_LABELS: Record<string, string> = {
  turn_off_fact_check: "Turn off fact-check",
  use_base: "Switch to Base",
  lower_rigor: "Lower the rigor",
  add_credits: "Add credits",
};

export function RunSheet({ view, labels, runAction, askAction, exhaustedAction, selfHref }: RunSheetProps): ReactNode {
  const est = view.estimate;
  const insufficient = view.insufficient;
  return (
    <form method="post" action={runAction} data-run-sheet={view.workflow}>
      <input type="hidden" name="workflow" value={view.workflow} />
      <input type="hidden" name="idempotencyKey" value={view.idempotencyKey} />
      <input type="hidden" name="estimateCredits" value={est.estimateCredits} />
      {/* EST.1 — `modelTier` submits from the collapsed-row <select> below (the user's choice rides
          the form verbatim; the api's plan gate is the enforcer). */}
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
      {/* ECON.1 (§6.5) — the rigor these checkboxes were RENDERED for. The Advanced toggles do not
          re-render on a rigor switch (the inline script only repaints the estimate box), so a form
          rendered for Standard can submit checked discourse/second_read boxes under a Quick radio —
          the incident shape. The run POST drops the whole toggle set when the submitted rigor no
          longer matches this marker, and the api derives the submitted rigor's defaults instead:
          presets are server-derived unless the user changed a toggle for THAT rigor's render. */}
      <input type="hidden" name="toggleRigor" value={view.rigor} />
      {/* ACT.1 — the included-Review claim rides the Run form: the entitlement's row id POSTs back so
          the api's unlock gate + hold claim it. Absent when no claimable entitlement exists. */}
      {view.entitlementId ? <input type="hidden" name="entitlementId" value={view.entitlementId} /> : null}

      {/* title line: "Review v2 · 5,180 words · 21 claims" + the §7.2 scope pills (P1.06 — the typed
          @scope renders as human labels; the grammar syntax never reaches the surface). */}
      <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
        {view.title.verbLabel} {view.title.targetVersion} ·{" "}
        {est.missing ? (
          "—"
        ) : (
          <>
            {view.title.words.toLocaleString("en-US")} words
            {view.title.claims != null ? ` · ${view.title.claims.toLocaleString("en-US")} claims` : ""}
          </>
        )}
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
            {/* EST.1 — the §14.6 levers are CLICKABLE: each option re-renders the sheet with the
                lever applied (rigor ↓ / Base / fact-check off), cheapest-fitting first as primary.
                `add_credits` has no lever href — the Payment Link below is its action. */}
            {selfHref ? (
              <p style={{ margin: "8px 0 0", display: "flex", gap: "12px", flexWrap: "wrap" }} data-resolution-options>
                {insufficient.options.map((o) => {
                  const href = resolutionHref(selfHref, view, o.action);
                  if (!href) return null;
                  return (
                    <a
                      key={o.action}
                      href={href}
                      data-resolution={o.action}
                      style={{
                        fontSize: "13px",
                        color: o.primary ? "var(--accent)" : "var(--shell-fg)",
                        fontWeight: o.primary ? 600 : 400,
                      }}
                    >
                      {labels.resolutionLabels?.[o.action] ?? RESOLUTION_FALLBACK_LABELS[o.action] ?? o.action}
                    </a>
                  );
                })}
              </p>
            ) : null}
            {/* PRB.08 — the beta's ONE real-money channel: the Stripe Payment Link (§14.6). The button POSTs
                the whole form to the exhausted-prompt route (telemetry lands server-side, then a 302 to the
                link) — the `action_taken` value is the telemetry field. No nested form: `formAction`
                retargets this submit. */}
            {/* BILL.3 — purchase closed: no checkout hand-off exists to click; the paused line is the
                honest state (the exhausted POST would refuse the redirect anyway). */}
            {view.purchaseClosed ? (
              <p style={{ margin: "10px 0 0", fontSize: "13px", color: "var(--shell-fg-muted)" }} data-purchase-paused="true">
                {labels.purchasePausedLabel ?? "Purchases are paused — your balance and work are safe."}
              </p>
            ) : view.paymentLinkUrl && exhaustedAction ? (
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
        ) : est.missing ? (
          /* EST.1 — unmeasured inputs render "—" + an estimating hint (never a fabricated figure). */
          <div style={boxStyle} data-estimate-box data-estimate-missing="true">
            <div style={{ fontSize: "16px", fontWeight: 600 }} data-dollars-line>
              —
              <span style={{ float: "right", color: "var(--shell-fg-muted)", fontWeight: 400 }} data-time-line>
                ~
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "4px" }} data-credits-line>
              {labels.estimatingLabel ?? "Estimate pending — the draft is still being measured."}
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
            disabled={!!insufficient || !!view.suspended || !!est.missing}
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

      {/* P1.20 (§6.7) — the settings-page protocol-change marker on the Review's scope card. */}
      {view.protocolChangedLine ? (
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }} data-protocol-changed>
          {view.protocolChangedLine}
        </p>
      ) : null}

      {/* P1.21 (§6.7/REQ-WF-8) — the Memo confidentiality statement: user-supplied sources mount
          read-only and are never fetched over the web (enforced at the proxy, not just advised). */}
      {view.memoConfidentialityLine ? (
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }} data-memo-confidentiality>
          {view.memoConfidentialityLine}
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
            {/* P1.21 — the four §6.7 protocols render as a select when the context supplied the card
                list; a free-text input remains the no-context fallback (a typed value still works —
                the api validates the id server-side either way). */}
            {view.scope.protocolOptions && view.scope.protocolOptions.length > 0 ? (
              <select name="protocol" defaultValue={view.scope.protocol} data-protocol-select>
                {view.scope.protocolOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" name="protocol" defaultValue={view.scope.protocol} style={{ width: "180px" }} />
            )}
          </label>
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.venueLabel ?? "Venue"}</span>
            <input type="text" name="venue" defaultValue={view.scope.venue ?? ""} style={{ width: "180px" }} />
          </label>
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.stageLabel ?? "Stage"}</span>
            <input type="text" name="stage" defaultValue={view.scope.stage ?? ""} style={{ width: "180px" }} />
          </label>
          {/* EST.1 (ADR-035) — the Model-tier select: a USER choice inside plan rules. A locked tier
              renders disabled with its repriced estimate for context; the inline script repaints the
              estimate box on change (the `cells` table covers every rigor|tier|toggle state). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.modelTierLabel ?? "Model tier"}</span>
            <select name="modelTier" defaultValue={view.modelTier} data-tier-select>
              {view.modelTierOptions.map((o) => (
                <option key={o.tier} value={o.tier} disabled={!o.allowed && !o.selected}>
                  {o.display} · ≈{o.estimateCredits.toLocaleString("en-US")} cr
                  {!o.allowed ? ` ${labels.tierLockedSuffix ?? "(not on your plan)"}` : ""}
                </option>
              ))}
            </select>
          </label>
          {view.clampedFromModelTier ? (
            <p style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-faint)" }} data-tier-clamped>
              {(labels.tierClampedFmt ?? "{requested} isn't on your plan — priced on {resolved}.")
                .replace("{requested}", MODEL_TIER_DISPLAY[view.clampedFromModelTier as ModelTier] ?? view.clampedFromModelTier)
                .replace("{resolved}", view.modelTierDisplay)}
            </p>
          ) : null}
          {/* P1.21 (§6.7/REQ-GENRE-6) — the memo run's user_sources field: one `name :: url-or-text`
              per line; the api validates + freezes them and denies web fetches to their domains. */}
          {view.userSourcesField ? (
            <label style={{ display: "block" }} data-user-sources-field>
              <span style={{ color: "var(--shell-fg-muted)" }}>{labels.userSourcesLabel ?? "User sources"}</span>
              <textarea
                name="userSources"
                rows={3}
                defaultValue={view.userSourcesText ?? ""}
                placeholder={labels.userSourcesPlaceholder ?? "Q3 forecast :: https://internal.example/q3"}
                style={{ display: "block", width: "100%", marginTop: "4px", font: "inherit", background: "var(--shell-bg)", color: "var(--shell-fg)", border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "6px 8px" }}
              />
              <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                {labels.userSourcesHint ?? "One per line — name :: url or name :: pasted text (up to 8). Never fetched over the web."}
              </span>
            </label>
          ) : null}
          {/* Approvals — the project's policy, edited here (§5.6 collapsed row; the run POST persists it). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>{labels.approvalsLabel ?? "Approvals"}</span>
            <select name="approval" defaultValue={view.approvalPolicy}>
              {(["named", "wait_each", "run_to_completion"] as const).map((p) => (
                <option key={p} value={p}>
                  {labels.approvalsDisplay?.[p] ??
                    (p === "named" ? "Named approvals" : p === "wait_each" ? "Wait for me at each approval" : "Run to completion")}
                </option>
              ))}
            </select>
          </label>
          {/* P1.09 — the per-run override ("this run only, autonomously"): freezes gates_off on THIS
              run — named approvals skip by policy; spend/refusal cards still wait (REQ-SPEC-1). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }} data-auto-run="true">
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}></span>
            <input type="checkbox" name="autoRun" />
            <span style={{ fontSize: "13px" }}>{labels.autoRunLabel ?? "This run only — run it to completion"}</span>
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
      {/* SPA.6 (REQ-VFY-4): the same lever matrix as a typed JSON embed — the renderer-agnostic
          read the journeys (and later the SPA's lever-recompute) share; the `var R=` script above
          stays the no-bundle progressive enhancement. Numbers/keys only (JSON.stringify output). */}
      <script
        type="application/json"
        data-estimate-matrix="true"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(view.recompute) }}
      />
    </form>
  );
}

/** The inline recompute script (§5.6 item 2). Scoped to the sheet's <form>; pure DOM text swaps from the
 *  embedded FULL lever matrix (`cells`, keyed `rigor|tier|on-toggles` — EST.1: tier is a user lever, so
 *  a tier change repaints in place like a rigor change, and a rigor change KEEPS the chosen tier —
 *  ADR-035). Formatting is the trivial $0.01/credit peg — not the estimator (that ran on the server).
 *  Numbers only in the payload; JSON.stringify keeps it injection-safe. */
function recomputeScript(recompute: RunSheetView["recompute"]): string {
  const R = JSON.stringify(recompute);
  return `(function(){var R=${R};var f=document.currentScript.closest('form');if(!f)return;
function usd(c){return '$'+(c/100).toFixed(2);}function cr(c){return Math.round(c).toLocaleString('en-US');}
function consent(e){if(R.entitlement)return false;if(e<R.dontAskUnder)return false;if(e>500)return true;return e>200&&e>0.25*R.spendableCredits;}
var ci=f.querySelector('[data-cap-input]');if(ci)ci.addEventListener('change',function(){if(Number(ci.value)<Number(ci.min))ci.value=ci.min;else ci.setAttribute('data-touched','1');});
function onT(){var o=[];f.querySelectorAll('input[name^="toggle."]').forEach(function(b){if(b.checked)o.push(b.name.slice(7));});o.sort();return o.join(',');}
function cell(rig,tier){return R.cells[rig+'|'+tier+'|'+onT()];}
function upd(){var sel=f.querySelector('input[name=rigor]:checked');if(!sel)return;
var ts=f.querySelector('select[name=modelTier]');var tier=ts?ts.value:R.modelTier;
var s=cell(sel.value,tier);if(!s)return;
var cap=s.c,est=s.e,ba=R.spendableCredits-cap,insuf=cap>R.spendableCredits;
var d=f.querySelector('[data-dollars-line]');if(d&&!R.entitlement)d.firstChild.nodeValue='\\u2248 '+usd(est)+' \\u00b7 never more than '+usd(cap);
var cl=f.querySelector('[data-credits-line]');if(cl&&!R.entitlement)cl.textContent=cr(est)+' credits \\u00b7 cap '+cr(cap)+' \\u00b7 '+cr(ba)+' left after the cap';
var t=f.querySelector('[data-time-line]');if(t)t.textContent='~'+s.lo+'\\u2013'+s.hi+' min';
var b=f.querySelector('[data-run-button]');if(b){var need=consent(est);b.textContent=need?b.getAttribute('data-confirm-label'):b.getAttribute('data-run-label');b.setAttribute('data-needs-consent',need?'true':'false');b.setAttribute('data-estimate-credits',String(est));b.disabled=insuf;}
var eh=f.querySelector('input[name=estimateCredits]');if(eh)eh.value=String(est);
var ch=f.querySelector('input[name=capCredits]');if(ch){ch.min=String(cap);if(!ch.getAttribute('data-touched'))ch.value=String(cap);else if(Number(ch.value)<cap)ch.value=String(cap);}}
f.querySelectorAll('input[name=rigor]').forEach(function(r){r.addEventListener('change',upd);});
var ts2=f.querySelector('select[name=modelTier]');if(ts2)ts2.addEventListener('change',upd);
f.querySelectorAll('input[name^="toggle."]').forEach(function(b){b.addEventListener('change',upd);});})();`;
}
