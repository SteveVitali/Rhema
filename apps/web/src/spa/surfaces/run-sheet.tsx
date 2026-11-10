// SPA.20 — the `run-sheet` surface leaf (design/22 §2 `p.run` aggregate + §7.3; REQ-BFF-1..12,
// REQ-BFF-23, REQ-SEQ-6/12, REQ-UX-16, REQ-VFY-4). Ports `RunSheetPage` (pages.tsx) + `RunSheet`
// (ui/run-sheet.tsx) verbatim onto `GET /bff/p/:slug/run` — the same `data-run-sheet`/`data-paywall`/
// `data-estimate-*` vocabulary, the same insufficient/included/suspended/missing arms, the same
// phone-width suppression (§10.1 — boot-owned `deviceClass`, never the twin's).
//
//   • The `var R=` progressive-enhancement script is replaced by React state: a rigor / model-tier /
//     `toggle.*` change repaints the estimate box off `view.recompute.cells` — the IDENTICAL
//     key-lookup + `$0.01`/credit formatting arithmetic, now declarative (design/22's F13 ruling;
//     the estimator never enters the bundle). The typed `data-estimate-matrix` embed stays — the
//     journey probes read it renderer-agnostically.
//   • The Run click posts the SAME flat field map (workflow/rigor/tier/toggle.*/scope/guidance/
//     consent pref/…) as a JSON `wantsJson` branch on `POST /p/:slug/run`; `{ok,data:{runId}}`
//     lands the started confirmation; the api's stable refusal codes (`run_in_progress`,
//     `insufficient_balance`, `trial_*`…) repaint server truth off the invalidated twin + the
//     same COPY notice leaves the SSR re-render arms carry.
//   • The exhaustion panel's Payment-Link button POSTs `/p/:slug/exhausted` as JSON — `{ok,url}`
//     is the allowlist-validated Stripe hand-off (document-navigated; `url` is never opened
//     in-router), `{ok,redirect:"…?notice=purchase_paused"}` the closed-switch arm.
//   • `?notice=purchase_paused` stays URL flash state — validated search, never payload.

// R7KIT.3b (REQ-KIT-3 batch b, REQ-GUARD-1, REQ-COPY-5): the sheet renders on the 225/225a
// primitives (Button / Checkbox / RadioGroup / Select / TextField / TextArea) with `uiCss()`
// classes — every number routes through the ONE `@rhema/contracts` formatter.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  Button,
  Checkbox,
  PageTitle,
  RadioGroup,
  RadioGroupItem,
  Select,
  TextArea,
  TextField,
} from "@rhema/ui";
import {
  CONSENT_ABSOLUTE_CREDITS,
  CONSENT_BALANCE_FRACTION,
  CONSENT_PCT_FLOOR_CREDITS,
  MODEL_TIER_DISPLAY,
  PRICING,
  creditsLine,
  estimateLine,
  formatCredits,
  formatUsd,
  type ModelTier,
  type Rigor,
} from "@rhema/contracts";
import type { RunSheetView } from "@rhema/run-sheet";
import { COPY } from "../../copy.js";
import { runLabelFor, runSheetCopy, runSheetLabels, runSheetVoiceLabels } from "../../run-sheet-labels.js";
import { BffError, bffFetch } from "../bff.js";
import { navigateDocument } from "../dom.js";
import { useShellChrome } from "../ide/chrome-data.js";
import type { BffRunSheetTwin } from "../queries.js";

const R = runSheetCopy;

/** Replace `{key}` placeholders in a copy template with string/number values. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** The dual-mode mutation envelope's narrow read (`{ok, redirect?, url?, data?}`). */
interface MutationReply {
  readonly ok?: boolean;
  readonly redirect?: string;
  readonly url?: string;
  readonly data?: { readonly runId?: string; readonly state?: string };
}

/** REQ-UX-16's in-flight affordance — `aria-busy` on the form + disabled controls, restored on
 *  settle (the outline.tsx precedent — imperative because the field map stays form-native). */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

/** The form's named fields as a flat `{name: value}` map — the FormData grammar without the
 *  wrapper (outline.tsx's collector verbatim): unchecked checkboxes/radios and disabled controls
 *  contribute nothing, so an unchecked `toggle.*` posts nothing and the server's `toggleKeys`
 *  sentinel still resolves the explicit OFF. Read BEFORE any busy-disable pass. */
function collectJsonFields(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of form.querySelectorAll("input, select, textarea")) {
    const name = el.getAttribute("name");
    if (name == null || name === "") continue;
    if (el instanceof HTMLInputElement) {
      if (el.disabled) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) out[name] = el.value === "" ? "on" : el.value;
        continue;
      }
      out[name] = el.value;
      continue;
    }
    if ((el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && !el.disabled) {
      out[name] = el.value;
    }
  }
  return out;
}

