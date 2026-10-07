// Compute: the GKE Standard cluster that run-task Jobs land on (Standard, not Autopilot, because the
// input-scoped mount namespace needs CAP_SYS_ADMIN), the egress-proxy managed instance group behind an
// internal LB (the sandbox's stable egress target), the Cloud Run services + the convert Cloud Run Job,
// and the external HTTPS load balancer + Cloud CDN fronting web/api/user-content.
//
// Service images come from `rhema:serviceImages` (a JSON `{service: digest-ref}` map the images CI
// publishes — REQ-ARCH-39); anything unmapped falls back to `placeholderImage` so a bare `pulumi
// preview` still plans cleanly. PRB.15: prod wires the REAL domains (the `rhema.tools` zone — apex +
// `api.` + `*.usercontent.` — the stage facts' `domains` block, amended 2026-09-17), host-routing the
// api and the cookieless user-content origin on the same external HTTPS LB + managed cert.

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { type StageConfig } from "../config/stages";
import type { Network } from "./network";
import { EGRESS_PROXY_TAG, SANDBOX_TAG, GKE_MASTER_CIDR } from "./network";
import { SERVICES, type Iam, type ServiceName } from "./iam";
import type { Secrets } from "./secrets";
import { buildProxyStartupScript } from "./proxy";

export interface ComputeArgs {
  stack: string;
  cfg: StageConfig;
  project: pulumi.Input<string>;
  region: pulumi.Input<string>;
  network: Network;
  iam: Iam;
  /** The provisioned secret CONTAINERS (for env secret-NAME wiring — values never appear). */
  secrets: Secrets;
  /** The isolated, versioned buckets (api's OBJECTS_BUCKET + the user-content serving origin). */
  buckets: Record<string, gcp.storage.Bucket>;
  /** A placeholder image ref until each service ships real logic (overridden per-deploy). */
  placeholderImage: string;
  /**
   * PRB.15 — the real digest-pinned image per Cloud Run service/Job (`rhema:serviceImages` JSON map,
   * e.g. `{"api":"…/api@sha256:…"}`); missing entries fall back to `placeholderImage` so `preview` stays
   * clean before images are published. `run-task`/`egress-proxy` keep their dedicated config keys
   * (`runTaskImageDigest`/`proxyImage`) — the worker launches one, the MIG runs the other.
   */
  serviceImages?: Record<string, string>;
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
  /** the api's RLS-enforced tenant connection (a Pulumi secret config — prod sets `rhema:apiDatabaseUrl`). */
  apiDatabaseUrl?: pulumi.Input<string>;
  /** the api's elevated system-scoped connection for the circuit-breaker read (a Pulumi secret config). */
  apiSystemDatabaseUrl?: pulumi.Input<string>;
  /** the api's Memorystore Redis URL (a Pulumi secret config; prod shares `rhema:redisUrl`). */
  apiRedisUrl?: pulumi.Input<string>;
  /**
   * P1.03 — the collab service's connection as the LIMITED `rhema_collab` role (a Pulumi secret
   * config, `rhema:collabDatabaseUrl`; the role's grants are migration 0028). Never a superuser
   * string, and never shared with api/worker connections (REQ-ARCH-25).
   */
  collabDatabaseUrl?: pulumi.Input<string>;
  /** the worker's Resend From address (`EMAIL_FROM`, plain deploy config). */
  emailFrom?: pulumi.Input<string>;
  /** the digest-pinned run-task image the worker launches as the two-uid GKE Job. */
  runTaskImageDigest?: pulumi.Input<string>;
  /** the api's internal URL the worker + pod reach (`API_INTERNAL_URL`). */
  internalApiUrl?: pulumi.Input<string>;
  /**
   * PRB.16 — the Google OAuth CLIENT ID (plain deploy config, `rhema:googleOauthClientId`; the SECRET is
   * the `google-oauth-client-secret` SM container). The api mounts `/api/auth/*` only when the id + both
   * secret names resolve (the authSecretsReady gate) — a partial config leaves the surface 404.
   */
  googleOauthClientId?: pulumi.Input<string>;
  /**
   * PRB.17 — the Stripe Payment Link URL (plain deploy config, `rhema:stripePaymentLinkUrl`; a URL is
   * not a secret). The api returns it in `GET /billing/balance` as `paymentLinkUrl`; the web exhaustion
   * panel + billing surface 302 to it on `open_payment_link`. Unset ⇒ the surfaces hide the action.
   */
  stripePaymentLinkUrl?: pulumi.Input<string>;
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
  /** §12.1's convert Cloud Run Job (per-batch, no network, no DB) — executed by the caller, never served. */
  convertJob: gcp.cloudrunv2.Job;
  /** The external HTTPS LB's reserved global IPv4 (the operator points every prod DNS record at it). */
  lbIpAddress?: pulumi.Output<string>;
  /**
   * The DNS records the operator applies at their registrar/zone before the managed cert can authorize
   * (PRB.15; undefined off prod). Every record points at `lbIpAddress`.
   */
  dnsRecords?: pulumi.Output<{ name: string; type: string; value: string }[]>;
}

