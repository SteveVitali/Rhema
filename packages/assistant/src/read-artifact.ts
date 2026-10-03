import { parseScopeToken, type ScopeRef } from "@rhema/commands";
import { tokenFootprint } from "./pins.js";

// Typed `read_artifact` references (§7.1; REQ-CHAT-8). The assistant's `@…` refs resolve through THIS
// typed resolver over the artifact registry — `@v3 §II`, `@review:v2`, `@outline`, `@finding:v2/17`,
// `@claim:v2/41`, `@figure:<id>`, `@voice`, `@thread`, `@asset:<id>`. Unresolvable → a typed error
// NAMING what was looked for; the default scope is section-scoped (a bare `@v3` does not drag the
// whole draft into context — it returns the section list + token footprint); `--all`/whole-document
// reads show the token footprint BEFORE the bytes move.

/** The registry seam — the api binds this to `artifacts`/`artifact_versions`/draft rows + the store. */
export interface ChatArtifactRegistry {
  /** draft vN — its path, word count, and (when `load`) the markdown text. */
  draft(version: number, load: boolean): Promise<ArtifactHandle | null>;
  /** the review dossier answering draft vN. */
  review(version: number, load: boolean): Promise<ArtifactHandle | null>;
  /** the project outline. */
  outline(load: boolean): Promise<ArtifactHandle | null>;
  /** finding ordinal N of the review of draft vM. */
  finding(ordinal: number, version: number | undefined, load: boolean): Promise<ArtifactHandle | null>;
  /** claim ordinal N of the ledger attached to draft vM's review/grounding. */
  claim(ordinal: number, version: number | undefined, load: boolean): Promise<ArtifactHandle | null>;
  /** a figure/asset by ref. */
  figure(ref: string, load: boolean): Promise<ArtifactHandle | null>;
  asset(ref: string, load: boolean): Promise<ArtifactHandle | null>;
  /** a thread's compaction brief. */
  threadBrief(ref: string | undefined, load: boolean): Promise<ArtifactHandle | null>;
  /** the project's linked voice profile (the persona's profile view). */
  voice(load: boolean): Promise<ArtifactHandle | null>;
}

export interface ArtifactHandle {
  /** the mirror path (also the display ref). */
  path: string;
  /** the artifact kind for the card badge. */
  kind: string;
  /** word count when known (footprint display). */
  words?: number;
  /** the loaded markdown/text; absent when `load:false`. */
  text?: string;
}

export type ResolvedRef =
  | { ok: true; artifact: ArtifactHandle & { text: string }; tokens: number }
  | { ok: true; footprint: { tokens: number; words?: number; path: string; hint: string } }
  | { ok: false; error: RefError };

export interface RefError {
  code: "unresolvable_ref" | "ambiguous_ref";
  /** what the resolver looked for — the error text's factual core. */
  lookedFor: string;
  detail: string;
}

/**
 * Extract a §-scoped slice of a markdown document: from the heading matching `sectionRef`
 * (roman-numeral ordinal, numbered heading, or title text) to the next heading of equal-or-higher
 * rank. Returns null when the section is absent.
 */
export function sectionSlice(markdown: string, sectionRef: string): string | null {
  const want = sectionRef.trim().replace(/^§\s*/, "");
  const lines = markdown.split("\n");
  const headings: { idx: number; level: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]!);
    if (m) headings.push({ idx: i, level: m[1]!.length, text: m[2]!.trim() });
  }
  const roman = (s: string): number | null => {
    const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    const t = s.toLowerCase();
    if (!/^[ivxlcdm]+$/.test(t)) return null;
    let n = 0;
    for (let i = 0; i < t.length; i++) {
      const v = map[t[i]!]!;
      n += i + 1 < t.length && (map[t[i + 1]!] ?? 0) > v ? -v : v;
    }
    return n;
  };
  // an ordinal ref ("§II") counts the SECTION-level headings (a lone shallowest heading is the
  // title — §I is the first real section); a text ref matches the heading text.
  const wantNum = roman(want) ?? (/^\d+$/.test(want) ? Number(want) : null);
  let target: { idx: number; level: number; text: string } | null = null;
  if (wantNum != null) {
    const levels = [...new Set(headings.map((h) => h.level))].sort((a, b) => a - b);
    const min = levels[0] ?? 1;
    const atMin = headings.filter((h) => h.level === min);
    const sectionLevel = atMin.length === 1 && levels.length > 1 ? levels[1]! : min;
    const sections = headings.filter((h) => h.level === sectionLevel);
    target = sections[wantNum - 1] ?? null;
  }
  if (!target) {
    const lower = want.toLowerCase();
    target =
      headings.find((h) => h.text.toLowerCase() === lower) ??
      headings.find((h) => h.text.toLowerCase().includes(lower)) ??
      null;
  }
  if (!target) return null;
  const end = headings.find((h) => h.idx > target!.idx && h.level <= target!.level);
  return lines.slice(target.idx, end?.idx ?? lines.length).join("\n");
}

/** List a document's top-level section headings (the footprint response's "pick a section" hint).
 *  A lone shallowest heading is the title — the section list is the next level down. */
export function sectionList(markdown: string): string[] {
  const hs: { level: number; text: string }[] = [];
  for (const line of markdown.split("\n")) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) hs.push({ level: m[1]!.length, text: m[2]!.trim() });
  }
  if (hs.length === 0) return [];
  const levels = [...new Set(hs.map((h) => h.level))].sort((a, b) => a - b);
  const min = levels[0]!;
  const atMin = hs.filter((h) => h.level === min);
  // one heading at the shallowest level = the document title; sections sit one level deeper.
  const sectionLevel = atMin.length === 1 && levels.length > 1 ? levels[1]! : min;
  return hs.filter((h) => h.level === sectionLevel).map((h) => h.text);
}

