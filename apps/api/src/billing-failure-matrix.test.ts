// BILL.3 / REQ-BILL-16 — the §14.6 billing failure-state matrix. This file is the single map from each
// required failure state to the integration-level test(s) that exercise it. Removing a state, renaming a
// referenced test, or deleting its file turns this suite red; the mutation check below proves that the
// coverage assertion itself cannot silently shrink.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

interface TestRef {
  readonly file: string;
  readonly test: string;
}

interface MatrixRow {
  readonly state: string;
  readonly spec: string;
  readonly refs: readonly TestRef[];
}

const EXPECTED_STATES = [
  "card declined",
  "renewal failed",
  "chargeback",
  "run failed/refused",
  "estimate service down",
  "provider outage mid-run",
  "rate-table change while parked",
  "parked > 30 days",
  "reconciliation drift",
  "webhook lag",
  "Stripe unconfigured",
  "Stripe rejects the session",
  "purchase closed",
] as const;

const MATRIX: readonly MatrixRow[] = [
  {
    state: "card declined",
    spec: "§14.6 card declined — audit the failed charge and notify; no silent retry loop",
    refs: [
      {
        file: "packages/ledger/src/auto-reload.test.ts",
        test: "a failed charge audits 'failed' and mails the user — no silent retry loop",
      },
    ],
  },
  {
    state: "renewal failed",
    spec: "§14.6 renewal failed — past_due, grace window, notify, replay-safe",
    refs: [
      {
        file: "packages/ledger/src/stripe.test.ts",
        test: "invoice.payment_failed marks past_due + notifies — the plan stays up in the grace window",
      },
      {
        file: "packages/ledger/src/subscriptions.test.ts",
        test: "applyRenewalFailed marks past_due and notifies; the balance still spends",
      },
    ],
  },
  {
    state: "chargeback",
    spec: "§14.6 chargeback — suspend, claw back newest-first, stop queued/parked work",
    refs: [
      {
        file: "packages/ledger/src/chargeback.test.ts",
        test: "suspends, claws newest-money-first, cancels queued/parked with release, withholds in-flight",
      },
    ],
  },
  {
    state: "run failed/refused",
    spec: "§14.6 failed or refused run — terminalize and refund committed debits",
    refs: [
      {
        file: "packages/orchestrator/src/internal-api.test.ts",
        test: "a `research_preflight_failed` class terminalizes the run — zero debit, hold released (RES.1)",
      },
      {
        file: "packages/orchestrator/src/internal-api.test.ts",
        test: "a terminal failStep refunds the run's net committed debits, then absorbs the metered burn",
      },
    ],
  },
  {
    state: "estimate service down",
    spec: "§14.6 estimate service down → no run starts",
    refs: [
      {
        file: "apps/api/src/run-routes.test.ts",
        test: "BILL.3 — an estimator outage refuses the sheet run 503 and starts no run row",
      },
    ],
  },
  {
    state: "provider outage mid-run",
    spec: "§14.6 provider outage after retries → terminal failed + committed debits refunded",
    refs: [
      {
        file: "packages/orchestrator/src/internal-api.test.ts",
        test: "a provider outage after the retry budget terminalizes failed and refunds committed spend",
      },
    ],
  },
  {
    state: "rate-table change while parked",
    spec: "§14.6 parked run re-estimates under the current table before resume",
    refs: [
      {
        file: "packages/ledger/src/reprice.test.ts",
        test: "re-estimates under the current table and stamps the run when the table moved",
      },
    ],
  },
  {
    state: "parked > 30 days",
    spec: "§14.6 parked horizon — cancel the expired run and release its hold",
    refs: [
      {
        file: "apps/worker/src/ledger-jobs.test.ts",
        test: "cancels a parked run past its deadline and releases its hold in the same pass",
      },
    ],
  },
  {
    state: "reconciliation drift",
    spec: "§14.6 provider reconciliation drift — user-favourable refund + >2% alert",
    refs: [
      {
        file: "packages/ledger/src/reconcile.test.ts",
        test: "a planted 3% drift: user-favourable refund written + the >2% alert fires",
      },
    ],
  },
  {
    state: "webhook lag",
    spec: "§14.6 webhook lag — an open session viewed on the return page emails exactly once on completion",
    refs: [
      {
        file: "packages/ledger/src/stripe.test.ts",
        test: "completion AFTER the open view → exactly one mail, tagged checkout:<sessionId>, linked to returnTo",
      },
    ],
  },
  {
    state: "Stripe unconfigured",
    spec: "BILL.3 — absent Stripe port/config is a truthful 503, never a fake session",
    refs: [
      {
        file: "apps/api/src/billing-routes.test.ts",
        test: "Team is waitlisted (422); a missing/invalid plan is 400; no port is 503",
      },
    ],
  },
  {
    state: "Stripe rejects the session",
    spec: "BILL.3 — Stripe 4xx stays stripe_rejected; 5xx/network stays stripe_unavailable",
    refs: [
      {
        file: "apps/api/src/billing-routes.test.ts",
        test: "keeps the Stripe failure class truthful: 4xx → stripe_rejected, 5xx/network → stripe_unavailable",
      },
      {
        file: "packages/ledger/src/stripe-port.test.ts",
        test: "a 400 becomes StripeRequestError{rejected:true} with Stripe's type/code",
      },
    ],
  },
  {
    state: "purchase closed",
    spec: "BILL.3 — the closed switch makes no Stripe call and answers purchase_closed",
    refs: [
      {
        file: "apps/api/src/billing-routes.test.ts",
        test: "defaults closed: subscribe, top-up, auto-reload setup/configure, and portal make no Stripe call and answer purchase_closed",
      },
    ],
  },
];

function missingStates(rows: readonly MatrixRow[]): string[] {
  const covered = new Set(rows.map((row) => row.state));
  return EXPECTED_STATES.filter((state) => !covered.has(state));
}

function testNamesIn(file: string): Set<string> {
  const path = join(REPO_ROOT, file);
  if (!existsSync(path)) return new Set();
  const source = readFileSync(path, "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(/^\s*it\(\s*(["'`])(.*)\1\s*,/gm)) {
    names.add(match[2]!);
  }
  return names;
}

describe("REQ-BILL-16 — the §14.6 failure-state matrix", () => {
  it("maps every required failure state to a live integration test", () => {
    expect(MATRIX.map((row) => row.state).sort()).toEqual([...EXPECTED_STATES].sort());
    expect(missingStates(MATRIX)).toEqual([]);

    for (const row of MATRIX) {
      expect(row.refs.length, `${row.state} has no test reference`).toBeGreaterThan(0);
      for (const ref of row.refs) {
        const path = join(REPO_ROOT, ref.file);
        expect(existsSync(path), `${row.state}: missing test file ${ref.file}`).toBe(true);
        expect(
          testNamesIn(ref.file).has(ref.test),
          `${row.state}: ${ref.file} no longer contains test “${ref.test}”`,
        ).toBe(true);
      }
    }
  });

  it("fails closed when a matrix row is removed", () => {
    const withoutPurchaseClosed = MATRIX.filter((row) => row.state !== "purchase closed");
    expect(missingStates(withoutPurchaseClosed)).toEqual(["purchase closed"]);
  });
});
