import type { Anchor, DispositionKind } from "@rhema/contracts";
import { normalizeText, resolveAnchor, type PassageBlock } from "./anchor.js";

// The What-changed read model + the server-side block diff (§5.8; REQ-IDE-33, REQ-BETA-7/8, REQ-DATA-25).
// The beta renders ONE layout — move cards + an Inline hunk list — computed entirely server-side from the
// canonical markdown of two frozen/working versions; no editor-side diff machinery (REQ-SPEC-19). "What
// changed and why" joins changed blocks to response-ledger moves through each move's discharge evidence
// (the entry anchors into v(N+1)) resolved by the SAME quote-resolution ladder findings use
// (`resolveAnchor`, anchor.ts) — never chat scrollback. Framework-free; the @rhema/ui renderer and the api
// both consume this module, and P1.8 re-skins the same pair inside the pane system.

// ---------------------------------------------------------------------------------------------------------------------
// blocks + the block-aligned diff
// ---------------------------------------------------------------------------------------------------------------------

/** A canonical-markdown block: a heading or a blank-line-separated run of lines. `blockId` is positional and
 *  deterministic ("b1", "b2", …) — the same splitter feeds the diff and the quote-resolution ladder, so an
 *  evidence anchor resolves onto the same blocks a hunk reports. */
export interface DiffBlock extends PassageBlock {
  readonly index: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

/**
 * Split canonical markdown into blocks on blank-line boundaries. Deterministic and idempotent — identical
 * input yields identical block ids (positional `b<1-based index>`), which is what makes the server diff
 * reproducible and lets anchors written against these ids resolve consistently.
 */
export function splitMarkdownBlocks(markdown: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  let index = 0;
  const push = (text: string, s: number) => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    const lead = text.indexOf(trimmed);
    index += 1;
    blocks.push({ index, blockId: `b${index}`, text: trimmed, startOffset: s + lead, endOffset: s + lead + trimmed.length });
  };
  // blank-line boundaries: a line that is empty or whitespace-only ends a block.
  const re = /\n[ \t]*\n/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(markdown)) !== null) {
    push(markdown.slice(last, m.index), last);
    last = m.index + m[0].length;
  }
  push(markdown.slice(last), last);
  return blocks;
}

export type HunkKind = "edited" | "added" | "removed" | "mixed";

/** A contiguous run of changed blocks between two unchanged anchors (the §5.8 "hunk"). */
export interface DiffHunk {
  readonly id: string; // "h1", "h2", … in document order
  readonly kind: HunkKind;
  /** vN blocks that changed (edited/removed); empty for a pure insertion. */
  readonly before: readonly DiffBlock[];
  /** v(N+1) blocks that changed (edited/added); empty for a pure deletion. */
  readonly after: readonly DiffBlock[];
  /** total characters across the changed before+after text (the event's `charsChanged`). */
  readonly charsChanged: number;
}

export interface BlockDiff {
  readonly hunks: readonly DiffHunk[];
  /** count of blocks that did not change (the diff's unchanged context). */
  readonly unchanged: number;
  readonly beforeBlocks: readonly DiffBlock[];
  readonly afterBlocks: readonly DiffBlock[];
}

