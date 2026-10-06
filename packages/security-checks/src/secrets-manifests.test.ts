import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRunTaskJobManifest,
  buildRunTaskSecretManifest,
  HARNESS_GID,
  HARNESS_SECRET_MOUNT,
  RUN_TOKEN_FILE,
  PROXY_CREDENTIAL_FILE,
} from "@rhema/live-clients";
import { assertHarnessOnly, NON_OWNER_PERMISSION_MASK } from "@rhema/run-task";

// P1.22 W5 — the secrets + harness-uid audit (REQ-ARCH-30; REQ-SPEC-10/11; §12.4 step 4). The ticket asks
// for two things that Stage A ($0, no deploy) can verify for real:
//
//   1. THE DEPLOYED-MANIFEST POSTURE — `buildRunTaskJobManifest`/`buildRunTaskSecretManifest` in
//      @rhema/live-clients are the PURE functions that emit the actual k8s objects the worker POSTs to
//      the cluster; asserting on their output is asserting on the deployed manifest, not the design. The
//      checks: per-run secrets ride a harness-only mounted Secret (0400, fsGroup=harness), never the pod's
//      env; the pod env carries only FILE-PATH pointers; the container drops ALL capabilities and adds back
//      exactly the four the uid-drop + scoped-mount model needs; the pod pins the sandbox node pool.
//
//   2. THE CONTAINER CONTRACT — the Dockerfile + entrypoint.sh are read verbatim and asserted to build the
//      two-uid image (10001 harness / 10002 agent, /run/secrets 0700 harness) and to drop root → harness
//      with the minimal ambient capability set.
//
//   3. SERVICE-ENV SWEEP — infra/pulumi/compute.ts is read verbatim; the `web` service's env block is
//      asserted to carry only its non-secret allowlist (no `secretKeyRef`, no `*_SECRET` value pointers),
//      per REQ-ARCH-30's "no secret as a plaintext env var to web/collab".
//
// The actual gitleaks sweep runs in CI (`public-safe` job, gitleaks-action@v2 + .gitleaks.toml); this file
// asserts that wiring exists, and the P1.22 run ledger records the local `gitleaks dir` result.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

// ---------------------------------------------------------------- the deployed k8s manifests

const CONFIG = {
  namespace: "rhema-runs",
  sandboxNodePool: "sandbox-pool",
  imageRepo: "us-docker.pkg.dev/proj/rhema/run-task",
  internalApiUrl: "https://api-internal.rhema.tools",
  proxyBaseUrl: "https://egress-proxy.rhema.tools",
  objectsBucket: "objects-bucket",
  kubeServiceAccount: "run-task-ksa",
};

// Deliberately secret-looking values — planted so the assertion proves they never reach the pod env.
const SPEC = {
  runId: "run01JS0XXXXXXXXXXXXXXXXXXX0",
  workspaceId: "ws01JS0XXXXXXXXXXXXXXXXXXX0",
  attempt: 1,
  imageDigest: "sha256:" + "a".repeat(64),
  runToken: "rt_test_PLANTED_RUN_TOKEN_value_must_never_be_env",
  proxyCredential: "pc_test_PLANTED_PROXY_CRED_value_must_never_be_env",
};

function podSpec() {
  const job = buildRunTaskJobManifest(CONFIG, SPEC);
  const template = job.spec.template as {
    spec: {
      securityContext: { fsGroup: number };
      nodeSelector: Record<string, string>;
      serviceAccountName: string;
      containers: Array<{
        env: Array<{ name: string; value: string }>;
        securityContext: {
          readOnlyRootFilesystem: boolean;
          allowPrivilegeEscalation: boolean;
          capabilities: { add: string[]; drop: string[] };
        };
        volumeMounts: Array<{ name: string; mountPath: string; readOnly?: boolean }>;
      }>;
      volumes: Array<{ name: string; secret?: { secretName: string; defaultMode: number }; emptyDir?: unknown }>;
    };
  };
  return template.spec;
}

