import { artifactKindSchema, type ArtifactKind } from "@rhema/contracts";

// Path→kind map (ledger F11) for the harvester — versioned with the manifests. Maps a project-mirror
// path (conventions/project-memory.md layout, plus the persona profile layout of conventions/personas.md
// and the `.rhema/` sidecars) to its ArtifactKind (§8.2 / @rhema/contracts). The commit transaction
// classifies each written file by this map; the namespace (§11.1) is derived in parallel. Rules are
// ordered most-specific-first; the first match wins.

export type Namespace = "shared" | "agent:author" | "agent:editor" | "agent:assistant" | "persona" | "project";

interface PathRule {
  re: RegExp;
  kind: ArtifactKind;
}

/** Ordered path→kind rules (F11). The JSON structured-output twins all classify as `sidecar`. */
export const PATH_KIND_RULES: readonly PathRule[] = [
  // P1.11 (§7.1) — the Assistant's namespace, BEFORE the generic .json rule: a thread's whole bundle
  // (session transcript, brief.md, pins.json) is `chat_session` state; research source notes and
  // attachments are `source_note`; everything else under research/ (the per-burst note + ledger +
  // index.json) is `research_note`. Harvest FAILS a step on an unclassified write, so the seat's
  // writable tree must classify exhaustively.
  { re: /(^|\/)agents\/assistant\/threads\//, kind: "chat_session" },
  { re: /(^|\/)agents\/assistant\/research\/sources\//, kind: "source_note" },
  { re: /(^|\/)agents\/assistant\/research\/attachments\//, kind: "source_note" },
  { re: /(^|\/)agents\/assistant\/research\//, kind: "research_note" },
  // "Paste my notes" (§7.6) — the author seat's intake file.
  { re: /(^|\/)agents\/author\/notes\.md$/, kind: "source_note" },

  // structured-output sidecars (.rhema/*.json and any dossier .json)
  { re: /\.json$/, kind: "sidecar" },

  // shared correspondence dossier
  { re: /(^|\/)editors-letter\.md$/, kind: "editors_letter" },
  { re: /(^|\/)00-piece-brief\.md$/, kind: "piece_brief" },
  { re: /(^|\/)02-discourse-report\.md$/, kind: "discourse_report" },
  { re: /(^|\/)03-argument-notes\.md$/, kind: "argument_notes" },
  { re: /(^|\/)04-craft-notes\.md$/, kind: "craft_notes" },
  { re: /(^|\/)05-second-read\.md$/, kind: "second_read" },
  { re: /(^|\/)v\d+-response\.md$/, kind: "response_letter" },
  { re: /(^|\/)v\d+-drafting-note\.md$/, kind: "drafting_note" },

  // Drafter working dossier (agents/author/drafting/vN/…)
  { re: /(^|\/)00-commissioning-brief\.md$/, kind: "commissioning_brief" },
  { re: /(^|\/)01-voice-brief\.md$/, kind: "voice_brief" },
  { re: /(^|\/)02-structure-plan\.md$/, kind: "structure_plan" },
  { re: /(^|\/)04-draft-ledger\.md$/, kind: "draft_ledger" },
  { re: /(^|\/)05-consolidation-notes\.md$/, kind: "consolidation_notes" },
  { re: /(^|\/)06-fidelity-audit\.md$/, kind: "fidelity_audit" },
  { re: /(^|\/)v\d+-response-ledger\.md$/, kind: "response_ledger" },
  { re: /(^|\/)voice-charter\.md$/, kind: "voice_charter" },

  // claim ledger (Editor's 01- and the Drafter's grounding 03-)
  { re: /(^|\/)0[13]-claim-ledger\.md$/, kind: "claim_ledger" },

  // persona profile files
  { re: /(^|\/)PERSONA\.md$/, kind: "persona_seed" },
  { re: /(^|\/)profile\/voice-print\.md$/, kind: "voice_print" },
  { re: /(^|\/)profile\/structure-repertoire\.md$/, kind: "structure_repertoire" },
  { re: /(^|\/)profile\/lexicon\.md$/, kind: "lexicon" },
  { re: /(^|\/)profile\/exemplars\.md$/, kind: "exemplars" },
  { re: /(^|\/)profile\/positions\.md$/, kind: "positions" },
  { re: /(^|\/)profile\/continuity\.md$/, kind: "continuity" },
  { re: /(^|\/)profile\/audience-and-venue\.md$/, kind: "audience_venue" },
  { re: /(^|\/)profile\/calibration\.md$/, kind: "calibration_report" },
  { re: /(^|\/)profile\/provenance\.md$/, kind: "profile_provenance" },
  { re: /(^|\/)profile\/index\.md$/, kind: "profile_index" },
  { re: /(^|\/)profile\/register-map\.md$/, kind: "register_map" },
  { re: /(^|\/)profile\/shared-lexicon\.md$/, kind: "shared_lexicon" },
  { re: /(^|\/)profile\/corpus\/HOLDOUT-[^/]+\.md$/, kind: "holdout_note" },
  { re: /(^|\/)profile\/corpus\/[^/]+\.md$/, kind: "corpus_note" },
  // operator-supplied corpus under the persona's docs/ tree (PRB.16b F18 — `docs/**` is the seat's
  // only corpus read mount; pasted/uploaded samples persist as kind `sample` at `docs/samples/<item>.md`)
  { re: /(^|\/)docs\//, kind: "sample" },

  // research notes and drafts
  { re: /(^|\/)research\/sources\/[^/]+\.md$/, kind: "source_note" },
  { re: /(^|\/)research\/index\.md$/, kind: "research_note" },
  { re: /(^|\/)drafts\/v\d+\.md$/, kind: "draft" },
  { re: /(^|\/)outline\//, kind: "outline" },
];

function normalize(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}

/** Classify a mirror path to its ArtifactKind, or null when no rule matches (e.g. manifest.md). */
export function pathToKind(path: string): ArtifactKind | null {
  const p = normalize(path);
  for (const rule of PATH_KIND_RULES) if (rule.re.test(p)) return rule.kind;
  return null;
}

/** Derive the artifact namespace (§11.1) from its mirror path. */
export function pathToNamespace(path: string): Namespace {
  const p = normalize(path);
  if (/^agents\/editor\//.test(p)) return "agent:editor";
  if (/^agents\/author\//.test(p)) return "agent:author";
  if (/^agents\/assistant\//.test(p)) return "agent:assistant";
  if (/(^|\/)profile\//.test(p) || /(^|\/)PERSONA\.md$/.test(p) || /(^|\/)docs\//.test(p)) return "persona";
  if (/^(correspondence|drafts|assets)\//.test(p)) return "shared";
  return "project";
}

// Self-check: every rule's kind is a real ArtifactKind (fails the build fast on a typo).
for (const rule of PATH_KIND_RULES) artifactKindSchema.parse(rule.kind);
