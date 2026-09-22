// Compute: the GKE Standard cluster that run-task Jobs land on (Standard, not Autopilot, because the
// input-scoped mount namespace needs CAP_SYS_ADMIN), the egress-proxy managed instance group behind an
// internal LB (the sandbox's stable egress target), the seven Cloud Run services, and the external
// HTTPS load balancer + Cloud CDN fronting web/api.
//
// Service images are placeholders here (the P0.01 posture): the deploy provenance record + the images
// job are exercised before any service ships real logic. Later deploys pin real digests.

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { type StageConfig } from "../config/stages";
import type { Network } from "./network";
import { EGRESS_PROXY_TAG, SANDBOX_TAG, GKE_MASTER_CIDR } from "./network";
import { SERVICES, type Iam, type ServiceName } from "./iam";
import { buildProxyStartupScript } from "./proxy";

export interface ComputeArgs {
  stack: string;
  cfg: StageConfig;
  project: pulumi.Input<string>;
  region: pulumi.Input<string>;
  network: Network;
  iam: Iam;
  /** A placeholder image ref until each service ships real logic (overridden per-deploy). */
  placeholderImage: string;
  /** The digest-pinned egress-proxy image the MIG runs (defaults to `placeholderImage` for a preview). */
  proxyImage?: pulumi.Input<string>;
  /** The Secret Manager secret NAME the proxy reads the provider key from (never the value). */
  anthropicKeySecret?: pulumi.Input<string>;
  /** The proxy's DATABASE_URL (a Pulumi secret config, not committed) for the RunContextResolver. */
  proxyDatabaseUrl?: pulumi.Input<string>;
}

export interface Compute {
  gke: gcp.container.Cluster;
  runTaskPool: gcp.container.NodePool;
  proxyGroup?: gcp.compute.RegionInstanceGroupManager;
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
    // VPC-native (alias IPs) is a hard prerequisite of both private nodes AND Dataplane V2 below. An empty
    // policy tells GKE to auto-allocate the pod/service secondary ranges — making the requirement EXPLICIT
    // and preview-stable rather than relying on the API's implicit default (independent-review follow-up).
    ipAllocationPolicy: {},
    // Private nodes with no public IPs; the sandbox subnet gives them no egress but the proxy.
    privateClusterConfig: {
      enablePrivateNodes: true,
      enablePrivateEndpoint: false,
      masterIpv4CidrBlock: GKE_MASTER_CIDR,
    },
    // Dataplane V2 (eBPF/Cilium) — the NetworkPolicy dataplane. It ENFORCES the `runs`-namespace NetworkPolicy
    // that locks pod egress to the proxy + kube-dns (infra/k8s; D-P0.15c-8), so the "sandbox egresses only to
    // the proxy" guarantee holds at the POD layer (the subnet firewall now also permits node→Google-API egress,
    // which is the wrong layer to enforce the pod guarantee). Includes NetworkPolicy natively — no addon.
    datapathProvider: "ADVANCED_DATAPATH",
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
  // GCP discontinued the COS `gce-container-declaration` container-on-VM path (the InstanceTemplate create
  // 400s). This is the SUPPORTED re-platform (D-P0.15c-7): a COS MIG whose instance runs the digest-pinned
  // proxy image via a startup-script `docker run`, pulling the image from Artifact Registry with the instance
  // SA and taking DATABASE_URL / ANTHROPIC_KEY_SECRET / PORT from instance metadata. Enabled by default now
  // (`rhema:deployProxyMig` defaults true) so a plain `pulumi up` stands the proxy up; set it false to run the
  // proxy out-of-band. The firewall's allow-to-proxy-tier rule (network.ts) is independent of this MIG.
  const deployProxyMig = new pulumi.Config("rhema").getBoolean("deployProxyMig") ?? true;
  const proxyPort = "8443";
  let proxyGroup: gcp.compute.RegionInstanceGroupManager | undefined;
  if (deployProxyMig) {
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
        // A supported startup-script runs the container (the discontinued container-declaration is gone). The
        // script reads the image + config from these metadata attributes at boot — no secret is baked into the
        // template (DATABASE_URL comes from a Pulumi secret config; the key is fetched by the proxy from SM).
        "startup-script": buildProxyStartupScript(),
        "proxy-image": args.proxyImage ?? placeholderImage,
        "anthropic-key-secret": args.anthropicKeySecret ?? "",
        "database-url": args.proxyDatabaseUrl ?? "",
        "proxy-port": proxyPort,
      },
    });
    const proxyHealth = new gcp.compute.HealthCheck(name("proxy-health"), {
      tcpHealthCheck: { port: Number(proxyPort) },
      checkIntervalSec: 10,
      timeoutSec: 5,
    });
    proxyGroup = new gcp.compute.RegionInstanceGroupManager(name("proxy-mig"), {
      region,
      baseInstanceName: name("proxy"),
      versions: [{ instanceTemplate: proxyTemplate.id }],
      targetSize: cfg.kind === "prod" ? 2 : 1,
      namedPorts: [{ name: "https", port: Number(proxyPort) }],
      autoHealingPolicies: { healthCheck: proxyHealth.id, initialDelaySec: 60 },
    });
  }

  // --- Cloud Run services: placeholder image, per-service SA, VPC egress to the private-app tier. ----
  const services: Partial<Record<ServiceName, gcp.cloudrunv2.Service>> = {};
  for (const svc of CLOUD_RUN_SERVICES) {
    services[svc] = new gcp.cloudrunv2.Service(name(svc), {
      location: region,
      // Cloud Run v2 defaults deletionProtection=true, which BLOCKS a `pulumi destroy` of a dev/preview stack
      // (surfaced live 2026-09-04 — the teardown errored on all 7 services). Match the AlloyDB/GKE policy: only
      // prod is protected, so a dev/preview stack tears down cleanly to honor the cost-conscious mandate.
      deletionProtection: cfg.kind === "prod",
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
    cdnPolicy: {
      cacheMode: "CACHE_ALL_STATIC",
      clientTtl: 3600,
      defaultTtl: 3600,
      maxTtl: 86400,
      // The cache key: host + protocol + full query string (the default web-asset keying).
      cacheKeyPolicy: { includeHost: true, includeProtocol: true, includeQueryString: true },
    },
    backends: [{ group: webNeg.id }],
  });
  const urlMap = new gcp.compute.URLMap(name("urlmap"), { defaultService: webBackend.id });
  // Google-managed cert domain. NOTE: `.example` is a reserved TLD GCP rejects at create ("Invalid
  // domain name") — the offline typecheck can't catch this (it validates only at create). We use a
  // real-format placeholder TLD so the cert resource (and the HTTPS proxy/forwarding rule that depend on
  // it) create cleanly and the full stack stands up. In dev the managed cert never reaches ACTIVE without
  // DNS ownership — the external web TLS frontend is not on the Phase-0 exit-criteria path (the live run
  // flows through api/worker/proxy/GKE), so a non-validating dev cert is acceptable. prod supplies a real
  // owned domain out-of-band before go-live.
  const cert = new gcp.compute.ManagedSslCertificate(name("cert"), {
    managed: { domains: [`${stack === "prod" ? "app" : stack}.rhema.dev`] },
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
