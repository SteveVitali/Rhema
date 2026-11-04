// The read-model projections: version rail, n:m diffs and What-changed (REQ-CORPUS-12/13,
// REQ-CONV-15). The move/hunk join is 217's committed artifact — the projector lifts its move
// ids/entries/rebutted onto a fresh `diffMarkdown` run so the DTO hunks carry full DiffBlock
// fields, and asserts the artifact's hunk ids still resolve (a stale artifact fails closed).

import { diffMarkdown, type DiffHunk } from "@rhema/findings-core";
import type {
  EditorResolveDto,
  VersionDiffDto,
  VersionRailDto,
  WhatChangedDto,
  WhatChangedStripDto,
  MoveCardDto,
  RebuttedCardDto,
  DiffHunkDto,
} from "@rhema/api-client";
import { parsePublished } from "../versions.js";
import type { WhatChangedArtifact } from "../convert/what-changed.js";
import type { DemoVersion } from "./versions.js";

const ADDRESSED = new Set(["done", "verified", "honored", "rebutted"]); // prod's closed states

function markdownOf(
  v: DemoVersion,
  files: ReadonlyMap<string, string>,
): string {
  const raw = files.get(v.file);
  if (raw === undefined) throw new Error(`projector: draft file missing: ${v.file}`);
  return v.origin === "imported" ? parsePublished(raw).body : raw;
}

interface ResponseLedger {
  readonly entries?: readonly {
    readonly findingOrdinal: number;
    readonly disposition: { readonly kind: string; readonly status?: string };
  }[];
}

interface FindingsSidecar {
  readonly findings?: readonly { readonly ordinal: number; readonly severity?: string }[];
}

/** The version rail (REQ-IDE-32 shape): reviewed/answered from the corpus dirs; the ⚑ chip is a
 *  declared derivation — blocking/major findings split by their response disposition (closed =
 *  prod's ADDRESSED set), not invented counts. */
export function versionRail(
  versions: readonly DemoVersion[],
  ctx: { readonly outputs: ReadonlyMap<string, string>; readonly words: ReadonlyMap<string, number> },
): VersionRailDto {
  const majors = (v: DemoVersion): { open: number; addressed: number } => {
    if (!v.reviewed) return { open: 0, addressed: 0 };
    const dir = `correspondence/${v.draftId}-review`;
    const fj = ctx.outputs.get(`${dir}/findings.json`);
    if (fj === undefined) return { open: 0, addressed: 0 };
    const major = new Set(
      ((JSON.parse(fj) as FindingsSidecar).findings ?? [])
        .filter((f) => f.severity === "blocking" || f.severity === "major")
        .map((f) => f.ordinal),
    );
    const closed = new Set<number>();
    const lj = ctx.outputs.get(`agents/author/ledgers/${v.draftId}-response-ledger.json`);
    if (lj !== undefined)
      for (const e of (JSON.parse(lj) as ResponseLedger).entries ?? [])
        if (ADDRESSED.has(e.disposition.status ?? "") || e.disposition.kind === "rebut")
          closed.add(e.findingOrdinal);
    let open = 0;
    let addressed = 0;
    for (const o of major) { if (closed.has(o)) addressed++; else open++; }
    return { open, addressed };
  };
  const per = versions.map((v) => majors(v));
  return {
    workingN: versions.find((v) => v.state === "working")?.n ?? null,
    chip: per.reduce((s, c) => ({ open: s.open + c.open, addressed: s.addressed + c.addressed }), {
      open: 0,
      addressed: 0,
    }),
    outline: null,
    drafts: versions.map((v, i) => ({
      draftId: v.draftId,
      n: v.n,
      origin: v.origin,
      state: v.state,
      frozen: v.state === "frozen",
      frozenAt: v.frozenAt,
      createdAt: v.createdAt,
      words: ctx.words.get(v.draftId) ?? null,
      reviewed: v.reviewed,
      answered: v.answered,
      claimsPendingVerification: v.claimsPendingVerification,
      obligations: per[i]!,
      label: v.label,
    })),
  } satisfies VersionRailDto;
}

/** `/v/:v` — "working" → head, "<n>" → its draft (prod's resolve falls back to the highest n). */
export function resolveTable(
  versions: readonly DemoVersion[],
): Record<string, EditorResolveDto> {
  const dto = (v: DemoVersion): EditorResolveDto => ({
    draftId: v.draftId,
    draftN: v.n,
    state: v.state,
    origin: v.origin,
  });
  const out: Record<string, EditorResolveDto> = {};
  for (const v of versions) out[String(v.n)] = dto(v);
  out["working"] = dto(versions[versions.length - 1]!);
  return out;
}

function hunk(h: DiffHunk): DiffHunkDto {
  return { id: h.id, kind: h.kind, before: [...h.before], after: [...h.after], charsChanged: h.charsChanged };
}

interface FindingMeta {
  readonly id?: string;
  readonly title?: string;
  readonly severity?: string;
}

