import { deploymentProvenanceSchema, type DeploymentProvenance } from "@rhema/contracts";

// Deploy provenance builder (REQ-ARCH-39). Every deploy records {git_sha, image_digests,
// protocols_version, rate_table_version} — validated against the contract so a malformed record
// (short sha, un-pinned :latest tag, missing protocols_version) fails the deploy rather than
// silently recording untraceable provenance.

export interface ProvenanceInputs {
  gitSha: string;
  imageDigests: Record<string, string>;
  protocolsVersion: string;
  rateTableVersion: string;
  stage: string;
  now?: Date;
}

/** Build and validate a deployment provenance record. Throws (via Zod) on any malformed field. */
export function buildDeploymentProvenance(inputs: ProvenanceInputs): DeploymentProvenance {
  const record = {
    git_sha: inputs.gitSha,
    image_digests: inputs.imageDigests,
    protocols_version: inputs.protocolsVersion,
    rate_table_version: inputs.rateTableVersion,
    stage: inputs.stage,
    deployed_at: (inputs.now ?? new Date()).toISOString(),
  };
  return deploymentProvenanceSchema.parse(record);
}
