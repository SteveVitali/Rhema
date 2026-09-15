// @rhema/markdown — the canonical Rhema Markdown profile (research/9 §4; REQ-DATA-9d). The import normalizer
// (idempotent), the count line, and the front-matter builder. Consumed by apps/convert (import pass), apps/api
// (draft creation) and apps/web (conversion preview); the full ProseMirror schema + view is P1.02.

export const PACKAGE_NAME = "@rhema/markdown" as const;

export { normalizeMarkdown } from "./normalize.js";
export { wordCount, detectCounts, renderCountLine } from "./counts.js";
export { assembleImportedDoc } from "./frontmatter.js";
export type { FrontMatterInput, ImportSource, ImportedDocument } from "./frontmatter.js";
