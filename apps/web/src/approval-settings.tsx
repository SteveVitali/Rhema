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
import { COPY } from "./copy.js";

const AP = COPY.approvals;
const G = COPY.gates;

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
  const returnField = returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null;
  return (
    <section data-approval-settings="true" style={{ marginTop: "20px", maxWidth: "68ch" }}>
      <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 10px" }}>
        {AP.heading}
      </h2>
      <form method="post" action={`/p/${slug}/settings/approvals`} style={{ padding: "10px 14px", border: "1px solid var(--shell-border)", borderRadius: "8px" }}>
        {returnField}
        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)" }}>{AP.policyLegend}</legend>
          {(["named", "wait_each", "run_to_completion"] as const).map((p) => (
            <label key={p} data-policy={p} style={{ display: "block", fontSize: "13px", color: "var(--shell-fg)", marginTop: "6px" }}>
              <input type="radio" name="policy" value={p} defaultChecked={settings.policy === p} />{" "}
              {AP.policyLabel[p]}
              <span style={{ display: "block", marginLeft: "20px", fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                {AP.policyNote[p]}
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset style={{ border: "none", margin: "12px 0 0", padding: 0 }}>
          <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)" }}>{AP.overridesHeading}</legend>
          <table data-override-grid="true" style={{ marginTop: "6px", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "2px 12px 2px 0", color: "var(--shell-fg-faint)" }}>{AP.overrideKindColumn}</th>
                <th style={{ textAlign: "left", padding: "2px 12px 2px 0", color: "var(--shell-fg-faint)" }}>{AP.overrideDefaultColumn}</th>
                <th style={{ textAlign: "left", padding: "2px 0", color: "var(--shell-fg-faint)" }}>{AP.overrideColumn}</th>
              </tr>
            </thead>
            <tbody>
              {settings.defaults.map((d) => {
                const current = settings.overrides[d.kind];
                const value = current === undefined ? "" : current === null ? "wait" : String(current);
                return (
                  <tr key={d.kind} data-override-row={d.kind}>
                    <td style={{ padding: "3px 12px 3px 0", color: "var(--shell-fg)" }}>{kindLabel(d.kind)}</td>
                    <td style={{ padding: "3px 12px 3px 0", color: "var(--shell-fg-muted)" }}>{defaultText(d.deadlineMs)}</td>
                    <td style={{ padding: "3px 0" }}>
                      {d.overridable ? (
                        // UX.2 (REQ-IDE-42) — select-name: the row's kind cell is the label's text
                        // but the control still needs a programmatic name (axe select-name ×8).
                        <select name={`ov_${d.kind}`} defaultValue={value} aria-label={`${kindLabel(d.kind)} — ${AP.overrideColumn}`} style={{ fontSize: "12px" }}>
                          {overrideOptions(d).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span data-never-override="true" style={{ color: "var(--shell-fg-faint)" }}>{AP.overrideNeverLabel}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </fieldset>
        <button type="submit" style={{ marginTop: "10px", fontSize: "12px" }}>{AP.saveLabel}</button>
      </form>

      {/* §6.5 standing guidance — listed with its narrowing + created date; Retire flips active=false
          (never deleted); "replace" posts a retire + a new rule (the edit path). */}
      <div data-standing-guidance="true" style={{ marginTop: "14px", padding: "10px 14px", border: "1px solid var(--shell-border)", borderRadius: "8px" }}>
        <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{AP.standingHeading}</h3>
        {settings.standing.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0" }}>{AP.standingEmpty}</p>
        ) : (
          <ul style={{ margin: "4px 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {settings.standing.map((g) => (
              <li key={g.id} data-guidance={g.id} style={{ fontSize: "13px", color: "var(--shell-fg)" }}>
                {g.body}
                <span style={{ fontSize: "11px", color: "var(--shell-fg-faint)", marginLeft: "8px" }}>
                  {g.workflows.length > 0 ? g.workflows.join(", ") : AP.standingAllWorkflows} · {g.createdAt.slice(0, 10)}
                </span>
                <form method="post" action={`/p/${slug}/guidance/${g.id}/retire`} style={{ display: "inline", marginLeft: "8px" }}>
                  {returnField}
                  <button type="submit" data-retire="true" style={{ fontSize: "11px" }}>{AP.standingRetireLabel}</button>
                </form>
                {editable ? (
                  <details data-guidance-edit="true" style={{ marginTop: "4px" }}>
                    <summary style={{ fontSize: "11px", color: "var(--accent)", cursor: "pointer", display: "inline" }}>Edit</summary>
                    <form method="post" action={`/p/${slug}/settings/guidance/${g.id}`} style={{ marginTop: "6px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "baseline" }}>
                      {returnField}
                      <input type="text" name="body" required defaultValue={g.body} style={{ flex: "1 1 240px", fontSize: "13px", padding: "6px 10px", borderRadius: "7px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }} />
                      <input type="text" name="workflows" aria-label={AP.standingWorkflowsLabel} defaultValue={g.workflows.join(", ")} placeholder={AP.standingAllWorkflows} style={{ fontSize: "12px", padding: "5px 8px", borderRadius: "7px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", width: "140px" }} />
                      <button type="submit" data-guidance-save="true" style={{ fontSize: "12px" }}>{AP.saveLabel}</button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form method="post" action={`/p/${slug}/guidance`} style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
          {returnField}
          <input type="text" name="body" required placeholder={AP.standingAddPlaceholder} style={{ flex: "1 1 240px", fontSize: "13px", padding: "6px 10px", borderRadius: "7px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }} />
          <input type="text" name="workflows" aria-label={AP.standingWorkflowsLabel} placeholder={AP.standingAllWorkflows} style={{ fontSize: "12px", padding: "5px 8px", borderRadius: "7px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", width: "140px" }} />
          <button type="submit" style={{ fontSize: "12px" }}>{AP.standingAddLabel}</button>
        </form>
        {settings.retired.length > 0 ? (
          <details data-retired-guidance="true" style={{ marginTop: "10px" }}>
            <summary style={{ fontSize: "12px", color: "var(--shell-fg-faint)", cursor: "pointer" }}>{AP.retiredHeading} ({settings.retired.length})</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {settings.retired.map((g) => (
                <li key={g.id} data-guidance={g.id} style={{ fontSize: "12px", color: "var(--shell-fg-faint)", textDecoration: "line-through" }}>
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
