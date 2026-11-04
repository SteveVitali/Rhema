// Build-time What-changed artifact (R2 §4; REQ-CONV-15): `diffMarkdown` over the sanitized vN →
// v(N+1) drafts plus `buildWhatChangedView`/`traceRevisionMoves` over the round's converted
// response-ledger entries and moves, emitted as a deterministic JSON document 218 projects. A
// hunk links to a move ONLY through an entry carrying both `moveOrdinal` and an anchor — a round
// whose ledger has no `Discharges` (or no ledger at all) shows every hunk `Unlinked`, never a
// fabricated link (cross-cutting invariant 14). The strip counts are a DECLARED derivation from
// the emitted dispositions (addressed = done/verified/honored, rebutted = kind rebut, stillOpen =
// everything else) — prod computes them from obligation rows, which the corpus has none of.

import {
  diffMarkdown,
  buildWhatChangedView,
  traceRevisionMoves,
  type MoveTrace,
  type WhatChangedEntryInput,
} from "@rhema/findings-core";
import type { ResponseLedgerSidecar } from "@rhema/contracts";

export interface WhatChangedHunkView {
  readonly id: string;
  readonly kind: string;
  readonly before: readonly { readonly blockId: string; readonly text: string }[];
  readonly after: readonly { readonly blockId: string; readonly text: string }[];
  readonly charsChanged: number;
  /** The move this hunk joined, or `null` — explicitly Unlinked, never invented. */
  readonly moveId: string | null;
}

export interface WhatChangedArtifact {
  readonly version: 1;
  readonly from: string;
  readonly to: string;
  readonly summary: {
    readonly hunks: number;
    readonly unchanged: number;
    readonly moves: number;
    readonly linkedHunks: number;
    readonly unlinkedHunks: number;
    readonly addressed: number;
    readonly rebutted: number;
    readonly stillOpen: number;
  };
  readonly hunks: readonly WhatChangedHunkView[];
  readonly moves: readonly {
    readonly moveId: string;
    readonly ordinal: number;
    readonly title: string;
    readonly type?: string;
    readonly status?: string;
    readonly hunks: readonly string[];
    readonly entries: readonly {
      readonly findingOrdinal: number;
      readonly kind: string;
      readonly status?: string;
      readonly rationale?: string;
    }[];
  }[];
  readonly unlinked: {
    readonly hunks: readonly string[];
    readonly entries: readonly {
      readonly findingOrdinal: number;
      readonly kind: string;
      readonly status?: string;
      readonly rationale?: string;
    }[];
  };
  readonly rebutted: readonly {
    readonly findingOrdinal: number;
    readonly rationale: string;
  }[];
  /** The `revision.move_traced` rows (one per move + one unlinked remainder when it exists). */
  readonly trace: readonly MoveTrace[];
}

/** Compute the round's What-changed artifact. `ledger` may be absent (a writer-directed pair or a
 *  round with no response ledger) — the diff still emits, every hunk Unlinked. */
export function buildWhatChangedArtifact(
  beforeMarkdown: string,
  afterMarkdown: string,
  opts: {
    readonly from: string;
    readonly to: string;
    readonly ledger?: ResponseLedgerSidecar;
  },
): WhatChangedArtifact {
  const diff = diffMarkdown(beforeMarkdown, afterMarkdown);
  const entries: WhatChangedEntryInput[] = (opts.ledger?.entries ?? []).map((e) => ({
    findingOrdinal: e.findingOrdinal,
    kind: e.disposition.kind,
    status: e.disposition.status,
    ...(e.disposition.rationale !== undefined ? { rationale: e.disposition.rationale } : {}),
    ...(e.disposition.moveOrdinal !== undefined
      ? { moveOrdinal: e.disposition.moveOrdinal }
      : {}),
    ...(e.anchor !== undefined ? { anchor: e.anchor } : {}),
  }));
  const moves = (opts.ledger?.moves ?? []).map((m) => ({
    ordinal: m.ordinal,
    title: m.title,
    ...(m.type !== undefined ? { type: m.type } : {}),
    ...(m.status !== undefined ? { status: m.status } : {}),
  }));

  // Declared strip derivation (no obligation rows exist in the corpus — see header note).
  const ADDRESSED = new Set(["done", "verified", "honored"]);
  const strip = {
    addressed: entries.filter((e) => e.kind !== "rebut" && ADDRESSED.has(e.status ?? "")).length,
    rebutted: entries.filter((e) => e.kind === "rebut").length,
    stillOpen: entries.filter((e) => e.kind !== "rebut" && !ADDRESSED.has(e.status ?? "")).length,
  };

  const view = buildWhatChangedView(diff, { entries, moves, strip });
  const trace = traceRevisionMoves(diff, { entries, moves });

  const hunkMove = new Map<string, string>();
  for (const mv of view.moves)
    for (const h of mv.hunks) hunkMove.set(h.id, mv.moveId);
  const unlinkedIds = new Set(view.unlinked.hunks.map((h) => h.id));

  const hunks: WhatChangedHunkView[] = diff.hunks.map((h) => ({
    id: h.id,
    kind: h.kind,
    before: h.before.map((b) => ({ blockId: b.blockId, text: b.text })),
    after: h.after.map((b) => ({ blockId: b.blockId, text: b.text })),
    charsChanged: h.charsChanged,
    moveId: hunkMove.get(h.id) ?? null,
  }));

  return {
    version: 1,
    from: opts.from,
    to: opts.to,
    summary: {
      hunks: diff.hunks.length,
      unchanged: diff.unchanged,
      moves: view.moves.length,
      linkedHunks: diff.hunks.length - unlinkedIds.size,
      unlinkedHunks: unlinkedIds.size,
      addressed: view.strip.addressed,
      rebutted: view.strip.rebutted,
      stillOpen: view.strip.stillOpen,
    },
    hunks,
    moves: view.moves.map((mv) => ({
      moveId: mv.moveId,
      ordinal: mv.moveOrdinal,
      title: mv.title,
      ...(mv.type !== undefined ? { type: mv.type } : {}),
      hunks: mv.hunks.map((h) => h.id),
      entries: mv.findings.map((f) => ({
        findingOrdinal: f.findingOrdinal,
        kind: f.kind,
        ...(entries.find((e) => e.findingOrdinal === f.findingOrdinal)?.status !== undefined
          ? { status: entries.find((e) => e.findingOrdinal === f.findingOrdinal)!.status! }
          : {}),
        ...(f.rationale !== undefined ? { rationale: f.rationale } : {}),
      })),
    })),
    unlinked: {
      hunks: view.unlinked.hunks.map((h) => h.id),
      entries: view.unlinked.entries.map((e) => ({
        findingOrdinal: e.findingOrdinal,
        kind: e.kind,
        ...(e.status !== undefined ? { status: e.status } : {}),
        ...(e.rationale !== undefined ? { rationale: e.rationale } : {}),
      })),
    },
    rebutted: view.rebutted.map((r) => ({
      findingOrdinal: r.findingOrdinal,
      rationale: r.rationale,
    })),
    trace,
  };
}
