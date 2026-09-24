import type {
  DispositionKind,
  FindingKind,
  FindingView,
  Origin,
  Severity,
} from "@rhema/contracts";
import { WHOLE_PIECE } from "./anchor.js";
import { canDispose } from "./disposition.js";
import { SEVERITY_ORDER, groupFindingsForList } from "./find-view.js";
import { buildTriageQueue, triageTier, TRIAGE_PROMO_THRESHOLD } from "./triage.js";

// The §5.7 findings-surface derivations (P1.07; REQ-IDE-23/24/26, REQ-SPEC-6, REQ-OBJ-6). ONE FindingView[]
// powers three surfaces — the Margin's cards/chips, the Desk's findings list (the screen-reader landmark),
// and triage mode / Approve-triage. Every rule lives here so React renders and the api/web layers do I/O:
// margin clustering, the shared filter set, the sectioned triage queue, the progress pill's counts, and the
// Quick severity-budget notice. Framework-free (the beta web and 1.x mobile share them verbatim).

// ---------------------------------------------------------------------------------------------------------------------
// Margin clustering — "≈30 or fewer findings → cards beside passages; more, or >1 finding anchored to the
// same paragraph → one stacked chip per paragraph (expands on focus; 'N findings · K <severity>')" (§5.7).
// Automatic — there is no user setting.
// ---------------------------------------------------------------------------------------------------------------------

/** The volume at which the Margin stacks every paragraph's findings into a chip (§5.7). */
export const MARGIN_CLUSTER_THRESHOLD = TRIAGE_PROMO_THRESHOLD; // 30

/** One Margin row: a full card beside its passage, or a stacked chip covering a crowded paragraph. */
export type MarginItem =
  | { readonly kind: "card"; readonly finding: FindingView }
  | {
      readonly kind: "chip";
      /** the group key — the anchor block id, or "Whole piece" for unanchored findings. */
      readonly key: string;
      readonly count: number;
      /** the highest severity in the stack (the chip's hue + "K <severity>" count). */
      readonly topSeverity: Severity;
      /** how many findings sit at `topSeverity` (the chip's "· 1 major" figure). */
      readonly topCount: number;
      readonly findings: readonly FindingView[];
    };

function topOf(findings: readonly FindingView[]): { severity: Severity; count: number } {
  let top: Severity = findings[0]?.severity ?? "note";
  for (const f of findings) {
    if (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[top]) top = f.severity;
  }
  return { severity: top, count: findings.filter((f) => f.severity === top).length };
}

/**
 * Collapse the finding list into Margin rows. Whole-piece findings head the stack (same grouping the Desk
 * list uses — `groupFindingsForList` is the shared primitive, so nothing is ever dropped). At most one
 * finding on a paragraph renders its card; a crowded paragraph (or a dossier over the volume threshold)
 * renders one chip that expands on focus.
 */
