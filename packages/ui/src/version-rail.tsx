import type { CSSProperties, ReactNode } from "react";
import type { WhatChangedView as WhatChangedViewModel } from "@rhema/findings-core";
import { WhatChangedView, type WhatChangedLabels } from "./what-changed.js";
import { Button } from "./primitives/button.js";

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
  /** R7WRITE.1b (REQ-SYNC-4) — a discarded fork renders "v(N+1) · discarded"; the number is kept. */
  readonly discarded?: boolean;
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
  /** R7WRITE.1b — the discarded marker's caption: "discarded". */
  readonly discardedLabel: string;
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
    /** POST target for the apply (the point id in the action URL). Absent ⇒ the apply button
     *  renders disabled with `disabledTitle` (R7RO.1 — read-only projects withhold writes). */
    readonly restoreAction?: (pointId: string) => string;
    /** the withheld-apply tooltip (the read-only reason text). */
    readonly disabledTitle?: string;
    /** the picked point's preview — renders the diff card with the Restore button. */
    readonly preview?: RestorePreviewData;
  };
  /** `?restored=<n>` echo — the undoable-apply notice. */
  readonly restoredN?: number | null;
  /**
   * P1.19 — §10.1 phone width: version chips still navigate (reading is the phone's job) but the
   * compare link, the restore menu, and the restore-preview card never render — diffs and edit
   * actions are the ✗ column.
   */
  readonly compact?: boolean;
  readonly labels: VersionRailLabels;
}

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
        className="ui-t-p39 ui-t-rp ui-d-fs ui-d-sev ui-t-fgp"
        style={
          {
            display: "inline-block",
            border: `1px solid ${current ? "var(--accent)" : "var(--shell-border, var(--paper-rule))"}`,
            textDecoration: "none",
            "--d-sev": current ? "var(--shell-raised, transparent)" : "transparent",
          } as CSSProperties
        }
      >
        v{v.n}
        {v.discarded === true ? <span data-discarded> · {labels.discardedLabel}</span> : null}
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
      <span data-version-meta className="ui-d-s ui-t-p24 ui-t-pm" style={{ display: "block" }}>
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
      className="ui-d-g10 ui-t-p80 ui-t-ffs"
      style={{
        display: "flex",
        alignItems: "flex-start",
        flexWrap: "wrap",
        borderBottom: "1px solid var(--paper-rule)",
      }}
    >
      <ul
        className="ui-d-g6 ui-c2-m0 ui-d-p0"
        style={{ listStyle: "none", display: "flex", flexWrap: "wrap" }}
        aria-label={L.compare}
      >
        {props.outline ? (
          <li data-version-chip="outline" style={{ display: "inline-block" }}>
            <a
              href={props.hrefs.artifact(props.outline.artifactId)}
              className="ui-d-fs ui-t-p39 ui-t-fgp"
              style={{ textDecoration: "none" }}
            >
              {L.outline}
            </a>
            <span className="ui-t-pm ui-d-s ui-t-p02" aria-hidden="true">
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
        <span data-obligations-chip data-open={props.chip.open} className="ui-d-fs ui-t-pm">
          {L.obligationsFmt(props.chip.open, props.chip.addressed)}
        </span>
      ) : null}

      <span className="ui-d-mla ui-c2-g2" style={{ display: "inline-flex", alignItems: "center" }}>
        {previous && props.compact !== true ? (
          <a
            href={props.hrefs.diff(previous.n, current!.n)}
            data-compare-previous
            className="ui-d-fs"
          >
            {L.comparePrevious}
          </a>
        ) : null}
        {props.restore && props.compact !== true ? (
          <details data-restore-menu style={{ position: "relative", display: "inline-block" }}>
            <summary className="ui-d-fs" style={{ cursor: "pointer", listStyle: "none" }}>
              {L.restorePoints} ▾
            </summary>
            <div
              data-restore-groups
              role="menu"
              className="ui-t-r0 ui-t-mw240 ui-t-bsp ui-t-r6 ui-t-p60 ui-d-fs"
              style={{
                position: "absolute",
                zIndex: 20,
                border: "1px solid var(--shell-border, var(--paper-rule))",
              }}
            >
              {props.restore.points.length === 0 ? (
                <p className="ui-t-m612 ui-t-pm">{L.restoreEmpty}</p>
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
                          className="ui-t-p4122 ui-d-s ui-t-ls5 ui-t-pm"
                          style={{ textTransform: "uppercase" }}
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
                            className="ui-t-p412 ui-d-inh"
                            style={{ display: "block", textDecoration: "none" }}
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
        <p data-restored-notice role="status" className="ui-vc-w ui-t-m10 ui-d-fs">
          {L.restoredNotice(props.restoredN)}
        </p>
      ) : null}

      {props.restore?.preview && props.compact !== true ? (
        <section
          data-restore-preview
          aria-label={L.restorePreviewHeading}
          className="ui-vc-w ui-t-r6 ui-t-p1012 ui-c2-mt"
          style={{ border: "1px solid var(--paper-rule)" }}
        >
          <header
            className="ui-d-g10"
            style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}
          >
            <h4 className="ui-c2-m0 ui-d-fd">{L.restorePreviewHeading}</h4>
            <span className="ui-d-fs ui-t-pm">
              {L.restorePointLabel(props.restore.preview.point)}
            </span>
            {props.restore.restoreAction ? (
              <form
                method="post"
                action={props.restore.restoreAction(props.restore.preview.point.id)}
                className="ui-d-mla"
              >
                <Button type="submit" data-restore-apply className="ui-d-fs ui-t-p412">
                  {L.restoreApply}
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="ghost"
                data-restore-apply
                disabled
                title={props.restore.disabledTitle}
                className="ui-d-mla ui-d-fs ui-t-p412"
              >
                {L.restoreApply}
              </Button>
            )}
          </header>
          <p className="ui-d-fs ui-t-pm">{L.restoreUndoHint}</p>
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
