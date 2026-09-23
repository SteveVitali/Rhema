import { sha256Hex } from "@rhema/contracts";
import type { QualityVerdict } from "@rhema/contracts";
import { normalizeMarkdown } from "./normalize.js";
import { detectCounts } from "./counts.js";

// The canonical Rhema Markdown front-matter (research/9 §4). A minimal, deterministic YAML emitter for the
// fixed field set — no external YAML dep, and stable output so the assembled document survives a second
// normalize pass unchanged (the front-matter is preserved verbatim as a yaml node).

export interface ImportSource {
  readonly kind: string; // upload | url | paste | substack | …
  readonly url?: string;
  readonly connection?: string | null;
  readonly external_id?: string;
  readonly original_format: string; // docx | pdf | html | md | txt
  readonly original_sha256: string;
  readonly fetched_at: string; // ISO 8601
  readonly updated_at_remote?: string;
}

export interface FrontMatterInput {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly byline?: string;
  readonly date?: string;
  readonly source: ImportSource;
  readonly quality: QualityVerdict;
  readonly qualityNotes?: readonly string[];
  readonly language?: string;
}

function yamlString(s: string): string {
  // Quote when needed; escape double-quotes. Deterministic.
  return /^[A-Za-z0-9 ._/@:+-]+$/.test(s) && !/^\s|\s$/.test(s) ? s : JSON.stringify(s);
}

function emitFrontMatter(input: FrontMatterInput, contentSha256: string, wordCount: number): string {
  const lines: string[] = ["rhema: 1", `id: ${yamlString(input.id)}`, `title: ${yamlString(input.title)}`];
  if (input.subtitle) lines.push(`subtitle: ${yamlString(input.subtitle)}`);
  if (input.byline) lines.push(`byline: ${yamlString(input.byline)}`);
  if (input.date) lines.push(`date: ${yamlString(input.date)}`);
  const s = input.source;
  lines.push("source:");
  lines.push(`  kind: ${yamlString(s.kind)}`);
  if (s.url) lines.push(`  url: ${yamlString(s.url)}`);
  lines.push(`  connection: ${s.connection == null ? "null" : yamlString(s.connection)}`);
  if (s.external_id) lines.push(`  external_id: ${yamlString(s.external_id)}`);
  lines.push(`  original_format: ${yamlString(s.original_format)}`);
  lines.push(`  original_sha256: ${yamlString(s.original_sha256)}`);
  lines.push(`  fetched_at: ${yamlString(s.fetched_at)}`);
  if (s.updated_at_remote) lines.push(`  updated_at_remote: ${yamlString(s.updated_at_remote)}`);
  lines.push(`content_sha256: ${contentSha256}`);
  lines.push(`word_count: ${wordCount}`);
  lines.push(`quality: ${input.quality}`);
  const notes = input.qualityNotes ?? [];
  lines.push(`quality_notes: [${notes.map((n) => yamlString(n)).join(", ")}]`);
  lines.push(`language: ${yamlString(input.language ?? "en")}`);
  return lines.join("\n");
}

export interface ImportedDocument {
  /** The full canonical document: `---\n<front-matter>\n---\n\n<normalized body>`. */
  readonly document: string;
  /** The normalized body (below the front-matter). */
  readonly body: string;
  /** sha256 of the normalized body. */
  readonly contentSha256: string;
  readonly wordCount: number;
}

/**
 * Assemble a canonical imported document: normalize the body, hash it, count words, and prepend the
 * front-matter. Idempotent at the body level — `normalizeMarkdown(body)` is byte-stable on a second pass.
 */
export function assembleImportedDoc(rawBody: string, meta: FrontMatterInput): ImportedDocument {
  const body = normalizeMarkdown(rawBody);
  const contentSha256 = sha256Hex(body);
  const wordCount = detectCounts(body).words;
  const fm = emitFrontMatter(meta, contentSha256, wordCount);
  const document = `---\n${fm}\n---\n\n${body}`;
  return { document, body, contentSha256, wordCount };
}
