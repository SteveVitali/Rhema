// §13.4 — the `substack` Markdown PROFILE (a canonical-markdown transform, not a separate export
// pipeline). Substack's editor paste-surface swallows html comments and has no real footnotes, so
// the profile: (1) strips html comments (covers the `rhema:figure` markers — figures are rewritten
// to their alt/caption text first by the caller, so nothing internal leaks), and (2) flattens
// `[^n]` footnotes into a trailing "## Notes" numbered list so nothing is silently dropped on
// paste. The body otherwise stays canonical.

const COMMENT_RE = /<!--[\s\S]*?-->/g;
const FN_DEF_RE = /^ {0,3}\[\^([^\]]+)\]:\s*(.*)$/;
const FN_REF_RE = /\[\^([^\]]+)\]/g;

export function substackMarkdown(markdown: string): string {
  const stripped = markdown.replace(COMMENT_RE, "");
  const lines = stripped.split("\n");

  const body: string[] = [];
  const notes = new Map<string, string>(); // label → note text (definition order)
  for (const line of lines) {
    const def = FN_DEF_RE.exec(line);
    if (def) {
      // Merge multi-line-definition leftovers conservatively: a def line claims its label; indented
      // continuation lines are left in place (rare in canonical drafts — the marker blocks don't
      // produce them) where they still read as plain paragraphs.
      notes.set(def[1]!, def[2]!.trim());
      continue;
    }
    body.push(line);
  }
  if (notes.size === 0) return body.join("\n").replace(/\n{3,}/g, "\n\n");

  const order = [...notes.keys()];
  const num = new Map(order.map((k, i) => [k, i + 1] as const));
  const rewritten = body
    .join("\n")
    .replace(FN_REF_RE, (m, label: string) => (num.has(label) ? `[${num.get(label)}]` : m));

  const list = order.map((k, i) => `${i + 1}. ${notes.get(k)}`).join("\n");
  return `${rewritten.trimEnd()}\n\n## Notes\n\n${list}\n`.replace(/\n{3,}/g, "\n\n");
}
