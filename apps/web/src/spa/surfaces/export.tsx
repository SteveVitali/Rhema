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
import { Button, Checkbox, PageTitle, RadioGroup, RadioGroupItem, TextField } from "@rhema/ui";
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
    <p data-phone-blocked="true" className="ui-set-t ui-set-t--m ui-set-t--meas">
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
        void queryClient.invalidateQueries({ queryKey: ["bff", "p", data.slug] });
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
      <p className="ui-set-t ui-set-t--m ui-set-t--meas">
        {COPY.export.lede}
      </p>
      {/* P1.19 — §10.1 ✗: export never renders its form on phone width. */}
      {compact === true ? <PhoneBlockedNote /> : null}
      {failed === true ? (
        <p data-export-error="true" className="ui-set-t">
          {COPY.export.exportFailed}
        </p>
      ) : null}
      {compact !== true ? (
        <>
          {/* the §11.7 obligation line — informational, with links; export never blocks on it. */}
          <p data-obligation-line="true" className="ui-set-t ui-rs-mt">
            {dialog.obligations.line} — {COPY.export.obligationsNote}
          </p>
          {dialog.obligations.items.length > 0 ? (
            <ul data-obligation-items="true" className="ui-set-list ui-set-t--m">
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
            className="ui-set-sec ui-set-t--meas"
          >
            <fieldset className="ui-set-card">
              <legend className="ui-set-h3">{COPY.export.formatLegend}</legend>
              <RadioGroup
                name="format"
                defaultValue={dialog.formats[0]?.id}
                aria-label={COPY.export.formatLegend}
                className="ui-set-form"
              >
                {dialog.formats.map((f) => (
                  <label key={f.id} title={f.blurb} className="ui-rs-radio ui-set-t--m">
                    <RadioGroupItem value={f.id} aria-label={f.label} />
                    {f.label}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
            {/* P1.18 — the .md-only profile (Substack). The web POST drops it for any other
                format, and the api enforces the same rule — a profile is never an eighth format. */}
            {dialog.mdProfiles.length > 0 ? (
              <label className="ui-set-row ui-set-t ui-rs-mt">
                {COPY.export.profileLegend}:{" "}
                {/* R7FIX.7 (F-R7DEP.2-13) — the named GUARD-1 exemption: this form is a NATIVE
                    document POST (REQ-BFF-17), so its field carriers stay KIT-1-styled native
                    selects (RV-36). A Radix Select shadows the carrier: the `data-md-profile`
                    hook landed on a button trigger and no `select[data-md-profile]` element —
                    the declared contract — existed in the DOM at all. */}
                <select name="profile" defaultValue="" data-md-profile="true" aria-label={COPY.export.profileLegend}>
                  <option value="">{COPY.export.profileCanonical}</option>
                  {dialog.mdProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span className="ui-set-note ui-set-t--f">
                  {COPY.export.profileNote}
                </span>
              </label>
            ) : null}
            {/* the citation-style select only exists while a bibliography artifact exports. */}
            {dialog.citations.hasBibliography ? (
              <label className="ui-set-row ui-set-t ui-rs-mt">
                {COPY.export.citationLegend}:{" "}
                {/* same native-post carrier as the profile select — `select[data-csl-style]` is
                    the declared hook the T4 leg drives (its <option> values POST `cslStyle`). */}
                <select
                  name="cslStyle"
                  defaultValue={dialog.citations.styles[0]?.id}
                  data-csl-style="true"
                  aria-label={COPY.export.citationLegend}
                >
                  {dialog.citations.styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span className="ui-set-note ui-set-t--f">
                  {COPY.export.citationNote}
                </span>
              </label>
            ) : null}
            <label className="ui-set-row ui-set-t ui-rs-mt">
              <Checkbox name="attachAiUse" defaultChecked aria-label={COPY.export.attachLabel} />
              <span>
                {COPY.export.attachLabel}
                <span className="ui-set-note ui-set-t--f ui-ob-sub">
                  {COPY.export.attachNote}
                </span>
                {/* §6.7 — the Academic surface: the disclosure toggle copy (the ICMJE template
                    registers at P1.21; until then the general statement ships). */}
                {dialog.surfaces.disclosure ? (
                  <span data-disclosure-note="true" className="ui-set-note ui-set-t--f ui-ob-sub">
                    {COPY.export.disclosureNote}
                  </span>
                ) : null}
              </span>
            </label>
            {/* §8.4 — the block-level provenance appendix (off by default; greyed without a map). */}
            <label
              data-provenance-toggle={dialog.provenance.available ? "available" : "unavailable"}
              className={`ui-set-row ui-set-t ui-rs-mt${dialog.provenance.available ? "" : " ui-set-t--f"}`}
            >
              <Checkbox
                name="attachProvenance"
                disabled={!dialog.provenance.available}
                defaultChecked={dialog.provenance.defaultOn && dialog.provenance.available}
                aria-label={COPY.export.provenanceLabel}
              />
              <span>
                {COPY.export.provenanceLabel}
                <span className="ui-set-note ui-set-t--f ui-ob-sub">
                  {dialog.provenance.available
                    ? dialog.provenance.label
                    : COPY.export.provenanceUnavailable}
                </span>
              </span>
            </label>
            {/* §6.7 — the op-ed exclusivity reminder: a reminder line, never a gate. */}
            {dialog.surfaces.exclusivityReminder ? (
              <p data-exclusivity-reminder="true" className="ui-set-note ui-set-t--m ui-rs-mt">
                {dialog.surfaces.exclusivityReminder}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="ui-rs-mt">
              {COPY.export.exportCta}
            </Button>
          </form>

          {/* the statement preview — generated sentences (recomputed from run rows) + the author's
              append-only additions. */}
          {statement ? (
            <section data-ai-use="true" className="ui-set-sec ui-set-t--meas">
              <h2 className="ui-set-h2">
                {COPY.export.statementHeading}
              </h2>
              <p className="ui-set-note ui-set-t--f">
                {COPY.export.statementNote}
              </p>
              <p data-generated="true" className="ui-set-t">
                {statement.generated.join(" ")}
              </p>
              {statement.additions.map((a) => (
                <p key={a.id} data-addition={a.id} className="ui-set-t ui-set-t--m ui-rs-mt">
                  {a.sentence}
                </p>
              ))}
              {/* the surface's one JSON mutation — `{ok,redirect}` lands the ?added=1 flash. */}
              <form
                method="post"
                action={`/p/${slug}/export/addition`}
                onSubmit={onAdditionSubmit}
                className="ui-rs-mt"
              >
                <label htmlFor="ai-use-addition" className="ui-vc-lab">
                  {COPY.export.additionLabel}
                </label>
                <TextField
                  id="ai-use-addition"
                  type="text"
                  name="sentence"
                  placeholder={COPY.export.additionPlaceholder}
                  className="ui-rs-mt"
                />
                <Button type="submit" size="sm" className="ui-rs-mt">
                  {COPY.export.additionCta}
                </Button>
              </form>
              <p className="ui-set-note ui-set-t--f ui-rs-mt">
                {COPY.export.standaloneHeading}:{" "}
                <a href={`/p/${slug}/export/ai-use/md`} data-spa-native>{COPY.export.standaloneMdLabel}</a>
                {" · "}
                <a href={`/p/${slug}/export/ai-use/docx`} data-spa-native>{COPY.export.standaloneDocxLabel}</a>
              </p>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