/** P1.19's phone-width note — verbatim from pages.tsx `PhoneBlockedNote`. */
function PhoneBlockedNote(): ReactNode {
  return (
    <p data-phone-blocked="true" className="ui-set-t ui-set-t--m ui-set-t--meas">
      {COPY.phoneBlocked.note}
    </p>
  );
}

/**
 * The no-JS form grammar's hidden carrier — GUARD-1's named exemption owns this one component
 * (Radix's own hidden radio/checkbox/select carriers post the named lever fields; the id/scope/
 * counter carriers it does not own ride this, RV-36).
 */
function HiddenField({
  name,
  value,
}: {
  readonly name: string;
  readonly value: string | number;
}): ReactNode {
  return <input type="hidden" name={name} value={value} />;
}

const RESOLUTION_FALLBACK_LABELS: Record<string, string> = {
  turn_off_fact_check: "Turn off fact-check",
  use_base: "Switch to Base",
  lower_rigor: "Lower the rigor",
  add_credits: "Add credits",
};

/** EST.1 — a resolution option's sheet re-render URL (the lever applied via the query) — verbatim
 *  from ui/run-sheet.tsx `resolutionHref`; in the SPA the anchor is an in-router nav to the same
 *  `?rigor=`/`?tier=`/`toggle.*` URL the document's link carried. */
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

/** The SSR `var R=` script's consent formula verbatim (§5.6 item 5; REQ-BILL-4) — the thresholds
 *  are the @rhema/contracts constants, never literals. */
function needsSecondClick(estimateCredits: number, recompute: RunSheetView["recompute"]): boolean {
  if (recompute.entitlement) return false;
  if (estimateCredits < recompute.dontAskUnder) return false;
  if (estimateCredits > CONSENT_ABSOLUTE_CREDITS) return true;
  return (
    estimateCredits > CONSENT_PCT_FLOOR_CREDITS &&
    estimateCredits > CONSENT_BALANCE_FRACTION * recompute.spendableCredits
  );
}

/** `leverKey(rigor, tier, toggles)` without importing the run-sheet package's estimator surface —
 *  the key is `rigor|tier|sorted-enabled-toggles` (lever-matrix.ts:52), rederived here so the
 *  bundle carries the string join only. */
function cellKey(rigor: string, tier: string, toggles: Record<string, boolean>): string {
  const on = Object.keys(toggles)
    .filter((k) => toggles[k])
    .sort()
    .join(",");
  return `${rigor}|${tier}|${on}`;
}

/** The POSTed refusal → the COPY leaf the SSR re-render arm would have shown (server.ts's
 *  `noticeByCode` + the 402/403 arms verbatim). */
function refusalNotice(err: unknown): string | null {
  if (!(err instanceof BffError)) return null;
  const noticeByCode: Record<string, string> = {
    insufficient_balance: R.insufficient,
    trial_denied: R.trialDenied,
    phone_challenge_required: R.trialPhoneChallenge,
    trial_ceiling: R.trialCeiling,
    entitlement_unavailable: R.entitlementUnavailable,
    trial_shape: R.trialShape,
    // ACT.1 — the word-cap arm interpolates the CONFIGURED cap (the api's own claim-time read).
    trial_word_cap: fmt(R.trialWordCapFmt, { cap: String(PRICING.trial.entitlement.wordCap) }),
    email_unverified: R.emailUnverified,
    account_suspended: R.suspended,
  };
  return noticeByCode[err.code ?? ""] ?? null;
}

export interface RunSheetSurfaceProps {
  /** the `GET /bff/p/:slug/run` aggregate twin (view-as-DTO + the chrome shell bag). */
  readonly data: BffRunSheetTwin;
  /** the `?notice=` flash's mapped copy leaf (URL state — `purchase_paused` is the only code). */
  readonly notice?: string;
  /** §10.1's phone verdict — boot-owned `deviceClass`, ANDed like the document's `isPhoneRequest`. */
  readonly compact: boolean;
  /** the leaf's search fingerprint — a lever-deep-link change remounts the form off server truth. */
  readonly contentKey: string;
}

/**
 * The §5.6 run sheet on the BFF twin — heading, lede, the Revise pretriage line, the started
 * confirmation, the notice rail, the in-progress arm, then the controlled form below.
 */
