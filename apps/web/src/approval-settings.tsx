// The shared Approvals-settings section (extracted from pages.tsx for SPA.12 — the gate-card.tsx
// precedent): the SSR pages (`/p/:p` non-editable, `/p/:p/settings` editable) AND the settings SPA
// surface render through ONE composition, so a REQ-SPEC-1 option change or a copy fix lands on both
// renderers at once. Server-graph clean: COPY-bound strings + api-client DTOs only — no DOM types.
//
// P1.09 — the Approvals settings section (§6.4 item 3 + §6.5): the three policy values verbatim with
// their consequences, the per-kind deadline-override grid bound to REQ-SPEC-1's rules (spend/refusal
// kinds show "always waits for you" — no control), and standing-guidance management (list / retire /
// replace / add — retired never deleted).

import type { ReactNode } from "react";
import type { ApprovalSettingsDto } from "@rhema/api-client";
import { Button, TextField } from "@rhema/ui";
import { COPY } from "./copy.js";

const AP = COPY.approvals;
const G = COPY.gates;

// 243_R7KIT.3d — the policy radios, the per-kind override select and the hidden `returnTo` carrier
// stay KIT-1-styled natives inside named components (GUARD-1 exemptions): the section posts natively
// on the SSR /p/:slug settings page where a Radix RadioGroup/Select is inert (RV-36). Every text
// field is a TextField primitive and every submit a Button.

/** The no-JS radio carrier for the three policy values. */
function PolicyRadio({ value, defaultChecked }: { value: string; defaultChecked: boolean }): ReactNode {
  return <input type="radio" name="policy" value={value} defaultChecked={defaultChecked} />;
}

