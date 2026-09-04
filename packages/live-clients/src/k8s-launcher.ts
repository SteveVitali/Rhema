// The live `JobLauncher` binding (D-P0.08-1): launch one two-uid run-task Job per run into the GKE sandbox
// node pool (§12.4 step 4). The pod starts as uid `harness`, needs `CAP_SYS_ADMIN` for the scoped-subagent
// mount/unshare kernel isolation, runs a read-only root FS with writable tmpfs, and pulls the DIGEST-PINNED
// run-task image. The per-run run token + proxy credential are delivered to the harness through a per-run k8s
// Secret mounted 0400 at a harness-only path — NEVER the agent's env (REQ-SPEC-10/11); the agent process is
// launched by the harness with a scrubbed env (@rhema/run-task bootstrap).
//
// The manifest construction is PURE (`buildRunTaskSecretManifest` / `buildRunTaskJobManifest`) and unit-tested;
// the launcher is the thin two-call shell (create Secret, create Job) over injectable k8s API surfaces so the
// wiring is testable with fakes. The live binding loads the default in-cluster/kubeconfig via `@kubernetes/client-node`.

import type { JobLauncher, JobSpec } from "@rhema/orchestrator";

/** The two-uid image contract (ledger M11): harness holds the token; the agent runs the SDK with no secrets. */
export const HARNESS_UID = 10001;
export const AGENT_UID = 10002;
export const AGENT_GID = 10002;

/** Harness-only mount for the per-run secret (0400; the agent's setpriv drops the group that can read it). */
export const HARNESS_SECRET_MOUNT = "/var/run/rhema/harness";
export const RUN_TOKEN_FILE = "run-token";
export const PROXY_CREDENTIAL_FILE = "proxy-credential";

/** Static, deploy-provided config the launcher binds once (the per-run bits come from `JobSpec`). */
export interface GkeLauncherConfig {
  /** the k8s namespace run-task Jobs live in. */
  readonly namespace: string;
  /** the GKE node-pool label value the sandbox pool carries (`cloud.google.com/gke-nodepool`). */
  readonly sandboxNodePool: string;
  /** the Artifact Registry image repo the digest pins into (`<region>-docker.pkg.dev/<proj>/<repo>/run-task`). */
  readonly imageRepo: string;
  /** the internal run API base URL the harness calls (`API_INTERNAL_URL`). */
  readonly internalApiUrl: string;
  /** the egress-proxy base URL the sandbox's only egress route points at (`ANTHROPIC_BASE_URL`). */
  readonly proxyBaseUrl: string;
  /** the GCS bucket the harness materializes `/work` from (`OBJECTS_BUCKET`). */
  readonly objectsBucket: string;
  /** the writable config dir the harness writes the agent phase spec + hook socket to (`CLAUDE_CONFIG_DIR`;
   *  defaults to the `/config` tmpfs mount). No secret is written here — the agent reads its spec from it. */
  readonly configDir?: string;
  /** the Workload-Identity-bound k8s ServiceAccount name the pod runs as (annotated with the GSA). */
  readonly kubeServiceAccount: string;
  /** clean up a finished Job after this many seconds (defaults to 1 h). */
  readonly ttlSecondsAfterFinished?: number;
  /** hard wall-clock ceiling for a run pod (defaults to 6 h). */
  readonly activeDeadlineSeconds?: number;
}

/** A k8s name: lowercase alphanumeric + `-`, ≤63 chars, starting/ending alphanumeric (RFC 1123 label). */
export function kubeName(...parts: string[]): string {
  let name = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "");
  if (name.length > 63) name = name.slice(0, 63);
  return name.replace(/-+$/, "");
}

/** The Job name for a run attempt. */
export function runJobName(spec: Pick<JobSpec, "runId" | "attempt">): string {
  return kubeName("run", spec.runId, `a${spec.attempt}`);
}

/** The per-run Secret name for a run attempt. */
export function runSecretName(spec: Pick<JobSpec, "runId" | "attempt">): string {
  return kubeName("run", spec.runId, `a${spec.attempt}`, "secrets");
}

