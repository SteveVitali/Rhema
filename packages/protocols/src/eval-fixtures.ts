// §13.5 "Evals in CI" + ticket 49 (P1.21) — the nightly golden set. The three benchmark
// projects under `fixtures/` are the document corpus; `GOLDEN_EVAL_FIXTURES` pins the registry
// the harness resolves: the three project fixtures plus one golden fixture per non-Essay
// protocol (op-ed, memo) with per-protocol assertions. Every fixture runs under every
// seeded protocol — the eval matrix is the full cross product — while `expected` pins the
// fixture's own protocol pairing (the golden row). Adding a protocol + its golden fixture is
// registry rows and one draft file; no schema change (REQ-GENRE-7).

import type { Rigor } from "@rhema/contracts";
import type { Protocol } from "./protocols.js";
import { PROTOCOL_SEEDS } from "./protocols.js";

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
    id: "golden-op-ed",
    kind: "protocol",
    protocol: "op-ed",
    title: "The city council voted on Tuesday. Its broadband maps are still wrong.",
    rigor: "standard",
    draft: { path: "_evals/golden-op-ed.md", approxWords: 290 },
    files: ["_evals/golden-op-ed.md"],
    inputs: { venue: "WaPo" },
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
    expected: {
      // §6.7 memo row: discourse off; web fetch of user data forbidden.
      phaseDefaults: { discourse: false },
      verdicts: ["ship", "rewrite", "needs data"],
      webFetchOfUserData: "forbidden",
    },
  },
];

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
