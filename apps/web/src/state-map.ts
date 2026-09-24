import type { ProjectRow, ProjectStateDto, VoiceListRowDto } from "@rhema/api-client";
import type {
  ProjectRowView,
  RowActionView,
  RowIndicator,
  SecondaryChipView,
  Tone,
} from "@rhema/ui";
import { COPY } from "./copy.js";

// Map the api's derived §6.3 state DTO onto the presentational row view (P1.04 — the §5.2 home). The
// pill/action/attention group come straight from the state function + assembler (no re-derivation, no
// stored status): this file maps facts → view, never computes state.

function tone(state: ProjectStateDto): Tone {
  if (state.overlay === "running") return "running";
  if (state.overlay === "needs_you") return "needs_you";
  switch (state.key) {
    case "reviewed":
    case "edited_by_you":
      return "attention";
    case "accepted":
    case "exported":
      return "ready";
    default:
      return "neutral";
  }
}

/** The §5.2 state icon for a row: running/needs-you/ready/quiet, red when the latest run failed. */
function indicatorFor(row: ProjectRow): RowIndicator {
  if (row.state.overlay === "running") return "running";
  if (row.state.overlay === "needs_you") return "needs_you";
  if (row.lastRunFailed) return "failed";
  if (row.group === "ready_to_read") return "ready";
  return "quiet";
}

/** The row's "…" menu — all seven §5.2 actions; disabled items carry their reason. */
function rowActions(row: ProjectRow): RowActionView[] {
  const slugHref = `/p/${row.slug}`;
  const archived = row.archivedAt != null;
  const hasDrafts = row.headDraftId != null;
  const actions: RowActionView[] = [
    { key: "open", label: COPY.projectHome.actionOpen, href: slugHref },
    { key: "rename", label: COPY.projectHome.actionRename, href: `${slugHref}?rename=1` },
    archived
      ? { key: "unarchive", label: COPY.projectHome.actionUnarchive, formAction: `/p/${row.slug}/unarchive` }
      : { key: "archive", label: COPY.projectHome.actionArchive, formAction: `/p/${row.slug}/archive` },
    { key: "duplicate", label: COPY.projectHome.actionDuplicate, formAction: `/p/${row.slug}/duplicate` },
    {
      key: "change_voice",
      label: COPY.projectHome.actionChangeVoice,
      // REQ-PERSONA-20 / §9.6 — Voice is soft-locked once drafts exist; afterwards it is a
      // Voice-settings action, not a list-row action. Disabled items say why.
      ...(hasDrafts ? { disabledReason: COPY.projectHome.voiceLockedReason } : {}),
    },
    { key: "export", label: COPY.projectHome.actionExport, href: `${slugHref}/export` },
    { key: "delete", label: COPY.projectHome.actionDelete, formAction: `/p/${row.slug}/delete` },
  ];
  return actions;
}

/** The secondary workflow chips under a row — derived from the SAME suggested action. */
function secondaryChips(row: ProjectRow): SecondaryChipView[] {
  const chips: SecondaryChipView[] = [];
  const slugHref = `/p/${row.slug}`;
  if (row.activeRun) {
    chips.push({ key: "run", label: COPY.projectHome.chipRun, href: `${slugHref}/run` });
  }
  if (row.state.suggested.action === "review" || row.state.suggested.action === "revise") {
    chips.push({ key: "sheet", label: COPY.projectHome.chipSheet, href: `${slugHref}/run` });
  }
  return chips;
}

/** The all-workflows menu entries — every workflow link with its disabled reason (§5.2). */
function workflowEntries(row: ProjectRow): RowActionView[] {
  const slugHref = `/p/${row.slug}`;
  const noDrafts = row.headDraftId == null;
  return [
    {
      key: "wf_review",
      label: COPY.runSheet.runReview,
      ...(noDrafts ? { disabledReason: COPY.projectHome.needsDraftReason } : { href: `${slugHref}/run?workflow=review` }),
    },
    {
      key: "wf_revise",
      label: COPY.runSheet.runRevise,
      ...(row.state.key !== "reviewed" && row.state.key !== "edited_by_you"
        ? { disabledReason: COPY.projectHome.needsReviewReason }
        : { href: `${slugHref}/run?workflow=revise` }),
    },
    {
      key: "wf_fact_check",
      label: COPY.runSheet.runFactCheck,
      ...(noDrafts ? { disabledReason: COPY.projectHome.needsDraftReason } : { href: `${slugHref}/run?workflow=fact_check` }),
    },
  ];
}

export interface ToRowViewCtx {
  /** the voice picker's options for the enabled "Change voice" action. */
  readonly voices?: readonly VoiceListRowDto[];
}

