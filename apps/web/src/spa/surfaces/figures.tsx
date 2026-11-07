// SPA.19 — the `figures` surface (design/22 §2 `p.figures`/`p.figureCard`/`p.visualize`;
// design/29 §route-map; REQ-SEQ-9, REQ-BFF-11). Ports pages.tsx `FiguresPanePage`,
// `FigureCardPage`, and `VisualizePage` verbatim — the same `<PageTitle>` h1, the same
// `data-figure-*`/`data-visualize-*` vocabulary, the same `[unverified data]` badge text (the
// api's — never retyped), the same insert-as-proposal flow — on data read through
// `GET /bff/p/:slug/figures[/:figureId]` + `GET /bff/p/:slug/visualize`.
//
//   • The seven POSTs ride the JSON `wantsJson` branches: the Visualize click answers
//     `{ok, redirect:"/p/:slug/figures"}`; the card's handled refusals (`?saved=1`/`?notice=…`)
//     arrive as envelope `redirect`s carrying the identical flash URL the 302 would have —
//     flashes stay URL-owned, never payload (REQ-VFY-3). A refused Visualize click re-renders
//     the sheet's `data-notice` arm inline from the `{error, detail}` envelope (the document's
//     own refusal-as-rerender, no navigation — design/22 F5).
//   • Accept's fork redirect (`/p/:slug/v/<n>`) targets an unflipped editor leaf — the in-router
//     nav lands `SsrHandoff` → the document redirect, verbatim the form's 302.
//   • Binary figure transports stay document/asset navigations — `card.files.svgLight` is the
//     persisted server-side render inlined by the api read, never a proxied download
//     (REQ-BFF-17-class).
//   • The visualize sheet stays the ONLY figure-run creator (REQ-CHAT-25's consent rule) — the
//     leaf replays `figureId`/`priorVersion`/`entryPoint`/`insist` verbatim into the same field
//     grammar `bodyFields` decodes.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { Button, Checkbox, Chip, MarkdownProse, Select, TextArea, TextField } from "@rhema/ui";
import { COPY } from "../../copy.js";
import { BffError, bffFetch } from "../bff.js";
import { errorMessage } from "../../error-copy.js";
import { PageBody, PageHeader } from "../page-header.js";
import type { BffFigureCardTwin, BffFiguresTwin, BffVisualizeTwin } from "../queries.js";

// Destructure the COPY branches once — the REQ-SAFE-10 leaf scan keys on `COPY.<path>` literals.
const { figuresPage: F, figureCard: FC, visualize: V } = COPY;

/** Replace `{key}` placeholders in a copy template with string/number values. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** The dual-mode mutation envelope's narrow read (`{ok, redirect?, …}`). */
interface MutationReply {
  readonly ok?: boolean;
  readonly redirect?: string;
}

/** REQ-UX-16's in-flight affordance — `aria-busy` on the form + disabled controls, restored on
 *  settle. Imperative because the inputs are uncontrolled (verbatim SSR markup). */
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
 * The form's named fields as a flat `{name: value}` map — the `FormData` grammar without the
 * wrapper: unchecked checkboxes contribute nothing (`insist` posts `"1"` only when ticked — the
 * same record `bodyFields` consumes server-side). Read BEFORE any busy-disable pass.
 */
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

/**
 * The no-JS post grammar's hidden carrier — GUARD-1's named exemption owns this one component
 * (the spec-edit `mark`, iterate `figureId`/`priorVersion`/`entryPoint` replays ride a raw
 * input, RV-36; every visible control is a 225/225a primitive).
 */
function HiddenField({
  name,
  value,
  ...rest
}: {
  readonly name: string;
  readonly value: string;
} & Record<string, unknown>): ReactNode {
  return <input type="hidden" name={name} value={value} {...rest} />;
}

export interface FiguresSurfaceProps {
  /** the `GET /bff/p/:slug/figures` twin bag — `items` may be empty (the designed empty arm). */
  readonly data: BffFiguresTwin["figures"] | null;
}

/**
 * The §7.5 Figures pane on the BFF twin — every figure card's row (badge + insert/render state)
 * or the designed empty arm, verbatim `FiguresPanePage` markup.
 */
