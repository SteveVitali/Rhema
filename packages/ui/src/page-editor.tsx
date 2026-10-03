import type { CSSProperties, ReactNode } from "react";

// The Page — the schema-first editor surface (P1.02; §5.4; REQ-SPEC-19, REQ-DATA-28/29 amended,
// REQ-POS-8/9, REQ-PROD-14). SSR renders the full chrome + a STATIC typeset render of the document
// (PmPreview — every profile node/mark maps to real markup); the page.js island then mounts the
// ProseMirror view over the embedded doc JSON and takes over the region. Without JS the page is a
// faithful read view plus the working note/cancel/revise <form> POSTs. There is no Save button and no
// unsaved-changes dialog — the autosave debounce is the only exposure (the pagehide beacon flushes).
//
// Text-agnostic: every user-facing string arrives via `labels` (the app's COPY table owns the words;
// the vocabulary lint covers them).

export interface PageLockView {
  readonly runId: string;
  readonly kind: "writer" | "reader";
  readonly workflow: string;
}

/** One projected finding on the Page's rail (the api's EditorFindingDto, pre-shaped). The `anchor`
 *  blob isn't rendered — it's embedded verbatim in `data-page-findings` so the island can re-resolve
 *  the span decorations on every edit. */
export interface PageFindingView {
  readonly findingId: string;
  readonly title: string;
  readonly severity: string;
  readonly sourceLabel: string;
  readonly quote: string | null;
  readonly lost: boolean;
  readonly anchor?: unknown;
  /** P1.07 — the kind hue + the suggestion preview the decoration layer emits (§5.7). */
  readonly kind?: string;
  readonly suggestion?: { replacement: string } | null;
}

/** A queued proposal card (agent-origin in-place change awaiting the human's accept/reject). */
export interface PageProposalView {
  readonly id: string;
  readonly label: string;
  /** the markdown fragment the card proposes (rendered as the card's preview). */
  readonly markdown: string;
  readonly kind: "replace" | "insert";
  /** PM range the proposal targets — the island hands them to acceptProposalTr verbatim. */
  readonly from: number;
  readonly to: number;
  /** `agent:<seat>:<runId>` — the accept transaction's origin (excluded from the human undo stack). */
  readonly origin: string;
}

export interface PageEditorLabels {
  /** e.g. (n) => "v3" or (n, baseN) => "v3 — your revision of v2". */
  readonly versionLabel: (draftN: number, baseDraftN: number | null) => string;
  /** the frozen-draft banner: typing forks v(N+1). */
  readonly frozenBanner: (n: number) => string;
  /** raw "v{n} — your revision of v{base}" template — the island rewrites the banner after a fork. */
  readonly forkFmt: string;
  readonly writerLockText: (workflow: string) => string;
  readonly readerLockText: (workflow: string) => string;
  readonly cancelRun: string;
  readonly findingsHeading: string;
  readonly wholePiece: string;
  readonly lostNote: string;
  readonly proposalsHeading: string;
  readonly accept: string;
  readonly reject: string;
  readonly noteLabel: string;
  readonly notePlaceholder: string;
  readonly noteSubmit: string;
  readonly noteSaved: string;
  readonly revise: string;
  /** the read-only note for artifact/other non-draft reads ("/a/:id" — nothing to type into). */
  readonly readOnlyNote: string;
  readonly danglingCiteNote: string;
  readonly authorshipHint: string;
  /** §5.10's verbatim pill vocabulary — `offline` carries `{n}` (the queued-change count). */
  readonly sync: { synced: string; syncing: string; queued: string; locked: string; offline: string; readOnly: string };
}

