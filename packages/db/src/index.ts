// @rhema/db — Drizzle schema, migrations, RLS wrapper (skeleton, P0.01).
// P0.01 owns only the Better Auth tables (R4) and the provisional `deployments` provenance table
// (REQ-ARCH-39). The full data model + RLS policies land in P0.02.

export * as authSchema from "./schema/auth.js";
export * as deploymentsSchema from "./schema/deployments.js";
export { withTenant } from "./rls.js";
