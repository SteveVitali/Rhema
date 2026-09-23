// Structured citations in the Rhema Markdown profile (§5.4; matrix row 37). A cite is `[@key]` or a
// multi-key `[@a; @b]` — in CANONICAL markdown it appears escaped as `\[@key]` (the stringifier's
// defensive `[`-before-label escape; both forms parse to the same text `[@key]`). The md→PM pass lifts
// cite-shaped text spans into `cite` atom nodes; PM→md lowers them back to text `[@k…]`, which the
// canonical stringifier re-escapes to `\[@k…]` — byte-stable in both directions, no custom mdast type.

/** One `[@key]`/`[@a; @b]` span inside a text run (a pandoc-style cite, locators not modeled at MVP). */
export interface CiteSpan {
  readonly start: number;
  readonly end: number;
  /** the parsed cite keys, e.g. `["a","b"]` for `[@a; @b]`. */
  readonly keys: string[];
  /** the literal source text, e.g. `[@a; @b]`. */
  readonly raw: string;
}

// `[@key]` / `[@a; @b]` / `[@a, ch. 2]` — a bracket starting with `@`, keys joined by `;`.
// A key is `[^\s;\],]+` — letters, digits, `_-.:/` allowed, per pandoc citekey rules.
const CITE_RE = /\[@([^\s;\],]+)((?:\s*,[^;\]]*)?)(?:\s*;\s*@([^\s;\],]+)((?:\s*,[^;\]]*)?))*\]/g;

/** Parse the inside of a `[@…]` bracket into keys (locators after `,` are folded into the key at MVP). */
function parseCiteInner(inner: string): string[] | null {
  const parts = inner.split(";");
  const keys: string[] = [];
  for (const part of parts) {
    const m = /^\s*@([^\s,\]]+)/.exec(part);
    if (!m) return null;
    const locator = part.slice(m[0].length).trim();
    // keep a locator tail (`[@key, p. 12]`) attached to its key so the serialization round-trips.
    keys.push(locator ? `${m[1]!}${locator.startsWith(",") ? locator : `, ${locator}`}` : m[1]!);
  }
  return keys.length ? keys : null;
}

/** Find every `[@key]`-shaped span in a plain-text value. Non-cite brackets (`[12]`, `[a](…)`) never match. */
export function findCiteSpans(text: string): CiteSpan[] {
  const out: CiteSpan[] = [];
  CITE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITE_RE.exec(text)) !== null) {
    const inner = text.slice(m.index + 1, m.index + m[0].length - 1);
    const keys = parseCiteInner(inner);
    if (keys) out.push({ start: m.index, end: m.index + m[0].length, keys, raw: m[0] });
  }
  return out;
}

/** The markdown source form of a cite node's keys: `[@k1; @k2]`. */
export function citeRawText(keys: readonly string[]): string {
  return `[${keys.map((k) => `@${k}`).join("; ")}]`;
}

/** Parse the raw form back to keys (used by round-trip checks + dangling-key resolution). */
export function parseCiteRaw(raw: string): string[] | null {
  if (!raw.startsWith("[@") || !raw.endsWith("]")) return null;
  return parseCiteInner(raw.slice(1, -1));
}
