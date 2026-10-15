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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { PageTitle } from "@rhema/ui";
import {
  CONSENT_ABSOLUTE_CREDITS,
  CONSENT_BALANCE_FRACTION,
  CONSENT_PCT_FLOOR_CREDITS,
  MODEL_TIER_DISPLAY,
  PRICING,
  creditsLine,
  estimateLine,
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
    <p
      data-phone-blocked="true"
      style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}
    >
      {COPY.phoneBlocked.note}
    </p>
  );
}

const buttonBase: CSSProperties = {
  padding: "9px 16px",
  borderRadius: "8px",
  border: "none",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const boxStyle: CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: "10px",
  padding: "14px 16px",
  background: "var(--shell-raised)",
  margin: "12px 0",
};

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
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", maxWidth: "68ch" }}>{R.lede}</p>
      {pretriage && runSheet.view.workflow === "revise" ? (
        <p
          data-pretriage-line="true"
          style={{ color: "var(--shell-fg-muted)", fontSize: "13px", marginTop: "8px" }}
        >
          {fmt(COPY.triage.pretriageFmt, { n: pretriage.triaged, m: pretriage.total })}
        </p>
      ) : null}
      {started ? (
        <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>
          {R.started}
        </p>
      ) : null}
      {notice != null ? (
        <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>
          {notice}
        </p>
      ) : mutNotice !== null ? (
        <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>
          {mutNotice}
        </p>
      ) : null}
      {runSheet.activeRun ? (
        // PRB.21 / D-PRB.20-1 — a non-terminal run exists ⇒ the in-progress state REPLACES the Run
        // affordance (the api 409s a second create; this is the honest first screen + its link).
        <section style={{ maxWidth: "68ch" }}>
          <p role="status" style={{ color: "var(--shell-fg)", fontSize: "15px", lineHeight: 1.6 }}>
            {R.inProgress}
          </p>
          {runSheet.activeRun.runId !== "" ? (
            <p style={{ marginTop: "12px" }}>
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
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
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
      <input type="hidden" name="workflow" value={view.workflow} readOnly />
      <input type="hidden" name="idempotencyKey" value={view.idempotencyKey} readOnly />
      {/* the repainted estimate posts — the script's `eh.value=String(est)` update. */}
      <input type="hidden" name="estimateCredits" value={String(shown.e)} readOnly />
      {/* EST.1 — `modelTier` submits from the collapsed-row <select> below (the user's choice rides
          the form verbatim; the api's plan gate stays the enforcer). */}
      {/* P1.06 (§7.2) — the command scope round-trips verbatim (canonical serialized form); the cap's
          editable field lives in the collapsed row (upward-only), so NO hidden capCredits here. */}
      {view.commandScope ? (
        <input type="hidden" name="scope" value={view.commandScope.serialized} readOnly />
      ) : null}
      {/* REQ-BILL-6: the run record freezes rate-table version + the word/claim counts the estimate was for. */}
      <input type="hidden" name="rateTableVersion" value={est.rateTableVersion} readOnly />
      <input type="hidden" name="words" value={view.title.words} readOnly />
      {view.title.claims != null ? (
        <input type="hidden" name="claims" value={view.title.claims} readOnly />
      ) : null}
      {/* PRB.23 — the sentinel listing every toggle this form rendered. An UNCHECKED checkbox
          submits no field, so the run POST cannot otherwise distinguish "user turned it off"
          from "not on this sheet": the server resolves each listed key as on/off. */}
      <input
        type="hidden"
        name="toggleKeys"
        value={view.toggleDeltas.map((d) => d.toggle).join(",")}
        readOnly
      />
      {/* ECON.1 (§6.5) — the rigor these checkboxes were RENDERED for (the twin's resolved rigor —
          the lever pick can move without re-rendering the boxes, so a stale-marked set drops
          server-side exactly like the form post). */}
      <input type="hidden" name="toggleRigor" value={view.rigor} readOnly />
      {/* ACT.1 — the included-Review claim rides the Run form: the entitlement's row id POSTs back so
          the api's unlock gate + hold claim it. Absent when no claimable entitlement exists. */}
      {view.entitlementId ? (
        <input type="hidden" name="entitlementId" value={view.entitlementId} readOnly />
      ) : null}

      {/* title line: "Review v2 · 5,180 words · 21 claims" + the §7.2 scope pills (P1.06 — the typed
          @scope renders as human labels; the grammar syntax never reaches the surface). */}
      <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
        {view.title.verbLabel} {view.title.targetVersion} ·{" "}
        {est.missing ? (
          "—"
        ) : (
          <>
            {view.title.words.toLocaleString("en-US")} words
            {view.title.claims != null
              ? ` · ${view.title.claims.toLocaleString("en-US")} claims`
              : ""}
          </>
        )}
      </h2>
      {view.commandScope ? (
        <div
          data-command-scope
          style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}
        >
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
            <label
              key={o.rigor}
              style={{ fontSize: "14px", display: "inline-flex", gap: "6px", alignItems: "center" }}
            >
              <input
                type="radio"
                name="rigor"
                value={o.rigor}
                checked={rigor === o.rigor}
                onChange={() => {
                  setRigor(o.rigor);
                  setLeverDirty(true);
                }}
              />
              {o.display}
            </label>
          ))}
        </div>
      </fieldset>

      {/* the estimate box — dollars first, credits/cap/balance second (§5.6 item 5) — OR the resolution panel. */}
      <div data-paywall="run-sheet" role="group" aria-label={R.paywallAriaLabel}>
        {(() => {
          if (view.suspended) return (
          <div style={boxStyle} role="alert" data-suspended="true">
            <p style={{ margin: 0, fontSize: "14px", color: "var(--sev-major)" }}>
              {labels.suspendedNotice ??
                "This account is suspended while a payment dispute is open. No runs can start until it resolves."}
            </p>
          </div>
          );
          if (view.insufficient) return (
          <div style={boxStyle} role="alert" data-insufficient="true">
            {view.insufficient.sentences.map((s, i) => (
              <p
                key={i}
                style={{
                  margin: i === 0 ? 0 : "6px 0 0",
                  fontSize: "14px",
                  color: i === 0 ? "var(--sev-major)" : "var(--shell-fg)",
                }}
              >
                {s}
              </p>
            ))}
            {/* EST.1 — the §14.6 levers are CLICKABLE: each option re-renders the sheet with the
                lever applied (rigor ↓ / Base / fact-check off), cheapest-fitting first as primary.
                `add_credits` has no lever href — the Payment Link below is its action. */}
            <p
              style={{ margin: "8px 0 0", display: "flex", gap: "12px", flexWrap: "wrap" }}
              data-resolution-options
            >
              {view.insufficient.options.map((o) => {
                const href = resolutionHref(`/p/${slug}/run`, view, o.action);
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
              <p
                style={{ margin: "10px 0 0", fontSize: "13px", color: "var(--shell-fg-muted)" }}
                data-purchase-paused="true"
              >
                {labels.purchasePausedLabel ?? "Purchases are paused — your balance and work are safe."}
              </p>
              );
              if (view.paymentLinkUrl) return (
              <p style={{ margin: "10px 0 0" }}>
                <button
                  type="submit"
                  formAction={`/p/${slug}/exhausted`}
                  name="action_taken"
                  value="open_payment_link"
                  onClick={trackAction}
                  data-payment-link={view.paymentLinkUrl}
                  style={{ ...buttonBase, background: "var(--accent)", color: "var(--shell-bg)" }}
                >
                  {labels.buyCreditsLabel ?? "Add credits"}
                </button>
              </p>
              );
              return null;
            })()}
          </div>
          );
          if (view.included) return (
          /* P1.06 (§14.3; REQ-BILL-4) — the trial entitlement renders `Included`: no dollar/cap
             arithmetic, no consent click, no cap line. The entitlement covers the run. */
          <div style={boxStyle} data-estimate-box data-included="true">
            <div style={{ fontSize: "16px", fontWeight: 600 }}>
              {labels.includedLabel ?? "Included"}
              <span
                style={{ float: "right", color: "var(--shell-fg-muted)", fontWeight: 400 }}
                data-time-line
              >
                ~{shown.lo}–{shown.hi} min
              </span>
            </div>
            <div
              style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "4px" }}
              data-entitlement-line
            >
              {view.entitlementLine}
            </div>
          </div>
          );
          if (est.missing) return (
          /* EST.1 — unmeasured inputs render "—" + an estimating hint (never a fabricated figure). */
          <div style={boxStyle} data-estimate-box data-estimate-missing="true">
            <div style={{ fontSize: "16px", fontWeight: 600 }} data-dollars-line>
              {repainted && !R0.entitlement ? dollarsText : "—"}
              <span
                style={{ float: "right", color: "var(--shell-fg-muted)", fontWeight: 400 }}
                data-time-line
              >
                ~{repainted ? `${shown.lo}–${shown.hi} min` : "~"}
              </span>
            </div>
            <div
              style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "4px" }}
              data-credits-line
            >
              {repainted && !R0.entitlement
                ? creditsText
                : labels.estimatingLabel ?? "Estimate pending — the draft is still being measured."}
            </div>
          </div>
          );
          return (
          <div style={boxStyle} data-estimate-box>
            <div style={{ fontSize: "16px", fontWeight: 600 }} data-dollars-line>
              {dollarsText}
              {est.provisional ? (
                <span style={{ color: "var(--shell-fg-faint)", fontWeight: 400 }}>{R.refiningSuffix}</span>
              ) : null}
              <span
                style={{ float: "right", color: "var(--shell-fg-muted)", fontWeight: 400 }}
                data-time-line
              >
                ~{shown.lo}–{shown.hi} min
              </span>
            </div>
            <div
              style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "4px" }}
              data-credits-line
            >
              {creditsText}
            </div>
            {/* P1.06 (§5.6) — the scoped sheet shows the whole-draft figure beside the scoped price. */}
            {view.commandScope?.wholeEstimateCredits != null ? (
              <div
                style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "4px" }}
                data-whole-line
              >
                {labels.wholeDraftPrefix ?? "Whole draft:"} ≈ $
                {(view.commandScope.wholeEstimateCredits / 100).toFixed(2)}
                {view.commandScope.wholeCapCredits != null
                  ? ` · cap $${(view.commandScope.wholeCapCredits / 100).toFixed(2)}`
                  : ""}
              </div>
            ) : null}
          </div>
          );
        })()}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={runDisabled}
            data-run-button="true"
            data-estimate-credits={shown.e}
            data-needs-consent={consent ? "true" : "false"}
            data-run-label={labels.runLabel}
            data-confirm-label={labels.confirmLabel ?? labels.runLabel}
            style={{
              ...buttonBase,
              background: runDisabled ? "var(--shell-raised)" : "var(--accent)",
              color: runDisabled ? "var(--shell-fg-faint)" : "var(--shell-bg)",
              cursor: runDisabled ? "not-allowed" : "pointer",
            }}
          >
            {consent && labels.confirmLabel ? labels.confirmLabel : labels.runLabel}
          </button>
        </div>
      </div>

      {/* PRB.08 — the final-month beta-plan offer: copy + a link only (no subscription machinery;
          REQ-BETA-14). */}
      {view.planOfferUrl && labels.planOffer ? (
        <p data-plan-offer style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }}>
          {labels.planOffer.text}{" "}
          <a href={view.planOfferUrl} style={{ color: "var(--shell-fg)" }}>
            {labels.planOffer.linkLabel}
          </a>
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
        <p
          style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }}
          data-memo-confidentiality
        >
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
          formAction — the same dual-submit pattern as the exhaustion button). */}
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
              <input type="hidden" name="voice_persona" value={view.voice.personaId ?? ""} readOnly />
              <button
                type="submit"
                formAction={view.voice.updateAction}
                onClick={trackAction}
                data-update-voice="true"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontSize: "13px",
                  padding: 0,
                }}
              >
                {labels.voiceLabels.updateFirstFmt.replace(
                  "{n}",
                  String(view.voice.updateEstimateCredits),
                )}
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
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>
              {labels.protocolLabel ?? "Protocol"}
            </span>
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
              <input
                type="text"
                name="protocol"
                defaultValue={view.scope.protocol}
                style={{ width: "180px" }}
              />
            )}
          </label>
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>
              {labels.venueLabel ?? "Venue"}
            </span>
            <input type="text" name="venue" defaultValue={view.scope.venue ?? ""} style={{ width: "180px" }} />
          </label>
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>
              {labels.stageLabel ?? "Stage"}
            </span>
            <input type="text" name="stage" defaultValue={view.scope.stage ?? ""} style={{ width: "180px" }} />
          </label>
          {/* EST.1 (ADR-035) — the Model-tier select: a USER choice inside plan rules. A locked tier
              renders disabled with its repriced estimate for context; the repaint's `cells` table
              covers every rigor|tier|toggle state. */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>
              {labels.modelTierLabel ?? "Model tier"}
            </span>
            <select
              name="modelTier"
              value={tier}
              data-tier-select
              onChange={(e) => {
                setTier(e.target.value as ModelTier);
                setLeverDirty(true);
              }}
            >
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
            <label style={{ display: "block" }} data-user-sources-field>
              <span style={{ color: "var(--shell-fg-muted)" }}>
                {labels.userSourcesLabel ?? "User sources"}
              </span>
              <textarea
                name="userSources"
                rows={3}
                defaultValue={view.userSourcesText ?? ""}
                placeholder={labels.userSourcesPlaceholder ?? "Q3 forecast :: https://internal.example/q3"}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  font: "inherit",
                  background: "var(--shell-bg)",
                  color: "var(--shell-fg)",
                  border: "1px solid var(--shell-border)",
                  borderRadius: "6px",
                  padding: "6px 8px",
                }}
              />
              <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                {labels.userSourcesHint ??
                  "One per line — name :: url or name :: pasted text (up to 8). Never fetched over the web."}
              </span>
            </label>
          ) : null}
          {/* Approvals — the project's policy, edited here (§5.6 collapsed row; the run POST persists it). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>
              {labels.approvalsLabel ?? "Approvals"}
            </span>
            <select name="approval" defaultValue={view.approvalPolicy}>
              {(["named", "wait_each", "run_to_completion"] as const).map((p) => (
                <option key={p} value={p}>
                  {labels.approvalsDisplay?.[p] ??
                    (p === "named"
                      ? "Named approvals"
                      : p === "wait_each"
                        ? "Wait for me at each approval"
                        : "Run to completion")}
                </option>
              ))}
            </select>
          </label>
          {/* P1.09 — the per-run override ("this run only, autonomously"): freezes gates_off on THIS
              run — named approvals skip by policy; spend/refusal cards still wait (REQ-SPEC-1). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }} data-auto-run="true">
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}></span>
            <input type="checkbox" name="autoRun" />
            <span style={{ fontSize: "13px" }}>
              {labels.autoRunLabel ?? "This run only — run it to completion"}
            </span>
          </label>
          {/* Budget cap — editable UPWARD only (§5.6): the input's floor is the computed cap; a lower
              value can never submit (min=, and the submit handler floors it again). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>
              {labels.capLabel ?? "Budget cap (credits)"}
            </span>
            <input
              type="number"
              name="capCredits"
              min={shown.c}
              value={capShown}
              data-cap-input
              onChange={(e) => {
                setCapTouched(true);
                setCapText(e.target.value);
              }}
              onBlur={() => {
                const n = Number(capText);
                if (!Number.isFinite(n) || n < shown.c) setCapText(String(shown.c));
              }}
              style={{ width: "90px" }}
            />
          </label>
          {/* "Don't ask me to confirm runs under N credits" — the per-user pref (REQ-BILL-4; ≤1,000). */}
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--shell-fg-muted)", minWidth: "170px" }}>
              {labels.dontAskLabel ?? "Confirm runs under (credits)"}
            </span>
            <input
              type="number"
              name="dontAskUnder"
              min={0}
              max={1000}
              defaultValue={view.dontAskUnder}
              style={{ width: "90px" }}
            />
          </label>
          {/* Guidance — the grammar's free-text tail, run-scope (§6.5; delivered at phase boundaries). */}
          <label style={{ display: "block" }}>
            <span style={{ color: "var(--shell-fg-muted)" }}>
              {labels.guidanceLabel ?? "Guidance"}
            </span>
            <textarea
              name="guidance"
              rows={2}
              defaultValue={view.guidance ?? ""}
              placeholder={labels.guidancePlaceholder ?? "Anything this run should know?"}
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                font: "inherit",
                background: "var(--shell-bg)",
                color: "var(--shell-fg)",
                border: "1px solid var(--shell-border)",
                borderRadius: "6px",
                padding: "6px 8px",
              }}
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
                <input
                  type="checkbox"
                  name={`toggle.${d.toggle}`}
                  checked={!!toggles[d.toggle]}
                  onChange={(e) => {
                    setToggles((t) => ({ ...t, [d.toggle]: e.target.checked }));
                    setLeverDirty(true);
                  }}
                />{" "}
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
