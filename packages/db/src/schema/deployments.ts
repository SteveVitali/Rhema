import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// `deployments` — deploy provenance of record (REQ-ARCH-39). Provisional until P0.02 folds it into
// the full data model, but the columns match contracts' `deploymentProvenanceSchema` so a deploy can
// write a row that round-trips through the Zod contract.

export const deployments = pgTable("deployments", {
  id: text("id").primaryKey(), // ${stage}:${git_sha}
  stage: text("stage").notNull(),
  gitSha: text("git_sha").notNull(),
  /** service name -> sha256:<digest> */
  imageDigests: jsonb("image_digests").$type<Record<string, string>>().notNull(),
  protocolsVersion: text("protocols_version").notNull(),
  rateTableVersion: text("rate_table_version").notNull(),
  deployedAt: timestamp("deployed_at").notNull().defaultNow(),
});