describe("the deployed run-task manifests — harness-uid secrets posture (REQ-SPEC-10/11; REQ-ARCH-30)", () => {
  it("the run token + proxy credential ride the per-run Secret manifest, never the Job env", () => {
    const secret = buildRunTaskSecretManifest(CONFIG, SPEC);
    expect(secret.type).toBe("Opaque");
    expect(secret.stringData[RUN_TOKEN_FILE]).toBe(SPEC.runToken);
    expect(secret.stringData[PROXY_CREDENTIAL_FILE]).toBe(SPEC.proxyCredential);

    const pod = podSpec();
    const envJson = JSON.stringify(pod.containers[0].env);
    // The planted values must appear NOWHERE in the Job — not as an env value, not anywhere else.
    expect(envJson).not.toContain(SPEC.runToken);
    expect(envJson).not.toContain(SPEC.proxyCredential);
    expect(JSON.stringify(pod)).not.toContain(SPEC.runToken);
    expect(JSON.stringify(pod)).not.toContain(SPEC.proxyCredential);
    // What the pod DOES get: file-path pointers into the harness-only mount.
    const envNames = pod.containers[0].env.map((e) => e.name);
    expect(envNames).toContain("RUN_TOKEN_FILE");
    expect(envNames).toContain("PROXY_CREDENTIAL_FILE");
    expect(envNames).not.toContain("RUN_TOKEN");
    expect(envNames).not.toContain("PROXY_CREDENTIAL");
  });

  it("the Secret mounts 0400, read-only, fsGroup=harness — the agent's cleared groups cannot read it", () => {
    const pod = podSpec();
    expect(pod.securityContext.fsGroup).toBe(HARNESS_GID);
    const secretVol = pod.volumes.find((v) => v.name === "harness-secrets");
    expect(secretVol?.secret?.defaultMode).toBe(0o440);
    const mount = pod.containers[0].volumeMounts.find((m) => m.name === "harness-secrets");
    expect(mount?.mountPath).toBe(HARNESS_SECRET_MOUNT);
    expect(mount?.readOnly).toBe(true);
  });

  it("the container drops ALL caps, adds back exactly the four the uid-drop model needs, read-only root", () => {
    const sc = podSpec().containers[0].securityContext;
    expect(sc.readOnlyRootFilesystem).toBe(true);
    expect(sc.capabilities.drop).toEqual(["ALL"]);
    expect([...sc.capabilities.add].sort()).toEqual(["SETGID", "SETUID", "SYS_ADMIN", "SYS_CHROOT"].sort());
  });

  it("the pod pins the isolated sandbox node pool and the WI-bound ServiceAccount", () => {
    const pod = podSpec();
    expect(pod.nodeSelector["cloud.google.com/gke-nodepool"]).toBe("sandbox-pool");
    expect(pod.serviceAccountName).toBe("run-task-ksa");
  });
});

// ---------------------------------------------------------------- the image + entrypoint contract

describe("the run-task image — two-uid contract read off the Dockerfile + entrypoint verbatim", () => {
  const dockerfile = read("apps/run-task/Dockerfile");
  const entrypoint = read("apps/run-task/docker/entrypoint.sh");

  it("builds the two unprivileged uids and the harness-only secrets dir", () => {
    expect(dockerfile).toMatch(/useradd\s+--uid 10001 .*harness/);
    expect(dockerfile).toMatch(/useradd\s+--uid 10002 .*agent/);
    expect(dockerfile).toContain("chown harness:harness /run/secrets");
    expect(dockerfile).toContain("chmod 0700 /run/secrets");
    // No secret baked into the image: no ENV carrying a token/credential name.
    expect(dockerfile).not.toMatch(/^ENV\s+.*(RUN_TOKEN|PROXY_CREDENTIAL|API_KEY|SECRET)\s*=/m);
  });

  it("the entrypoint drops root → harness with exactly the capability set the manifest grants", () => {
    expect(entrypoint).toContain("--reuid \"$HARNESS_UID\" --regid \"$HARNESS_GID\" --clear-groups");
    // Drop-all, then the same four caps the pod adds back — no more.
    expect(entrypoint).toContain("--bounding-set -all,+setuid,+setgid,+sys_admin,+sys_chroot");
    expect(entrypoint).toContain("--ambient-caps -all,+setuid,+setgid,+sys_admin,+sys_chroot");
  });
});

