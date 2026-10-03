import { describe, it, expect } from "vitest";
import type { JobSpec } from "@rhema/orchestrator";
import {
  GkeJobLauncher,
  MetadataTokenGkeJobLauncher,
  buildGkeKubeConfigOptions,
  buildRunTaskJobManifest,
  buildRunTaskSecretManifest,
  fetchGceMetadataAccessToken,
  fetchGceMetadataIdToken,
  GCE_METADATA_TOKEN_URL,
  GCE_METADATA_IDENTITY_URL,
  kubeName,
  runJobName,
  runSecretName,
  HARNESS_GID,
  HARNESS_SECRET_MOUNT,
  RUN_TASK_APPARMOR_PROFILE,
  RUN_TOKEN_FILE,
  type FetchLike,
  type GkeLauncherConfig,
  type KubeBatchApi,
  type KubeClientModule,
  type KubeConfigOptions,
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

  it("SLO.1 — pulls IfNotPresent: the digest pins the bytes, so a warm node's cache is always valid", () => {
    expect(container.imagePullPolicy).toBe("IfNotPresent");
  });

  it("accepts a fully-qualified repo@digest ref verbatim (the deploy config's pinning shape; PRB.16)", () => {
    const qualified = buildRunTaskJobManifest(config, {
      ...spec,
      imageDigest: "us-central1-docker.pkg.dev/rhema-507501/rhema-prod/run-task@sha256:cafe",
    });
    const c = ((qualified.spec.template as { spec: Record<string, unknown> }).spec.containers as Array<Record<string, unknown>>)[0]!;
    expect(c.image).toBe("us-central1-docker.pkg.dev/rhema-507501/rhema-prod/run-task@sha256:cafe");
  });

  it("grants the privilege-drop + mount-isolation caps, read-only root FS, restart Never", () => {
    expect(podSpec.restartPolicy).toBe("Never");
    // the image starts as root and drops root→harness→agent itself, so the pod does not force runAsUser — but it
    // DOES set fsGroup to the harness group so the harness can read the 0440 per-run Secret (P0.15e).
    expect(podSpec.securityContext).toEqual({ fsGroup: HARNESS_GID });
    const csc = container.securityContext as { readOnlyRootFilesystem: boolean; capabilities: { add: string[]; drop: string[] }; allowPrivilegeEscalation: boolean };
    expect(csc.readOnlyRootFilesystem).toBe(true);
    // SEC.3 (ADR-076): allowPrivilegeEscalation stays true — a no-op under CAP_SYS_ADMIN (k8s semantic),
    // and the ambient-cap launch doesn't rely on exec-escalation (ambient survives nnp exec — privsep leg).
    expect(csc.allowPrivilegeEscalation).toBe(true);
    // SETUID/SETGID for the harness→agent uid drop; SYS_ADMIN for unshare/mount; SYS_CHROOT for the scoped runner.
    expect(csc.capabilities.add).toEqual(expect.arrayContaining(["SETUID", "SETGID", "SYS_ADMIN", "SYS_CHROOT"]));
    expect(csc.capabilities.drop).toEqual(["ALL"]);
    // SEC.3: Localhost confinement — the `rhema-run-task` profile (loaded on every sandbox node by the
    // apparmor-loader DaemonSet) allows exactly the scoped runner's mount sequence and nothing wider.
    expect((csc as { appArmorProfile?: { type: string; localhostProfile?: string } }).appArmorProfile).toEqual({
      type: "Localhost",
      localhostProfile: RUN_TASK_APPARMOR_PROFILE,
    });
  });

  it("SEC.3 — the appArmor deploy-config override is forwarded verbatim (rollback = config flip)", () => {
    const rollbackCfg: GkeLauncherConfig = {
      ...config,
      appArmor: { type: "RuntimeDefault" },
    };
    const job = buildRunTaskJobManifest(rollbackCfg, spec);
    const c = ((job.spec.template as { spec: Record<string, unknown> }).spec.containers as Array<Record<string, unknown>>)[0]!;
    expect(c.securityContext).toMatchObject({ appArmorProfile: { type: "RuntimeDefault" } });
    // a named Localhost override carries the profile name through verbatim too.
    const named: GkeLauncherConfig = { ...config, appArmor: { type: "Localhost", localhostProfile: "custom-profile" } };
    const job2 = buildRunTaskJobManifest(named, spec);
    const c2 = ((job2.spec.template as { spec: Record<string, unknown> }).spec.containers as Array<Record<string, unknown>>)[0]!;
    expect(c2.securityContext).toMatchObject({ appArmorProfile: { type: "Localhost", localhostProfile: "custom-profile" } });
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

  it("backs work/config/tmp with memory tmpfs and mounts the secret 0440 (group-readable by the harness)", () => {
    const volumes = podSpec.volumes as Array<Record<string, unknown>>;
    const secretVol = volumes.find((v) => v.name === "harness-secrets")!;
    expect(secretVol.secret).toMatchObject({ secretName: runSecretName(spec), defaultMode: 0o440 });
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

// -------------------------------------------------------- Cloud Run → GKE auth (metadata token; D-P0.15e-3)

describe("buildGkeKubeConfigOptions", () => {
  it("https-prefixes a bare endpoint and carries the CA + token in the loadFromOptions shape", () => {
    const opts = buildGkeKubeConfigOptions({ endpoint: "34.10.20.30", caData: "Q0FDRVJU", token: "ya29.abc" });
    expect(opts.clusters[0]).toMatchObject({ server: "https://34.10.20.30", caData: "Q0FDRVJU" });
    expect(opts.users[0]).toMatchObject({ token: "ya29.abc" });
    expect(opts.currentContext).toBe(opts.contexts[0]!.name);
    expect(opts.contexts[0]).toMatchObject({ cluster: opts.clusters[0]!.name, user: opts.users[0]!.name });
  });

  it("leaves an already-scheme-qualified endpoint intact", () => {
    expect(buildGkeKubeConfigOptions({ endpoint: "https://gke.example", caData: "c", token: "t" }).clusters[0]!.server).toBe("https://gke.example");
  });
});

describe("fetchGceMetadataAccessToken", () => {
  it("GETs the metadata token endpoint with the Metadata-Flavor header and returns the access token", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> | undefined;
    const fetchImpl: FetchLike = (url, init) => {
      seenUrl = url;
      seenHeaders = init?.headers;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: "ya29.fresh", expires_in: 3599 }) });
    };
    const token = await fetchGceMetadataAccessToken(fetchImpl);
    expect(token).toBe("ya29.fresh");
    expect(seenUrl).toBe(GCE_METADATA_TOKEN_URL);
    expect(seenHeaders).toMatchObject({ "Metadata-Flavor": "Google" });
  });

  it("throws on a non-OK response or a missing access_token", async () => {
    await expect(fetchGceMetadataAccessToken(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }))).rejects.toThrow(/metadata token fetch failed 500/);
    await expect(fetchGceMetadataAccessToken(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }))).rejects.toThrow(/no access_token/);
  });
});

