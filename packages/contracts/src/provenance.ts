import { z } from "zod";

// Deploy provenance (REQ-ARCH-39): every deploy records {git_sha, image_digests, protocols_version,
// rate_table_version}; every run records the digests it ran on, so any artifact traces to the exact
// harness + skill text. Schema is provisional here (the `deployments` table lands with P0.02) but
// the shape is fixed now because P0.01 owns the deploy pipeline that writes it.

/** A pinned container image digest, e.g. "sha256:abc123…". */
export const imageDigestSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, "image digest must be a sha256:<64 hex> content digest");

export const deploymentProvenanceSchema = z.object({
  /** Full 40-char git commit SHA of the deployed tree. */
  git_sha: z.string().regex(/^[a-f0-9]{40}$/, "git_sha must be a full 40-char commit sha"),
  /** Pinned digests per service image (service name -> sha256 digest). */
  image_digests: z.record(z.string(), imageDigestSchema),
  /** The versioned (skill sha, manifest, parsers/serializers) trio — REQ-SPEC-22. */
  protocols_version: z.string().min(1),
  /** The rate table the estimator/proxy priced against for this deploy. */
  rate_table_version: z.string().min(1),
  /** Deploy stage (dev | pr-<n> | prod). */
  stage: z.string().min(1),
  /** ISO-8601 timestamp the deploy record was written. */
  deployed_at: z.string().datetime(),
});

export type DeploymentProvenance = z.infer<typeof deploymentProvenanceSchema>;