export interface ResolveOptions {
  /** `--all` — a whole-document read; the footprint is STILL returned (caller shows it first). */
  all?: boolean;
}

/**
 * Resolve one `@…` ref (the leading `@` optional). The resolver is TYPED: every miss is a `RefError`
 * naming what was looked for; whole-document refs answer with the footprint unless `all` is set (the
 * footprint rides the `ok` response so the caller shows it before the bytes land either way).
 */
export async function resolveArtifactRef(
  registry: ChatArtifactRegistry,
  raw: string,
  opts: ResolveOptions = {},
): Promise<ResolvedRef> {
  const token = raw.startsWith("@") ? raw.slice(1) : raw;
  // `@voice` — the persona profile ref the scope grammar doesn't carry (a chat-side ref, §7.1).
  if (token === "voice") {
    const h = await registry.voice(opts.all === true);
    if (!h) return err("unresolvable_ref", "@voice", "no voice is linked to this project");
    return finish(h, opts);
  }
  const ref = parseScopeToken(token);
  if (!ref) return err("unresolvable_ref", raw, "not a recognized reference form");
  return resolveRef(registry, ref, opts);
}

async function resolveRef(
  r: ChatArtifactRegistry,
  ref: ScopeRef,
  opts: ResolveOptions,
): Promise<ResolvedRef> {
  switch (ref.kind) {
    case "version": {
      const needBytes = ref.section != null || opts.all === true;
      const h = await r.draft(ref.version, needBytes);
      if (!h) return err("unresolvable_ref", `@v${ref.version}`, "no draft with that version exists");
      if (ref.section != null) {
        const sliced = sectionSlice(h.text ?? "", ref.section);
        if (sliced == null)
          return err(
            "unresolvable_ref",
            `@v${ref.version} §${ref.section}`,
            "no section with that ref in the draft",
          );
        return ok({ ...h, text: sliced, path: `${h.path} §${ref.section}` });
      }
      if (opts.all === true) return ok({ ...h, text: h.text ?? "" });
      // default scope is section-scoped: answer the footprint + the section list, not the document.
      const sections = sectionList(h.text ?? "");
      return {
        ok: true,
        footprint: {
          tokens: h.text != null ? tokenFootprint(h.text) : (h.words ?? 0) * 1.33,
          ...(h.words != null ? { words: h.words } : {}),
          path: h.path,
          hint: `whole draft — ${sections.length} section(s): ${sections.slice(0, 8).join(", ") || "none"}; pass --all to read it all`,
        },
      };
    }
    case "section":
      return err("ambiguous_ref", `@section:"${ref.ref}"`, "a section ref needs its draft — write @vN §…");
    case "review": {
      const h = await r.review(ref.version, true);
      if (!h) return err("unresolvable_ref", `@review:v${ref.version}`, "no review of that draft exists");
      return ok({ ...h, text: h.text ?? "" });
    }
    case "outline": {
      const h = await r.outline(true);
      if (!h) return err("unresolvable_ref", "@outline", "the project has no outline");
      return ok({ ...h, text: h.text ?? "" });
    }
    case "finding": {
      const h = await r.finding(ref.ordinal, ref.version, true);
      if (!h)
        return err(
          "unresolvable_ref",
          `@finding:${ref.version != null ? `v${ref.version}/` : ""}${ref.ordinal}`,
          "no finding with that ordinal exists",
        );
      return ok({ ...h, text: h.text ?? "" });
    }
    case "claim": {
      const h = await r.claim(ref.ordinal, ref.version, true);
      if (!h)
        return err(
          "unresolvable_ref",
          `@claim:${ref.version != null ? `v${ref.version}/` : ""}${ref.ordinal}`,
          "no claim with that ordinal exists",
        );
      return ok({ ...h, text: h.text ?? "" });
    }
    case "figure": {
      const h = await r.figure(ref.ref, true);
      if (!h) return err("unresolvable_ref", `@figure:${ref.ref}`, "no figure with that id exists");
      return ok({ ...h, text: h.text ?? "" });
    }
    case "asset": {
      const h = await r.asset(ref.ref, true);
      if (!h) return err("unresolvable_ref", `@asset:${ref.ref}`, "no asset with that id exists");
      return ok({ ...h, text: h.text ?? "" });
    }
    case "thread": {
      const h = await r.threadBrief(ref.ref, true);
      if (!h) return err("unresolvable_ref", `@thread${ref.ref ? `:${ref.ref}` : ""}`, "no such thread");
      return ok({ ...h, text: h.text ?? "" });
    }
    case "selection":
      return err("ambiguous_ref", "@selection", "selections resolve in the composer, not read_artifact");
    case "words":
      return err("ambiguous_ref", `@words:${ref.upto}`, "word-slices resolve on a draft ref — write @vN");
  }
}

function ok(a: ArtifactHandle & { text: string }): ResolvedRef {
  return { ok: true, artifact: a, tokens: tokenFootprint(a.text) };
}

function finish(h: ArtifactHandle, opts: ResolveOptions): ResolvedRef {
  if (h.text == null && opts.all !== true) {
    return {
      ok: true,
      footprint: {
        tokens: (h.words ?? 0) * 1.33,
        ...(h.words != null ? { words: h.words } : {}),
        path: h.path,
        hint: "pass --all to read it",
      },
    };
  }
  return ok({ ...h, text: h.text ?? "" });
}

function err(code: RefError["code"], lookedFor: string, detail: string): ResolvedRef {
  return { ok: false, error: { code, lookedFor, detail } };
}