export interface PageEditorProps {
  /** the PM doc JSON (the schema's own shape) — the island mounts it; PmPreview SSRs it. */
  readonly docJson: unknown;
  readonly draftId: string;
  readonly draftN: number;
  readonly baseDraftN: number | null;
  readonly origin: string;
  /** "frozen" ⇒ read-only Page (the /v/:n view of a reviewed draft). */
  readonly state: string;
  readonly lock: PageLockView | null;
  readonly findings: readonly PageFindingView[];
  readonly proposals: readonly PageProposalView[];
  /** blockId → ProvenanceSource — the island seeds the provenance plugin + Authorship overlay from it. */
  readonly provenance: Readonly<Record<string, unknown>> | null;
  /** cite keys with no bibliography item — rendered visibly in the rail. */
  readonly danglingCites: readonly string[];
  readonly readOnly?: boolean;
  /**
   * P1.03 — the collab WSS base (`wss://<host>/collab`); absent ⇒ the island mounts the read-only
   * static view (artifact reads) instead of a live session.
   */
  readonly collabWsUrl?: string;
  /** transport URLs the island wires (the same-origin web routes forward the session). */
  readonly saveUrl: string;
  readonly docUrl: string;
  readonly noteUrl: string;
  readonly cancelUrl: string;
  readonly reviseUrl?: string;
  readonly noteSaved?: boolean;
  /** the finding to focus (deep-link /f/:findingId → Page) — scrolled + emphasised on mount. */
  readonly focusFindingId?: string;
  /**
   * P1.13 — the "Edit figure" affordance's href builder: `asset://fig_<id>` figure blocks render an
   * Edit link to the figure card (§7.5's fourth entry point). Absent ⇒ no affordance.
   */
  readonly figureHrefFor?: (figureId: string) => string;
  readonly editFigureLabel?: string;
  readonly labels: PageEditorLabels;
}

// ---------------------------------------------------------------------------------------------------------------------
// PmPreview — PM doc JSON → static React markup (the no-JS read view; also the pre-hydration paint).
// ---------------------------------------------------------------------------------------------------------------------

interface JsonNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: JsonNode[];
}

const SPAN_STYLE: CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.92em" };

function previewInline(n: JsonNode, key: number): ReactNode {
  let el: ReactNode;
  switch (n.type) {
    case "text":
      el = n.text ?? "";
      break;
    case "hard_break":
      el = <br />;
      break;
    case "image":
      el = n.attrs?.["identifier"]
        ? <span className="rm-img-ref">{"!["}{String(n.attrs["alt"] ?? "")}{"]["}{String(n.attrs["identifier"])}{"]"}</span>
        : <img src={String(n.attrs?.["src"] ?? "")} alt={String(n.attrs?.["alt"] ?? "")} title={n.attrs?.["title"] ? String(n.attrs["title"]) : undefined} />;
      break;
    case "math_inline":
      el = <span className="rm-math-inline" data-tex={String(n.attrs?.["value"] ?? "")}>{"$"}{String(n.attrs?.["value"] ?? "")}{"$"}</span>;
      break;
    case "footnote_ref":
      el = <sup className="rm-footnote-ref">{String(n.attrs?.["label"] || n.attrs?.["identifier"] || "")}</sup>;
      break;
    case "cite":
      el = (
        <span className="rm-cite" data-cite-keys={(n.attrs?.["keys"] as string[] | undefined)?.join(" ")}>
          [{(n.attrs?.["keys"] as string[] | undefined ?? []).map((k) => `@${k}`).join("; ")}]
        </span>
      );
      break;
    case "inline_html":
      el = <code className="rm-html-inline">{String(n.attrs?.["value"] ?? "")}</code>;
      break;
    default:
      el = n.text ?? "";
  }
  // marks wrap outside-in (schema rank order — matches the canonical serializer's nesting)
  for (const m of [...(n.marks ?? [])].reverse()) {
    switch (m.type) {
      case "em": el = <em>{el}</em>; break;
      case "strong": el = <strong>{el}</strong>; break;
      case "strike": el = <del>{el}</del>; break;
      case "code": el = <code>{el}</code>; break;
      case "link":
        el = m.attrs?.["identifier"]
          ? <span className="rm-link-ref" data-ref={String(m.attrs["identifier"])}>{el}</span>
          : <a href={String(m.attrs?.["href"] ?? "")} title={m.attrs?.["title"] ? String(m.attrs["title"]) : undefined}>{el}</a>;
        break;
      default: break;
    }
  }
  return <span key={key}>{el}</span>;
}

function previewInlineAll(children: JsonNode[] | undefined): ReactNode {
  return (children ?? []).map((c, i) => previewInline(c, i));
}

/** P1.13 — the preview context: the figure card's href builder + the Edit affordance's label. */
export interface PmPreviewContext {
  /** `asset://fig_<id>` → the figure card href (the "Edit figure" affordance's target). */
  readonly figureHrefFor?: (figureId: string) => string;
  readonly editFigureLabel?: string;
}

