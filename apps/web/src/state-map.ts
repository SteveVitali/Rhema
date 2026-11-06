import type { ProjectRow, ProjectStateDto, VoiceListRowDto, ProtocolCardDto } from "@rhema/api-client";
import type {
  ProjectRowView,
  RowActionView,
  RowIndicator,
  Tone,
} from "@rhema/ui";
import { COPY } from "./copy.js";

// Map the api's derived §6.3 state DTO onto the presentational row view (P1.04 — the §5.2 home;
// R7HOME.1 — REQ-HOME-1's flat recent list). The state facts come straight from the state function
// + assembler (no re-derivation, no stored status): this file maps facts → view, never computes
// state. ADR-128: the QUIET group is retired — every row renders in the flat list sorted by last
// edit; "Waiting on you" and "Running" pin above it only when non-empty; attention grouping is
// the opt-in Group-by, and "Quiet"/"Unfiled"/"Sheet" never render as labels.

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

/** The status dot's five indicators: running / needs-you / ready / quiet(neutral) / failed. */
function indicatorFor(row: ProjectRow): RowIndicator {
  if (row.state.overlay === "running") return "running";
  if (row.state.overlay === "needs_you") return "needs_you";
  if (row.lastRunFailed) return "failed";
  if (row.group === "ready_to_read") return "ready";
  return "quiet";
}

/** The est. label a paid menu item carries ("est. 4,095 cr"); null figure ⇒ the bare verb. */
function estLabel(credits: number | null | undefined): string | undefined {
  return credits != null ? COPY.projectHome.estimateFmt.replace("{n}", credits.toLocaleString("en-US")) : undefined;
}

/**
 * The row's ⋯ menu (R7HOME.1). One hover action (Open) lives on the row itself; the menu holds
 * the navigation items, the paid verbs (each showing the shared estimator's figure and opening
 * the run sheet — the sheet stays the only run creator), and the lifecycle actions. A disabled
 * no-op item is NOT shown (a verb the row can never run simply isn't listed).
 */
function rowActions(row: ProjectRow): RowActionView[] {
  const slugHref = `/p/${row.slug}`;
  const archived = row.archivedAt != null;
  const hasDrafts = row.headDraftId != null;
  const items: RowActionView[] = [
    { key: "rename", label: COPY.projectHome.actionRename, href: `${slugHref}?rename=1` },
    { key: "settings", label: COPY.projectHome.actionSettings, href: `${slugHref}/settings` },
    { key: "export", label: COPY.projectHome.actionExport, href: `${slugHref}/export` },
  ];
  // The paid verbs — the run sheet is the only run creator; the menu item opens it.
  if (hasDrafts) {
    items.push({
      key: "wf_review",
      label: COPY.runSheet.runReview,
      href: `${slugHref}/run?workflow=review`,
      paid: true,
      ...(estLabel(row.estimates?.review) != null ? { estimateLabel: estLabel(row.estimates?.review) } : {}),
    });
    if (row.state.key === "reviewed" || row.state.key === "edited_by_you") {
      items.push({
        key: "wf_revise",
        label: COPY.runSheet.runRevise,
        href: `${slugHref}/run?workflow=revise`,
        paid: true,
        ...(estLabel(row.estimates?.revise) != null ? { estimateLabel: estLabel(row.estimates?.revise) } : {}),
      });
    }
    items.push({
      key: "wf_fact_check",
      label: COPY.runSheet.runFactCheck,
      href: `${slugHref}/run?workflow=fact_check`,
      paid: true,
      ...(estLabel(row.estimates?.factCheck) != null ? { estimateLabel: estLabel(row.estimates?.factCheck) } : {}),
    });
  }
  items.push(
    archived
      ? { key: "unarchive", label: COPY.projectHome.actionUnarchive, formAction: `/p/${row.slug}/unarchive` }
      : { key: "archive", label: COPY.projectHome.actionArchive, formAction: `/p/${row.slug}/archive` },
    { key: "duplicate", label: COPY.projectHome.actionDuplicate, formAction: `/p/${row.slug}/duplicate` },
    { key: "delete", label: COPY.projectHome.actionDelete, formAction: `/p/${row.slug}/delete` },
  );
  return items;
}

export interface ToRowViewCtx {
  /** the protocol pick labels (protocolId → display name). */
  readonly protocols?: readonly ProtocolCardDto[];
  /** voices are kept for the Group-by headers' pills (never a row chip). */
  readonly voices?: readonly VoiceListRowDto[];
  /** the "Edited …" label source — injectable for deterministic tests. */
  readonly nowMs?: number;
}

/**
 * The "Edited …" label (R7HOME.1's row anatomy). Relative inside a week ("Edited 3d ago"),
 * absolute past it ("Edited 2026-03-05") — deterministic given `nowMs`.
 */
