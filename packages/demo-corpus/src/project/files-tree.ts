// The Files pane projection (REQ-CORPUS-9, REQ-CORPUS-4 data half): corpus artifacts →
// FileRowDto rows grouped by `browserSectionFor`, with the declared corpus-path → ArtifactKind
// map (an unmapped file is a projector error, never a silent skip). The working-fragments note
// rides `demo.fragmentsNote` from PROVENANCE's excluded "fragment" reasons.

import { artifactPolicy, browserSectionFor, type BrowserSection } from "@rhema/contracts";
import type { FileRowDto, FilesDto } from "@rhema/api-client";
import type { DemoVersion } from "./versions.js";

/** corpus-relative path → ArtifactKind. Declared exhaustively; extend as the corpus grows —
 *  a miss fails projection loud (deliverable: a missing key is a projector error). */
export function artifactKindFor(path: string): string | null {
  const name = path.split("/").pop()!;
  const round = /^correspondence\/[A-Za-z0-9-]+-review\//.test(path);
  if (round) {
    if (/^00-piece-brief\.md$/.test(name)) return "piece_brief";
    if (/^01-claim-ledger(-[A-Z])?\.md$/.test(name)) return "claim_ledger";
    if (/^02-discourse-report.*\.md$/.test(name)) return "discourse_report";
    if (/^03-argument-notes\.md$/.test(name)) return "argument_notes";
    if (/^04-craft-notes\.md$/.test(name)) return "craft_notes";
    if (/^05-second-read\.md$/.test(name)) return "second_read";
    if (/^editors-letter\.md$/.test(name)) return "editors_letter";
    return null;
  }
  if (/^correspondence\/[A-Za-z0-9-]+-response\.md$/.test(path)) return "response_letter";
  if (/^correspondence\/[A-Za-z0-9-]+-drafting-note\.md$/.test(path)) return "drafting_note";
  if (/^agents\/[^/]+\/ledgers\/[A-Za-z0-9-]+-response-ledger\.md$/.test(path))
    return "response_ledger";
  const drafting = /^agents\/[^/]+\/drafting\/[^/]+\//.test(path);
  if (drafting) {
    if (/^00-commissioning-brief\.md$/.test(name)) return "commissioning_brief";
    if (/^01-voice-brief\.md$/.test(name)) return "voice_brief";
    if (/^02-structure-plan\.md$/.test(name)) return "structure_plan";
    if (/^03-claim-ledger\.md$/.test(name)) return "claim_ledger";
    if (/^04-draft-ledger\.md$/.test(name)) return "draft_ledger";
    if (/^06-fidelity-audit\.md$/.test(name)) return "fidelity_audit";
    // the real corpus names the consolidated drafting slice literally: 05-consolidation-notes.md
    if (/^draft-part.*\.md$|^ledger-slice.*\.md$|^05-consolidation-notes\.md$/.test(name))
      return "consolidation_notes";
    return null;
  }
  if (/^agents\/[^/]+\/research\/index\.md$/.test(path)) return "research_note";
  if (/^agents\/[^/]+\/research\/.*\.md$/.test(path)) return "source_note";
  if (/^drafts\/figures\/[^/]+\.(png|jpe?g|webp|gif|svg)$/.test(path)) return "figure";
  if (/^drafts\/[^/]+\.md$/.test(path)) return "companion_doc"; // non-version draft companions
  return null;
}

const SECTION_ORDER: readonly BrowserSection[] = [
  "outline",
  "drafts",
  "rounds",
  "research",
  "voice",
  "assets",
  "advanced",
];

const label = (kind: string): string =>
  kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function row(
  artifactId: string,
  kind: string,
  opts: {
    readonly actor: "you" | "system" | "agent";
    readonly words: number | null;
    readonly createdAt: string;
    readonly draftRef?: { readonly n: number; readonly state: string };
  },
): FileRowDto {
  const policy = artifactPolicy[kind as keyof typeof artifactPolicy];
  const lock: FileRowDto["lock"] =
    opts.draftRef !== undefined
      ? opts.draftRef.state === "frozen"
        ? "immutable"
        : "editable"
      : policy.editMode === "none"
        ? "immutable"
        : policy.editMode === "guidance_only"
          ? "inspect"
          : "editable";
  return {
    artifactId,
    kind,
    label: label(kind),
    level: policy.level as FileRowDto["level"],
    editMode: policy.editMode,
    lock,
    readOnly: policy.editMode === "none",
    words: opts.words,
    createdAt: opts.createdAt,
    provenance: { actor: opts.actor },
    ...(opts.draftRef !== undefined ? { draftRef: opts.draftRef } : {}),
  };
}

/**
 * The essay's `getFiles` read. `artifacts` = index.json's markdown/image inventory minus the
 * version drafts and `published.md` (those are `draft` rows). `fragmentsNote` counts PROVENANCE
 * "working fragment" exclusions — the REQ-CORPUS-4 marker, carried on `demo`.
 */
export function filesTree(
  versions: readonly DemoVersion[],
  ctx: {
    readonly artifacts: readonly { readonly path: string; readonly kind: string }[];
    readonly words: ReadonlyMap<string, number>;
    readonly createdAt: string;
    readonly fragments: number;
  },
): FilesDto {
  const draftFiles = new Set(versions.map((v) => v.file));
  interface Mut {
    rows: FileRowDto[];
    advancedRows: FileRowDto[];
    sealedCount: number;
  }
  const sections = new Map<BrowserSection, Mut>();
  const sec = (key: BrowserSection): Mut => {
    let s = sections.get(key);
    if (s === undefined) {
      s = { rows: [], advancedRows: [], sealedCount: 0 };
      sections.set(key, s);
    }
    return s;
  };
  const put = (key: BrowserSection, r: FileRowDto, advanced: boolean) =>
    (advanced ? sec(key).advancedRows : sec(key).rows).push(r);

  for (const v of versions)
    put("drafts", row(v.draftId, "draft", {
      actor: v.origin === "human_revision" || v.origin === "imported" ? "you" : "agent",
      words: ctx.words.get(v.draftId) ?? null,
      createdAt: v.createdAt,
      draftRef: { n: v.n, state: v.state },
    }), false);

  for (const a of ctx.artifacts) {
    if (draftFiles.has(a.path)) continue;
    const kind = artifactKindFor(a.path);
    if (kind === null) throw new Error(`projector: no artifact kind for ${a.path}`);
    const policy = artifactPolicy[kind as keyof typeof artifactPolicy];
    const section = browserSectionFor(kind);
    if (section === null || policy === undefined)
      throw new Error(`projector: unlisted artifact kind ${kind} for ${a.path}`);
    if (policy.level === "H") {
      sec(section).sealedCount += 1;
      continue;
    }
    put(
      section,
      row(a.path, kind, {
        actor: "agent",
        words: a.kind === "markdown" ? (ctx.words.get(a.path) ?? null) : null,
        createdAt: ctx.createdAt,
      }),
      policy.level === "I",
    );
  }

  return {
    sections: [...sections.entries()]
      .sort((a, b) => SECTION_ORDER.indexOf(a[0]) - SECTION_ORDER.indexOf(b[0]))
      .map(([key, s]) => ({ key, ...s })),
    ...(ctx.fragments > 0
      ? { demo: { fragmentsNote: `${ctx.fragments} working fragment${ctx.fragments === 1 ? "" : "s"} not shown` } }
      : {}),
  } satisfies FilesDto;
}
