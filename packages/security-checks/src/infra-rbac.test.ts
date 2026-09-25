import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// P1.22 W7 — the IAM + k8s-RBAC audit (D-P0.01-5). The SST-era implicit grants are long gone; the
// explicit-document obligation lands as: (a) infra/pulumi/iam.ts authors the per-service GCP grants as
// code; (b) infra/k8s/ carries the in-cluster least-privilege surface — the `runs` namespace, the
// Workload-Identity-bound run-task KSA, the egress-only NetworkPolicy, and (new this ticket) the
// per-namespace launcher RBAC that scopes the worker's IAM identity to exactly the two
// API calls the JobLauncher makes, and (new this ticket) the IAM half narrowed off `container.developer`
// to a custom clusters.get/list role. This suite reads those manifests verbatim and pins the contract:
// a regression that widens the Role's verbs, drops the NetworkPolicy, or lets the run-task KSA reach the
// (nothing — pods need zero k8s API access) trips here, not in prod.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const ns = read("infra/k8s/00-runs-namespace.yaml");
const ksa = read("infra/k8s/10-run-task-ksa.yaml");
const netpol = read("infra/k8s/20-run-task-egress-policy.yaml");
const rbac = read("infra/k8s/30-worker-job-rbac.yaml");
const apply = read("infra/k8s/apply.sh");
const iam = read("infra/pulumi/iam.ts");

describe("the `runs` namespace k8s surface — applied manifests, verbatim (D-P0.01-5)", () => {
  it("the namespace exists and the run-task KSA is Workload-Identity-bound to the stack GSA", () => {
    expect(ns).toMatch(/kind: Namespace/);
    expect(ns).toMatch(/name: runs/);
    expect(ksa).toMatch(/kind: ServiceAccount/);
    expect(ksa).toMatch(/name: run-task-ksa/);
    expect(ksa).toContain("iam.gke.io/gcp-service-account: ${RUN_TASK_GSA_EMAIL}");
  });

  it("the launcher Role grants exactly the JobLauncher's two calls + reads — no exec, no pods, no nodes", () => {
    // The launcher (GkeJobLauncher.launch) calls createNamespacedSecret + createNamespacedJob. Assert the
    // Role's rule surface is exactly: core secrets create/get + batch jobs create/get/list.
    expect(rbac).toMatch(/kind: Role/);
    expect(rbac).toMatch(/name: run-task-launcher/);
    expect(rbac).toMatch(/namespace: runs/);
    expect(rbac).toMatch(/apiGroups: \[""\][\s\S]*?resources: \["secrets"\][\s\S]*?verbs: \["create", "get"\]/);
    expect(rbac).toMatch(/apiGroups: \["batch"\][\s\S]*?resources: \["jobs"\][\s\S]*?verbs: \["create", "get", "list"\]/);
    // And nothing else — no pods/exec/attach/logs mutation, no wildcard.
    expect(rbac).not.toMatch(/resources: \["\*"\]|verbs: \["\*"\]|pods\/exec|pods\/attach/);
    const ruleCount = (rbac.match(/apiGroups:/g) ?? []).length;
    expect(ruleCount).toBe(2);
  });

  it("the RoleBinding binds the worker GSA to the launcher Role — nobody else", () => {
    expect(rbac).toMatch(/kind: RoleBinding/);
    expect(rbac).toContain("name: ${WORKER_GSA_EMAIL}");
    expect(rbac).toContain("kind: User");
    expect(rbac).toMatch(/roleRef:[\s\S]*?name: run-task-launcher/);
    // exactly one subject — no groups, no broad bindings.
    expect((rbac.match(/kind: User/g) ?? []).length).toBe(1);
    expect(rbac).not.toMatch(/kind: (Group|ServiceAccount)/);
  });

  it("the pod NetworkPolicy is egress-only, namespace-wide, with the four sanctioned destinations", () => {
    expect(netpol).toMatch(/kind: NetworkPolicy/);
    expect(netpol).toMatch(/name: run-task-egress/);
    expect(netpol).toMatch(/podSelector: \{\}/);
    expect(netpol).toMatch(/policyTypes:[\s\S]*?- Egress/);
    expect(netpol).not.toMatch(/- Ingress/);
    // kube-dns (53), the proxy/api tier (10.8.16.0/20 on 8443+443), the Private-Google-APIs VIP (443),
    // and the GKE metadata server — the WI token fetch the harness needs (D-P0.15e-2).
    expect(netpol).toContain("10.8.16.0/20");
    expect(netpol).toContain("199.36.153.8/30");
    expect(netpol).toMatch(/kubernetes\.io\/metadata\.name: kube-system/);
    // no wildcard egress CIDR — the internet stays denied at the pod layer.
    expect(netpol).not.toMatch(/cidr: 0\.0\.0\.0\/0/);
  });

  it("apply.sh templates and applies all four manifests in order, plus the WI binding", () => {
    expect(apply).toContain("00-runs-namespace.yaml");
    expect(apply).toContain("10-run-task-ksa.yaml");
    expect(apply).toContain("20-run-task-egress-policy.yaml");
    expect(apply).toContain("30-worker-job-rbac.yaml");
    expect(apply).toContain("WORKER_GSA_EMAIL=");
    expect(apply).toContain("roles/iam.workloadIdentityUser");
  });
});

describe("the IAM layer — explicit per-service grants in code (D-P0.01-5)", () => {
  it("every service account is a distinct per-service identity", () => {
    expect(iam).toMatch(/serviceAccounts\[svc\] = new gcp\.serviceaccount\.Account/);
  });

  it("secret access is granted per-service via secretmanager.secretAccessor, not project-wide", () => {
    expect(iam).toContain('roles/secretmanager.secretAccessor');
    // grants are scoped to individual secret containers (id-keyed), not a wildcard project binding —
    // grantSecret takes a concrete `secret` object.
    expect(iam).toMatch(/const grantSecret = \(id: string, secret: gcp\.secretmanager\.Secret/);
  });

  it("bucket grants are per-service roles/storage.objectAdmin|objectViewer — run-task is read-only", () => {
    expect(iam).toContain('roles/storage.objectAdmin');
    expect(iam).toMatch(/runtask-ro-artifacts.*roles\/storage\.objectViewer/s);
    // the web service holds NO bucket grant.
    expect(iam).not.toMatch(/serviceAccounts\["web"\]/);
  });

  it("the worker's GKE access notes the RBAC layer that scopes it", () => {
    expect(iam).toContain("30-worker-job-rbac.yaml");
  });

  it("the worker's GKE IAM is a custom clusters.get/list role — `container.developer` is gone", () => {
    // P1.22 close of D-P0.01-5's IAM half: container.developer could create/delete clusters and node pools;
    // the launcher needs only cluster discovery. Assert the stand-in is no longer GRANTED (it may still be
    // named in comments as history) and the custom role pins exactly the read verbs, nothing mutable.
    expect(iam).not.toMatch(/role:\s*"roles\/container\.developer"/);
    expect(iam).toMatch(/IAMCustomRole[\s\S]*?container\.clusters\.get/);
    const customRole = iam.slice(iam.indexOf("IAMCustomRole"));
    expect(customRole).toContain('"container.clusters.get", "container.clusters.list"');
    expect(customRole).not.toMatch(/container\.(clusters\.(create|delete|update)|nodePools|operations)/);
  });
});
