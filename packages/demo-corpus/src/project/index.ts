// The snapshot projector (218_R7DEM.3; ADR-126): pure corpus+sidecars → lazy DTO snapshots.
// The build script (`tools/demo-corpus/project.mjs`) owns I/O; this module owns projection,
// the per-essay index, and the contract/drift harness 218a registers its kinds into.

export {
  SNAPSHOT_KINDS,
  ENVELOPE_BYTES,
  type SnapshotKind,
  type KindDtoMap,
  type SnapshotFile,
  type EssayIndex,
} from "./model.js";
export { projectVersions, type DemoVersion } from "./versions.js";
export { editorDoc, artifactPage, type ArtifactMeta } from "./dtos.js";
export { versionRail, resolveTable, pairSnapshots } from "./views.js";
export { filesTree, artifactKindFor } from "./files-tree.js";
export { projectEssay, fragmentCount, type ProjectEssayInput, type ProjectEssayResult } from "./project.js";
export { RUN_SNAPSHOT_KINDS, type RunSnapshotKind } from "./model.js";
export {
  demoAssetUri,
  demoCardFacts,
  demoTimeline,
  figureImages,
  inferRuns,
  markdownImageRefs,
  readFacts,
  registerRunKinds,
  replayedDossier,
  replayedRunCard,
  replayedRunReport,
  replayRunId,
  REPLAY_RUN_KIND,
  type DemoCardFactsInput,
  type DemoFactsFile,
  type DemoSlugFacts,
  type InferredRun,
  type ReplayContext,
} from "./replay.js";
export {
  registerSnapshotKind,
  registerDocumentKinds,
  registeredKinds,
  validateSnapshot,
  snapshotEnvelopes,
  indexViolations,
  resolveViolations,
  envelopeViolations,
  type KindValidator,
} from "./harness.js";
