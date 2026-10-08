// SPA.12 — the `settings` surface's React twins (REQ-SEQ-9, REQ-BFF-1/9/16, REQ-DAT-4, REQ-TST-2,
// REQ-VFY-2; design/22 §2 settings rows). `SettingsFrame` + the five section components port
// pages.tsx `SettingsPage`'s sections verbatim — the same `<Shell>`/`<PageTitle>`/nav chrome, the
// same `data-*` vocabulary — on data read through the `settings*Query` twins instead of
// `usePageData()`. `ProjectSettingsSurface` ports `ProjectSettingsPage`. Every hook literal
// resolves to dom-contract.ts; nothing unmanifested is invented.
//
// Port notes (the places a React mount CANNOT be a byte-copy):
//   • section headings are promoted one level (`h3`→`h2`, `h4`→`h3`) — the usage surface's
//     heading-order precedent: PageTitle is the h1 and axe's `heading-order` is part of the
//     component leg. Hooks + copy are unchanged.
//   • forms keep their SSR markup verbatim (`method="post"`, the action path, the field
//     vocabulary — the no-JS fallback is the same element) but a delegated `onSubmit` on the
//     `data-spa-surface` wrapper intercepts every settings form: `bffFetch` posts the flat
//     fields (the same vocabulary `wantsJson`'s server branch decodes), follows the
//     `{ok, redirect|url}` envelope — `redirect` is an in-router nav so the `?saved`/`?notice`
//     flash renders, `url` is a document nav (server-validated external hand-off) — and
//     `["bff"]` invalidates on settle so the repaint is server-truth, never optimistic
//     mirroring (a refused write leaves the controls on their persisted values — the leaf's
//     search-key remount re-initializes the uncontrolled inputs). The in-flight form carries
//     `aria-busy` + disabled controls (REQ-UX-16); the import form stays `FormData`
//     (`init.form` — multipart never becomes a JSON field, REQ-BFF-17).
//   • `data-settings-unavailable` renders when the twin degraded a seam to `null` — the SSR's
//     `if (!acct)` branch verbatim, never a fabricated default.
//   • flash params (`saved`/`notice`/`p`/`v`/`f`) arrive as props from the leaf's validated
//     search — URL state, never payload — with the SAME mapping the document's PageData
//     composition ran (`notice→accountExport.notice`, `p,v,f→imported`).
//   • `Edit` copy in the approvals grid lives in ../../approval-settings.js — the shared
//     composition both renderers call (gate-card precedent).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { FormEvent, ReactNode } from "react";
import { PageTitle, Shell } from "@rhema/ui";
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
import { COPY } from "../../copy.js";
import { ApprovalSettingsSection } from "../../approval-settings.js";
import { bffFetch } from "../bff.js";
import { navigateDocument } from "../dom.js";
import type { BffProjectSettingsTwin, BffSettingsNotificationsTwin } from "../queries.js";

// Destructure the COPY branches once — the REQ-SAFE-10 leaf scan keys on `COPY.<path>` literals;
// the branch handles keep the same leaves without re-walking the table in JSX.
const { settings: S, billing: B, accountExport: AX, project: PRJ } = COPY;

/** `{key}`-template substitution — the local twin of pages.tsx's `fmt` (one helper, both renderers). */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function footer(): ReactNode {
  return <span>{COPY.footer}</span>;
}

// ---- The SSR's shared settings micro-styles, verbatim (pages.tsx 4026-4043) -------------------

