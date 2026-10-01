// @rhema/commands — shared types for the one §7.2 command grammar. LEAF module: pure types + pure
// functions, importable by the browser bundle, the web server, the api, and P1.11's composer without
// dragging React or server dependencies (REQ-CHAT-21; the ticket's leaf-package note).

import type { ApprovalPolicy, ModelTier, Rigor, WorkflowKey } from "@rhema/contracts";

// ---------------------------------------------------------------------------------------------------------
// Scopes (§7.2 "Scopes:"). A ScopeRef is the canonical structured form; `runs.scope` stores it, the
// palette renders it as a pill, and `serializeScope` round-trips it through the sheet's query string.
// ---------------------------------------------------------------------------------------------------------

export type ScopeKind =
  | "version" // @v3
  | "section" // @section:III · @section:"The Harms Turn" · a bare §II
  | "selection" // @selection
  | "outline" // @outline
  | "review" // @review:v2
  | "finding" // @finding:v2/17
  | "claim" // @claim:v2/41
  | "figure" // @figure:fig_x
  | "asset" // @asset:… (visualize)
  | "thread" // @thread
  | "words"; // @words:6000 — a word-range scope (the §14.3 trial's "first 6,000 words" offer)

export type ScopeRef =
  | { readonly kind: "version"; readonly version: number; readonly section?: string }
  | { readonly kind: "section"; readonly ref: string }
  | { readonly kind: "selection" }
  | { readonly kind: "outline" }
  | { readonly kind: "review"; readonly version: number }
  | { readonly kind: "finding"; readonly version?: number; readonly ordinal: number }
  | { readonly kind: "claim"; readonly version?: number; readonly ordinal: number }
  | { readonly kind: "figure"; readonly ref: string }
  | { readonly kind: "asset"; readonly ref: string }
  | { readonly kind: "thread"; readonly ref?: string }
  | { readonly kind: "words"; readonly upto: number };

// ---------------------------------------------------------------------------------------------------------
// Levers (§7.2 "Levers:"). Typed flags parse into this structured set; surfaces render them as CHIPS —
// the `--flag` spelling is accepted input, never rendered output (review 12 #11).
// ---------------------------------------------------------------------------------------------------------

/** Every lever key the grammar knows (`--<key>` on input). */
export type LeverKey =
  | "rigor"
  | "tier"
  | "stage"
  | "protocol"
  | "venue"
  | "variants"
  | "tiers"
  | "sources"
  | "strata"
  | "target"
  | "protect"
  | "until"
  | "max"
  | "budget"
  | "map"
  | "wait"
  | "auto"
  | "no-discourse"
  | "no-second-read"
  | "no-factcheck";

/** The structured lever set a parsed command carries (absent = untouched default). */
export interface CommandLevers {
  readonly rigor?: Rigor;
  /** --tier (Advanced only — model tier is a consequence of rigor, §4.3/§6.5). */
  readonly modelTier?: ModelTier;
  readonly stage?: string;
  readonly protocol?: string;
  readonly venue?: string;
  /** per-phase overrides from the --no-* flags (Advanced toggles; REQ-PROD-5). */
  readonly toggles?: Readonly<Record<string, boolean>>;
  /** --wait → wait_each · --auto → run_to_completion (canonical approval policies, §4.3). */
  readonly approvals?: ApprovalPolicy;
  /** --variants a,b (1.x — accepted by some verbs, refused by whole /draft and /revise). */
  readonly variants?: readonly string[];
  /** --tiers 1|all (factcheck). */
  readonly tiers?: string;
  /** --sources N (research). */
  readonly sources?: number;
  /** --strata academic|general|all (1.x). */
  readonly strata?: string;
  /** --target N (cut-to-length, 1.x). */
  readonly target?: number;
  /** --protect @section:IV (cut, 1.x) — serialized scope refs. */
  readonly protect?: readonly string[];
  /** --map → Map the field (research, 1.x). */
  readonly map?: boolean;
  /** --until / --max / --budget (run rounds, 1.x). */
  readonly until?: string;
  readonly max?: number;
  readonly budget?: number;
}

// ---------------------------------------------------------------------------------------------------------
// The parsed command.
// ---------------------------------------------------------------------------------------------------------

/** A display chip for one parsed element (scope pill or lever chip). `text` NEVER contains `--`. */
export interface CommandChip {
  readonly kind: "verb" | "scope" | "lever";
  readonly text: string;
}

export interface ParsedCommand {
  /** the resolved verb ("review" — canonical, alias-free). */
  readonly verb: string;
  /** the verb-table row this resolves against (absent only in a rejected parse). */
  readonly scopes: readonly ScopeRef[];
  readonly levers: CommandLevers;
  /** free text after the flags — the run's guidance (§7.2). */
  readonly guidance?: string;
  /** display chips (verb + scope pills + lever chips) — the structured row's rendered form. */
  readonly chips: readonly CommandChip[];
}

export type ParseResult =
  | { readonly ok: true; readonly command: ParsedCommand }
  | {
      readonly ok: false;
      readonly error: string;
      /** correction candidates for an unknown verb (never a silent guess — REQ-CHAT-21). */
      readonly suggestions?: readonly string[];
    };

// ---------------------------------------------------------------------------------------------------------
// Resolution (what the command DO). Four surfaces — palette, selection popover, context menu, composer
// — share this one resolver so all produce an identical run sheet (REQ-CHAT-22).
// ---------------------------------------------------------------------------------------------------------

export type CommandResolution =
  | {
      readonly kind: "sheet";
      readonly workflow: WorkflowKey;
      /** `/p/:slug/run?…` — the canonical sheet route with the parsed levers serialized in. */
      readonly path: string;
      /** the serialized levers/scopes/guidance (what the sheet GET consumes). */
      readonly query: Readonly<Record<string, string>>;
    }
  | { readonly kind: "navigate"; readonly path: string }
  | { readonly kind: "disabled"; readonly reason: string };
