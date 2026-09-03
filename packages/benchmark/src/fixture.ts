import type { CorpusProtocol, LengthBand } from "./types.js";

// Shared fixture format (REQ-EVAL-20, in-scope item 5): the benchmark harness "lives beside `evals/` and reuses its
// scorer framework." §13.5's evals pin inputs, rigor, and expected outputs; a benchmark fixture reuses that shape and
// adds the corpus/dev-set fields the §18 program needs. The real §13.5 framework is PRIVATE + path-resolved
// (@rhema/evals; only the P0.01 marker stub is in this repo), so `BenchmarkFixture` is a COMPATIBLE-SHAPE interface,
// not yet an import of the real framework — it binds to it when the private checkout is present (D-P0.13-5). This is
// the public methodology surface (REQ-EVAL-18): the fixture SCHEMA + the scorers are publishable; the corpus CONTENT
// stays in the enclave.

export type BenchmarkRigor = "quick" | "standard" | "full_board";

/** A benchmark fixture — the pinned inputs + expected deterministic outputs for one draft, reusing §13.5's shape. */
export interface BenchmarkFixture {
  readonly id: string;
  readonly draftId: string;
  readonly protocol: CorpusProtocol;
  readonly lengthBand: LengthBand;
  readonly rigor: BenchmarkRigor;
  /** the frozen dev set flag (REQ-EVAL-1): a dev-set fixture's numbers may NEVER enter a headline table (AC6). */
  readonly isDevSet: boolean;
  /** a scorer-development-only fixture (synthetic flaws) — never publishable as a benchmark result (REQ-EVAL-1). */
  readonly scorerDevelopmentOnly?: boolean;
  /** expected deterministic scorer outputs, when the fixture pins them (§13.5 "expected outputs"). */
  readonly expected?: Readonly<Record<string, unknown>>;
}

/**
 * The frozen dev set (REQ-EVAL-1): the three real projects. They are registered as dev-set fixtures so their numbers
 * are structurally barred from any headline table (the report guard rejects a dev-set draft). The dev-set exercises
 * the machinery (the pilot wave, REQ-EVAL-5/17) but never grounds a published result.
 */
export const DEV_SET_PROJECT_KEYS = ["surveillance-essay", "methods-academic", "policy-op-ed"] as const;
export type DevSetProjectKey = (typeof DEV_SET_PROJECT_KEYS)[number];

/** Is this fixture barred from headline tables? (dev-set OR scorer-development-only — REQ-EVAL-1). */
export function isHeadlineBarred(fixture: Pick<BenchmarkFixture, "isDevSet" | "scorerDevelopmentOnly">): boolean {
  return fixture.isDevSet || fixture.scorerDevelopmentOnly === true;
}
