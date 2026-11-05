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
import { Chip, PageTitle, Shell } from "@rhema/ui";
import { COPY } from "../../copy.js";
import { BffError, bffFetch } from "../bff.js";
import type {
  BffFigureCardTwin,
  BffFiguresTwin,
  BffVisualizeTwin,
} from "../queries.js";

// Destructure the COPY branches once — the REQ-SAFE-10 leaf scan keys on `COPY.<path>` literals.
const { figuresPage: F, figureCard: FC, visualize: V } = COPY;

function footer(): ReactNode {
  return <span>{COPY.footer}</span>;
}

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

const FIGURE_CHIP_STYLE = {
  padding: "6px 12px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-surface)",
  color: "var(--shell-fg)",
  fontSize: "12px",
  cursor: "pointer",
} as const;

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
        <Shell brand={COPY.brand} footer={footer()}>
          <PageTitle>{F.heading}</PageTitle>
          <p style={{ color: "var(--shell-fg-muted)" }}>{F.empty}</p>
        </Shell>
      </div>
    );
  }
  return (
    <div data-spa-surface>
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{F.heading}</PageTitle>
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
          <a href={`/p/${data.slug}`} style={{ color: "var(--accent)" }}>{F.backToProject}</a>
          <a href={`/p/${data.slug}/visualize`} data-new-figure="true" style={{ color: "var(--accent)", marginLeft: "12px" }}>{F.newLabel}</a>
        </p>
        {data.items.length === 0 ? (
          <p data-figures-empty="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{F.empty}</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {data.items.map((f) => (
              <li key={f.id} data-figure-row={f.id} style={{ border: "1px solid var(--shell-border)", borderRadius: "10px", padding: "12px 14px", background: "var(--shell-surface)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <a href={`/p/${data.slug}/figures/${f.id}`} style={{ color: "var(--shell-fg)", fontSize: "14px", fontWeight: 600, textDecoration: "none" }}>
                    {f.title || f.caption || f.id}
                  </a>
                  <Chip label={f.kind} />
                  {f.badgeText ? <Chip label={f.badgeText} color="var(--sev-major)" /> : null}
                  <Chip label={fmt(F.versionFmt, { n: f.n })} />
                  {f.insertedInDraftId ? <Chip label={F.insertedChip} color="var(--state-ok)" /> : null}
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
                    style={{ display: "block", marginTop: "8px", maxWidth: "100%", maxHeight: "220px", borderRadius: "6px", border: "1px solid var(--shell-border)" }}
                  />
                ) : null}
                {f.caption ? <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{f.caption}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Shell>
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
      // `{ok, redirect:"…?notice=<code>"}`. The leaf degrades to the same flash vocabulary the
      // document would carry (the notice param renders verbatim as `data-notice`).
      if (err instanceof BffError && data != null) {
        void router.navigate({
          href: `/p/${data.slug}/figures/${data.card.id}?notice=${encodeURIComponent(err.code)}`,
        });
      } else {
        setPostError(COPY.spaError.heading);
      }
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
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
        <Shell brand={COPY.brand} footer={footer()}>
          <PageTitle>{F.heading}</PageTitle>
          <p style={{ color: "var(--shell-fg-muted)" }}>{V.notFound}</p>
        </Shell>
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
        <Shell brand={COPY.brand} footer={footer()}>
          <PageTitle>{img.title || FC.untitled}</PageTitle>
          <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
            <a href={`/p/${slug}/figures`} style={{ color: "var(--accent)" }}>{FC.backToFigures}</a>
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", margin: "4px 0 12px" }}>
            <Chip label={FC.imageKindChip} />
            <Chip label={FC.importedChip} />
          </div>
          <img
            src={img.assetUri}
            alt={img.alt || img.title || img.id}
            data-figure-image={img.id}
            style={{ display: "block", maxWidth: "100%", borderRadius: "8px", border: "1px solid var(--shell-border)" }}
          />
          {img.caption ? <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--shell-fg-muted)" }}>{img.caption}</p> : null}
          {img.sourceLine ? <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--shell-fg-faint)" }}>{img.sourceLine}</p> : null}
          <details data-figure-versions="true" style={{ marginTop: "10px" }} open={img.versions.length > 1}>
            <summary style={{ fontSize: "13px", color: "var(--shell-fg)", cursor: "pointer" }}>{FC.versionsHeading}</summary>
            <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
              {img.versions.map((v) => (
                <li key={v.n} data-version={v.n} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--shell-fg-muted)", flexWrap: "wrap" }}>
                  <Chip label={`v${v.n}`} />
                  <span>{v.label ?? FC.emptyField}</span>
                </li>
              ))}
            </ul>
          </details>
        </Shell>
      </div>
    );
  }
  const missing = card.readiness.missing.map((m) => (m === "alt" ? FC.missingAlt : FC.missingSource));
  const declined = card.versions.find((v) => v.renderStatus === "declined");
  const shownNotice = postError ?? notice;
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{card.title || FC.untitled}</PageTitle>
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
          <a href={`/p/${slug}/figures`} style={{ color: "var(--accent)" }}>{FC.backToFigures}</a>
          {saved ? <span data-saved-note="true" style={{ marginLeft: "12px" }}>{COPY.outlinePage.savedNote}</span> : null}
          {shownNotice ? <span data-notice="true" style={{ marginLeft: "12px", color: "var(--sev-major)" }}>{shownNotice}</span> : null}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", margin: "4px 0 12px" }}>
          <Chip label={card.kind} />
          {card.badgeText ? <Chip label={card.badgeText} color="var(--sev-major)" /> : null}
          {card.insertedInDraftId ? <Chip label={FC.insertedNote} color="var(--state-ok)" /> : null}
        </div>

        {/* the preview — the persisted server-side render (never browser-produced); a table shows
            its markdown source. (`&&` guards keep the copy-containment scan out of the ternary
            boundaries — REQ-SAFE-10.) */}
        {card.files.svgLight != null && (
          <div data-figure-preview="true" style={{ border: "1px solid var(--shell-border)", borderRadius: "10px", padding: "12px", background: "var(--paper-bg, var(--shell-surface))", overflowX: "auto" }}
            dangerouslySetInnerHTML={{ __html: card.files.svgLight }} />
        )}
        {card.files.svgLight == null && card.files.tableSource != null && (
          <pre data-figure-preview="true" style={{ border: "1px solid var(--shell-border)", borderRadius: "10px", padding: "12px", background: "var(--shell-surface)", fontSize: "12px", whiteSpace: "pre-wrap" }}>{card.files.tableSource}</pre>
        )}
        {card.files.svgLight == null && card.files.tableSource == null && (
          <p data-figure-preview-pending="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{F.renderingChip}</p>
        )}
        {declined ? (
          <p data-declined-note="true" style={{ fontSize: "12px", color: "var(--sev-major)" }}>{fmt(FC.declinedFmt, { suggestion: declined.renderError ?? "" })}</p>
        ) : null}

        {/* the type chips — a vega_lite mark edit is a 0-cr local spec edit (no run, no model call). */}
        {card.specKind === "vega_lite" ? (
          <section data-type-chips="true" style={{ marginTop: "14px" }}>
            <p style={{ margin: "0 0 6px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{FC.chipsHeading} <span style={{ color: "var(--shell-fg-faint)" }}>— {FC.chipsNote}</span></p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(["bar", "line", "point", "area"] as const).map((mark) => (
                <form key={mark} method="post" action={`${cardBase}/spec-edit`} style={{ display: "inline" }}>
                  <input type="hidden" name="mark" value={mark} />
                  <button type="submit" data-chip={mark} style={FIGURE_CHIP_STYLE}>{mark}</button>
                </form>
              ))}
            </div>
          </section>
        ) : null}

        {/* the card fields — user-authored caption/alt/source line (alt + source gate the insert). */}
        <form method="post" action={cardBase} data-figure-fields="true" style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px", maxWidth: "520px" }}>
          {/* pages.tsx's `figureField` markup verbatim — the literal `name=` tokens here are the
              emit-scan proof the field grammar is real (the SSR helper carries them as args). */}
          <label style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {FC.captionLabel}
            <input type="text" name="caption" defaultValue={card.caption}
              style={{ display: "block", marginTop: "3px", width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }} />
          </label>
          <label style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {FC.altLabel}
            <input type="text" name="alt" defaultValue={card.alt}
              style={{ display: "block", marginTop: "3px", width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }} />
          </label>
          <label style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {FC.sourceLabel}
            <input type="text" name="sourceLine" defaultValue={card.sourceLine}
              style={{ display: "block", marginTop: "3px", width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }} />
          </label>
          <div>
            <button type="submit" style={{ padding: "6px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "12px" }}>
              {COPY.outlinePage.saveLabel}
            </button>
          </div>
        </form>

        {/* provenance — the structured honesty record, never a caption convention. */}
        <details data-provenance="true" style={{ marginTop: "16px" }}>
          <summary style={{ fontSize: "13px", color: "var(--shell-fg)", cursor: "pointer" }}>{FC.provenanceHeading}</summary>
          <dl style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--shell-fg-muted)", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
            <dt>{"kind"}</dt><dd data-prov-kind="true" style={{ margin: 0 }}>{card.provenance.kind}</dd>
            <dt>{"verification"}</dt><dd data-prov-verification="true" style={{ margin: 0 }}>{card.provenance.verification}</dd>
            <dt>{"computedBy"}</dt><dd style={{ margin: 0 }}>{card.provenance.computedBy}</dd>
            {card.provenance.refs.map((r, i) => (
              <Fragment key={i}>
                <dt>{"ref"}</dt>
                <dd style={{ margin: 0 }}>{r.url ?? r.claimId ?? r.assetId ?? r.transform ?? FC.emptyField}</dd>
              </Fragment>
            ))}
          </dl>
        </details>

        {card.files.dataCsv ? (
          <details data-figure-data="true" style={{ marginTop: "10px" }}>
            <summary style={{ fontSize: "13px", color: "var(--shell-fg)", cursor: "pointer" }}>{FC.dataHeading}</summary>
            <pre style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--shell-fg-muted)", whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px" }}>{card.files.dataCsv}</pre>
          </details>
        ) : null}
        {card.files.spec ? (
          <details data-figure-spec="true" style={{ marginTop: "10px" }}>
            <summary style={{ fontSize: "13px", color: "var(--shell-fg)", cursor: "pointer" }}>{FC.specHeading}</summary>
            <pre style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--shell-fg-muted)", whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px" }}>{card.files.spec}</pre>
          </details>
        ) : null}

        {/* the Versions strip — each iterate's request text + render state + one-click restore. */}
        <details data-figure-versions="true" style={{ marginTop: "10px" }} open={card.versions.length > 1}>
          <summary style={{ fontSize: "13px", color: "var(--shell-fg)", cursor: "pointer" }}>{FC.versionsHeading}</summary>
          <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
            {card.versions.map((v) => (
              <li key={v.n} data-version={v.n} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--shell-fg-muted)", flexWrap: "wrap" }}>
                <Chip label={`v${v.n}`} />
                <span>{v.request ?? FC.emptyField}</span>
                <span style={{ color: "var(--shell-fg-faint)" }}>{v.renderStatus}</span>
                {v.n !== card.versions.at(-1)?.n ? (
                  <form method="post" action={`${cardBase}/versions/${v.n}/restore`} style={{ display: "inline" }}>
                    <button type="submit" data-restore={v.n} style={{ padding: "2px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "transparent", color: "var(--accent)", fontSize: "12px" }}>
                      {FC.restoreLabel}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </details>

        {/* the insert surface — a proposal card, never a direct draft write. Accept splices the
            block in ONE tx (frozen ⇒ fork); Reject keeps the asset. */}
        <section data-insert="true" style={{ marginTop: "18px", borderTop: "1px solid var(--shell-border)", paddingTop: "12px" }}>
          <p style={{ margin: "0 0 4px", fontSize: "13px", color: "var(--shell-fg)", fontWeight: 600 }}>{FC.insertHeading}</p>
          <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{FC.insertNote}</p>
          {card.pendingProposal != null ? (
            <div data-pending-proposal="true">
              <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{FC.pendingNote}</p>
              <pre data-proposal-block="true" style={{ margin: "0 0 10px", fontSize: "11px", color: "var(--shell-fg-muted)", whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px" }}>{card.pendingProposal.markdown}</pre>
              <div style={{ display: "flex", gap: "8px" }}>
                <form method="post" action={`${cardBase}/proposals/accept`} style={{ display: "inline" }}>
                  <button type="submit" data-accept="true" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600 }}>
                    {FC.acceptLabel}
                  </button>
                </form>
                <form method="post" action={`${cardBase}/proposals/reject`} style={{ display: "inline" }}>
                  <button type="submit" data-reject="true" style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "transparent", color: "var(--shell-fg)", fontSize: "13px" }}>
                    {FC.rejectLabel}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <Fragment>
              {card.insertedInDraftId != null && (
                <p data-inserted-note="true" style={{ margin: 0, fontSize: "12px", color: "var(--state-ok)" }}>{FC.insertedNote}</p>
              )}
              {card.insertedInDraftId == null && card.readiness.ok && data.headDraftId != null ? (
                <form method="post" action={`${cardBase}/propose`} data-propose-form="true" style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "520px" }}>
                  <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
                    {FC.anchorLabel}
                    <input type="text" name="afterBlockId" style={{ display: "block", marginTop: "3px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }} />
                  </label>
                  <div>
                    <button type="submit" data-propose="true" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600 }}>
                      {FC.proposeLabel}
                    </button>
                  </div>
                </form>
              ) : null}
              {card.insertedInDraftId == null && !(card.readiness.ok && data.headDraftId != null) && (
                <p data-not-ready="true" style={{ margin: 0, fontSize: "12px", color: "var(--sev-major)" }}>
                  {fmt(FC.notReadyFmt, { missing: missing.join(" + ") })}
                </p>
              )}
            </Fragment>
          )}
        </section>
      </Shell>
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
      // The document's own refusal text — `detail` carries the server's mapped notice (the 422
      // `requestRequired` copy); else the status/code maps exactly like the SSR's notice pick
      // (404 ⇒ `V.notFound`; a stable refusal code renders verbatim; a fault stays honest).
      if (err instanceof BffError) {
        setNotice(
          err.detail != null && err.detail !== ""
            ? err.detail
            : err.status === 404
              ? V.notFound
              : err.code === "internal_error" || err.code === "upstream_unavailable"
                ? V.notFound
                : err.code,
        );
      } else {
        setNotice(V.notFound);
      }
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
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
        <Shell brand={COPY.brand} footer={footer()}>
          <PageTitle>{V.heading}</PageTitle>
          <p style={{ color: "var(--shell-fg-muted)" }}>{V.notFound}</p>
        </Shell>
      </div>
    );
  }
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{V.heading}</PageTitle>
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
          <a href={`/p/${data.slug}`} style={{ color: "var(--accent)" }}>{V.backToProject}</a>
        </p>
        <form key={contentKey} method="post" action={`/p/${data.slug}/visualize`} data-visualize-form="true" style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "560px" }}>
          {data.figureId ? <input type="hidden" name="figureId" value={data.figureId} /> : null}
          {data.priorVersion != null ? <input type="hidden" name="priorVersion" value={String(data.priorVersion)} /> : null}
          {data.entryPoint ? <input type="hidden" name="entryPoint" value={data.entryPoint} /> : null}
          {data.figureId ? (
            <p data-iterate-note="true" style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-muted)" }}>
              {V.iterateLabel} <code>{data.figureId}</code>
            </p>
          ) : null}
          <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {V.requestLabel}
            <textarea name="request" required defaultValue={data.request} rows={4}
              style={{ display: "block", marginTop: "3px", width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px", fontFamily: "inherit" }} />
          </label>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-faint)" }}>{V.requestHint}</p>
          <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {V.kindLabel}
            <select name="specKind" defaultValue={data.specKind}
              style={{ display: "block", marginTop: "3px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }}>
              <option value="">{V.kindAuto}</option>
              {/* the enum tokens ARE the labels (REQ-SAFE-10 wraps them as expressions) */}
              <option value="vega_lite">{"vega_lite"}</option>
              <option value="mermaid">{"mermaid"}</option>
              <option value="table">{"table"}</option>
            </select>
          </label>
          <label data-insist="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "flex", gap: "6px", alignItems: "flex-start" }}>
            <input type="checkbox" name="insist" value="1" style={{ marginTop: "2px" }} />
            <span>{V.insistLabel}</span>
          </label>
          <p data-estimate="true" style={{ margin: 0, fontSize: "13px", color: "var(--shell-fg)" }}>
            {fmt(V.estimateFmt, { estimate: data.estimateCredits.toLocaleString("en-US"), cap: data.capCredits.toLocaleString("en-US") })}
          </p>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-faint)" }}>{V.chipNote}</p>
          {notice ? (
            <p data-notice="true" style={{ margin: 0, fontSize: "12px", color: "var(--sev-major)" }}>{notice}</p>
          ) : null}
          <div>
            <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600 }}>
              {V.startLabel}
            </button>
          </div>
        </form>
      </Shell>
    </div>
  );
}
