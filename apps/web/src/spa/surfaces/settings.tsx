// SPA.12 — the `settings` surface's React twins (REQ-SEQ-9, REQ-BFF-1/9/16, REQ-DAT-4, REQ-TST-2,
// REQ-VFY-2; design/22 §2 settings rows). `SettingsFrame` + the five section components port
// pages.tsx `SettingsPage`'s sections — the same `data-*` vocabulary — on data read through the
// `settings*Query` twins instead of `usePageData()`. `ProjectSettingsSurface` ports
// `ProjectSettingsPage`. Every hook literal resolves to dom-contract.ts; nothing unmanifested is
// invented.
//
// R7KIT.3a (REQ-KIT-3 batch a, REQ-KIT-4, REQ-GUARD-1; UXC-16): every visible control is a 225a
// primitive — Button/TextField/Select/Checkbox/RadioGroup — and every spacing/type/colour/radius
// value rides `uiCss()` classes. The forms stay SSR-verbatim (`method="post"`, the action path,
// the field NAMES): the primitives' form carriers (Radix's hidden select/radio/checkbox inputs)
// keep the exact post grammar `collectFormFields` and the server's `bodyFields` decode rely on,
// and the no-JS fallback stays the KIT-1-styled native markup pages.tsx still serves (RV-36).
// `HiddenField` is the one named GUARD-1 exemption — the hidden carriers Radix does not own
// (sessionId/personaId). REQ-KIT-4: sessions render the parsed "Chrome on macOS · this device"
// label (ua-label.ts), and enum keys render through COPY-owned label maps with a humanized
// fallback so a raw snake_case key can never reach the page.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { FormEvent, ReactNode } from "react";
import type {
  AccountExportDto,
  AccountSettingsDto,
  DataSettingsDto,
  IntegrationsSettingsDto,
  NotificationPrefsDto,
  PreferencesSettingsDto,
} from "@rhema/api-client";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  APPROVAL_POLICIES,
  emailEnabled,
  isNonConfigurableEvent,
  MODEL_TIERS,
  MODEL_TIER_DISPLAY,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_MATRIX,
  RIGORS,
  RIGOR_DISPLAY,
  USER_LAUNCHED_WORKFLOW_KEYS,
} from "@rhema/contracts";
import { Button, Checkbox, RadioGroup, RadioGroupItem, Select, TextField } from "@rhema/ui";
import { COPY } from "../../copy.js";
import { ApprovalSettingsSection } from "../../approval-settings.js";
import { bffFetch } from "../bff.js";
import { navigateDocument } from "../dom.js";
import { PageBody, PageHeader } from "../page-header.js";
import { sessionAgentLabel } from "../ua-label.js";
import type { BffProjectSettingsTwin, BffSettingsNotificationsTwin } from "../queries.js";

// Destructure the COPY branches once — the REQ-SAFE-10 leaf scan keys on `COPY.<path>` literals;
// the branch handles keep the same leaves without re-walking the table in JSX.
const { settings: S, billing: B, accountExport: AX } = COPY;

/** `{key}`-template substitution — the local twin of pages.tsx's `fmt` (one helper, both renderers). */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** "run_progress" → "Run progress" — the humanized fallback an unlisted enum key degrades to. */
function humanizeKey(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** REQ-KIT-4 (D4) — an enum key renders its COPY label; an unlisted key humanizes, never leaks. */
function enumLabel(map: Record<string, string> | undefined, key: string): string {
  return map?.[key] ?? humanizeKey(key);
}

/**
 * The no-JS form grammar's hidden carrier — GUARD-1's named exemption owns this one component
 * (Radix's own hidden select/radio/checkbox inputs carry the named fields; the id carriers it
 * does not own — sessionId/personaId — ride this).
 */
function HiddenField({
  name,
  value,
}: {
  readonly name: string;
  readonly value: string;
}): ReactNode {
  return <input type="hidden" name={name} value={value} />;
}

// ---- The delegated mutation leg (one hook per surface mount) -----------------------------------

/** The `mutationOutcome` envelope the JSON branches answer (`url` = server-validated external). */
interface SettingsMutationReply {
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
 * checkboxes/radios and disabled controls contribute nothing; file inputs contribute their first
 * File. Collected imperatively — NOT via `new FormData(form)` — because the collection must run
 * BEFORE the REQ-UX-16 disable pass: `onMutate` disables every control, and FormData skips
 * disabled controls, so reading after the busy pass would post an empty body.
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
 *  settle. Imperative because the inputs are uncontrolled (verbatim SSR markup); no setting's
 *  form ships a pre-disabled control, so settle's re-enable is unconditional. */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

/** What a submit hands the mutation — the fields are collected BEFORE the busy pass (see above). */
interface SettingsFormPost {
  readonly form: HTMLFormElement;
  readonly action: string;
  readonly json?: Record<string, string>;
  readonly body?: FormData;
}

/**
 * The one settings-form submit handler — a delegation the `data-spa-surface` wrapper attaches so
 * every section's verbatim form rides the JSON branch without prop-threading. `e.target` IS the
 * form (submit events target it; the handler sits on the wrapper for the bubble). A form already
 * `aria-busy` is an in-flight POST — REQ-BFF-30's no-retry rule makes a second dispatch a lie, so
 * the guard swallows the click.
 */
function useSettingsFormSubmit(): (e: FormEvent<HTMLElement>) => void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation<SettingsMutationReply, unknown, SettingsFormPost>({
    mutationFn: async ({ action, json, body }) => {
      // REQ-BFF-17 — the import archive stays a multipart body; every other form is the flat
      // urlencoded vocabulary re-encoded as the JSON branch's body (checkboxes absent ⇐ same
      // semantics the server's `bodyFields` decode relies on).
      if (body != null) {
        return bffFetch<SettingsMutationReply>(action, { method: "POST", form: body });
      }
      return bffFetch<SettingsMutationReply>(action, { method: "POST", json });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env) => {
      if (env.url != null) {
        // A hosted/external target (server-validated) — a document navigation, never an in-router.
        navigateDocument(env.url);
        return;
      }
      if (env.redirect != null) {
        // The flash URL the 302 would carry — in-router so `?saved`/`?notice` paint through the
        // leaf's validated search.
        void router.navigate({ href: env.redirect });
      }
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      // Server-truth repaint — the twins refetch; a refused write keeps its persisted values.
      void queryClient.invalidateQueries({ queryKey: ["bff", "settings"] });
    },
  });
  return (e) => {
    e.preventDefault();
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute("aria-busy") === "true") return;
    const action = form.getAttribute("action") ?? "";
    const fields = collectFormFields(form);
    if (form.enctype === "multipart/form-data") {
      const body = new FormData();
      for (const f of fields) body.append(f.name, f.value);
      mutation.mutate({ form, action, body });
      return;
    }
    const json: Record<string, string> = {};
    for (const f of fields) if (typeof f.value === "string") json[f.name] = f.value;
    mutation.mutate({ form, action, json });
  };
}

