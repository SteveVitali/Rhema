// @rhema/web — the beta's invite-gated flat web shell (React Router SSR, Hono, no client bundle). The full
// IDE shell + design system is P1.01; this is beta-only stopgap #2 (REQ-BETA-21).

export const PACKAGE_NAME = "@rhema/web" as const;

export { createWebApp } from "./server.js";
export type { WebDeps, AuthOutcome } from "./server.js";
export { apiDataSource } from "./data.js";
export type { DataSource, SessionHeaders } from "./data.js";
export { routes, matchAppRoute } from "./routes.js";
export type { AppRoute } from "./routes.js";
export { COPY, collectCopyStrings } from "./copy.js";
export { SAMPLE_DOSSIER } from "./sample-dossier.js";
export type { SampleDossier } from "./sample-dossier.js";
export { toProjectRowView } from "./state-map.js";
export { renderDocument } from "./render.js";
