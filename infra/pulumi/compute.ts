// Compute: the GKE Standard cluster that run-task Jobs land on (Standard, not Autopilot, because the
// input-scoped mount namespace needs CAP_SYS_ADMIN), the egress-proxy managed instance group behind an
// internal LB (the sandbox's stable egress target), the seven Cloud Run services, and the external
// HTTPS load balancer + Cloud CDN fronting web/api.
//
// Service images are placeholders here (the P0.01 posture): the deploy provenance record + the images
// job are exercised before any service ships real logic. Later deploys pin real digests.

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { type StageConfig } from "../config/stages.js";
import type { Network } from "./network.js";
import { EGRESS_PROXY_TAG, SANDBOX_TAG } from "./network.js";
import { SERVICES, type Iam, type ServiceName } from "./iam.js";

export interface ComputeArgs {
  stack: string;
  cfg: StageConfig;
  project: pulumi.Input<string>;
  region: pulumi.Input<string>;
  network: Network;
  iam: Iam;
  /** A placeholder image ref until each service ships real logic (overridden per-deploy). */
  placeholderImage: string;
}

export interface Compute {
  gke: gcp.container.Cluster;
  runTaskPool: gcp.container.NodePool;
  proxyGroup: gcp.compute.RegionInstanceGroupManager;
  services: Partial<Record<ServiceName, gcp.cloudrunv2.Service>>;
}

// Services that run on Cloud Run (everything but the two special cases: run-task on GKE, egress-proxy on
// a MIG). `web` is public; the rest are internal + LB-fronted.
const CLOUD_RUN_SERVICES: ServiceName[] = ["web", "api", "worker", "collab", "fetcher", "convert", "export"];

