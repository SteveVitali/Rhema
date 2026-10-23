// §13.5 "Evals in CI" + ticket 49 (P1.21) — the nightly golden set. The three benchmark
// projects under `fixtures/` are the document corpus; `GOLDEN_EVAL_FIXTURES` pins the registry
// the harness resolves: the three project fixtures plus one golden fixture per non-Essay
// protocol (op-ed, memo) with per-protocol assertions. Every fixture runs under every
// seeded protocol — the eval matrix is the full cross product — while `expected` pins the
// fixture's own protocol pairing (the golden row). Adding a protocol + its golden fixture is
// registry rows and one draft file; no schema change (REQ-GENRE-7).

import type { Rigor, Severity } from "@rhema/contracts";
import type { Protocol } from "./protocols.js";
import { PROTOCOL_SEEDS } from "./protocols.js";

/**
 * The §13.5 deterministic floor subset a fixture pins — a structural mirror of
 * `@rhema/benchmark`'s `FixtureFloors` (this package cannot depend on benchmark; the gate
 * consumes the same field names). Only the fields the minimal cohort's live measurement can
 * honestly produce are declared: `schemaValid` (the run delivered valid sidecars),
 * `citedFetched` (every URL-backed cited claim was fetched — memo user-source domains excepted,
 * which the URL policy forbids by design), `attestationViolationsMax` (out-of-boundary egress
 * attempts the proxy refused), and `findingCountsBySeverity` bands (a degenerate run that spews
 * findings breaks the band). The corpus-gated fields (materialRecall, wordBudgetDelta, voice
 * bands, round-trip) stay undeclared — an unrun deterministic check never passes, so a floor is
 * only pinned where a live score exists.
 */
export interface GoldenFloors {
  readonly findingCountsBySeverity?: Partial<Record<Severity, { min?: number; max?: number }>>;
  readonly citedFetched?: boolean;
  readonly attestationViolationsMax?: number;
  readonly schemaValid?: boolean;
}

/** The committed floors the R6GLD.1 minimal cohort measured green against (GD-GOLDEN-CAP.R6). */
export const GOLDEN_LIVE_FLOORS: GoldenFloors = {
  schemaValid: true,
  citedFetched: true,
  attestationViolationsMax: 0,
  findingCountsBySeverity: {
    blocking: { min: 0, max: 4 },
    major: { min: 0, max: 10 },
    minor: { min: 0, max: 14 },
    note: { min: 0, max: 18 },
  },
};

/** A pinned golden eval input: a draft on disk plus the run shape the golden was recorded under. */
export interface GoldenEvalFixture {
  /** Stable eval-set id (`golden:<id>` in harnesses). */
  id: string;
  /** `project` = one of the benchmark essay projects under `fixtures/`; `protocol` = a
      protocol-specific golden pinned for P1.21+. */
  kind: "project" | "protocol";
  /** The protocol the golden assertions (`expected`) were recorded under. */
  protocol: Protocol["id"];
  title: string;
  rigor: Rigor;
  /** Draft location inside `packages/protocols/fixtures/` (load.ts-style root). The three
      benchmark projects carry dossier sidecars but no committed draft body, so `draft` is set
      only on the protocol goldens. */
  draft?: { path: string; approxWords: number };
  /** Fixture files that must exist on disk — the dossier sidecars for project fixtures, the
      draft for protocol goldens. */
  files: string[];
  /** Extra run facts: venue pins an outlet-table row; userSources is the memo `user_sources[]` body
      shape the api validates (`{name, text?|url?}`). */
  inputs: { venue?: string; userSources?: { name: string; text?: string; url?: string }[] };
  /** Committed deterministic floors the run's measured scores must clear (§13.5; REQ-ARCH-36 /
      REQ-EVAL-17). Only protocol goldens that dispatch live carry them — the benchmark projects'
      corpus floors live with the corpus. */
  floors?: GoldenFloors;
  /** Golden assertions for this fixture's own protocol pairing. */
  expected: {
    /** Subset of the seed's phase_defaults the run must honor (`undefined` = all on). */
    phaseDefaults?: Partial<Record<string, boolean>>;
    /** The exact calibration verdict list. */
    verdicts?: string[];
    /** Venue cap the status bar must render for the pinned venue. */
    venueCap?: { venue: string; maxWords: number };
    /** Memo: the run must carry web_fetch_of_user_data 'forbidden' (REQ-OBJ-11). */
    webFetchOfUserData?: "forbidden" | "restricted" | "allowed";
  };
}