// Services that run as Cloud Run SERVICES (run-task on GKE, egress-proxy on a MIG, convert is a Cloud
// Run JOB — §12.1 "a Cloud Run Job per batch, no network, no DB"). `web` is public; the rest are
// internal + LB-fronted. `export` is created FIRST so the api's EXPORT_SERVICE_URL (PRB.11) can
// reference its uri — the api never carries pandoc; it POSTs the markdown to the isolated export
// container.
// Creation order matters: a service another references by `services[x].uri` must come FIRST
// (export → api; P1.15 adds fetcher → api + worker for the ingestion egress hop).
const CLOUD_RUN_SERVICES: ServiceName[] = ["export", "fetcher", "web", "api", "worker", "collab"];

export function createCompute(args: ComputeArgs): Compute {
  const { stack, cfg, project, region, network, iam, secrets, placeholderImage } = args;
  const name = (suffix: string) => `rhema-${stack}-${suffix}`;
  const domains = cfg.domains; // prod-only (undefined on dev/preview — stage facts)
  // The public origins the stage's domains imply (prod); non-prod services simply don't set them.
  const appOrigin = domains ? `https://${domains.app}` : undefined;
  const apiOrigin = domains ? `https://${domains.api}` : undefined;
  const imageFor = (svc: ServiceName): pulumi.Input<string> =>
    args.serviceImages?.[svc] ?? placeholderImage;

  // --- GKE Standard cluster for run-task (needs CAP_SYS_ADMIN — REQ-ARCH-2/36). ------------------
  // PROD IS ZONAL (amended 2026-09-17 — the ~$50/mo budget): a single-zone Standard cluster's
  // management fee is the lever GCP's free-tier waiver may zero per billing account; a regional
  // cluster multiplies control-plane+node cost. The pre-existing e2 stockout pin keeps non-prod on
  // two zones for a different reason (create-time stockout avoidance, not HA).
  const gke = new gcp.container.Cluster(name("run-task-gke"), {
    // prod: a ZONAL cluster (`<region>-a`); non-prod: regional (the live dev shape — unchanged).
    location: cfg.kind === "prod" ? pulumi.interpolate`${region}-a` : region,
    // Non-prod pins node zones to avoid a single-zone GCE stockout wedging the whole regional create (a live
    // us-central1-f e2 stockout ERROR'd the cluster in P0.15f Stage B). Prod is deliberately single-zone.
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
    // Node pool location tracks the cluster's (a zone on prod, the region elsewhere).
    location: gke.location,
    // Prod floor: ONE on-demand node (amended 2026-09-17 — budget). Spot stays OFF by default: run
    // pods must not be preempted mid-run (a spot node's 30s SIGTERM can lose an in-flight run);
    // it's the documented cost lever if a bigger pool is ever justified.
    nodeCount: 1,
    nodeConfig: {
      // prod: e2-medium (2 shared vCPU / 4 GiB) — the cheapest machine that still schedules the
      // baseline run pod (~3 GiB allocatable after kube-system). A Draft>8k Pod request may exceed
      // it — bump the pool rather than silently unscheduling. non-prod keeps e2-standard-2.
      machineType: cfg.kind === "prod" ? "e2-medium" : "e2-standard-2",
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
    // A RESERVED internal IP pinned into the template (surfaced live PRB.15 Stage B, 2026-09-17): the
    // MIG replaces its instance on every template change and a fresh NIC auto-assigns a NEW address —
    // the api/worker's `ANTHROPIC_BASE_URL` (rhema:proxyBaseUrl) would silently dangle at the old IP.
    // High end of the private-app /20 so auto-assigned addresses never collide.
    const proxyIp = new gcp.compute.Address(name("proxy-ip"), {
      addressType: "INTERNAL",
      purpose: "GCE_ENDPOINT",
      subnetwork: network.subnets["private-app"].id,
      region,
    });
    const proxyTemplate = new gcp.compute.InstanceTemplate(name("proxy-tmpl"), {
      machineType: "e2-small",
      tags: [EGRESS_PROXY_TAG],
      disks: [{ sourceImage: "projects/cos-cloud/global/images/family/cos-stable", boot: true, autoDelete: true }],
      networkInterfaces: [
        // No external IP: the proxy egresses via Cloud NAT; the sandbox reaches it on its internal IP.
        { subnetwork: network.subnets["private-app"].id, networkIp: proxyIp.address },
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
      // Prod floor: ONE proxy instance (amended 2026-09-17 — budget; two e2-smalls alone would be
      // ~$25/mo). Fail-CLOSED, not fail-open: if the instance dies, run pods lose egress (runs error,
      // they never leak) — so the HA cost of a single instance is availability-only. Auto-healing
      // still replaces it. targetSize 2 is the lever if prod hardens.
      targetSize: 1,
      namedPorts: [{ name: "https", port: Number(proxyPort) }],
      autoHealingPolicies: { healthCheck: proxyHealth.id, initialDelaySec: 60 },
      // Non-prod pins the proxy VM to zones with capacity (a us-central1-f e2 stockout blocked the MIG instance
      // in P0.15f Stage B). Prod lets the regional MIG place its single instance.
      ...(cfg.kind !== "prod" ? { distributionPolicyZones: [`${region}-a`, `${region}-c`] } : {}),
    });
  }

  // --- Artifact Registry: the per-stack docker repo the images CI + `cloudbuild.yaml` push to and the
  // runtimes pull from (PRB.15 — was hand-created for dev; IaC'd so `pulumi up prod` is self-contained).
  // `RUN_TASK_IMAGE_REPO` derives from it so the worker's Job spec can never drift from the real repo.
  const imageRepo = new gcp.artifactregistry.Repository(name("images"), {
    repositoryId: `rhema-${stack}`,
    location: region,
    format: "DOCKER",
  });
  const runTaskImageRepo = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${imageRepo.repositoryId}/run-task`;

  // The always-on worker's env (D-P0.08-1). Constants set in-program; the two SA/node-pool facts derived from
  // the resources above; the dynamic connection strings + URLs threaded (optional) from Pulumi config.
  // PRB.15 binds the Secret Manager NAMES the worker resolves at boot (RUN_TOKEN_* / ANTHROPIC_ADMIN_KEY /
  // RESEND_API_KEY / EMAIL_ACTION — never the values) + the ops webhook via a Cloud Run secretKeyRef.
  const runTokenSecretVersion = pulumi.interpolate`${secrets.runTokenSigningKey.id}/versions/latest`;
  const secretVersion = (s: gcp.secretmanager.Secret) => pulumi.interpolate`${s.id}/versions/latest`;
  // Optional-secret env names are wired only for stages whose `requiredSecrets` include them — the
  // worker/api eagerly `access` a named secret at boot, so naming a versionless preview secret would
  // crash-loop the service (previews require only the provider + run-token keys — stage facts).
  const requires = (id: string) => cfg.requiredSecrets.includes(id);
  const workerEnvs: pulumi.Input<gcp.types.input.cloudrunv2.ServiceTemplateContainerEnv>[] = [
    { name: "K8S_NAMESPACE", value: "runs" },
    { name: "KUBE_SERVICE_ACCOUNT", value: "run-task-ksa" },
    // The RS256 run-token keypair lives in ONE secret (the worker mints → needs both halves; the name
    // points at `versions/latest`, never the value — REQ-ARCH-30).
    { name: "RUN_TOKEN_PRIVATE_KEY_SECRET", value: runTokenSecretVersion },
    { name: "RUN_TOKEN_PUBLIC_KEY_SECRET", value: runTokenSecretVersion },
    { name: "RUN_TASK_IMAGE_REPO", value: runTaskImageRepo },
    // PRB.08/09 — the provider admin key (usage.reconcile), the Resend transport, and the one-click
    // email-action HMAC as secret NAMES (Secret Manager at boot; gated by `requiredSecrets` above).
    ...(requires("anthropic-admin-key")
      ? [{ name: "ANTHROPIC_ADMIN_KEY_SECRET", value: secretVersion(secrets.anthropicAdminKey) }]
      : []),
    ...(requires("resend-api-key")
      ? [{ name: "RESEND_API_KEY_SECRET", value: secretVersion(secrets.resendApiKey) }]
      : []),
    ...(requires("email-action-secret")
      ? [{ name: "EMAIL_ACTION_SECRET_NAME", value: secretVersion(secrets.emailActionSecret) }]
      : []),
    // P1.16 — the Stripe Billing key as a secret NAME for the auto-reload sweep's off-session charge
    // (the ONLY unattended charge path, REQ-BILL-17); unset ⇒ the sweep logs `no_stripe_port` skips.
    ...(requires("stripe-secret")
      ? [{ name: "STRIPE_SECRET_KEY_NAME", value: secretVersion(secrets.stripeSecret) }]
      : []),
    // The ops alert webhook is a value-bearing secret — Cloud Run mounts it via secretKeyRef (the
    // worker's SA holds secretAccessor on it — iam.ts), so it never sits in Pulumi config.
    ...(requires("ops-alert-webhook-url")
      ? [
          {
            name: "OPS_ALERT_WEBHOOK_URL",
            valueSource: {
              secretKeyRef: { secret: secrets.opsAlertWebhookUrl.secretId, version: "latest" },
            },
          },
        ]
      : []),
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
    // SEC.1 — on stages that provision `app-database-url` the worker's user-serving DSN comes from
    // Secret Manager via secretKeyRef (never a plaintext env `value`; REQ-ARCH-30). The
    // `workerDatabaseUrl` config path stays as the fallback for preview stacks that don't provision it.
    ...(requires("app-database-url")
      ? [
          {
            name: "DATABASE_URL",
            valueSource: {
              secretKeyRef: { secret: secrets.byId["app-database-url"].secretId, version: "latest" },
            },
          },
        ]
      : args.workerDatabaseUrl
        ? [{ name: "DATABASE_URL", value: args.workerDatabaseUrl }]
        : []),
    ...(args.workerSystemDatabaseUrl ? [{ name: "SYSTEM_DATABASE_URL", value: args.workerSystemDatabaseUrl }] : []),
    ...(args.workerRedisUrl ? [{ name: "REDIS_URL", value: args.workerRedisUrl }] : []),
    ...(args.emailFrom ? [{ name: "EMAIL_FROM", value: args.emailFrom }] : []),
    ...(apiOrigin ? [{ name: "API_PUBLIC_URL", value: apiOrigin }] : []),
    ...(appOrigin ? [{ name: "APP_BASE_URL", value: appOrigin }] : []),
    ...(args.runTaskImageDigest ? [{ name: "RUN_TASK_IMAGE_DIGEST", value: args.runTaskImageDigest }] : []),
    // The internal api URL defaults to the prod api origin when domains exist; `rhema:internalApiUrl`
    // still overrides (dev/previews have no real api host until the LB is up).
    ...(args.internalApiUrl || apiOrigin
      ? [{ name: "API_INTERNAL_URL", value: args.internalApiUrl ?? apiOrigin! }]
      : []),
    ...(args.proxyBaseUrl ? [{ name: "ANTHROPIC_BASE_URL", value: args.proxyBaseUrl }] : []),
    ...(args.objectsBucket ? [{ name: "OBJECTS_BUCKET", value: args.objectsBucket }] : []),
    // JOURNEY.1 — the test-tenant auto-purge window (hours; the hourly `test-tenant.purge` sweep
    // reaps flagged workspaces older than this through account.hard-delete).
    { name: "TEST_TENANT_PURGE_HOURS", value: "26" },
  ];

  // --- convert: a Cloud Run JOB, not a service (§12.1 — "a Cloud Run Job per batch, no network, no DB").
  // PRB.20 (D-PRB.02-1): the api executes it per upload with container-arg overrides = MOUNTED paths —
  // `/usercontent/<quarantineKey>` in, `/usercontent/<convertedKey>` out. The user-content bucket arrives as
  // a gcsfuse VOLUME (Cloud Run storage mount), so the job process still carries no GCS client, no network
  // route (no vpcAccess, still), and no DB credential — the mount is the runtime's, gated by the SA's
  // conditioned converted/-only write (iam.ts). The api owns the arg shape; nothing is baked here.
  // Declared BEFORE the services loop so the api's CONVERT_JOB env can carry the physical (autonamed) name.
  const convertJob = new gcp.cloudrunv2.Job(name("convert"), {
    location: region,
    deletionProtection: cfg.kind === "prod",
    template: {
      template: {
        serviceAccount: iam.serviceAccounts["convert"].email,
        timeout: "600s",
        maxRetries: 1,
        volumes: [
          {
            name: "usercontent",
            gcs: { bucket: args.buckets["user-content"].name, readOnly: false },
          },
        ],
        containers: [
          {
            image: imageFor("convert"),
            volumeMounts: [{ name: "usercontent", mountPath: "/usercontent" }],
          },
        ],
      },
    },
  });

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
    // P1.03 — collab is the single-writer MVP shape (§5.10): without a Redis sync tier two instances
    // would split a document's live state, so maxScale=1 is the honest bound at EVERY stage (prod
    // included) until the multi-instance design lands.
    const isCollab = svc === "collab";
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
          maxInstanceCount: isCollab ? 1 : isWorker ? (cfg.kind === "prod" ? 3 : 1) : cfg.kind === "prod" ? 10 : 2,
        },
        containers: [
          {
            // PRB.15 — the real digest-pinned image when `rhema:serviceImages` names one; otherwise the
            // placeholder keeps `pulumi preview` plannable before the images CI publishes.
            image: imageFor(svc),
            ...(isWorker
              ? {
                  resources: {
                    cpuIdle: false,
                    startupCpuBoost: true,
                    limits: { cpu: "1", memory: "1Gi" },
                  },
                  envs: [
                    ...workerEnvs,
                    // P1.15 — the ingestion wiring (evaluated here, not in `workerEnvs`, because the
                    // fetcher service + convert Job resources exist only once this loop reaches the
                    // worker). Each unset seam fails closed with a named reason (main.ts).
                    { name: "FETCHER_SERVICE_URL", value: services["fetcher"]!.uri },
                    { name: "USER_CONTENT_BUCKET", value: args.buckets["user-content"].name },
                    {
                      name: "CONVERT_JOB",
                      value: pulumi.interpolate`projects/${project}/locations/${region}/jobs/${convertJob.name}`,
                    },
                    { name: "CONVERT_JOB_ROOT", value: "/usercontent" },
                    // The reconstruction key secret NAME — same anthropic-api-key version the
                    // walkthrough generator may point at (INGEST_MODEL_KEY_SECRET overrides).
                    ...(requires("anthropic-api-key")
                      ? [{ name: "INGEST_MODEL_KEY_SECRET", value: secretVersion(secrets.anthropicApiKey) }]
                      : []),
                  ],
                }
              : {}),
            // PRB.11 — the api reaches the isolated export container at EXPORT_SERVICE_URL (the export
            // service is created first in CLOUD_RUN_SERVICES so its uri resolves here).
            // PRB.13 — `signup.mode` (REQ-BETA-19 amended) deploys to BOTH consumers from the one stage
            // fact: the api's `POST /signup` admission gate and the web `/login` pre-gate read the same
            // `SIGNUP_MODE` (a mode string — never a secret). Prod is `open` (PRB.15).
            ...(svc === "api"
              ? {
                  envs: [
                    { name: "EXPORT_SERVICE_URL", value: services["export"]!.uri },
                    // P1.15 — the fetcher service is ingestion's only remote-egress hop (the api's
                    // discover/review fetches ride it; invoker-gated → OIDC per hop).
                    { name: "FETCHER_SERVICE_URL", value: services["fetcher"]!.uri },
                    { name: "SIGNUP_MODE", value: cfg.signupMode },
                    // BILL.3 — `purchase.mode` (ADR-028): the api's only consumer (the web derives the
                    // paused rendering from the api's `purchase` field, not its own env). All stages
                    // ship `closed` until the operator flips the stage fact to re-open.
                    { name: "PURCHASE_MODE", value: cfg.purchaseMode },
                    { name: "OBJECTS_BUCKET", value: args.buckets["artifacts"].name },
                    { name: "MAX_USD_PER_RUN", value: String(cfg.maxUsdPerRun) },
                    // The api mints run tokens → both key halves from the ONE signing-key secret (name
                    // only; the SA holds accessor — REQ-ARCH-30). The Stripe webhook + email-action
                    // verification secrets are NAMES resolved at boot, gated on `requiredSecrets`.
                    { name: "RUN_TOKEN_PRIVATE_KEY_SECRET", value: runTokenSecretVersion },
                    { name: "RUN_TOKEN_PUBLIC_KEY_SECRET", value: runTokenSecretVersion },
                    ...(requires("stripe-webhook-secret")
                      ? [
                          {
                            name: "STRIPE_WEBHOOK_SECRET_NAME",
                            value: secretVersion(secrets.stripeWebhookSecret),
                          },
                        ]
                      : []),
                    // P1.16 — the Stripe Billing key as a secret NAME for Checkout/Portal
                    // (`FetchStripePort` at boot); unset ⇒ those routes 503 `stripe_unconfigured`.
                    ...(requires("stripe-secret")
                      ? [
                          {
                            name: "STRIPE_SECRET_KEY_NAME",
                            value: secretVersion(secrets.stripeSecret),
                          },
                        ]
                      : []),
                    ...(requires("email-action-secret")
                      ? [
                          {
                            name: "EMAIL_ACTION_SECRET_NAME",
                            value: secretVersion(secrets.emailActionSecret),
                          },
                        ]
                      : []),
                    // PRB.16 — the Better Auth binding (D-P0.01-3): the signing secret + Google client
                    // SECRET as Secret-Manager NAMES (values load at boot; the api SA holds
                    // secretAccessor — iam.ts). The OAuth client ID is plain deploy config
                    // (`rhema:googleOauthClientId`). Auth mounts only when all three + APP_BASE_URL
                    // resolve (server.ts's authSecretsReady gate) — partial ⇒ /api/auth/* stays 404.
                    ...(requires("better-auth-secret")
                      ? [{ name: "BETTER_AUTH_SECRET_NAME", value: secretVersion(secrets.betterAuthSecret) }]
                      : []),
                    ...(requires("google-oauth-client-secret")
                      ? [
                          {
                            name: "GOOGLE_OAUTH_CLIENT_SECRET_NAME",
                            value: secretVersion(secrets.googleOauthClientSecret),
                          },
                        ]
                      : []),
                    ...(args.googleOauthClientId
                      ? [{ name: "GOOGLE_OAUTH_CLIENT_ID", value: args.googleOauthClientId }]
                      : []),
                    ...(args.stripePaymentLinkUrl
                      ? [{ name: "STRIPE_PAYMENT_LINK_URL", value: args.stripePaymentLinkUrl }]
                      : []),
                    // PRB.16 — the x-rhema-* identity-header shim is dev/preview ONLY (client-forgeable;
                    // prod's identity path is the session cookie). Never set on prod.
                    ...(cfg.kind !== "prod" ? [{ name: "IDENTITY_HEADERS", value: "true" }] : []),
                    // PRB.20 — the live ingestion wiring (D-PRB.02-1): the user-content bucket the presign
                    // targets + the convert Job's full v2 resource name + its bucket mount path. BOTH set ⇒
                    // the api mounts /import/presign + import/preview|create (server.ts's fail-closed gate).
                    { name: "USER_CONTENT_BUCKET", value: args.buckets["user-content"].name },
                    {
                      name: "CONVERT_JOB",
                      value: pulumi.interpolate`projects/${project}/locations/${region}/jobs/${convertJob.name}`,
                    },
                    { name: "CONVERT_JOB_ROOT", value: "/usercontent" },
                    ...(apiOrigin ? [{ name: "API_PUBLIC_URL", value: apiOrigin }] : []),
                    ...(appOrigin ? [{ name: "APP_BASE_URL", value: appOrigin }] : []),
                    // JOURNEY.1 — the test-mailbox flagging config (a deploy constant, not a
                    // secret): workspaces provisioned for test@rhema.tools / test+<tag>@rhema.tools
                    // are flagged is_test at creation (SLO/trial exclusion + the purge sweep).
                    { name: "TEST_MAILBOX", value: "test@rhema.tools" },
                    // SEC.1 — the api's DATABASE_URL mounts the `rhema_app_login` DSN from Secret
                    // Manager via secretKeyRef on stages that provision `app-database-url` (never a
                    // plaintext `value`; REQ-ARCH-30). Config-driven `apiDatabaseUrl` remains the
                    // preview fallback.
                    ...(requires("app-database-url")
                      ? [
                          {
                            name: "DATABASE_URL",
                            valueSource: {
                              secretKeyRef: {
                                secret: secrets.byId["app-database-url"].secretId,
                                version: "latest",
                              },
                            },
                          },
                        ]
                      : args.apiDatabaseUrl
                        ? [{ name: "DATABASE_URL", value: args.apiDatabaseUrl }]
                        : []),
                    ...(args.apiSystemDatabaseUrl
                      ? [{ name: "SYSTEM_DATABASE_URL", value: args.apiSystemDatabaseUrl }]
                      : []),
                    ...(args.apiRedisUrl ? [{ name: "REDIS_URL", value: args.apiRedisUrl }] : []),
                    // DEF.2 (F6) — the estimate claim pre-pass rides the egress proxy (the api holds
                    // no provider key; it presents a purpose-minted credential). Same `rhema:proxyBaseUrl`
                    // the worker hands pods as `ANTHROPIC_BASE_URL`; unset ⇒ estimates stay provisional.
                    ...(args.proxyBaseUrl ? [{ name: "EGRESS_PROXY_URL", value: args.proxyBaseUrl }] : []),
                  ],
                }
              : {}),
            // P1.03 — the collab service's env: the `rhema_collab` role's DATABASE_URL (a Pulumi
            // secret config — never a shared/superuser string) + the artifacts bucket the
            // content-addressed objects + `restore/<ydoc>/<ts>` blobs land in. No provider/model
            // keys ever reach this service (REQ-ARCH-30).
            ...(svc === "collab"
              ? {
                  envs: [
                    { name: "OBJECTS_BUCKET", value: args.buckets["artifacts"].name },
                    // SEC.1 — REQ-ARCH-30: no plaintext secret env on collab. On stages that seed
                    // `collab-database-url` the DSN mounts via secretKeyRef; the config `value:` path
                    // is the preview/fallback only.
                    ...(requires("collab-database-url")
                      ? [
                          {
                            name: "DATABASE_URL",
                            valueSource: {
                              secretKeyRef: {
                                secret: secrets.byId["collab-database-url"].secretId,
                                version: "latest",
                              },
                            },
                          },
                        ]
                      : args.collabDatabaseUrl
                        ? [{ name: "DATABASE_URL", value: args.collabDatabaseUrl }]
                        : []),
                  ],
                }
              : {}),
            // PRB.15 — prod's web reads the real api origin (`https://api.rhema.tools`) so the SPA's
            // data-source + the magic-link POST hit the LB-fronted api; non-prod keeps the default.
            ...(svc === "web"
              ? {
                  envs: [
                    { name: "SIGNUP_MODE", value: cfg.signupMode },
                    ...(apiOrigin ? [{ name: "API_BASE_URL", value: apiOrigin }] : []),
                    // PRB.16 — the app's own public origin: the OAuth/magic-link `callbackURL` base the
                    // web's auth proxy builds (it must equal the api's trusted origin — the app host).
                    ...(appOrigin ? [{ name: "APP_BASE_URL", value: appOrigin }] : []),
                    // P1.03 — the Page's collab transport: same-origin WSS on the APP host (the
                    // `__Host-` session cookie rides the upgrade; the LB path-routes /collab/*).
                    ...(appOrigin
                      ? [{ name: "COLLAB_WS_URL", value: `wss://${domains!.app}/collab` }]
                      : []),
                  ],
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

  // PRB.20 — the api drives the Job: `jobs:run` carries `overrides.containerOverrides` (the mounted-path
  // args), which requires `run.jobs.runWithOverrides` — `roles/run.invoker` only has plain `run.jobs.run`
  // and returns 403 (surfaced live 2026-09-22). `roles/run.jobsExecutorWithOverrides` covers both run
  // permissions + executions.cancel; `roles/run.viewer` polls the operation (`run.operations.get`).
  // Job-scoped — never project-scoped.
  for (const [suffix, role] of [
    ["runs-convert", "roles/run.jobsExecutorWithOverrides"],
    ["reads-convert-ops", "roles/run.viewer"],
  ] as const) {
    new gcp.cloudrunv2.JobIamMember(name(`api-${suffix}`), {
      location: region,
      name: convertJob.name,
      role,
      member: pulumi.interpolate`serviceAccount:${iam.serviceAccounts["api"].email}`,
    });
  }

  // --- Public invoker grants (surfaced live at Stage B, 2026-09-17): the LB-fronted services —
  // `web` (the public site), `api` (host-routed api.rhema.tools), and — P1.03 — `collab` (path-routed
  // `/collab*` on the app host) — need `roles/run.invoker` for `allUsers`: the Google Frontend does
  // not mint identity for LB→serverless-NEG hops, so without the grant every public request 403s.
  // Dev worked only because `gcloud run deploy` granted this implicitly. Collab's real auth is the
  // session cookie its WebSocket hook resolves (the invoker grant is transport-only); the remaining
  // internal services (worker/fetcher/export) stay invoker-gated — their service-to-service auth
  // wiring is the live leg of D-PRB.02-1 / PRB.16 scope.
  for (const svc of ["web", "api", "collab"] as const) {
    new gcp.cloudrunv2.ServiceIamMember(name(`${svc}-public-invoker`), {
      location: region,
      name: services[svc]!.name,
      role: "roles/run.invoker",
      member: "allUsers",
    });
  }

  // api → export service-to-service invoker (LIVE FINDING 11): the export container is invoker-gated by
  // design (the comment above); the api SA gets `roles/run.invoker` and the api mints an OIDC ID token per
  // hop (fetchGceMetadataIdToken in server.ts). Without BOTH halves the prod export 403s at the frontend.
  new gcp.cloudrunv2.ServiceIamMember(name("api-invokes-export"), {
    location: region,
    name: services["export"]!.name,
    role: "roles/run.invoker",
    member: pulumi.interpolate`serviceAccount:${iam.serviceAccounts["api"].email}`,
  });

  // P1.15 — api/worker → fetcher service-to-service invoker (same LIVE FINDING 11 pattern): the
  // fetcher is invoker-gated (internal-only egress guard); each caller mints an OIDC ID token per
  // hop via `createFetcherServicePort`. Without BOTH halves ingestion's remote fetch 403s.
  for (const caller of ["api", "worker"] as const) {
    new gcp.cloudrunv2.ServiceIamMember(name(`${caller}-invokes-fetcher`), {
      location: region,
      name: services["fetcher"]!.name,
      role: "roles/run.invoker",
      member: pulumi.interpolate`serviceAccount:${iam.serviceAccounts[caller].email}`,
    });
  }

  // P1.15 — the worker drives the convert Job for `ingest.sync` re-conversion (the same
  // jobsExecutorWithOverrides + run.viewer pair the api holds; Job-scoped, never project-scoped).
  for (const [suffix, role] of [
    ["runs-convert", "roles/run.jobsExecutorWithOverrides"],
    ["reads-convert-ops", "roles/run.viewer"],
  ] as const) {
    new gcp.cloudrunv2.JobIamMember(name(`worker-${suffix}`), {
      location: region,
      name: convertJob.name,
      role,
      member: pulumi.interpolate`serviceAccount:${iam.serviceAccounts["worker"].email}`,
    });
  }

  // --- External HTTPS LB + Cloud CDN fronting `web`, the api, and (prod) the cookieless user-content
  // origin. prod gets the real domains + a reserved global IP the operator's DNS records point at.
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
    // HOT.1 (BL-65) — LB request logging: user-visible 5xxs must leave a loadbalancing.googleapis.com/requests
    // trail (the dossier 500s were invisible because the backends logged nothing). sampleRate 1.0 — cheap at
    // this traffic level; the log is the audit surface OBS.1 consumes.
    logConfig: { enable: true, sampleRate: 1.0 },
  });

  // The api on the same LB (prod): host `api.rhema.tools` routes to the api Cloud Run NEG — no public
  // `run.app` surface, the service's ingress stays `INTERNAL_LOAD_BALANCER`.
  const apiNeg = new gcp.compute.RegionNetworkEndpointGroup(name("api-neg"), {
    region,
    networkEndpointType: "SERVERLESS",
    cloudRun: { service: services["api"]!.name },
  });
  const apiBackend = new gcp.compute.BackendService(name("api-backend"), {
    protocol: "HTTPS",
    loadBalancingScheme: "EXTERNAL_MANAGED",
    enableCdn: false, // api responses are never edge-cached
    backends: [{ group: apiNeg.id }],
    // HOT.1 — same request-log trail on the api backend.
    logConfig: { enable: true, sampleRate: 1.0 },
  });

  // P1.03 — the collab service behind the SAME LB, path-routed `/collab*` on the APP host (the
  // `__Host-` session cookie only rides same-host upgrades — the WebSocket auth hook reads it). No
  // CDN (WS frames are never cacheable). timeoutSec is NOT set: GCP rejects it outright on
  // Serverless-NEG backend services (surfaced live at STB.1, update 76 — "Timeout sec is not
  // supported for a backend service with Serverless network endpoint groups"), so the WebSocket
  // idle lifetime is whatever the GFE→Cloud Run hop defaults to; the Hocuspocus layer's own
  // keepalive/reconnect handles quiet-session drops.
  const collabNeg = new gcp.compute.RegionNetworkEndpointGroup(name("collab-neg"), {
    region,
    networkEndpointType: "SERVERLESS",
    cloudRun: { service: services["collab"]!.name },
  });
  const collabBackend = new gcp.compute.BackendService(name("collab-backend"), {
    protocol: "HTTPS",
    loadBalancingScheme: "EXTERNAL_MANAGED",
    enableCdn: false,
    backends: [{ group: collabNeg.id }],
    // HOT.1 — the WebSocket backend gets the same request-log trail (upgrade requests + denials).
    logConfig: { enable: true, sampleRate: 1.0 },
  });

  // The user-content origin (PRB.15; D-PRB.02-1's IaC leg): `usercontent.rhema.tools` (the `*.`
  // wildcard was dropped at Stage B — managed certs reject wildcard SANs; see the cert below) is
  // host-routed to a backend bucket over the PRIVATE, uniform-IAM `user-content` bucket —
  // cookieless by construction (the origin emits no Set-Cookie, and on the shared `rhema.tools` zone —
  // amended 2026-09-17 — the session side is defended by host-only `__Host-` cookies, see
  // apps/api/src/auth.ts) and served attachment/octet-stream by `servingHeadersFor`
  // (apps/convert/src/serving.ts). Objects stay private:
  // the app signs download URLs (CDN signed-url key added by the operator out-of-band — the runbook's
  // post-up step), so nothing is world-readable and `USE_ORIGIN_HEADERS` honors the private/no-store
  // cache-control the serving layer emits.
  const userContentBackend = domains
    ? new gcp.compute.BackendBucket(name("usercontent-backend"), {
        bucketName: args.buckets["user-content"].name,
        enableCdn: true, // CDN is REQUIRED for the signed-url mechanism (the edge verifies the signature)
        cdnPolicy: { cacheMode: "USE_ORIGIN_HEADERS" },
      })
    : undefined;

  const urlMap = new gcp.compute.URLMap(name("urlmap"), {
    defaultService: webBackend.id,
    ...(domains && userContentBackend
      ? {
          hostRules: [
            // P1.03 — the app host gets an explicit matcher so `/collab` + `/collab/*` (the WSS
            // upgrade + the M17 block routes) reach the collab service; everything else stays web.
            { hosts: [domains.app], pathMatcher: "app" },
            { hosts: [domains.api], pathMatcher: "api" },
            // Bare host only — the `*.usercontent.rhema.tools` wildcard host rule was dropped in
            // Stage B (2026-09-17): Google `ManagedSslCertificate` rejects wildcard SANs at create
            // (400 "Wildcard domains not supported"), exactly the fallback the runbook pre-authorized.
            { hosts: [domains.userContent], pathMatcher: "usercontent" },
          ],
          pathMatchers: [
            {
              name: "app",
              defaultService: webBackend.id,
              pathRules: [
                { paths: ["/collab", "/collab/*"], service: collabBackend.id },
              ],
            },
            { name: "api", defaultService: apiBackend.id },
            { name: "usercontent", defaultService: userContentBackend.id },
          ],
        }
      : {}),
  });

  // Google-managed cert. prod covers the REAL domains (stage facts, amended 2026-09-17): rhema.tools +
  // api.rhema.tools + usercontent.rhema.tools. The `*.usercontent.rhema.tools` SAN was dropped at Stage B
  // (2026-09-17): `ManagedSslCertificate` rejects wildcards ("Wildcard domains not supported") — the
  // runbook's pre-authorized fallback; per-workspace content hosts are future scope and need Certificate
  // Manager + DNS authorization when they arrive. Non-prod keeps the real-format placeholder TLD so the
  // cert resource (and the HTTPS proxy/forwarding rule that depend on it) create cleanly (a `.example`
  // name is rejected at create — offline typecheck can't catch that); a non-prod cert never reaches
  // ACTIVE without DNS ownership, which is acceptable — the live run path flows through
  // api/worker/proxy/GKE.
  const cert = new gcp.compute.ManagedSslCertificate(name("cert"), {
    managed: {
      domains: domains ? [domains.app, domains.api, domains.userContent] : [`${stack}.rhema.dev`],
    },
  });
  const httpsProxy = new gcp.compute.TargetHttpsProxy(name("https-proxy"), {
    urlMap: urlMap.id,
    sslCertificates: [cert.id],
  });
  // A reserved global IPv4 gives the operator ONE stable anycast address for every prod DNS record —
  // without it the forwarding rule's ephemeral IP can churn and silently break DNS.
  const lbAddress = domains
    ? new gcp.compute.GlobalAddress(name("lb-ip"), { ipVersion: "IPV4" })
    : undefined;
  new gcp.compute.GlobalForwardingRule(name("https-fr"), {
    ...(lbAddress ? { ipAddress: lbAddress.address } : {}),
    target: httpsProxy.id,
    portRange: "443",
    loadBalancingScheme: "EXTERNAL_MANAGED",
  });

  // The DNS records the operator applies at their DNS provider before the managed cert can authorize
  // (every prod host → the reserved LB IPv4). Emitted as a stack output so the runbook's post-up step
  // reads them straight off `pulumi stack output` instead of a hand-edited table.
  const dnsRecords =
    domains && lbAddress
      ? lbAddress.address.apply((ip) => [
          { name: `${domains.app}.`, type: "A", value: ip },
          { name: `${domains.api}.`, type: "A", value: ip },
          { name: `${domains.userContent}.`, type: "A", value: ip },
          // No `*.usercontent.rhema.tools` record: the cert can't cover it (managed certs reject
          // wildcards) so an A record would serve a cert-mismatch, not content.
        ])
      : undefined;

  // Sanity: the Cloud Run + GKE + proxy set covers every declared service exactly once.
  const covered = new Set<ServiceName>([...CLOUD_RUN_SERVICES, "run-task", "egress-proxy", "convert"]);
  for (const s of SERVICES) if (!covered.has(s)) throw new pulumi.RunError(`service ${s} has no compute placement`);

  return {
    gke,
    runTaskPool,
    proxyGroup,
    services,
    convertJob,
    lbIpAddress: lbAddress?.address,
    dnsRecords,
  };
}