export function createCompute(args: ComputeArgs): Compute {
  const { stack, cfg, region, network, iam, placeholderImage } = args;
  const name = (suffix: string) => `rhema-${stack}-${suffix}`;

  // --- GKE Standard cluster for run-task (needs CAP_SYS_ADMIN — REQ-ARCH-2/36). ------------------
  const gke = new gcp.container.Cluster(name("run-task-gke"), {
    location: region,
    network: network.network.id,
    subnetwork: network.subnets["sandbox"].id,
    removeDefaultNodePool: true,
    initialNodeCount: 1,
    // Workload Identity: pods assume the run-task SA without a node-level key (REQ-ARCH-30).
    workloadIdentityConfig: { workloadPool: pulumi.interpolate`${args.project}.svc.id.goog` },
    // Private nodes with no public IPs; the sandbox subnet gives them no egress but the proxy.
    privateClusterConfig: {
      enablePrivateNodes: true,
      enablePrivateEndpoint: false,
      masterIpv4CidrBlock: "172.16.0.0/28",
    },
    deletionProtection: cfg.kind === "prod",
  });

  const runTaskPool = new gcp.container.NodePool(name("run-task-pool"), {
    cluster: gke.id,
    location: region,
    nodeCount: cfg.kind === "prod" ? 2 : 1,
    nodeConfig: {
      machineType: "e2-standard-2", // 1 vCPU / 2 GiB baseline (§12.1); Draft>8k bumps the Pod request
      serviceAccount: iam.serviceAccounts["run-task"].email,
      oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
      workloadMetadataConfig: { mode: "GKE_METADATA" },
      tags: [SANDBOX_TAG], // the no-egress firewall targets this tag
      shieldedInstanceConfig: { enableSecureBoot: true, enableIntegrityMonitoring: true },
    },
    management: { autoRepair: true, autoUpgrade: true },
  });

  // --- egress-proxy: a regional MIG on the private-app tier, the sandbox's only egress route. --------
  const proxyTemplate = new gcp.compute.InstanceTemplate(name("proxy-tmpl"), {
    machineType: "e2-small",
    tags: [EGRESS_PROXY_TAG],
    disks: [{ sourceImage: "projects/cos-cloud/global/images/family/cos-stable", boot: true, autoDelete: true }],
    networkInterfaces: [
      // No external IP: the proxy egresses via Cloud NAT; the sandbox reaches it on its internal IP.
      { subnetwork: network.subnets["private-app"].id },
    ],
    serviceAccount: {
      email: iam.serviceAccounts["egress-proxy"].email,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
    metadata: {
      // The COS image runs the egress-proxy container (real image pinned per-deploy).
      "gce-container-declaration": pulumi.interpolate`spec:\n  containers:\n  - image: ${placeholderImage}\n    name: egress-proxy\n`,
    },
  });
  const proxyHealth = new gcp.compute.HealthCheck(name("proxy-health"), {
    tcpHealthCheck: { port: 8443 },
    checkIntervalSec: 10,
    timeoutSec: 5,
  });
  const proxyGroup = new gcp.compute.RegionInstanceGroupManager(name("proxy-mig"), {
    region,
    baseInstanceName: name("proxy"),
    versions: [{ instanceTemplate: proxyTemplate.id }],
    targetSize: cfg.kind === "prod" ? 2 : 1,
    namedPorts: [{ name: "https", port: 8443 }],
    autoHealingPolicies: { healthCheck: proxyHealth.id, initialDelaySec: 60 },
  });

  // --- Cloud Run services: placeholder image, per-service SA, VPC egress to the private-app tier. ----
  const services: Partial<Record<ServiceName, gcp.cloudrunv2.Service>> = {};
  for (const svc of CLOUD_RUN_SERVICES) {
    services[svc] = new gcp.cloudrunv2.Service(name(svc), {
      location: region,
      // `web` is internet-facing; everything else is reachable only via the internal/LB path.
      ingress: svc === "web" ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
      template: {
        serviceAccount: iam.serviceAccounts[svc].email,
        scaling: { minInstanceCount: cfg.kind === "prod" ? 1 : 0, maxInstanceCount: cfg.kind === "prod" ? 10 : 2 },
        containers: [{ image: placeholderImage }],
        vpcAccess: {
          networkInterfaces: [{ network: network.network.id, subnetwork: network.subnets["private-app"].id }],
          egress: "PRIVATE_RANGES_ONLY",
        },
      },
    });
  }

  // --- External HTTPS LB + Cloud CDN fronting `web`. -------------------------------------------------
  const webNeg = new gcp.compute.RegionNetworkEndpointGroup(name("web-neg"), {
    region,
    networkEndpointType: "SERVERLESS",
    cloudRun: { service: services["web"]!.name },
  });
  const webBackend = new gcp.compute.BackendService(name("web-backend"), {
    protocol: "HTTPS",
    loadBalancingScheme: "EXTERNAL_MANAGED",
    enableCdn: true, // Cloud CDN (§13.1)
    cdnPolicy: { cacheMode: "CACHE_ALL_STATIC", clientTtl: 3600, defaultTtl: 3600 },
    backends: [{ group: webNeg.id }],
  });
  const urlMap = new gcp.compute.URLMap(name("urlmap"), { defaultService: webBackend.id });
  const cert = new gcp.compute.ManagedSslCertificate(name("cert"), {
    managed: { domains: [`${stack === "prod" ? "app" : stack}.rhema.example`] },
  });
  const httpsProxy = new gcp.compute.TargetHttpsProxy(name("https-proxy"), {
    urlMap: urlMap.id,
    sslCertificates: [cert.id],
  });
  new gcp.compute.GlobalForwardingRule(name("https-fr"), {
    target: httpsProxy.id,
    portRange: "443",
    loadBalancingScheme: "EXTERNAL_MANAGED",
  });

  // Sanity: the Cloud Run + GKE + proxy set covers every declared service exactly once.
  const covered = new Set<ServiceName>([...CLOUD_RUN_SERVICES, "run-task", "egress-proxy"]);
  for (const s of SERVICES) if (!covered.has(s)) throw new pulumi.RunError(`service ${s} has no compute placement`);

  return { gke, runTaskPool, proxyGroup, services };
}
