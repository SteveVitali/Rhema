import type { CSSProperties, ReactNode } from "react";
import type { WhatChangedView as WhatChangedViewModel } from "@rhema/findings-core";
import { WhatChangedView, type WhatChangedLabels } from "./what-changed.js";

// The version rail (§5.8; P1.08; REQ-IDE-32, REQ-OBJ-6, REQ-PROD-11): the chip strip over the Page —
//   Outline → v1 🔒 → v2 🔒 → v3 ● draft        [Compare ▾] [Restore points ▾]
// every origin value, the 🔒 frozen mark, reviewed/answered flags, the "claims pending verification"
// chip on human_revision rows, and the ⚑ blocking/major obligations chip — plus the restore-points
// dropdown (§5.8 groups, older-than-today behind Advanced) and the inline preview-diff card a
// `?restore=<id>` pick renders. Server-rendered, text-agnostic (all copy via `labels`).

export interface RailVersion {
  readonly draftId: string;
  readonly n: number;
  readonly origin: string;
  readonly state: string;
  readonly frozen: boolean;
  readonly createdAt: string;
  readonly words: number | null;
  readonly reviewed: boolean;
  readonly answered: boolean;
  readonly claimsPendingVerification: boolean;
  readonly obligations: { readonly open: number; readonly addressed: number };
}

export interface RestorePointRow {
  readonly id: string;
  readonly kind: string;
  readonly cause: string;
  readonly label: string | null;
  readonly createdAt: string;
  /** the §5.8 group: named | earlier_today | yesterday | before_review | earlier. */
  readonly group: string;
  readonly beforeReviewN?: number;
  /** older-than-today points sit behind the Advanced disclosure (progressive disclosure). */
  readonly advanced: boolean;
}

export interface RestorePreviewData {
  readonly point: RestorePointRow;
  readonly view: WhatChangedViewModel;
}

export interface VersionRailLabels {
  readonly outline: string;
  /** a chip's origin caption — e.g. "Drafter" / "edited by you" / "you". */
  readonly originLabel: (origin: string) => string;
  readonly workingLabel: string;
  readonly frozenTitle: string;
  readonly reviewedFlag: string;
  readonly answeredFlag: string;
  readonly claimsPending: string;
  /** the ⚑ chip — e.g. (o, a) => `⚑ ${o} open · ${a} addressed`. */
  readonly obligationsFmt: (open: number, addressed: number) => string;
  readonly wordsFmt: (n: number) => string;
  readonly dateFmt: (iso: string) => string;
  readonly compare: string;
  readonly comparePrevious: string;
  readonly restorePoints: string;
  readonly restoreEmpty: string;
  readonly restoreGroupLabel: (group: string, beforeReviewN?: number) => string;
  readonly restorePointLabel: (p: RestorePointRow) => string;
  readonly restorePreviewHeading: string;
  readonly restoreApply: string;
  readonly restoreUndoHint: string;
  readonly restoredNotice: (draftN: number) => string;
  readonly compareWhatChanged: WhatChangedLabels;
}

export interface VersionRailProps {
  readonly versions: readonly RailVersion[];
  readonly outline?: { readonly artifactId: string; readonly words: number | null } | null;
  /** the project-level ⚑ chip (blocking/major across drafts). */
  readonly chip?: { readonly open: number; readonly addressed: number };
  /** the n the Page is showing (the current chip is marked). */
  readonly currentN?: number | null;
  readonly hrefs: {
    readonly version: (n: number) => string;
    readonly artifact: (artifactId: string) => string;
    /** the compare-previous target — /v/:prev/diff/:n (⌘⇧C lands the same). */
    readonly diff: (beforeN: number, afterN: number | "working") => string;
    /** `?restore=<id>` on the current page — the preview pick. */
    readonly restorePreview: (pointId: string) => string;
  };
  readonly restore?: {
    readonly points: readonly RestorePointRow[];
    /** POST target for the apply (the point id in the action URL). */
    readonly restoreAction: (pointId: string) => string;
    /** the picked point's preview — renders the diff card with the Restore button. */
    readonly preview?: RestorePreviewData;
  };
  /** `?restored=<n>` echo — the undoable-apply notice. */
  readonly restoredN?: number | null;
  readonly labels: VersionRailLabels;
}

