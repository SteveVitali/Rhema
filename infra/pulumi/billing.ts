// OPS.2 (BL-8; REQ-ARCH-28's cost-posture half) — the prod cost-watch IaC. Two resources gated on
// the stage's `billingAccountId` (prod only):
//
//   1. A $50/mo Billing BUDGET ALERT on the project's billing account (the operator's stated
//      ceiling — the measured-bill recomputation + the gap math to ADR-010's ~$50 target / ~$95
//      floor live in the OPS.2 ledger + ADR-082). Thresholds at 50/90/100% email the billing
//      admins (default IAM recipients — no channel wiring). Both resources are $0: budgets are
//      free, the dataset is empty until the export is pointed at it.
//   2. The BigQuery DATASET the Cloud Billing usage-cost export lands in. The export itself is
//      configured ONLY through the Billing console (no API surface — D-OPS.2-1): provisioning the
//      dataset here makes that flip a one-step console operation.

import * as gcp from "@pulumi/gcp";

export interface BillingArgs {
  stack: string;
  project: string;
  region: string;
  /** `billingAccounts/<id>` — the account `gcloud billing projects describe` reports for prod. */
  billingAccountId: string;
}

export function createBilling(args: BillingArgs): void {
  const { stack, project, region, billingAccountId } = args;

  // The budgets API is project-level — enable it in-stack (the journeys.ts pattern; a create on an
  // already-enabled API is a no-op).
  const budgetsApi = new gcp.projects.Service(`rhema-${stack}-billingbudgets-api`, {
    service: "billingbudgets.googleapis.com",
    disableOnDestroy: false,
  });

  new gcp.billing.Budget(
    `rhema-${stack}-budget-50`,
    {
      billingAccount: billingAccountId,
      displayName: `rhema-${stack} — $50/mo posture alert`,
      amount: { specifiedAmount: { currencyCode: "USD", units: "50" } },
      budgetFilter: {
        projects: [`projects/${project}`],
        // Actuals AND forecast — the 90% forecast threshold is the early-warning leg.
      },
      thresholdRules: [
        { thresholdPercent: 0.5, spendBasis: "CURRENT_SPEND" },
        { thresholdPercent: 1.0, spendBasis: "CURRENT_SPEND" },
        { thresholdPercent: 0.9, spendBasis: "FORECASTED_SPEND" },
      ],
      // No allUpdatesRule — the account-level default emails the billing admins + users, which IS
      // the intended alert surface (a Monitoring channel or Pub/Sub topic adds a hop nobody reads).
    },
    { dependsOn: [budgetsApi] },
  );

  // The billing-export landing dataset (empty until the operator flips the console export —
  // D-OPS.2-1). Standard tables land as `gcp_billing_export_v1_<account>`.
  new gcp.bigquery.Dataset(`rhema-${stack}-billing-export`, {
    datasetId: `billing_export_${stack.replace(/-/g, "_")}`,
    location: region.toUpperCase(),
    description: "Cloud Billing usage-cost export destination (OPS.2) — the export itself is console-configured",
  });
}
