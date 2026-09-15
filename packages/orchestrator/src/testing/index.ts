// Test-support surface: the PGlite harness + the in-memory DI bundle. Imported by app tests via
// `@rhema/orchestrator/testing` (never by production code — it pulls the PGlite devDependency).

export * from "./pg.js";
export * from "./deps.js";
