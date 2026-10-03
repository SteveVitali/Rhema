// P1.09 — the gate card's structured-edit payload (§6.4 item 4; REQ-SPEC-9).
//
// The card renders editable fields over the artifact's sidecar rows (spine/sections/cut toggles) or
// labeled value fields (scope corrections, the thesis pick). On POST the web encodes the fields as a
// `GateStructuredEdits` JSON body; the api applies them to the sidecar it re-reads SERVER-SIDE (the
// client supplies deltas, never the base document) and the orchestrator serializes the result into
// the write-back overlay (`edits.rows` → `serializeGateOverlay`). The decode here is pure +
// deterministic; the apply mutates a plain sidecar-shaped value the caller already parsed.

import type { GateKind } from "@rhema/contracts";

/** A spine-claim edit on Approve-plan (§6.4 item 4): reorder, strike, annotate. */
export interface SpineClaimEdit {
  readonly index: number;
  readonly order?: number;
  readonly strike?: boolean;
  readonly note?: string;
}

/** A claim added through the card (always carries the required note, per the spec). */
export interface NewSpineClaim {
  readonly text: string;
  readonly note?: string;
  /** P1.12 — the section (0-based index) an outline claim lands in; absent → the last section. */
  readonly sectionIndex?: number;
}

/** A section-row edit on Approve-plan / Approve-outline: order, target words, function, entry/exit. */
export interface SectionEdit {
  readonly index: number;
  readonly order?: number;
  readonly targetWords?: number;
  readonly purpose?: string;
  /** P1.12 — the outline section's entry/exit states (§7.3's spine-and-sections row). */
  readonly entry?: string;
  readonly exit?: string;
}

/**
 * P1.12 — a claim-row edit on Approve-outline / the outline editor: reorder within a section,
 * move between sections, strike, annotate. `section`/`index` name the row's CURRENT position;
 * `order` is the 1-based target position inside the DESTINATION section (`toSection` or its own).
 * A claim's provenance + `unverified` badge are never editable — they ride the row untouched
 * (REQ-DATA-23).
 */
export interface ClaimEdit {
  readonly section: number;
  readonly index: number;
  readonly order?: number;
  readonly toSection?: number;
  readonly strike?: boolean;
  readonly note?: string;
}

/** A cut-list toggle on Approve-cutlist: `protect` keeps the row's text in the draft. */
export interface CutToggleEdit {
  readonly index: number;
  readonly protect: boolean;
}

/** P1.12 — a gap's Answer (Approve-outline card + the editor's elicit affordance): the text lands as
 *  a `user_typed` claim in the gap's named section and the gap leaves the open list. */
export interface GapAnswerEdit {
  readonly gapId: string;
  readonly text: string;
}

/**
 * The structured fields one decision carries (the JSON body the web's form handler builds from the
 * card's `ed.*` inputs). `values` are labeled key→value corrections (scope fields, the thesis pick,
 * the apparatus budget) — recorded on the decision and composed into the edit summary; `spine`/
 * `sections`/`cutToggles` are row edits applied to the gate artifact's sidecar.
 */
export interface GateStructuredEdits {
  readonly note?: string;
  readonly values?: Readonly<Record<string, string>>;
  readonly spine?: readonly SpineClaimEdit[];
  readonly newClaims?: readonly NewSpineClaim[];
  readonly sections?: readonly SectionEdit[];
  /** P1.12 — outline claim-row moves/strikes (Approve-outline + the editor's autosave). */
  readonly claims?: readonly ClaimEdit[];
  /** P1.12 — answered gaps → `user_typed` claims (the gate card + the editor's elicit affordance). */
  readonly gapAnswers?: readonly GapAnswerEdit[];
  readonly cutToggles?: readonly CutToggleEdit[];
}

/** The apply result: the post-decision sidecar document + the change count + a human summary. */
export interface AppliedGateEdits {
  /** the post-edit sidecar document (validated by the serializer downstream) — undefined when the
   *  kind carries no editable sidecar (scope/thesis/facts kinds record `values` only). */
  readonly rows?: unknown;
  /** how many structured changes the decision applied (the "with N changes" count). */
  readonly changes: number;
  /** one line per applied change — appended to the edit summary the decision + guidance record. */
  readonly summary: readonly string[];
}

