// SPA.16 — the `billing` surface's React twins (REQ-SEQ-9, REQ-BFF-1/3/9/15/27, REQ-DAT-4/12,
// REQ-TST-2, REQ-VFY-2, REQ-UX-16; design/22 §2 `app.settings.billing` + `billing.return` rows).
// `BillingSurface` ports pages.tsx `BillingPage` verbatim — the same `<Shell>`/`<PageTitle>`/
// `SettingsNav` chrome, the same `data-*` vocabulary — on data read through the
// `billingSettingsQuery` twin instead of `usePageData()`. `BillingReturnSurface` ports
// `BillingReturnPage`. Every hook literal resolves to dom-contract.ts; nothing unmanifested is
// invented.
//
// Port notes (the places a React mount CANNOT be a byte-copy):
//   • section headings are promoted one level (`h3`→`h2`) — the settings/usage heading-order
//     precedent: PageTitle is the h1 and axe's `heading-order` is part of the component leg.
//     Hooks + copy are unchanged.
//   • forms keep their SSR markup verbatim (`method="post"`, the canonical
//     `/app/settings/billing/*` action path, the field vocabulary — the no-JS fallback is the
//     same element) but a delegated `onSubmit` on the `data-spa-surface` wrapper intercepts
//     every billing form: `bffFetch` posts the flat fields as JSON (the same vocabulary
//     `wantsJson`'s server branch decodes through `bodyFields`), follows the
//     `{ok, redirect|url}` envelope — `redirect` is an in-router nav so the `?saved`/`?notice`
//     flash renders through the leaf's validated search, `url` is the Stripe hand-off:
//     server-validated at serialization (`stripeRedirectTarget` + `mutationOutcome`'s
//     `externalNavTarget` re-check) and followed ONLY through `navigateDocument` — and
//     `["bff"]` invalidates on settle so the repaint is server-truth, never optimistic
//     mirroring (REQ-DAT-8/12: spend-adjacent writes stay pending-only). The in-flight form
//     carries `aria-busy` + disabled controls (REQ-UX-16).
//   • `data-billing-down` renders when the twin degraded either load-bearing read to `null` —
//     the SSR's `if (!billing)` branch verbatim, never a fabricated tier/prices.
//   • `?saved`/`?notice` arrive as props from the leaf's validated search — URL state, never
//     payload — mapped through the shared `billing-copy.ts` notice table (one mapper, both
//     renderers).
//   • The `/billing/return` poll is server-owned: the twin emits `pollAfterSeconds` only while
//     `open ∧ ¬cancelled ∧ <30 s` (§14.6's webhook-lag bound); `refetchInterval` reads it, so an
//     expired/completed/cancelled return — or an open row past the window — stops on its own.
//   • `returnTo` sanitizes to a same-origin path (a checkout we minted only ever stored a
//     same-origin base); anything else degrades to `/app/settings/billing` — the SSR's default.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { FormEvent, ReactNode } from "react";
import { PageTitle, Shell } from "@rhema/ui";
import type { BillingPlanDto } from "@rhema/api-client";
import { COPY } from "../../copy.js";
import { billingNoticeFor } from "../../billing-copy.js";
import { bffFetch } from "../bff.js";
import { navigateDocument } from "../dom.js";
import type { BffBillingReturnTwin, BffBillingSettingsTwin } from "../queries.js";
import { SettingsNav } from "./settings.js";

// Destructure the COPY branches once — the REQ-SAFE-10 leaf scan keys on `COPY.<path>` literals.
const { billing: B, project: PRJ, phoneBlocked: PB } = COPY;

function footer(): ReactNode {
  return <span>{COPY.footer}</span>;
}

/** P1.19's phone-width note — verbatim from pages.tsx `PhoneBlockedNote`. */
function PhoneBlockedNote(): ReactNode {
  return (
    <p data-phone-blocked="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
      {PB.note}
    </p>
  );
}