/** The no-JS select carrier — one per overridable kind; posts `ov_<kind>`. */
function OverrideSelect({ kind, value, options, ariaLabel }: { kind: string; value: string; options: readonly { value: string; label: string }[]; ariaLabel: string }): ReactNode {
  return (
    <select name={`ov_${kind}`} defaultValue={value} aria-label={ariaLabel}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** The hidden `returnTo` post-carrier (the prior batches' `HiddenField` shape). */
function HiddenField({ name, value }: { name: string; value: string }): ReactNode {
  return <input type="hidden" name={name} value={value} />;
}

const HOUR_MS = 60 * 60 * 1000;

/** Replace `{key}` placeholders in a copy template with string/number values. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** The override options one kind's select offers — only legal values (REQ-SPEC-1, mirrored from the
 *  api's `defaults` rows; the server re-validates everything the form posts). */
function overrideOptions(def: { deadlineMs: number | null; overridable: boolean }): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [
    { value: "", label: AP.overrideDefaultOpt },
    { value: "wait", label: AP.overrideWaitOpt },
  ];
  if (def.deadlineMs == null) {
    // a wait-default kind may ADD a ≥ 2 h deadline.
    for (const h of [2, 24, 72]) opts.push({ value: String(h * HOUR_MS), label: fmt(AP.overrideHoursFmt, { n: h }) });
  } else {
    opts.push({ value: String(def.deadlineMs * 2), label: fmt(AP.overrideHoursFmt, { n: Math.round((def.deadlineMs * 2) / HOUR_MS) }) });
  }
  return opts;
}

export function ApprovalSettingsSection({
  slug,
  settings,
  returnTo,
  editable,
}: {
  slug: string;
  settings: ApprovalSettingsDto;
  /** P1.20 — set ⇒ POSTs land back on the given path (the /p/:slug/settings page) instead of /p/:slug. */
  returnTo?: string;
  /** P1.20 (REQ-GATE-10's management half) — an inline edit form per active guidance row. */
  editable?: boolean;
}): ReactNode {
  const kindLabel = (kind: string) => G.kindLabel[kind] ?? kind;
  const defaultText = (deadlineMs: number | null): string =>
    deadlineMs == null ? AP.overrideWaitOpt : `${fmt(AP.overrideHoursFmt, { n: Math.round(deadlineMs / HOUR_MS) })}`;
  const returnField = returnTo ? <HiddenField name="returnTo" value={returnTo} /> : null;
  return (
    <section data-approval-settings="true" className="ui-c2-mt4 ui-set-t--meas">
      <h2 className="ui-c2-m0 ui-d-mb10 ui-d-h">{AP.heading}</h2>
      <form method="post" action={`/p/${slug}/settings/approvals`} className="ui-set-card">
        {returnField}
        <fieldset className="ui-os-fs">
          <legend className="ui-d-t ui-d-b">{AP.policyLegend}</legend>
          {(["named", "wait_each", "run_to_completion"] as const).map((p) => (
            <label key={p} data-policy={p} className="ui-d-mt6 ui-d-fd" style={{ display: "block" }}>
              <PolicyRadio value={p} defaultChecked={settings.policy === p} />{" "}
              {AP.policyLabel[p]}
              <span className="ui-d-i ui-d-ml20" style={{ display: "block" }}>
                {AP.policyNote[p]}
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="ui-os-fs ui-d-mt12">
          <legend className="ui-d-t ui-d-b">{AP.overridesHeading}</legend>
          <table data-override-grid="true" className="ui-d-mt6 ui-d-fs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="ui-d-i">
                <th className="ui-d-th">{AP.overrideKindColumn}</th>
                <th className="ui-d-th">{AP.overrideDefaultColumn}</th>
                <th className="ui-d-th">{AP.overrideColumn}</th>
              </tr>
            </thead>
            <tbody>
              {settings.defaults.map((d) => {
                const current = settings.overrides[d.kind];
                const value = current === undefined ? "" : current === null ? "wait" : String(current);
                return (
                  <tr key={d.kind} data-override-row={d.kind}>
                    <td className="ui-d-td">{kindLabel(d.kind)}</td>
                    <td className="ui-d-td ui-d-t">{defaultText(d.deadlineMs)}</td>
                    <td>
                      {d.overridable ? (
                        // UX.2 (REQ-IDE-42) — select-name: the row's kind cell is the label's text
                        // but the control still needs a programmatic name (axe select-name ×8).
                        <OverrideSelect kind={d.kind} value={value} options={overrideOptions(d)} ariaLabel={`${kindLabel(d.kind)} — ${AP.overrideColumn}`} />
                      ) : (
                        <span data-never-override="true" className="ui-d-i">{AP.overrideNeverLabel}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </fieldset>
        <Button type="submit" size="sm" className="ui-d-mt10">{AP.saveLabel}</Button>
      </form>

      {/* §6.5 standing guidance — listed with its narrowing + created date; Retire flips active=false
          (never deleted); "replace" posts a retire + a new rule (the edit path). */}
      <div data-standing-guidance="true" className="ui-c2-mt3 ui-set-card">
        <h3 className="ui-c2-m0 ui-d-mt6 ui-d-t ui-d-b">{AP.standingHeading}</h3>
        {settings.standing.length === 0 ? (
          <p className="ui-d-i ui-c2-mt ui-c2-mb">{AP.standingEmpty}</p>
        ) : (
          <ul className="ui-os-ul ui-d-g6 ui-c2-mt ui-c2-mb" style={{ display: "flex", flexDirection: "column" }}>
            {settings.standing.map((g) => (
              <li key={g.id} data-guidance={g.id} className="ui-d-fd">
                {g.body}
                <span className="ui-d-i ui-set-inline">
                  {g.workflows.length > 0 ? g.workflows.join(", ") : AP.standingAllWorkflows} · {g.createdAt.slice(0, 10)}
                </span>
                <form method="post" action={`/p/${slug}/guidance/${g.id}/retire`} className="ui-set-inline" style={{ display: "inline" }}>
                  {returnField}
                  <Button type="submit" size="sm" data-retire="true">{AP.standingRetireLabel}</Button>
                </form>
                {editable ? (
                  <details data-guidance-edit="true" className="ui-os-mr">
                    <summary className="ui-c2-ca ui-d-s" style={{ cursor: "pointer", display: "inline" }}>Edit</summary>
                    <form method="post" action={`/p/${slug}/settings/guidance/${g.id}`} className="ui-d-mt6 ui-c2-g2" style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline" }}>
                      {returnField}
                      <TextField type="text" name="body" required defaultValue={g.body} style={{ flex: "1 1 240px" }} />
                      <TextField type="text" name="workflows" aria-label={AP.standingWorkflowsLabel} defaultValue={g.workflows.join(", ")} placeholder={AP.standingAllWorkflows} className="ui-d-w140" />
                      <Button type="submit" size="sm" data-guidance-save="true">{AP.saveLabel}</Button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form method="post" action={`/p/${slug}/guidance`} className="ui-c2-mt ui-c2-g2" style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
          {returnField}
          <TextField type="text" name="body" required placeholder={AP.standingAddPlaceholder} style={{ flex: "1 1 240px" }} />
          <TextField type="text" name="workflows" aria-label={AP.standingWorkflowsLabel} placeholder={AP.standingAllWorkflows} className="ui-d-w140" />
          <Button type="submit" size="sm">{AP.standingAddLabel}</Button>
        </form>
        {settings.retired.length > 0 ? (
          <details data-retired-guidance="true" className="ui-d-mt10">
            <summary className="ui-d-i" style={{ cursor: "pointer" }}>{AP.retiredHeading} ({settings.retired.length})</summary>
            <ul className="ui-os-ul ui-d-mt6 ui-c2-g1" style={{ display: "flex", flexDirection: "column" }}>
              {settings.retired.map((g) => (
                <li key={g.id} data-guidance={g.id} className="ui-d-i" style={{ textDecoration: "line-through" }}>
                  {g.body}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