function previewBlock(n: JsonNode, key: number, ctx?: PmPreviewContext): ReactNode {
  switch (n.type) {
    case "front_matter":
      return <pre key={key} className="rm-frontmatter" style={SPAN_STYLE}>{`---\n${String(n.attrs?.["value"] ?? "")}\n---`}</pre>;
    case "paragraph":
      return <p key={key}>{previewInlineAll(n.content)}</p>;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.["level"] ?? 2)));
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag key={key}>{previewInlineAll(n.content)}</Tag>;
    }
    case "blockquote":
      return <blockquote key={key}>{(n.content ?? []).map((c, i) => previewBlock(c, i, ctx))}</blockquote>;
    case "code_block":
      return (
        <pre key={key} data-lang={String(n.attrs?.["lang"] ?? "")}>
          <code>{n.content?.map((c) => c.text ?? "").join("")}</code>
        </pre>
      );
    case "math_block":
      return <div key={key} className="rm-math-block" data-tex={String(n.attrs?.["value"] ?? "")}>{"$$ "}{String(n.attrs?.["value"] ?? "")}{" $$"}</div>;
    case "table":
      return (
        <table key={key}>
          <tbody>
            {(n.content ?? []).map((row, ri) => (
              <tr key={ri}>
                {(row.content ?? []).map((cell, ci) =>
                  ri === 0
                    ? <th key={ci}>{previewInlineAll(cell.content)}</th>
                    : <td key={ci}>{previewInlineAll(cell.content)}</td>,
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "list": {
      const items = (n.content ?? []).map((item, i) => (
        <li key={i} {...(item.attrs?.["checked"] != null ? { "data-task": item.attrs["checked"] ? "done" : "todo" } : {})}>
          {item.attrs?.["checked"] != null ? (
            <input type="checkbox" disabled checked={!!item.attrs["checked"]} readOnly style={{ marginRight: "0.4em" }} />
          ) : null}
          {(item.content ?? []).map((c, i) => previewBlock(c, i, ctx))}
        </li>
      ));
      return n.attrs?.["ordered"]
        ? <ol key={key} start={Number(n.attrs?.["start"] ?? 1)}>{items}</ol>
        : <ul key={key}>{items}</ul>;
    }
    case "thematic_break":
      return <hr key={key} />;
    case "footnote_definition":
      return (
        <aside key={key} className="rm-footnote-def" data-fn={String(n.attrs?.["label"] || n.attrs?.["identifier"] || "")}>
          {(n.content ?? []).map((c, i) => previewBlock(c, i, ctx))}
        </aside>
      );
    case "figure": {
      // P1.13 — the "Edit figure" entry point (§7.5): a Rhema figure asset (`asset://fig_<id>`)
      // renders an Edit affordance that opens the figure card at its current version — the card is
      // the edit surface; the draft block is only ever re-written by an accepted proposal.
      const src = String(n.attrs?.["src"] ?? "");
      const figRef = /^asset:\/\/fig_(\S+)$/.exec(src)?.[1];
      const editHref = figRef && ctx?.figureHrefFor ? ctx.figureHrefFor(figRef) : null;
      return (
        <figure key={key} className="rm-figure">
          {n.attrs?.["src"] && !figRef
            ? <img src={String(n.attrs["src"])} alt={String(n.attrs["alt"] ?? "")} />
            : <span className="rm-figure-placeholder">{String(n.attrs?.["alt"] ?? "")}</span>}
          {n.attrs?.["title"] ? <figcaption>{String(n.attrs["title"])}</figcaption> : null}
          {editHref ? (
            <figcaption>
              <a data-edit-figure={figRef} href={editHref}>{ctx?.editFigureLabel ?? "Edit figure"}</a>
            </figcaption>
          ) : null}
        </figure>
      );
    }
    case "link_definition":
      return (
        <pre key={key} className="rm-link-def" style={SPAN_STYLE}>
          {`[${String(n.attrs?.["label"] || n.attrs?.["identifier"] || "")}]: ${String(n.attrs?.["url"] ?? "")}${n.attrs?.["title"] ? ` "${String(n.attrs["title"])}"` : ""}`}
        </pre>
      );
    case "html_block":
      return <pre key={key} className="rm-html-block" style={SPAN_STYLE}>{String(n.attrs?.["value"] ?? "")}</pre>;
    default:
      return <p key={key}>{previewInlineAll(n.content)}</p>;
  }
}

/** The static read render of a PM doc JSON — every profile construct maps to markup. */
export function PmPreview({ docJson, ctx }: { docJson: unknown; ctx?: PmPreviewContext }): ReactNode {
  const doc = docJson as JsonNode;
  return <>{(doc?.content ?? []).map((c, i) => previewBlock(c, i, ctx))}</>;
}

// ---------------------------------------------------------------------------------------------------------------------
// the Page chrome
// ---------------------------------------------------------------------------------------------------------------------

const bannerStyle: CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: "8px",
  padding: "10px 14px",
  marginBottom: "14px",
  fontSize: "13px",
  display: "flex",
  gap: "12px",
  alignItems: "center",
  justifyContent: "space-between",
};

export function PageEditor(props: PageEditorProps): ReactNode {
  const L = props.labels;
  const locked = props.lock != null;
  // A frozen draft is NOT read-only — typing on it forks v(N+1) server-side (§5.4 editing rules;
  // the banner tells the user). Read-only means: an artifact read (explicit) or a held run lock.
  const readOnly = props.readOnly === true || locked;
  return (
    <div
      data-page-root="1"
      data-draft-id={props.draftId}
      data-draft-n={props.draftN}
      data-save-url={props.saveUrl}
      data-doc-url={props.docUrl}
      data-collab-url={props.collabWsUrl ?? ""}
      data-fork-fmt={L.forkFmt}
      data-locked={locked ? "1" : "0"}
      data-readonly={readOnly ? "1" : "0"}
      {...(props.focusFindingId ? { "data-focus-finding": props.focusFindingId } : {})}
    >
      {/* the version / fork / lock banners — an explicit readOnly read (an artifact page) shows the
          plain read-only note, not the frozen-draft fork copy. */}
      {props.readOnly !== true && (props.baseDraftN != null || props.state === "frozen") ? (
        <div data-page-banner="version" style={{ ...bannerStyle, borderColor: "var(--sev-note, var(--shell-border))" }}>
          <span>
            {props.state === "frozen"
              ? L.frozenBanner(props.draftN)
              : L.versionLabel(props.draftN, props.baseDraftN)}
          </span>
          {props.origin === "human_revision" && props.reviseUrl ? (
            <form method="post" action={props.reviseUrl} style={{ margin: 0 }}>
              <button type="submit" style={{ fontSize: "12px" }}>{L.revise}</button>
            </form>
          ) : null}
        </div>
      ) : null}
      <div
        data-page-banner="lock"
        style={{ ...bannerStyle, display: locked ? "flex" : "none", borderColor: "var(--sev-major)" }}
        data-writer-text={props.lock ? L.writerLockText("{workflow}") : ""}
        data-reader-text={props.lock ? L.readerLockText("{workflow}") : ""}
      >
        <span data-page-banner-text>
          {props.lock ? (props.lock.kind === "writer" ? L.writerLockText(props.lock.workflow) : L.readerLockText(props.lock.workflow)) : ""}
        </span>
        <form method="post" action={props.cancelUrl} style={{ margin: 0 }}>
          <button type="submit" style={{ fontSize: "12px" }}>{L.cancelRun}</button>
        </form>
      </div>
      {props.readOnly === true && !locked ? (
        <div data-page-banner="readonly" style={bannerStyle}>
          <span>{L.readOnlyNote}</span>
        </div>
      ) : null}

      {/* proposal cards — agent-origin in-place changes awaiting accept/reject (REQ-IDE-45 amended) */}
      {props.proposals.length > 0 ? (
        <div data-proposals-rail style={{ marginBottom: "14px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 8px" }}>{L.proposalsHeading}</h2>
          {props.proposals.map((p) => (
            <div key={p.id} data-proposal-card={p.id} data-proposal-md={p.markdown} data-proposal-kind={p.kind}
                 data-proposal-from={p.from} data-proposal-to={p.to} data-proposal-origin={p.origin}
                 style={{ ...bannerStyle, borderColor: "var(--sev-major)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.label}</div>
                <pre style={{ ...SPAN_STYLE, margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{p.markdown}</pre>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" data-proposal-accept={p.id} style={{ fontSize: "12px" }}>{L.accept}</button>
                <button type="button" data-proposal-reject={p.id} style={{ fontSize: "12px" }}>{L.reject}</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* the doc — SSR static render; the island mounts ProseMirror over the same JSON */}
      <div data-page-host className="rm-page-host" data-readonly={readOnly ? "1" : "0"}>
        <div data-page-preview className="rm-page-preview">
          <PmPreview
            docJson={props.docJson}
            {...(props.figureHrefFor
              ? { ctx: { figureHrefFor: props.figureHrefFor, ...(props.editFigureLabel ? { editFigureLabel: props.editFigureLabel } : {}) } }
              : {})}
          />
        </div>
      </div>
      <script type="application/json" data-page-doc="1">
        {JSON.stringify(props.docJson).replace(/</g, "\\u003c")}
      </script>
      {/* the stored provenance map (blockId → kind) — the island seeds the plugin + overlay from it */}
      <script type="application/json" data-page-prov="1">
        {JSON.stringify(props.provenance ?? {}).replace(/</g, "\\u003c")}
      </script>
      {/* the projected findings' anchors — the island re-resolves span decorations on every edit */}
      <script type="application/json" data-page-findings="1">
        {JSON.stringify(
          props.findings.map((f) => ({
            findingId: f.findingId,
            severity: f.severity,
            anchor: f.anchor ?? null,
            lost: f.lost,
            ...(f.kind ? { kind: f.kind } : {}),
            ...(f.suggestion ? { suggestion: f.suggestion } : {}),
          })),
        ).replace(/</g, "\\u003c")}
      </script>

      {/* the findings rail — the minimal card affordance the shell shows (the Margin's full surface is P1.07) */}
      {props.findings.length > 0 || props.danglingCites.length > 0 ? (
        <div data-findings-rail data-lost-note-text={L.lostNote} style={{ marginTop: "18px", borderTop: "1px solid var(--shell-border)", paddingTop: "10px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 8px" }}>{L.findingsHeading}</h2>
          {props.findings.map((f) => (
            <div key={f.findingId} data-finding-id={f.findingId} {...(f.lost ? { "data-lost": "true" } : {})}
                 style={{ borderLeft: "3px solid", borderLeftColor: `var(--sev-${f.severity})`, paddingLeft: "10px", marginBottom: "8px", fontSize: "13px" }}>
              <div style={{ fontWeight: 600 }}>{f.title}</div>
              <div style={{ color: "var(--shell-fg-muted)", fontSize: "12px" }}>{f.sourceLabel}</div>
              {f.quote ? <blockquote style={{ margin: "4px 0 0", fontStyle: "italic" }}>{f.quote}</blockquote> : null}
              {f.lost ? <div data-lost-note style={{ fontSize: "12px", color: "var(--sev-major)" }}>{L.lostNote}</div> : null}
            </div>
          ))}
          {props.danglingCites.length > 0 ? (
            <div data-dangling-cites style={{ fontSize: "12px", color: "var(--sev-major)", marginTop: "6px" }}>
              {L.danglingCiteNote}: {props.danglingCites.map((k) => <code key={k} style={{ marginRight: "6px" }}>@{k}</code>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* the note field — comments write Guidance rows (live during runs; §6.3/REQ-DATA-41) */}
      {!props.readOnly ? (
        <form method="post" action={props.noteUrl} style={{ marginTop: "16px", borderTop: "1px solid var(--shell-border)", paddingTop: "10px" }}>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block" }}>
            {L.noteLabel}
            <textarea name="text" required rows={2} placeholder={L.notePlaceholder}
                      style={{ display: "block", width: "100%", marginTop: "4px", font: "inherit", background: "var(--shell-bg)", color: "var(--shell-fg)", border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "8px" }} />
          </label>
          <button type="submit" style={{ fontSize: "12px", marginTop: "6px" }}>{L.noteSubmit}</button>
          {props.noteSaved ? <span style={{ fontSize: "12px", color: "var(--sev-minor)", marginLeft: "8px" }}>{L.noteSaved}</span> : null}
        </form>
      ) : null}

      {/* the sync pill the island drives (SSR'd so the pill exists before JS) — §5.10's vocabulary:
          synced ✓ / syncing… / offline · n changes queued / read-only. No Save button, ever. */}
      <div data-sync-pill data-label-synced={L.sync.synced} data-label-syncing={L.sync.syncing}
           data-label-offline={L.sync.offline} data-label-readonly={L.sync.readOnly}
           data-label-queued={L.sync.queued} data-label-locked={L.sync.locked}
           style={{ position: "fixed", bottom: "28px", right: "24px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
        {L.sync.synced}
      </div>

      {/* the island — mounts the ProseMirror view over data-page-doc (deferred; no-JS keeps the preview) */}
      <script src="/assets/page.js" defer />
    </div>
  );
}