export function marginItems(views: readonly FindingView[]): MarginItem[] {
  const groups = groupFindingsForList(views);
  const clusterAll = views.length > MARGIN_CLUSTER_THRESHOLD;
  const items: MarginItem[] = [];
  for (const g of groups) {
    if (!clusterAll && g.findings.length === 1) {
      items.push({ kind: "card", finding: g.findings[0]! });
      continue;
    }
    const top = topOf(g.findings);
    items.push({
      kind: "chip",
      key: g.key,
      count: g.findings.length,
      topSeverity: top.severity,
      topCount: top.count,
      findings: g.findings,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------------------------------------------------
// the shared filter set (§5.7 "shared filters"): severity · kind · origin · disposition · section ·
// has URL · has suggestion · open obligations. ONE model — the Desk list, the Margin, and triage mode all
// read it. `openObligation` needs the caller's live-obligation id set (a DB fact, injected).
// ---------------------------------------------------------------------------------------------------------------------

export interface FindingFilters {
  readonly severity?: Severity;
  readonly kind?: FindingKind;
  readonly origin?: Origin;
  /** a verb, or "undecided" for rows with no disposition. */
  readonly disposition?: DispositionKind | "undecided";
  /** a letter-section key, or "whole" for findings with no section. */
  readonly section?: string;
  readonly hasUrl?: boolean;
  readonly hasSuggestion?: boolean;
  /** findings whose revision obligation is in a live state (open/reopened/addressed/deferred/mooted? no —
   *  "open obligations" = the LIVE set the caller supplies). */
  readonly openObligation?: boolean;
}

/** The live obligation states for the "open obligations" filter (§11.7's live set). */
export const LIVE_OBLIGATION_STATES: readonly string[] = ["open", "reopened", "addressed", "deferred"];

/** Apply the shared filters to the ONE finding list. Unknown/absent fields filter nothing. */
export function filterFindings(
  views: readonly FindingView[],
  filters: FindingFilters,
  ctx?: { readonly openObligationIds?: ReadonlySet<string> },
): FindingView[] {
  return views.filter((v) => {
    if (filters.severity != null && v.severity !== filters.severity) return false;
    if (filters.kind != null && v.kind !== filters.kind) return false;
    if (filters.origin != null && v.origin !== filters.origin) return false;
    if (filters.disposition != null) {
      if (filters.disposition === "undecided") {
        if (v.disposition != null) return false;
      } else if (v.disposition?.kind !== filters.disposition) {
        return false;
      }
    }
    if (filters.section != null) {
      const sec = v.letterSection ?? "whole";
      if (sec !== filters.section) return false;
    }
    if (filters.hasUrl === true && (v.evidence?.urls.length ?? 0) === 0) return false;
    if (filters.hasSuggestion === true && v.suggestion == null) return false;
    if (filters.openObligation === true && !(ctx?.openObligationIds?.has(v.id) ?? false)) return false;
    return true;
  });
}

/** Parse raw query-ish strings into a FindingFilters (the web route's GET-form params). Unknown values
 *  filter nothing — a crafted param narrows to itself, never throws. */
export function parseFindingFilters(raw: Record<string, string | undefined>): FindingFilters {
  const take = (k: string, allowed: readonly string[]): string | undefined => {
    const v = raw[k];
    return v != null && allowed.includes(v) ? v : undefined;
  };
  const flag = (k: string): boolean | undefined => (raw[k] === "1" ? true : undefined);
  return {
    ...(take("sev", ["blocking", "major", "minor", "note"]) != null
      ? { severity: take("sev", ["blocking", "major", "minor", "note"]) as Severity }
      : {}),
    ...(take("kind", ["claim", "discourse", "argument", "structure", "craft", "voice", "continuity"]) != null
      ? { kind: take("kind", ["claim", "discourse", "argument", "structure", "craft", "voice", "continuity"]) as FindingKind }
      : {}),
    ...(take("origin", ["editor", "second_read", "both"]) != null
      ? { origin: take("origin", ["editor", "second_read", "both"]) as Origin }
      : {}),
    ...(take("disp", ["accept", "adapt", "rebut", "defer", "escalate", "undecided"]) != null
      ? { disposition: take("disp", ["accept", "adapt", "rebut", "defer", "escalate", "undecided"]) as FindingFilters["disposition"] }
      : {}),
    ...(raw["sec"] != null && raw["sec"] !== "" ? { section: raw["sec"] } : {}),
    ...(flag("url") != null ? { hasUrl: true } : {}),
    ...(flag("sug") != null ? { hasSuggestion: true } : {}),
    ...(flag("obl") != null ? { openObligation: true } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// triage mode (§5.7; ⌘⇧T) — the Desk list as a queue: grouped by section, blocking → major → minor → note
// within each, one finding at a time in the Margin. Decisions persist (each verb POSTs immediately).
// ---------------------------------------------------------------------------------------------------------------------

export interface TriageSection {
  /** the letter-section key, or "whole" for unsectioned findings. */
  readonly key: string;
  readonly label: string;
  readonly rows: readonly FindingView[];
}

export interface TriageQueueView {
  readonly sections: readonly TriageSection[];
  readonly total: number;
  readonly decided: number;
  readonly undecided: number;
  readonly nextUndecidedId: string | null;
  /** over-30 dossiers promote the Drafter-proposes-first flow (§6.3's next-step copy). */
  readonly promoteAgentTriage: boolean;
}

function sectionKeyOf(v: FindingView): string {
  return v.letterSection ?? "whole";
}

/**
 * The triage-mode queue: sections in first-appearance order of the §5.7 escalation-pinned triage order
 * (escalations still lead — the decisions only you can make), each section sorted blocking → note, then
 * ordinal-stable. Decided rows keep their place — exiting triage never loses a decision.
 */
export function sectionedTriageQueue(
  views: readonly FindingView[],
  labels?: { readonly wholePiece?: string },
): TriageQueueView {
  const q = buildTriageQueue(views);
  const order = new Map(views.map((v, i) => [v.id, i]));
  const escalated = new Set(
    views.filter((v) => triageTier(v.disposition ?? null) === 0).map((v) => v.id),
  );
  const bySev = (a: FindingView, b: FindingView): number => {
    // escalations pin to the top of their section, then severity, then document order.
    const e = Number(escalated.has(b.id)) - Number(escalated.has(a.id));
    if (e !== 0) return e;
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return s !== 0 ? s : (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  };
  const sections: { key: string; label: string; rows: FindingView[] }[] = [];
  const idx = new Map<string, { key: string; label: string; rows: FindingView[] }>();
  // section order = first appearance in triage order (the escalation-pinned walk), so the queue's first
  // section is the one with the most urgent row.
  for (const v of q.rows) {
    const key = sectionKeyOf(v);
    let s = idx.get(key);
    if (s == null) {
      s = { key, label: key === "whole" ? (labels?.wholePiece ?? WHOLE_PIECE) : key, rows: [] };
      idx.set(key, s);
      sections.push(s);
    }
    s.rows.push(v);
  }
  for (const s of sections) s.rows.sort(bySev);
  return {
    sections,
    total: q.total,
    decided: q.decided,
    undecided: q.undecided,
    nextUndecidedId: q.nextUndecidedId,
    promoteAgentTriage: q.promoteAgentTriage,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// the severity budget (§5.7): Quick's 40-finding cap applies to the RENDERED list — the capped set shows
// and the letter's roadmap folds the rest; the notice line is asserted against the sidecar's own numbers
// (the count of finding rows delivered).
// ---------------------------------------------------------------------------------------------------------------------

/** Quick rigor caps the rendered findings list at this count (§5.7 severity budget). */
export const QUICK_FINDINGS_CAP = 40;

export interface SeverityBudget {
  /** the rendered cap (40 for quick runs; null = no cap applied). */
  readonly cap: number | null;
  /** how many rows render (≤ cap when capped). */
  readonly shown: number;
  /** how many rows folded into the roadmap line (total − shown; 0 when uncapped). */
  readonly folded: number;
}

/**
 * The rendered-list budget. `rigor === "quick"` caps the list at QUICK_FINDINGS_CAP — the top rows by
 * severity (then ordinal) survive and the remainder fold into the notice line. Other rigors render all.
 */
export function severityBudget(
  views: readonly FindingView[],
  rigor: string | null | undefined,
): SeverityBudget {
  if (rigor !== "quick" || views.length <= QUICK_FINDINGS_CAP) {
    return { cap: null, shown: views.length, folded: 0 };
  }
  return { cap: QUICK_FINDINGS_CAP, shown: QUICK_FINDINGS_CAP, folded: views.length - QUICK_FINDINGS_CAP };
}

/** Apply the budget: the top `cap` rows by severity order (ordinal-stable) — the rendered set. */
export function applySeverityBudget(
  views: readonly FindingView[],
  rigor: string | null | undefined,
): FindingView[] {
  const b = severityBudget(views, rigor);
  if (b.cap == null) return [...views];
  return views
    .map((v, i) => ({ v, i }))
    .sort((a, b2) => SEVERITY_ORDER[a.v.severity] - SEVERITY_ORDER[b2.v.severity] || a.i - b2.i)
    .slice(0, b.cap)
    .map((x) => x.v);
}

// ---------------------------------------------------------------------------------------------------------------------
// Apply — the free verb (§5.7; REQ-SPEC-6). The gate answers "is this card's Apply control enabled, and if
// not, why" — the surface renders the reason verbatim. Splicing + the write path live in apply.ts.
// ---------------------------------------------------------------------------------------------------------------------

export type ApplyDisabledReason =
  | "no_suggestion"
  | "already_applied"
  | "provisional"
  | "frozen"
  | "unanchored";

/** Whether Apply is available on this card — and the lock-disable reason when it is not (§5.7). */
export function applyGate(view: FindingView): { ok: true } | { ok: false; reason: ApplyDisabledReason } {
  if (view.suggestion == null) return { ok: false, reason: "no_suggestion" };
  if (view.disposition?.applied === true) return { ok: false, reason: "already_applied" };
  if (view.provisional) return { ok: false, reason: "provisional" };
  if (view.disposition?.frozen === true) return { ok: false, reason: "frozen" };
  // an anchor-free finding can't splice into the text — Whole-piece cards keep every other verb.
  if (view.anchor == null || view.anchor.unanchored === true) return { ok: false, reason: "unanchored" };
  if (!canDispose(view)) return { ok: false, reason: "frozen" };
  return { ok: true };
}

/** Bulk-action row selection: the findings a bulk verb's preview covers (§5.7 "one consolidated preview"). */
export type BulkAction = "apply_notes" | "defer_minor" | "accept_section";

export interface BulkSelection {
  readonly action: BulkAction;
  readonly findings: readonly FindingView[];
}

/** Which findings a named bulk action covers — the preview checklist's checked rows. */
export function bulkSelect(views: readonly FindingView[], action: BulkAction, section?: string): FindingView[] {
  switch (action) {
    case "apply_notes":
      // "Apply all notes" — note-severity findings carrying an applyable suggestion.
      return views.filter((v) => v.severity === "note" && applyGate(v).ok);
    case "defer_minor":
      // "Defer all minor" — undecided minor findings (decided rows keep their disposition).
      return views.filter((v) => v.severity === "minor" && v.disposition == null);
    case "accept_section":
      // "Accept all in §X" — undecided findings in the named letter section.
      return views.filter(
        (v) => v.disposition == null && (v.letterSection ?? "whole") === (section ?? "whole"),
      );
  }
}