const settingsRowStyle = { display: "flex", gap: "8px", alignItems: "baseline", fontSize: "13px", color: "var(--shell-fg)", margin: "8px 0" } as const;
const settingsNoteStyle = { fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 8px" } as const;
const settingsInputStyle = {
  fontSize: "13px",
  padding: "6px 10px",
  borderRadius: "7px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
} as const;
const settingsSectionStyle = { marginTop: "22px" } as const;
/** The h3 → h2 promotion (the heading-order note above) — same style object, one level up. */
const settingsH2 = { fontSize: "14px", margin: "0 0 8px" } as const;
const settingsCardStyle = {
  padding: "10px 14px",
  border: "1px solid var(--shell-border)",
  borderRadius: "8px",
  margin: "8px 0",
} as const;

function humanizeKey(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
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

/**
 * The one settings-form submit handler — a delegation the `data-spa-surface` wrapper attaches so
 * every section's verbatim form rides the JSON branch without prop-threading. `e.target` IS the
 * form (submit events target it; the handler sits on the wrapper for the bubble). A form already
 * `aria-busy` is an in-flight POST — REQ-BFF-30's no-retry rule makes a second dispatch a lie, so
 * the guard swallows the click.
 */
/** What a submit hands the mutation — the fields are collected BEFORE the busy pass (see above). */
interface SettingsFormPost {
  readonly form: HTMLFormElement;
  readonly action: string;
  readonly json?: Record<string, string>;
  readonly body?: FormData;
}

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
 *  the strangler re-decides each leaf; `data-status` would diverge the emitted DOM). */
function SettingsNav({ active }: { readonly active: string }): ReactNode {
  return (
    <nav
      aria-label={S.sectionsAria}
      data-settings-nav="true"
      style={{ display: "flex", gap: "14px", flexWrap: "wrap", margin: "10px 0 20px", fontSize: "13px" }}
    >
      {(["account", "preferences", "notifications", "integrations", "billing", "data"] as const).map((s) => (
        <a
          key={s}
          href={`/app/settings/${s}`}
          data-section={s}
          aria-current={active === s ? "page" : undefined}
          style={{
            color: active === s ? "var(--shell-fg)" : "var(--shell-fg-muted)",
            fontWeight: active === s ? 600 : 400,
          }}
        >
          {S.sectionLabels[s]}
        </a>
      ))}
    </nav>
  );
}

/**
 * The settings page chrome — `Shell` + `PageTitle` + the section strip + the `?saved` flash line,
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
      <Shell brand={COPY.brand} nav={<a href="/app">{PRJ.backToList}</a>} footer={footer()}>
        <PageTitle>{S.heading}</PageTitle>
        <SettingsNav active={section} />
        <div key={contentKey} style={{ maxWidth: "640px" }}>
          {saved ? (
            <p data-settings-saved="true" style={{ fontSize: "13px", color: "var(--state-ready)", margin: "4px 0 10px" }}>{S.saved}</p>
          ) : null}
          {children}
        </div>
      </Shell>
    </div>
  );
}

// ---- §14.7 Account ------------------------------------------------------------------------------

/** §14.7 Account — name/byline/avatar, the magic-link email change, sign-in methods, sessions with
 *  revoke, and the delete-account pointer (the control itself lives in Data). Verbatim port. */
export function AccountSection({ account }: { readonly account: AccountSettingsDto | null }): ReactNode {
  const acct = account;
  if (!acct) {
    return <p data-settings-unavailable="account" style={settingsNoteStyle}>{B.stripeDownNote}</p>;
  }
  return (
    <>
      {/* the deletion grace banner — the 14-day clock shows on every section's top surface. */}
      {acct.deletion ? <DeletionBanner deletion={acct.deletion} /> : null}
      <section aria-label={S.profileHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.profileHeading}</h2>
        <form method="post" action="/app/settings/account">
          <label style={settingsRowStyle}>
            {S.nameLabel}:{" "}
            <input type="text" name="name" defaultValue={acct.user.name ?? ""} required style={settingsInputStyle} />
          </label>
          <label style={settingsRowStyle}>
            {S.bylineLabel}:{" "}
            <input type="text" name="byline" defaultValue={acct.user.byline ?? ""} style={settingsInputStyle} />
          </label>
          <p style={settingsNoteStyle}>{S.bylineNote}</p>
          <label style={settingsRowStyle}>
            {S.avatarLabel}:{" "}
            <input type="url" name="image" defaultValue={acct.user.image ?? ""} style={settingsInputStyle} />
          </label>
          <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
        </form>
      </section>
      <section aria-label={S.emailLabel} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.emailLabel}</h2>
        <p style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0" }}>
          {acct.user.email}{" "}
          <span style={{ fontSize: "11px", color: acct.user.emailVerified ? "var(--state-ready)" : "var(--shell-fg-faint)" }}>
            {acct.user.emailVerified ? S.emailVerified : S.emailUnverified}
          </span>
        </p>
        {acct.user.pendingEmail ? (
          <p data-email-pending="true" style={settingsNoteStyle}>
            {fmt(S.emailPendingFmt, { email: acct.user.pendingEmail })}
          </p>
        ) : null}
        <form method="post" action="/app/settings/account/email">
          <label style={settingsRowStyle}>
            {S.emailChangeLabel}:{" "}
            <input type="email" name="email" required style={settingsInputStyle} />
          </label>
          <p style={settingsNoteStyle}>{S.emailChangeNote}</p>
          <button type="submit" style={{ fontSize: "13px" }}>{S.emailChangeCta}</button>
        </form>
      </section>
      <section aria-label={S.signInHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.signInHeading}</h2>
        <ul style={{ margin: "4px 0", paddingLeft: "18px", fontSize: "13px", color: "var(--shell-fg)" }}>
          {acct.signInMethods.map((m) => (
            <li key={m.kind} data-signin-method={m.kind}>
              {m.label}
              {m.detail ? <span style={{ color: "var(--shell-fg-faint)" }}>{" — "}{m.detail}</span> : null}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label={S.sessionsHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.sessionsHeading}</h2>
        <p style={settingsNoteStyle}>{S.sessionsNote}</p>
        <ul style={{ margin: "4px 0", paddingLeft: "18px", fontSize: "13px", color: "var(--shell-fg)", display: "flex", flexDirection: "column", gap: "6px" }}>
          {acct.sessions.map((s) => (
            <li key={s.id} data-session={s.id}>
              {s.userAgent ?? s.ipAddress ?? s.id}
              {s.current ? (
                <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--state-ready)" }}>{S.sessionThisDevice}</span>
              ) : null}
              <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--shell-fg-faint)" }}>
                {fmt(S.sessionExpiresFmt, { at: s.expiresAt.slice(0, 10) })}
              </span>
              {!s.current ? (
                <form method="post" action="/app/settings/sessions/revoke" style={{ display: "inline", marginLeft: "8px" }}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <button type="submit" data-revoke-session="true" style={{ fontSize: "11px" }}>{S.sessionRevokeCta}</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {/* §14.7 lists "delete account" under Account; the typed-confirmation control lives in Data —
          the link keeps the section's contents honest without two destructive forms. */}
      <section aria-label={S.deletionHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.deletionHeading}</h2>
        <p style={{ fontSize: "13px", margin: "4px 0" }}>
          <a href="/app/settings/data#delete" style={{ color: "var(--sev-major)" }}>{S.deletionHeading}{" →"}</a>
        </p>
      </section>
    </>
  );
}

// ---- §14.7 Preferences --------------------------------------------------------------------------

/** §14.7 Preferences — account defaults (a project's own settings always win); no raw model names.
 *  Verbatim port; `""` selects carry the null-unset semantics the server decodes. */
export function PreferencesSection({ preferences }: { readonly preferences: PreferencesSettingsDto | null }): ReactNode {
  if (!preferences) {
    return <p data-settings-unavailable="preferences" style={settingsNoteStyle}>{B.stripeDownNote}</p>;
  }
  const p = preferences.prefs;
  return (
    <form method="post" action="/app/settings/preferences" style={{ marginTop: "8px" }}>
      <section aria-label={S.tierHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.tierHeading}</h2>
        <label style={settingsRowStyle}>
          <input type="radio" name="defaultModelTier" value="" defaultChecked={p.defaultModelTier == null} />{" "}
          {S.tierAutoLabel}
        </label>
        <p style={settingsNoteStyle}>{S.tierAutoNote}</p>
        {MODEL_TIERS.map((t) => (
          <label key={t} style={settingsRowStyle} data-tier={t}>
            <input type="radio" name="defaultModelTier" value={t} defaultChecked={p.defaultModelTier === t} />{" "}
            {S.tierWhen[t] ?? MODEL_TIER_DISPLAY[t]}
          </label>
        ))}
      </section>
      <section aria-label={S.rigorHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.rigorHeading}</h2>
        <label style={settingsRowStyle}>
          {/* REQ-VFY-6 — the SSR's textless label wrapper leaves this select nameless; the SPA's
              component-axe leg requires the programmatic name (adds `aria-label`, changes no hook). */}
          <select name="defaultRigor" defaultValue={p.defaultRigor ?? ""} aria-label={S.rigorHeading} style={{ fontSize: "13px" }}>
            <option value="">{RIGOR_DISPLAY.standard} ({S.rigorDefaultOpt.toLowerCase()})</option>
            {RIGORS.map((r) => (
              <option key={r} value={r}>{RIGOR_DISPLAY[r]}</option>
            ))}
          </select>
        </label>
        <p style={settingsNoteStyle}>{S.rigorNote}</p>
        <fieldset style={{ border: "none", margin: "10px 0 0", padding: 0 }}>
          <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)" }}>{S.rigorByWorkflowHeading}</legend>
          <p style={settingsNoteStyle}>{S.rigorByWorkflowNote}</p>
          <div data-rigor-by-workflow="true" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {USER_LAUNCHED_WORKFLOW_KEYS.map((w) => (
              <label key={w} style={{ ...settingsRowStyle, justifyContent: "space-between" }}>
                <span>{humanizeKey(w)}</span>
                <select name={`rigor_${w}`} defaultValue={p.rigorByWorkflow?.[w] ?? ""} style={{ fontSize: "12px" }}>
                  <option value="">{S.rigorDefaultOpt}</option>
                  {RIGORS.map((r) => (
                    <option key={r} value={r}>{RIGOR_DISPLAY[r]}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <section aria-label={S.approvalHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.approvalHeading}</h2>
        <p style={settingsNoteStyle}>{S.approvalNote}</p>
        {/* an absent account pref means Named approvals (§5.6's default) — picking it stores the
            explicit value, which is equivalent. */}
        {APPROVAL_POLICIES.map((a) => (
          <label key={a} style={settingsRowStyle} data-approval-policy={a}>
            <input type="radio" name="approvalPolicy" value={a} defaultChecked={(p.approvalPolicy ?? "named") === a} />{" "}
            {S.approvalPolicies[a]}
          </label>
        ))}
      </section>
      <section aria-label={S.consentHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.consentHeading}</h2>
        <label style={settingsRowStyle}>
          {S.consentLabel}:{" "}
          <input
            type="number"
            name="consentUnder"
            min={0}
            max={1000}
            defaultValue={preferences.consentDontAskUnder}
            style={{ ...settingsInputStyle, width: "110px" }}
          />
        </label>
        <p style={settingsNoteStyle}>{S.consentNote}</p>
      </section>
      <section aria-label={S.editorHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.editorHeading}</h2>
        <label style={settingsRowStyle}>
          {S.paperThemeLabel}:{" "}
          <select name="paperTheme" defaultValue={p.editor?.paperTheme ?? ""} style={{ fontSize: "13px" }}>
            <option value="">{S.rigorDefaultOpt}</option>
            <option value="light">{S.paperThemeLight}</option>
            <option value="dark">{S.paperThemeDark}</option>
            <option value="follow">{S.paperThemeFollow}</option>
          </select>
        </label>
        <label style={settingsRowStyle}>
          {S.fontPresetLabel}:{" "}
          <select name="fontPreset" defaultValue={p.editor?.fontPreset ?? ""} style={{ fontSize: "13px" }}>
            <option value="">{S.rigorDefaultOpt}</option>
            <option value="serif">{S.fontSerif}</option>
            <option value="sans">{S.fontSans}</option>
            <option value="mono">{S.fontMono}</option>
          </select>
        </label>
        <label style={settingsRowStyle}>
          {S.fontSizeLabel}:{" "}
          <select name="fontSizeStep" defaultValue={p.editor?.fontSizeStep != null ? String(p.editor.fontSizeStep) : ""} style={{ fontSize: "13px" }}>
            <option value="">{S.rigorDefaultOpt}</option>
            {[-2, -1, 0, 1, 2].map((n) => (
              <option key={n} value={String(n)}>{n > 0 ? `+${n}` : String(n)}</option>
            ))}
          </select>
        </label>
        <p style={settingsNoteStyle}>{S.fontSizeNote}</p>
        <label style={settingsRowStyle}>
          {S.themeHeading}:{" "}
          <select name="appTheme" defaultValue={preferences.appTheme} style={{ fontSize: "13px" }}>
            <option value="dark">{S.themeDark}</option>
            <option value="light">{S.themeLight}</option>
            <option value="auto">{S.themeAuto}</option>
          </select>
        </label>
        <p style={settingsNoteStyle}>{S.themeNote}</p>
      </section>
      <p style={settingsNoteStyle}>{S.perProjectNote}</p>
      <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
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
    return <p data-settings-unavailable="notifications" style={settingsNoteStyle}>{B.stripeDownNote}</p>;
  }
  const prefs: NotificationPrefsDto["prefs"] = data.prefs;
  const qh = data.quietHours;
  const toHHMM = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return (
    <form method="post" action="/app/settings/notifications" data-notifications-form="true" style={{ marginTop: "8px" }}>
      <table data-notification-matrix="true" style={{ borderCollapse: "collapse", fontSize: "13px", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 14px 4px 0", color: "var(--shell-fg-faint)", fontWeight: 500 }}>{S.matrixEventCol}</th>
            <th style={{ textAlign: "left", padding: "4px 14px 4px 0", color: "var(--shell-fg-faint)", fontWeight: 500 }}>{S.matrixEmailCol}</th>
            <th style={{ textAlign: "left", padding: "4px 0", color: "var(--shell-fg-faint)", fontWeight: 500 }}>{S.matrixInAppCol}</th>
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
              emailCell = <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>{S.emailNoneNote}</span>;
            } else if (locked) {
              emailCell = <span data-locked="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>{S.optOn}</span>;
            } else {
              emailCell = (
                <select name={`email_${t}`} defaultValue={emailEnabled(prefs, t) ? "on" : "off"} aria-label={`${S.notificationEvents[t] ?? humanizeKey(t)} — ${S.matrixEmailCol}`} style={{ fontSize: "12px" }}>
                  <option value="on">{S.optOn}</option>
                  <option value="off">{S.optOff}</option>
                  {emailArm === "digest" ? <option value="digest">{S.optDigest}</option> : null}
                </select>
              );
            }
            let inAppCell: ReactNode;
            if (inAppArm === "none") {
              inAppCell = <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>{S.emailNoneNote}</span>;
            } else if (locked) {
              inAppCell = <span data-locked="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>{S.optOn}</span>;
            } else if (t === "run_progress") {
              inAppCell = (
                <span data-per-project="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
                  {S.runProgressNote}
                </span>
              );
            } else {
              inAppCell = (
                <select name={`inapp_${t}`} defaultValue={(prefs.inApp?.[t] ?? row.defaultOn) ? "on" : "off"} aria-label={`${S.notificationEvents[t] ?? humanizeKey(t)} — ${S.matrixInAppCol}`} style={{ fontSize: "12px" }}>
                  <option value="on">{S.optOn}</option>
                  <option value="off">{S.optOff}</option>
                </select>
              );
            }
            return (
              <tr key={t} data-notification-row={t}>
                <td style={{ padding: "5px 14px 5px 0", color: "var(--shell-fg)" }}>
                  {S.notificationEvents[t] ?? humanizeKey(t)}
                  {locked ? (
                    <span style={{ display: "block", fontSize: "11px", color: "var(--shell-fg-faint)" }}>{S.lockedNote}</span>
                  ) : null}
                </td>
                <td style={{ padding: "5px 14px 5px 0" }}>{emailCell}</td>
                <td style={{ padding: "5px 0" }}>{inAppCell}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <section aria-label={S.digestHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.digestHeading}</h2>
        <label style={settingsRowStyle}>
          <select name="digest_run_finished" defaultValue={prefs.digest?.run_finished === "hourly" ? "hourly" : "off"} style={{ fontSize: "13px" }}>
            <option value="off">{S.optOff}</option>
            <option value="hourly">{S.optHourly}</option>
          </select>{" "}
          {S.digestRunFinishedLabel}
        </label>
      </section>
      <section aria-label={S.quietHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.quietHeading}</h2>
        <p style={settingsNoteStyle}>{S.quietNote}</p>
        <label style={settingsRowStyle}>
          {/* REQ-VFY-6 — the SSR's textless label gives this select no accessible name. */}
          <select name="qh_enabled" defaultValue={qh ? "on" : "off"} aria-label={S.quietEnable} style={{ fontSize: "13px" }}>
            <option value="off">{S.optOff}</option>
            <option value="on">{S.quietEnable}</option>
          </select>
        </label>
        <label style={settingsRowStyle}>
          {/* REQ-VFY-6 — one label wraps two inputs; aria-label names each control explicitly. */}
          {S.quietStartLabel}:{" "}
          <input type="time" name="qh_start" defaultValue={qh ? toHHMM(qh.startMinutesUtc) : "21:00"} aria-label={S.quietStartLabel} style={settingsInputStyle} />
          {S.quietEndLabel}:{" "}
          <input type="time" name="qh_end" defaultValue={qh ? toHHMM(qh.endMinutesUtc) : "07:00"} aria-label={S.quietEndLabel} style={settingsInputStyle} />
        </label>
      </section>
      {data.projects && data.projects.length > 0 ? (
        <section aria-label={S.runProgressHeading} style={settingsSectionStyle}>
          <h2 style={settingsH2}>{S.runProgressHeading}</h2>
          <p style={settingsNoteStyle}>{S.runProgressNote}</p>
          {data.projects.map((proj) => (
            <label key={proj.id} style={{ ...settingsRowStyle, justifyContent: "space-between" }}>
              <span>{fmt(S.runProgressProjectFmt, { title: proj.title })}</span>
              <select
                name={`rp_${proj.id}`}
                defaultValue={prefs.project?.[proj.id]?.run_progress === true ? "on" : "off"}
                style={{ fontSize: "12px" }}
              >
                <option value="off">{S.optOff}</option>
                <option value="on">{S.optOn}</option>
              </select>
            </label>
          ))}
        </section>
      ) : null}
      <button type="submit" style={{ marginTop: "14px", fontSize: "13px" }}>{S.saveCta}</button>
    </form>
  );
}

// ---- §14.7 Integrations --------------------------------------------------------------------------

/** §14.7 Integrations (REQ-ACCT-2) — one card component per provider: connect / status / items /
 *  disconnect; disconnect removes the credential now and keeps samples. Verbatim port. */
export function IntegrationsSection({ integrations }: { readonly integrations: IntegrationsSettingsDto | null }): ReactNode {
  const data = integrations;
  if (!data) {
    return <p data-settings-unavailable="integrations" style={settingsNoteStyle}>{B.stripeDownNote}</p>;
  }
  const providers = ["substack", "medium", "gdrive"] as const;
  return (
    <>
      <p style={{ ...settingsNoteStyle, marginTop: "8px" }}>{S.integrationsNote}</p>
      {providers.map((provider) => {
        const prov = S.integrationProviders[provider] ?? { title: provider, reads: "", never: "" };
        const conns = data.connections.filter((conn) => conn.provider === provider);
        return (
          <div key={provider} data-integration-card={provider} style={settingsCardStyle}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 4px", color: "var(--shell-fg)" }}>{prov.title}</h2>
            <p style={settingsNoteStyle}>{prov.reads}</p>
            <p data-integration-never="true" style={{ ...settingsNoteStyle, color: "var(--shell-fg-muted)" }}>{prov.never}</p>
            {conns.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0" }}>
                {data.voices.length > 0 ? (
                  <a href={`/v/${data.voices[0]!.slug ?? data.voices[0]!.id}?tab=samples`} style={{ color: "var(--accent)" }}>
                    {S.integrationConnectCta}
                  </a>
                ) : (
                  S.integrationsEmpty
                )}
              </p>
            ) : (
              <ul style={{ margin: "6px 0", paddingLeft: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                {conns.map((conn) => (
                  <li key={conn.id} data-connection={conn.id} style={{ fontSize: "12px", color: "var(--shell-fg)" }}>
                    <span data-conn-status={conn.status} style={{ fontWeight: 600 }}>
                      {S.integrationStatusLabels[conn.status] ?? conn.status}
                    </span>
                    {conn.handle ? <span style={{ color: "var(--shell-fg-muted)" }}>{" · "}{conn.handle}</span> : null}
                    {conn.persona.name ? (
                      <span style={{ color: "var(--shell-fg-faint)" }}>
                        {" · "}{fmt(S.integrationPersonaFmt, { name: conn.persona.name })}
                      </span>
                    ) : null}
                    <span style={{ color: "var(--shell-fg-faint)" }}>
                      {" · "}{fmt(S.integrationItemsFmt, { items: conn.items, included: conn.includedItems })}
                    </span>
                    {conn.lastSyncAt ? (
                      <span style={{ color: "var(--shell-fg-faint)" }}>
                        {" · "}{fmt(S.integrationLastSyncFmt, { at: conn.lastSyncAt.slice(0, 10) })}
                      </span>
                    ) : null}
                    {conn.error ? (
                      <span data-conn-error="true" style={{ color: "var(--sev-major)" }}>{" · "}{conn.error}</span>
                    ) : null}
                    <form method="post" action={`/app/settings/integrations/${conn.id}/disconnect`} style={{ display: "inline", marginLeft: "10px" }}>
                      <button type="submit" data-disconnect="true" style={{ fontSize: "11px" }}>{S.integrationDisconnectCta}</button>
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
function DeletionBanner({ deletion }: { readonly deletion: { requestedAt: string; graceEndsAt: string } }): ReactNode {
  return (
    <div data-deletion-banner="true" style={{ ...settingsCardStyle, borderColor: "var(--sev-major)" }}>
      <p style={{ fontSize: "13px", color: "var(--sev-major)", margin: "0 0 8px" }}>
        {fmt(S.deletionScheduledFmt, { date: deletion.graceEndsAt.slice(0, 10) })}
      </p>
      <form method="post" action="/app/settings/account/delete/cancel">
        <button type="submit" data-deletion-cancel="true" style={{ fontSize: "12px" }}>{S.deletionCancelCta}</button>
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
      <section aria-label={S.privacyHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.privacyHeading}</h2>
        <form method="post" action="/app/settings/data/privacy" data-privacy-form="true">
          <label style={settingsRowStyle}>
            <input
              type="checkbox"
              name="analyticsOptOut"
              defaultChecked={privacy.analyticsOptOut || (data?.analyticsOptOut ?? false)}
              data-analytics-toggle="true"
            />
            {S.analyticsLabel}
          </label>
          <p style={settingsNoteStyle}>{S.analyticsNote}</p>
          <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
          {privacy.saved ? (
            <span data-privacy-saved="true" style={{ marginLeft: "10px", fontSize: "12px", color: "var(--state-ready)" }}>{S.saved}</span>
          ) : null}
        </form>
        {data ? (
          <form method="post" action="/app/settings/data/support-access" data-support-access-form="true" style={{ marginTop: "14px" }}>
            <label style={settingsRowStyle}>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={data.supportAccess.active}
                data-support-access-toggle="true"
              />
              {S.supportAccessLabel}
            </label>
            <p style={settingsNoteStyle}>{S.supportAccessNote}</p>
            {data.supportAccess.active && data.supportAccess.grant ? (
              <p data-support-active="true" style={{ fontSize: "12px", color: "var(--state-ready)", margin: "4px 0" }}>
                {fmt(S.supportAccessActiveFmt, { at: data.supportAccess.grant.expiresAt.replace("T", " ").slice(0, 16) })}
              </p>
            ) : null}
            <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
          </form>
        ) : null}
        {data ? (
          <div data-support-log="true" style={{ marginTop: "12px" }}>
            <h3 style={{ fontSize: "13px", margin: "0 0 6px", color: "var(--shell-fg-muted)" }}>{S.supportAccessLogHeading}</h3>
            {data.supportAccess.log.length === 0 ? (
              <p style={settingsNoteStyle}>{S.supportAccessLogEmpty}</p>
            ) : (
              <ul style={{ margin: "4px 0", paddingLeft: "18px", fontSize: "12px", color: "var(--shell-fg-muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
                {data.supportAccess.log.map((l) => (
                  <li key={l.id} data-support-log-row={l.action}>
                    {l.at.slice(0, 16).replace("T", " ")}{" UTC — "}{S.supportAccessActions[l.action] ?? l.action}
                    {l.detail ? <span style={{ color: "var(--shell-fg-faint)" }}>{" · "}{l.detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>
      <section aria-label={S.postureHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.postureHeading}</h2>
        <p data-training-posture="true" style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0 8px", maxWidth: "68ch" }}>
          {S.trainingPosture}
        </p>
        <p style={settingsNoteStyle}>{S.dpaLine}</p>
      </section>
      <section aria-label={S.preferenceHeading} style={settingsSectionStyle}>
        <h2 style={settingsH2}>{S.preferenceHeading}</h2>
        {/* §11.7's Q-26 copy verbatim — capture-only at MVP; the Editor never sees it. */}
        <p data-preference-copy="true" style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0 8px", maxWidth: "68ch" }}>
          {S.preferenceCopy}
        </p>
        <form method="post" action="/app/settings/data/preference-learning" data-preference-form="true">
          <label style={settingsRowStyle}>
            <input
              type="checkbox"
              name="learning"
              defaultChecked={!(data?.preferenceOptOut ?? false)}
              data-preference-toggle="true"
            />
            {S.preferenceToggleLabel}
          </label>
          <p style={settingsNoteStyle}>{S.preferenceOffNote}</p>
          <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
        </form>
      </section>
      {/* P1.18 — the whole-account zip (REQ-ACCT-3): "Export everything" queues the build and the
          download link arrives by email (7-day expiry); the restore half replays an export zip
          into this account — a re-import is a no-op. The download link is a document navigation
          (REQ-BFF-17 — binary bytes never ride fetch). */}
      <section aria-label={S.exportHeading} style={settingsSectionStyle} data-account-export="true">
        <h2 style={settingsH2}>{AX.heading}</h2>
        <p style={settingsNoteStyle}>{AX.lede}</p>
        {acct?.status === "building" ? (
          <p data-export-status="building" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>{AX.building}</p>
        ) : null}
        {acct?.status === "ready" && !acct.expired ? (
          <p data-export-status="ready" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>
            {AX.readyFmt.replace("{date}", (acct.expiresAt ?? "").slice(0, 10))}{" "}
            <a href={`/app/settings/data/export/download?id=${acct.id}`} data-export-download="true">{AX.downloadCta}</a>
          </p>
        ) : null}
        {acct?.status === "ready" && acct.expired ? (
          <p data-export-status="expired" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>{AX.expired}</p>
        ) : null}
        {acct?.status === "failed" ? (
          <p data-export-status="failed" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>
            {AX.failedFmt.replace("{error}", acct.error ?? "unknown")}
          </p>
        ) : null}
        {notice === "requested" ? (
          <p data-export-notice="true" style={{ fontSize: "12px", color: "var(--state-ready)", margin: "0 0 8px" }}>{AX.building}</p>
        ) : null}
        <form method="post" action="/app/settings/data/export" data-export-request-form="true">
          <button type="submit" style={{ fontSize: "13px" }}>{AX.cta}</button>
        </form>
        <h3 style={{ fontSize: "13px", margin: "16px 0 6px" }}>{AX.importHeading}</h3>
        <p style={settingsNoteStyle}>{AX.importNote}</p>
        <form method="post" action="/app/settings/data/import" encType="multipart/form-data" data-account-import="true">
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--shell-fg)" }}>
            {AX.importLabel}:{" "}
            <input type="file" name="archive" accept=".zip,application/zip" required style={{ fontSize: "12px" }} />
          </label>
          <button type="submit" style={{ marginTop: "8px", fontSize: "13px" }}>{AX.importCta}</button>
        </form>
        {notice === "imported" && imported ? (
          <p data-import-notice="imported" style={{ fontSize: "12px", color: "var(--state-ready)", marginTop: "8px" }}>
            {AX.importDoneFmt
              .replace("{projects}", String(imported.projects))
              .replace("{voices}", String(imported.voices))
              .replace("{files}", String(imported.files))}
          </p>
        ) : null}
        {notice === "deduped" ? (
          <p data-import-notice="deduped" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "8px" }}>{AX.importDeduped}</p>
        ) : null}
        {notice === "importFailed" ? (
          <p data-import-notice="failed" style={{ fontSize: "12px", color: "var(--shell-fg)", marginTop: "8px" }}>{AX.importFailed}</p>
        ) : null}
      </section>
      {/* REQ-ACCT-4 — typed confirmation → the 14-day grace → the worker's hard-delete; cancel inside
          the window. The banner at the section top mirrors the status while the grace runs. */}
      <section aria-label={S.deletionHeading} style={settingsSectionStyle} id="delete">
        <h2 style={settingsH2}>{S.deletionHeading}</h2>
        <p style={{ ...settingsNoteStyle, maxWidth: "68ch" }}>{S.deletionLede}</p>
        {data?.deletion ? null : (
          <form method="post" action="/app/settings/account/delete" data-delete-account-form="true">
            <label style={settingsRowStyle}>
              {S.deletionConfirmLabel}:{" "}
              <input
                type="text"
                name="confirmation"
                required
                pattern={ACCOUNT_DELETION_CONFIRMATION}
                autoComplete="off"
                style={settingsInputStyle}
              />
            </label>
            <button type="submit" style={{ fontSize: "13px", color: "var(--sev-major)" }}>{S.deletionCta}</button>
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
export function ProjectSettingsSurface({
  projectSettings,
  saved,
  notice,
  contentKey,
}: {
  readonly projectSettings: BffProjectSettingsTwin["projectSettings"] | null;
  readonly saved: boolean;
  readonly notice: string | undefined;
  /** The leaf's search state — an envelope-nav remounts the uncontrolled forms on server truth. */
  readonly contentKey: string;
}): ReactNode {
  const onSubmit = useSettingsFormSubmit();
  const PS = S.projectSettings;
  if (!projectSettings) {
    return (
      <div data-spa-surface>
        <Shell brand={COPY.brand} nav={<a href="/app">{PRJ.backToList}</a>} footer={footer()}>
          <PageTitle>{PS.heading}</PageTitle>
          <p style={settingsNoteStyle}>{B.stripeDownNote}</p>
        </Shell>
      </div>
    );
  }
  const ps = projectSettings;
  const p = ps.settings.project;
  const slug = ps.slug;
  const ov = p.protocolOverrides ?? {};
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell
        brand={COPY.brand}
        nav={
          <>
            <a href={`/p/${slug}`}>{PRJ.backToProject}</a>
            <a href="/app/settings/account" style={{ fontSize: "13px", marginLeft: "12px" }}>{S.nav}</a>
          </>
        }
        footer={footer()}
      >
        <PageTitle>{p.title} — {PS.heading}</PageTitle>
        {p.protocolChangedAt ? (
          <p data-protocol-changed="true" style={{ fontSize: "13px", color: "var(--sev-major)", margin: "8px 0" }}>
            {PS.changedNote}
          </p>
        ) : null}
        {saved ? (
          <p data-settings-saved="true" style={{ fontSize: "13px", color: "var(--state-ready)", margin: "4px 0" }}>{PS.saved}</p>
        ) : null}
        {notice ? (
          <p data-settings-notice="true" style={{ fontSize: "13px", color: "var(--sev-major)", margin: "4px 0" }}>{notice}</p>
        ) : null}
        <div key={contentKey} style={{ maxWidth: "640px" }}>
          <section aria-label={PS.voiceHeading} style={settingsSectionStyle}>
            <h2 style={settingsH2}>{PS.voiceHeading}</h2>
            <p style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0" }}>
              {p.persona ? (
                <a href={`/v/${p.persona.slug ?? p.persona.id}`} style={{ color: "var(--accent)" }}>{p.persona.name ?? p.persona.id}</a>
              ) : (
                <span style={{ color: "var(--shell-fg-faint)" }}>{PS.voiceNone}</span>
              )}
            </p>
          </section>
          <form method="post" action={`/p/${slug}/settings`} style={{ marginTop: "8px" }}>
            <section aria-label={PS.protocolHeading} style={settingsSectionStyle}>
              <h2 style={settingsH2}>{PS.protocolHeading}</h2>
              <label style={settingsRowStyle}>
                {PS.venueLabel}:{" "}
                <input type="text" name="venue" defaultValue={p.venue ?? ""} style={settingsInputStyle} />
              </label>
              {ps.settings.protocols.length > 0 ? (
                <label style={settingsRowStyle}>
                  {PS.protocolLabel}:{" "}
                  <select name="protocolId" defaultValue={p.protocolId ?? ""} style={{ fontSize: "13px" }}>
                    {ps.settings.protocols.map((proto) => (
                      <option key={proto.id} value={proto.id}>{proto.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label style={settingsRowStyle}>
                {PS.rigorLabel}:{" "}
                <select name="rigorDefault" defaultValue={p.rigorDefault ?? ""} style={{ fontSize: "13px" }}>
                  <option value="">{PS.rigorInherit}</option>
                  {RIGORS.map((r) => (
                    <option key={r} value={r}>{RIGOR_DISPLAY[r]}</option>
                  ))}
                </select>
              </label>
              <label style={settingsRowStyle}>
                {PS.tierLabel}:{" "}
                <select name="modelTierDefault" defaultValue={p.modelTierDefault ?? ""} style={{ fontSize: "13px" }}>
                  <option value="">{PS.rigorInherit}</option>
                  {MODEL_TIERS.map((t) => (
                    <option key={t} value={t}>{MODEL_TIER_DISPLAY[t]}</option>
                  ))}
                </select>
              </label>
              <label style={settingsRowStyle}>
                {PS.paperThemeLabel}:{" "}
                <select name="paperTheme" defaultValue={p.paperTheme} style={{ fontSize: "13px" }}>
                  <option value="follow">{S.paperThemeFollow}</option>
                  <option value="light">{S.paperThemeLight}</option>
                  <option value="dark">{S.paperThemeDark}</option>
                </select>
              </label>
              <label style={settingsRowStyle}>
                {PS.stageLabel}:{" "}
                <select name="stage" defaultValue={ov.stage ?? ""} style={{ fontSize: "13px" }}>
                  <option value="">{PS.stages.infer}</option>
                  <option value="early">{PS.stages.early}</option>
                  <option value="near_final">{PS.stages.near_final}</option>
                </select>
              </label>
              <p style={settingsNoteStyle}>{PS.stageNote}</p>
              <label style={settingsRowStyle}>
                {PS.lengthLabel}:{" "}
                <input type="number" name="ov_length" min={1} defaultValue={ov.length ?? undefined} style={{ ...settingsInputStyle, width: "110px" }} />
              </label>
              <p style={settingsNoteStyle}>{PS.lengthNote}</p>
              <fieldset style={{ border: "none", margin: "10px 0 0", padding: 0 }}>
                <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)" }}>{PS.phaseDefaultsHeading}</legend>
                {(Object.keys(PS.phaseDefaults) as Array<keyof typeof PS.phaseDefaults>).map((phase) => {
                  const phaseDefault = (ov.phaseDefaults as Record<string, boolean | undefined> | undefined)?.[phase];
                  return (
                  <label key={phase} style={{ ...settingsRowStyle, justifyContent: "space-between" }}>
                    <span>{PS.phaseDefaults[phase]}</span>
                    <select
                      name={`pd_${phase}`}
                      defaultValue={
                        phaseDefault === true ? "on" : phaseDefault === false ? "off" : ""
                      }
                      style={{ fontSize: "12px" }}
                    >
                      <option value="">{PS.phaseOptDefault}</option>
                      <option value="on">{PS.phaseOptOn}</option>
                      <option value="off">{PS.phaseOptOff}</option>
                    </select>
                  </label>
                  );
                })}
              </fieldset>
            </section>
            <button type="submit" style={{ marginTop: "14px", fontSize: "13px" }}>{PS.saveCta}</button>
          </form>
          {/* REQ-GATE-3/10 — P1.09's approval-policy + standing-guidance surface. Changing the policy
              never alters an open card; guidance edits route through the settings POSTs. */}
          {ps.approvalSettings ? (
            <ApprovalSettingsSection slug={slug} settings={ps.approvalSettings} returnTo={`/p/${slug}/settings`} editable />
          ) : null}
          <section aria-label={PS.tagsHeading} style={settingsSectionStyle}>
            <h2 style={settingsH2}>{PS.tagsHeading}</h2>
            {p.tags.length > 0 ? (
              <p style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0" }}>{p.tags.join(", ")}</p>
            ) : (
              <p style={settingsNoteStyle}>{PS.tagsPlaceholder}</p>
            )}
          </section>
        </div>
      </Shell>
    </div>
  );
}
