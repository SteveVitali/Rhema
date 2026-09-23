// @rhema/markdown — the canonical Rhema Markdown profile (research/9 §4; REQ-DATA-9d). The import normalizer
// (idempotent), the count line, the front-matter builder, and (P1.02) the shared canonical parse/stringify
// pipeline the editor's md↔PM conversion runs on. Consumed by apps/convert (import pass), apps/api
// (draft creation), apps/web (conversion preview), and @rhema/editor (the Page's document model).

export const PACKAGE_NAME = "@rhema/markdown" as const;

export { normalizeMarkdown } from "./normalize.js";
export { wordCount, detectCounts, renderCountLine } from "./counts.js";
export { assembleImportedDoc } from "./frontmatter.js";
export { CANONICAL_STRINGIFY_OPTIONS, canonicalProcessor, parseCanonical, stringifyCanonical } from "./profile.js";
export type { FrontMatterInput, ImportSource, ImportedDocument } from "./frontmatter.js";
