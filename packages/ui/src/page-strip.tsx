import type { CSSProperties, ReactNode } from "react";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "./primitives/index.js";
import type { PageEditorLabels, PageLockView, PageProposalView } from "./page-editor.js";

// R7WRITE.1a (REQ-WRITE-6; B4, B5, B11, UXC-24) — the page header strip: the chrome that used to
// typeset inside the document card now sits ABOVE `.paper` at the page measure. It carries the
// breadcrumb, the version chip (frozen/working), the one sync indicator (ADR-049's single pill,
// moved out of the paper), the ReadOnlyProject notice, and the project actions (Run ▾ / Export /
// ⋯). The version/lock banners and the proposal cards moved here too — `.paper` holds only the
// document (plus its findings rail + note form).
//
// Banners render INFORMATIONALLY (B5): a quiet left-rule line, never the bordered input-like box
// the audit flagged. And nothing here draws a second card border inside the page measure (B11).
//
// Read-only (S-3/REQ-DWEB-14): the strip hides or disables every write action BEFORE any request —
// the caller passes `writeActions={null}` under `ReadOnlyProject{demo|showcase|run_lock}` so no
// affordance exists to fire.

export interface PageStripCrumb {
  readonly label: string;
  readonly href?: string;
}

export interface PageStripAction {
  readonly label: string;
  readonly href?: string;
  /** estimator-rendered hint (e.g. "≈ 560 cr") — never computed here. */
  readonly hint?: string;
  /** the keymap-generated chord glyph (REQ-KEYS-2 — `shortcutFor`, never hand-typed). */
  readonly keys?: string | null;
  /** a client action (e.g. the source-mode toggle) — used instead of `href`. */
  readonly onSelect?: () => void;
}

export interface PageStripProps {
  /** the `Project › Surface` trail — same shape as `spa/page-header.tsx`'s crumbs. */
  readonly crumbs: readonly PageStripCrumb[];
  readonly draftN: number;
  readonly baseDraftN: number | null;
  readonly origin: string;
  readonly state: string;
  readonly lock: PageLockView | null;
  readonly proposals: readonly PageProposalView[];
  /** an explicit readOnly read (artifact page) — the plain read-only banner replaces the fork text. */
  readonly readOnly?: boolean;
  /** ReadOnlyProject reason (demo/showcase/run_lock) — withholds every write control. */
  readonly readOnlyReason?: string;
  readonly readOnlyTooltip?: string;
  /** the ReadOnlyProject notice node (demo/showcase sentences + the showcase Duplicate form). */
  readonly notice?: ReactNode;
  /** the project actions — `null` under a read-only reason (hidden before any request). */
  readonly actions?: {
    readonly run: readonly PageStripAction[];
    readonly exportHref: string;
    readonly more: readonly PageStripAction[];
  } | null;
  /** REQ-WRITE-5 (239) — the ONE Rich text / Source toggle (SPA arm only; SSR never emits it
   *  since Source mode is SPA-mounted). `on` = Source mode active. */
  readonly source?: {
    readonly on: boolean;
    readonly onToggle: () => void;
    readonly richLabel: string;
    readonly sourceLabel: string;
    readonly tip?: string;
  };
  readonly reviseUrl?: string;
  readonly cancelUrl: string;
  readonly labels: PageEditorLabels;
  /** strip-level copy (crumb aria, the version state badges, the menu labels). */
  readonly stripLabels: {
    readonly breadcrumbAria: string;
    readonly separator: string;
    readonly workingBadge: string;
    readonly frozenBadge: string;
    readonly runLabel: string;
    readonly moreLabel: string;
  };
  /** the proposal cards' click seam (SPA leaf; absent ⇒ the SSR island binds listeners). */
  readonly onProposalAccept?: (proposal: PageProposalView) => void;
  readonly onProposalReject?: (proposalId: string) => void;
}

const noticeStyle: CSSProperties = {
  borderLeft: "2px solid var(--sev-note, var(--shell-border))",
  paddingLeft: "10px",
  marginBottom: "8px",
  fontSize: "13px",
  display: "flex",
  gap: "12px",
  alignItems: "center",
  justifyContent: "space-between",
};

