import type { ReactNode } from "react";
import { Pill, Chip, type Tone } from "./primitives/chips.js";
import { Badge } from "./primitives/status.js";
import { IconButton } from "./primitives/button.js";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "./primitives/menu.js";
import { Tooltip, TooltipProvider } from "./primitives/tooltip.js";
import { EmptyState } from "./primitives/surfaces.js";

// The §5.2 project list (P1.04), rewritten for REQ-HOME-1 (R7HOME.1; ADR-128): a FLAT,
// always-expanded list sorted by last edit — "Waiting on you" and "Running" pin above it only
// when non-empty, and the QUIET/Unfiled/Sheet labels are retired. One row per project — the
// status dot (with a legend tooltip), title, version + state, protocol, voice (only if set),
// the status line, last-edited stamp, one hover action (Open) and the ⋯ menu. Styling is the
// `.ui-*` classes from `uiCss()` — no inline spacing/type/colour/radius literals (REQ-GUARD-1,
// batch c1). The caller derives every state fact from `projectState` + the shared estimator;
// this module renders.

/** The status dot's five indicators: running / needs-you / ready / quiet / failed. Colour via
 *  the §5.9 state tokens; never colour-only (the legend tooltip + the state badge carry it). */
export type RowIndicator = "running" | "needs_you" | "ready" | "quiet" | "failed";

const INDICATOR_CLASS: Record<RowIndicator, string> = {
  running: "ui-prow-dot--running",
  needs_you: "ui-prow-dot--needs",
  ready: "ui-prow-dot--ready",
  quiet: "ui-prow-dot--quiet",
  failed: "ui-prow-dot--failed",
};

/** A row-menu item: a link (GET) or a post (form action); paid items carry their estimate. */
export interface RowActionView {
  readonly key: string;
  readonly label: string;
  /** GET actions — render as a link. */
  readonly href?: string;
  /** POST actions — the surface posts JSON (the no-JS grammar keeps `formAction`). */
  readonly formAction?: string;
  /** set ⇒ a paid item (opens the run sheet; never creates a run itself). */
  readonly paid?: boolean;
  /** the shared-estimator label ("est. 4,095 cr") shown beside a paid item. */
  readonly estimateLabel?: string;
  /** a destructive item renders in the danger tone (delete). */
  readonly danger?: boolean;
}

/** The status dot's legend lines, keyed by indicator (from the caller's COPY). */
export interface StatusDotLegend {
  readonly running: string;
  readonly needs_you: string;
  readonly ready: string;
  readonly quiet: string;
  readonly failed: string;
}

export interface ProjectRowView {
  readonly id: string;
  readonly title: string;
  /** Canonical project URL (`/p/:slug`). */
  readonly href: string;
  /** The status dot's indicator. */
  readonly indicator: RowIndicator;
  /** The state badge's label + tone ("Draft", "Reviewing", …). */
  readonly stateLabel: string;
  readonly stateTone?: Tone;
  /** "v3" — the current version label (absent on a draft-less row). */
  readonly versionLabel?: string | null;
  /** The protocol's display name (absent ⇒ the row shows none). */
  readonly protocolLabel?: string | null;
  /** The Voice name — rendered ONLY when set (no "Unfiled" chip; ADR-128). */
  readonly voiceLabel?: string | null;
  /** The assembled ≤120-char status line (state + phase + counts). */
  readonly statusLine?: string;
  /** The "Edited …" label (absent ⇒ no stamp). */
  readonly editedLabel?: string | null;
  /** The one hover action's label ("Open"). */
  readonly openLabel?: string;
  /** The ⋯ menu's items (hidden disabled items never arrive). */
  readonly menu: readonly RowActionView[];
  /** The ⋯ trigger's accessible label (from COPY). */
  readonly menuTriggerLabel: string;
  /** The status dot's tooltip legend lines. */
  readonly statusDotLegend: StatusDotLegend;
}

export interface ProjectListLabels {
  /** `data-menu-action` items post through this handler — the surface wires its mutation. */
  readonly onMenuAction?: (item: RowActionView, row: ProjectRowView) => void;
}

