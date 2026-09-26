// @rhema/hooks — the §12.6 seat mount tables, encoded as data (the authoritative policy input the hook
// classifies against), and the per-run policy compiler.
//
// This file OWNS the §12.6 mount layer at the tool-classification level (ticket Notes). The `agent_types`
// rows P0.02 seeds carry the coarse namespace tokens + tool set; the fine-grained per-seat path globs —
// which cannot be reduced to a namespace token (preferences.md is `shared`-adjacent yet Editor-invisible;
// the persona view is a per-seat *subset* of `profile/*.md`) — live here, keyed by seat, verbatim from the
// §12.6 seat table. `compileSeatPolicy` resolves them against a run's mount roots. The Editor↔Drafter wall
// and the persona hold-out are load-bearing here: no row below widens them (cross-cutting invariant).

import type { AgentTypeKey } from "@rhema/contracts";
import type { MountRoot, MountRule, MountSpec, Namespace, PhasePolicy, SeatPolicy, UrlPolicy } from "./types.js";
import { EMPTY_URL_POLICY } from "./types.js";

export const DEFAULT_PROJECT_ROOT = "/work/project";
export const DEFAULT_PERSONA_ROOT = "/work/personas/<id>";

/**
 * Resolve a run's mount roots (the `/work` base for each `MountRoot`) from the seat-policy inputs — the SINGLE
 * source of truth shared by the hook (which classifies reads against these roots) and the harness materializer
 * (which must WRITE the files there). Keeping them on one function makes the §12.6 boundary and the on-disk
 * layout drift-free (F3): a project entry lands where the hook expects to find it, and the SDK cwd (also
 * `roots.project`) exists. `<id>` in the persona template is substituted with the run's persona directory id.
 */
export function resolveSeatRoots(input: {
  readonly roots?: { readonly project?: string; readonly persona?: string };
  readonly personaId?: string;
}): { project: string; persona: string } {
  const personaTemplate = input.roots?.persona ?? DEFAULT_PERSONA_ROOT;
  const persona = input.personaId ? personaTemplate.replace("<id>", input.personaId) : personaTemplate;
  return { project: input.roots?.project ?? DEFAULT_PROJECT_ROOT, persona };
}

/** Shared-record project paths readable by every author-side seat (§12.6; read-only bind mounts). */
const SHARED_READ: readonly MountSpec[] = [
  { glob: "manifest.md", root: "project", mode: "read", namespace: "shared" },
  // P1.21 (REQ-WF-8/REQ-GENRE-6) — the memo run's derived user-source mounts. Read-only everywhere
  // (never in a writable glob); shared so the Editor sees the same bytes the Drafter did (a parity
  // check could not run otherwise). Independence contexts mount only input-scoped files — the hook
  // mount doesn't widen what materializeScoped writes into those contexts.
  { glob: "user_sources/**", root: "project", mode: "read", namespace: "shared" },
  { glob: "drafts/**", root: "project", mode: "read", namespace: "shared" },
  { glob: "assets/**", root: "project", mode: "read", namespace: "shared" },
  { glob: "correspondence/**", root: "project", mode: "read", namespace: "shared" },
];

/** PERSONA.md is always readable wherever a persona is mounted (§12.6). */
const PERSONA_SEED: MountSpec = {
  glob: "PERSONA.md",
  root: "persona",
  mode: "read",
  namespace: "persona:<id>",
};

/** A persona `profile/<name>.md` read mount. */
function profileRead(name: string): MountSpec {
  return { glob: `profile/${name}.md`, root: "persona", mode: "read", namespace: "persona:<id>" };
}

/**
 * The §12.6 seat mount tables, verbatim. Each seat's `project` and `persona` cells become the readable /
 * writable globs the classifier keys on. `preferences.md` is Drafter/Assistant-only (REQ-OBJ-10); the
 * Editor's persona set excludes voice-print / lexicon / exemplars (§12.6 Editor row; §12.10 row 3); the persona builder writes
 * `profile/` but the hold-out is a URL concern (see url-policy), not a mount.
 */