export function editedLabel(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return COPY.projectHome.editedAt.replace("{t}", iso.slice(0, 10));
  const days = Math.floor((nowMs - then) / 86_400_000);
  if (days <= 0) return COPY.projectHome.editedToday;
  if (days === 1) return COPY.projectHome.editedYesterday;
  if (days < 7) return COPY.projectHome.editedDaysAgo.replace("{n}", String(days));
  return COPY.projectHome.editedAt.replace("{t}", iso.slice(0, 10));
}

export function toProjectRowView(row: ProjectRow, ctx: ToRowViewCtx = {}): ProjectRowView {
  const href = `/p/${row.slug}`;
  const protocol = ctx.protocols?.find((p) => p.id === row.protocolId);
  return {
    id: row.id,
    title: row.title,
    href,
    indicator: indicatorFor(row),
    stateLabel: row.state.pill,
    stateTone: tone(row.state),
    versionLabel: row.headDraftN != null ? `v${row.headDraftN}` : null,
    protocolLabel: protocol?.name ?? null,
    // REQ-HOME-1 — the Voice name renders ONLY when set; "Unfiled" is never a row chip.
    voiceLabel: row.voice?.name ?? null,
    statusLine: row.statusLine,
    editedLabel: row.lastEditedAt != null ? editedLabel(row.lastEditedAt, ctx.nowMs ?? Date.now()) : null,
    openLabel: COPY.projectHome.actionOpen,
    menu: rowActions(row),
    menuTriggerLabel: COPY.projectHome.menuTrigger,
    statusDotLegend: {
      running: COPY.projectHome.legendRunning,
      needs_you: COPY.projectHome.legendNeedsYou,
      ready: COPY.projectHome.legendReady,
      quiet: COPY.projectHome.legendQuiet,
      failed: COPY.projectHome.legendFailed,
    },
  };
}

// ---- REQ-HOME-1's flat list + non-empty attention sections ----

/** An attention section pinned above the flat list — rendered only when non-empty. */
export interface AttentionSection {
  readonly key: "needs_you" | "running";
  readonly label: string;
  readonly rows: readonly ProjectRow[];
}

/** Sort the flat list by last edit (freshest first); a missing stamp sorts last, ties by title. */
export function sortByLastEdit(rows: readonly ProjectRow[]): ProjectRow[] {
  return [...rows].sort((a, b) => {
    const at = a.lastEditedAt != null ? Date.parse(a.lastEditedAt) : Number.NEGATIVE_INFINITY;
    const bt = b.lastEditedAt != null ? Date.parse(b.lastEditedAt) : Number.NEGATIVE_INFINITY;
    if (at !== bt) return bt - at;
    const t = a.title.localeCompare(b.title);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });
}

/**
 * The non-empty attention sections (ADR-128): "Waiting on you" (needs_you, soonest deadline
 * first) then "Running". `ready_to_read` rows stay IN the flat list (their green dot + status
 * line carry the signal — the amendment names exactly two pinned sections). Archived rows are
 * excluded here; the caller splits them into the Archived section.
 */
export function attentionSections(rows: readonly ProjectRow[]): AttentionSection[] {
  const needsYou = rows
    .filter((r) => r.group === "needs_you" && r.archivedAt == null)
    .sort((a, b) => {
      const at = a.needsYouDeadlineAt != null ? Date.parse(a.needsYouDeadlineAt) : Number.POSITIVE_INFINITY;
      const bt = b.needsYouDeadlineAt != null ? Date.parse(b.needsYouDeadlineAt) : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  const running = rows.filter((r) => r.group === "running" && r.archivedAt == null);
  const out: AttentionSection[] = [];
  if (needsYou.length > 0) out.push({ key: "needs_you", label: COPY.projectHome.waitingOnYou, rows: needsYou });
  if (running.length > 0) out.push({ key: "running", label: COPY.projectHome.runningSection, rows: running });
  return out;
}

/** The flat list's members — every non-attention row (attention rows never repeat below). */
export function flatRows(rows: readonly ProjectRow[]): ProjectRow[] {
  return sortByLastEdit(
    rows.filter((r) => r.archivedAt == null && r.group !== "needs_you" && r.group !== "running"),
  );
}

/** A voice bucket of api rows — Unfiled first (the opt-in Group-by; ADR-128 keeps the taxonomy). */
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

/** The alternate grouping — by Voice, Unfiled first, headers count older profiles (opt-in). */
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
    groups.push({ key: "unfiled", label: COPY.projectHome.unfiled, olderProfileCount: 0, rows: sortByLastEdit(unfiled) });
  }
  for (const [personaId, g] of [...byVoice.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label))) {
    groups.push({
      key: personaId,
      label: g.label,
      href: `/v/${personaId}`,
      ...(g.statusLabel ? { statusLabel: g.statusLabel } : {}),
      ...(g.statusTone ? { statusTone: g.statusTone } : {}),
      olderProfileCount: g.older,
      rows: sortByLastEdit(g.rows),
    });
  }
  return groups;
}