function StatusDot({ row }: { row: ProjectRowView }): ReactNode {
  return (
    <Tooltip content={row.statusDotLegend[row.indicator]} side="top">
      <span
        role="img"
        aria-label={row.statusDotLegend[row.indicator]}
        data-status-dot={row.indicator}
        className={`ui-prow-dot ${INDICATOR_CLASS[row.indicator]}${row.indicator === "running" ? " rhema-pulse" : ""}`}
      />
    </Tooltip>
  );
}

function RowMenu({ row, onMenuAction }: { row: ProjectRowView; onMenuAction?: ProjectListLabels["onMenuAction"] }): ReactNode {
  const navItems = row.menu.filter((i) => i.href != null && !i.paid);
  const paidItems = row.menu.filter((i) => i.paid);
  const postItems = row.menu.filter((i) => i.formAction != null);
  return (
    <DropdownMenu
      align="end"
      trigger={<IconButton aria-label={row.menuTriggerLabel} data-row-menu={row.id} size="sm">⋯</IconButton>}
    >
      {navItems.map((item) => (
        <DropdownMenuItem key={item.key} asChild data-menu-action={item.key}>
          <a href={item.href} className="ui-prow-menu-link">{item.label}</a>
        </DropdownMenuItem>
      ))}
      {paidItems.length > 0 ? <DropdownMenuSeparator /> : null}
      {paidItems.map((item) => (
        <DropdownMenuItem key={item.key} asChild data-menu-action={item.key} data-menu-est={item.estimateLabel != null ? item.key : undefined}>
          <a href={item.href} className="ui-prow-menu-link">
            {item.label}
            {item.estimateLabel != null ? <span className="ui-prow-menu-est">{item.estimateLabel}</span> : null}
          </a>
        </DropdownMenuItem>
      ))}
      {postItems.length > 0 ? <DropdownMenuSeparator /> : null}
      {postItems.map((item) => (
        <DropdownMenuItem
          key={item.key}
          data-menu-action={item.key}
          data-menu-form={item.key}
          className={item.danger ? "ui-menu-item--danger" : undefined}
          onSelect={() => onMenuAction?.(item, row)}
        >
          {item.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}

export function ProjectRow({
  row,
  onMenuAction,
}: {
  row: ProjectRowView;
  onMenuAction?: ProjectListLabels["onMenuAction"];
}): ReactNode {
  return (
    <li data-project-row={row.id} data-indicator={row.indicator} className="ui-prow">
      <StatusDot row={row} />
      <span className="ui-prow-main">
        <a href={row.href} className="ui-prow-title" data-row-open={row.id}>
          {row.title}
        </a>
        {row.versionLabel ? <span className="ui-prow-version tnum">{row.versionLabel}</span> : null}
        <Badge tone={row.stateTone === "ready" ? "ok" : row.stateTone === "attention" || row.stateTone === "needs_you" ? "attention" : row.indicator === "failed" ? "danger" : "neutral"} data-state-badge="true">
          {row.stateLabel}
        </Badge>
        {row.protocolLabel ? <Chip label={row.protocolLabel} /> : null}
        {row.voiceLabel ? <Chip label={row.voiceLabel} /> : null}
        {row.statusLine ? <span className="ui-prow-status">{row.statusLine}</span> : null}
      </span>
      {row.editedLabel ? <span className="ui-prow-edited" data-edited="true">{row.editedLabel}</span> : null}
      {row.openLabel ? (
        <a href={row.href} className="ui-prow-open" data-open={row.id}>{row.openLabel}</a>
      ) : null}
      <RowMenu row={row} onMenuAction={onMenuAction} />
    </li>
  );
}

function RowList({ rows, onMenuAction }: { rows: readonly ProjectRowView[]; onMenuAction?: ProjectListLabels["onMenuAction"] }): ReactNode {
  return (
    <ul className="ui-prow-list">
      {rows.map((row) => (
        <ProjectRow key={row.id} row={row} onMenuAction={onMenuAction} />
      ))}
    </ul>
  );
}

// ---- REQ-HOME-1's flat list + non-empty attention sections ----

export interface AttentionSectionView {
  /** "needs_you" | "running" — the only two pinned sections (ADR-128). */
  readonly key: string;
  readonly label: string;
  readonly rows: readonly ProjectRowView[];
}

/**
 * The §5.2-superseding home list (REQ-HOME-1): the non-empty attention sections pinned above a
 * flat, always-expanded list sorted by last edit. No collapsed group, no QUIET label, no
 * Unfiled/Sheet chips — a mixed fixture renders every row on load.
 */
export function ProjectHomeList({
  sections,
  rows,
  emptyTitle,
  emptyBody,
  emptyAction,
  onMenuAction,
}: {
  readonly sections: readonly AttentionSectionView[];
  readonly rows: readonly ProjectRowView[];
  readonly emptyTitle: ReactNode;
  readonly emptyBody?: ReactNode;
  readonly emptyAction?: ReactNode;
  readonly onMenuAction?: ProjectListLabels["onMenuAction"];
}): ReactNode {
  const visible = sections.reduce((n, s) => n + s.rows.length, 0) + rows.length;
  if (visible === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} data-project-empty="true" />;
  }
  return (
    <TooltipProvider>
    <div className="ui-prow-home">
      {sections.map((s) =>
        s.rows.length === 0 ? null : (
          <section key={s.key} data-attention={s.key} className="ui-prow-section">
            <h2 className="ui-prow-heading">
              {s.label} · {s.rows.length}
            </h2>
            <RowList rows={s.rows} onMenuAction={onMenuAction} />
          </section>
        ),
      )}
      {rows.length > 0 ? (
        <section data-project-list="true" className="ui-prow-section">
          <RowList rows={rows} onMenuAction={onMenuAction} />
        </section>
      ) : null}
    </div>
    </TooltipProvider>
  );
}

// ---- the opt-in Group-by — by Voice (Unfiled first; headers count older profiles) ----

export interface VoiceGroupView {
  /** the persona id, or "unfiled" for the no-voice group (always rendered first). */
  readonly key: string;
  readonly label: string;
  /** the voice's page — the older-profile count links here (the Adopt entry lives on it). */
  readonly href?: string;
  readonly statusLabel?: string;
  readonly statusTone?: Tone;
  /** "N use an older profile" — projects pinned behind the voice's current snapshot. */
  readonly olderProfileCount?: number;
  readonly rows: readonly ProjectRowView[];
}

export function VoiceGroupList({
  groups,
  emptyTitle,
  emptyBody,
  onMenuAction,
}: {
  groups: readonly VoiceGroupView[];
  emptyTitle: ReactNode;
  emptyBody?: ReactNode;
  onMenuAction?: ProjectListLabels["onMenuAction"];
}): ReactNode {
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (total === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} data-project-empty="true" />;
  }
  return (
    <TooltipProvider>
    <div className="ui-prow-home">
      {groups.map((g) =>
        g.rows.length === 0 ? null : (
          <section key={g.key} className="ui-prow-section">
            <h2 className="ui-prow-heading" data-voice-group={g.key}>
              {g.label} · {g.rows.length}
              {g.statusLabel ? (
                <span className="ui-prow-heading-pill">
                  <Pill label={g.statusLabel} tone={g.statusTone ?? "neutral"} />
                </span>
              ) : null}
              {(g.olderProfileCount ?? 0) > 0 ? (
                <span className="ui-prow-heading-note">
                  {" — "}
                  {g.href ? (
                    <a href={g.href} className="ui-prow-heading-link">
                      {g.olderProfileCount} use an older profile
                    </a>
                  ) : (
                    `${g.olderProfileCount} use an older profile`
                  )}
                </span>
              ) : null}
            </h2>
            <RowList rows={g.rows} onMenuAction={onMenuAction} />
          </section>
        ),
      )}
    </div>
    </TooltipProvider>
  );
}
