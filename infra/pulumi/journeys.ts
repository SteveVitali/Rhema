// JOURNEY.1 (REQ-SPEC-29; ADR-020) — adopt the hand-created journey-mailbox resources (2026-09-30)
// into IaC:
//   • rhema-journeys@…iam.gserviceaccount.com — the Gmail DWD service account the journey mailbox
//     client signs JWTs through (it holds NO key; the caller's identity signs via IAM Credentials).
//   • gmail.googleapis.com — the readonly API the DWD token reads.
//   • roles/iam.serviceAccountTokenCreator for the CI Workload-Identity principal — so the nightly
//     journey workflow (github-pool WIF, repo-attribute principalSet) can mint the signJwt token.
// `import:` adopts the pre-existing resources without replacement; the IAMMember grants are
// member-level (never authoritative over the role — the operator's own binding is untouched).

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

export interface JourneysArgs {
  /** the concrete GCP project id (`rhema-507501`) — `import:` ids need plain strings, not Outputs. */
  readonly project: string;
  /** the GitHub repo the CI WIF principalSet is scoped to (`<org>/<repo>`). */
  readonly ciRepository: string;
}

export function createJourneys(args: JourneysArgs): void {
  const journeysSa = new gcp.serviceaccount.Account(
    "rhema-journeys-sa",
    {
      accountId: "rhema-journeys",
      displayName: "Rhema journeys — test@rhema.tools mailbox reader (JOURNEY.1)",
      description:
        "Keyless Gmail-DWD reader for the browser-journey harness: signJwt only; no exported key ever.",
    },
    {
      import: `projects/${args.project}/serviceAccounts/rhema-journeys@${args.project}.iam.gserviceaccount.com`,
      // OPS.1 (live finding — the dev destroy tried to delete the SHARED mailbox SA): every
      // journeys resource is adopted operator infrastructure, not stack-owned — DWD binds to the
      // SA's numeric unique_id, so a delete+recreate silently breaks the prod/CI mailbox. Retain
      // all four on any stack teardown.
      retainOnDelete: true,
    },
  );

  // The CI principal: github-pool's repo-attribute principalSet resolves the project NUMBER lazily.
  const proj = gcp.organizations.getProjectOutput({ projectId: args.project });
  // gmail.googleapis.com was enabled by hand 2026-09-30. Service create on an already-enabled API is
  // an idempotent no-op (services.enable returns success), so the first `up` adopts it into state
  // without an import id; disableOnDestroy protects teardown either way.
  new gcp.projects.Service(
    "journey-gmail-api",
    { service: "gmail.googleapis.com", disableOnDestroy: false },
    { retainOnDelete: true },
  );
  new gcp.serviceaccount.IAMMember("ci-journeys-token-creator", {
    serviceAccountId: journeysSa.name,
    role: "roles/iam.serviceAccountTokenCreator",
    member: pulumi.interpolate`principalSet://iam.googleapis.com/projects/${proj.number}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${args.ciRepository}`,
  }, { retainOnDelete: true });

  // R6DEP.4 — the env-gap legs' DB read pool. `secrets.JOURNEY_DATABASE_URL` binds the prod
  // app-login DSN whose host is the VPC-PRIVATE Cloud SQL IP (10.46.0.3) — unreachable from a
  // GitHub-hosted runner. The workflow runs the Cloud SQL Auth Proxy under the same federated
  // WIF credentials (ADC), which needs `cloudsql.instances.connect` on the project — this is the
  // minimal role carrying it. Connect only: DB auth still needs the DSN's `rhema_app_login`
  // password, and every leg's read stays own-tenant under FORCE RLS.
  new gcp.projects.IAMMember("ci-journeys-cloudsql-client", {
    project: args.project,
    role: "roles/cloudsql.client",
    member: pulumi.interpolate`principalSet://iam.googleapis.com/projects/${proj.number}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${args.ciRepository}`,
  }, { retainOnDelete: true });

  // The operator who drives local Stage-B legs with `gcloud auth application-default` needs the same
  // grant (the hand binding exists already — declared here so state and reality agree; the member
  // string matches the stored form exactly so adoption does not drift).
  new gcp.serviceaccount.IAMMember("operator-journeys-token-creator", {
    serviceAccountId: journeysSa.name,
    role: "roles/iam.serviceAccountTokenCreator",
    member: "user:14SteveVitali@gmail.com",
  }, { retainOnDelete: true });
}
