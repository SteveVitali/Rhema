import type { CSSProperties, ReactNode } from "react";
import { Pill, Chip, ActionLink, type Tone } from "./primitives/chips.js";

// The §5.2 project list (P1.04). One row per project — the state icon, title, current version, the
// ≤120-char status line, the Voice chip (or Unfiled) + staleness pill, the one state-matched primary
// action, and the "…" row menu. The caller derives every state fact from `projectState` over the row
// sets (the project table stores no `status` column) and maps it onto these views; this module renders.

/** The state icon's five indicators (§5.2): animated running / amber needs-you / green ready /
 *  grey quiet / red failed. Colour via the §5.9 state tokens; never colour-only (the pill carries it). */
export type RowIndicator = "running" | "needs_you" | "ready" | "quiet" | "failed";

const INDICATOR_COLOR: Record<RowIndicator, string> = {
  running: "var(--state-running)",
  needs_you: "var(--state-needs-you)",
  ready: "var(--state-ready)",
  quiet: "var(--shell-fg-faint)",
  failed: "var(--sev-blocking)",
};

/** A row-menu item: a link (GET) or a small form (POST); disabled items show their reason. */
export interface RowActionView {
  readonly key: string;
  readonly label: string;
  /** GET actions — render as a link. */
  readonly href?: string;
  /** POST actions — render as a form posting here. */
  readonly formAction?: string;
  /** set ⇒ the item renders disabled with this reason (§5.2: "disabled items say why"). */
  readonly disabledReason?: string;
}

/** A secondary workflow chip beside the row (e.g. "New review round"); disabled ones say why. */
export interface SecondaryChipView {
  readonly key: string;
  readonly label: string;
  readonly href?: string;
  readonly formAction?: string;
  readonly disabledReason?: string;
}

/** A Voice-picker option inside the row menu's "Change voice" form. */
export interface VoiceOptionView {
  readonly personaId: string;
  readonly name: string;
  /** the shared §9.6 status pill label + tone (the picker honors REQ-PERSONA-20's hints). */
  readonly statusLabel?: string;
}

export interface ProjectRowView {
  readonly id: string;
  readonly title: string;
  /** Canonical project URL (`/p/:slug`). */
  readonly href: string;
  readonly pill: { readonly label: string; readonly tone?: Tone };
  /** The one primary action (Suggested next). Absent for terminal/quiet states. */
  readonly action?: { readonly label: string; readonly href: string };
  /** "v3" — the current version label (absent on a draft-less row). */
  readonly versionLabel?: string | null;
  /** The assembled ≤120-char status line (state · phase · counts). */
  readonly statusLine?: string;
  /** Absent ⇒ the quiet grey dot (the deprecated flat list's minimal views). */
  readonly indicator?: RowIndicator;
  /** The Voice chip — null ⇒ the row renders "Unfiled". */
  readonly voiceChip?: {
    readonly label: string;
    readonly href: string;
    /** the shared voice-staleness pill (§9.6) — "Voice stale · 3 samples newer" etc. */
    readonly statusLabel?: string;
    readonly statusTone?: Tone;
  } | null;
  /** The unlinked label the row renders when voiceChip is null. */
  readonly unfiledLabel?: string;
  /** The "…" menu's items (all seven §5.2 row actions + disabled reasons). */
  readonly actions?: readonly RowActionView[];
  /** Secondary workflow chips + the all-workflows menu's disabled entries. */
  readonly secondaryChips?: readonly SecondaryChipView[];
  /** The row menu's "Change voice" select options (empty ⇒ the action renders its disabled reason). */
  readonly voiceOptions?: readonly VoiceOptionView[];
  /** Change-voice form target; unset ⇒ no form (disabled-reason action covers it). */
  readonly voiceFormAction?: string;
  readonly currentPersonaId?: string | null;
  /** the no-voice option's label (REQ-PERSONA-20's "No voice"). */
  readonly noVoiceLabel?: string;
}

const rowMenuSummaryStyle: CSSProperties = {
  cursor: "pointer",
  listStyle: "none",
  color: "var(--shell-fg-muted)",
  fontSize: "15px",
  padding: "2px 6px",
  borderRadius: "6px",
  userSelect: "none",
};