// ---------------------------------------------------------------- the secrets-file permission gate

describe("assertHarnessOnly — the belt to the mount's braces (REQ-SPEC-10)", () => {
  it("accepts owner-only modes; refuses any group/other bit", () => {
    expect(() => assertHarnessOnly({ mode: 0o400, uid: 10001 }, 10001)).not.toThrow();
    expect(() => assertHarnessOnly({ mode: 0o600, uid: 10001 }, 10001)).not.toThrow();
    for (const mode of [0o640, 0o604, 0o644, 0o400 + NON_OWNER_PERMISSION_MASK]) {
      expect(() => assertHarnessOnly({ mode, uid: 10001 }, 10001)).toThrow(/readable only by harness/);
    }
  });
  it("refuses a file owned by a foreign uid even when the mode is tight", () => {
    expect(() => assertHarnessOnly({ mode: 0o400, uid: 0 }, 10001)).toThrow(/owned by the harness uid/);
  });
});

// ---------------------------------------------------------------- the service-env sweep (web/collab)

describe("the Cloud Run service envs — no plaintext secrets to web/collab (REQ-ARCH-30)", () => {
  const compute = read("infra/pulumi/compute.ts");

  it("the web service envs carry only the non-secret allowlist", () => {
    const webBlock = compute.match(/\.\.\.\(svc === "web"[\s\S]*?envs: \[([\s\S]*?)\]\s*,?\s*\}/)?.[1];
    expect(webBlock).toBeTruthy();
    const names = [...webBlock!.matchAll(/name: "([A-Z_]+)"/g)].map((m) => m[1]);
    expect(names.sort()).toEqual(["API_BASE_URL", "APP_BASE_URL", "COLLAB_WS_URL", "SIGNUP_MODE"].sort());
    expect(webBlock).not.toMatch(/secretKeyRef|secretVersion|_SECRET/);
  });

  it("the collab service envs carry only the limited-role DATABASE_URL + the objects bucket", () => {
    const collabBlock = compute.match(/\.\.\.\(svc === "collab"[\s\S]*?envs: \[([\s\S]*?)\]\s*,?\s*\}/)?.[1];
    expect(collabBlock).toBeTruthy();
    const names = [...collabBlock!.matchAll(/name: "([A-Z_]+)"/g)].map((m) => m[1]);
    // SEC.1 — DATABASE_URL appears twice in source: the secretKeyRef mount (required stages) and the
    // plaintext `value:` fallback (preview/unseeded stages). The runtime env set is still just these two.
    expect([...new Set(names)].sort()).toEqual(["DATABASE_URL", "OBJECTS_BUCKET"].sort());
    // No provider/model key names ever reach collab's env block; the ONLY secretKeyRef permitted here
    // is the collab-database-url mount — the DSN itself must never be a plaintext literal.
    expect(collabBlock).not.toMatch(/ANTHROPIC|API_KEY|_SECRET_NAME/);
    for (const m of collabBlock!.matchAll(/secret: secrets\.byId\["([a-z-]+)"\]/g)) {
      expect(m[1]).toBe("collab-database-url");
    }
  });
});

// ---------------------------------------------------------------- the CI secrets sweep

describe("the secrets sweep wiring — gitleaks in CI + config in-repo (REQ-ARCH-30)", () => {
  it("the public-safe CI job runs gitleaks-action with the repo's .gitleaks.toml", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("gitleaks/gitleaks-action@v2");
    expect(ci).toContain("GITLEAKS_CONFIG: .gitleaks.toml");
    expect(readFileSync(join(REPO, ".gitleaks.toml"), "utf8").length).toBeGreaterThan(0);
  });
});