export function RunSheetSurface({ data, notice, compact, contentKey }: RunSheetSurfaceProps): ReactNode {
  useShellChrome(data);
  const { runSheet, pretriage } = data;
  const [started, setStarted] = useState<{ runId?: string; state?: string } | null>(null);
  const [mutNotice, setMutNotice] = useState<string | null>(null);
  const slug = runSheet.slug;
  return (
    <div data-spa-surface>
      <PageTitle>{R.heading}</PageTitle>
      {/* E1 dedup + R6MNY.1 (REQ-LCH-5a) — one paragraph: the rigor lede plus the metered-charge
          explanation (the "never more than the cap" claim appears once, in meteredNote). */}
      <p className="ui-set-t ui-set-t--m ui-set-t--meas">
        {R.lede} {R.meteredNote}
      </p>
      {pretriage && runSheet.view.workflow === "revise" ? (
        <p data-pretriage-line="true" className="ui-set-t ui-set-t--m">
          {fmt(COPY.triage.pretriageFmt, { n: pretriage.triaged, m: pretriage.total })}
        </p>
      ) : null}
      {started ? (
        <p role="status" className="ui-set-t ui-set-t--ok">
          {R.started}
        </p>
      ) : null}
      {notice != null ? (
        <p role="alert" className="ui-set-t ui-set-t--warn">
          {notice}
        </p>
      ) : mutNotice !== null ? (
        <p role="alert" className="ui-set-t ui-set-t--warn">
          {mutNotice}
        </p>
      ) : null}
      {runSheet.activeRun ? (
        // PRB.21 / D-PRB.20-1 — a non-terminal run exists ⇒ the in-progress state REPLACES the Run
        // affordance (the api 409s a second create; this is the honest first screen + its link).
        <section className="ui-set-t--meas">
          <p role="status" className="ui-set-t ui-set-t--lead">
            {R.inProgress}
          </p>
          {runSheet.activeRun.runId !== "" ? (
            <p className="ui-set-t">
              <a href={`/p/${slug}/review/${runSheet.activeRun.runId}`}>{R.openRun}</a>
            </p>
          ) : null}
        </section>
      ) : null}
      {/* P1.19 — §10.1 ✗: run-start + run configuration never render at phone width — the compact
          read keeps the in-progress note and drops the sheet. */}
      {compact === true && runSheet && !runSheet.activeRun ? (
        <PhoneBlockedNote />
      ) : runSheet && !runSheet.activeRun ? (
        <SpaRunSheetForm
          key={contentKey}
          view={runSheet.view}
          slug={slug}
          onStarted={setStarted}
          onNotice={setMutNotice}
        />
      ) : null}
    </div>
  );
}

/**
 * The controlled sheet — ui/run-sheet.tsx `RunSheet` markup verbatim, with the `var R=` island's
 * repaint moved into React state: `rigor`/`tier`/`toggles` hold the CURRENT lever pick, and every
 * painted figure/cap/consent verdict derives from `recompute.cells[key]` — the same arithmetic the
 * script ran. `leverDirty` gates the repaint so the initial render is byte-for-byte the server's.
 */