/** A minimal typed k8s Secret manifest (structurally a `V1Secret`; the launcher casts at the API boundary). */
export interface KubeSecretManifest {
  readonly apiVersion: "v1";
  readonly kind: "Secret";
  readonly type: "Opaque";
  readonly metadata: { name: string; namespace: string; labels: Record<string, string> };
  readonly stringData: Record<string, string>;
}

/** A minimal typed k8s Job manifest (structurally a `V1Job`; the launcher casts at the API boundary). */
export interface KubeJobManifest {
  readonly apiVersion: "batch/v1";
  readonly kind: "Job";
  readonly metadata: { name: string; namespace: string; labels: Record<string, string> };
  readonly spec: Record<string, unknown>;
}

/** The stable label set on a run's Job + Secret (for the cleanup cron and observability). */
export function runLabels(spec: JobSpec): Record<string, string> {
  const labels: Record<string, string> = {
    "app.kubernetes.io/name": "run-task",
    "rhema.dev/run-id": kubeName(spec.runId),
    "rhema.dev/workspace-id": kubeName(spec.workspaceId),
    "rhema.dev/attempt": String(spec.attempt),
  };
  if (spec.projectId) labels["rhema.dev/project-id"] = kubeName(spec.projectId);
  return labels;
}

/** Build the per-run harness Secret carrying the run token + proxy credential (0400, harness-only). */
export function buildRunTaskSecretManifest(config: GkeLauncherConfig, spec: JobSpec): KubeSecretManifest {
  const stringData: Record<string, string> = {};
  if (spec.runToken) stringData[RUN_TOKEN_FILE] = spec.runToken;
  if (spec.proxyCredential) stringData[PROXY_CREDENTIAL_FILE] = spec.proxyCredential;
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "Opaque",
    metadata: { name: runSecretName(spec), namespace: config.namespace, labels: runLabels(spec) },
    stringData,
  };
}

/** Build the two-uid run-task Job manifest for a run attempt. */
export function buildRunTaskJobManifest(config: GkeLauncherConfig, spec: JobSpec): KubeJobManifest {
  const name = runJobName(spec);
  const secretName = runSecretName(spec);
  const image = `${config.imageRepo}@${spec.imageDigest}`;
  const labels = runLabels(spec);
  const env: Array<{ name: string; value: string }> = [
    { name: "RUN_ID", value: spec.runId },
    { name: "RUN_ATTEMPT", value: String(spec.attempt) },
    { name: "WORKSPACE_ID", value: spec.workspaceId },
    { name: "API_INTERNAL_URL", value: config.internalApiUrl },
    { name: "ANTHROPIC_BASE_URL", value: config.proxyBaseUrl },
    // the harness materializes /work read-only from this GCS bucket (server-generated hydration manifest).
    { name: "OBJECTS_BUCKET", value: config.objectsBucket },
    // the harness writes the agent's phase spec + hook socket here (a writable tmpfs; NO secret — the agent
    // reads its spec from this dir). The harness fetches the RUN_SPEC token-authed (D-P0.15c-6), not from a file.
    { name: "CLAUDE_CONFIG_DIR", value: config.configDir ?? "/config" },
    // the harness reads the token + credential from the mounted files, NOT from env (REQ-SPEC-10).
    { name: "RUN_TOKEN_FILE", value: `${HARNESS_SECRET_MOUNT}/${RUN_TOKEN_FILE}` },
    { name: "PROXY_CREDENTIAL_FILE", value: `${HARNESS_SECRET_MOUNT}/${PROXY_CREDENTIAL_FILE}` },
  ];
  if (spec.projectId) env.push({ name: "PROJECT_ID", value: spec.projectId });

  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name, namespace: config.namespace, labels },
    spec: {
      // The orchestrator (pg-boss retry + the reaper) owns retries; a launched pod runs its attempt once.
      backoffLimit: 0,
      ttlSecondsAfterFinished: config.ttlSecondsAfterFinished ?? 3600,
      activeDeadlineSeconds: config.activeDeadlineSeconds ?? 6 * 3600,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: "Never",
          serviceAccountName: config.kubeServiceAccount,
          // pin the pod to the isolated sandbox node pool (no Cloud NAT / no default route — REQ-ARCH-2).
          nodeSelector: { "cloud.google.com/gke-nodepool": config.sandboxNodePool },
          containers: [
            {
              name: "run-task",
              image,
              env,
              // The Phase-0 stand-in image (bookworm-slim) starts as ROOT under tini ONLY so its entrypoint can
              // drop root → harness (uid 10001) → agent (uid 10002) via setpriv, then unshare/mount the scoped-
              // subagent namespaces. Root is dropped immediately and does nothing else (Dockerfile). The
              // hardened distroless + ambient-caps + runAsNonRoot target is D-P0.06-3. Least-privilege here:
              // drop ALL, then add back exactly the caps the privilege-drop + mount isolation need.
              securityContext: {
                readOnlyRootFilesystem: true,
                capabilities: {
                  // SETUID/SETGID: the harness→agent uid drop (setpriv). SYS_ADMIN: unshare/mount the input-
                  // scoped subagent namespaces (§12.6). SYS_CHROOT: the scoped-runner chroot.
                  add: ["SETUID", "SETGID", "SYS_ADMIN", "SYS_CHROOT"],
                  drop: ["ALL"],
                },
                allowPrivilegeEscalation: true,
              },
              volumeMounts: [
                { name: "harness-secrets", mountPath: HARNESS_SECRET_MOUNT, readOnly: true },
                { name: "work", mountPath: "/work" },
                { name: "config", mountPath: "/config" },
                { name: "tmp", mountPath: "/tmp" },
              ],
            },
          ],
          volumes: [
            // 0400, harness-only: the per-run token + credential. The agent uid drops the harness group (setpriv
            // --clear-groups) so it cannot read this even though the file exists in the pod.
            { name: "harness-secrets", secret: { secretName, defaultMode: 0o400 } },
            { name: "work", emptyDir: { medium: "Memory" } },
            { name: "config", emptyDir: { medium: "Memory" } },
            { name: "tmp", emptyDir: { medium: "Memory" } },
          ],
        },
      },
    },
  };
}