// ---- The §14.7 section strip + page chrome ------------------------------------------------------

/** The §14.7 section strip — verbatim from pages.tsx `SettingsNav` (plain `<a>` document navs —
 *  the strangler re-decides each leaf; `data-status` would diverge the emitted DOM). Exported for
 *  the billing surface (SPA.16) — the strip's `billing` entry links INTO the other flag's leaf. */
export function SettingsNav({ active }: { readonly active: string }): ReactNode {
  return (
    <nav aria-label={S.sectionsAria} data-settings-nav="true" className="ui-set-nav">
      {(
        ["account", "preferences", "notifications", "integrations", "billing", "data"] as const
      ).map((s) => (
        <a
          key={s}
          href={`/app/settings/${s}`}
          data-section={s}
          aria-current={active === s ? "page" : undefined}
        >
          {S.sectionLabels[s]}
        </a>
      ))}
    </nav>
  );
}

/**
 * The settings page chrome — `PageTitle` + the section strip + the `?saved` flash line,
 * verbatim from `SettingsPage`. `contentKey` is the leaf's search state: an envelope-nav lands on
 * the same path with a new flash, and the key remounts the uncontrolled forms so they re-read the
 * (already-invalidated) server truth — a refused write reverts the controls like the SSR 302 did.
 */
export function SettingsFrame({
  section,
  saved,
  contentKey,
  children,
}: {
  readonly section: "account" | "preferences" | "notifications" | "integrations" | "data";
  readonly saved: boolean;
  readonly contentKey: string;
  readonly children: ReactNode;
}): ReactNode {
  const onSubmit = useSettingsFormSubmit();
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <PageBody>
        <PageHeader title={S.heading} />
        {/* R7SHELL.1b — the section strip stays an in-content row (its styling is 240's). */}
        <SettingsNav active={section} />
        <div key={contentKey} className="ui-set-main">
          {saved ? (
            <p data-settings-saved="true" className="ui-set-t ui-set-t--ok">
              {S.saved}
            </p>
          ) : null}
          {children}
        </div>
      </PageBody>
    </div>
  );
}

// ---- §14.7 Account ------------------------------------------------------------------------------

/** §14.7 Account — name/byline/avatar, the magic-link email change, sign-in methods, sessions with
 *  revoke, and the delete-account pointer (the control itself lives in Data). Verbatim port. */
