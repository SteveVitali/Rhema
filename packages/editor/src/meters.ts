import { wordCount } from "@rhema/markdown";
import { markdownToDoc } from "./md-to-pm.js";
import type { PMNode } from "./schema.js";

// Status-bar meters (P1.02; §5.4, REQ-PROD-14): word count, reading time, and the venue-cap meter.
// Words count through the PM document — `textBetween` joins blocks with a space and never counts
// markdown syntax (`##`, `|`, `[^n]`) or front-matter (an atom, its value isn't doc text). The venue
// cap itself comes from the protocol's `length_norms` + the venue row — the api resolves
// `projects.venue` against the seeded protocol's `venue_bar.table` and ships only the rendered string
// (no protocol text reaches the client, REQ-ARCH-33).

/** Roughly-238-words-per-minute reading time (the standard adult estimate; minimum 1 min). */
export const WORDS_PER_MINUTE = 238;

export interface StatusMeters {
  readonly words: number;
  readonly readMin: number;
}

/** Word count + reading time — pass the live PM doc (per-keystroke meter) or canonical markdown. */
export function statusMeters(source: PMNode | string): StatusMeters {
  const doc = typeof source === "string" ? markdownToDoc(source) : source;
  const words = wordCount(doc.textBetween(0, doc.content.size, " ", " "));
  return { words, readMin: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

/** The venue-cap meter: `"+212 over WaPo"` over cap, `"388 under WaPo"` under. */
export function venueCapLabel(words: number, venue: string, maxWords: number): string {
  const delta = words - maxWords;
  return delta > 0 ? `+${delta} over ${venue}` : `${-delta} under ${venue}`;
}
