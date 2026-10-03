// The ⌘K palette model (§5.12; REQ-IDE-49, REQ-CHAT-28) — PURE view-model functions shared by the
// SSR markup and the client island: sections, filtering, and the `/`-prefix structured command row.
// Cost-bearing verbs always resolve to the run sheet's GET route — the palette NEVER launches a run
// (no row carries a POST; `resolveCommand` only ever produces `sheet`/`navigate`/`disabled`).

import {
  parseCommand,
  resolveCommand,
  sheetQueryForCommand,
  VERB_TABLE,
  type CommandResolution,
  type ParsedCommand,
} from "@rhema/commands";

export type PaletteSectionKey = "run" | "goto" | "recent" | "threads" | "settings";

export interface PaletteRow {
  readonly id: string;
  readonly label: string;
  /** right-aligned hint — "≈ 1,300 cr", "next step", "1.x". */
  readonly hint?: string;
  /** true ⇒ the state function's next step, pinned first in Run (REQ-CHAT-28). */
  readonly pinned?: boolean;
  /** where Enter takes the row — a sheet GET, a navigation, or a disabled reason. */
  readonly action: CommandResolution;
}

export interface PaletteSection {
  readonly key: PaletteSectionKey;
  readonly label: string;
  readonly rows: readonly PaletteRow[];
}

/** A goto target the caller supplies (artifacts, sections, findings by number, versions). */
export interface PaletteTarget {
  readonly label: string;
  readonly path: string;
  /** filter keys — "finding v2/17" is searchable by its number too. */
  readonly keywords?: readonly string[];
}

export interface PaletteData {
  readonly projectSlug: string;
  /** §6.3's suggested action, rendered first with its estimate (REQ-CHAT-28). */
  readonly nextStep?: { readonly command: string; readonly label: string; readonly estimateCredits?: number };
  readonly goto?: readonly PaletteTarget[];
  readonly recentRuns?: readonly PaletteTarget[];
  readonly threads?: readonly PaletteTarget[];
  readonly settings?: readonly PaletteTarget[];
}

/** The structured command row the palette shows while a `/…` command is being typed (§7.2). */
export interface CommandRowModel {
  readonly raw: string;
  readonly ok: boolean;
  readonly chips: readonly string[];
  readonly error?: string;
  readonly suggestions?: readonly string[];
  /** when ok: the resolution Enter takes — the sheet route for cost-bearing verbs. */
  readonly resolution?: CommandResolution;
}

export interface PaletteModel {
  readonly mode: "browse" | "command";
  readonly sections: readonly PaletteSection[];
  readonly commandRow?: CommandRowModel;
}

const SECTION_LABELS: Record<PaletteSectionKey, string> = {
  run: "Run",
  goto: "Go to",
  recent: "Recent runs",
  threads: "Threads",
  settings: "Settings",
};

function navigateRow(id: string, t: PaletteTarget): PaletteRow {
  return { id, label: t.label, action: { kind: "navigate", path: t.path } };
}

/**
 * Build the browse-mode sections: Run = the pinned next step (with its estimate) then the MVP verbs
 * (1.x verbs listed, marked, resolving disabled); Go to / Recent runs / Threads / Settings from the
 * caller's targets.
 */
export function buildPalette(data: PaletteData): PaletteSection[] {
  const run: PaletteRow[] = [];
  if (data.nextStep) {
    const r = parseCommand(data.nextStep.command);
    const resolution = r.ok ? resolveCommand(r.command, { projectSlug: data.projectSlug }) : { kind: "disabled", reason: "The next step didn't parse." } as const;
    run.push({
      id: "next-step",
      label: data.nextStep.label,
      pinned: true,
      ...(data.nextStep.estimateCredits != null ? { hint: `≈ ${data.nextStep.estimateCredits.toLocaleString("en-US")} cr` } : {}),
      action: resolution,
    });
  }
  // UX.1 — the palette exposes ONLY launchable verbs: `phase:"one_x"` rows used to render disabled
  // with a "1.x" hint (an internal roadmap term in user-facing chrome). A verb typed by hand still
  // resolves to an honest `disabled` row via resolveCommand — the list just stops advertising it.
  for (const spec of VERB_TABLE) {
    if (spec.phase === "one_x") continue;
    run.push({
      id: `verb:${spec.verb}`,
      label: spec.label,
      action: resolveCommand(
        { verb: spec.verb, scopes: [], levers: {}, chips: [] },
        { projectSlug: data.projectSlug },
      ),
    });
  }

  const sections: PaletteSection[] = [{ key: "run", label: SECTION_LABELS.run, rows: run }];
  const groups: [PaletteSectionKey, readonly PaletteTarget[] | undefined][] = [
    ["goto", data.goto],
    ["recent", data.recentRuns],
    ["threads", data.threads],
    ["settings", data.settings],
  ];
  for (const [key, targets] of groups) {
    if (targets && targets.length > 0) {
      sections.push({ key, label: SECTION_LABELS[key], rows: targets.map((t, i) => navigateRow(`${key}:${i}`, t)) });
    }
  }
  return sections;
}

function matches(t: { label: string; keywords?: readonly string[] }, q: string): boolean {
  const needle = q.toLowerCase();
  if (t.label.toLowerCase().includes(needle)) return true;
  return (t.keywords ?? []).some((k) => k.toLowerCase().includes(needle));
}

/**
 * The palette model for a query string:
 *  - "" → browse sections;
 *  - "/…" → command mode: the structured row (chips + resolution or the correction error);
 *  - anything else → the sections filtered by substring (rows keep their sections).
 */
export function paletteModel(data: PaletteData, query: string): PaletteModel {
  const q = query.trim();
  if (q.startsWith("/")) {
    const r = parseCommand(q);
    if (r.ok) {
      return {
        mode: "command",
        sections: [],
        commandRow: {
          raw: q,
          ok: true,
          chips: r.command.chips.map((c) => c.text),
          resolution: resolveCommand(r.command, { projectSlug: data.projectSlug }),
        },
      };
    }
    return {
      mode: "command",
      sections: [],
      commandRow: {
        raw: q,
        ok: false,
        chips: [],
        error: r.error,
        ...(r.suggestions ? { suggestions: r.suggestions } : {}),
      },
    };
  }
  const sections = buildPalette(data)
    .map((s) => ({ ...s, rows: s.rows.filter((row) => !q || matches(row, q)) }))
    .filter((s) => s.rows.length > 0);
  return { mode: "browse", sections };
}

/** The command the next-step card / a surface's menu item issues — then parsed + resolved like any
 *  typed command (the four-surfaces-one-sheet invariant). */
export function commandForVerb(verb: string, scope?: string): string {
  return `/${verb}${scope ? ` @${scope}` : ""}`;
}

export { sheetQueryForCommand };
export type { ParsedCommand };