describe("fetchGceMetadataIdToken", () => {
  it("GETs the identity endpoint with audience + Metadata-Flavor and returns the raw JWT text", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> | undefined;
    const token = await fetchGceMetadataIdToken("https://svc-a1b2-uc.a.run.app/", (url, init) => {
      seenUrl = url;
      seenHeaders = init?.headers;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("eyJ.id.token\n") });
    });
    expect(token).toBe("eyJ.id.token");
    expect(seenUrl).toBe(
      `${GCE_METADATA_IDENTITY_URL}?audience=${encodeURIComponent("https://svc-a1b2-uc.a.run.app/")}&format=full`,
    );
    expect(seenHeaders).toMatchObject({ "Metadata-Flavor": "Google" });
  });

  it("throws on a non-OK response or an empty body", async () => {
    await expect(
      fetchGceMetadataIdToken("https://svc", () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") })),
    ).rejects.toThrow(/identity fetch failed 404/);
    await expect(
      fetchGceMetadataIdToken("https://svc", () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("  ") })),
    ).rejects.toThrow(/no token/);
  });
});

describe("MetadataTokenGkeJobLauncher", () => {
  /** A fake `@kubernetes/client-node` module: records the loadFromOptions config and hands back marker clients. */
  function fakeK8s(onLaunch: (kind: "secret" | "job", name: string) => void) {
    const marker = { BatchV1Api: Symbol("batch"), CoreV1Api: Symbol("core") };
    let lastOptions: KubeConfigOptions | undefined;
    const batch: KubeBatchApi = {
      createNamespacedJob: ({ body }) => {
        const nm = (body as { metadata: { name: string } }).metadata.name;
        onLaunch("job", nm);
        return Promise.resolve({ metadata: { name: nm } });
      },
    };
    const core: KubeCoreApi = {
      createNamespacedSecret: ({ body }) => {
        onLaunch("secret", (body as { metadata: { name: string } }).metadata.name);
        return Promise.resolve({});
      },
    };
    const mod: KubeClientModule = {
      BatchV1Api: marker.BatchV1Api,
      CoreV1Api: marker.CoreV1Api,
      KubeConfig: class {
        loadFromOptions(opts: KubeConfigOptions) {
          lastOptions = opts;
        }
        makeApiClient(api: unknown) {
          return api === marker.BatchV1Api ? batch : core;
        }
      },
    };
    return { mod, getLastOptions: () => lastOptions };
  }

  const gkeConfig = { ...config, gkeEndpoint: "34.1.2.3", gkeCaData: "Q0E=" };

  it("fetches a FRESH token per launch, builds the KubeConfig from it, and creates secret→job", async () => {
    const created: string[] = [];
    const { mod, getLastOptions } = fakeK8s((kind, nm) => created.push(`${kind}:${nm}`));
    let tokenCalls = 0;
    const fetchToken = () => Promise.resolve(`ya29.tok${++tokenCalls}`);

    const launcher = new MetadataTokenGkeJobLauncher(gkeConfig, mod, fetchToken);
    const first = await launcher.launch(spec);
    expect(first.jobId).toBe("run-run-abc123-a2");
    expect(created).toEqual(["secret:run-run-abc123-a2-secrets", "job:run-run-abc123-a2"]);
    // the KubeConfig was built from the endpoint/CA + the fetched token.
    expect(getLastOptions()!.clusters[0]!.server).toBe("https://34.1.2.3");
    expect(getLastOptions()!.users[0]!.token).toBe("ya29.tok1");

    // a second launch fetches a FRESH token (expiry-proof) — not a cached one.
    await launcher.launch({ ...spec, attempt: 3 });
    expect(getLastOptions()!.users[0]!.token).toBe("ya29.tok2");
    expect(tokenCalls).toBe(2);
  });
});