type PlainRow = Record<string, unknown>;

interface StructurePlanDoc extends PlainRow {
  /** the contract's spine is `string[]` (structurePlanSidecarSchema) — a strike REMOVES the claim; a
   *  note rides the decision record + guidance, never mutates the claim text. */
  spine?: unknown[];
  sections?: PlainRow[];
}

interface CutListDoc extends PlainRow {
  cuts?: PlainRow[];
}

/** P1.12 — the outline sidecar's editable surface (claim provenance/unverified ride `PlainRow`
 *  untouched — the apply never rewrites them). */
interface OutlineDoc extends PlainRow {
  spine?: unknown[];
  sections?: PlainRow[];
  gaps?: PlainRow[];
  thesis?: unknown;
  venue?: unknown;
  targetLength?: unknown;
  protocol?: unknown;
  voice?: unknown;
}

function isDoc(v: unknown): v is PlainRow {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/**
 * Apply the card's structured edits to the gate artifact's parsed sidecar. Pure — returns a NEW
 * document; the caller validates the result against the registered schema (the serializer does).
 * Kinds without an editable sidecar ignore `sidecar` and only count `values`.
 */
export function applyGateEdits(
  kind: GateKind,
  sidecar: unknown,
  edits: GateStructuredEdits,
): AppliedGateEdits {
  const summary: string[] = [];
  let changes = 0;

  if (kind === "approve_plan" && isDoc(sidecar)) {
    const doc = sidecar as StructurePlanDoc;
    const spine = [...(doc.spine ?? [])];
    const spineEdits = edits.spine ?? [];
    // Strike = the claim leaves the spine (the plan no longer commits to it); a claim note is
    // recorded on the decision + composed into guidance — the sidecar's spine stays `string[]`
    // (structurePlanSidecarSchema), so edits never write row metadata into the contract field.
    const struck = new Set<number>();
    for (const e of spineEdits) {
      if (e.strike === true) struck.add(e.index);
      if (e.note != null && e.note !== "") {
        changes += 1;
        summary.push(`spine claim ${e.index + 1} noted`);
      }
    }
    const kept: { row: unknown; i: number }[] = [];
    spine.forEach((row, i) => {
      if (struck.has(i)) {
        changes += 1;
        summary.push(`spine claim ${i + 1} struck`);
      } else {
        kept.push({ row, i });
      }
    });
    // Reorder: each posted `ord` is the claim's 1-based target position among the KEPT claims —
    // pull the claim out and re-insert at (ord-1), clamped. Moves apply in original-index order so
    // the result is deterministic; untouched claims keep their relative order around moved ones.
    const result: unknown[] = kept.map((k) => k.row);
    let moved = 0;
    for (const e of spineEdits) {
      if (e.order == null) continue;
      const it = kept.find((k) => k.i === e.index);
      if (!it) continue; // a struck claim has no slot to move into
      const from = result.indexOf(it.row);
      if (from < 0) continue;
      result.splice(from, 1);
      const to = Math.min(Math.max(e.order - 1, 0), result.length);
      result.splice(to, 0, it.row);
      if (to !== from) moved += 1;
    }
    if (moved > 0) {
      changes += moved;
      summary.push(`spine reordered (${moved} moved)`);
    }
    spine.splice(0, spine.length, ...result);
    for (const c of edits.newClaims ?? []) {
      if (c.text.trim() === "") continue;
      // the contract's spine is `string[]` — the new claim's NOTE rides the decision record +
      // guidance (recorded below), never a sidecar field the schema would strip.
      spine.push(c.text.trim());
      changes += 1;
      summary.push(c.note ? `spine claim added — ${c.note}` : `spine claim added`);
    }

    const sections = [...(doc.sections ?? [])].map((row, i) => {
      const e = (edits.sections ?? []).find((s) => s.index === i);
      if (!e) return row;
      let touched = false;
      const next = { ...row };
      if (e.targetWords != null && e.targetWords !== row["targetWords"]) {
        next["targetWords"] = e.targetWords;
        touched = true;
        summary.push(`section ${String(row["ref"] ?? i + 1)} target words → ${e.targetWords}`);
      }
      if (e.purpose != null && e.purpose !== "" && e.purpose !== row["purpose"]) {
        next["purpose"] = e.purpose;
        touched = true;
        summary.push(`section ${String(row["ref"] ?? i + 1)} function edited`);
      }
      if (touched) changes += 1;
      return next;
    });
    // Same position semantics as the spine: `ord` is the section's 1-based target slot — pull it
    // out and re-insert, in original-index order for determinism.
    const secMoves = (edits.sections ?? []).filter((e) => e.order != null);
    if (secMoves.length > 0) {
      const tagged = sections.map((row, i) => ({ row, i })); // i = the ORIGINAL index
      let moved = 0;
      for (const e of secMoves) {
        const it = tagged.find((t) => t.i === e.index);
        if (!it) continue;
        const from = tagged.indexOf(it);
        tagged.splice(from, 1);
        const to = Math.min(Math.max((e.order ?? 1) - 1, 0), tagged.length);
        tagged.splice(to, 0, it);
        if (to !== from) moved += 1;
      }
      if (moved > 0) {
        changes += moved;
        summary.push(`sections reordered (${moved} moved)`);
      }
      sections.splice(0, sections.length, ...tagged.map((t) => t.row));
    }

    return {
      rows: { ...doc, spine, sections },
      changes,
      summary,
    };
  }

  // P1.12 — Approve-outline / the outline editor's autosave. Sections + claim rows move as ROWS;
  // a claim's `provenance` and `unverified` fields are data the edit never touches (REQ-DATA-23 —
  // a struck claim leaves the outline; a moved claim keeps its markers). `spine` is recomputed from
  // the post-edit section order (it names claim ids, never text).
  if (kind === "approve_outline" && isDoc(sidecar)) {
    const doc = sidecar as OutlineDoc;
    const sections: PlainRow[] = [...(doc.sections ?? [])].map(
      (row): PlainRow => ({
        ...row,
        claims: [...((row["claims"] as PlainRow[] | undefined) ?? [])],
      }),
    );

    // — section field edits + reorder (the same position semantics as Approve-plan).
    const secEdits = edits.sections ?? [];
    for (const e of secEdits) {
      const row = sections[e.index];
      if (!row) continue;
      let touched = false;
      if (e.targetWords != null && e.targetWords !== row["targetWords"]) {
        row["targetWords"] = e.targetWords;
        touched = true;
        summary.push(`section ${String(row["ref"] ?? e.index + 1)} target words → ${e.targetWords}`);
      }
      const fn = e.purpose;
      if (fn != null && fn !== "" && fn !== row["function"]) {
        row["function"] = fn;
        touched = true;
        summary.push(`section ${String(row["ref"] ?? e.index + 1)} function edited`);
      }
      if (e.entry != null && e.entry !== "" && e.entry !== row["entry"]) {
        row["entry"] = e.entry;
        touched = true;
        summary.push(`section ${String(row["ref"] ?? e.index + 1)} entry edited`);
      }
      if (e.exit != null && e.exit !== "" && e.exit !== row["exit"]) {
        row["exit"] = e.exit;
        touched = true;
        summary.push(`section ${String(row["ref"] ?? e.index + 1)} exit edited`);
      }
      if (touched) changes += 1;
    }
    const secMoves = secEdits.filter((e) => e.order != null);
    if (secMoves.length > 0) {
      const tagged = sections.map((row, i) => ({ row, i }));
      let moved = 0;
      for (const e of secMoves) {
        const it = tagged.find((t) => t.i === e.index);
        if (!it) continue;
        const from = tagged.indexOf(it);
        tagged.splice(from, 1);
        const to = Math.min(Math.max((e.order ?? 1) - 1, 0), tagged.length);
        tagged.splice(to, 0, it);
        if (to !== from) moved += 1;
      }
      if (moved > 0) {
        changes += moved;
        summary.push(`sections reordered (${moved} moved)`);
      }
      sections.splice(0, sections.length, ...tagged.map((t) => t.row));
    }

    // — claim rows: strike / move between sections / reorder (indices name ORIGINAL positions, so
    // removals + inserts run on tagged rows exactly like the spine reorder above).
    const claimEdits = edits.claims ?? [];
    for (const e of claimEdits) {
      if (e.note != null && e.note !== "") {
        changes += 1;
        summary.push(`claim noted — ${e.note.slice(0, 80)}`);
      }
    }
    const struck = new Set<string>();
    for (const e of claimEdits) if (e.strike === true) struck.add(`${e.section}:${e.index}`);
    const claimRows = sections.map((sec, s) =>
      ((sec["claims"] as PlainRow[] | undefined) ?? [])
        .map((row, i) => ({ row, s, i }))
        .filter((t) => !struck.has(`${t.s}:${t.i}`)),
    );
    for (const key of struck) {
      const [s, i] = key.split(":").map(Number);
      changes += 1;
      summary.push(`claim struck (section ${(s ?? 0) + 1}, row ${(i ?? 0) + 1})`);
    }
    let claimsMoved = 0;
    for (const e of claimEdits) {
      if (e.order == null && e.toSection == null) continue;
      const src = claimRows[e.section];
      const it = src?.find((t) => t.i === e.index);
      if (!src || !it) continue;
      const destS = e.toSection ?? e.section;
      const dest = claimRows[destS];
      if (!dest) continue;
      src.splice(src.indexOf(it), 1);
      const to = e.order != null ? Math.min(Math.max(e.order - 1, 0), dest.length) : dest.length;
      dest.splice(to, 0, it);
      claimsMoved += 1;
    }
    if (claimsMoved > 0) {
      changes += claimsMoved;
      summary.push(`claims moved (${claimsMoved})`);
    }
    sections.forEach((sec, s) => {
      sec["claims"] = (claimRows[s] ?? []).map((t) => t.row);
    });

    // — user-authored claims land with `user_typed` provenance (the gap-Answer path writes the
    // same row shape); the id is minted deterministically off the existing ids.
    const existingIds = new Set<string>();
    for (const sec of sections) {
      for (const c of (sec["claims"] as PlainRow[] | undefined) ?? []) {
        if (typeof c["id"] === "string") existingIds.add(c["id"] as string);
      }
    }
    let userSeq = 0;
    for (const c of edits.newClaims ?? []) {
      if (c.text.trim() === "") continue;
      let id = `u${++userSeq}`;
      while (existingIds.has(id)) id = `u${++userSeq}`;
      existingIds.add(id);
      const target = sections[c.sectionIndex ?? sections.length - 1];
      if (!target) continue;
      ((target["claims"] as PlainRow[] | undefined) ?? (target["claims"] = [] as PlainRow[]) as PlainRow[]).push({
        id,
        text: c.text.trim(),
        provenance: { kind: "user_typed" },
        unverified: false,
      });
      changes += 1;
      summary.push(c.note ? `claim added — ${c.note}` : `claim added`);
    }

    // — gap answers (the card's Answer affordance + the editor's elicit): the response lands as a
    //   `user_typed` claim in the gap's named section (else the last) and the gap resolves — it
    //   leaves the open-gaps list.
    const gaps = [...(doc.gaps ?? [])];
    for (const a of edits.gapAnswers ?? []) {
      const text = a.text.trim();
      if (text === "") continue;
      const gi = gaps.findIndex((g) => g["id"] === a.gapId);
      if (gi < 0) continue;
      const gap = gaps[gi]!;
      let id = `u${++userSeq}`;
      while (existingIds.has(id)) id = `u${++userSeq}`;
      existingIds.add(id);
      const sectionRef = gap["sectionRef"];
      const target =
        sections.find((s) => s["ref"] === sectionRef) ?? sections[sections.length - 1];
      if (!target) continue;
      ((target["claims"] as PlainRow[] | undefined) ?? (target["claims"] = [] as PlainRow[]) as PlainRow[]).push({
        id,
        text,
        provenance: { kind: "user_typed" },
        unverified: false,
      });
      gaps.splice(gi, 1);
      changes += 1;
      summary.push(`gap ${a.gapId} answered — claim added`);
    }

    // — lever edits ride `values` (thesis / venue / targetLength / protocol / voice).
    const LEVER_KEYS = ["thesis", "venue", "targetLength", "protocol", "voice"] as const;
    for (const key of LEVER_KEYS) {
      const v = edits.values?.[key];
      if (v == null || v.trim() === "") continue;
      if (key === "targetLength") {
        const n = num(v);
        if (n == null || n <= 0) continue;
        if (doc["targetLength"] !== n) {
          doc["targetLength"] = n;
          changes += 1;
          summary.push(`target length → ${n}`);
        }
      } else if (doc[key] !== v.trim()) {
        doc[key] = v.trim();
        changes += 1;
        summary.push(`${key} → ${v.trim()}`);
      }
    }

    // — the spine names claim ids in reading order: recompute from the post-edit sections.
    const spine = sections.flatMap((sec) =>
      ((sec["claims"] as PlainRow[] | undefined) ?? [])
        .map((c) => c["id"])
        .filter((id): id is string => typeof id === "string"),
    );

    return { rows: { ...doc, spine, sections, gaps }, changes, summary };
  }

  if (kind === "approve_cutlist" && isDoc(sidecar)) {
    const doc = sidecar as CutListDoc;
    const cuts = [...(doc.cuts ?? [])].map((row, i) => {
      const e = (edits.cutToggles ?? []).find((t) => t.index === i);
      if (!e || e.protect === row["protect"]) return row;
      changes += 1;
      summary.push(e.protect ? `cut ${i + 1} protected` : `cut ${i + 1} restored to the cut list`);
      return { ...row, protect: e.protect };
    });
    return { rows: { ...doc, cuts }, changes, summary };
  }

  // Kinds with no editable sidecar: the labeled `values` ARE the structured edit (scope fields, the
  // thesis pick, the apparatus budget) — recorded on the decision + composed into guidance.
  for (const [key, value] of Object.entries(edits.values ?? {})) {
    if (value.trim() === "") continue;
    changes += 1;
    summary.push(`${key} → ${value.trim()}`);
  }
  return { rows: undefined, changes, summary };
}

/**
 * Decode the card's `ed.*` form fields into `GateStructuredEdits` (the SSR form grammar — every
 * control is a named text/checkbox input; no client script required). Grammar:
 *   ed.note                          free-text edit note
 *   ed.values.<key>                    a labeled value field (stage / venue / audience / concerns /
 *                                      narrow / thesis / apparatusBudget)
 *   ed.spine.<i>.ord|strike|note       per-claim order / strike / note
 *   ed.spine.new.text / .note / .section   a claim added through the card (+ its outline section)
 *   ed.sec.<i>.ord|targetWords|purpose|entry|exit   section order / words / function / entry / exit
 *   ed.claim.<s>.<i>.ord|to|strike|note  outline claim reorder / move-to-section / strike / note
 *   ed.cut.<i>.protect                 cut-list protect toggle ("1" = keep the text)
 */
export function decodeGateEditFields(form: Readonly<Record<string, unknown>>): GateStructuredEdits {
  const get = (k: string): string | undefined => {
    const v = form[k];
    return typeof v === "string" ? v : undefined;
  };
  const values: Record<string, string> = {};
  const spine = new Map<number, { order?: number; strike?: boolean; note?: string }>();
  const sections = new Map<number, { order?: number; targetWords?: number; purpose?: string; entry?: string; exit?: string }>();
  const claims = new Map<string, { order?: number; toSection?: number; strike?: boolean; note?: string }>();
  const cuts = new Map<number, { protect?: boolean }>();
  const newClaims: NewSpineClaim[] = [];
  const gapAnswers: GapAnswerEdit[] = [];

  for (const key of Object.keys(form)) {
    if (!key.startsWith("ed.")) continue;
    if (key.startsWith("ed.values.")) {
      const v = get(key);
      if (v != null && v !== "") values[key.slice("ed.values.".length)] = v;
      continue;
    }
    const spineNew = /^ed\.spine\.new\.(text|note|section)$/.exec(key);
    if (spineNew) {
      const v = get(key);
      if (v != null && v !== "") {
        if (spineNew[1] === "text") newClaims.push({ text: v });
        else {
          const last = newClaims[newClaims.length - 1];
          if (last) {
            newClaims[newClaims.length - 1] =
              spineNew[1] === "note" ? { ...last, note: v } : { ...last, sectionIndex: num(v) };
          }
        }
      }
      continue;
    }
    const sm = /^ed\.spine\.(\d+)\.(ord|strike|note)$/.exec(key);
    if (sm) {
      const i = Number(sm[1]);
      const cur = spine.get(i) ?? {};
      const v = get(key);
      if (sm[2] === "ord" && v != null && v !== "") cur.order = num(v);
      if (sm[2] === "strike") cur.strike = v === "1" || v === "on" || v === "true";
      if (sm[2] === "note" && v != null && v !== "") cur.note = v;
      spine.set(i, cur);
      continue;
    }
    const se = /^ed\.sec\.(\d+)\.(ord|targetWords|purpose|entry|exit)$/.exec(key);
    if (se) {
      const i = Number(se[1]);
      const cur = sections.get(i) ?? {};
      const v = get(key);
      if (se[2] === "ord" && v != null && v !== "") cur.order = num(v);
      if (se[2] === "targetWords" && v != null && v !== "") cur.targetWords = num(v);
      if (se[2] === "purpose" && v != null && v !== "") cur.purpose = v;
      if (se[2] === "entry" && v != null && v !== "") cur.entry = v;
      if (se[2] === "exit" && v != null && v !== "") cur.exit = v;
      sections.set(i, cur);
      continue;
    }
    // P1.12 — a gap's Answer: `ed.gap.<gapId>` (the answer text — lands as a user_typed claim).
    const ga = /^ed\.gap\.([^.]+)$/.exec(key);
    if (ga) {
      const v = get(key);
      if (v != null && v.trim() !== "") gapAnswers.push({ gapId: ga[1]!, text: v.trim() });
      continue;
    }
    // P1.12 — an outline claim row: `ed.claim.<section>.<index>.<field>` (indices 0-based like the
    // other row grammars; `to` is the destination section index).
    const cl = /^ed\.claim\.(\d+)\.(\d+)\.(ord|to|strike|note)$/.exec(key);
    if (cl) {
      const k = `${cl[1]}:${cl[2]}`;
      const cur = claims.get(k) ?? {};
      const v = get(key);
      if (cl[3] === "ord" && v != null && v !== "") cur.order = num(v);
      if (cl[3] === "to" && v != null && v !== "") cur.toSection = num(v);
      if (cl[3] === "strike") cur.strike = v === "1" || v === "on" || v === "true";
      if (cl[3] === "note" && v != null && v !== "") cur.note = v;
      claims.set(k, cur);
      continue;
    }
    const cm = /^ed\.cut\.(\d+)\.protect$/.exec(key);
    if (cm) {
      const i = Number(cm[1]);
      const cur = cuts.get(i) ?? {};
      cur.protect = get(key) === "1" || get(key) === "on" || get(key) === "true";
      cuts.set(i, cur);
      continue;
    }
  }

  const note = get("ed.note");
  const out: {
    note?: string;
    values?: Record<string, string>;
    spine?: SpineClaimEdit[];
    newClaims?: NewSpineClaim[];
    sections?: SectionEdit[];
    claims?: ClaimEdit[];
    gapAnswers?: GapAnswerEdit[];
    cutToggles?: CutToggleEdit[];
  } = {};
  if (note != null && note.trim() !== "") out.note = note;
  if (Object.keys(values).length > 0) out.values = values;
  if (spine.size > 0) out.spine = [...spine.entries()].map(([index, e]) => ({ index, ...e }));
  if (newClaims.length > 0) out.newClaims = newClaims;
  if (sections.size > 0) out.sections = [...sections.entries()].map(([index, e]) => ({ index, ...e }));
  if (claims.size > 0)
    out.claims = [...claims.entries()].map(([k, e]) => {
      const [section, index] = k.split(":").map(Number);
      return { section: section ?? 0, index: index ?? 0, ...e };
    });
  if (gapAnswers.length > 0) out.gapAnswers = gapAnswers;
  if (cuts.size > 0)
    out.cutToggles = [...cuts.entries()].map(([index, e]) => ({ index, protect: e.protect === true }));
  return out;
}