// ---- The delegated mutation leg (one hook per surface mount) -----------------------------------

/** The `mutationOutcome` envelope the JSON branches answer (`url` = the validated Stripe hand-off). */
interface BillingMutationReply {
  readonly ok: true;
  readonly redirect?: string;
  readonly url?: string;
  readonly flash?: unknown;
  readonly data?: unknown;
  readonly pending?: unknown;
}

/** One named control's contribution — the FormData grammar (string or File). */
interface FormField {
  readonly name: string;
  readonly value: string | File;
}

/**
 * `new FormData(form)`'s field grammar, collected explicitly: named controls only; unchecked
 * checkboxes/radios and disabled controls contribute nothing (the auto-reload `enabled` checkbox
 * posts `enabled:"1"` only when ticked — the same `form.enabled === "1"` the server decode runs).
 * Collected imperatively — NOT via `new FormData(form)` — because the collection must run BEFORE
 * the REQ-UX-16 disable pass: `onMutate` disables every control, and FormData skips disabled
 * controls, so reading after the busy pass would post an empty body.
 */
function collectFormFields(form: HTMLFormElement): FormField[] {
  const out: FormField[] = [];
  for (const el of form.querySelectorAll("input, select, textarea")) {
    const name = el.getAttribute("name");
    if (name == null || name === "") continue;
    if (el instanceof HTMLInputElement) {
      if (el.disabled) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) out.push({ name, value: el.value === "" ? "on" : el.value });
        continue;
      }
      if (el.type === "file") {
        const f = el.files?.[0];
        if (f != null) out.push({ name, value: f });
        continue;
      }
      out.push({ name, value: el.value });
      continue;
    }
    if ((el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && !el.disabled) {
      out.push({ name, value: el.value });
    }
  }
  return out;
}

/** REQ-UX-16's in-flight affordance — `aria-busy` on the form + disabled controls, restored on
 *  settle. Imperative because the inputs are uncontrolled (verbatim SSR markup); no billing form
 *  ships a pre-disabled control, so settle's re-enable is unconditional. */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

interface BillingFormPost {
  readonly form: HTMLFormElement;
  readonly action: string;
  readonly json: Record<string, string>;
}

/**
 * The one billing-form submit handler — a delegation the `data-spa-surface` wrapper attaches so
 * every verbatim form rides the JSON branch without prop-threading. A form already `aria-busy` is
 * an in-flight POST — REQ-BFF-30's no-retry rule makes a second dispatch a lie, so the guard
 * swallows the click. The envelope grammar: `url` is the server-validated Stripe hand-off
 * (document nav via `navigateDocument`, never a router push); `redirect` is the identical
 * `?saved=1`/`?notice=<code>` URL the 302 would carry — an in-router nav so the flash renders
 * through the leaf's search. A BffError refusal is a no-op repaint — the SSR's
 * swallow-and-redirect parity (the surface's notices live on the redirect arms; an HTTP failure
 * envelope needs no inline render).
 */
function useBillingFormSubmit(): (e: FormEvent<HTMLElement>) => void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation<BillingMutationReply, unknown, BillingFormPost>({
    mutationFn: async ({ action, json }) => {
      return bffFetch<BillingMutationReply>(action, { method: "POST", json });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env) => {
      if (env.url != null) {
        // The server-validated Stripe checkout/portal target — a document navigation, never
        // in-router (the CSP `form-action` allowlist's other half; REQ-BFF-27, REQ-SAFE-6-R11).
        navigateDocument(env.url);
        return;
      }
      if (env.redirect != null) {
        void router.navigate({ href: env.redirect });
      }
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      // Server-truth repaint — the twin refetches; a refused write keeps its persisted values.
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
    },
  });
  return (e) => {
    e.preventDefault();
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute("aria-busy") === "true") return;
    const action = form.getAttribute("action") ?? "";
    const fields = collectFormFields(form);
    const json: Record<string, string> = {};
    for (const f of fields) if (typeof f.value === "string") json[f.name] = f.value;
    mutation.mutate({ form, action, json });
  };
}