function SpaRunSheetForm({
  view,
  slug,
  onStarted,
  onNotice,
}: {
  readonly view: RunSheetView;
  readonly slug: string;
  readonly onStarted: (s: { runId?: string; state?: string }) => void;
  readonly onNotice: (n: string | null) => void;
}): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement | null>(null);
  // The submit's retarget — a `formAction` button (the exhausted Payment-Link / the priced
  // update-voice) overrides the form's own action, exactly like the no-JS submit.
  const submitActionRef = useRef<string | null>(null);

  const labels = {
    ...runSheetLabels,
    runLabel: runLabelFor[view.workflow] ?? R.runReview,
    voiceLabels: runSheetVoiceLabels,
  };
  const est = view.estimate;
  const R0 = view.recompute;

  const [rigor, setRigor] = useState<Rigor>(view.rigor);
  const [tier, setTier] = useState<ModelTier>(view.modelTier);
  const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(view.toggleDeltas.map((d) => [d.toggle, d.enabled])),
  );
  const [leverDirty, setLeverDirty] = useState(false);
  const [capText, setCapText] = useState<string>(String(est.capCredits));
  const [capTouched, setCapTouched] = useState(false);

  const cell = R0.cells[cellKey(rigor, tier, toggles)];
  const repainted = leverDirty && cell != null;
  const shown = {
    e: repainted ? cell.e : est.estimateCredits,
    c: repainted ? cell.c : est.capCredits,
    lo: repainted ? cell.lo : est.time.lowMinutes,
    hi: repainted ? cell.hi : est.time.highMinutes,
  };
  // The script's own arithmetic: `insuf = cap > spendable` on a repaint; the server-computed
  // `view.insufficient` carries the initial state. `suspended`/`missing` stay sticky-disabled —
  // the script's overwrite was a re-enable bug the controlled version deliberately does not port.
  const insufficientNow = repainted ? shown.c > R0.spendableCredits : !!view.insufficient;
  const runDisabled = !!view.suspended || !!est.missing || insufficientNow;
  const consent = repainted ? needsSecondClick(shown.e, R0) : view.consent.needsSecondClick;
  const dollarsText = repainted && !R0.entitlement ? estimateLine(shown.e, shown.c) : est.dollarsLine;
  const creditsText =
    repainted && !R0.entitlement
      ? creditsLine(shown.e, shown.c, R0.spendableCredits - shown.c)
      : est.creditsLine;
  const capShown = capTouched ? capText : String(shown.c);

  const runMutation = useMutation<MutationReply, unknown, { form: HTMLFormElement; action: string; json: Record<string, string> }>({
    mutationFn: async ({ action, json }) => {
      return bffFetch<MutationReply>(action, { method: "POST", json });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env, vars) => {
      if (env.url != null) {
        // The Stripe Payment Link hand-off — a real document navigation (never in-router;
        // `navigateDocument` is the one seam, already allowlist-validated server-side).
        navigateDocument(env.url);
        return;
      }
      if (env.redirect != null) {
        void router.navigate({ href: env.redirect });
        return;
      }
      if (vars.action.endsWith("/run")) {
        onStarted(env.data ?? {});
      }
    },
    onError: (err) => {
      // `run_in_progress`/`insufficient_balance`/the trial refusals — the server's stable codes
      // already carry the verdict; the notice rail takes the SSR arm's COPY leaf, and the
      // invalidated twin repaints the honest state (active run / insufficient panel / no
      // entitlement) — server truth, never a client re-derivation.
      onNotice(refusalNotice(err));
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff", "p", slug] });
      submitActionRef.current = null;
    },
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (form.getAttribute("aria-busy") === "true") return;
    const action = submitActionRef.current ?? form.getAttribute("action") ?? "";
    const json = collectJsonFields(form);
    if (action.includes("/exhausted")) {
      // the Payment-Link submit — `action_taken` rides on the clicked button, not a form field.
      json["action_taken"] = "open_payment_link";
    } else if (action.endsWith("/run")) {
      // The cap's upward-only floor — the script's `ch.value` clamp, applied at submit so typing
      // stays free (REQ-BILL-7: a run never gets a cap below its estimate).
      const n = Number(json["capCredits"]);
      json["capCredits"] = String(Number.isFinite(n) ? Math.max(n, shown.c) : shown.c);
      json["estimateCredits"] = String(shown.e);
    }
    runMutation.mutate({ form, action, json });
  };

  /** A `formAction` button's click records its retarget BEFORE the submit event lands. */
  const trackAction = (e: ReactMouseEvent<HTMLElement>) => {
    submitActionRef.current = e.currentTarget.getAttribute("formaction");
  };

  return (
    <form
      ref={formRef}
      method="post"
      action={`/p/${slug}/run`}
      data-run-sheet={view.workflow}
      onSubmit={onSubmit}
    >
      <HiddenField name="workflow" value={view.workflow} />
      <HiddenField name="idempotencyKey" value={view.idempotencyKey} />
      {/* the repainted estimate posts — the script's `eh.value=String(est)` update. */}
      <HiddenField name="estimateCredits" value={String(shown.e)} />
      {/* EST.1 — `modelTier` submits from the collapsed-row <select> below (the user's choice rides
          the form verbatim; the api's plan gate stays the enforcer). */}
      {/* P1.06 (§7.2) — the command scope round-trips verbatim (canonical serialized form); the cap's
          editable field lives in the collapsed row (upward-only), so NO hidden capCredits here. */}
      {view.commandScope ? (
        <HiddenField name="scope" value={view.commandScope.serialized} />
      ) : null}
      {/* REQ-BILL-6: the run record freezes rate-table version + the word/claim counts the estimate was for. */}
      <HiddenField name="rateTableVersion" value={est.rateTableVersion} />
      <HiddenField name="words" value={view.title.words} />
      {view.title.claims != null ? (
        <HiddenField name="claims" value={view.title.claims} />
      ) : null}
      {/* PRB.23 — the sentinel listing every toggle this form rendered. An UNCHECKED checkbox
          submits no field, so the run POST cannot otherwise distinguish "user turned it off"
          from "not on this sheet": the server resolves each listed key as on/off. */}
      <HiddenField name="toggleKeys" value={view.toggleDeltas.map((d) => d.toggle).join(",")} />
      {/* ECON.1 (§6.5) — the rigor these checkboxes were RENDERED for (the twin's resolved rigor —
          the lever pick can move without re-rendering the boxes, so a stale-marked set drops
          server-side exactly like the form post). */}
      <HiddenField name="toggleRigor" value={view.rigor} />
      {/* ACT.1 — the included-Review claim rides the Run form: the entitlement's row id POSTs back so
          the api's unlock gate + hold claim it. Absent when no claimable entitlement exists. */}
      {view.entitlementId ? (
        <HiddenField name="entitlementId" value={view.entitlementId} />
      ) : null}

      {/* title line: "Review v2 · 5,180 words · 21 claims" + the §7.2 scope pills (P1.06 — the typed
          @scope renders as human labels; the grammar syntax never reaches the surface). */}
      <h2 className="ui-set-h2 ui-rs-h">
        {view.title.verbLabel} {view.title.targetVersion} ·{" "}
        {est.missing ? (
          "—"
        ) : (
          <>
            {formatCredits(view.title.words)} words
            {view.title.claims != null
              ? ` · ${formatCredits(view.title.claims)} claims`
              : ""}
          </>
        )}
      </h2>
      {view.commandScope ? (
        <div data-command-scope className="ui-set-form ui-rs-mt">
          {view.commandScope.labels.map((label) => (
            <span key={label} data-scope-pill className="ui-pill ui-rs-pill">
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {/* P1.06 (§5.6 item 7) — the promote-on-launch line: a working head freezes to vN with the run. */}
      {view.promoteLine ? (
        <p data-promote-line className="ui-set-note ui-set-t--f">
          {view.promoteLine}
        </p>
      ) : null}

      {/* Rigor — the one first-class lever (§5.6 item 2). */}
      <fieldset className="ui-set-fs">
        <legend>{labels.rigorLegend}</legend>
        <RadioGroup
          name="rigor"
          value={rigor}
          onValueChange={(v) => {
            setRigor(v as Rigor);
            setLeverDirty(true);
          }}
          className="ui-set-form"
          aria-label={labels.rigorLegend}
        >
          {view.rigorOptions.map((o) => (
            <label key={o.rigor} className="ui-rs-radio">
              <RadioGroupItem value={o.rigor} aria-label={o.display} />
              {o.display}
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      {/* the estimate box — dollars first, credits/cap/balance second (§5.6 item 5) — OR the resolution panel. */}
      <div data-paywall="run-sheet" role="group" aria-label={R.paywallAriaLabel}>
        {(() => {
          if (view.suspended) return (
          <div className="ui-set-card ui-rs-box" role="alert" data-suspended="true">
            <p className="ui-set-t ui-set-t--warn">
              {labels.suspendedNotice ??
                "This account is suspended while a payment dispute is open. No runs can start until it resolves."}
            </p>
          </div>
          );
          if (view.insufficient) return (
          <div className="ui-set-card ui-rs-box" role="alert" data-insufficient="true">
            {view.insufficient.sentences.map((s, i) => (
              <p
                key={i}
                className={i === 0 ? "ui-set-t ui-set-t--warn" : "ui-set-t ui-rs-mt"}
              >
                {s}
              </p>
            ))}
            {/* EST.1 — the §14.6 levers are CLICKABLE: each option re-renders the sheet with the
                lever applied (rigor ↓ / Base / fact-check off), cheapest-fitting first as primary.
                `add_credits` has no lever href — the Payment Link below is its action. */}
            <p className="ui-set-form ui-rs-mt" data-resolution-options>
              {view.insufficient.options.map((o) => {
                const href = resolutionHref(`/p/${slug}/run`, view, o.action);
                if (!href) return null;
                return (
                  <a
                    key={o.action}
                    href={href}
                    data-resolution={o.action}
                    className={o.primary ? "ui-vc-acc ui-rs-bold" : "ui-vc-link"}
                  >
                    {labels.resolutionLabels?.[o.action] ??
                      RESOLUTION_FALLBACK_LABELS[o.action] ??
                      o.action}
                  </a>
                );
              })}
            </p>
            {/* PRB.08 — the beta's ONE real-money channel: the Stripe Payment Link (§14.6). The click
                POSTs the exhausted route as JSON (telemetry lands server-side, then the `{ok,url}`
                hand-off navigates the document) — the `action_taken` value is the telemetry field. */}
            {/* BILL.3 — purchase closed: no checkout hand-off exists to click; the paused line is the
                honest state (the exhausted POST would refuse the redirect anyway). */}
            {(() => {
              if (view.purchaseClosed) return (
              <p className="ui-set-t ui-set-t--m ui-rs-mt" data-purchase-paused="true">
                {labels.purchasePausedLabel ?? "Purchases are paused — your balance and work are safe."}
              </p>
              );
              if (view.paymentLinkUrl) return (
              <p className="ui-set-t ui-rs-mt">
                <Button
                  type="submit"
                  variant="primary"
                  formAction={`/p/${slug}/exhausted`}
                  name="action_taken"
                  value="open_payment_link"
                  onClick={trackAction}
                  data-payment-link={view.paymentLinkUrl}
                >
                  {labels.buyCreditsLabel ?? "Add credits"}
                </Button>
              </p>
              );
              return null;
            })()}
          </div>
          );
          if (view.included) return (
          /* P1.06 (§14.3; REQ-BILL-4) — the trial entitlement renders `Included`: no dollar/cap
             arithmetic, no consent click, no cap line. The entitlement covers the run. */
          <div className="ui-set-card ui-rs-box" data-estimate-box data-included="true">
            <div className="ui-bill-head ui-rs-h">
              {labels.includedLabel ?? "Included"}
              <span className="ui-rs-time" data-time-line>
                ~{shown.lo}–{shown.hi} min
              </span>
            </div>
            <div className="ui-set-t ui-set-t--m ui-rs-mt" data-entitlement-line>
              {view.entitlementLine}
            </div>
          </div>
          );
          if (est.missing) return (
          /* EST.1 — unmeasured inputs render "—" + an estimating hint (never a fabricated figure). */
          <div className="ui-set-card ui-rs-box" data-estimate-box data-estimate-missing="true">
            <div className="ui-bill-head ui-rs-h" data-dollars-line>
              {repainted && !R0.entitlement ? dollarsText : "—"}
              <span className="ui-rs-time" data-time-line>
                ~{repainted ? `${shown.lo}–${shown.hi} min` : "~"}
              </span>
            </div>
            <div className="ui-set-t ui-set-t--m ui-rs-mt" data-credits-line>
              {repainted && !R0.entitlement
                ? creditsText
                : labels.estimatingLabel ?? "Estimate pending — the draft is still being measured."}
            </div>
          </div>
          );
          return (
          <div className="ui-set-card ui-rs-box" data-estimate-box>
            <div className="ui-bill-head ui-rs-h" data-dollars-line>
              {dollarsText}
              {est.provisional ? (
                <span className="ui-rs-time">{R.refiningSuffix}</span>
              ) : null}
              <span className="ui-rs-time" data-time-line>
                ~{shown.lo}–{shown.hi} min
              </span>
            </div>
            <div className="ui-set-t ui-set-t--m ui-rs-mt" data-credits-line>
              {creditsText}
            </div>
            {/* P1.06 (§5.6) — the scoped sheet shows the whole-draft figure beside the scoped price. */}
            {view.commandScope?.wholeEstimateCredits != null ? (
              <div className="ui-set-note ui-set-t--f ui-rs-mt" data-whole-line>
                {labels.wholeDraftPrefix ?? "Whole draft:"} ≈{" "}
                {formatUsd(view.commandScope.wholeEstimateCredits)}
                {view.commandScope.wholeCapCredits != null
                  ? ` · cap ${formatUsd(view.commandScope.wholeCapCredits)}`
                  : ""}
              </div>
            ) : null}
          </div>
          );
        })()}

        <div className="ui-rs-end">
          <Button
            type="submit"
            variant="primary"
            disabled={runDisabled}
            data-run-button="true"
            data-estimate-credits={shown.e}
            data-needs-consent={consent ? "true" : "false"}
            data-run-label={labels.runLabel}
            data-confirm-label={labels.confirmLabel ?? labels.runLabel}
          >
            {consent && labels.confirmLabel ? labels.confirmLabel : labels.runLabel}
          </Button>
        </div>
      </div>

      {/* PRB.08 — the final-month beta-plan offer: copy + a link only (no subscription machinery;
          REQ-BETA-14). */}
      {view.planOfferUrl && labels.planOffer ? (
        <p data-plan-offer className="ui-set-note ui-set-t--m">
          {labels.planOffer.text}{" "}
          <a href={view.planOfferUrl} className="ui-vc-link">
            {labels.planOffer.linkLabel}
          </a>
        </p>
      ) : null}

      {/* the obligation scope line (REQ-OBJ-6). */}
      {view.scopeLine ? (
        <p className="ui-set-t ui-set-t--m ui-rs-mt" data-scope-line>
          {view.scopeLine}
        </p>
      ) : null}

      {/* P1.20 (§6.7) — the settings-page protocol-change marker on the Review's scope card. */}
      {view.protocolChangedLine ? (
        <p className="ui-set-t ui-set-t--m ui-rs-mt" data-protocol-changed>
          {view.protocolChangedLine}
        </p>
      ) : null}

      {/* P1.21 (§6.7/REQ-WF-8) — the Memo confidentiality statement: user-supplied sources mount
          read-only and are never fetched over the web (enforced at the proxy, not just advised). */}
      {view.memoConfidentialityLine ? (
        <p className="ui-set-t ui-set-t--m ui-rs-mt" data-memo-confidentiality>
          {view.memoConfidentialityLine}
        </p>
      ) : null}

      {/* P1.06 (REQ-SPEC-17's sheet half) — the scope-approval consequence at launch: informational /
          blocking-2h / waits-for-you, from the same gate-policy facts the run freezes. */}
      <p className="ui-set-t ui-set-t--m ui-rs-mt" data-scope-approval>
        {view.scopeApprovalLine}
      </p>

      {/* PRB.10 — the voice line (§9.6): the linked persona's name + the shared pill, or the ad-hoc
          default. A stale/untested/never-built voice NEVER blocks the run; when the pill's action is
          `update_voice` the priced chained action renders beside it (its submit retargets via
          formAction — the same dual-submit pattern as the exhaustion button). */}
      {view.voice && labels.voiceLabels ? (
        <p className="ui-set-t ui-set-t--m ui-rs-mt" data-voice-line>
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
              <HiddenField name="voice_persona" value={view.voice.personaId ?? ""} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                formAction={view.voice.updateAction}
                onClick={trackAction}
                data-update-voice="true"
              >
                {labels.voiceLabels.updateFirstFmt.replace(
                  "{n}",
                  String(view.voice.updateEstimateCredits),
                )}
              </Button>
            </>
          ) : null}
        </p>
      ) : null}

      {/* the collapsed row → expands to the scope summary + the editable rows (Approvals · budget cap ·
          don't-ask pref · Guidance) + Advanced per-phase toggles with signed deltas (§5.6). */}
      <details className="ui-rs-det">
        <summary className="ui-vc-sum ui-set-t--m">
          {view.collapsedSummary} · {labels.changeLabel}
        </summary>
        <div className="ui-set-list ui-set-t" data-sheet-fields>
          {/* the editable scope facts (§5.6 collapsed row): Protocol · Venue · Stage ride the form and
              freeze into the run's inputs — a changed protocol/venue also flips REQ-SPEC-17's
              scope gate to blocking (the api re-derives the flag server-side, never client-trusted). */}
          <label className="ui-set-row">
            <span className="ui-rs-lab">
              {labels.protocolLabel ?? "Protocol"}
            </span>
            {/* P1.21 — the four §6.7 protocols render as a select when the context supplied the card
                list; a free-text input remains the no-context fallback (a typed value still works —
                the api validates the id server-side either way). */}
            {view.scope.protocolOptions && view.scope.protocolOptions.length > 0 ? (
              <Select
                name="protocol"
                defaultValue={view.scope.protocol}
                data-protocol-select
                aria-label={labels.protocolLabel ?? "Protocol"}
                items={view.scope.protocolOptions.map((o) => ({ value: o.id, label: o.name }))}
              />
            ) : (
              <TextField
                name="protocol"
                defaultValue={view.scope.protocol}
                aria-label={labels.protocolLabel ?? "Protocol"}
                className="ui-field--w"
              />
            )}
          </label>
          <label className="ui-set-row">
            <span className="ui-rs-lab">
              {labels.venueLabel ?? "Venue"}
            </span>
            <TextField
              name="venue"
              defaultValue={view.scope.venue ?? ""}
              aria-label={labels.venueLabel ?? "Venue"}
              className="ui-field--w"
            />
          </label>
          <label className="ui-set-row">
            <span className="ui-rs-lab">
              {labels.stageLabel ?? "Stage"}
            </span>
            <TextField
              name="stage"
              defaultValue={view.scope.stage ?? ""}
              aria-label={labels.stageLabel ?? "Stage"}
              className="ui-field--w"
            />
          </label>
          {/* EST.1 (ADR-035) — the Model-tier select: a USER choice inside plan rules. A locked tier
              renders disabled with its repriced estimate for context; the repaint's `cells` table
              covers every rigor|tier|toggle state. */}
          <label className="ui-set-row">
            <span className="ui-rs-lab">
              {labels.modelTierLabel ?? "Model tier"}
            </span>
            <Select
              name="modelTier"
              value={tier}
              data-tier-select
              aria-label={labels.modelTierLabel ?? "Model tier"}
              onValueChange={(v) => {
                setTier(v as ModelTier);
                setLeverDirty(true);
              }}
              items={view.modelTierOptions.map((o) => ({
                value: o.tier,
                disabled: !o.allowed && !o.selected,
                label: `${o.display} · ≈${formatCredits(o.estimateCredits)} cr${!o.allowed ? ` ${labels.tierLockedSuffix ?? "(not on your plan)"}` : ""}`,
              }))}
            />
          </label>
          {view.clampedFromModelTier ? (
            <p className="ui-set-note ui-set-t--f" data-tier-clamped>
              {(labels.tierClampedFmt ?? "{requested} isn't on your plan — priced on {resolved}.")
                .replace(
                  "{requested}",
                  MODEL_TIER_DISPLAY[view.clampedFromModelTier as ModelTier] ??
                    view.clampedFromModelTier,
                )
                .replace("{resolved}", view.modelTierDisplay)}
            </p>
          ) : null}
          {/* P1.21 (§6.7/REQ-GENRE-6) — the memo run's user_sources field: one `name :: url-or-text`
              per line; the api validates + freezes them and denies web fetches to their domains. */}
          {view.userSourcesField ? (
            <label data-user-sources-field>
              <span className="ui-set-t--m">
                {labels.userSourcesLabel ?? "User sources"}
              </span>
              <TextArea
                name="userSources"
                rows={3}
                defaultValue={view.userSourcesText ?? ""}
                placeholder={labels.userSourcesPlaceholder ?? "Q3 forecast :: https://internal.example/q3"}
                className="ui-rs-mt"
              />
              <span className="ui-set-note ui-set-t--f">
                {labels.userSourcesHint ??
                  "One per line — name :: url or name :: pasted text (up to 8). Never fetched over the web."}
              </span>
            </label>
          ) : null}
          {/* Approvals — the project's policy, edited here (§5.6 collapsed row; the run POST persists it). */}
          <label className="ui-set-row">
            <span className="ui-rs-lab">
              {labels.approvalsLabel ?? "Approvals"}
            </span>
            <Select
              name="approval"
              defaultValue={view.approvalPolicy}
              aria-label={labels.approvalsLabel ?? "Approvals"}
              items={(["named", "wait_each", "run_to_completion"] as const).map((p) => ({
                value: p,
                label:
                  labels.approvalsDisplay?.[p] ??
                  (p === "named"
                    ? "Named approvals"
                    : p === "wait_each"
                      ? "Wait for me at each approval"
                      : "Run to completion"),
              }))}
            />
          </label>
          {/* P1.09 — the per-run override ("this run only, autonomously"): freezes gates_off on THIS
              run — named approvals skip by policy; spend/refusal cards still wait (REQ-SPEC-1). */}
          <label className="ui-set-row" data-auto-run="true">
            <span className="ui-rs-lab"></span>
            <Checkbox name="autoRun" aria-label={labels.autoRunLabel ?? "This run only — run it to completion"} />
            <span className="ui-set-t">
              {labels.autoRunLabel ?? "This run only — run it to completion"}
            </span>
          </label>
          {/* Budget cap — editable UPWARD only (§5.6): the input's floor is the computed cap; a lower
              value can never submit (min=, and the submit handler floors it again). */}
          <label className="ui-set-row">
            <span className="ui-rs-lab">
              {labels.capLabel ?? "Budget cap (credits)"}
            </span>
            <TextField
              type="number"
              name="capCredits"
              min={shown.c}
              value={capShown}
              data-cap-input
              aria-label={labels.capLabel ?? "Budget cap (credits)"}
              onChange={(e) => {
                setCapTouched(true);
                setCapText(e.target.value);
              }}
              onBlur={() => {
                const n = Number(capText);
                if (!Number.isFinite(n) || n < shown.c) setCapText(String(shown.c));
              }}
              className="ui-field--w"
            />
          </label>
          {/* "Don't ask me to confirm runs under N credits" — the per-user pref (REQ-BILL-4; ≤1,000). */}
          <label className="ui-set-row">
            <span className="ui-rs-lab">
              {labels.dontAskLabel ?? "Confirm runs under (credits)"}
            </span>
            <TextField
              type="number"
              name="dontAskUnder"
              min={0}
              max={1000}
              defaultValue={view.dontAskUnder}
              aria-label={labels.dontAskLabel ?? "Confirm runs under (credits)"}
              className="ui-field--w"
            />
          </label>
          {/* Guidance — the grammar's free-text tail, run-scope (§6.5; delivered at phase boundaries). */}
          <label>
            <span className="ui-set-t--m">
              {labels.guidanceLabel ?? "Guidance"}
            </span>
            <TextArea
              name="guidance"
              rows={2}
              defaultValue={view.guidance ?? ""}
              placeholder={labels.guidancePlaceholder ?? "Anything this run should know?"}
              className="ui-rs-mt"
            />
          </label>
          {/* §5.6 — "N standing notes apply" beside the guidance box (standing guidance is server-scoped). */}
          {view.standingNotes != null && view.standingNotes > 0 ? (
            <p className="ui-set-note ui-set-t--f" data-standing-notes>
              {labels.standingNotesFmt
                ? labels.standingNotesFmt.replace("{n}", String(view.standingNotes))
                : `${view.standingNotes} standing notes apply`}
            </p>
          ) : null}
        </div>
        {view.toggleDeltas.length > 0 ? (
          <fieldset className="ui-set-fs">
            <legend className="ui-set-t--f">{labels.advancedLegend}</legend>
            {view.toggleDeltas.map((d) => (
              <label key={d.toggle} className="ui-set-row">
                <Checkbox
                  name={`toggle.${d.toggle}`}
                  checked={!!toggles[d.toggle]}
                  onCheckedChange={(c) => {
                    setToggles((t) => ({ ...t, [d.toggle]: c === true }));
                    setLeverDirty(true);
                  }}
                  aria-label={labels.toggleLabels[d.toggle] ?? d.toggle}
                />
                <span className="ui-set-t">
                  {labels.toggleLabels[d.toggle] ?? d.toggle}{" "}
                  <span className="ui-set-t--f" data-delta={d.toggle}>
                    ({d.deltaLabel} credits)
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
      </details>

      {/* "Why this estimate?" (§5.6). */}
      {view.whyLine ? (
        <p className="ui-set-note ui-set-t--f ui-rs-mt" data-why-line>
          {labels.whyPrefix} {view.whyLine}
        </p>
      ) : null}

      {/* REQ-VFY-4 — the typed lever matrix embed (the journey probes + the repaint share it). The
          SSR `var R=` island is NOT emitted here — the React state above is its replacement; the
          embed stays the renderer-agnostic read. Numbers/keys only (JSON.stringify output). */}
      <script
        type="application/json"
        data-estimate-matrix="true"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(view.recompute) }}
      />
    </form>
  );
}