export function toProjectRowView(row: ProjectRow, ctx: ToRowViewCtx = {}): ProjectRowView {
  const href = `/p/${row.slug}`;
  const label = row.state.suggested.label;
  // PRB.07 — "Revise using your edits" lands in the source editor on the draft head (the manual-revision
  // surface IS the action); every other action routes into the project view like before.
  const actionHref =
    row.state.suggested.action === "revise_using_edits" && row.headDraftId
      ? `${href}/edit/${row.headDraftId}`
      : href;
  const action = row.state.suggested.action !== "none" && label ? { label, href: actionHref } : undefined;
  const voiceLocked = row.headDraftId != null;
  return {
    id: row.id,
    title: row.title,
    href,
    pill: { label: row.state.pill, tone: tone(row.state) },
    action,
    versionLabel: row.headDraftN != null ? `v${row.headDraftN}` : null,
    statusLine: row.statusLine,
    indicator: indicatorFor(row),
    voiceChip: row.voice
      ? {
          label: row.voice.name ?? COPY.projectHome.unfiledVoice,
          href: `/voices/${row.voice.personaId}`,
          statusLabel: row.voice.status.pill.label,
          statusTone: row.voice.status.pill.tone as Tone,
        }
      : null,
    unfiledLabel: COPY.projectHome.unfiled,
    actions: [...rowActions(row), ...workflowEntries(row)],
    secondaryChips: secondaryChips(row),
    voiceOptions: !voiceLocked
      ? (ctx.voices ?? []).map((v) => ({
          personaId: v.personaId,
          name: v.name ?? COPY.projectHome.unfiledVoice,
          statusLabel: v.status.pill.label,
        }))
      : [],
    voiceFormAction: !voiceLocked ? `/p/${row.slug}/voice` : undefined,
    currentPersonaId: row.voice?.personaId ?? null,
    noVoiceLabel: COPY.voice.picker.noVoice,
  };
}

// ---- §5.2 grouping (the assembled row's `group` field drives both modes) ----

/** An attention bucket of api rows — mapped to views at render. */
export interface AttentionGroup {
  readonly key: "needs_you" | "running" | "ready_to_read" | "quiet";
  readonly label: string;
  readonly rows: readonly ProjectRow[];
  readonly collapsed?: boolean;
  readonly summary?: string;
}

/** A voice bucket of api rows — Unfiled first; `olderProfileCount` feeds the header's count. */
export interface VoiceGroup {
  readonly key: string;
  readonly label: string;
  readonly statusLabel?: string;
  readonly statusTone?: Tone;
  /** the voice's page — the header's older-profile count links here (the Adopt entry lives there). */
  readonly href?: string;
  readonly olderProfileCount: number;
  readonly rows: readonly ProjectRow[];
}

const GROUP_LABELS: Record<AttentionGroup["key"], string> = {
  needs_you: "Needs you",
  running: "Running",
  ready_to_read: "Ready to read",
  quiet: "Quiet",
};
const GROUP_ORDER: readonly AttentionGroup["key"][] = ["needs_you", "running", "ready_to_read", "quiet"];

/** Group rows into the four §5.2 attention groups; Needs-you sorts by soonest deadline; Quiet collapses
 *  with its Unfiled/Voice sub-counts. Archived rows are excluded unless the caller pre-included them. */
export function groupByAttention(rows: readonly ProjectRow[]): AttentionGroup[] {
  const needsYou = rows
    .filter((r) => r.group === "needs_you" && r.archivedAt == null)
    .sort((a, b) => {
      const at = a.needsYouDeadlineAt != null ? Date.parse(a.needsYouDeadlineAt) : Number.POSITIVE_INFINITY;
      const bt = b.needsYouDeadlineAt != null ? Date.parse(b.needsYouDeadlineAt) : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  const running = rows.filter((r) => r.group === "running" && r.archivedAt == null);
  const ready = rows.filter((r) => r.group === "ready_to_read" && r.archivedAt == null);
  // a row without a server-derived group (older api, partial fixture) lands Quiet — never dropped.
  const quiet = rows.filter((r) => (r.group ?? "quiet") === "quiet" && r.archivedAt == null);
  const quietUnfiled = quiet.filter((r) => r.voice == null).length;
  const summary =
    quiet.length > 0
      ? `${quietUnfiled} ${COPY.projectHome.unfiled} · ${quiet.length - quietUnfiled} with a ${COPY.projectHome.voiceNoun}`
      : undefined;
  const buckets: Record<AttentionGroup["key"], readonly ProjectRow[]> = {
    needs_you: needsYou,
    running,
    ready_to_read: ready,
    quiet,
  };
  return GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    rows: buckets[key],
    collapsed: key === "quiet",
    ...(key === "quiet" && summary ? { summary } : {}),
  }));
}

/** The alternate §5.2 grouping — by Voice, Unfiled first, headers count older profiles. */
export function groupByVoice(rows: readonly ProjectRow[]): VoiceGroup[] {
  const byVoice = new Map<string, { label: string; statusLabel?: string; statusTone?: Tone; older: number; rows: ProjectRow[] }>();
  const unfiled: ProjectRow[] = [];
  for (const r of rows.filter((r) => r.archivedAt == null)) {
    if (r.voice == null) {
      unfiled.push(r);
      continue;
    }
    const g =
      byVoice.get(r.voice.personaId) ??
      {
        label: r.voice.name ?? r.voice.personaId,
        statusLabel: r.voice.status.pill.label,
        statusTone: r.voice.status.pill.tone as Tone,
        older: 0,
        rows: [],
      };
    if (r.voice.usesOlderProfile) g.older++;
    g.rows.push(r);
    byVoice.set(r.voice.personaId, g);
  }
  const groups: VoiceGroup[] = [];
  if (unfiled.length > 0) {
    groups.push({ key: "unfiled", label: COPY.projectHome.unfiled, olderProfileCount: 0, rows: unfiled });
  }
  for (const [personaId, g] of [...byVoice.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label))) {
    groups.push({
      key: personaId,
      label: g.label,
      href: `/voices/${personaId}`,
      ...(g.statusLabel ? { statusLabel: g.statusLabel } : {}),
      ...(g.statusTone ? { statusTone: g.statusTone } : {}),
      olderProfileCount: g.older,
      rows: g.rows,
    });
  }
  return groups;
}
