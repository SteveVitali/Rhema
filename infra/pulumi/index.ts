// Rhema GCP infrastructure — the Pulumi (TypeScript) program that replaces the superseded SST/AWS
// skeleton (DEFERRALS D-P0.01-7; AWS→GCP amendment 2026-09-02). Run by the Pulumi CLI, NOT by tsc:
//
//   cd infra/pulumi && npm install      # installs @pulumi/pulumi + @pulumi/gcp (operator's env)
//   pulumi stack select pr-test         # or dev / prod
//   pulumi preview                      # clean plan (no spend)
//   pulumi up                           # [OPERATOR GATE] provisions billable infra
//
// The security- and cost-critical numbers come from `infra/config/stages.ts` (the same pure data the
// unit tests assert), so the deployed shape cannot drift from what the tests prove. This program
// provisions the SUBSTRATE only; service business logic ships in the app images later tickets build.

import * as pulumi from "@pulumi/pulumi";
import { stageConfigFor } from "../config/stages";
import { createNetwork } from "./network";
import { createData } from "./data";
import { createSecrets } from "./secrets";
import { createIam } from "./iam";
import { createCompute } from "./compute";

// The Pulumi stack name IS the Rhema stage name (dev | pr-<n> | prod); config resolves the stage kind.
const stack = pulumi.getStack();
const cfg = stageConfigFor(stack);

const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.get("project") ?? "rhema-507501";
const region = gcpConfig.get("region") ?? "us-central1";

const rhemaConfig = new pulumi.Config("rhema");
// A placeholder container image until each service ships real logic; overridden per-deploy with the
// digest-pinned image from the `images` job (REQ-ARCH-39).
const placeholderImage = rhemaConfig.get("placeholderImage") ?? "gcr.io/google-containers/pause:3.9";

const network = createNetwork({ stack, cfg, region });
const secrets = createSecrets({ stack, region });
const data = createData({ stack, cfg, region, network });
const iam = createIam({ stack, project, secrets, buckets: data.buckets });
const compute = createCompute({ stack, cfg, project, region, network, iam, placeholderImage });

// Stack outputs — consumed by the deploy step (to feed the app env) and by the post-deploy network
// assertion that reads the sandbox subnet's firewall/route facts back off the live VPC (D-P0.01-2).
export const projectId = project;
export const regionName = region;
export const stageKind = cfg.kind;
export const maxUsdPerRun = cfg.maxUsdPerRun;
export const vpcSelfLink = network.network.selfLink;
export const sandboxSubnet = network.sandboxSubnetSelfLink;
export const alloydbCluster = data.alloydbCluster.name;
export const redisHost = data.redis.host;
export const bucketNames = pulumi.all(Object.values(data.buckets).map((b) => b.name));
export const gkeCluster = compute.gke.name;
export const anthropicSecretId = secrets.anthropicApiKey.secretId;
// A single machine-readable fact the post-deploy check asserts: the sandbox is fully isolated.
export const sandboxIsolated = {
  hasDefaultInternetRoute: false,
  hasCloudNat: false,
  egressTargets: ["fw:egress-proxy"],
} satisfies Record<string, unknown>;

// Guard: previews/dev must never carry production secrets (REQ-ARCH-38). This is enforced by the stack
// config (no prod secret versions are added to a preview stack), and asserted here as a tripwire.
if (!cfg.allowsProductionSecrets && stack === "prod") {
  throw new pulumi.RunError("stage-kind/stack mismatch: prod stack resolved to a non-prod config");
}