// ---- /app/settings/billing (+ the /settings/billing alias mount — the same component) ----------

export interface BillingSurfaceProps {
  /** the `GET /bff/settings/billing` twin payload (`billing` null ⇒ the SSR's down branch). */
  readonly twin: BffBillingSettingsTwin;
  /** the leaf's validated flash params (`saved`/`notice`) — URL state, never payload. */
  readonly saved: boolean;
  readonly notice?: string;
  /** §10.1's phone verdict — configuration controls never render on compact. */
  readonly compact: boolean;
}

/**
 * The §14.2 billing surface — verbatim from pages.tsx `BillingPage`: plan card (trial state,
 * current tier, period end), the plan ladder (subscribe/cancel/waitlist per tier), the top-up
 * packs, the auto-reload opt-in, and the Stripe Portal/Customer pointers. `purchase !== "open"`
 * fails CLOSED — the paused note renders and no subscribe/top-up/portal form mounts (the POSTs
 * would 403 anyway — this is the honest surface, not a trap door). `balance` rides the twin per
 * the design table; this page does not render it today (parity with the SSR document).
 */
export function BillingSurface({ twin, saved, notice, compact }: BillingSurfaceProps): ReactNode {
  const onSubmit = useBillingFormSubmit();
  const billing = twin.billing;
  if (!billing) {
    return (
      <div data-spa-surface onSubmit={onSubmit}>
        <Shell brand={COPY.brand} nav={<a href="/app">{PRJ.backToList}</a>} footer={footer()}>
          <PageTitle>{B.heading}</PageTitle>
          <SettingsNav active="billing" />
          <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }} data-billing-down="true">{B.stripeDownNote}</p>
        </Shell>
      </div>
    );
  }
  const { subscription: sub, plans } = billing;
  // BILL.3 — fail closed when an older api omits `purchase`; only the literal `open` unlocks the
  // Checkout/Portal forms.
  const purchaseOpen = sub.purchase === "open";
  const planEntries = Object.entries(plans.plans);
  const current = sub.tier;
  // The notice code maps through the SAME per-class table the document's composition ran —
  // `billing-copy.ts`, one mapper both renderers (an unknown code lands the generic note).
  const noticeCopy = notice != null && notice !== "" ? billingNoticeFor(notice) : null;
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell brand={COPY.brand} nav={<a href="/app">{PRJ.backToList}</a>} footer={footer()}>
        <PageTitle>{B.heading}</PageTitle>
        <SettingsNav active="billing" />
        {/* `key` = the leaf's flash state: an envelope-nav lands on the same path with a new
            flash, and the key remounts the uncontrolled forms so they re-read the
            (already-invalidated) server truth — a refused write reverts the controls like the
            SSR 302 did (the settings frame's contentKey precedent). */}
        <div key={`${saved ? "1" : ""}|${notice ?? ""}`} style={{ maxWidth: "640px" }}>

        {sub.subscription?.pastDue ? (
          <p data-past-due="true" style={{ fontSize: "13px", color: "var(--sev-major)", margin: "8px 0" }}>
            {B.pastDueBanner}
          </p>
        ) : null}
        {noticeCopy ? (
          <p data-notice="true" style={{ fontSize: "13px", color: "var(--sev-major)", margin: "8px 0" }}>{noticeCopy}</p>
        ) : null}
        {/* BILL.3 — the purchase switch rendered truthfully: while the api reports `closed` the page
            shows the paused note and the subscribe/top-up/portal forms never mount (the POSTs would
            403 anyway — this is the honest surface, not a trap door). */}
        {!purchaseOpen ? (
          <p data-purchase-paused="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
            {B.purchasePausedNote}
          </p>
        ) : null}
        {saved ? (
          <p data-saved="true" style={{ fontSize: "13px", color: "var(--state-ready)", margin: "8px 0" }}>{B.saved}</p>
        ) : null}

        <section data-plan-card="true" style={{ margin: "12px 0 20px" }}>
          <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>{B.planHeading}</h2>
          {sub.trial.state === "trial_active" || sub.trial.state === "trial_pending" ? (
            <p data-trial-state={sub.trial.state === "trial_pending" ? "pending" : "active"} style={{ fontSize: "13px", margin: "4px 0" }}>
              {/* HOT.1/ACT.1 — the api nulls `includedNote` while the claim is gated off for this
                  audience; the badge + claim render together, else the factual window note. Pending
                  adds the eligibility line: the entitlement is `locked` until the first run claims it
                  through the device check (§14.3 identity-before-spend). */}
              {plans.trial.includedNote != null ? (
                <>
                  <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "999px", border: "1px solid var(--accent)", color: "var(--accent)" }}>{B.includedBadge}</span>
                  {" "}{plans.trial.includedNote}
                  {sub.trial.state === "trial_pending" ? <>{" "}{plans.trial.eligibilityLine}</> : null}
                </>
              ) : B.trialWindowFmt.replace("{days}", String(plans.trial.windowDays))}
            </p>
          ) : sub.trial.state === "trial_denied" ? (
            <p data-trial-state="denied" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "4px 0" }}>{B.trialDeniedNote}</p>
          ) : sub.trial.state === "trial_used" ? (
            <p data-trial-state="used" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "4px 0" }}>{B.trialUsedNote}</p>
          ) : null}
          {current === "free" ? (
            <p data-current-plan="free" style={{ fontSize: "13px", margin: "4px 0" }}>{B.freeNote}</p>
          ) : (
            <p data-current-plan={current} style={{ fontSize: "13px", margin: "4px 0" }}>
              <strong>{plans.plans[current]?.display ?? current}</strong>
              {sub.subscription ? (
                <>
                  {" · "}
                  {sub.subscription.cancelAtPeriodEnd
                    ? B.cancelScheduledFmt.replace("{at}", sub.subscription.periodEnd.slice(0, 10))
                    : sub.subscription.scheduledTier
                      ? B.scheduledDowngradeFmt
                          .replace("{tier}", plans.plans[sub.subscription.scheduledTier]?.display ?? sub.subscription.scheduledTier)
                          .replace("{at}", sub.subscription.periodEnd.slice(0, 10))
                      : B.periodEndFmt.replace("{at}", sub.subscription.periodEnd.slice(0, 10))}
                </>
              ) : null}
            </p>
          )}
        </section>

        {/* P1.19 — §10.1 ✗: billing/configuration controls (plan ladder forms, top-ups, auto-reload,
            portal) never render on phone width; the read-only plan card above stays. */}
        {compact === true ? <PhoneBlockedNote /> : (
        <>
        <section data-plan-ladder="true" style={{ margin: "0 0 20px" }}>
          {planEntries.map(([tier, plan]: [string, BillingPlanDto]) => {
            const isCurrent = tier === current;
            // The per-card action, computed ahead of the JSX so the nested ternary never sits
            // between tags (the REQ-SAFE-10 inline-copy sweep scans `>…<` spans lexically).
            const waitlistForm = (
              <form method="post" action="/app/settings/billing/waitlist" data-waitlist-form="true" style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <input type="email" name="email" required placeholder={B.teamEmailLabel}
                  style={{ padding: "5px 8px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }} />
                <input type="number" name="seats" min={1} placeholder={B.teamSeatsLabel}
                  style={{ width: "70px", padding: "5px 8px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }} />
                <button type="submit" style={{ fontSize: "12px" }}>{B.teamCta}</button>
                <span style={{ fontSize: "11px", color: "var(--shell-fg-faint)" }}>{B.waitlistBadge}</span>
              </form>
            );
            const cancelForm = (
              <form method="post" action="/app/settings/billing/cancel" data-cancel-form="true">
                <button type="submit" style={{ fontSize: "12px" }}>{B.cancelCta}</button>
                <span style={{ fontSize: "11px", color: "var(--shell-fg-faint)", marginLeft: "8px" }}>{B.cancelNote}</span>
              </form>
            );
            const subscribeForm = (
              <form method="post" action="/app/settings/billing/subscribe" data-subscribe-form={tier} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input type="hidden" name="tier" value={tier} />
                <select name="cycle" aria-label={B.cycleLabel} style={{ fontSize: "12px", padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }}>
                  <option value="monthly">{B.monthlyLabel}</option>
                  <option value="annual">{B.annualLabel}</option>
                </select>
                <button type="submit" style={{ fontSize: "12px" }}>{B.subscribeCta.replace("{tier}", plan.display)}</button>
              </form>
            );
            // BILL.3 — no subscribe form while purchase is closed.
            const cardAction = plan.waitlist
              ? waitlistForm
              : isCurrent
                ? sub.subscription && !sub.subscription.cancelAtPeriodEnd
                  ? cancelForm
                  : null
                : purchaseOpen
                  ? subscribeForm
                  : null;
            return (
              <div key={tier} data-plan={tier} style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "12px 14px", margin: "0 0 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                  <strong style={{ fontSize: "14px" }}>{plan.display}</strong>
                  <span style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
                    {/* PR-U6/ACT.1 — Team is per-seat (`$40/seat/mo`); the annual figure reads
                        "billed annually", never the "$/mo Annual" concat; null ⇒ no annual offer. */}
                    ${plan.monthlyUsd}{plan.perSeat ? "/seat/mo" : "/mo"}
                    {plan.annualMonthlyUsd != null && plan.annualMonthlyUsd < plan.monthlyUsd ? (
                      <span style={{ color: "var(--shell-fg-muted)" }}> · ${plan.annualMonthlyUsd}/mo {B.annualBillingLabel}</span>
                    ) : null}
                  </span>
                </div>
                {/* HOT.1 — null while the plan's coverage line is a hidden claim (DTO-redacted). */}
                {plan.whatItCovers != null ? (
                  <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "4px 0 8px" }}>{plan.whatItCovers}</p>
                ) : null}
                {cardAction}
              </div>
            );
          })}
        </section>

        <section data-topups="true" style={{ margin: "0 0 20px" }}>
          <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>{B.topupHeading}</h2>
          {/* BILL.3 — §14.2: Free never sees a Checkout top-up (the api would 402 `topups_require_plan`);
              the honest note renders in place of the pack buttons. Purchase-closed hides them too. */}
          {!purchaseOpen ? null : sub.tier === "free" ? (
            <p data-topup-gated="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>
              {B.topupRequiresPlanNote}
            </p>
          ) : plans.topUpPacks.map((p) => (
            <form key={p.id} method="post" action="/app/settings/billing/topup" data-topup-form={p.id} style={{ display: "inline-block", margin: "0 8px 8px 0" }}>
              <input type="hidden" name="packId" value={p.id} />
              <button type="submit" style={{ fontSize: "12px" }}>
                {B.topupCta.replace("{n}", p.credits.toLocaleString("en-US")).replace("{usd}", String(p.usd))}
              </button>
            </form>
          ))}
        </section>

        <section data-auto-reload="true" style={{ margin: "0 0 20px" }}>
          <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>{B.autoReloadHeading}</h2>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>{B.autoReloadNote}</p>
          <form method="post" action="/app/settings/billing/auto-reload" data-auto-reload-form="true" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", fontSize: "12px" }}>
            <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input type="checkbox" name="enabled" value="1" defaultChecked={sub.autoReload.enabled} />
              {B.autoReloadEnable}
            </label>
            <label>
              {B.autoReloadThresholdLabel}{" "}
              <input type="number" name="thresholdCredits" min={1} defaultValue={sub.autoReload.thresholdCredits ?? 500}
                style={{ width: "90px", padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "12px" }} />
            </label>
            <label>
              {B.autoReloadPackLabel}{" "}
              <select name="packId" defaultValue={sub.autoReload.packId ?? plans.topUpPacks[0]?.id}
                style={{ padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "12px" }}>
                {plans.topUpPacks.map((p) => (
                  <option key={p.id} value={p.id}>${p.usd} — {p.credits.toLocaleString("en-US")} cr</option>
                ))}
              </select>
            </label>
            <label>
              {B.autoReloadCapLabel}{" "}
              <input type="number" name="monthlyCapUsd" min={1} defaultValue={sub.autoReload.monthlyCapUsd ?? 50}
                style={{ width: "70px", padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "12px" }} />
            </label>
            <button type="submit" style={{ fontSize: "12px" }}>{B.autoReloadSave}</button>
          </form>
        </section>

        {/* BILL.3 — the Portal is a purchase entry point too: while the switch is closed the form never
            mounts (the api would 403 before the Stripe call anyway). */}
        {sub.hasStripeCustomer && purchaseOpen ? (
          <form method="post" action="/app/settings/billing/portal" data-portal-form="true" style={{ margin: "0 0 20px" }}>
            <button type="submit" style={{ fontSize: "12px" }}>{B.manageCta}</button>
            <span style={{ fontSize: "11px", color: "var(--shell-fg-faint)", marginLeft: "8px" }}>{B.manageNote}</span>
          </form>
        ) : null}
        {/* BILL.3 — no stripe_customer yet ⇒ name the reason instead of hiding the affordance silently
            only when purchase is open (while closed the paused note already explains). */}
        {!sub.hasStripeCustomer && purchaseOpen ? (
          <p data-no-customer="true" style={{ fontSize: "11px", color: "var(--shell-fg-faint)", margin: "0 0 20px" }}>
            {B.noStripeCustomerNote}
          </p>
        ) : null}
        </>
        )}
        </div>
      </Shell>
    </div>
  );
}