const menuItemStyle: CSSProperties = {
  display: "block",
  padding: "5px 10px",
  fontSize: "13px",
  color: "var(--shell-fg)",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const menuButtonStyle: CSSProperties = {
  ...menuItemStyle,
  background: "none",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
};

const disabledItemStyle: CSSProperties = {
  ...menuItemStyle,
  color: "var(--shell-fg-faint)",
  cursor: "not-allowed",
};

function RowMenuItem({ item }: { item: RowActionView }): ReactNode {
  if (item.disabledReason) {
    return (
      <span style={disabledItemStyle} title={item.disabledReason} data-disabled-reason={item.disabledReason}>
        {item.label}
      </span>
    );
  }
  if (item.href) {
    return (
      <a href={item.href} style={menuItemStyle}>
        {item.label}
      </a>
    );
  }
  if (item.formAction) {
    return (
      // SPA.6 — `data-menu-form=<key>` is the renderer-agnostic hook (the action URL is SSR detail).
      <form method="post" action={item.formAction} data-menu-form={item.key} style={{ margin: 0 }}>
        <button type="submit" data-menu-action={item.key} style={menuButtonStyle}>
          {item.label}
        </button>
      </form>
    );
  }
  return <span style={menuItemStyle}>{item.label}</span>;
}

function SecondaryChip({ chip }: { chip: SecondaryChipView }): ReactNode {
  if (chip.disabledReason) {
    return <Chip label={chip.label} title={chip.disabledReason} />;
  }
  if (chip.href) return <Chip label={chip.label} href={chip.href} />;
  if (chip.formAction) {
    return (
      <form method="post" action={chip.formAction} style={{ display: "inline", margin: 0 }}>
        <button
          type="submit"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "1px 8px",
            borderRadius: "6px",
            border: "1px solid var(--shell-border)",
            background: "var(--shell-surface)",
            color: "var(--shell-fg-muted)",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          {chip.label}
        </button>
      </form>
    );
  }
  return <Chip label={chip.label} />;
}

export function ProjectRow({ row }: { row: ProjectRowView }): ReactNode {
  return (
    <li
      data-project-row={row.id}
      data-indicator={row.indicator ?? "quiet"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
        padding: "12px 16px",
        borderBottom: "1px solid var(--shell-border)",
      }}
    >
      {/* the §5.2 state icon — animated (rhema-pulse) on running, amber needs-you, green ready,
          grey quiet, red failed. */}
      <span
        aria-hidden="true"
        className={(row.indicator ?? "quiet") === "running" ? "rhema-pulse" : undefined}
        style={{
          width: "9px",
          height: "9px",
          borderRadius: "999px",
          flex: "0 0 auto",
          background: INDICATOR_COLOR[row.indicator ?? "quiet"],
        }}
      />
      <span style={{ flex: "1 1 220px", minWidth: 0 }}>
        <a
          href={row.href}
          style={{
            color: "var(--shell-fg)",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: "15px",
          }}
        >
          {row.title}
        </a>
        {row.versionLabel ? (
          <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px", marginLeft: "8px" }} className="tnum">
            {row.versionLabel}
          </span>
        ) : null}
        {row.statusLine ? (
          <div style={{ color: "var(--shell-fg-muted)", fontSize: "12px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.statusLine}
          </div>
        ) : null}
        {(row.secondaryChips ?? []).length > 0 ? (
          <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
            {(row.secondaryChips ?? []).map((chip) => (
              <SecondaryChip key={chip.key} chip={chip} />
            ))}
          </div>
        ) : null}
      </span>
      <Pill label={row.pill.label} tone={row.pill.tone} />
      {row.voiceChip ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <Chip label={row.voiceChip.label} href={row.voiceChip.href} />
          {row.voiceChip.statusLabel ? (
            <Pill label={row.voiceChip.statusLabel} tone={row.voiceChip.statusTone ?? "neutral"} />
          ) : null}
        </span>
      ) : (
        <Chip label={row.unfiledLabel ?? "Unfiled"} />
      )}
      {row.action ? <ActionLink label={row.action.label} href={row.action.href} /> : null}
      <details style={{ position: "relative" }}>
        <summary aria-label="Project actions" title="Project actions" style={rowMenuSummaryStyle}>
          ⋯
        </summary>
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            zIndex: 20,
            minWidth: "190px",
            marginTop: "4px",
            padding: "4px",
            border: "1px solid var(--shell-border)",
            borderRadius: "8px",
            background: "var(--shell-raised)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {(row.actions ?? []).map((item) => (
            <RowMenuItem key={item.key} item={item} />
          ))}
          {row.voiceFormAction && row.voiceOptions ? (
            <form method="post" action={row.voiceFormAction} style={{ margin: 0, padding: "5px 10px" }}>
              <select
                name="personaId"
                defaultValue={row.currentPersonaId ?? ""}
                aria-label="Change voice"
                style={{ fontSize: "12px", maxWidth: "100%" }}
              >
                <option value="">{row.noVoiceLabel ?? "No voice"}</option>
                {row.voiceOptions.map((o) => (
                  <option key={o.personaId} value={o.personaId}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button type="submit" style={{ ...menuButtonStyle, padding: "4px 0 0" }}>
                Change voice
              </button>
            </form>
          ) : null}
        </div>
      </details>
    </li>
  );
}

// ---- §5.2 attention grouping ----

export type ProjectGroupKey = "needs_you" | "running" | "ready_to_read" | "quiet";

export interface ProjectGroupView {
  readonly key: ProjectGroupKey;
  readonly label: string;
  readonly rows: readonly ProjectRowView[];
  /** Quiet collapses by default (a `<details>`). */
  readonly collapsed?: boolean;
  /** The collapsed summary line — Quiet's "N Unfiled · M with a Voice" sub-counts. */
  readonly summary?: string;
}

const groupSectionStyle: CSSProperties = { margin: "0 0 18px" };
const groupHeadingStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--shell-fg-muted)",
  margin: "0 0 6px",
};
const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  border: "1px solid var(--shell-border)",
  borderRadius: "12px",
  overflow: "hidden",
  background: "var(--shell-surface)",
};

