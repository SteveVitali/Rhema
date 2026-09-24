// The project voice charter's seeded/guidance split (P1.14; §9.6; REQ-WF-11's persona half).
//
// `agents/author/voice-charter.md` = a seeded block derived from the linked voice (name, byline,
// registers) + a `## Guidance` section holding the lines the user appended (the artifact kind's
// editMode is `guidance_only` — appending guidance is the ONLY user write). The adopt hatch's
// `reseed_charter` run regenerates the seeded block and carries the guidance bytes VERBATIM —
// "never touches guidance lines" is structural here, not a prompt hope: the deterministic reseed
// and the preview both build `seeded + guidance(current)` and neither can emit the guidance
// section from any other source.

/** The heading that begins the user-owned guidance section. */
export const CHARTER_GUIDANCE_HEADING = "## Guidance";

/** The charter's voice-derived seeded portion — what `reseed_charter` regenerates. */
export function renderCharterSeed(args: {
  readonly name: string | null;
  readonly byline: string | null;
  readonly registers: readonly string[] | null;
}): string {
  const regs = (args.registers ?? []).filter((r) => r.trim() !== "");
  return [
    `# Voice charter`,
    ``,
    `This project writes in the voice of ${args.name ?? "the linked voice"}${args.byline ? ` — ${args.byline}` : ""}.`,
    regs.length > 0 ? `Register: ${regs.join(", ")}.` : `Register: the voice's default.`,
    ``,
    `The voice profile guides phrasing, structure, and judgment throughout drafting. It is a`,
    `starting point, not a constraint — the outline and the draft's own logic win where they differ.`,
  ].join("\n");
}

/** Everything under the charter's `## Guidance` heading, verbatim (the bytes reseed preserves). */
export function guidanceSection(charter: string): string | null {
  const m = charter.match(/^## Guidance\b.*$/ms);
  return m ? m[0].replace(/\s+$/, "") : null;
}

/** The reseeded charter text: new seeded block + the current guidance bytes (or none). */
export function reseededCharter(args: {
  readonly name: string | null;
  readonly byline: string | null;
  readonly registers: readonly string[] | null;
  readonly currentCharter: string;
}): string {
  const guidance = guidanceSection(args.currentCharter);
  const seeded = renderCharterSeed(args);
  return guidance ? `${seeded}\n\n${guidance}\n` : `${seeded}\n`;
}

/** A minimal line diff for the adopt dialog's "shows the diff before commit" (§9.6): whole-line
 *  adds/removes in order — enough for the UI to render −/+ rows without a diff dependency. */
export function lineDiff(
  before: string,
  after: string,
): readonly { readonly kind: "same" | "removed" | "added"; readonly line: string }[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // LCS over lines — small charters make the O(n·m) table trivial.
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: { kind: "same" | "removed" | "added"; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const al = a[i]!;
    const bl = b[j]!;
    if (al === bl) {
      out.push({ kind: "same", line: al });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: "removed", line: al });
      i += 1;
    } else {
      out.push({ kind: "added", line: bl });
      j += 1;
    }
  }
  while (i < n) out.push({ kind: "removed", line: a[i++]! });
  while (j < m) out.push({ kind: "added", line: b[j++]! });
  return out;
}