export const GOLDEN_EVAL_FIXTURES: readonly GoldenEvalFixture[] = [
  {
    id: "constitution-of-reason",
    kind: "project",
    protocol: "essay",
    title: "The Constitution of Reason — adolescent cognition across cultures",
    rigor: "standard",
    files: [
      "constitution-of-reason/01-claim-ledger.json",
      "constitution-of-reason/response-ledger.json",
      "constitution-of-reason/structure-plan.json",
      "constitution-of-reason/cut-list.json",
    ],
    inputs: {},
    expected: { phaseDefaults: {}, verdicts: ["accept", "minor", "major", "reject"] },
  },
  {
    id: "structure-of-political-difference",
    kind: "project",
    protocol: "essay",
    title: "The Structure of Political Difference — Montaigne, Tocqueville, Bourdieu",
    rigor: "standard",
    files: [
      "structure-of-political-difference/01-claim-ledger.json",
      "structure-of-political-difference/response-ledger.json",
      "structure-of-political-difference/structure-plan.json",
      "structure-of-political-difference/cut-list.json",
    ],
    inputs: {},
    expected: { phaseDefaults: {}, verdicts: ["accept", "minor", "major", "reject"] },
  },
  {
    id: "the-politics-of-visibility",
    kind: "project",
    protocol: "essay",
    title: "The Politics of Visibility — craft, gender, the domestic sphere",
    rigor: "standard",
    files: [
      "the-politics-of-visibility/01-claim-ledger.json",
      "the-politics-of-visibility/findings.json",
      "the-politics-of-visibility/rubric.json",
      "the-politics-of-visibility/response-ledger.json",
      "the-politics-of-visibility/structure-plan.json",
      "the-politics-of-visibility/cut-list.json",
    ],
    inputs: {},
    expected: { phaseDefaults: {}, verdicts: ["accept", "minor", "major", "reject"] },
  },
  {
    // R6GLD.1 — the minimal cohort's Essay leg: the three benchmark projects carry dossier
    // sidecars but no committed draft body, so the live leg needs its own golden draft.
    id: "golden-essay",
    kind: "protocol",
    protocol: "essay",
    title: "The last phone booth",
    rigor: "standard",
    draft: { path: "_evals/golden-essay.md", approxWords: 328 },
    files: ["_evals/golden-essay.md"],
    inputs: {},
    floors: GOLDEN_LIVE_FLOORS,
    expected: {
      // §6.7 essay row: every phase on, infer stage, full line depth, publish/revise/rethink.
      phaseDefaults: {},
      verdicts: ["publish", "revise", "rethink"],
      webFetchOfUserData: "allowed",
    },
  },
  {
    // R6GLD.1 — the minimal cohort's Academic leg (P1.21 protocol 2 — the registry's missing row).
    id: "golden-academic",
    kind: "protocol",
    protocol: "academic",
    title: "Retrieval practice improves retention of procedural skills: a registered report proposal",
    rigor: "standard",
    draft: { path: "_evals/golden-academic.md", approxWords: 270 },
    files: ["_evals/golden-academic.md"],
    inputs: {},
    floors: GOLDEN_LIVE_FLOORS,
    expected: {
      // §6.7 academic row: every phase on, infer stage, referee verdict vocabulary.
      phaseDefaults: {},
      verdicts: ["accept", "minor", "major", "reject", "reject premise"],
      webFetchOfUserData: "allowed",
    },
  },
  {
    id: "golden-op-ed",
    kind: "protocol",
    protocol: "op-ed",
    title: "The city council voted on Tuesday. Its broadband maps are still wrong.",
    rigor: "standard",
    draft: { path: "_evals/golden-op-ed.md", approxWords: 290 },
    files: ["_evals/golden-op-ed.md"],
    inputs: { venue: "WaPo" },
    floors: GOLDEN_LIVE_FLOORS,
    expected: {
      // §6.7 op-ed row: every phase on, near-final read, full line depth, run/pass verdicts.
      phaseDefaults: {},
      verdicts: ["run", "pass"],
      // WaPo outlet row: 750-word cap — the status bar must render the cap + delta.
      venueCap: { venue: "WaPo", maxWords: 750 },
      webFetchOfUserData: "allowed",
    },
  },
  {
    id: "golden-memo",
    kind: "protocol",
    protocol: "memo",
    title: "Q3 renewal churn — onboarding owns the fix",
    rigor: "standard",
    draft: { path: "_evals/golden-memo.md", approxWords: 330 },
    files: ["_evals/golden-memo.md"],
    inputs: {
      // One url-bearing source (its host lands in the run's URL policy as a blocked user-source
      // domain) and one inline-text source (mounted read-only at user_sources/NN-*.md).
      userSources: [
        { name: "Q3 board metrics deck", url: "https://internal.example.com/docs/q3-board-metrics.pdf" },
        {
          name: "Support ticket export",
          text: "week 2-3 tickets cluster on the same three setup questions for mid-market accounts.",
        },
      ],
    },
    floors: GOLDEN_LIVE_FLOORS,
    expected: {
      // §6.7 memo row: discourse off; web fetch of user data forbidden.
      phaseDefaults: { discourse: false },
      verdicts: ["ship", "rewrite", "needs data"],
      webFetchOfUserData: "forbidden",
    },
  },
];

