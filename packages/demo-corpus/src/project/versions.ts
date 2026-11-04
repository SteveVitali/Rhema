// The 214 version metadata → the projector's `DemoVersion` model (REQ-CORPUS-12/13). Every
// corpus version is a draft; the `published` node is the final version (origin `imported`) and
// the head the demo opens to (REQ-IDE-48). Origin/state/flag derivations are declared here, never
// invented per call.

import type { VersionIndex, VersionEntry } from "../versions.js";

export interface DemoVersion {
  /** The stable draft id — the corpus version key (`v1`) or `published`. */
  readonly draftId: string;
  readonly n: number;
  readonly file: string;
  readonly label: string;
  readonly title: string | null;
  readonly subtitle: string | null;
  /** Product draft-origin vocabulary (`DRAFT_ORIGINS`), mapped by `originOf`. */
  readonly origin: string;
  readonly state: "working" | "frozen";
  readonly reviewed: boolean;
  readonly answered: boolean;
  readonly claimsPendingVerification: boolean;
  readonly createdAt: string;
  readonly frozenAt: string | null;
  readonly baseDraftId: string | null;
  readonly baseDraftN: number | null;
}

const iso = (date: string): string => `${date}T00:00:00.000Z`;

/** The declared origin mapping: the corpus record wins. `imported` is the Published node;
 *  a writer-directed version is `human_revision`; the version a response ledger produced is
 *  `response_to_review`; a version with a drafting dossier is `drafted_from_outline`; anything
 *  else an honest `human_upload`. */
function originOf(
  entry: VersionEntry,
  ctx: { readonly responseProduced: ReadonlySet<string>; readonly drafted: ReadonlySet<string> },
): string {
  if (entry.origin === "imported") return "imported";
  if (entry.writerDirected === true) return "human_revision";
  if (ctx.responseProduced.has(entry.version)) return "response_to_review";
  if (ctx.drafted.has(entry.version)) return "drafted_from_outline";
  return "human_upload";
}

/**
 * Build the essay's version model. `has(path)` answers whether a corpus file exists;
 * `exportDate` is the export manifest's recorded date (the only honest "created" stamp the
 * record carries); `published.fetched` is the imported node's own recorded date.
 */
export function projectVersions(
  versions: VersionIndex,
  opts: {
    readonly has: (corpusPath: string) => boolean;
    readonly exportDate: string;
    /** The published.md front-matter-stripped body, when a Published node exists — its H1 is the
     *  head's title (the retitle is data; RV-30). */
    readonly publishedTitle?: string | null;
  },
): DemoVersion[] {
  // A `<prev>-response` (correspondence letter or author ledger) makes THIS version the
  // response's product; a `agents/*/drafting/<v>/` dir marks the drafted versions.
  const prevOf = new Map<string, string>();
  for (let i = 0; i + 1 < versions.versions.length; i++)
    prevOf.set(versions.versions[i + 1]!.version, versions.versions[i]!.version);
  const responseProduced = new Set<string>();
  const drafted = new Set<string>();
  for (const v of versions.versions) {
    const prev = prevOf.get(v.version);
    if (
      prev !== undefined &&
      (opts.has(`correspondence/${prev}-response.md`) ||
        opts.has(`agents/author/ledgers/${prev}-response-ledger.md`) ||
        opts.has(`agents/editor/ledgers/${prev}-response-ledger.md`))
    )
      responseProduced.add(v.version);
    for (const agent of ["author", "editor"])
      if (opts.has(`agents/${agent}/drafting/${v.version}/02-structure-plan.md`)) drafted.add(v.version);
  }

  const out: DemoVersion[] = versions.versions.map((entry, i) => {
    const reviewed = opts.has(`correspondence/${entry.version}-review/`);
    const answered =
      opts.has(`correspondence/${entry.version}-response.md`) ||
      opts.has(`agents/author/ledgers/${entry.version}-response-ledger.md`) ||
      opts.has(`agents/editor/ledgers/${entry.version}-response-ledger.md`);
    const head = versions.published === null && i + 1 === versions.versions.length;
    const frozen = !head;
    return {
      draftId: entry.version,
      n: i + 1,
      file: entry.file,
      label: entry.provenanceLabel ?? entry.label,
      title: entry.title,
      subtitle: entry.subtitle,
      origin: originOf(entry, { responseProduced, drafted }),
      state: head ? "working" : "frozen",
      reviewed,
      answered,
      claimsPendingVerification: !reviewed,
      createdAt: iso(opts.exportDate),
      frozenAt: frozen ? iso(opts.exportDate) : null,
      baseDraftId: i > 0 ? versions.versions[i - 1]!.version : null,
      baseDraftN: i > 0 ? i : null,
    };
  });

  const pub = versions.published;
  if (pub !== null) {
    out.push({
      draftId: "published",
      n: out.length + 1,
      file: pub.file,
      label: pub.label, // "Published · <host> · fetched <date>" (REQ-CORPUS-12 verbatim)
      title: opts.publishedTitle ?? null,
      subtitle: null,
      origin: "imported",
      state: "working",
      reviewed: false,
      answered: false,
      claimsPendingVerification: true,
      createdAt: iso(pub.fetched),
      frozenAt: null,
      baseDraftId: out.at(-1)?.draftId ?? null,
      baseDraftN: out.length,
    });
  }
  return out;
}
