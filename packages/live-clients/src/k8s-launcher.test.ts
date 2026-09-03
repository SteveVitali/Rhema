import { describe, it, expect } from "vitest";
import type { JobSpec } from "@rhema/orchestrator";
import {
  GkeJobLauncher,
  buildRunTaskJobManifest,
  buildRunTaskSecretManifest,
  kubeName,
  runJobName,
  runSecretName,
  HARNESS_UID,
  HARNESS_SECRET_MOUNT,
  RUN_TOKEN_FILE,
  type GkeLauncherConfig,
  type KubeBatchApi,
  type KubeCoreApi,
} from "./k8s-launcher.js";

const config: GkeLauncherConfig = {
  namespace: "runs",
  sandboxNodePool: "sandbox-pool",
  imageRepo: "us-central1-docker.pkg.dev/rhema-507501/rhema/run-task",
  internalApiUrl: "http://api.internal:8080",
  proxyBaseUrl: "http://egress-proxy:8443",
  kubeServiceAccount: "run-task-sa",
};

const spec: JobSpec = {
  runId: "run_ABC123",
  attempt: 2,
  imageDigest: "sha256:deadbeef",
  workspaceId: "ws_1",
  projectId: "proj_1",
  serviceAccount: "run-sa@rhema-507501.iam.gserviceaccount.com",
  runToken: "tok.abc",
  proxyCredential: "run_ABC123.2.sec",
};

describe("kubeName", () => {
  it("lowercases, replaces invalid chars, collapses dashes, and trims", () => {
    expect(kubeName("run", "run_ABC123", "a2")).toBe("run-run-abc123-a2");
    expect(kubeName("Foo__Bar!!")).toBe("foo-bar");
  });
  it("truncates to 63 chars", () => {
    expect(kubeName("x".repeat(80)).length).toBe(63);
  });
});

describe("buildRunTaskJobManifest", () => {
  const job = buildRunTaskJobManifest(config, spec);
  const podSpec = (job.spec.template as { spec: Record<string, unknown> }).spec;
  const container = (podSpec.containers as Array<Record<string, unknown>>)[0]!;

  it("names the Job for the run attempt", () => {
    expect(job.metadata.name).toBe(runJobName(spec));
    expect(job.metadata.name).toBe("run-run-abc123-a2");
  });

  it("pins the pod to the sandbox node pool", () => {
    expect(podSpec.nodeSelector).toEqual({ "cloud.google.com/gke-nodepool": "sandbox-pool" });
  });

  it("runs the digest-pinned image", () => {
    expect(container.image).toBe("us-central1-docker.pkg.dev/rhema-507501/rhema/run-task@sha256:deadbeef");
  });

  it("grants CAP_SYS_ADMIN, read-only root FS, and starts as the harness uid", () => {
    expect(podSpec.restartPolicy).toBe("Never");
    expect((podSpec.securityContext as { runAsUser: number }).runAsUser).toBe(HARNESS_UID);
    const csc = container.securityContext as { readOnlyRootFilesystem: boolean; capabilities: { add: string[] } };
    expect(csc.readOnlyRootFilesystem).toBe(true);
    expect(csc.capabilities.add).toContain("SYS_ADMIN");
  });

  it("mounts the harness secret read-only at the harness-only path and points env at the files", () => {
    const mounts = container.volumeMounts as Array<{ name: string; mountPath: string; readOnly?: boolean }>;
    const secretMount = mounts.find((m) => m.name === "harness-secrets")!;
    expect(secretMount).toMatchObject({ mountPath: HARNESS_SECRET_MOUNT, readOnly: true });
    const env = container.env as Array<{ name: string; value: string }>;
    expect(env.find((e) => e.name === "RUN_TOKEN_FILE")?.value).toBe(`${HARNESS_SECRET_MOUNT}/${RUN_TOKEN_FILE}`);
    expect(env.find((e) => e.name === "ANTHROPIC_BASE_URL")?.value).toBe(config.proxyBaseUrl);
    // secrets are never in env (REQ-SPEC-10).
    expect(env.find((e) => e.value === spec.runToken)).toBeUndefined();
    expect(env.find((e) => e.value === spec.proxyCredential)).toBeUndefined();
  });

  it("backs work/config/tmp with memory tmpfs and mounts the secret 0400", () => {
    const volumes = podSpec.volumes as Array<Record<string, unknown>>;
    const secretVol = volumes.find((v) => v.name === "harness-secrets")!;
    expect(secretVol.secret).toMatchObject({ secretName: runSecretName(spec), defaultMode: 0o400 });
    expect((volumes.find((v) => v.name === "work")!.emptyDir as { medium: string }).medium).toBe("Memory");
  });
});

describe("buildRunTaskSecretManifest", () => {
  it("carries the run token + proxy credential as stringData", () => {
    const secret = buildRunTaskSecretManifest(config, spec);
    expect(secret.metadata.name).toBe(runSecretName(spec));
    expect(secret.stringData).toEqual({ [RUN_TOKEN_FILE]: "tok.abc", "proxy-credential": "run_ABC123.2.sec" });
  });
});

describe("GkeJobLauncher", () => {
  it("creates the Secret then the Job and returns the Job name", async () => {
    const created: string[] = [];
    const core: KubeCoreApi = {
      createNamespacedSecret: ({ body }) => {
        created.push(`secret:${(body as { metadata: { name: string } }).metadata.name}`);
        return Promise.resolve({});
      },
    };
    const batch: KubeBatchApi = {
      createNamespacedJob: ({ body }) => {
        const name = (body as { metadata: { name: string } }).metadata.name;
        created.push(`job:${name}`);
        return Promise.resolve({ metadata: { name } });
      },
    };
    const launcher = new GkeJobLauncher(config, batch, core);
    const { jobId } = await launcher.launch(spec);
    expect(jobId).toBe("run-run-abc123-a2");
    expect(created).toEqual(["secret:run-run-abc123-a2-secrets", "job:run-run-abc123-a2"]); // secret first
  });
});