/** The artifact's join → the DTO `view` (moves with enriched findings + resolved hunks). */
function projectView(
  diff: ReturnType<typeof diffMarkdown>,
  a: WhatChangedArtifact | undefined,
  meta: ReadonlyMap<number, FindingMeta>,
): WhatChangedDto["view"] {
  const hunksById = new Map(diff.hunks.map((h) => [h.id, h] as const));
  const resolveHunks = (ids: readonly string[]): DiffHunkDto[] =>
    ids.map((id) => {
      const h = hunksById.get(id);
      if (h === undefined)
        throw new Error(`projector: what-changed artifact hunk ${id} missing from fresh diff`);
      return hunk(h);
    });
  const strip: WhatChangedStripDto =
    a !== undefined
      ? {
          addressed: a.summary.addressed,
          rebutted: a.summary.rebutted,
          stillOpen: a.summary.stillOpen,
          moves: a.summary.moves,
          hunks: a.summary.hunks,
        }
      : { addressed: 0, rebutted: 0, stillOpen: 0, moves: 0, hunks: diff.hunks.length };
  const moves: MoveCardDto[] = (a?.moves ?? []).map((m) => ({
    moveOrdinal: m.ordinal,
    moveId: m.moveId,
    title: m.title,
    ...(m.type !== undefined ? { type: m.type } : {}),
    findings: m.entries.map((e) => ({
      findingOrdinal: e.findingOrdinal,
      ...(meta.get(e.findingOrdinal)?.id !== undefined ? { findingId: meta.get(e.findingOrdinal)!.id } : {}),
      ...(meta.get(e.findingOrdinal)?.title !== undefined ? { title: meta.get(e.findingOrdinal)!.title } : {}),
      ...(meta.get(e.findingOrdinal)?.severity !== undefined
        ? { severity: meta.get(e.findingOrdinal)!.severity }
        : {}),
      kind: e.kind,
      ...(e.rationale !== undefined ? { rationale: e.rationale } : {}),
    })),
    dischargeLines: [], // no obligation rows exist in the corpus record
    hunks: resolveHunks(m.hunks),
  }));
  const claimed = new Set((a?.moves ?? []).flatMap((m) => m.hunks));
  const rebutted: RebuttedCardDto[] = (a?.rebutted ?? []).map((r) => ({
    findingOrdinal: r.findingOrdinal,
    ...(meta.get(r.findingOrdinal)?.id !== undefined ? { findingId: meta.get(r.findingOrdinal)!.id } : {}),
    ...(meta.get(r.findingOrdinal)?.title !== undefined ? { title: meta.get(r.findingOrdinal)!.title } : {}),
    ...(meta.get(r.findingOrdinal)?.severity !== undefined
      ? { severity: meta.get(r.findingOrdinal)!.severity }
      : {}),
    rationale: r.rationale,
  }));
  return {
    strip,
    moves,
    unlinked: {
      hunks: diff.hunks.filter((h) => !claimed.has(h.id)).map(hunk),
      entries: [...(a?.unlinked.entries ?? [])],
    },
    rebutted,
  };
}

function metaOf(round: string | null, outputs: ReadonlyMap<string, string>): Map<number, FindingMeta> {
  const meta = new Map<number, FindingMeta>();
  if (round === null) return meta;
  const dir = `correspondence/${round}-review`;
  const titles = new Map<number, FindingMeta>();
  const fj = outputs.get(`${dir}/findings.json`);
  if (fj !== undefined)
    for (const f of (JSON.parse(fj) as { findings?: readonly { ordinal: number; title?: string; severity?: string }[] }).findings ?? [])
      titles.set(f.ordinal, { title: f.title, severity: f.severity });
  const lj = outputs.get(`${dir}/labels.json`);
  if (lj !== undefined)
    for (const f of (JSON.parse(lj) as { findings?: readonly { ordinal: number; id: string }[] }).findings ?? [])
      meta.set(f.ordinal, { ...titles.get(f.ordinal), id: f.id });
  for (const [o, t] of titles) if (!meta.has(o)) meta.set(o, t);
  return meta;
}

/** The `n:m` VersionDiffDto + its WhatChangedDto twin for one adjacent pair (`to` may be the
 *  published node). `artifact` is 217's `what-changed/<from>-<to>.json` when the corpus has one. */
export function pairSnapshots(
  before: DemoVersion,
  after: DemoVersion,
  ctx: {
    readonly files: ReadonlyMap<string, string>;
    readonly outputs: ReadonlyMap<string, string>;
    readonly artifact: WhatChangedArtifact | undefined;
  },
): { readonly diff: VersionDiffDto; readonly whatChanged: WhatChangedDto } {
  // The pair "answers a correspondence" only when the after-version is the response's product —
  // a writer-directed or imported after-version breaks the link (the writer's edit, or the live
  // post, is not the response's output). reviewId follows the same rule.
  const linked = before.answered && after.origin !== "human_revision" && after.origin !== "imported";
  const review = linked ? `${before.draftId}-review` : null;
  const round = linked ? before.draftId : null;
  const diff = diffMarkdown(markdownOf(before, ctx.files), markdownOf(after, ctx.files));
  const view = projectView(diff, ctx.artifact, metaOf(round, ctx.outputs));
  const meta = (v: DemoVersion) => ({
    draftId: v.draftId,
    n: v.n,
    origin: v.origin,
    state: v.state,
    frozenAt: v.frozenAt,
    createdAt: v.createdAt,
    claimsPendingVerification: v.claimsPendingVerification,
  });
  const cid = `${before.draftId}-${after.draftId}`;
  const responseId = linked ? cid : null;
  return {
    diff: {
      ok: true,
      responseId,
      reviewId: review,
      before: meta(before),
      after: meta(after),
      diff: {
        hunks: diff.hunks.map(hunk),
        unchanged: diff.unchanged,
        beforeBlocks: [...diff.beforeBlocks],
        afterBlocks: [...diff.afterBlocks],
      },
      view,
    } satisfies VersionDiffDto,
    whatChanged: {
      ok: true,
      responseId: cid,
      reviewId: review,
      beforeN: before.n,
      afterN: after.n,
      view,
    } satisfies WhatChangedDto,
  };
}
