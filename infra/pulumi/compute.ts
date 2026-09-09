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
  // The always-on worker's dynamic env (D-P0.08-1). All optional so `pulumi preview` stays clean with empty
  // defaults; the operator sets them (Pulumi config) before the `dev` deploy. The CONSTANT worker env
  // (K8S_NAMESPACE, KUBE_SERVICE_ACCOUNT) + the derivable ones (run SA, sandbox node pool) are set in-program.
  /** the worker's RLS-enforced tenant connection (a Pulumi secret config). */
  workerDatabaseUrl?: pulumi.Input<string>;
  /** the worker's elevated system-scoped connection for cross-tenant sweeps (a Pulumi secret config). */
  workerSystemDatabaseUrl?: pulumi.Input<string>;
  /** the worker's Memorystore Redis URL (a Pulumi secret config). */
  workerRedisUrl?: pulumi.Input<string>;
  /** the digest-pinned run-task image the worker launches as the two-uid GKE Job. */
  runTaskImageDigest?: pulumi.Input<string>;
  /** the api's internal URL the worker + pod reach (`API_INTERNAL_URL`). */
  internalApiUrl?: pulumi.Input<string>;
  /** the egress-proxy base URL the Job's sandbox uses (`ANTHROPIC_BASE_URL`). */
  proxyBaseUrl?: pulumi.Input<string>;
  /** the GCS artifacts bucket the run-task harness materializes `/work` from (`OBJECTS_BUCKET`). */
  objectsBucket?: pulumi.Input<string>;
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
    // Non-prod pins node zones to avoid a single-zone GCE stockout wedging the whole regional create (a live
    // us-central1-f e2 stockout ERROR'd the cluster in P0.15f Stage B). prod stays fully multi-zone (regional HA).
    ...(cfg.kind !== "prod" ? { nodeLocations: [`${region}-a`, `${region}-c`] } : {}),
    network: network.network.id,
    subnetwork: network.subnets["sandbox"].id,
    removeDefaultNodePool: true,
    initialNodeCount: 1,
    // Workload Identity: pods assume the run-task SA without a node-level key (REQ-ARCH-30).
    workloadIdentityConfig: { workloadPool: pulumi.interpolate`${args.project}.svc.id.goog` },
    // VPC-native (alias IPs) is a hard prerequisite of both private nodes AND Dataplane V2 below. An empty
    // policy tells GKE to auto-allocate the pod/service secondary ranges — making the requirement EXPLICIT
    // and preview-stable rather than relying on the API's implicit default (independent-review follow-up).
    // The auto-allocated pod CIDR is admitted to the proxy tier via the `proxy-ingress-pods` firewall below,
    // which reads the cluster's actual `clusterIpv4Cidr` output (so the firewall never drifts from GKE's range).
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

  // Proxy INGRESS from the GKE pod range (D-P0.15c-8 on-the-wire half). A pod egressing to the proxy MAY keep
  // its own pod IP as the source (Dataplane V2 masquerade config-dependent), so the proxy tier must accept the
  // cluster's actual pod CIDR — not a guessed one. `ipAllocationPolicy: {}` lets GKE auto-allocate that range,
  // so we source this rule from the cluster's REAL assigned `clusterIpv4Cidr` output rather than hardcoding a
  // block that drifts (live P0.15g, the auto-assigned range was 10.236/14, not the guessed 10.92/14 — a
  // hand firewall `…-proxy-ingress-pods-p0-15g` had to be added by hand; this IS that rule, drift-free).
  new gcp.compute.Firewall(name("proxy-ingress-pods"), {
    network: network.network.id,
    direction: "INGRESS",
    priority: 1000,
    sourceRanges: [gke.clusterIpv4Cidr],
    allows: [{ protocol: "tcp", ports: ["443", "8443"] }],
    targetTags: [EGRESS_PROXY_TAG],
    description: "D-P0.15c-8: the GKE pod range (actual assigned CIDR) reaches the egress-proxy (8443/443).",
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
      // Non-prod pins the proxy VM to zones with capacity (a us-central1-f e2 stockout blocked the MIG instance
      // in P0.15f Stage B). prod stays fully regional (multi-zone HA).
      ...(cfg.kind !== "prod" ? { distributionPolicyZones: [`${region}-a`, `${region}-c`] } : {}),
    });
  }

  // The always-on worker's env (D-P0.08-1). Constants set in-program; the two SA/node-pool facts derived from
  // the resources above; the dynamic connection strings + URLs threaded (optional) from Pulumi config. The
  // RS256 run-token key secrets (RUN_TOKEN_PRIVATE/PUBLIC_KEY_SECRET) + RUN_TASK_IMAGE_REPO are set at deploy
  // (they need the Secret Manager naming reconciliation that is outside this offline change); the worker reads
  // the key from Secret Manager via ADC at boot (its SA is granted access in iam.ts).
  const workerEnvs: pulumi.Input<gcp.types.input.cloudrunv2.ServiceTemplateContainerEnv>[] = [
    { name: "K8S_NAMESPACE", value: "runs" },
    { name: "KUBE_SERVICE_ACCOUNT", value: "run-task-ksa" },
    // Plan-concurrency default (D-P0.08-4 stopgap, IaC'd from the live P0.15g hand-fix). The reaper does not
    // yet mark queued/failed-agent runs terminal, so a stuck non-terminal run counts against the flat default
    // (worker env, default 2) and blocks new admissions. Raise the default so a wedged dev run does not stall
    // the queue; the real per-account subscription-tier concurrency is PRB.8/P1.16, and the proper stuck-run
    // sweep is the deferred D-P0.08-4/D-P0.10-2 work.
    { name: "DEFAULT_CONCURRENCY", value: "25" },
    { name: "RUN_SERVICE_ACCOUNT", value: iam.serviceAccounts["run-task"].email },
    { name: "SANDBOX_NODE_POOL", value: runTaskPool.name },
    // Cloud Run → GKE auth (D-P0.15e-3): the worker has no in-cluster kubeconfig, so it builds one from the GKE
    // public endpoint + cluster CA + a per-launch metadata OAuth token (its SA has roles/container.developer).
    { name: "GKE_ENDPOINT", value: gke.endpoint },
    { name: "GKE_CA_DATA", value: gke.masterAuth.clusterCaCertificate },
    ...(args.workerDatabaseUrl ? [{ name: "DATABASE_URL", value: args.workerDatabaseUrl }] : []),
    ...(args.workerSystemDatabaseUrl ? [{ name: "SYSTEM_DATABASE_URL", value: args.workerSystemDatabaseUrl }] : []),
    ...(args.workerRedisUrl ? [{ name: "REDIS_URL", value: args.workerRedisUrl }] : []),
    ...(args.runTaskImageDigest ? [{ name: "RUN_TASK_IMAGE_DIGEST", value: args.runTaskImageDigest }] : []),
    ...(args.internalApiUrl ? [{ name: "API_INTERNAL_URL", value: args.internalApiUrl }] : []),
    ...(args.proxyBaseUrl ? [{ name: "ANTHROPIC_BASE_URL", value: args.proxyBaseUrl }] : []),
    ...(args.objectsBucket ? [{ name: "OBJECTS_BUCKET", value: args.objectsBucket }] : []),
  ];

  // --- Cloud Run services: placeholder image, per-service SA, VPC egress to the private-app tier. ----
  const services: Partial<Record<ServiceName, gcp.cloudrunv2.Service>> = {};
  for (const svc of CLOUD_RUN_SERVICES) {
    // The worker consumes pg-boss + runs crons: it CANNOT scale to zero and needs CPU allocated OUTSIDE a
    // request (background work), so it runs min-instances=1 + cpuIdle=false with its env baked on. A tiny
    // health server (main.ts) answers the Cloud Run startup probe. It also does the ~event-loop-blocking cold
    // import of @kubernetes/client-node on the first GKE launch (D-P0.15e-3), which STARVED under the default
    // 512Mi / throttled CPU (diagnosed live 2026-09-09 — the first launch hung ~9 min): pin 1 vCPU + 1Gi and
    // startup CPU boost so the cold import finishes in seconds. (A gcloud image-swap that omits these silently
    // reverts to the throttled default — the live-deploy step must preserve them, hence they live in IaC.)
    const isWorker = svc === "worker";
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
        scaling: {
          minInstanceCount: isWorker ? 1 : cfg.kind === "prod" ? 1 : 0,
          maxInstanceCount: isWorker ? (cfg.kind === "prod" ? 3 : 1) : cfg.kind === "prod" ? 10 : 2,
        },
        containers: [
          {
            image: placeholderImage,
            ...(isWorker
              ? {
                  resources: {
                    cpuIdle: false,
                    startupCpuBoost: true,
                    limits: { cpu: "1", memory: "1Gi" },
                  },
                  envs: workerEnvs,
                }
              : {}),
          },
        ],
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