export const SEAT_MOUNTS: Record<AgentTypeKey, readonly MountSpec[]> = {
  author: [
    ...SHARED_READ,
    { glob: "preferences.md", root: "project", mode: "read", namespace: "shared" }, // REQ-OBJ-10 (Drafter)
    { glob: "agents/author/**", root: "project", mode: "readwrite", namespace: "agent:author" },
    PERSONA_SEED,
    profileRead("index"),
    profileRead("voice-print"),
    profileRead("structure-repertoire"),
    profileRead("lexicon"),
    profileRead("exemplars"),
    profileRead("audience-and-venue"),
    profileRead("continuity"),
  ],
  editor: [
    ...SHARED_READ,
    // NEVER preferences.md (REQ-OBJ-10); NEVER agents/author/** (the Editor↔Drafter wall).
    { glob: "agents/editor/**", root: "project", mode: "readwrite", namespace: "agent:editor" },
    PERSONA_SEED,
    profileRead("index"),
    profileRead("structure-repertoire"),
    profileRead("audience-and-venue"),
    profileRead("positions"),
    profileRead("continuity"),
    // NEVER voice-print / lexicon / exemplars (§12.6 Editor row; §12.10 row 3).
  ],
  assistant: [
    ...SHARED_READ,
    { glob: "preferences.md", root: "project", mode: "read", namespace: "shared" }, // REQ-OBJ-10 (Assistant)
    { glob: "agents/assistant/**", root: "project", mode: "readwrite", namespace: "agent:assistant" },
    // The declared Assistant↔Drafter departure, narrowed to frozen ledgers (§7.1; F19/C12): read-only.
    { glob: "agents/author/ledgers/**", root: "project", mode: "read", namespace: "agent:author" },
    // P1.12 — the outline conduit (§7.3; REQ-SPEC-15): the Assistant seat's `outline` run declares
    // `agents/author/outline/<slug>.{md,json}` outputs; this READ mount is what
    // `declaredWritableArtifacts` upgrades to readwrite for exactly the declared paths — the two-
    // conduit rule stays structural (every other agents/author/ path remains unmounted = absent).
    { glob: "agents/author/outline/**", root: "project", mode: "read", namespace: "agent:author" },
    PERSONA_SEED,
    profileRead("index"),
    profileRead("structure-repertoire"),
    profileRead("audience-and-venue"),
    profileRead("positions"),
    profileRead("continuity"),
    profileRead("exemplars"), // as Editor plus exemplars (§12.6)
  ],
  persona_builder: [
    // No project mount (§12.6). PERSONA.md read; docs/ read-only; profile/ writable.
    PERSONA_SEED,
    { glob: "docs/**", root: "persona", mode: "read", namespace: "persona:<id>" },
    { glob: "profile/**", root: "persona", mode: "readwrite", namespace: "persona:<id>" },
    // DEF.1 (F1): the phase contract writes `.rhema/phase-result.json` "beside each markdown
    // deliverable" — for the persona builder that is the persona ROOT (`profile/`'s sibling), not
    // `profile/` itself. Without it the live profile-voice seat's Write of
    // `/work/personas/<id>/.rhema/phase-result.json` was denied "write outside the seat namespace"
    // and the phase failed leg (b) despite a clean sdk success (STB.3, run 01M3DJ5V…). Persona-root
    // `.rhema/` holds only transient harness-control files (phase-result is never harvested by
    // basename); the project-side `.rhema/` stays unmounted — `.rhema/manifest.json` there is the
    // signed mount contract and must remain read-only to every seat.
    { glob: ".rhema/**", root: "persona", mode: "readwrite", namespace: "persona:<id>" },
  ],
  // The System seat (the orchestrator loop) reads tables, never a mirror (§12.6): no mounts at all.
  system: [],
};

/** Inputs to compile a run's seat policy. Everything is per-run data (REQ-ARCH-17). */
export interface CompileInput {
  readonly seat: AgentTypeKey;
  /** The persona directory id for this run (substituted for `<id>` in persona namespaces/roots). */
  readonly personaId?: string;
  /** Mount roots; defaults to the container layout `/work/project` + `/work/personas/<id>`. */
  readonly roots?: { readonly project?: string; readonly persona?: string };
  /** The seat's permitted tool tokens (from the `agent_types` row). */
  readonly tools: Iterable<string>;
  readonly urlPolicy?: UrlPolicy;
  readonly phase: PhasePolicy;
  readonly runId: string;
  /** The attributing `agent_id` (REQ-DATA-12); defaults to the seat key. */
  readonly agentLabel?: string;
  /**
   * Composite-persona voice member (§9.6, §12.6): for a Drafter running a composite persona, the single
   * member whose voice files are mounted, by `register`. Its `profile/*.md` are added under `persona:<id>`.
   */
  readonly compositeVoiceMemberFiles?: readonly string[];
  /** True only for the input-scoped holdout-calibrator subagent (§12.6). */
  readonly isCalibrator?: boolean;
  /**
   * PRB.19 (F26b) — the run's DECLARED phase-output paths granted writable for THIS run (server-computed by
   * `declaredWritableArtifacts` and carried on the run spec). Each becomes a `readwrite` project mount rule —
   * the classifier prefers a writable match over the seat's `read` glob, so `drafts/v(N+1).md` and
   * `correspondence/vN-response.md` are writable while every other shared artifact stays read-only.
   */
  readonly writableArtifacts?: readonly string[];
}

function resolveNamespace(ns: Namespace, personaId: string | undefined): Namespace {
  if (ns === "persona:<id>") {
    return personaId ? (`persona:${personaId}` as Namespace) : "persona:<id>";
  }
  return ns;
}

function baseFor(root: MountRoot, roots: { project: string; persona: string }): string {
  return root === "project" ? roots.project : roots.persona;
}

/**
 * Compile a per-run seat policy from the §12.6 seat table plus this run's roots, persona, tools, URL policy
 * and phase. The result is what the hook evaluates against; the same hook code serves every seat.
 */
export function compileSeatPolicy(input: CompileInput): SeatPolicy {
  const roots = resolveSeatRoots({ roots: input.roots, personaId: input.personaId });

  const specs: MountSpec[] = [...SEAT_MOUNTS[input.seat]];
  for (const file of input.compositeVoiceMemberFiles ?? []) {
    specs.push({ glob: file, root: "persona", mode: "read", namespace: "persona:<id>" });
  }
  // PRB.19 (F26b): the run's declared outputs mount readwrite alongside the seat's read-only shared globs —
  // `classifyPath` prefers the writable rule when both match, so the grant upgrades exactly these paths.
  for (const path of input.writableArtifacts ?? []) {
    specs.push({ glob: path, root: "project", mode: "readwrite", namespace: "shared" });
  }

  const hasPersonaMount = specs.some((s) => s.root === "persona");
  const mounts: MountRule[] = specs.map((s) => ({
    ...s,
    namespace: resolveNamespace(s.namespace, input.personaId),
    base: baseFor(s.root, roots),
  }));

  return {
    seat: input.seat,
    roots: { project: roots.project, ...(hasPersonaMount ? { persona: roots.persona } : {}) },
    mounts,
    tools: new Set(input.tools),
    urlPolicy: input.urlPolicy ?? EMPTY_URL_POLICY,
    phase: input.phase,
    runId: input.runId,
    agentLabel: input.agentLabel ?? input.seat,
    ...(input.isCalibrator ? { isCalibrator: true } : {}),
  };
}
