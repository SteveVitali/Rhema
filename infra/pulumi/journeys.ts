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
  readonly project: pulumi.Input<string>;
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
      import: pulumi.interpolate`projects/${args.project}/serviceAccounts/rhema-journeys@${args.project}.iam.gserviceaccount.com`,
    },
  );

  new gcp.projects.Service(
    "journey-gmail-api",
    { service: "gmail.googleapis.com", disableOnDestroy: false },
    { import: pulumi.interpolate`projects/${args.project}/services/gmail.googleapis.com` },
  );

  // The CI principal: github-pool's repo-attribute principalSet resolves the project NUMBER lazily.
  const proj = gcp.organizations.getProjectOutput({ projectId: args.project });
  new gcp.serviceaccount.IAMMember("ci-journeys-token-creator", {
    serviceAccountId: journeysSa.name,
    role: "roles/iam.serviceAccountTokenCreator",
    member: pulumi.interpolate`principalSet://iam.googleapis.com/projects/${proj.number}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${args.ciRepository}`,
  });

  // The operator who drives local Stage-B legs with `gcloud auth application-default` needs the same
  // grant (the hand binding exists already — declared here so state and reality agree; the member
  // string matches the stored form exactly so adoption does not drift).
  new gcp.serviceaccount.IAMMember("operator-journeys-token-creator", {
    serviceAccountId: journeysSa.name,
    role: "roles/iam.serviceAccountTokenCreator",
    member: "user:14SteveVitali@gmail.com",
  });
}