/** Fraction of `a`'s words present in `b` (order-agnostic) — the edited-pair heuristic. */
function wordCoverage(a: string, b: string): number {
  const wa = normalizeText(a).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (wa.length === 0) return 0;
  const wb = new Set(normalizeText(b).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit += 1;
  return hit / wa.length;
}

/** Below this coverage two unmatched blocks are a remove+add pair, not an edit. */
const EDIT_PAIR_FLOOR = 0.25;

/**
 * The block-aligned diff vN → v(N+1). Unchanged blocks anchor an LCS over normalized text; each changed
 * region between matched blocks becomes one hunk. Kind: `added`/`removed` for one-sided regions; a 1-before/
 * 1-after region is `edited` when its word coverage clears `EDIT_PAIR_FLOOR` (a real rewrite), else `mixed`
 * (a remove+add in disguise); multi-block regions are `mixed`.
 */
export function diffMarkdown(beforeMd: string, afterMd: string): BlockDiff {
  const before = splitMarkdownBlocks(beforeMd);
  const after = splitMarkdownBlocks(afterMd);
  const key = (b: DiffBlock) => normalizeText(b.text);

  // LCS over normalized block text — the unchanged spine.
  const n = before.length;
  const m = after.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = key(before[i]!) === key(after[j]!)
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  // walk the LCS emitting (beforeRun, afterRun) changed regions between matched pairs.
  interface Region {
    before: DiffBlock[];
    after: DiffBlock[];
  }
  const regions: Region[] = [];
  let i = 0, j = 0, unchanged = 0;
  const flushRegion = (rb: DiffBlock[], ra: DiffBlock[]) => {
    if (rb.length === 0 && ra.length === 0) return;
    regions.push({ before: rb, after: ra });
  };
  let pendB: DiffBlock[] = [];
  let pendA: DiffBlock[] = [];
  while (i < n && j < m) {
    if (key(before[i]!) === key(after[j]!)) {
      flushRegion(pendB, pendA);
      pendB = [];
      pendA = [];
      unchanged += 1;
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      pendB.push(before[i]!);
      i += 1;
    } else {
      pendA.push(after[j]!);
      j += 1;
    }
  }
  while (i < n) pendB.push(before[i++]!);
  while (j < m) pendA.push(after[j++]!);
  flushRegion(pendB, pendA);

  const hunks: DiffHunk[] = regions.map((r, idx) => {
    const kind: HunkKind =
      r.before.length === 0
        ? "added"
        : r.after.length === 0
          ? "removed"
          : r.before.length === 1 && r.after.length === 1 && wordCoverage(r.before[0]!.text, r.after[0]!.text) >= EDIT_PAIR_FLOOR
            ? "edited"
            : "mixed";
    const charsChanged =
      r.before.reduce((s, b) => s + b.text.length, 0) + r.after.reduce((s, b) => s + b.text.length, 0);
    return { id: `h${idx + 1}`, kind, before: r.before, after: r.after, charsChanged };
  });
  return { hunks, unchanged, beforeBlocks: before, afterBlocks: after };
}

// ---------------------------------------------------------------------------------------------------------------------
// the response-ledger join (what changed AND why)
// ---------------------------------------------------------------------------------------------------------------------

/** One frozen response-ledger row as the server reads it (the disposition entry + the finding it answers). */
export interface WhatChangedEntryInput {
  readonly findingOrdinal: number;
  /** the review's finding row id (resolved server-side; omitted in pure unit fixtures). */
  readonly findingId?: string;
  readonly title?: string;
  readonly severity?: string;
  readonly kind: DispositionKind;
  readonly status?: string;
  readonly rationale?: string;
  readonly moveOrdinal?: number;
  readonly actor?: string;
  /** the move's discharge evidence — the entry's anchor into v(N+1) (§5.8; resolved via the anchor ladder). */
  readonly anchor?: Anchor | null;
}

/** A move's title/type from the response-ledger `moves` table (optional — older ledgers carry none). */
export interface MoveMeta {
  readonly ordinal: number;
  readonly title?: string;
  readonly type?: string;
  readonly status?: string;
}

/** An obligation discharge line on a move card (§5.8/§11.7; REQ-OBJ-6) — assembled server-side from rows. */
export interface ObligationLineInput {
  readonly obligationId: string;
  /** the short label — e.g. "OBL-3". */
  readonly label: string;
  /** e.g. "(F-07, carried from v2)". */
  readonly lineage?: string;
  /** gap_check | re_review | user → "verified by gap check" / "discharged (unverified)". */
  readonly verifiedBy?: "gap_check" | "re_review" | "user";
  /** the obligation's state after this response (addressed | discharged | rebutted | deferred | mooted). */
  readonly state: string;
}

export interface WhatChangedInput {
  /** the response-ledger entries (frozen dispositions), in ledger order. */
  readonly entries: readonly WhatChangedEntryInput[];
  /** the ledger's `moves` table (titles/types) when present. */
  readonly moves?: readonly MoveMeta[];
  /** obligation discharge lines keyed by the move ordinal they hang off. */
  readonly obligationLines?: Readonly<Record<number, readonly ObligationLineInput[]>>;
  /** the summary strip counts, computed server-side from obligation rows (REQ-OBJ-6). */
  readonly strip: { readonly addressed: number; readonly rebutted: number; readonly stillOpen: number };
}

export interface MoveCardView {
  readonly moveOrdinal: number;
  /** the display id — "M3". */
  readonly moveId: string;
  readonly title: string;
  readonly type?: string;
  /** the ledger rows this move answers (finding refs + dispositions). */
  readonly findings: readonly {
    readonly findingOrdinal: number;
    readonly findingId?: string;
    readonly title?: string;
    readonly severity?: string;
    readonly kind: DispositionKind;
    readonly rationale?: string;
  }[];
  readonly dischargeLines: readonly ObligationLineInput[];
  /** the changed blocks the move's evidence resolved into. */
  readonly hunks: readonly DiffHunk[];
}

export interface RebuttedCardView {
  readonly findingOrdinal: number;
  readonly findingId?: string;
  readonly title?: string;
  readonly severity?: string;
  readonly rationale: string;
}

export interface WhatChangedView {
  readonly strip: { readonly addressed: number; readonly rebutted: number; readonly stillOpen: number; readonly moves: number; readonly hunks: number };
  readonly moves: readonly MoveCardView[];
  /** changed blocks no move's evidence resolved into (§5.8 "Unlinked"), + ledger rows attached to no move. */
  readonly unlinked: { readonly hunks: readonly DiffHunk[]; readonly entries: readonly WhatChangedEntryInput[] };
  /** rebutted findings — rationale shown, NO hunk (§5.8). */
  readonly rebutted: readonly RebuttedCardView[];
}

/**
 * Join the block diff to the response ledger (§5.8). Each entry's discharge-evidence anchor resolves through
 * the SAME ladder findings use (`resolveAnchor`): first over the v(N+1) blocks (the move's recorded
 * location), then over vN's (a deletion's evidence only exists on the before side). A resolved block inside a
 * hunk joins the hunk to the entry's move. Hunks no move claims group under Unlinked; entries with a `rebut`
 * kind become rationale-only cards with no hunk.
 */
export function buildWhatChangedView(diff: BlockDiff, input: WhatChangedInput): WhatChangedView {
  const hunkByAfterBlock = new Map<string, DiffHunk>();
  const hunkByBeforeBlock = new Map<string, DiffHunk>();
  for (const h of diff.hunks) {
    for (const b of h.after) hunkByAfterBlock.set(b.blockId, h);
    for (const b of h.before) hunkByBeforeBlock.set(b.blockId, h);
  }

  const moveMeta = new Map<number, MoveMeta>((input.moves ?? []).map((mm) => [mm.ordinal, mm]));
  const byMove = new Map<number, { entries: WhatChangedEntryInput[]; hunks: Map<string, DiffHunk> }>();
  const rebutted: RebuttedCardView[] = [];
  const unlinkedEntries: WhatChangedEntryInput[] = [];
  const claimedHunks = new Set<string>();

  for (const e of input.entries) {
    if (e.kind === "rebut") {
      rebutted.push({
        findingOrdinal: e.findingOrdinal,
        ...(e.findingId != null ? { findingId: e.findingId } : {}),
        ...(e.title != null ? { title: e.title } : {}),
        ...(e.severity != null ? { severity: e.severity } : {}),
        rationale: e.rationale ?? "",
      });
      continue;
    }
    if (e.moveOrdinal == null) {
      unlinkedEntries.push(e);
      continue;
    }
    let bucket = byMove.get(e.moveOrdinal);
    if (!bucket) {
      bucket = { entries: [], hunks: new Map() };
      byMove.set(e.moveOrdinal, bucket);
    }
    bucket.entries.push(e);
    // discharge evidence → hunk: after-side first (the move's recorded location), then the before side
    // (a structural cut's evidence only exists on vN).
    if (e.anchor != null && e.anchor.unanchored !== true) {
      const onAfter = resolveAnchor(e.anchor, [...diff.afterBlocks]);
      const resolved =
        onAfter.method !== "unresolved" && onAfter.blockId != null
          ? hunkByAfterBlock.get(onAfter.blockId)
          : undefined;
      const hunk =
        resolved ??
        (() => {
          const onBefore = resolveAnchor(e.anchor!, [...diff.beforeBlocks]);
          return onBefore.method !== "unresolved" && onBefore.blockId != null
            ? hunkByBeforeBlock.get(onBefore.blockId)
            : undefined;
        })();
      if (hunk) {
        bucket.hunks.set(hunk.id, hunk);
        claimedHunks.add(hunk.id);
      }
    }
  }

  const moves: MoveCardView[] = [...byMove.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ordinal, bucket]) => {
      const meta = moveMeta.get(ordinal);
      const findings = bucket.entries.map((e) => ({
        findingOrdinal: e.findingOrdinal,
        ...(e.findingId != null ? { findingId: e.findingId } : {}),
        ...(e.title != null ? { title: e.title } : {}),
        ...(e.severity != null ? { severity: e.severity } : {}),
        kind: e.kind,
        ...(e.rationale != null ? { rationale: e.rationale } : {}),
      }));
      return {
        moveOrdinal: ordinal,
        moveId: `M${ordinal}`,
        title: meta?.title ?? `Move ${ordinal}`,
        ...(meta?.type != null ? { type: meta.type } : {}),
        findings,
        dischargeLines: input.obligationLines?.[ordinal] ?? [],
        hunks: [...bucket.hunks.values()],
      };
    });

  const unlinkedHunks = diff.hunks.filter((h) => !claimedHunks.has(h.id));
  return {
    strip: { ...input.strip, moves: moves.length, hunks: diff.hunks.length },
    moves,
    unlinked: { hunks: unlinkedHunks, entries: unlinkedEntries },
    rebutted,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// revision.move_traced (REQ-BETA-7) — shared by Revise delivery and the manual-revision save (PRB.07)
// ---------------------------------------------------------------------------------------------------------------------

/** One `revision.move_traced` event payload — per move (finding_id = the move's first answered finding). */
export interface MoveTrace {
  readonly findingId?: string;
  readonly moveId?: string;
  readonly hunkCount: number;
  readonly charsChanged: number;
}

/**
 * The per-move trace payloads for `revision.move_traced` (REQ-BETA-7). One row per ledger move (its joined
 * hunk count + changed chars); when the diff has hunks no move claimed (or the ledger is absent — a manual
 * revision), a single unlinked row carries the remainder so the event stream still accounts for every change.
 */
export function traceRevisionMoves(diff: BlockDiff, input: Pick<WhatChangedInput, "entries" | "moves">): MoveTrace[] {
  const view = buildWhatChangedView(diff, { entries: input.entries, moves: input.moves ?? [], strip: { addressed: 0, rebutted: 0, stillOpen: 0 } });
  const out: MoveTrace[] = view.moves.map((mv) => ({
    moveId: mv.moveId,
    ...(mv.findings[0]?.findingId != null ? { findingId: mv.findings[0].findingId } : {}),
    hunkCount: mv.hunks.length,
    charsChanged: mv.hunks.reduce((s, h) => s + h.charsChanged, 0),
  }));
  // a no-change diff emits nothing: the unlinked remainder is a trace only when real hunks went unclaimed.
  const unlinkedChars = view.unlinked.hunks.reduce((s, h) => s + h.charsChanged, 0);
  if (view.unlinked.hunks.length > 0) {
    out.push({ hunkCount: view.unlinked.hunks.length, charsChanged: unlinkedChars });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// changed_since — the re-review input (REQ-DATA-25)
// ---------------------------------------------------------------------------------------------------------------------

export interface ChangedSinceHunk {
  readonly id: string;
  readonly kind: HunkKind;
  readonly before?: { readonly blockId: string; readonly text: string };
  readonly after?: { readonly blockId: string; readonly text: string };
}

/** A claim placeholder the re-review must verify — a human-edited block carries `humanAdded` +
 *  `verdict:'unverifiable'` until the next Review checks it (§11.6 REQ-DATA-25; REQ-PROD-11). */
export interface HumanAddedClaimPlaceholder {
  readonly blockId: string;
  readonly text: string;
  readonly humanAdded: true;
  readonly verdict: "unverifiable";
}

export interface ChangedSince {
  readonly version: 1;
  readonly hunks: readonly ChangedSinceHunk[];
  /** set for each block a HUMAN revision touched (added or edited) — empty on an agent revision. */
  readonly humanAddedClaims: readonly HumanAddedClaimPlaceholder[];
  readonly summary: { readonly added: number; readonly edited: number; readonly removed: number; readonly unchanged: number };
}

/**
 * The `changed_since` review input: the block diff vN→v(N+1) the Editor reads before re-reviewing. When the
 * head version is a HUMAN revision, every block it touched becomes a `humanAdded`/`unverifiable` claim
 * placeholder — the review re-checks them rather than inheriting a verdict no agent made (REQ-DATA-25).
 */
export function buildChangedSince(
  beforeMd: string,
  afterMd: string,
  opts: { readonly humanEdit?: boolean } = {},
): ChangedSince {
  const diff = diffMarkdown(beforeMd, afterMd);
  const hunks: ChangedSinceHunk[] = diff.hunks.map((h) => ({
    id: h.id,
    kind: h.kind,
    ...(h.before.length > 0 ? { before: { blockId: h.before[0]!.blockId, text: h.before.map((b) => b.text).join("\n\n") } } : {}),
    ...(h.after.length > 0 ? { after: { blockId: h.after[0]!.blockId, text: h.after.map((b) => b.text).join("\n\n") } } : {}),
  }));
  const humanAddedClaims: HumanAddedClaimPlaceholder[] = opts.humanEdit
    ? diff.hunks.flatMap((h) =>
        h.after.map((b) => ({ blockId: b.blockId, text: b.text, humanAdded: true as const, verdict: "unverifiable" as const })),
      )
    : [];
  const summary = {
    added: diff.hunks.filter((h) => h.kind === "added").length,
    edited: diff.hunks.filter((h) => h.kind === "edited" || h.kind === "mixed").length,
    removed: diff.hunks.filter((h) => h.kind === "removed").length,
    unchanged: diff.unchanged,
  };
  return { version: 1, hunks, humanAddedClaims, summary };
}

// ---------------------------------------------------------------------------------------------------------------------
// rubric delta — before/after per dimension, NEVER an aggregate (REQ-IDE-30)
// ---------------------------------------------------------------------------------------------------------------------

export interface RubricDeltaRow {
  readonly dimension: string;
  readonly before: number | null;
  readonly after: number | null;
  /** 'up' | 'down' | 'same' | 'new' (no prior) | 'dropped' (no current). */
  readonly direction: "up" | "down" | "same" | "new" | "dropped";
}

/** The rubric-delta view — rows only, NO total/average (REQ-IDE-30; the surface cannot read it as a score). */
export interface RubricDeltaView {
  readonly rows: readonly RubricDeltaRow[];
}

/**
 * The per-dimension before/after delta across rounds (§5.8; the "round summary" rubric delta). Dimensions
 * present in only one round still list (before/after null on the missing side). There is intentionally no
 * aggregate — the DOM exposes no total to read as a score.
 */
export function buildRubricDelta(
  before: readonly { dimension: string; score: number }[],
  after: readonly { dimension: string; score: number }[],
): RubricDeltaView {
  const bMap = new Map(before.map((r) => [r.dimension, r.score]));
  const aMap = new Map(after.map((r) => [r.dimension, r.score]));
  const dims = [...new Set([...before.map((r) => r.dimension), ...after.map((r) => r.dimension)])];
  const rows: RubricDeltaRow[] = dims.map((d) => {
    const b = bMap.get(d) ?? null;
    const a = aMap.get(d) ?? null;
    const direction: RubricDeltaRow["direction"] =
      b == null ? "new" : a == null ? "dropped" : a > b ? "up" : a < b ? "down" : "same";
    return { dimension: d, before: b, after: a, direction };
  });
  return { rows };
}
