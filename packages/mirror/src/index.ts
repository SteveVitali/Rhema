// @rhema/mirror — the artifact pipeline between tables and files (P0.09; §11.5 / §12.2 / §12.6). Pure and
// dependency-injected: per-seat mirror materialization, the write-back harvest, the delivery transaction
// (validation → correspondence + freeze + obligation hook → attestation), and the freeze semantics. This
// package OWNS the materialize/harvest/delivery seam every workflow crosses (ticket Notes); the orchestrator
// wires the delivery transaction into its finalize path, and nothing else writes canonical artifact storage.

export * from "./sql.js";
export * from "./content-store.js";
export * from "./content-store-gcs.js";
export * from "./mounts.js";
export * from "./manifest.js";
export * from "./materialize.js";
export * from "./harvest.js";
export * from "./persist.js";
export * from "./validation.js";
export * from "./attestation.js";
export * from "./freeze.js";
export * from "./delivery.js";