export function PageStrip(props: PageStripProps): ReactNode {
  const L = props.labels;
  const S = props.stripLabels;
  const locked = props.lock != null;
  const withholdWrites = props.readOnly === true || locked || props.readOnlyReason != null;
  const tip = props.readOnlyTooltip;
  const frozen = props.state === "frozen";
  return (
    <div className="page-strip" data-page-strip="true">
      <div className="page-strip-row" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <nav
          aria-label={S.breadcrumbAria}
          data-page-breadcrumb="true"
          style={{ fontSize: "12px", color: "var(--shell-fg-faint)", minWidth: 0 }}
        >
          {props.crumbs.map((c, i) => {
            const last = i === props.crumbs.length - 1;
            return (
              <span key={`${i}-${c.label}`}>
                {i > 0 ? <span aria-hidden="true">{` ${S.separator} `}</span> : null}
                {!last && c.href != null ? (
                  <a href={c.href} data-breadcrumb-link="true" style={{ color: "var(--shell-fg-muted)" }}>
                    {c.label}
                  </a>
                ) : (
                  <span {...(last ? { "aria-current": "page" as const } : {})}>{c.label}</span>
                )}
              </span>
            );
          })}
        </nav>
        {/* the version chip — vN + the frozen/working badge (REQ-WRITE-6). */}
        <span
          data-version-chip="true"
          data-version-state={frozen ? "frozen" : "working"}
          style={{ fontSize: "12px", color: "var(--shell-fg-muted)", whiteSpace: "nowrap" }}
        >
          {`v${props.draftN}`}
          <span
            data-version-badge={frozen ? "frozen" : "working"}
            style={{
              marginLeft: "6px",
              fontSize: "11px",
              padding: "1px 7px",
              borderRadius: "999px",
              border: "1px solid var(--shell-border)",
              color: frozen ? "var(--shell-fg-muted)" : "var(--state-ready, var(--shell-fg-muted))",
            }}
          >
            {frozen ? S.frozenBadge : S.workingBadge}
          </span>
        </span>
        <span style={{ flex: 1 }} />
        {props.notice}
        {/* the ONE sync indicator (EDIT.1/ADR-049) — moved out of the paper (REQ-WRITE-6). The
            island finds it by attribute — placement-agnostic. */}
        <div data-sync-pill role="status" aria-live="polite"
             data-label-synced={L.sync.synced} data-label-syncing={L.sync.syncing}
             data-label-offline={L.sync.offline} data-label-readonly={L.sync.readOnly}
             data-label-queued={L.sync.queued} data-label-locked={L.sync.locked}
             style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "2px 10px", borderRadius: "999px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", fontSize: "12px", color: "var(--shell-fg-muted)", whiteSpace: "nowrap" }}>
          {L.sync.synced}
        </div>
        {props.source ? (
          <button
            type="button"
            data-source-toggle="true"
            className="page-strip-btn"
            aria-pressed={props.source.on}
            {...(props.source.tip ? { title: props.source.tip } : {})}
            onClick={() => props.source?.onToggle()}
          >
            {props.source.on ? props.source.richLabel : props.source.sourceLabel}
          </button>
        ) : null}
        {props.actions ? (
          <div className="page-strip-actions" data-page-actions="true" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <DropdownMenu
              trigger={
                <button type="button" data-run-menu="true" className="page-strip-btn" aria-haspopup="menu">
                  {S.runLabel}
                </button>
              }
            >
              {props.actions.run.map((item) => (
                <DropdownMenuItem key={item.label} asChild>
                  <a href={item.href} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <span>{item.label}</span>
                    <span style={{ display: "inline-flex", gap: "8px", color: "var(--shell-fg-faint)" }}>
                      {item.keys ? <kbd>{item.keys}</kbd> : null}
                      {item.hint ? <span>{item.hint}</span> : null}
                    </span>
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenu>
            <a href={props.actions.exportHref} data-export-link="true" className="page-strip-btn">
              Export
            </a>
            <DropdownMenu
              trigger={
                <button type="button" data-more-menu="true" className="page-strip-btn" aria-haspopup="menu" aria-label={S.moreLabel}>
                  ⋯
                </button>
              }
            >
              {props.actions.more.map((item, i) => (
                <span key={`${i}-${item.label}`}>
                  {i > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    {...(item.onSelect ? { onSelect: () => item.onSelect?.() } : { asChild: true })}
                  >
                    {item.onSelect ? item.label : <a href={item.href ?? "#"}>{item.label}</a>}
                  </DropdownMenuItem>
                </span>
              ))}
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {/* the version / fork / lock banners — informational style, never input-like (B5). An
          explicit readOnly read (an artifact page) shows the plain read-only note. */}
      {props.readOnly !== true && (props.baseDraftN != null || props.state === "frozen") ? (
        <div data-page-banner="version" style={noticeStyle}>
          <span>
            {props.state === "frozen"
              ? L.frozenBanner(props.draftN)
              : L.versionLabel(props.draftN, props.baseDraftN)}
          </span>
          {props.origin === "human_revision" && props.reviseUrl ? (
            withholdWrites ? (
              <button type="button" disabled title={tip} style={{ fontSize: "12px" }}>
                {L.revise}
              </button>
            ) : (
            <form method="post" action={props.reviseUrl} style={{ margin: 0 }}>
              <button type="submit" style={{ fontSize: "12px" }}>{L.revise}</button>
            </form>
            )
          ) : null}
        </div>
      ) : null}
      {/* SPA.24 — the lock banner emits unconditionally (the §6.3 poll can grab a lock mid-session). */}
      <div
        data-page-banner="lock"
        style={{ ...noticeStyle, display: locked ? "flex" : "none", borderLeftColor: "var(--sev-major)" }}
        data-writer-text={L.writerLockText("{workflow}")}
        data-reader-text={L.readerLockText("{workflow}")}
      >
        <span data-page-banner-text>
          {props.lock ? (props.lock.kind === "writer" ? L.writerLockText(props.lock.workflow) : L.readerLockText(props.lock.workflow)) : ""}
        </span>
        <form method="post" action={props.cancelUrl} style={{ margin: 0 }}>
          <button type="submit" style={{ fontSize: "12px" }}>{L.cancelRun}</button>
        </form>
      </div>
      {props.readOnly === true && !locked ? (
        <div data-page-banner="readonly" style={noticeStyle}>
          <span>{L.readOnlyNote}</span>
        </div>
      ) : null}

      {/* proposal cards — moved out of `.paper`; the informational style holds (B5/B11). */}
      {props.proposals.length > 0 ? (
        <div data-proposals-rail style={{ marginBottom: "8px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 8px" }}>{L.proposalsHeading}</h2>
          {props.proposals.map((p) => (
            <div key={p.id} data-proposal-card={p.id} data-proposal-md={p.markdown} data-proposal-kind={p.kind}
                 data-proposal-from={p.from} data-proposal-to={p.to} data-proposal-origin={p.origin}
                 style={{ ...noticeStyle, borderLeftColor: "var(--sev-major)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.label}</div>
                <pre style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.92em", margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{p.markdown}</pre>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  data-proposal-accept={p.id}
                  {...(withholdWrites ? { disabled: true, title: tip } : {})}
                  {...(props.onProposalAccept && !withholdWrites ? { onClick: () => props.onProposalAccept?.(p) } : {})}
                  style={{ fontSize: "12px" }}
                >
                  {L.accept}
                </button>
                <button
                  type="button"
                  data-proposal-reject={p.id}
                  {...(withholdWrites ? { disabled: true, title: tip } : {})}
                  {...(props.onProposalReject && !withholdWrites ? { onClick: () => props.onProposalReject?.(p.id) } : {})}
                  style={{ fontSize: "12px" }}
                >
                  {L.reject}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