export function AccountSection({
  account,
}: {
  readonly account: AccountSettingsDto | null;
}): ReactNode {
  const acct = account;
  if (!acct) {
    return (
      <p data-settings-unavailable="account" className="ui-set-note">
        {B.stripeDownNote}
      </p>
    );
  }
  return (
    <>
      {/* the deletion grace banner — the 14-day clock shows on every section's top surface. */}
      {acct.deletion ? <DeletionBanner deletion={acct.deletion} /> : null}
      <section aria-label={S.profileHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.profileHeading}</h2>
        <form method="post" action="/app/settings/account">
          <label className="ui-set-row">
            {S.nameLabel}:{" "}
            <TextField type="text" name="name" defaultValue={acct.user.name ?? ""} required />
          </label>
          <label className="ui-set-row">
            {S.bylineLabel}:{" "}
            <TextField type="text" name="byline" defaultValue={acct.user.byline ?? ""} />
          </label>
          <p className="ui-set-note">{S.bylineNote}</p>
          <label className="ui-set-row">
            {S.avatarLabel}:{" "}
            <TextField type="url" name="image" defaultValue={acct.user.image ?? ""} />
          </label>
          <Button type="submit" size="sm">
            {S.saveCta}
          </Button>
        </form>
      </section>
      <section aria-label={S.emailLabel} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.emailLabel}</h2>
        <p className="ui-set-t">
          {acct.user.email}{" "}
          <span
            className={
              acct.user.emailVerified ? "ui-set-t--sm ui-set-t--ok" : "ui-set-t--sm ui-set-t--f"
            }
          >
            {acct.user.emailVerified ? S.emailVerified : S.emailUnverified}
          </span>
        </p>
        {acct.user.pendingEmail ? (
          <p data-email-pending="true" className="ui-set-note">
            {fmt(S.emailPendingFmt, { email: acct.user.pendingEmail })}
          </p>
        ) : null}
        <form method="post" action="/app/settings/account/email">
          <label className="ui-set-row">
            {S.emailChangeLabel}: <TextField type="email" name="email" required />
          </label>
          <p className="ui-set-note">{S.emailChangeNote}</p>
          <Button type="submit" size="sm">
            {S.emailChangeCta}
          </Button>
        </form>
      </section>
      <section aria-label={S.signInHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.signInHeading}</h2>
        <ul className="ui-set-list">
          {acct.signInMethods.map((m) => (
            <li key={m.kind} data-signin-method={m.kind}>
              {m.label}
              {m.detail ? (
                <span className="ui-set-t--f">
                  {" — "}
                  {m.detail}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label={S.sessionsHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.sessionsHeading}</h2>
        <p className="ui-set-note">{S.sessionsNote}</p>
        <ul className="ui-set-list">
          {acct.sessions.map((s) => (
            <li key={s.id} data-session={s.id}>
              {/* REQ-KIT-4 (D3) — "Chrome on macOS · this device", never the raw UA string;
                  an absent UA falls back to the ip/id the SSR printed. */}
              {sessionAgentLabel(s.userAgent) ?? s.ipAddress ?? s.id}
              {s.current ? ` · ${S.sessionThisDeviceInline}` : null}
              <span className="ui-set-t--sm ui-set-t--f ui-set-inline">
                {fmt(S.sessionExpiresFmt, { at: s.expiresAt.slice(0, 10) })}
              </span>
              {!s.current ? (
                <form
                  method="post"
                  action="/app/settings/sessions/revoke"
                  className="ui-set-inline"
                >
                  <HiddenField name="sessionId" value={s.id} />
                  <Button type="submit" size="sm" data-revoke-session="true">
                    {S.sessionRevokeCta}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {/* §14.7 lists "delete account" under Account; the typed-confirmation control lives in Data —
          the link keeps the section's contents honest without two destructive forms. */}
      <section aria-label={S.deletionHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.deletionHeading}</h2>
        <p className="ui-set-t">
          <a href="/app/settings/data#delete" className="ui-set-t--warn">
            {S.deletionHeading}
            {" →"}
          </a>
        </p>
      </section>
    </>
  );
}

// ---- §14.7 Preferences --------------------------------------------------------------------------

/** §14.7 Preferences — account defaults (a project's own settings always win); no raw model names.
 *  Verbatim port; `""` selects carry the null-unset semantics the server decodes. */
export function PreferencesSection({
  preferences,
}: {
  readonly preferences: PreferencesSettingsDto | null;
}): ReactNode {
  if (!preferences) {
    return (
      <p data-settings-unavailable="preferences" className="ui-set-note">
        {B.stripeDownNote}
      </p>
    );
  }
  const p = preferences.prefs;
  return (
    <form method="post" action="/app/settings/preferences">
      <section aria-label={S.tierHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.tierHeading}</h2>
        <RadioGroup
          name="defaultModelTier"
          defaultValue={p.defaultModelTier ?? ""}
          aria-label={S.tierHeading}
        >
          <label className="ui-set-row">
            <RadioGroupItem value="" aria-label={S.tierAutoLabel} /> {S.tierAutoLabel}
          </label>
          <p className="ui-set-note">{S.tierAutoNote}</p>
          {MODEL_TIERS.map((t) => (
            <label key={t} className="ui-set-row" data-tier={t}>
              <RadioGroupItem value={t} aria-label={S.tierWhen[t] ?? MODEL_TIER_DISPLAY[t]} />{" "}
              {S.tierWhen[t] ?? MODEL_TIER_DISPLAY[t]}
            </label>
          ))}
        </RadioGroup>
      </section>
      <section aria-label={S.rigorHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.rigorHeading}</h2>
        <label className="ui-set-row">
          {/* REQ-VFY-6 — the SSR's textless label wrapper leaves this select nameless; the SPA's
              component-axe leg requires the programmatic name (adds `aria-label`, changes no hook). */}
          <Select
            name="defaultRigor"
            defaultValue={p.defaultRigor ?? ""}
            aria-label={S.rigorHeading}
            items={[
              {
                value: "",
                label: `${RIGOR_DISPLAY.standard} (${S.rigorDefaultOpt.toLowerCase()})`,
              },
              ...RIGORS.map((r) => ({ value: r, label: RIGOR_DISPLAY[r] })),
            ]}
          />
        </label>
        <p className="ui-set-note">{S.rigorNote}</p>
        <fieldset className="ui-set-fs">
          <legend>{S.rigorByWorkflowHeading}</legend>
          <p className="ui-set-note">{S.rigorByWorkflowNote}</p>
          <div data-rigor-by-workflow="true" className="ui-set-stack">
            {USER_LAUNCHED_WORKFLOW_KEYS.map((w) => (
              <label key={w} className="ui-set-row ui-set-row--split">
                <span>{humanizeKey(w)}</span>
                <Select
                  name={`rigor_${w}`}
                  defaultValue={p.rigorByWorkflow?.[w] ?? ""}
                  aria-label={humanizeKey(w)}
                  items={[
                    { value: "", label: S.rigorDefaultOpt },
                    ...RIGORS.map((r) => ({ value: r, label: RIGOR_DISPLAY[r] })),
                  ]}
                />
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <section aria-label={S.approvalHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.approvalHeading}</h2>
        <p className="ui-set-note">{S.approvalNote}</p>
        {/* an absent account pref means Named approvals (§5.6's default) — picking it stores the
            explicit value, which is equivalent. */}
        <RadioGroup
          name="approvalPolicy"
          defaultValue={p.approvalPolicy ?? "named"}
          aria-label={S.approvalHeading}
        >
          {APPROVAL_POLICIES.map((a) => (
            <label key={a} className="ui-set-row" data-approval-policy={a}>
              <RadioGroupItem value={a} aria-label={S.approvalPolicies[a]} />{" "}
              {S.approvalPolicies[a]}
            </label>
          ))}
        </RadioGroup>
      </section>
      <section aria-label={S.consentHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.consentHeading}</h2>
        <label className="ui-set-row">
          {S.consentLabel}:{" "}
          <TextField
            type="number"
            name="consentUnder"
            min={0}
            max={1000}
            defaultValue={preferences.consentDontAskUnder}
            className="ui-field--w"
          />
        </label>
        <p className="ui-set-note">{S.consentNote}</p>
      </section>
      <section aria-label={S.editorHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.editorHeading}</h2>
        <label className="ui-set-row">
          {S.paperThemeLabel}:{" "}
          <Select
            name="paperTheme"
            defaultValue={p.editor?.paperTheme ?? ""}
            aria-label={S.paperThemeLabel}
            items={[
              { value: "", label: S.rigorDefaultOpt },
              { value: "light", label: S.paperThemeLight },
              { value: "dark", label: S.paperThemeDark },
              { value: "follow", label: S.paperThemeFollow },
            ]}
          />
        </label>
        <label className="ui-set-row">
          {S.fontPresetLabel}:{" "}
          <Select
            name="fontPreset"
            defaultValue={p.editor?.fontPreset ?? ""}
            aria-label={S.fontPresetLabel}
            items={[
              { value: "", label: S.rigorDefaultOpt },
              { value: "serif", label: S.fontSerif },
              { value: "sans", label: S.fontSans },
              { value: "mono", label: S.fontMono },
            ]}
          />
        </label>
        <label className="ui-set-row">
          {S.fontSizeLabel}:{" "}
          <Select
            name="fontSizeStep"
            defaultValue={p.editor?.fontSizeStep != null ? String(p.editor.fontSizeStep) : ""}
            aria-label={S.fontSizeLabel}
            items={[
              { value: "", label: S.rigorDefaultOpt },
              ...[-2, -1, 0, 1, 2].map((n) => ({
                value: String(n),
                label: n > 0 ? `+${n}` : String(n),
              })),
            ]}
          />
        </label>
        <p className="ui-set-note">{S.fontSizeNote}</p>
        <label className="ui-set-row">
          {S.themeHeading}:{" "}
          <Select
            name="appTheme"
            defaultValue={preferences.appTheme}
            aria-label={S.themeHeading}
            items={[
              { value: "dark", label: S.themeDark },
              { value: "light", label: S.themeLight },
              { value: "auto", label: S.themeAuto },
            ]}
          />
        </label>
        <p className="ui-set-note">{S.themeNote}</p>
      </section>
      <p className="ui-set-note">{S.perProjectNote}</p>
      <Button type="submit" size="sm">
        {S.saveCta}
      </Button>
    </form>
  );
}

// ---- §14.7 Notifications ------------------------------------------------------------------------

/** §14.7 Notifications — the §5.11 matrix against P1.19's server-side store; the two
 *  non-configurable rows render locked (the api rejects writes to them too — REQ-ACCT-1).
 *  `rp_*` per-project selects ride the ONE form post; the server fans out per project. */
export function NotificationsSection({
  notifications,
}: {
  readonly notifications: BffSettingsNotificationsTwin["notifications"];
}): ReactNode {
  const data = notifications;
  if (!data) {
    return (
      <p data-settings-unavailable="notifications" className="ui-set-note">
        {B.stripeDownNote}
      </p>
    );
  }
  const prefs: NotificationPrefsDto["prefs"] = data.prefs;
  const qh = data.quietHours;
  const toHHMM = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return (
    <form method="post" action="/app/settings/notifications" data-notifications-form="true">
      <table data-notification-matrix="true" className="ui-matrix">
        <thead>
          <tr>
            <th>{S.matrixEventCol}</th>
            <th>{S.matrixEmailCol}</th>
            <th>{S.matrixInAppCol}</th>
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_EVENT_TYPES.map((t) => {
            const row = NOTIFICATION_MATRIX[t];
            const locked = isNonConfigurableEvent(t);
            const emailArm = row.email as string;
            const inAppArm = row.inApp as string;
            // The two channel cells are STATEMENTS — a chained `) : locked ? (` inside JSX text
            // would read as an unowned string to the REQ-SAFE-10 containment scan.
            let emailCell: ReactNode;
            if (emailArm === "none") {
              emailCell = <span className="ui-set-t--sm ui-set-t--f">{S.emailNoneNote}</span>;
            } else if (locked) {
              emailCell = (
                <span data-locked="true" className="ui-set-t--sm ui-set-t--m">
                  {S.optOn}
                </span>
              );
            } else {
              emailCell = (
                <Select
                  name={`email_${t}`}
                  defaultValue={emailEnabled(prefs, t) ? "on" : "off"}
                  aria-label={`${S.notificationEvents[t] ?? humanizeKey(t)} — ${S.matrixEmailCol}`}
                  items={[
                    { value: "on", label: S.optOn },
                    { value: "off", label: S.optOff },
                    ...(emailArm === "digest" ? [{ value: "digest", label: S.optDigest }] : []),
                  ]}
                />
              );
            }
            let inAppCell: ReactNode;
            if (inAppArm === "none") {
              inAppCell = <span className="ui-set-t--sm ui-set-t--f">{S.emailNoneNote}</span>;
            } else if (locked) {
              inAppCell = (
                <span data-locked="true" className="ui-set-t--sm ui-set-t--m">
                  {S.optOn}
                </span>
              );
            } else if (t === "run_progress") {
              inAppCell = (
                <span data-per-project="true" className="ui-set-t--sm ui-set-t--m">
                  {S.runProgressNote}
                </span>
              );
            } else {
              inAppCell = (
                <Select
                  name={`inapp_${t}`}
                  defaultValue={(prefs.inApp?.[t] ?? row.defaultOn) ? "on" : "off"}
                  aria-label={`${S.notificationEvents[t] ?? humanizeKey(t)} — ${S.matrixInAppCol}`}
                  items={[
                    { value: "on", label: S.optOn },
                    { value: "off", label: S.optOff },
                  ]}
                />
              );
            }
            return (
              <tr key={t} data-notification-row={t}>
                <td>
                  {S.notificationEvents[t] ?? humanizeKey(t)}
                  {locked ? <span className="ui-set-t--sm ui-set-t--f">{S.lockedNote}</span> : null}
                </td>
                <td>{emailCell}</td>
                <td>{inAppCell}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <section aria-label={S.digestHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.digestHeading}</h2>
        <label className="ui-set-row">
          <Select
            name="digest_run_finished"
            defaultValue={prefs.digest?.run_finished === "hourly" ? "hourly" : "off"}
            aria-label={S.digestRunFinishedLabel}
            items={[
              { value: "off", label: S.optOff },
              { value: "hourly", label: S.optHourly },
            ]}
          />{" "}
          {S.digestRunFinishedLabel}
        </label>
      </section>
      <section aria-label={S.quietHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.quietHeading}</h2>
        <p className="ui-set-note">{S.quietNote}</p>
        <label className="ui-set-row">
          {/* REQ-VFY-6 — the SSR's textless label gives this select no accessible name. */}
          <Select
            name="qh_enabled"
            defaultValue={qh ? "on" : "off"}
            aria-label={S.quietEnable}
            items={[
              { value: "off", label: S.optOff },
              { value: "on", label: S.quietEnable },
            ]}
          />
        </label>
        <label className="ui-set-row">
          {/* REQ-VFY-6 — one label wraps two inputs; aria-label names each control explicitly. */}
          {S.quietStartLabel}:{" "}
          <TextField
            type="time"
            name="qh_start"
            defaultValue={qh ? toHHMM(qh.startMinutesUtc) : "21:00"}
            aria-label={S.quietStartLabel}
          />
          {S.quietEndLabel}:{" "}
          <TextField
            type="time"
            name="qh_end"
            defaultValue={qh ? toHHMM(qh.endMinutesUtc) : "07:00"}
            aria-label={S.quietEndLabel}
          />
        </label>
      </section>
      {data.projects && data.projects.length > 0 ? (
        <section aria-label={S.runProgressHeading} className="ui-set-sec">
          <h2 className="ui-set-h2">{S.runProgressHeading}</h2>
          <p className="ui-set-note">{S.runProgressNote}</p>
          {data.projects.map((proj) => (
            <label key={proj.id} className="ui-set-row ui-set-row--split">
              <span>{fmt(S.runProgressProjectFmt, { title: proj.title })}</span>
              <Select
                name={`rp_${proj.id}`}
                defaultValue={prefs.project?.[proj.id]?.run_progress === true ? "on" : "off"}
                aria-label={fmt(S.runProgressProjectFmt, { title: proj.title })}
                items={[
                  { value: "off", label: S.optOff },
                  { value: "on", label: S.optOn },
                ]}
              />
            </label>
          ))}
        </section>
      ) : null}
      <Button type="submit" size="sm">
        {S.saveCta}
      </Button>
    </form>
  );
}

// ---- §14.7 Integrations --------------------------------------------------------------------------

/** §14.7 Integrations (REQ-ACCT-2) — one card component per provider: connect / status / items /
 *  disconnect; disconnect removes the credential now and keeps samples. Verbatim port. */
export function IntegrationsSection({
  integrations,
}: {
  readonly integrations: IntegrationsSettingsDto | null;
}): ReactNode {
  const data = integrations;
  if (!data) {
    return (
      <p data-settings-unavailable="integrations" className="ui-set-note">
        {B.stripeDownNote}
      </p>
    );
  }
  const providers = ["substack", "medium", "gdrive"] as const;
  return (
    <>
      <p className="ui-set-note ui-set-sec">{S.integrationsNote}</p>
      {providers.map((provider) => {
        const prov = S.integrationProviders[provider] ?? { title: provider, reads: "", never: "" };
        const conns = data.connections.filter((conn) => conn.provider === provider);
        return (
          <div key={provider} data-integration-card={provider} className="ui-set-card">
            <h2 className="ui-set-h3 ui-set-t">{prov.title}</h2>
            <p className="ui-set-note">{prov.reads}</p>
            <p data-integration-never="true" className="ui-set-note ui-set-t--m">
              {prov.never}
            </p>
            {conns.length === 0 ? (
              <p className="ui-set-t--sm ui-set-t--f">
                {data.voices.length > 0 ? (
                  <a href={`/v/${data.voices[0]!.slug ?? data.voices[0]!.id}?tab=samples`}>
                    {S.integrationConnectCta}
                  </a>
                ) : (
                  S.integrationsEmpty
                )}
              </p>
            ) : (
              <ul className="ui-set-list ui-set-list--plain">
                {conns.map((conn) => (
                  <li key={conn.id} data-connection={conn.id} className="ui-set-t--sm">
                    <span data-conn-status={conn.status}>
                      {enumLabel(S.integrationStatusLabels, conn.status)}
                    </span>
                    {conn.handle ? (
                      <span className="ui-set-t--m">
                        {" · "}
                        {conn.handle}
                      </span>
                    ) : null}
                    {conn.persona.name ? (
                      <span className="ui-set-t--f">
                        {" · "}
                        {fmt(S.integrationPersonaFmt, { name: conn.persona.name })}
                      </span>
                    ) : null}
                    <span className="ui-set-t--f">
                      {" · "}
                      {fmt(S.integrationItemsFmt, {
                        items: conn.items,
                        included: conn.includedItems,
                      })}
                    </span>
                    {conn.lastSyncAt ? (
                      <span className="ui-set-t--f">
                        {" · "}
                        {fmt(S.integrationLastSyncFmt, { at: conn.lastSyncAt.slice(0, 10) })}
                      </span>
                    ) : null}
                    {conn.error ? (
                      <span data-conn-error="true" className="ui-set-t--warn">
                        {" · "}
                        {conn.error}
                      </span>
                    ) : null}
                    <form
                      method="post"
                      action={`/app/settings/integrations/${conn.id}/disconnect`}
                      className="ui-set-inline"
                    >
                      <Button type="submit" size="sm" data-disconnect="true">
                        {S.integrationDisconnectCta}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

// ---- REQ-ACCT-4's grace banner + the §14.7 Data section ------------------------------------------

/** REQ-ACCT-4 — the grace banner + the cancel form; shared by Account's pointer state and Data's
 *  control. Verbatim port. */
function DeletionBanner({
  deletion,
}: {
  readonly deletion: { requestedAt: string; graceEndsAt: string };
}): ReactNode {
  return (
    <div data-deletion-banner="true" className="ui-set-card ui-set-card--warn">
      <p className="ui-set-t ui-set-t--warn">
        {fmt(S.deletionScheduledFmt, { date: deletion.graceEndsAt.slice(0, 10) })}
      </p>
      <form method="post" action="/app/settings/account/delete/cancel">
        <Button type="submit" size="sm" data-deletion-cancel="true">
          {S.deletionCancelCta}
        </Button>
      </form>
    </div>
  );
}

/** The leaf-computed import-outcome row — the document's `accountExport.imported` mapping
 *  (`?p`,`?v`,`?f` → counts), verbatim. */
export interface SettingsImportNotice {
  readonly projects: number;
  readonly voices: number;
  readonly files: number;
}

/** §14.7 Data (Q-12, minimal): the privacy toggles, the support-access grant + visible log, the
 *  training-posture + residual-risk static text (verbatim), the Q-26 preference-learning toggle
 *  (verbatim copy), "Export everything", and the delete-account control. `notice`/`imported` are
 *  the leaf's URL-state mappings — never payload. */
export function DataSection({
  privacy,
  data,
  accountExport,
  notice,
  imported,
}: {
  readonly privacy: { readonly analyticsOptOut: boolean; readonly saved: boolean };
  readonly data: DataSettingsDto | null;
  readonly accountExport: { readonly export: AccountExportDto | null };
  readonly notice: string | undefined;
  readonly imported: SettingsImportNotice | undefined;
}): ReactNode {
  const acct = accountExport.export;
  return (
    <>
      {data?.deletion ? <DeletionBanner deletion={data.deletion} /> : null}
      <section aria-label={S.privacyHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.privacyHeading}</h2>
        <form method="post" action="/app/settings/data/privacy" data-privacy-form="true">
          <label className="ui-set-row">
            <Checkbox
              name="analyticsOptOut"
              defaultChecked={privacy.analyticsOptOut || (data?.analyticsOptOut ?? false)}
              data-analytics-toggle="true"
              aria-label={S.analyticsLabel}
            />
            {S.analyticsLabel}
          </label>
          <p className="ui-set-note">{S.analyticsNote}</p>
          <Button type="submit" size="sm">
            {S.saveCta}
          </Button>
          {privacy.saved ? (
            <span data-privacy-saved="true" className="ui-set-t--sm ui-set-t--ok ui-set-inline">
              {S.saved}
            </span>
          ) : null}
        </form>
        {data ? (
          <form
            method="post"
            action="/app/settings/data/support-access"
            data-support-access-form="true"
            className="ui-set-sec"
          >
            <label className="ui-set-row">
              <Checkbox
                name="enabled"
                defaultChecked={data.supportAccess.active}
                data-support-access-toggle="true"
                aria-label={S.supportAccessLabel}
              />
              {S.supportAccessLabel}
            </label>
            <p className="ui-set-note">{S.supportAccessNote}</p>
            {data.supportAccess.active && data.supportAccess.grant ? (
              <p data-support-active="true" className="ui-set-t--sm ui-set-t--ok">
                {fmt(S.supportAccessActiveFmt, {
                  at: data.supportAccess.grant.expiresAt.replace("T", " ").slice(0, 16),
                })}
              </p>
            ) : null}
            <Button type="submit" size="sm">
              {S.saveCta}
            </Button>
          </form>
        ) : null}
        {data ? (
          <div data-support-log="true" className="ui-set-sec">
            <h3 className="ui-set-h3">{S.supportAccessLogHeading}</h3>
            {data.supportAccess.log.length === 0 ? (
              <p className="ui-set-note">{S.supportAccessLogEmpty}</p>
            ) : (
              <ul className="ui-set-list ui-set-list--faint">
                {data.supportAccess.log.map((l) => (
                  <li key={l.id} data-support-log-row={l.action}>
                    {l.at.slice(0, 16).replace("T", " ")}
                    {" UTC — "}
                    {enumLabel(S.supportAccessActions, l.action)}
                    {l.detail ? (
                      <span className="ui-set-t--f">
                        {" · "}
                        {l.detail}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>
      <section aria-label={S.postureHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.postureHeading}</h2>
        <p data-training-posture="true" className="ui-set-t ui-set-t--meas">
          {S.trainingPosture}
        </p>
        <p className="ui-set-note">{S.dpaLine}</p>
      </section>
      <section aria-label={S.preferenceHeading} className="ui-set-sec">
        <h2 className="ui-set-h2">{S.preferenceHeading}</h2>
        {/* §11.7's Q-26 copy verbatim — capture-only at MVP; the Editor never sees it. */}
        <p data-preference-copy="true" className="ui-set-t ui-set-t--meas">
          {S.preferenceCopy}
        </p>
        <form
          method="post"
          action="/app/settings/data/preference-learning"
          data-preference-form="true"
        >
          <label className="ui-set-row">
            <Checkbox
              name="learning"
              defaultChecked={!(data?.preferenceOptOut ?? false)}
              data-preference-toggle="true"
              aria-label={S.preferenceToggleLabel}
            />
            {S.preferenceToggleLabel}
          </label>
          <p className="ui-set-note">{S.preferenceOffNote}</p>
          <Button type="submit" size="sm">
            {S.saveCta}
          </Button>
        </form>
      </section>
      {/* P1.18 — the whole-account zip (REQ-ACCT-3): "Export everything" queues the build and the
          download link arrives by email (7-day expiry); the restore half replays an export zip
          into this account — a re-import is a no-op. The download link is a document navigation
          (REQ-BFF-17 — binary bytes never ride fetch). */}
      <section aria-label={S.exportHeading} className="ui-set-sec" data-account-export="true">
        <h2 className="ui-set-h2">{AX.heading}</h2>
        <p className="ui-set-note">{AX.lede}</p>
        {acct?.status === "building" ? (
          <p data-export-status="building" className="ui-set-t ui-set-t--m">
            {AX.building}
          </p>
        ) : null}
        {acct?.status === "ready" && !acct.expired ? (
          <p data-export-status="ready" className="ui-set-t ui-set-t--m">
            {AX.readyFmt.replace("{date}", (acct.expiresAt ?? "").slice(0, 10))}{" "}
            <a
              href={`/app/settings/data/export/download?id=${acct.id}`}
              data-export-download="true"
              data-spa-native
            >
              {AX.downloadCta}
            </a>
          </p>
        ) : null}
        {acct?.status === "ready" && acct.expired ? (
          <p data-export-status="expired" className="ui-set-t ui-set-t--m">
            {AX.expired}
          </p>
        ) : null}
        {acct?.status === "failed" ? (
          <p data-export-status="failed" className="ui-set-t ui-set-t--m">
            {AX.failedFmt.replace("{error}", acct.error ?? "unknown")}
          </p>
        ) : null}
        {notice === "requested" ? (
          <p data-export-notice="true" className="ui-set-t--sm ui-set-t--ok">
            {AX.building}
          </p>
        ) : null}
        <form method="post" action="/app/settings/data/export" data-export-request-form="true">
          <Button type="submit" size="sm">
            {AX.cta}
          </Button>
        </form>
        <h3 className="ui-set-h3 ui-set-sec">{AX.importHeading}</h3>
        <p className="ui-set-note">{AX.importNote}</p>
        <form
          method="post"
          action="/app/settings/data/import"
          encType="multipart/form-data"
          data-account-import="true"
        >
          <label className="ui-set-row">
            {AX.importLabel}:{" "}
            <TextField
              type="file"
              name="archive"
              accept=".zip,application/zip"
              required
              aria-label={AX.importLabel}
            />
          </label>
          <Button type="submit" size="sm">
            {AX.importCta}
          </Button>
        </form>
        {notice === "imported" && imported ? (
          <p data-import-notice="imported" className="ui-set-t--sm ui-set-t--ok">
            {AX.importDoneFmt
              .replace("{projects}", String(imported.projects))
              .replace("{voices}", String(imported.voices))
              .replace("{files}", String(imported.files))}
          </p>
        ) : null}
        {notice === "deduped" ? (
          <p data-import-notice="deduped" className="ui-set-t--sm ui-set-t--m">
            {AX.importDeduped}
          </p>
        ) : null}
        {notice === "importFailed" ? (
          <p data-import-notice="failed" className="ui-set-t--sm">
            {AX.importFailed}
          </p>
        ) : null}
      </section>
      {/* REQ-ACCT-4 — typed confirmation → the 14-day grace → the worker's hard-delete; cancel inside
          the window. The banner at the section top mirrors the status while the grace runs. */}
      <section aria-label={S.deletionHeading} className="ui-set-sec" id="delete">
        <h2 className="ui-set-h2">{S.deletionHeading}</h2>
        <p className="ui-set-note ui-set-t--meas">{S.deletionLede}</p>
        {data?.deletion ? null : (
          <form method="post" action="/app/settings/account/delete" data-delete-account-form="true">
            <label className="ui-set-row">
              {S.deletionConfirmLabel}:{" "}
              <TextField
                type="text"
                name="confirmation"
                required
                pattern={ACCOUNT_DELETION_CONFIRMATION}
                autoComplete="off"
              />
            </label>
            <Button type="submit" size="sm" variant="danger">
              {S.deletionCta}
            </Button>
          </form>
        )}
      </section>
    </>
  );
}

// ---- /p/:p/settings ------------------------------------------------------------------------------

/** P1.20 — `/p/:project/settings` (§4.2): the REQ-GENRE-2 safe protocol fields + venue + defaults
 *  (per-project wins over the account defaults), the P1.09 approval-policy surface (REQ-GATE-3),
 *  and the standing-guidance management half (REQ-GATE-10). The approvals section is the SHARED
 *  composition — ../../approval-settings.js — so a REQ-SPEC-1 option change lands on both
 *  renderers at once. */
export function ProjectSettingsBody({
  projectSettings,
  saved,
  notice,
  voiceLocked,
  contentKey,
  onSubmit,
  routeSlug,
}: {
  readonly projectSettings: BffProjectSettingsTwin["projectSettings"] | null;
  /** the route param — the unavailable arm's crumb needs it (the twin is absent there). */
  readonly routeSlug?: string;
  readonly saved: boolean;
  readonly notice: string | undefined;
  /** R7HOME.2b — the `?voice_locked=1` soft-lock echo (was the overview's). */
  readonly voiceLocked?: boolean;
  /** The leaf's search state — an envelope-nav remounts the uncontrolled forms on server truth. */
  readonly contentKey: string;
  /** The delegated JSON submit — absent under `renderToStaticMarkup` (the body's forms post natively). */
  readonly onSubmit?: (e: FormEvent<HTMLElement>) => void;
}): ReactNode {
  const PS = S.projectSettings;
  if (!projectSettings) {
    return (
      <div data-spa-surface>
        <PageBody>
          {/* F-R7DEP.2-5ev — the unavailable arm keeps the Project › Surface crumb. */}
          <PageHeader
            title={PS.heading}
            {...(routeSlug != null
              ? { crumbs: [{ label: routeSlug, href: `/p/${routeSlug}` }, { label: PS.heading }] }
              : {})}
          />
          {/* UXC-12 — the outage note is this page's own key, never billing's stripeDownNote. */}
          <p className="ui-set-note" data-settings-unavailable="project">
            {PS.unavailable}
          </p>
        </PageBody>
      </div>
    );
  }
  const ps = projectSettings;
  const p = ps.settings.project;
  const slug = ps.slug;
  const ov = p.protocolOverrides ?? {};
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <PageBody>
        <PageHeader
          title={PS.heading}
          crumbs={[{ label: p.title ?? slug, href: `/p/${slug}` }, { label: PS.heading }]}
        />
        {p.protocolChangedAt ? (
          <p data-protocol-changed="true" className="ui-set-t ui-set-t--warn">
            {PS.changedNote}
          </p>
        ) : null}
        {saved ? (
          <p data-settings-saved="true" className="ui-set-t ui-set-t--ok">
            {PS.saved}
          </p>
        ) : null}
        {notice ? (
          <p data-settings-notice="true" className="ui-set-t ui-set-t--warn">
            {notice}
          </p>
        ) : null}
        <div key={contentKey} className="ui-set-main">
          {/* R7HOME.2b (REQ-HOME-2, I5) — the voice PICKER moved here from the overview verbatim
              (§9.6; REQ-DATA-32): persona select + the one register pick + the pin hatches, each
              posting the same /p/:slug/voice* writes the overview issued. */}
          <section aria-label={PS.voiceHeading} className="ui-set-sec" data-voice-picker="true">
            <h2 className="ui-set-h2">{PS.voiceHeading}</h2>
            {p.persona ? (
              <p className="ui-set-t">
                <a href={`/v/${p.persona.slug ?? p.persona.id}`}>
                  {p.persona.name ?? p.persona.id}
                </a>
              </p>
            ) : null}
            {projectSettings.projectVoice ? (
              <>
                <form method="post" action={`/p/${slug}/voice`}>
                  <label className="ui-set-row ui-set-t--m">
                    <Select
                      name="personaId"
                      defaultValue={projectSettings.projectVoice.current.personaId ?? ""}
                      aria-label={PS.voiceHeading}
                      items={[
                        { value: "", label: COPY.voice.picker.noVoice },
                        ...projectSettings.projectVoice.options.map((o) => ({
                          value: o.personaId,
                          label: o.name ?? o.personaId,
                        })),
                      ]}
                    />
                    {/* P1.14 — ONE register pick on a multi-register voice (§9.6): a run input, never a pin. */}
                    {(() => {
                      const cur = projectSettings.projectVoice.options.find(
                        (o) => o.personaId === projectSettings.projectVoice?.current.personaId,
                      );
                      const regs = cur?.registers ?? [];
                      return regs.length > 1 ? (
                        <Select
                          name="register"
                          defaultValue=""
                          aria-label={COPY.voice.picker.registerDefault}
                          data-register-pick="true"
                          items={[
                            { value: "", label: COPY.voice.picker.registerDefault },
                            ...regs.map((r) => ({ value: r, label: r })),
                          ]}
                        />
                      ) : null;
                    })()}
                    {projectSettings.projectVoice.current.voiceMode === "linked" &&
                    projectSettings.projectVoice.current.status ? (
                      <span
                        data-voice-pill={projectSettings.projectVoice.current.status.pill.tone}
                        className="ui-set-t--sm ui-set-t--f"
                      >
                        {projectSettings.projectVoice.current.status.pill.label}
                      </span>
                    ) : (
                      <span className="ui-set-t--sm ui-set-t--f">
                        {COPY.voice.picker.noVoiceNote}
                      </span>
                    )}
                  </label>
                  <Button type="submit" size="sm">
                    {COPY.voice.picker.save}
                  </Button>
                </form>
                {voiceLocked === true ? (
                  <p data-voice-locked="true" role="alert" className="ui-set-t--sm ui-set-t--warn">
                    {COPY.voice.detail.voiceLockedNotice}
                  </p>
                ) : null}
                {projectSettings.projectVoice.current.pinnedStale ? (
                  <div data-pinned-stale="true" className="ui-set-t--sm ui-set-sec">
                    <p className="ui-set-t--m">{COPY.voice.detail.pinnedStaleNotice}</p>
                    <div className="ui-set-form">
                      <form method="post" action={`/p/${slug}/voice/adopt`}>
                        <Button type="submit" variant="ghost" size="sm" data-adopt-voice="true">
                          {COPY.voice.detail.adoptCta}
                        </Button>
                      </form>
                      <a href={`/p/${slug}/voice/reseed`} className="ui-set-t--sm">
                        {COPY.voice.detail.reseedPreviewCta}
                      </a>
                      <form method="post" action={`/p/${slug}/voice/fork`}>
                        <HiddenField
                          name="personaId"
                          value={projectSettings.projectVoice.current.personaId ?? ""}
                        />
                        <Button type="submit" variant="ghost" size="sm" data-fork-project="true">
                          {COPY.voice.detail.forkProjectCta}
                        </Button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="ui-set-t ui-set-t--f">{PS.voiceNone}</p>
            )}
          </section>
          <form method="post" action={`/p/${slug}/settings`}>
            <section aria-label={PS.protocolHeading} className="ui-set-sec">
              <h2 className="ui-set-h2">{PS.protocolHeading}</h2>
              <label className="ui-set-row">
                {PS.venueLabel}: <TextField type="text" name="venue" defaultValue={p.venue ?? ""} />
              </label>
              {ps.settings.protocols.length > 0 ? (
                <label className="ui-set-row">
                  {PS.protocolLabel}:{" "}
                  <Select
                    name="protocolId"
                    defaultValue={p.protocolId ?? ""}
                    aria-label={PS.protocolLabel}
                    // R7SYNC.1 (REQ-SYNC-5) — each option carries its OWN estimator figure
                    // (the api-composed typical Review credits + duration band), never the
                    // audit's one shared review-band constant for every protocol.
                    items={ps.settings.protocols.map((proto) => {
                      const card = ps.protocolCards?.find((c) => c.id === proto.id);
                      const est =
                        card?.typicalReviewCredits != null && card?.typicalReviewDuration != null
                          ? ` — ${COPY.projectHome.estimateFmt
    .replace("{n}", card.typicalReviewCredits.toLocaleString("en-US"))} · ~${card.typicalReviewDuration.lowMinutes}–${card.typicalReviewDuration.highMinutes} min`
                          : "";
                      return { value: proto.id, label: `${proto.name}${est}` };
                    })}
                  />
                </label>
              ) : null}
              <label className="ui-set-row">
                {PS.rigorLabel}:{" "}
                <Select
                  name="rigorDefault"
                  defaultValue={p.rigorDefault ?? ""}
                  aria-label={PS.rigorLabel}
                  items={[
                    { value: "", label: PS.rigorInherit },
                    ...RIGORS.map((r) => ({ value: r, label: RIGOR_DISPLAY[r] })),
                  ]}
                />
              </label>
              <label className="ui-set-row">
                {PS.tierLabel}:{" "}
                <Select
                  name="modelTierDefault"
                  defaultValue={p.modelTierDefault ?? ""}
                  aria-label={PS.tierLabel}
                  items={[
                    { value: "", label: PS.rigorInherit },
                    ...MODEL_TIERS.map((t) => ({ value: t, label: MODEL_TIER_DISPLAY[t] })),
                  ]}
                />
              </label>
              <label className="ui-set-row">
                {PS.paperThemeLabel}:{" "}
                <Select
                  name="paperTheme"
                  defaultValue={p.paperTheme}
                  aria-label={PS.paperThemeLabel}
                  items={[
                    { value: "follow", label: S.paperThemeFollow },
                    { value: "light", label: S.paperThemeLight },
                    { value: "dark", label: S.paperThemeDark },
                  ]}
                />
              </label>
              <label className="ui-set-row">
                {PS.stageLabel}:{" "}
                <Select
                  name="stage"
                  defaultValue={ov.stage ?? ""}
                  aria-label={PS.stageLabel}
                  items={[
                    { value: "", label: PS.stages.infer },
                    { value: "early", label: PS.stages.early },
                    { value: "near_final", label: PS.stages.near_final },
                  ]}
                />
              </label>
              <p className="ui-set-note">{PS.stageNote}</p>
              <label className="ui-set-row">
                {PS.lengthLabel}:{" "}
                <TextField
                  type="number"
                  name="ov_length"
                  min={1}
                  defaultValue={ov.length ?? undefined}
                  className="ui-field--w"
                />
              </label>
              <p className="ui-set-note">{PS.lengthNote}</p>
              <fieldset className="ui-set-fs">
                <legend>{PS.phaseDefaultsHeading}</legend>
                {(Object.keys(PS.phaseDefaults) as Array<keyof typeof PS.phaseDefaults>).map(
                  (phase) => {
                    const phaseDefault = (
                      ov.phaseDefaults as Record<string, boolean | undefined> | undefined
                    )?.[phase];
                    return (
                      <label key={phase} className="ui-set-row ui-set-row--split">
                        <span>{PS.phaseDefaults[phase]}</span>
                        <Select
                          name={`pd_${phase}`}
                          defaultValue={
                            phaseDefault === true ? "on" : phaseDefault === false ? "off" : ""
                          }
                          aria-label={PS.phaseDefaults[phase]}
                          items={[
                            { value: "", label: PS.phaseOptDefault },
                            { value: "on", label: PS.phaseOptOn },
                            { value: "off", label: PS.phaseOptOff },
                          ]}
                        />
                      </label>
                    );
                  },
                )}
              </fieldset>
            </section>
            <Button type="submit" size="sm">
              {PS.saveCta}
            </Button>
          </form>
          {/* REQ-GATE-3/10 — P1.09's approval-policy + standing-guidance surface. Changing the policy
              never alters an open card; guidance edits route through the settings POSTs. */}
          {ps.approvalSettings ? (
            <ApprovalSettingsSection
              slug={slug}
              settings={ps.approvalSettings}
              returnTo={`/p/${slug}/settings`}
              editable
            />
          ) : (
            // R7HOME.2b — the PRB.05 opt-in fallback moved here with the admin block (was the
            // overview's): without a settings read the 24h triage approve still has a home.
            <form
              method="post"
              action={`/p/${slug}/approval-overrides`}
              data-approval-opt-in="true"
              className="ui-set-card ui-set-sec ui-set-t--meas"
            >
              <h2 className="ui-set-h3 ui-set-t">{COPY.gates.optInHeading}</h2>
              <label className="ui-set-row ui-set-t--m">
                <Checkbox
                  name="approve_triage_24h"
                  defaultChecked={typeof ps.approvalOverrides?.approve_triage === "number"}
                  aria-label={COPY.gates.optInLabel}
                />
                {COPY.gates.optInLabel}
              </label>
              <p className="ui-set-note">{COPY.gates.optInNote}</p>
              <Button type="submit" size="sm">
                {COPY.gates.optInSave}
              </Button>
            </form>
          )}
          <section aria-label={PS.tagsHeading} className="ui-set-sec">
            <h2 className="ui-set-h2">{PS.tagsHeading}</h2>
            {p.tags.length > 0 ? (
              <p className="ui-set-t">{p.tags.join(", ")}</p>
            ) : (
              <p className="ui-set-note">{PS.tagsPlaceholder}</p>
            )}
          </section>
        </div>
      </PageBody>
    </div>
  );
}

/** The `/p/:project/settings` leaf mount — supplies the body's delegated JSON submit upgrade. */
export function ProjectSettingsSurface(props: {
  readonly projectSettings: BffProjectSettingsTwin["projectSettings"] | null;
  readonly routeSlug?: string;
  readonly saved: boolean;
  readonly notice: string | undefined;
  readonly voiceLocked?: boolean;
  readonly contentKey: string;
}): ReactNode {
  const onSubmit = useSettingsFormSubmit();
  return <ProjectSettingsBody {...props} onSubmit={onSubmit} />;
}