export function FiguresSurface({ data }: FiguresSurfaceProps): ReactNode {
  if (!data) {
    return (
      <div data-spa-surface>
        <PageBody>
          <PageHeader title={F.heading} />
          <p className="ui-set-t--m">{F.empty}</p>
        </PageBody>
      </div>
    );
  }
  return (
    <div data-spa-surface>
      <PageBody>
        <PageHeader
          title={F.heading}
          crumbs={[{ label: data.slug, href: `/p/${data.slug}` }, { label: F.heading }]}
        />
        <p className="ui-set-t ui-set-t--m">
          <a href={`/p/${data.slug}/visualize`} data-new-figure="true" className="ui-c2-ca">
            {F.newLabel}
          </a>
        </p>
        {data.items.length === 0 ? (
          <p data-figures-empty="true" className="ui-set-t ui-set-t--m">
            {F.empty}
          </p>
        ) : (
          <ul
            className="ui-c2-l0"
            style={{ listStyle: "none", display: "flex", flexDirection: "column" }}
          >
            {data.items.map((f) => (
              <li key={f.id} data-figure-row={f.id} className="ui-inbox-row">
                <div className="ui-set-form">
                  <a
                    href={`/p/${data.slug}/figures/${f.id}`}
                    className="ui-c2-a"
                    style={{ textDecoration: "none" }}
                  >
                    {f.title || f.caption || f.id}
                  </a>
                  <Chip label={f.kind} />
                  {f.badgeText ? <Chip label={f.badgeText} color="var(--sev-major)" /> : null}
                  <Chip label={fmt(F.versionFmt, { n: f.n })} />
                  {f.insertedInDraftId ? (
                    <Chip label={F.insertedChip} color="var(--state-ok)" />
                  ) : null}
                  {f.pendingProposal ? <Chip label={F.proposalChip} /> : null}
                  {!f.hasRender && f.specKind !== "table" ? <Chip label={F.renderingChip} /> : null}
                </div>
                {/* R7DEM.4b (S-7) — the imported-image variant renders the image itself through
                    the REQ-DWEB-17 asset route; `assetUri` is the corpus-relative route shape.
                    No spec/SVG is invented — the variant carries none. */}
                {(f.specKind as unknown as string) === "image" ? (
                  <img
                    src={f.assetUri}
                    alt={f.caption || f.title || f.id}
                    data-figure-image={f.id}
                    className="ui-c2-img ui-c2-img--l"
                    style={{ display: "block", border: "1px solid var(--shell-border)" }}
                  />
                ) : null}
                {f.caption ? <p className="ui-c2-ts ui-c2-mt">{f.caption}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </div>
  );
}

export interface FigureCardSurfaceProps {
  /** the `GET /bff/p/:slug/figures/:figureId` twin bag (`null` ⇒ the document's `V.notFound` arm). */
  readonly data: BffFigureCardTwin["figure"];
  /** the leaf's validated flash params (`?saved=1`/`?notice=…`) — URL state, never payload. */
  readonly saved: boolean;
  readonly notice?: string;
}

/**
 * The §7.5 figure card on the BFF twin — the persisted server-side preview (SVG inlined by the
 * read, never browser-produced), the 0-cr type chips, the caption/alt/source fields, the
 * Data/Spec/Versions disclosures, the provenance panel, and the insert-as-proposal surface
 * (propose → Accept/Reject). Every form posts its own `action` as a JSON field map; the answer's
 * `redirect` is followed in-router so the `?saved=1`/`?notice=` flash stays URL-owned.
 */
export function FigureCardSurface({ data, saved, notice }: FigureCardSurfaceProps): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [postError, setPostError] = useState<string | null>(null);

  const mutation = useMutation<
    MutationReply,
    unknown,
    { form: HTMLFormElement; action: string; fields: Record<string, string> }
  >({
    mutationFn: async ({ action, fields }) => {
      return bffFetch<MutationReply>(action, { method: "POST", json: fields });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env) => {
      setPostError(null);
      if (env.redirect != null) void router.navigate({ href: env.redirect });
    },
    onError: (err) => {
      // Only transport/gateway failures land here — the server's handled refusals already ride
      // `{ok, redirect:"…?notice=<copy>"}`. The leaf degrades to the same flash vocabulary the
      // document now carries — the code's mapped sentence+action, never the raw code.
      if (err instanceof BffError && data != null) {
        void router.navigate({
          href: `/p/${data.slug}/figures/${data.card.id}?notice=${encodeURIComponent(errorMessage(err))}`,
        });
      } else {
        setPostError(COPY.spaError.heading);
      }
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff", "p", data?.slug ?? ""] });
    },
  });

  const onSubmit = (e: FormEvent<HTMLElement>) => {
    e.preventDefault();
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute("aria-busy") === "true") return;
    const action = form.getAttribute("action") ?? "";
    // Read the field map BEFORE the busy pass — the disabled controls the affordance sets
    // would otherwise post as an empty body.
    const fields = collectJsonFields(form);
    mutation.mutate({ form, action, fields });
  };

  if (!data) {
    return (
      <div data-spa-surface>
        <PageBody>
          <PageHeader title={F.heading} />
          <p className="ui-set-t--m">{V.notFound}</p>
        </PageBody>
      </div>
    );
  }
  const { card, slug } = data;
  const cardBase = `/p/${slug}/figures/${card.id}`;
  // R7DEM.4b (S-7; REQ-DWEB-17) — the imported-image card arm: the image renders through the
  // demo asset route with its caption/alt/source line and the version arc labels. The variant
  // carries no spec/SVG/run provenance, so none of the write surfaces mount (an imported
  // figure is not the visualize sheet's business).
  if (card.specKind === "image") {
    const img = card;
    return (
      <div data-spa-surface>
        <PageBody>
          <PageHeader
            title={img.title || FC.untitled}
            crumbs={[
              { label: slug, href: `/p/${slug}` },
              { label: F.heading, href: `/p/${slug}/figures` },
              { label: img.title || FC.untitled },
            ]}
          />
          <div className="ui-set-form ui-c2-mv">
            <Chip label={FC.imageKindChip} />
            <Chip label={FC.importedChip} />
          </div>
          <img
            src={img.assetUri}
            alt={img.alt || img.title || img.id}
            data-figure-image={img.id}
            className="ui-c2-img"
            style={{ display: "block", border: "1px solid var(--shell-border)" }}
          />
          {img.caption ? <p className="ui-c2-mt ui-set-t--m">{img.caption}</p> : null}
          {img.sourceLine ? <p className="ui-c2-mt ui-vc-faint">{img.sourceLine}</p> : null}
          <details data-figure-versions="true" className="ui-c2-mt" open={img.versions.length > 1}>
            <summary className="ui-os-d" style={{ cursor: "pointer" }}>
              {FC.versionsHeading}
            </summary>
            <ul
              className="ui-c2-vl"
              style={{ listStyle: "none", display: "flex", flexDirection: "column" }}
            >
              {img.versions.map((v) => (
                <li key={v.n} data-version={v.n} className="ui-set-form ui-c2-ts">
                  <Chip label={`v${v.n}`} />
                  <span>{v.label ?? FC.emptyField}</span>
                </li>
              ))}
            </ul>
          </details>
        </PageBody>
      </div>
    );
  }
  const missing = card.readiness.missing.map((m) =>
    m === "alt" ? FC.missingAlt : FC.missingSource,
  );
  const declined = card.versions.find((v) => v.renderStatus === "declined");
  const shownNotice = postError ?? notice;
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <PageBody>
        <PageHeader
          title={card.title || FC.untitled}
          crumbs={[
            { label: slug, href: `/p/${slug}` },
            { label: F.heading, href: `/p/${slug}/figures` },
            { label: card.title || FC.untitled },
          ]}
        />
        <p className="ui-set-t ui-set-t--m">
          {saved ? <span data-saved-note="true">{COPY.outlinePage.savedNote}</span> : null}
          {shownNotice ? (
            <span data-notice="true" className="ui-c2-ml ui-set-t--warn">
              {shownNotice}
            </span>
          ) : null}
        </p>
        <div className="ui-set-form ui-c2-mv">
          <Chip label={card.kind} />
          {card.badgeText ? <Chip label={card.badgeText} color="var(--sev-major)" /> : null}
          {card.insertedInDraftId ? <Chip label={FC.insertedNote} color="var(--state-ok)" /> : null}
        </div>

        {/* the preview — the persisted server-side render (never browser-produced); a table shows
            its markdown source. (`&&` guards keep the copy-containment scan out of the ternary
            boundaries — REQ-SAFE-10.) */}
        {card.files.svgLight != null && (
          <div
            data-figure-preview="true"
            className="ui-c2-pv"
            style={{ border: "1px solid var(--shell-border)", overflowX: "auto" }}
            dangerouslySetInnerHTML={{ __html: card.files.svgLight }}
          />
        )}
        {card.files.svgLight == null && card.files.tableSource != null && (
          <pre
            data-figure-preview="true"
            className="ui-c2-pvs"
            style={{ border: "1px solid var(--shell-border)", whiteSpace: "pre-wrap" }}
          >
            {card.files.tableSource}
          </pre>
        )}
        {card.files.svgLight == null && card.files.tableSource == null && (
          <p data-figure-preview-pending="true" className="ui-set-t--m">
            {F.renderingChip}
          </p>
        )}
        {declined ? (
          <p data-declined-note="true" className="ui-c2-w">
            {fmt(FC.declinedFmt, { suggestion: declined.renderError ?? "" })}
          </p>
        ) : null}

        {/* the type chips — a vega_lite mark edit is a 0-cr local spec edit (no run, no model call). */}
        {card.specKind === "vega_lite" ? (
          <section data-type-chips="true" className="ui-c2-mt3">
            <p className="ui-c2-mb ui-c2-ts">
              {FC.chipsHeading} <span className="ui-vc-faint">— {FC.chipsNote}</span>
            </p>
            <div className="ui-set-form ui-c2-g1">
              {(["bar", "line", "point", "area"] as const).map((mark) => (
                <form
                  key={mark}
                  method="post"
                  action={`${cardBase}/spec-edit`}
                  style={{ display: "inline" }}
                >
                  <HiddenField name="mark" value={mark} />
                  <Button type="submit" variant="secondary" size="sm" data-chip={mark}>
                    {mark}
                  </Button>
                </form>
              ))}
            </div>
          </section>
        ) : null}

        {/* the card fields — user-authored caption/alt/source line (alt + source gate the insert). */}
        <form
          method="post"
          action={cardBase}
          data-figure-fields="true"
          className="ui-c2-col ui-c2-mw ui-c2-mt3"
          style={{ display: "flex", flexDirection: "column" }}
        >
          {/* pages.tsx's `figureField` markup verbatim — the literal `name=` tokens here are the
              emit-scan proof the field grammar is real (the SSR helper carries them as args). */}
          <label className="ui-vc-lab">
            {FC.captionLabel}
            <TextField type="text" name="caption" defaultValue={card.caption} />
          </label>
          <label className="ui-vc-lab">
            {FC.altLabel}
            <TextField type="text" name="alt" defaultValue={card.alt} />
          </label>
          <label className="ui-vc-lab">
            {FC.sourceLabel}
            <TextField type="text" name="sourceLine" defaultValue={card.sourceLine} />
          </label>
          <div>
            <Button type="submit" variant="primary" size="sm">
              {COPY.outlinePage.saveLabel}
            </Button>
          </div>
        </form>

        {/* provenance — the structured honesty record, never a caption convention. */}
        <details data-provenance="true" className="ui-c2-mt4">
          <summary className="ui-os-d" style={{ cursor: "pointer" }}>
            {FC.provenanceHeading}
          </summary>
          <dl className="ui-c2-dl" style={{ display: "grid", gridTemplateColumns: "auto 1fr" }}>
            <dt>{"kind"}</dt>
            <dd data-prov-kind="true" className="ui-c2-m0">
              {card.provenance.kind}
            </dd>
            <dt>{"verification"}</dt>
            <dd data-prov-verification="true" className="ui-c2-m0">
              {card.provenance.verification}
            </dd>
            <dt>{"computedBy"}</dt>
            <dd className="ui-c2-m0">{card.provenance.computedBy}</dd>
            {card.provenance.refs.map((r, i) => (
              <Fragment key={i}>
                <dt>{"ref"}</dt>
                <dd className="ui-c2-m0">
                  {r.url ?? r.claimId ?? r.assetId ?? r.transform ?? FC.emptyField}
                </dd>
              </Fragment>
            ))}
          </dl>
        </details>

        {card.files.dataCsv ? (
          <details data-figure-data="true" className="ui-c2-mt">
            <summary className="ui-os-d" style={{ cursor: "pointer" }}>
              {FC.dataHeading}
            </summary>
            <pre
              className="ui-c2-pre"
              style={{ whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)" }}
            >
              {card.files.dataCsv}
            </pre>
          </details>
        ) : null}
        {card.files.spec ? (
          <details data-figure-spec="true" className="ui-c2-mt">
            <summary className="ui-os-d" style={{ cursor: "pointer" }}>
              {FC.specHeading}
            </summary>
            <pre
              className="ui-c2-pre"
              style={{ whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)" }}
            >
              {card.files.spec}
            </pre>
          </details>
        ) : null}

        {/* the Versions strip — each iterate's request text + render state + one-click restore. */}
        <details data-figure-versions="true" className="ui-c2-mt" open={card.versions.length > 1}>
          <summary className="ui-os-d" style={{ cursor: "pointer" }}>
            {FC.versionsHeading}
          </summary>
          <ul
            className="ui-c2-vl"
            style={{ listStyle: "none", display: "flex", flexDirection: "column" }}
          >
            {card.versions.map((v) => (
              <li key={v.n} data-version={v.n} className="ui-set-form ui-c2-ts">
                <Chip label={`v${v.n}`} />
                <span>{v.request ?? FC.emptyField}</span>
                <span className="ui-vc-faint">{v.renderStatus}</span>
                {v.n !== card.versions.at(-1)?.n ? (
                  <form
                    method="post"
                    action={`${cardBase}/versions/${v.n}/restore`}
                    style={{ display: "inline" }}
                  >
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      className="ui-c2-ca"
                      data-restore={v.n}
                    >
                      {FC.restoreLabel}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </details>

        {/* the insert surface — a proposal card, never a direct draft write. Accept splices the
            block in ONE tx (frozen ⇒ fork); Reject keeps the asset. */}
        <section
          data-insert="true"
          className="ui-c2-ins"
          style={{ borderTop: "1px solid var(--shell-border)" }}
        >
          <p className="ui-c2-ih">{FC.insertHeading}</p>
          <p className="ui-c2-ts ui-c2-mb">{FC.insertNote}</p>
          {card.pendingProposal != null ? (
            <div data-pending-proposal="true">
              <p className="ui-c2-ts ui-c2-mb">{FC.pendingNote}</p>
              <div
                data-proposal-block="true"
                className="ui-c2-pre ui-c2-mb"
                style={{ border: "1px solid var(--shell-border)" }}
              >
                <MarkdownProse text={card.pendingProposal.markdown} />
              </div>
              <div className="ui-set-form">
                <form
                  method="post"
                  action={`${cardBase}/proposals/accept`}
                  style={{ display: "inline" }}
                >
                  <Button type="submit" variant="primary" data-accept="true">
                    {FC.acceptLabel}
                  </Button>
                </form>
                <form
                  method="post"
                  action={`${cardBase}/proposals/reject`}
                  style={{ display: "inline" }}
                >
                  <Button type="submit" variant="secondary" data-reject="true">
                    {FC.rejectLabel}
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <Fragment>
              {card.insertedInDraftId != null && (
                <p data-inserted-note="true" className="ui-c2-m0 ui-tok">
                  {FC.insertedNote}
                </p>
              )}
              {card.insertedInDraftId == null && card.readiness.ok && data.headDraftId != null ? (
                <form
                  method="post"
                  action={`${cardBase}/propose`}
                  data-propose-form="true"
                  className="ui-c2-col ui-c2-mw"
                  style={{ display: "flex", flexDirection: "column" }}
                >
                  <label className="ui-vc-lab">
                    {FC.anchorLabel}
                    <TextField type="text" name="afterBlockId" />
                  </label>
                  <div>
                    <Button type="submit" variant="primary" data-propose="true">
                      {FC.proposeLabel}
                    </Button>
                  </div>
                </form>
              ) : null}
              {card.insertedInDraftId == null &&
                !(card.readiness.ok && data.headDraftId != null) && (
                  <p data-not-ready="true" className="ui-c2-m0 ui-c2-w">
                    {fmt(FC.notReadyFmt, { missing: missing.join(" + ") })}
                  </p>
                )}
            </Fragment>
          )}
        </section>
      </PageBody>
    </div>
  );
}

export interface VisualizeSurfaceProps {
  /** the `GET /bff/p/:slug/visualize` twin bag — the composition + the URL-echoed entry picks. */
  readonly data: BffVisualizeTwin["visualize"] | null;
  /** the leaf's search fingerprint — an entry-param change remounts the uncontrolled form. */
  readonly contentKey: string;
}

/**
 * The §7.5 `/visualize` sheet on the BFF twin — the verbatim request, the spec-kind pick, the
 * honesty note, and the server-computed estimate. The Visualize click is the only figure-run
 * creator (REQ-CHAT-25): a success rides `{ok, redirect:"/p/:slug/figures"}` in-router; the
 * refused click (blank request, upstream refusal) repaints the sheet's `data-notice` arm inline
 * from the `{error, detail}` envelope — the document's own re-render arm, no navigation.
 */
export function VisualizeSurface({ data, contentKey }: VisualizeSurfaceProps): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const mutation = useMutation<
    MutationReply,
    unknown,
    { form: HTMLFormElement; action: string; fields: Record<string, string> }
  >({
    mutationFn: async ({ action, fields }) => {
      return bffFetch<MutationReply>(action, { method: "POST", json: fields });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env) => {
      if (env.redirect != null) void router.navigate({ href: env.redirect });
    },
    onError: (err) => {
      // REQ-COPY-2 — the mapped sentence+action, never the code or the raw `detail` (the sheet's
      // `data-notice` arm repaints inline; a non-API failure stays honest on the generic line).
      if (err instanceof BffError) setNotice(errorMessage(err));
      else setNotice(V.notFound);
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff", "p", data?.slug ?? ""] });
    },
  });

  const onSubmit = (e: FormEvent<HTMLElement>) => {
    e.preventDefault();
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute("aria-busy") === "true") return;
    const action = form.getAttribute("action") ?? "";
    // Read the field map BEFORE the busy pass — the disabled controls the affordance sets
    // would otherwise post as an empty body.
    const fields = collectJsonFields(form);
    mutation.mutate({ form, action, fields });
  };

  if (!data) {
    return (
      <div data-spa-surface>
        <PageBody>
          <PageHeader title={V.heading} />
          <p className="ui-set-t--m">{V.notFound}</p>
        </PageBody>
      </div>
    );
  }
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <PageBody>
        <PageHeader
          title={V.heading}
          crumbs={[{ label: data.slug, href: `/p/${data.slug}` }, { label: V.heading }]}
        />
        <form
          key={contentKey}
          method="post"
          action={`/p/${data.slug}/visualize`}
          data-visualize-form="true"
          className="ui-c2-col ui-c2-mw5"
          style={{ display: "flex", flexDirection: "column" }}
        >
          {data.figureId ? <HiddenField name="figureId" value={data.figureId} /> : null}
          {data.priorVersion != null ? (
            <HiddenField name="priorVersion" value={String(data.priorVersion)} />
          ) : null}
          {data.entryPoint ? <HiddenField name="entryPoint" value={data.entryPoint} /> : null}
          {data.figureId ? (
            <p data-iterate-note="true" className="ui-c2-m0 ui-c2-ts">
              {V.iterateLabel} <code>{data.figureId}</code>
            </p>
          ) : null}
          <label className="ui-vc-lab">
            {V.requestLabel}
            <TextArea
              name="request"
              required
              defaultValue={data.request}
              rows={4}
              className="ui-rs-mt"
            />
          </label>
          <p className="ui-c2-m0 ui-vc-faint">{V.requestHint}</p>
          <label className="ui-vc-lab">
            {V.kindLabel}
            {/* Radix forbids an empty-string Item value: `"auto"` is the sheet's auto pick and the
                api's kind match treats any non-enum value (incl. the old `""`) as auto anyway —
                the post grammar is unchanged (`specKind` absent the enum ⇒ auto). */}
            <Select
              name="specKind"
              defaultValue={data.specKind === "" ? "auto" : data.specKind}
              aria-label={V.kindLabel}
              className="ui-rs-mt"
              items={[
                { value: "auto", label: V.kindAuto },
                { value: "vega_lite", label: "vega_lite" },
                { value: "mermaid", label: "mermaid" },
                { value: "table", label: "table" },
              ]}
            />
          </label>
          <label
            data-insist="true"
            className="ui-set-form ui-c2-ts"
            style={{ alignItems: "flex-start" }}
          >
            <Checkbox name="insist" value="1" aria-label={V.insistLabel} className="ui-rs-mt" />
            <span>{V.insistLabel}</span>
          </label>
          <p data-estimate="true" className="ui-c2-p0">
            {fmt(V.estimateFmt, {
              estimate: data.estimateCredits.toLocaleString("en-US"),
              cap: data.capCredits.toLocaleString("en-US"),
            })}
          </p>
          <p className="ui-c2-m0 ui-vc-faint">{V.chipNote}</p>
          {notice ? (
            <p data-notice="true" className="ui-c2-m0 ui-c2-w">
              {notice}
            </p>
          ) : null}
          <div>
            <Button type="submit" variant="primary">
              {V.startLabel}
            </Button>
          </div>
        </form>
      </PageBody>
    </div>
  );
}
