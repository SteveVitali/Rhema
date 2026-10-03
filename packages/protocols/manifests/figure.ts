import type { WorkflowManifest } from "../src/manifest-types.js";

// Figure (`figure`, Drafter seat) — §7.5 / §6.2 Figure row (P1.13). Linear phase order:
// data (judge — the REQ-WF-14 honesty step: classify every number's origin against the six
// provenance kinds BEFORE any spec exists; model-memory numbers are refused, the insist path
// lands `kind:"none"` + the persistent [unverified data] badge) → spec (generate — Vega-Lite
// schema-validated with ≤3 retries, Mermaid via beautiful-mermaid, GFM/HTML tables direct;
// unsupported types declined with a suggestion) → render (package — emits the render REQUEST;
// the deterministic light+dark render itself is the `figure.render` worker job, enqueued as a
// commit consequence — the canonical render is never pod- or browser-produced) → caption
// (generate — title/caption/alt ≤250/source line + the `figure.json` twin). NO Approval — the
// preview-before-insert card is the consent (§6.4 D5: proposal-producing workflows carry none).
//
// Seat/conduit (§6.2 row: Figure runs as the Drafter seat): working files live under
// `agents/author/figures/<run>/` (the seat's own namespace); the committed ASSET paths
// `assets/figures/<fig>/…` mount read for every seat (SHARED_READ) and upgrade to readwrite for
// exactly the declared paths via `declaredWritableArtifacts` — the same two-conduit shape as the
// Draft outputs. `<fig>` resolves to the server-minted `inputs.figureId` (the figures row exists
// before the run starts — a figure not yet inserted lives in the project's working figures,
// REQ-VIZ-12). The spec filename varies by kind, so all three canonical paths are declared and the
// `any_artifact_nonempty` predicate requires exactly one of them.
//
// Iterate (REQ-VIZ-9): each iterate turn is ANOTHER `figure` run on the same `figureId` with
// `inputs.priorVersion`/`inputs.request` — spec generation re-runs with the prior spec as context
// and `figure_versions` gains n+1 retaining the prior spec/data/provenance; a data change re-runs
// the honesty step, not just the spec. Type-chip edits are local spec edits at 0 credits — no run.

export const figure: WorkflowManifest = {
  workflow: "figure",
  skill: "figure",
  // `sidecar: true` — the caption phase's `figure.json` twin is what figure-delivery folds into
  // the figures row (title/caption/alt/sourceLine) and the card renders from.
  defaultInputs: { sidecar: true },
  phases: [
    {
      key: "data",
      index: 0,
      label: "Reading the data",
      skillPhase: "0",
      seat: "author",
      // The honesty step's product IS the committed asset pair: `data.csv` (the numbers exactly as
      // plotted — declared but not predicated: a diagram may carry no data file) and
      // `provenance.json` (always required — REQ-VIZ-4/5, REQ-WF-14).
      artifacts: [
        "agents/author/figures/<run>/00-data.md",
        "assets/figures/<fig>/data.csv",
        "assets/figures/<fig>/provenance.json",
      ],
      predicates: [
        "every data row's origin classified against the six provenance kinds",
        "model-memory numbers refused — the insist path lands kind:\"none\" + the [unverified data] badge",
        "cell corrections record user_typed overrides",
      ],
      sidecars: [],
      phaseClass: "judge",
      budgetShare: 0.3,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/figures/<run>/00-data.md" },
        { kind: "artifact_nonempty", artifact: "assets/figures/<fig>/provenance.json" },
      ],
    },
    {
      key: "spec",
      index: 1,
      label: "Proposing a spec",
      skillPhase: "1",
      seat: "author",
      // All three canonical spec paths declared — the kind decides which one the seat writes; the
      // any-of predicate requires exactly one. The grant covers the unused two (an unused grant
      // commits nothing).
      artifacts: [
        "agents/author/figures/<run>/01-spec-notes.md",
        "assets/figures/<fig>/spec.vl.json",
        "assets/figures/<fig>/diagram.mmd",
        "assets/figures/<fig>/table.md",
      ],
      predicates: [
        "spec written at the kind's canonical filename (spec.vl.json | diagram.mmd | table.md)",
        "Vega-Lite schema-validated — ≤3 retries with the validator's error fed back, then honest failure",
        "unsupported figure types declined with a suggestion",
      ],
      sidecars: [],
      phaseClass: "generate",
      budgetShare: 0.35,
      allowsSubagents: false,
      completionPredicates: [
        {
          kind: "any_artifact_nonempty",
          artifacts: [
            "assets/figures/<fig>/spec.vl.json",
            "assets/figures/<fig>/diagram.mmd",
            "assets/figures/<fig>/table.md",
          ],
        },
      ],
    },
    {
      key: "render",
      index: 2,
      label: "Rendering",
      skillPhase: "2",
      seat: "author",
      // The seat PACKAGES the render request (figure id + the committed spec/data/provenance paths);
      // the deterministic light+dark SVG render is the `figure.render` worker job, enqueued when
      // this step commits (§12.1) — the canonical render is never pod- or browser-produced
      // (REQ-VIZ-6/7). A `table` spec needs no render — the request marks it `none`.
      artifacts: ["agents/author/figures/<run>/02-render-request.json"],
      predicates: [
        "the render request names the figure id + the committed spec/data/provenance paths",
        "table specs are marked render:none (GFM/HTML tables need no render)",
      ],
      sidecars: [],
      phaseClass: "package",
      budgetShare: 0.05,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/figures/<run>/02-render-request.json" },
      ],
    },
    {
      key: "caption",
      index: 3,
      label: "Captioning",
      skillPhase: "3",
      seat: "author",
      // The card's text fields — title/caption/alt (≤250, REQ-VIZ-2)/sourceLine — + the
      // `figure.json` twin figure-delivery folds into the figures row.
      artifacts: ["agents/author/figures/<run>/03-caption.md"],
      predicates: [
        "title + caption + alt ≤ 250 chars + source line (all required before insert)",
        "sidecar validates",
      ],
      sidecars: ["figure.json"],
      phaseClass: "generate",
      budgetShare: 0.3,
      allowsSubagents: false,
      completionPredicates: [
        { kind: "artifact_nonempty", artifact: "agents/author/figures/<run>/03-caption.md" },
        { kind: "sidecar_validates", sidecar: "figure.json" },
      ],
    },
  ],
};