function RowList({ rows }: { rows: readonly ProjectRowView[] }): ReactNode {
  return (
    <ul style={listStyle}>
      {rows.map((row) => (
        <ProjectRow key={row.id} row={row} />
      ))}
    </ul>
  );
}

/** The attention-grouped list (§5.2): Needs you / Running / Ready to read / Quiet (collapsed). */
export function ProjectGroupList({
  groups,
  emptyLabel,
}: {
  groups: readonly ProjectGroupView[];
  emptyLabel: string;
}): ReactNode {
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (total === 0) {
    return <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{emptyLabel}</p>;
  }
  return (
    <div>
      {groups.map((g) => {
        if (g.rows.length === 0) return null;
        const body = (
          <>
            <h2 style={groupHeadingStyle} data-group={g.key}>
              {g.label} · {g.rows.length}
            </h2>
            <RowList rows={g.rows} />
          </>
        );
        if (g.collapsed) {
          // HOT.1 (REQ-IDE-4) — `listStyle: "none"` suppresses the native disclosure triangle, so the
          // group looked empty/inert (PR-J5). Ship an explicit affordance instead: the ▸ marker
          // (rotated open by a theme-css rule on [open]) plus a text Show/Hide cue the same rule swaps.
          const cueStyle: CSSProperties = {
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: 0,
            color: "var(--shell-fg-faint)",
            marginLeft: "8px",
          };
          return (
            <details key={g.key} style={groupSectionStyle} data-collapsed-group={g.key}>
              <summary style={{ ...groupHeadingStyle, cursor: "pointer", listStyle: "none" }}>
                <span
                  aria-hidden="true"
                  data-collapsed-marker="true"
                  style={{ display: "inline-block", marginRight: "6px", transition: "transform 0.15s" }}
                >
                  ▸
                </span>
                {g.label} · {g.rows.length}
                {g.summary ? (
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    {" "}
                    — {g.summary}
                  </span>
                ) : null}
                <span data-cue-when-closed="true" style={cueStyle}>
                  {"· Show"}
                </span>
                <span data-cue-when-open="true" style={cueStyle}>
                  {"· Hide"}
                </span>
              </summary>
              <RowList rows={g.rows} />
            </details>
          );
        }
        return (
          <section key={g.key} style={groupSectionStyle}>
            {body}
          </section>
        );
      })}
    </div>
  );
}

// ---- §5.2's alternate grouping — by Voice (Unfiled first; headers count older profiles) ----

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
  emptyLabel,
}: {
  groups: readonly VoiceGroupView[];
  emptyLabel: string;
}): ReactNode {
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (total === 0) {
    return <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{emptyLabel}</p>;
  }
  return (
    <div>
      {groups.map((g) =>
        g.rows.length === 0 ? null : (
          <section key={g.key} style={groupSectionStyle}>
            <h2 style={groupHeadingStyle} data-voice-group={g.key}>
              {g.label} · {g.rows.length}
              {g.statusLabel ? (
                <span style={{ marginLeft: "8px" }}>
                  <Pill label={g.statusLabel} tone={g.statusTone ?? "neutral"} />
                </span>
              ) : null}
              {(g.olderProfileCount ?? 0) > 0 ? (
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  {" "}
                  —{" "}
                  {g.href ? (
                    <a href={g.href} style={{ color: "var(--shell-fg-muted)" }}>
                      {g.olderProfileCount} use an older profile
                    </a>
                  ) : (
                    `${g.olderProfileCount} use an older profile`
                  )}
                </span>
              ) : null}
            </h2>
            <RowList rows={g.rows} />
          </section>
        ),
      )}
    </div>
  );
}

/** @deprecated the P1.04 grouped view supersedes the flat list; kept for older callers. */
export function ProjectList({
  rows,
  emptyLabel,
}: {
  rows: readonly ProjectRowView[];
  emptyLabel: string;
}): ReactNode {
  if (rows.length === 0) {
    return <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{emptyLabel}</p>;
  }
  return <RowList rows={rows} />;
}
