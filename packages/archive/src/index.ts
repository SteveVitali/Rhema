// @rhema/archive — whole-account export zip + fresh-account import (REQ-ACCT-3; §13.4). The zip is
// the account's on-disk record: every project's mirror tree minus the Editor namespace, every
// voice's full persona tree, canonical-markdown samples, the §14.5 ledger CSV, a manifest.json
// integrity index, and a state.json the importer replays under deterministic derived ids (so a
// re-import is a no-op). The emailed-link + 7-day expiry machinery lives in api/worker above this.

export { buildAccountZip, isEditorTreePath } from "./build.js";
export type { AccountZipResult } from "./build.js";
export { importAccountZip, importedId, ArchiveImportError } from "./import.js";
export type { ImportResult } from "./import.js";
export {
  ARCHIVE_ZIP_VERSION,
  projectZipDir,
  renderTreeManifestMd,
  sampleZipPath,
  voiceZipDir,
} from "./layout.js";
export type {
  ArchiveArtifactRow,
  ArchiveConnectionRow,
  ArchiveDiscoveredItemRow,
  ArchiveDraftRow,
  ArchiveFigureRow,
  ArchiveFigureVersionRow,
  ArchiveManifest,
  ArchivePersonaRow,
  ArchiveProjectRow,
  ArchiveProvenanceRow,
  ArchiveSampleRow,
  ArchiveState,
} from "./layout.js";
