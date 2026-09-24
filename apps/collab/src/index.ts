// @rhema/collab — the Hocuspocus WSS + materialization service (P1.03; §12.1's collab row).

export const PACKAGE_NAME = "@rhema/collab" as const;

export * from "./sql.js";
export * from "./env.js";
export { PAGE_FRAGMENT, pageFragment, markdownToUpdate, docToCanonicalMarkdown } from "@rhema/editor";
export * from "./auth.js";
export * from "./doc-state.js";
export * from "./restore.js";
export * from "./materialize.js";
export * from "./blocks.js";
export * from "./extension.js";
export { createCollabService, startCollabServer, type CollabService, type CollabServiceDeps } from "./server.js";
