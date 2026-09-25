// @rhema/db — the §11 data model: Drizzle schema, forward-only SQL migrations, the RLS transaction wrapper,
// and the three-real-project seed. P0.02 owns the schema; later tickets extend by migration, never rename
// (REQ-IDE-50). Run orchestration, ledger, gate and obligation LOGIC live in their own tickets; this package
// owns only the tables, invariants, tenancy, and seed.

export * as schema from "./schema/index.js";
export { withTenant, type TenantClient } from "./rls.js";
export {
  SESSION_COOKIE_NAMES,
  resolveSessionPrincipal,
  sessionTokenFromCookieHeader,
  type SessionPrincipal,
  type SessionSqlClient,
} from "./session.js";
export {
  applyMigrations,
  readMigrations,
  type Migration,
  type MigrationDb,
  type ApplyOptions,
} from "./migrate.js";
export { agentTypesSeed, protocolsSeed } from "./seed/code-seed.js";
export { seedRealProjects } from "./seed/real-projects.js";
export {
  seedShowcaseProject,
  SHOWCASE_FIXTURE_CLAIMS,
  SHOWCASE_FIXTURE_FINDINGS,
  type ShowcaseSeedDeps,
  type ShowcaseSeedResult,
  type ShowcaseStore,
} from "./seed/showcase.js";
