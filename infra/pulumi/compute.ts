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
import * as tls from "@pulumi/tls";
import { type StageConfig, type CloudRunServiceName } from "../config/stages";
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
  /**
   * MAINT.6 (D-OPS.1-1) — mount `RESEND_API_KEY_SECRET` on the worker even though
   * `resend-api-key` is not in the non-prod `requiredSecrets` set: index.ts sets this when a
   * `rhema:resendApiKey` secret config seeded the REAL key version (the placeholder stays
   * unmounted — an unkeyed preview's mail.send keeps no-op'ing exactly as before). Prod needs
   * nothing here: `requiredSecrets` already carries `resend-api-key` there.
   */
  resendSecretWired?: boolean;
  /** the digest-pinned run-task image the worker launches as the two-uid GKE Job. */
  runTaskImageDigest?: pulumi.Input<string>;
  /**
   * SEC.3 — the run-task pod's `appArmorProfile.type`, a verbatim k8s enum value (`Localhost` ships;
   * the previous profile type is the rollback). Paired with `runTaskAppArmorLocalhostProfile`.
   */
  runTaskAppArmorType?: pulumi.Input<string>;
  /** SEC.3 — the Localhost profile name (`rhema-run-task`) the apparmor-loader DaemonSet installs. */
  runTaskAppArmorLocalhostProfile?: pulumi.Input<string>;
  /** the api's internal URL the worker + pod reach (`API_INTERNAL_URL`). */
  internalApiUrl?: pulumi.Input<string>;
  /**
   * PRB.16 — the Google OAuth CLIENT ID (plain deploy config, `rhema:googleOauthClientId`; the SECRET is
   * the `google-oauth-client-secret` SM container). The api mounts `/api/auth/*` only when the id + both
   * secret names resolve (the authSecretsReady gate) — a partial config leaves the surface 404.
   */
  googleOauthClientId?: pulumi.Input<string>;
  /**
   * VERIF.2 — non-prod public origins (plain deploy config, `rhema:appBaseUrl` /
   * `rhema:apiPublicUrl`): prod derives `appOrigin`/`apiOrigin` from `domains`; previews have
   * no domains, so they set their own `*.run.app` URLs here. Without `APP_BASE_URL` the api's
   * `authSecretsReady` gate can never open — Better Auth stays unmounted and `/api/auth/*` 404s
   * (F-VERIF.2-2, found live on pr-186). `API_PUBLIC_URL` also feeds trustedOrigins and
   * `INTERNAL_AUTH_AUDIENCE`. Unset ⇒ prior behavior (non-prod simply doesn't set them).
   */
  appBaseUrl?: pulumi.Input<string>;
  apiPublicUrl?: pulumi.Input<string>;
  /**
   * PRB.17 — the Stripe Payment Link URL (plain deploy config, `rhema:stripePaymentLinkUrl`; a URL is
   * not a secret). The api returns it in `GET /billing/balance` as `paymentLinkUrl`; the web exhaustion
   * panel + billing surface 302 to it on `open_payment_link`. Unset ⇒ the surfaces hide the action.
   */
  stripePaymentLinkUrl?: pulumi.Input<string>;
  /** the egress-proxy base URL the Job's sandbox uses (`ANTHROPIC_BASE_URL`). */
  proxyBaseUrl?: pulumi.Input<string>;
  // SPA.28 — `rhema:spaSurfaces` / `SPA_SURFACES` / `SPA_OVERRIDES` are retired (REQ-SEQ-4's
  // removal leg): the shell is the sole renderer for every authenticated document, so there is
  // no flag env left to emit and no stack-config override path to honor.
  /** the GCS artifacts bucket the run-task harness materializes `/work` from (`OBJECTS_BUCKET`). */
  objectsBucket?: pulumi.Input<string>;
  /**
   * OPS.1 (REQ-ARCH-39) — the chain-tip SHA + computed protocols version the non-prod `migrate`
   * Cloud Run Job records into `deployments`. Unset ⇒ the record leg skips (a bare preview stays
   * clean); the digest map itself is composed in-program from serviceImages/runTask/proxy pins.
   */
  gitSha?: pulumi.Input<string>;
  protocolsVersion?: pulumi.Input<string>;
  /**
   * OPS.1 (live finding — dev update 68) — the SM versions the program itself wrote (index.ts).
   * Every container that mounts `versions/latest` via secretKeyRef must dependsOn them: a
   * revision starting before its version exists fails "secret …/versions/latest was not found".
   */
  secretVersions?: gcp.secretmanager.SecretVersion[];
  /**
   * R6POST.2 (REQ-POST-6) — the NAME of a pre-created `gcloud compute addresses` global IPv4 the
   * LB binds INSTEAD of program-reserving one (non-prod only; index.ts refuses it on prod). The
   * ruled domains stage needs the IP BEFORE `up` so its wildcard-DNS names (`*.sslip.io` — they
   * embed the IP) can be minted + configured in the same config pass — otherwise a second `up`
   * would REPLACE the forwarding rule when the names arrived. The address stays outside Pulumi
   * state (deleted out of band at teardown; `destroy` can't orphan it).
   */
  lbAddressName?: string;
}