// ---- /billing/return — the Checkout return (REQ-BILL-14) ----------------------------------------

/**
 * The Checkout return (`/billing/return?session_id=`): verbatim from pages.tsx
 * `BillingReturnPage` — `open` ⇒ pending copy (the twin's `pollAfterSeconds` re-asks at the
 * server-owned cadence instead of the document's meta-refresh — §14.6's ≤30 s webhook-lag bound
 * lives server-side); `completed` ⇒ the continue link returns to where the user started;
 * `expired`/`cancelled` render their copy and never poll. `returnTo` is sanitized to a
 * same-origin path — a checkout we minted only ever stored a `/app|/settings/...` base.
 */
export function BillingReturnSurface({ twin }: { readonly twin: BffBillingReturnTwin }): ReactNode {
  const { checkoutReturn, cancelled } = twin;
  const state = cancelled ? "cancelled" : (checkoutReturn?.state ?? "open");
  const back = checkoutReturn?.returnTo != null && checkoutReturn.returnTo.startsWith("/")
    ? checkoutReturn.returnTo
    : "/app/settings/billing";
  return (
    <div data-spa-surface>
      <Shell brand={COPY.brand} nav={<a href="/app/settings/billing">{B.nav}</a>} footer={footer()}>
        <PageTitle>{B.returnHeading}</PageTitle>
        <p data-checkout-state={state} style={{ fontSize: "14px", margin: "12px 0" }}>
          {state === "completed"
            ? B.returnDone
            : state === "cancelled"
              ? B.returnCancelled
              : state === "expired"
                ? B.returnExpired
                : B.returnPending}
        </p>
        <p style={{ fontSize: "13px" }}>
          <a href={back} data-checkout-continue="true">
            {state === "completed" ? B.returnContinue : B.returnBack}
          </a>
        </p>
      </Shell>
    </div>
  );
}
