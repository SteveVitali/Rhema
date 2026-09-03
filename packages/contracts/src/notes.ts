import { z } from "zod";
import { boundedText } from "./events.js";

// notes.ts — the ONLY source of `agent.note` text (REQ-ARCH-14). The event mapper (P0.06) renders an
// `agent.note` from tool activity by choosing a template here and passing STRUCTURED params (counts, kinds,
// short controlled labels) — never raw model output or page text. Because the text is assembled from a fixed
// template plus a whitelist of structured params, injected page content can never reach the user's screen
// through the feed. Every rendered note is bounded ≤ 280 chars (REQ-DATA-37); the contract test proves it.

/** A short, controlled label param (e.g. a phase or seat name). Bounded and single-line; NOT free model text. */
const label = z
  .string()
  .max(40)
  .regex(/^[\w .:'/–-]*$/, "note label must be a short controlled token");
const count = z.number().int().nonnegative();

/**
 * The template registry. Each entry declares a zod schema for its params and a pure `render` that returns a
 * bounded string. `render` may reference only its typed params — never an arbitrary string field.
 */
export const NOTE_TEMPLATES = {
  checking_claims: {
    params: z.object({ n: count }),
    render: (p: { n: number }) => `Checking ${p.n} claim${p.n === 1 ? "" : "s"}`,
  },
  claims_progress: {
    params: z.object({ checked: count, of: count, verified: count }),
    render: (p: { checked: number; of: number; verified: number }) =>
      `Checked ${p.checked} of ${p.of} claims · ${p.verified} verified`,
  },
  reading_sources: {
    params: z.object({ n: count }),
    render: (p: { n: number }) => `Read ${p.n} source${p.n === 1 ? "" : "s"} so far`,
  },
  running_phase: {
    params: z.object({ phase: label, ordinal: count, of: count }),
    render: (p: { phase: string; ordinal: number; of: number }) =>
      `Running ${p.phase} (${p.ordinal} of ${p.of})`,
  },
  second_read_started: {
    params: z.object({}),
    render: () => `Running an independent second read`,
  },
  drafting_section: {
    params: z.object({ section: label, words: count, budget: count }),
    render: (p: { section: string; words: number; budget: number }) =>
      `Drafting ${p.section} — ${p.words} of ~${p.budget} words`,
  },
  findings_emitted: {
    params: z.object({ n: count, blocking: count, major: count }),
    render: (p: { n: number; blocking: number; major: number }) =>
      `${p.n} findings so far · ${p.blocking} blocking · ${p.major} major`,
  },
  boundary_clean: {
    params: z.object({ paths: count, denied: count }),
    render: (p: { paths: number; denied: number }) =>
      `Read ${p.paths} paths, ${p.denied} denied — boundary held`,
  },
  fetching: {
    params: z.object({ domain: label }),
    render: (p: { domain: string }) => `Fetching from ${p.domain}`,
  },
} as const;

export type NoteTemplateId = keyof typeof NOTE_TEMPLATES;
export const NOTE_TEMPLATE_IDS = Object.keys(NOTE_TEMPLATES) as NoteTemplateId[];

/**
 * Render an `agent.note`'s text from a template id and structured params. Validates the params against the
 * template's schema (rejecting anything not in the whitelist) and bounds the output. Returns `{template, text}`
 * — exactly the `agent.note` payload shape.
 */
export function renderNote<K extends NoteTemplateId>(
  id: K,
  params: z.infer<(typeof NOTE_TEMPLATES)[K]["params"]>,
): { template: K; text: string } {
  const t = NOTE_TEMPLATES[id];
  const parsed = t.params.parse(params) as never;
  const text = boundedText.parse((t.render as (p: never) => string)(parsed));
  return { template: id, text };
}
