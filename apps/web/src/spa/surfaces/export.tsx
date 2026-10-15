// SPA.17 — the `export` surface (design/22 §2 `p.export`; design/29 §route-map — the FIRST
// IDE-framed flip: `export` AND `ide-chrome` gate the shell, and the leaf republishes the
// twin's `ide` bag onto the React chrome via `useShellChrome` — REQ-SEQ-6/12). Ports
// pages.tsx `ExportPage` verbatim — the same `<PageTitle>` h1, `data-export-*` /
// `data-obligation-*` / `data-ai-use` vocabulary, the same phone-width suppression — on data
// read through `GET /bff/p/:slug/export` instead of `usePageData()`.
//
//   • REQ-BFF-17 — the export POST itself stays a NATIVE document navigation: the form is a
//     real `method="post"` (a `content-disposition` answer downloads without a fetch — bytes
//     never traverse a JSON envelope). The standalone statement links stay plain `<a>` GETs.
//   • `/export/addition` is the surface's one JSON mutation — a delegated `onSubmit` posts
//     `{sentence}` through `bffFetch` and rides the `{ok, redirect:"…?added=1"}` envelope's
//     in-router nav; the invalidation refetches the dialog so the new `data-addition` row
//     lands exactly where the SSR 302's reload put it.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { FormEvent, ReactNode } from "react";
import { PageTitle } from "@rhema/ui";
import { COPY } from "../../copy.js";
import { bffFetch } from "../bff.js";
import { useShellChrome } from "../ide/chrome-data.js";
import type { BffExportTwin } from "../queries.js";

/** The mutation envelope's narrow read (the dual-mode responder's success arm). */
interface MutationReply {
  readonly ok?: boolean;
  readonly redirect?: string;
}

/** REQ-UX-16's in-flight affordance — `aria-busy` on the form + disabled controls. */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
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

/**
 * The §13.4 export dialog on the BFF twin. `data` is `BffExportTwin["export"]` — the dialog
 * verbatim plus the shell slice (project/theme/`ide`) that publishes onto the chrome.
 * `failed` is the `?error=1` flash rendered as the COPY leaf (the SSR's `ex.error` verbatim);
 * `?added` needs no render of its own — the refetched statement lists the new row (the SSR
 * redirect's verbatim landing).
 */
