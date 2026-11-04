// Source-note index (R2 §5 `source-note.ts`; REQ-CONV-5). Each `agents/{author,editor}/research/
// sources/<slug>.md` contributes an INDEX ROW `{slug, title, url?, accessed?}` — the body always
// renders raw (R2 §6); only the labelled fields are extracted for listing and for recovering
// `(reused note: slug)` / `as in <ID>` evidence in the claim converter. Both the labelled
// (`**URL:**`/`**Accessed:**`) and free-form shapes (a bare URL bullet, an "Accessed …" sentence)
// are absorbed (R2 §1 "Source notes").

/** One source note's listing row. `url`/`accessed` are absent when the note doesn't declare them. */
export interface SourceNote {
  readonly slug: string;
  /** First `# ` heading, verbatim. */
  readonly title: string;
  readonly url?: string;
  /** ISO `YYYY-MM-DD` the note declares as its access date. */
  readonly accessed?: string;
}

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

/** Extract the index row from one note's markdown. */
export function indexSourceNote(slug: string, markdown: string): SourceNote {
  const title = (/^#\s+(.*)$/m.exec(markdown)?.[1] ?? "").trim();
  const labelledUrl = /\*\*URL:\*\*\s*(https?:\/\/\S+)/i.exec(markdown)?.[1];
  const anyUrl = /\bhttps?:\/\/[^\s)·>]+/.exec(markdown)?.[0];
  const url = labelledUrl ?? anyUrl;
  const labelledAccess = /\*\*Accessed:\*\*\s*(\d{4}-\d{2}-\d{2})/i.exec(markdown)?.[1];
  const sentenceAccess = /\baccessed\b[^\n]*?(\d{4}-\d{2}-\d{2})/i.exec(markdown)?.[1];
  const accessed = labelledAccess ?? sentenceAccess;
  return {
    slug,
    title,
    ...(url !== undefined ? { url } : {}),
    ...(accessed !== undefined ? { accessed } : {}),
  };
}

/** Build the `{slug → note}` index the claim converter resolves reused-note evidence against. */
export function sourceNoteIndex(
  notes: readonly { slug: string; markdown: string }[],
): Map<string, SourceNote> {
  const idx = new Map<string, SourceNote>();
  for (const n of notes) idx.set(n.slug, indexSourceNote(n.slug, n.markdown));
  return idx;
}

/** True when the note carries an ISO date anywhere (the source-note coverage probe). */
export function noteHasIsoDate(markdown: string): boolean {
  return ISO_DATE.test(markdown);
}