export interface Compute {
  gke: gcp.container.Cluster;
  runTaskPool: gcp.container.NodePool;
  proxyGroup?: gcp.compute.RegionInstanceGroupManager;
  services: Partial<Record<ServiceName, gcp.cloudrunv2.Service>>;
  /** §12.1's convert Cloud Run Job (per-batch, no network, no DB) — executed by the caller, never served. */
  convertJob: gcp.cloudrunv2.Job;
  /** ONB.1 (ADR-044) — the warm convert service: same image/SA/mount/isolation as the Job, `--serve`. */
  convertSvc: gcp.cloudrunv2.Service;
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
// (export/fetcher → api + worker; OPS.1 adds api → web so non-prod `API_BASE_URL` + the worker's
// `API_INTERNAL_URL` can carry the api's real `*.run.app` origin — prod keeps its config/LB paths).
const CLOUD_RUN_SERVICES: CloudRunServiceName[] = ["export", "fetcher", "api", "web", "worker", "collab"];

export function createCompute(args: ComputeArgs): Compute {
  const { stack, cfg, project, region, network, iam, secrets, placeholderImage } = args;
  const name = (suffix: string) => `rhema-${stack}-${suffix}`;
  const domains = cfg.domains; // prod-only (undefined on dev/preview — stage facts)
  // The public origins the stage's domains imply (prod); non-prod services simply don't set them.
  // VERIF.2 — non-prod public origins come from config (`rhema:appBaseUrl`/`rhema:apiPublicUrl`
  // — the stage's own *.run.app URLs); prod keeps the domains-derived origins. This is what lets
  // a preview mount Better Auth at all (F-VERIF.2-2).
  const appOrigin = domains ? `https://${domains.app}` : args.appBaseUrl;
  const apiOrigin = domains ? `https://${domains.api}` : args.apiPublicUrl;
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
  // OPS.1 — hoisted so the worker's `ANTHROPIC_BASE_URL` can resolve to the MIG's reserved internal
  // IP on stacks that don't set `rhema:proxyBaseUrl` (non-prod self-wiring; prod's config still wins).
  let proxyIp: gcp.compute.Address | undefined;
  let proxyGroup: gcp.compute.RegionInstanceGroupManager | undefined;
  if (deployProxyMig) {
    // A RESERVED internal IP pinned into the template (surfaced live PRB.15 Stage B, 2026-09-17): the
    // MIG replaces its instance on every template change and a fresh NIC auto-assigns a NEW address —
    // the api/worker's `ANTHROPIC_BASE_URL` (rhema:proxyBaseUrl) would silently dangle at the old IP.
    // High end of the private-app /20 so auto-assigned addresses never collide.
    proxyIp = new gcp.compute.Address(name("proxy-ip"), {
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
    // F-R6INF.1-1 (R6INF.1, 2026-10-22 — the GD-HA.R6 ×2 lever is WITHHELD by this block):
    // the template above pins the ONE reserved `networkIp` (prod `10.8.16.4`) so
    // `rhema:proxyBaseUrl` never dangles across template rolls — but exactly one resource may
    // hold a static internal IP, so a targetSize>1 MIG can never create its second instance
    // (permanent IP-in-use create failure), and the single-URL consumers would get no failover
    // anyway. Real ×2 requires a shared frontend first — an internal passthrough NLB holding
    // the VIP with this MIG as backend — an unruled +$8–18/mo add beyond GD-HA.R6's +$12.2.
    // Refuse the non-converging shape at eval time, before any preview/up, so a future
    // stage-fact flip can never strand prod in an error-looping MIG.
    if (cfg.egressProxyTargetSize > 1) {
      throw new Error(
        `egressProxyTargetSize=${cfg.egressProxyTargetSize} cannot converge: the proxy ` +
          `template pins the single reserved networkIp and one resource may hold a static ` +
          `internal IP (F-R6INF.1-1). Land the internal-LB frontend first, or keep size 1.`,
      );
    }
    proxyGroup = new gcp.compute.RegionInstanceGroupManager(name("proxy-mig"), {
      region,
      baseInstanceName: name("proxy"),
      versions: [{ instanceTemplate: proxyTemplate.id }],
      // The stage fact drives the size (R6INF.1 / GD-HA.R6): prod stays ONE until the
      // internal-LB frontend lands (the guard above refuses the non-converging ×2).
      // Fail-CLOSED posture: if the instance dies, run pods lose egress (runs error, they
      // never leak) — the single-instance cost is availability-only. Auto-healing replaces it.
      targetSize: cfg.egressProxyTargetSize,
      namedPorts: [{ name: "https", port: Number(proxyPort) }],
      autoHealingPolicies: { healthCheck: proxyHealth.id, initialDelaySec: 60 },
      // Non-prod pins the proxy VM to zones with capacity (a us-central1-f e2 stockout blocked the MIG instance
      // in P0.15f Stage B). Prod lets the regional MIG place its single instance.
      ...(cfg.kind !== "prod" ? { distributionPolicyZones: [`${region}-a`, `${region}-c`] } : {}),
    });
  }

  // --- Artifact Registry: the per-stack docker repo the images CI + `infra/cloudbuild/image-set.yaml` push to and the
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
  // OPS.1 (live finding — dev update 68) — ordering prerequisites for containers that consume
  // grants or versions: the SM versions the program wrote (mounted via `versions/latest`), and
  // the IAM members (a revision starting before its SA's bucket/secret grant propagates fails at
  // mount/first-access — the gcsfuse PermissionDenied + "versions/latest was not found" findings).
  const containerPrereqs: pulumi.Resource[] = [...(args.secretVersions ?? []), ...iam.members];
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
    ...(requires("resend-api-key") || args.resendSecretWired === true
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
    // ECON.1 — `debit.mode` (ADR-031): the worker's settle/cancel paths read the same flag the api
    // does — one stage fact, both consumers (a divergent pair would double-charge or under-settle).
    { name: "DEBIT_MODE", value: cfg.debitMode },
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
    // OPS.1 — the worker's elevated SYSTEM_DATABASE_URL mounts the composed `postgres`-role DSN from
    // Secret Manager via secretKeyRef on stages that provision `system-database-url` (the generated
    // non-prod set); the `workerSystemDatabaseUrl` config path stays the prod/operator fallback.
    ...(requires("system-database-url")
      ? [
          {
            name: "SYSTEM_DATABASE_URL",
            valueSource: {
              secretKeyRef: {
                secret: secrets.byId["system-database-url"].secretId,
                version: "latest",
              },
            },
          },
        ]
      : args.workerSystemDatabaseUrl
        ? [{ name: "SYSTEM_DATABASE_URL", value: args.workerSystemDatabaseUrl }]
        : []),
    ...(args.workerRedisUrl ? [{ name: "REDIS_URL", value: args.workerRedisUrl }] : []),
    ...(args.emailFrom ? [{ name: "EMAIL_FROM", value: args.emailFrom }] : []),
    ...(apiOrigin ? [{ name: "API_PUBLIC_URL", value: apiOrigin }] : []),
    ...(appOrigin ? [{ name: "APP_BASE_URL", value: appOrigin }] : []),
    ...(args.runTaskImageDigest ? [{ name: "RUN_TASK_IMAGE_DIGEST", value: args.runTaskImageDigest }] : []),
    // SEC.3 — the pod's AppArmor profile type + Localhost name (verbatim k8s enum values; a rollback
    // to the previous profile posture is a config flip, never a code revert).
    ...(args.runTaskAppArmorType ? [{ name: "RUN_TASK_APPARMOR_TYPE", value: args.runTaskAppArmorType }] : []),
    ...(args.runTaskAppArmorLocalhostProfile
      ? [{ name: "RUN_TASK_APPARMOR_LOCALHOST_PROFILE", value: args.runTaskAppArmorLocalhostProfile }]
      : []),
    // OPS.1 — API_INTERNAL_URL + ANTHROPIC_BASE_URL moved into the worker's in-loop envs: the api's
    // `*.run.app` uri only exists once the loop has created it, and the proxy URL resolves off the
    // MIG's reserved internal IP when `rhema:proxyBaseUrl` is unset.
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
  }, { dependsOn: containerPrereqs });

  // --- ONB.1 (ADR-044): the warm `convert-svc` Cloud Run SERVICE — the §13.5 `import_preview_p95_s`
  // ≤20 s leg for the text formats (md/txt/html/docx); PDFs + ingest.sync re-conversion stay on the
  // Job above. It runs the SAME image (`--serve` picks the HTTP entrypoint in main.ts) under the SAME
  // `convert` SA — every §12.1/§13.3 isolation property is preserved verbatim: gcsfuse `/usercontent`
  // volume (its only I/O path), no vpcAccess, no DB credential, no GCS client in the process, and the
  // SA's single write grant is the conditioned `converted/` prefix (iam.ts). The interactive posture
  // adds exactly two constraints of its own: invoker-gated (api mints an OIDC token per hop — LIVE
  // FINDING 11's pattern) and min-instance warmth on prod only (non-prod scales to zero — a cold
  // preview there is slower but never wrong).
  const convertSvc = new gcp.cloudrunv2.Service(name("convert-svc"), {
    location: region,
    deletionProtection: cfg.kind === "prod",
    ingress: "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
    template: {
      serviceAccount: iam.serviceAccounts["convert"].email,
      scaling: {
        // The warm pool is the entire point of the service — prod keeps one resident instance
        // (the stage fact `cloudRun.convertSvc.minInstances`); dev/preview scale to zero (the
        // latency SLO is a prod contract; a cold non-prod preview just reads slower).
        minInstanceCount: cfg.cloudRun.convertSvc.minInstances,
        maxInstanceCount: cfg.cloudRun.convertSvc.maxInstances,
      },
      volumes: [
        {
          name: "usercontent",
          gcs: { bucket: args.buckets["user-content"].name, readOnly: false },
        },
      ],
      containers: [
        {
          image: imageFor("convert"),
          args: ["--serve"],
          resources: {
            // COST.1 (REQ-COST-2) — `cpuIdle` is declared EXPLICITLY from the stage fact: the
            // live service carried an out-of-band `cpu-throttling:"false"` (instance-billed,
            // +$42/mo) that an undeclared program could never converge. `request`-billed
            // restores the committed intent; `pulumi up` reverts the drift. NEVER leave this
            // field implicit again — a billed-posture divergence must be codified or reverted.
            cpuIdle: cfg.cloudRun.convertSvc.cpuBilling === "request",
            startupCpuBoost: cfg.cloudRun.convertSvc.resources?.startupCpuBoost ?? false,
            // Mammoth/pdf.js spikes sit under the Job's default — 1Gi headroom for the warm path.
            limits: {
              cpu: cfg.cloudRun.convertSvc.resources?.cpu ?? "1",
              memory: cfg.cloudRun.convertSvc.resources?.memory ?? "1Gi",
            },
          },
          envs: [
            { name: "CONVERT_ROOT", value: "/usercontent" },
            // PORT is NOT settable — Cloud Run reserves+injects it (400 "reserved env names"),
            // and serveConvert already defaults `process.env.PORT ?? 8080` to the platform value.
          ],
          volumeMounts: [{ name: "usercontent", mountPath: "/usercontent" }],
        },
      ],
      // Same posture as the Job: NO vpcAccess. The process holds no network client and the mount is
      // the platform's — the egress bound is process + IAM level, probed live (run ledger egress leg).
    },
  }, {
    // gcsfuse mounts user-content at start: the revision must not roll before the convert SA's
    // conditioned read/write grants exist (PermissionDenied → exit 255 — live finding, dev u68).
    dependsOn: containerPrereqs,
    // OPS.2 — the SERVICE-LEVEL `scaling` block (the v2 API's manual/scalingMode surface) reads back
    // zeroed on every refresh (`{manualInstanceCount:0, minInstanceCount:0, scalingMode:""}` — the
    // cosmetic `-scaling` diff every preview showed since STB.1). The program deliberately manages
    // only `template.scaling`; the readback field is declared unmanaged here so an unchanged tree
    // previews at 0 updates — this option must never be dropped without re-auditing the field.
    ignoreChanges: ["scaling"],
  });

  // --- OPS.1 (owned decision (b)) — the in-VPC `migrate` Cloud Run JOB on non-prod stages. The DB is
  // private-IP only, so migrations/seeds run inside the VPC: this Job runs the worker image's
  // `dist/migrate.js` entry (migrations → `ALTER ROLE … LOGIN` for the generated role passwords → the
  // preview-safe seed → the `deployments` provenance row) under the worker SA with the three composed
  // DSNs mounted via secretKeyRef — never plaintext env. Prod keeps its operator-tunnel path
  // (integration/live-prod-bringup); nothing about prod's migrate flow changes. The worker image is
  // reused so the Job always carries the SAME built schema/migrations the deploy pins. ---
  const migrateEnvs: pulumi.Input<gcp.types.input.cloudrunv2.JobTemplateTemplateContainerEnv>[] = [
    { name: "RHEMA_STAGE", value: stack }, // stageKindFor decides the seed posture (preview → refuse seedRealProjects, REQ-ARCH-38)
    ...(requires("system-database-url")
      ? [
          {
            name: "SYSTEM_DATABASE_URL",
            valueSource: {
              secretKeyRef: { secret: secrets.byId["system-database-url"].secretId, version: "latest" },
            },
          },
        ]
      : []),
    ...(requires("app-database-url")
      ? [
          {
            name: "APP_DATABASE_URL",
            valueSource: {
              secretKeyRef: { secret: secrets.byId["app-database-url"].secretId, version: "latest" },
            },
          },
        ]
      : []),
    ...(requires("collab-database-url")
      ? [
          {
            name: "COLLAB_DATABASE_URL",
            valueSource: {
              secretKeyRef: { secret: secrets.byId["collab-database-url"].secretId, version: "latest" },
            },
          },
        ]
      : []),
    // REQ-ARCH-39 — the `deployments` provenance row is written by the same Job once the deploy facts
    // (chain-tip SHA, the digest map incl run-task/proxy, the computed protocols version) are pinned.
    ...(args.gitSha && args.protocolsVersion
      ? [
          { name: "RECORD_DEPLOYMENT", value: "1" },
          { name: "GIT_SHA", value: args.gitSha },
          { name: "PROTOCOLS_VERSION", value: args.protocolsVersion },
          {
            name: "IMAGE_DIGESTS",
            // The deployments-table validator wants the bare `sha256:<hex>` content digest per
            // service — strip any registry/repo prefix from the refs (live finding, dev migrate
            // execution 3: "image digest must be a sha256:<64 hex> content digest").
            value: pulumi
              .all([
                pulumi.output(args.serviceImages ?? {}),
                pulumi.output(args.runTaskImageDigest ?? ""),
                pulumi.output(args.proxyImage ?? ""),
              ])
              .apply(([imgs, runTask, proxy]) => {
                const digestOf = (ref: string) => ref.match(/sha256:[0-9a-f]{64}/)?.[0] ?? ref;
                const digests: Record<string, string> = {};
                for (const [svc, ref] of Object.entries(imgs)) digests[svc] = digestOf(ref);
                if (runTask) digests["run-task"] = digestOf(runTask);
                if (proxy) digests["egress-proxy"] = digestOf(proxy);
                return JSON.stringify(digests);
              }),
          },
        ]
      : []),
  ];
  const migrateJob =
    cfg.kind !== "prod"
      ? new gcp.cloudrunv2.Job(name("migrate"), {
          location: region,
          // Same v2 default as the services below: the job is non-prod-only anyway, but the flag
          // must be explicit or `pulumi destroy` 400s mid-teardown (live finding, dev destroy 1).
          deletionProtection: false,
          template: {
            template: {
              serviceAccount: iam.serviceAccounts["worker"].email,
              timeout: "900s",
              maxRetries: 1,
              vpcAccess: {
                networkInterfaces: [
                  { network: network.network.id, subnetwork: network.subnets["private-app"].id },
                ],
                egress: "PRIVATE_RANGES_ONLY",
              },
              containers: [
                {
                  // The image carries no ENTRYPOINT (CMD only), so `args` IS the whole argv —
                  // the same worker image runs its migrate entry, so the Job always carries the
                  // deploy's built migrations.
                  image: imageFor("worker"),
                  args: ["node", "/app/dist/migrate.js"],
                  envs: migrateEnvs,
                },
              ],
            },
          },
        }, {
          dependsOn: containerPrereqs,
        })
      : undefined;

  // --- Cloud Run services: placeholder image, per-service SA, VPC egress to the private-app tier. ----
  const services: Partial<Record<ServiceName, gcp.cloudrunv2.Service>> = {};
  for (const svc of CLOUD_RUN_SERVICES) {
    // The worker consumes pg-boss + runs crons: it CANNOT scale to zero and needs CPU allocated OUTSIDE a
    // request (background work), so its stage posture is min-instances=1 + `instance` billing with its env
    // baked on. A tiny
    // health server (main.ts) answers the Cloud Run startup probe. It also does the ~event-loop-blocking cold
    // import of @kubernetes/client-node on the first GKE launch (D-P0.15e-3), which STARVED under the default
    // 512Mi / throttled CPU (diagnosed live 2026-09-09 — the first launch hung ~9 min): pin 1 vCPU + 1Gi and
    // startup CPU boost so the cold import finishes in seconds — all carried by `cfg.cloudRun.services`.
    // (A gcloud image-swap that omits these silently
    // reverts to the throttled default — the live-deploy step must preserve them, hence they live in IaC.)
    const isWorker = svc === "worker";
    // COST.1 (REQ-COST-3) — min/max instances + CPU-billing are stage FACTS now (stages.ts),
    // not program ternaries: a lever is a fact flip the tests pin, and `cpuIdle` is declared
    // on EVERY service so a live `cpu-throttling` drift can never sit split from IaC again
    // (the convert-svc finding, REQ-COST-2 — codify-or-revert, never left split).
    const posture = cfg.cloudRun.services[svc];
    services[svc] = new gcp.cloudrunv2.Service(name(svc), {
      location: region,
      // Cloud Run v2 defaults deletionProtection=true, which BLOCKS a `pulumi destroy` of a dev/preview stack
      // (surfaced live 2026-09-04 — the teardown errored on all 7 services). Match the AlloyDB/GKE policy: only
      // prod is protected, so a dev/preview stack tears down cleanly to honor the cost-conscious mandate.
      deletionProtection: cfg.kind === "prod",
      // `web` is internet-facing; everything else is reachable only via the internal/LB path.
      // SEC.2 (ADR-040) — prod's web is LB-only too: the penultimate-XFF client-IP derivation holds
      // ONLY when every request crossed the external LB (a direct run.app hit lets the caller control
      // the second-to-last hop, which the OIDC stamp would then carry upstream as "trusted"). Non-prod
      // keeps INGRESS_TRAFFIC_ALL — no public DNS fronts those stages' LBs, so run.app is how they're
      // reached (the stamped-IP channel is inert there anyway: INTERNAL_AUTH_AUDIENCE is unset).
      // OPS.1 (F-OPS.1-8) — the api also gets ALL off prod: no LB exists there, the service already
      // carries a deliberate allUsers invoker grant for smoke/journey reachability, and every
      // caller (web proxy, worker, runbook curls) would otherwise 404 at the GFE — Cloud
      // Run-to-Cloud Run over run.app does NOT ride a private path under PRIVATE_RANGES_ONLY egress.
      ingress:
        (svc === "web" || svc === "api") && cfg.kind !== "prod"
          ? "INGRESS_TRAFFIC_ALL"
          : "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
      template: {
        serviceAccount: iam.serviceAccounts[svc].email,
        scaling: {
          minInstanceCount: posture.minInstances,
          maxInstanceCount: posture.maxInstances,
        },
        containers: [
          {
            // PRB.15 — the real digest-pinned image when `rhema:serviceImages` names one; otherwise the
            // placeholder keeps `pulumi preview` plannable before the images CI publishes.
            image: imageFor(svc),
            // COST.1 — `cpuIdle` declared on every service from its stage fact: `request` billing
            // is the cold-floor default; only the worker's `instance` posture keeps CPU between
            // requests. `limits`/boost emit only where the posture declares a resource shape.
            resources: {
              cpuIdle: posture.cpuBilling === "request",
              ...(posture.resources?.startupCpuBoost ? { startupCpuBoost: true } : {}),
              ...(posture.resources
                ? { limits: { cpu: posture.resources.cpu, memory: posture.resources.memory } }
                : {}),
            },
            ...(isWorker
              ? {
                  envs: [
                    ...workerEnvs,
                    // OPS.1 — the api's internal URL + the proxy base URL: on prod these come from
                    // `rhema:internalApiUrl`/`rhema:proxyBaseUrl` config (and the domains' api origin);
                    // on non-prod they self-wire to the api service's `*.run.app` uri (created earlier
                    // in this loop) and the proxy MIG's reserved internal IP. Same in-VPC reachability
                    // as prod — Cloud Run-to-Cloud Run rides Google's internal path.
                    ...(args.internalApiUrl || apiOrigin || services["api"]
                      ? [
                          {
                            name: "API_INTERNAL_URL",
                            value: args.internalApiUrl ?? apiOrigin ?? services["api"]!.uri,
                          },
                        ]
                      : []),
                    ...(args.proxyBaseUrl || proxyIp
                      ? [
                          {
                            name: "ANTHROPIC_BASE_URL",
                            value:
                              args.proxyBaseUrl ??
                              pulumi.interpolate`http://${proxyIp!.address}:${proxyPort}`,
                          },
                        ]
                      : []),
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
                    // walkthrough generator points at (INGEST_MODEL_KEY_SECRET overrides).
                    ...(requires("anthropic-api-key")
                      ? [{ name: "INGEST_MODEL_KEY_SECRET", value: secretVersion(secrets.anthropicApiKey) }]
                      : []),
                    // RUN.1 — the walkthrough generator's model key: the same anthropic-api-key secret
                    // VERSION the proxy reads (worker SA holds secretAccessor — iam.ts `worker-reads-
                    // anthropic`; ADR-052). Never the value — the worker `access`es the name at boot;
                    // unset on stages without the provider key ⇒ the failing stub binds.
                    ...(requires("anthropic-api-key")
                      ? [{ name: "WALKTHROUGH_MODEL_KEY_SECRET", value: secretVersion(secrets.anthropicApiKey) }]
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
                    // ECON.1 — `debit.mode` (ADR-031): the api's run-create/finalize paths read it.
                    // All stages ship `committed`; the operator flips the stage fact post-notice.
                    { name: "DEBIT_MODE", value: cfg.debitMode },
                    // DEF.4 — `refundWindow.mode` (ADR-071): the api's refund route + report block
                    // read it. `test_tenants` admits only `is_test` workspaces — closed for every
                    // real user; `open` flips by operator commit after BL-30 (D-DEF.4-3).
                    { name: "REFUND_WINDOW_MODE", value: cfg.refundWindowMode },
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
                    // VERIF.2 — mount the NAME whenever the container exists on this stack
                    // (non-prod stacks carry the container + placeholder even though
                    // `google-oauth-client-secret` is not in `requiredSecrets`; without the env
                    // the api's authSecretsReady gate stays closed — F-VERIF.2-2).
                    ...(secrets.byId["google-oauth-client-secret"]
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
                    // ONB.1 (ADR-044) — the warm preview path: `convert-svc` first (≤20 s for text
                    // formats), the Job above as the fallback + the PDF/batch leg. The api mints an
                    // OIDC token per hop (the same invoker-gated pattern as fetcher/export).
                    { name: "CONVERT_SERVICE_URL", value: convertSvc.uri },
                    ...(apiOrigin ? [{ name: "API_PUBLIC_URL", value: apiOrigin }] : []),
                    ...(appOrigin ? [{ name: "APP_BASE_URL", value: appOrigin }] : []),
                    // SEC.2 (ADR-040) — the trusted web→api client-IP channel: the api verifies the
                    // web runtime SA's OIDC token (signature vs Google's JWKS + iss/aud/exp + the
                    // pinned caller SA) before honoring `x-rhema-client-ip`. Audience = the api
                    // origin; both are plain deploy config, never secrets.
                    ...(apiOrigin ? [{ name: "INTERNAL_AUTH_AUDIENCE", value: apiOrigin }] : []),
                    { name: "INTERNAL_CALLER_SA", value: iam.serviceAccounts["web"].email },
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
                    // OPS.1 — the api's SYSTEM_DATABASE_URL (the circuit-breaker read + PgBoss) mounts
                    // the generated `postgres`-role DSN via secretKeyRef on non-prod stages; the
                    // `apiSystemDatabaseUrl` config path stays the prod fallback.
                    ...(requires("system-database-url")
                      ? [
                          {
                            name: "SYSTEM_DATABASE_URL",
                            valueSource: {
                              secretKeyRef: {
                                secret: secrets.byId["system-database-url"].secretId,
                                version: "latest",
                              },
                            },
                          },
                        ]
                      : args.apiSystemDatabaseUrl
                        ? [{ name: "SYSTEM_DATABASE_URL", value: args.apiSystemDatabaseUrl }]
                        : []),
                    ...(args.apiRedisUrl ? [{ name: "REDIS_URL", value: args.apiRedisUrl }] : []),
                    // DEF.2 (F6) — the estimate claim pre-pass rides the egress proxy (the api holds
                    // no provider key; it presents a purpose-minted credential). Same `rhema:proxyBaseUrl`
                    // the worker hands pods as `ANTHROPIC_BASE_URL`; unset ⇒ estimates stay provisional.
                    // OPS.1 — on non-prod the proxy URL self-wires to the MIG's reserved internal IP
                    // (same in-VPC hop as the worker's ANTHROPIC_BASE_URL below).
                    ...(args.proxyBaseUrl || proxyIp
                      ? [
                          {
                            name: "EGRESS_PROXY_URL",
                            value:
                              args.proxyBaseUrl ??
                              pulumi.interpolate`http://${proxyIp!.address}:${proxyPort}`,
                          },
                        ]
                      : []),
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
                    // OPS.1 — prod keeps the LB api origin; non-prod self-wires the api service's
                    // `*.run.app` uri (created earlier in this loop — export/fetcher/api precede web)
                    // since there is no public DNS/LB host for the api off prod. The api stays
                    // internal-ingress: web reaches it over Google's internal path, never the browser.
                    ...(apiOrigin
                      ? [{ name: "API_BASE_URL", value: apiOrigin }]
                      : [{ name: "API_BASE_URL", value: services["api"]!.uri }]),
                    // SEC.2 (ADR-040) — the audience the web mints its OIDC ID token for when it stamps
                    // `x-rhema-client-ip` on server-side api calls (the metadata server ambient
                    // credential — no secret). Unset ⇒ no stamp (local dev posture).
                    ...(apiOrigin ? [{ name: "INTERNAL_AUTH_AUDIENCE", value: apiOrigin }] : []),
                    // PRB.16 — the app's own public origin: the OAuth/magic-link `callbackURL` base the
                    // web's auth proxy builds (it must equal the api's trusted origin — the app host).
                    ...(appOrigin ? [{ name: "APP_BASE_URL", value: appOrigin }] : []),
                    // P1.03 — the Page's collab transport: same-origin WSS on the APP host (the
                    // `__Host-` session cookie rides the upgrade; the LB path-routes /collab/*).
                    // Only exists when real domains + the LB host map do — a run.app origin
                    // cannot path-route /collab, so previews omit the wire (static read view).
                    ...(domains
                      ? [{ name: "COLLAB_WS_URL", value: `wss://${domains.app}/collab` }]
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
    }, {
      // Every service mounting secretKeyRef versions (api/worker/collab DATABASE_URLs, OPS_ALERT)
      // or reaching GCS/SM through its SA's grants must roll after those resources exist —
      // live finding, dev update 68.
      dependsOn: containerPrereqs,
      // OPS.2 — same service-level `scaling` readback drift as `convert-svc` above (see that
      // comment): `{manualInstanceCount:0, minInstanceCount:0, scalingMode:""}` is a readback
      // artifact the program does not manage (template.scaling is the managed surface).
      // Declared unmanaged so a no-change preview reports 0 updates.
      ignoreChanges: ["scaling"],
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

  // ONB.1 — api → convert-svc service-to-service invoker (the LIVE FINDING 11 pattern like
  // fetcher/export): the warm service is invoker-gated — the api mints an OIDC ID token per hop
  // (createConvertServicePreview in live-clients). Service-scoped, never project-scoped.
  new gcp.cloudrunv2.ServiceIamMember(name("api-invokes-convert-svc"), {
    location: region,
    name: convertSvc.name,
    role: "roles/run.invoker",
    member: pulumi.interpolate`serviceAccount:${iam.serviceAccounts["api"].email}`,
  });

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
  // AMENDED 2026-10-21 (ADR-113, R6UCD.1): delivery is API-MINTED GCS V4 signed GETs on
  // storage.googleapis.com — the edge-signed CDN contract never worked (the LB→bucket origin read
  // was denied; the edge cannot sign for a private origin it cannot read) and the operator ruled
  // its repair out. This backend bucket + host rule stay DEPLOYED BUT INERT — nothing in the
  // codebase emits `usercontent.*` URLs and the CDN signing key is uninstalled/unreferenced;
  // removal is a separate cost/infra decision, not this ticket.
  const userContentBackend = domains
    ? new gcp.compute.BackendBucket(name("usercontent-backend"), {
        bucketName: args.buckets["user-content"].name,
        enableCdn: true, // INERT (ADR-113) — the edge-signed contract is retired; kept only because CDN removal is its own decision
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
      : {
          // OPS.1 — non-prod has no real hostnames, so the wildcard matcher carries the same
          // service split path-first: `/api/*` + `/healthz` reach api (the only way to smoke the
          // internal-ingress service from outside the VPC), `/collab*` reaches collab, everything
          // else lands on web. Mirrors the prod "app" matcher's collab carve-out.
          hostRules: [{ hosts: ["*"], pathMatcher: "all" }],
          pathMatchers: [
            {
              name: "all",
              defaultService: webBackend.id,
              pathRules: [
                { paths: ["/collab", "/collab/*"], service: collabBackend.id },
                { paths: ["/api", "/api/*", "/healthz"], service: apiBackend.id },
              ],
            },
          ],
        }),
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
  // OPS.1 — the managed cert can never reach ACTIVE on a stage with no real DNS, which would leave
  // the LB's 443 dead for smoke/journey traffic. On non-prod the program mints a self-signed cert
  // (Pulumi-state-encrypted key, same story as the generated secrets) and lists it FIRST on the
  // proxy so `curl -k https://<lb-ip>/…` — and Playwright with ignoreHTTPSErrors — actually
  // handshake. Prod keeps managed-cert-only.
  let selfSignedCert: gcp.compute.SSLCertificate | undefined;
  if (!domains) {
    const key = new tls.PrivateKey(name("lb-key"), { algorithm: "RSA", rsaBits: 2048 });
    const selfSigned = new tls.SelfSignedCert(name("lb-self-signed"), {
      privateKeyPem: key.privateKeyPem,
      subject: { commonName: `${stack}.rhema.dev` },
      dnsNames: [`${stack}.rhema.dev`],
      validityPeriodHours: 24 * 30,
      allowedUses: ["server_auth", "digital_signature", "key_encipherment"],
    });
    selfSignedCert = new gcp.compute.SSLCertificate(name("self-cert"), {
      certificate: selfSigned.certPem,
      privateKey: key.privateKeyPem,
    });
  }
  const httpsProxy = new gcp.compute.TargetHttpsProxy(name("https-proxy"), {
    urlMap: urlMap.id,
    sslCertificates: [...(selfSignedCert ? [selfSignedCert.id] : []), cert.id],
  });
  // A reserved global IPv4 gives the operator ONE stable anycast address for every prod DNS record —
  // without it the forwarding rule's ephemeral IP can churn and silently break DNS. R6POST.2 — a
  // ruled posture stage ADOPTS its pre-created address (`GlobalAddress.get` — not a managed
  // resource, so `destroy` leaves it for the out-of-band teardown step that owns it).
  const lbAddress = args.lbAddressName
    ? gcp.compute.GlobalAddress.get(
        name("lb-ip"),
        pulumi.interpolate`projects/${project}/global/addresses/${args.lbAddressName}`,
      )
    : domains
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
    convertSvc,
    lbIpAddress: lbAddress?.address,
    dnsRecords,
  };
}