/** The minimal k8s BatchV1 surface the launcher uses (`@kubernetes/client-node` `BatchV1Api` satisfies it). */
export interface KubeBatchApi {
  createNamespacedJob(args: { namespace: string; body: unknown }): Promise<{ metadata?: { name?: string; uid?: string } }>;
}
/** The minimal k8s CoreV1 surface the launcher uses (`CoreV1Api` satisfies it). */
export interface KubeCoreApi {
  createNamespacedSecret(args: { namespace: string; body: unknown }): Promise<unknown>;
}

/**
 * `JobLauncher` over the k8s API. `launch` creates the per-run harness Secret, then the Job that mounts it, and
 * returns the created Job's id (name). Idempotency + fencing live upstream (the orchestrator rotates the attempt
 * and revokes the prior credential); a launch is one attempt.
 */
export class GkeJobLauncher implements JobLauncher {
  constructor(
    private readonly config: GkeLauncherConfig,
    private readonly batch: KubeBatchApi,
    private readonly core: KubeCoreApi,
  ) {}

  async launch(spec: JobSpec): Promise<{ jobId: string }> {
    const secret = buildRunTaskSecretManifest(this.config, spec);
    const job = buildRunTaskJobManifest(this.config, spec);
    await this.core.createNamespacedSecret({ namespace: this.config.namespace, body: secret });
    const created = await this.batch.createNamespacedJob({ namespace: this.config.namespace, body: job });
    return { jobId: created.metadata?.name ?? job.metadata.name };
  }
}

/**
 * Construct a live `GkeJobLauncher` from the ambient kubeconfig (in-cluster SA in the worker pod, or a local
 * kubeconfig for a dev deploy). Dynamically imports `@kubernetes/client-node` so this package's pure tests never
 * load the heavy client. Called once at worker deploy.
 */
export async function createGkeJobLauncher(config: GkeLauncherConfig): Promise<GkeJobLauncher> {
  const k8s = await import("@kubernetes/client-node");
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const batch = kc.makeApiClient(k8s.BatchV1Api) as unknown as KubeBatchApi;
  const core = kc.makeApiClient(k8s.CoreV1Api) as unknown as KubeCoreApi;
  return new GkeJobLauncher(config, batch, core);
}