/**
 * R6GLD.1 (GD-GOLDEN-CAP.R6) — the minimal cohort: exactly one protocol golden per seeded
 * protocol, paired with its primary Review workflow at default tier (`base`) and the fixture's
 * pinned rigor (`standard`). Deterministic order = PROTOCOL_SEEDS order (essay, academic, op-ed,
 * memo). A protocol with no protocol-golden row fails loudly here — never trimmed silently.
 */
export function minimalCohort(
  fixtures: readonly GoldenEvalFixture[] = GOLDEN_EVAL_FIXTURES,
  protocols = PROTOCOL_SEEDS,
): { fixture: GoldenEvalFixture; workflow: "review"; modelTier: "base"; rigor: Rigor }[] {
  return protocols.map((p) => {
    const fixture = fixtures.find((f) => f.kind === "protocol" && f.protocol === p.id);
    if (!fixture)
      throw new Error(`minimal cohort: no protocol golden fixture for protocol "${p.id}" — never trim silently`);
    if (!fixture.draft) throw new Error(`minimal cohort: fixture "${fixture.id}" has no committed draft`);
    if (!fixture.floors) throw new Error(`minimal cohort: fixture "${fixture.id}" has no committed floors`);
    return { fixture, workflow: "review", modelTier: "base", rigor: fixture.rigor };
  });
}

export function evalFixtureById(id: string): GoldenEvalFixture | undefined {
  return GOLDEN_EVAL_FIXTURES.find((f) => f.id === id);
}

/** One row per fixture × seeded protocol (§13.5). `golden` marks the pairing the `expected`
    assertions were recorded under; every other pairing still runs (regression coverage). */
export function evalMatrix(
  fixtures: readonly GoldenEvalFixture[] = GOLDEN_EVAL_FIXTURES,
  protocols = PROTOCOL_SEEDS,
): { fixture: GoldenEvalFixture; protocol: (typeof protocols)[number]; golden: boolean }[] {
  const rows = [];
  for (const fixture of fixtures) {
    for (const protocol of protocols) {
      rows.push({ fixture, protocol, golden: fixture.protocol === protocol.id });
    }
  }
  return rows;
}