const muted: CSSProperties = { color: "var(--shell-fg-muted, var(--paper-fg-muted))" };

function Chip({
  v,
  current,
  href,
  labels,
}: {
  v: RailVersion;
  current: boolean;
  href: string;
  labels: VersionRailLabels;
}): ReactNode {
  return (
    <li
      data-version-chip={v.n}
      data-origin={v.origin}
      data-state={v.state}
      aria-current={current ? "true" : undefined}
      style={{ display: "inline-block" }}
    >
      <a
        href={href}
        data-version-link={v.n}
        style={{
          display: "inline-block",
          padding: "3px 9px",
          borderRadius: "999px",
          border: `1px solid ${current ? "var(--accent)" : "var(--shell-border, var(--paper-rule))"}`,
          fontSize: "12px",
          background: current ? "var(--shell-raised, transparent)" : "transparent",
          textDecoration: "none",
          color: "var(--shell-fg, var(--paper-fg))",
        }}
      >
        v{v.n}
        {v.frozen ? (
          <span data-lock title={labels.frozenTitle} aria-label={labels.frozenTitle}>
            {" "}
            🔒
          </span>
        ) : (
          <span data-working-dot title={labels.workingLabel}>
            {" "}
            ●
          </span>
        )}
      </a>
      <span
        data-version-meta
        style={{ display: "block", fontSize: "10.5px", padding: "2px 4px", ...muted }}
      >
        {labels.originLabel(v.origin)}
        {v.reviewed ? <span data-reviewed> · {labels.reviewedFlag}</span> : null}
        {v.answered ? <span data-answered> · {labels.answeredFlag}</span> : null}
        {v.claimsPendingVerification ? (
          <span data-claims-pending> · {labels.claimsPending}</span>
        ) : null}
        {v.obligations.open + v.obligations.addressed > 0 ? (
          <span data-obligations data-open={v.obligations.open}>
            {" "}
            · {labels.obligationsFmt(v.obligations.open, v.obligations.addressed)}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function VersionRail(props: VersionRailProps): ReactNode {
  const L = props.labels;
  const versions = props.versions;
  const currentN = props.currentN ?? null;
  const current = versions.find((v) => v.n === currentN);
  const previous = current ? versions.filter((v) => v.n < current.n).at(-1) : undefined;

  return (
    <div
      data-version-rail
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        flexWrap: "wrap",
        padding: "8px 0",
        borderBottom: "1px solid var(--paper-rule)",
        fontFamily: "var(--shell-font, inherit)",
      }}
    >
      <ul
        style={{ listStyle: "none", display: "flex", gap: "6px", margin: 0, padding: 0, flexWrap: "wrap" }}
        aria-label={L.compare}
      >
        {props.outline ? (
          <li data-version-chip="outline" style={{ display: "inline-block" }}>
            <a
              href={props.hrefs.artifact(props.outline.artifactId)}
              style={{ fontSize: "12px", padding: "3px 9px", textDecoration: "none", color: "var(--shell-fg, var(--paper-fg))" }}
            >
              {L.outline}
            </a>
            <span style={{ ...muted, fontSize: "10.5px", padding: "0 2px" }} aria-hidden="true">
              →
            </span>
          </li>
        ) : null}
        {versions.map((v) => (
          <Chip
            key={v.draftId}
            v={v}
            current={v.n === currentN}
            href={props.hrefs.version(v.n)}
            labels={L}
          />
        ))}
      </ul>
      {props.chip && props.chip.open + props.chip.addressed > 0 ? (
        <span data-obligations-chip data-open={props.chip.open} style={{ fontSize: "11.5px", ...muted }}>
          {L.obligationsFmt(props.chip.open, props.chip.addressed)}
        </span>
      ) : null}

      <span style={{ marginLeft: "auto", display: "inline-flex", gap: "8px", alignItems: "center" }}>
        {previous ? (
          <a
            href={props.hrefs.diff(previous.n, current!.n)}
            data-compare-previous
            style={{ fontSize: "12px" }}
          >
            {L.comparePrevious}
          </a>
        ) : null}
        {props.restore ? (
          <details data-restore-menu style={{ position: "relative", display: "inline-block" }}>
            <summary style={{ fontSize: "12px", cursor: "pointer", listStyle: "none" }}>
              {L.restorePoints} ▾
            </summary>
            <div
              data-restore-groups
              role="menu"
              style={{
                position: "absolute",
                right: 0,
                zIndex: 20,
                minWidth: "240px",
                background: "var(--shell-surface, var(--paper-bg))",
                border: "1px solid var(--shell-border, var(--paper-rule))",
                borderRadius: "6px",
                padding: "6px 0",
                fontSize: "12px",
              }}
            >
              {props.restore.points.length === 0 ? (
                <p style={{ margin: "6px 12px", ...muted }}>{L.restoreEmpty}</p>
              ) : (
                (["earlier_today", "yesterday", "before_review", "named", "earlier"] as const).map(
                  (g) => {
                    const pts = props.restore!.points.filter((p) => p.group === g);
                    if (pts.length === 0) return null;
                    const advanced = pts.every((p) => p.advanced);
                    return (
                      <div
                        key={g}
                        data-restore-group={g}
                        {...(advanced ? { "data-tier": "advanced" } : {})}
                      >
                        <div
                          style={{
                            padding: "4px 12px 2px",
                            fontSize: "10.5px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            ...muted,
                          }}
                        >
                          {L.restoreGroupLabel(g, pts[0]?.beforeReviewN)}
                        </div>
                        {pts.map((p) => (
                          <a
                            key={p.id}
                            role="menuitem"
                            href={props.hrefs.restorePreview(p.id)}
                            data-restore-point={p.id}
                            data-cause={p.cause}
                            style={{ display: "block", padding: "4px 12px", textDecoration: "none", color: "inherit" }}
                          >
                            {L.restorePointLabel(p)}
                          </a>
                        ))}
                      </div>
                    );
                  },
                )
              )}
            </div>
          </details>
        ) : null}
      </span>

      {props.restoredN != null ? (
        <p data-restored-notice role="status" style={{ width: "100%", margin: "4px 0 0", fontSize: "12px" }}>
          {L.restoredNotice(props.restoredN)}
        </p>
      ) : null}

      {props.restore?.preview ? (
        <section
          data-restore-preview
          aria-label={L.restorePreviewHeading}
          style={{ width: "100%", border: "1px solid var(--paper-rule)", borderRadius: "6px", padding: "10px 12px", marginTop: "8px" }}
        >
          <header style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" }}>
            <h4 style={{ margin: 0, fontSize: "13px" }}>{L.restorePreviewHeading}</h4>
            <span style={{ fontSize: "12px", ...muted }}>
              {L.restorePointLabel(props.restore.preview.point)}
            </span>
            <form
              method="post"
              action={props.restore.restoreAction(props.restore.preview.point.id)}
              style={{ marginLeft: "auto" }}
            >
              <button type="submit" data-restore-apply style={{ fontSize: "12px", padding: "4px 12px" }}>
                {L.restoreApply}
              </button>
            </form>
          </header>
          <p style={{ fontSize: "11.5px", ...muted }}>{L.restoreUndoHint}</p>
          <WhatChangedView
            view={props.restore.preview.view}
            beforeN={0}
            afterN={null}
            labels={L.compareWhatChanged}
          />
        </section>
      ) : null}
    </div>
  );
}
