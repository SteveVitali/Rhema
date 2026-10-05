// P1.21 — the Memo run's `user_sources[]` (REQ-WF-8 / REQ-GENRE-6; §16.4's memo-confidentiality row).
//
// The user attaches confidential source material at run creation (the api validates + freezes it into
// `inputs.user_sources`). Hydration mounts each source as a derived, read-only `user_sources/NN-name.md`
// server file (read-only; `materializeScoped` keeps them out of the input-scoped independence contexts),
// the phase prompt carries only the name→path index, and every source URL's host lands in the run's URL
// policy (`userSourceDomains`) — the hook and the proxy both deny a web fetch to it, and the proxy's
// n-gram guard diffs search queries against the source text (enforced, never advised — §12.6 posture).

/** One user-supplied source as frozen into `inputs.user_sources`. */
export interface UserSourceInput {
  readonly name: string;
  readonly text?: string;
  readonly url?: string;
}

/** A mounted user source: the derived-file path + the bytes the agent reads (never fetches). */
export interface UserSourceMount {
  readonly name: string;
  /** `user_sources/NN-<slug>.md` — the project-root path the mount + the prompt index agree on. */
  readonly path: string;
  /** the file's markdown bytes — the source text, or a "supplied by reference" stub for url-only sources. */
  readonly content: string;
}

/** Slugify a source name for the mount path (deterministic — prompt index and manifest must agree). */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "source";
}

/**
 * Normalize the frozen `inputs.user_sources` into mount files. Malformed rows are skipped (the api
 * validates at creation; a hand-built run must not crash hydration — it just mounts nothing for them).
 */
export function userSourceMounts(raw: unknown): UserSourceMount[] {
  if (!Array.isArray(raw)) return [];
  const out: UserSourceMount[] = [];
  raw.forEach((s, i) => {
    if (s == null || typeof s !== "object") return;
    const name = (s as UserSourceInput).name;
    if (typeof name !== "string" || name.trim() === "") return;
    const text = (s as UserSourceInput).text;
    const url = (s as UserSourceInput).url;
    const ordinal = String(i + 1).padStart(2, "0");
    const header = [
      `# User source: ${name.trim()}`,
      "",
      "Supplied by the user for this run. A claim verified against it takes the `verified_against_user_source` verdict.",
      "This run's URL policy forbids fetching user-supplied data — never fetch this source or its URL; cite it by name.",
    ];
    if (typeof url === "string" && url !== "") {
      header.push("", `Reference: ${url}`);
    }
    const content =
      typeof text === "string" && text !== ""
        ? `${header.join("\n")}\n\n${text}\n`
        : `${header.join("\n")}\n\n_Supplied by reference only — no text was attached._\n`;
    out.push({ name: name.trim(), path: `user_sources/${ordinal}-${slugify(name)}.md`, content });
  });
  return out;
}

/** The text the proxy n-gram guard diffs search queries against (§12.8d): every source's text, joined.
 *  Boilerplate headers are excluded — only the user-supplied content can trip `suspicious_query`. */
export function userSourceGuardText(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined;
  const texts = raw
    .map((s) => (s != null && typeof s === "object" ? (s as UserSourceInput).text : undefined))
    .filter((t): t is string => typeof t === "string" && t !== "");
  return texts.length > 0 ? texts.join("\n\n") : undefined;
}