export function ExportSurface({
  data,
  failed,
  compact,
}: {
  readonly data: BffExportTwin["export"];
  readonly failed?: boolean;
  readonly compact: boolean;
}): ReactNode {
  useShellChrome(data);
  const router = useRouter();
  const queryClient = useQueryClient();
  const slug = data.slug;
  const dialog = data.dialog;
  const statement = dialog.statement;

  // The append-only addition — the ONE fetch mutation on the surface (the export POST stays
  // native). `{ok, redirect}` navigates in-router to the ?added=1 flash; the `["bff"]`
  // invalidation refetches the dialog so the appended `data-addition` row renders.
  const addition = useMutation<MutationReply, unknown, { form: HTMLFormElement; sentence: string }>(
    {
      mutationFn: ({ sentence }) => {
        return bffFetch<MutationReply>(`/p/${slug}/export/addition`, {
          method: "POST",
          json: { sentence },
        });
      },
      onMutate: ({ form }) => setFormBusy(form, true),
      onSuccess: (env) => {
        if (env.redirect != null) void router.navigate({ href: env.redirect });
      },
      onSettled: (_env, _err, vars) => {
        setFormBusy(vars.form, false);
        void queryClient.invalidateQueries({ queryKey: ["bff"] });
      },
    },
  );
  const onAdditionSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (form.getAttribute("aria-busy") === "true") return;
    const input = form.elements.namedItem("sentence");
    const sentence = input instanceof HTMLInputElement ? input.value : "";
    addition.mutate({ form, sentence });
  };

  return (
    <div data-spa-surface>
      <PageTitle>{COPY.export.heading}</PageTitle>
      <p
        style={{
          fontSize: "14px",
          lineHeight: 1.6,
          color: "var(--shell-fg-muted)",
          maxWidth: "68ch",
        }}
      >
        {COPY.export.lede}
      </p>
      {/* P1.19 — §10.1 ✗: export never renders its form on phone width. */}
      {compact === true ? <PhoneBlockedNote /> : null}
      {failed === true ? (
        <p data-export-error="true" style={{ color: "var(--shell-fg)", fontSize: "13px" }}>
          {COPY.export.exportFailed}
        </p>
      ) : null}
      {compact !== true ? (
        <>
          {/* the §11.7 obligation line — informational, with links; export never blocks on it. */}
          <p
            data-obligation-line="true"
            style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "12px 0 4px" }}
          >
            {dialog.obligations.line} — {COPY.export.obligationsNote}
          </p>
          {dialog.obligations.items.length > 0 ? (
            <ul
              data-obligation-items="true"
              style={{
                fontSize: "13px",
                color: "var(--shell-fg-muted)",
                margin: "0 0 8px",
                paddingLeft: "18px",
              }}
            >
              {dialog.obligations.items.map((o) => (
                <li
                  key={o.id}
                  data-obligation-id={o.id}
                  data-returned={dialog.obligations.returnedIds.includes(o.id) || undefined}
                >
                  {o.reviewRunId ? (
                    <a href={`/p/${slug}/review/${o.reviewRunId}`}>{o.title}</a>
                  ) : (
                    o.title
                  )}{" "}
                  · {o.severity} · {o.state}
                </li>
              ))}
            </ul>
          ) : null}

          {/* REQ-BFF-17 — the binary download stays a NATIVE form POST: no fetch, no envelope,
              `content-disposition` answers as a download without navigating the document. */}
          <form
            method="post"
            action={`/p/${slug}/export`}
            data-export-form="true"
            style={{ marginTop: "16px", maxWidth: "68ch" }}
          >
            <fieldset
              style={{
                border: "1px solid var(--shell-border)",
                borderRadius: "8px",
                padding: "10px 14px",
              }}
            >
              <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg)" }}>
                {COPY.export.formatLegend}
              </legend>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {dialog.formats.map((f, i) => (
                  <label
                    key={f.id}
                    title={f.blurb}
                    style={{
                      display: "flex",
                      gap: "6px",
                      alignItems: "center",
                      fontSize: "13px",
                      color: "var(--shell-fg-muted)",
                    }}
                  >
                    <input type="radio" name="format" value={f.id} defaultChecked={i === 0} />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {/* P1.18 — the .md-only profile (Substack). The web POST drops it for any other
                format, and the api enforces the same rule — a profile is never an eighth format. */}
            {dialog.mdProfiles.length > 0 ? (
              <label
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "var(--shell-fg)",
                }}
              >
                {COPY.export.profileLegend}:{" "}
                <select name="profile" data-md-profile="true" style={{ fontSize: "13px" }}>
                  <option value="">{COPY.export.profileCanonical}</option>
                  {dialog.mdProfiles.map((p) => (
                    <option key={p.id} value={p.id} title={p.blurb}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                  {COPY.export.profileNote}
                </span>
              </label>
            ) : null}
            {/* the citation-style select only exists while a bibliography artifact exports. */}
            {dialog.citations.hasBibliography ? (
              <label
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "var(--shell-fg)",
                }}
              >
                {COPY.export.citationLegend}:{" "}
                <select name="cslStyle" data-csl-style="true" style={{ fontSize: "13px" }}>
                  {dialog.citations.styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                  {COPY.export.citationNote}
                </span>
              </label>
            ) : null}
            <label
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                marginTop: "12px",
                fontSize: "13px",
                color: "var(--shell-fg)",
              }}
            >
              <input
                type="checkbox"
                name="attachAiUse"
                defaultChecked
                style={{ marginTop: "2px" }}
              />
              <span>
                {COPY.export.attachLabel}
                <span
                  style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-faint)" }}
                >
                  {COPY.export.attachNote}
                </span>
                {/* §6.7 — the Academic surface: the disclosure toggle copy (the ICMJE template
                    registers at P1.21; until then the general statement ships). */}
                {dialog.surfaces.disclosure ? (
                  <span
                    data-disclosure-note="true"
                    style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-faint)" }}
                  >
                    {COPY.export.disclosureNote}
                  </span>
                ) : null}
              </span>
            </label>
            {/* §8.4 — the block-level provenance appendix (off by default; greyed without a map). */}
            <label
              data-provenance-toggle={dialog.provenance.available ? "available" : "unavailable"}
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                marginTop: "12px",
                fontSize: "13px",
                color: dialog.provenance.available ? "var(--shell-fg)" : "var(--shell-fg-faint)",
              }}
            >
              <input
                type="checkbox"
                name="attachProvenance"
                disabled={!dialog.provenance.available}
                defaultChecked={dialog.provenance.defaultOn && dialog.provenance.available}
                style={{ marginTop: "2px" }}
              />
              <span>
                {COPY.export.provenanceLabel}
                <span
                  style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-faint)" }}
                >
                  {dialog.provenance.available
                    ? dialog.provenance.label
                    : COPY.export.provenanceUnavailable}
                </span>
              </span>
            </label>
            {/* §6.7 — the op-ed exclusivity reminder: a reminder line, never a gate. */}
            {dialog.surfaces.exclusivityReminder ? (
              <p
                data-exclusivity-reminder="true"
                style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "12px" }}
              >
                {dialog.surfaces.exclusivityReminder}
              </p>
            ) : null}
            <button type="submit" style={{ marginTop: "12px", fontSize: "13px" }}>
              {COPY.export.exportCta}
            </button>
          </form>

          {/* the statement preview — generated sentences (recomputed from run rows) + the author's
              append-only additions. */}
          {statement ? (
            <section data-ai-use="true" style={{ marginTop: "20px", maxWidth: "68ch" }}>
              <h2
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--shell-fg)",
                  margin: "0 0 6px",
                }}
              >
                {COPY.export.statementHeading}
              </h2>
              <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 8px" }}>
                {COPY.export.statementNote}
              </p>
              <p
                data-generated="true"
                style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--shell-fg)" }}
              >
                {statement.generated.join(" ")}
              </p>
              {statement.additions.map((a) => (
                <p
                  key={a.id}
                  data-addition={a.id}
                  style={{
                    fontSize: "13px",
                    lineHeight: 1.6,
                    color: "var(--shell-fg-muted)",
                    margin: "6px 0 0",
                  }}
                >
                  {a.sentence}
                </p>
              ))}
              {/* the surface's one JSON mutation — `{ok,redirect}` lands the ?added=1 flash. */}
              <form
                method="post"
                action={`/p/${slug}/export/addition`}
                onSubmit={onAdditionSubmit}
                style={{ marginTop: "10px" }}
              >
                <label
                  htmlFor="ai-use-addition"
                  style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-muted)" }}
                >
                  {COPY.export.additionLabel}
                </label>
                <input
                  id="ai-use-addition"
                  type="text"
                  name="sentence"
                  placeholder={COPY.export.additionPlaceholder}
                  style={{
                    width: "100%",
                    marginTop: "4px",
                    padding: "6px 10px",
                    fontSize: "13px",
                    borderRadius: "8px",
                    border: "1px solid var(--shell-border)",
                    background: "var(--shell-bg)",
                    color: "var(--shell-fg)",
                    boxSizing: "border-box",
                  }}
                />
                <button type="submit" style={{ marginTop: "6px", fontSize: "12px" }}>
                  {COPY.export.additionCta}
                </button>
              </form>
              <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "10px" }}>
                {COPY.export.standaloneHeading}:{" "}
                <a href={`/p/${slug}/export/ai-use/md`}>{COPY.export.standaloneMdLabel}</a>
                {" · "}
                <a href={`/p/${slug}/export/ai-use/docx`}>{COPY.export.standaloneDocxLabel}</a>
              </p>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
