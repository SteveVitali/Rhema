import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RETENTION_CLASSES, RETENTION_SCHEDULE, STAGES } from "@rhema/infra";

// P1.22 W6 — the retention + backup audit (§13.3; REQ-ARCH-28/29). Three layers, all asserted at Stage A:
//
//   1. THE SCHEDULE — @rhema/infra's RETENTION_SCHEDULE carries the exact §13.3 per-class retentions
//      (also unit-tested in infra/config; this suite re-asserts them inside the composed audit so a
//      drift in either direction trips the launch gate).
//
//   2. THE INFRA PROGRAM — infra/pulumi/data.ts is read verbatim: the DB must carry automated backups
//      + PITR, buckets must be uniform-bucket-level-access + public-access-prevented with per-class
//      lifecycle Delete rules, and prod must be deletion-protected.
//
//   3. THE WORKER — apps/worker/src/index.ts is read verbatim: the retention jobs (`run_events.retention`,
//      `project.purge`, `voice.purge`) must be registered queue names — a schedule without a consumer is
//      not retention.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

describe("the §13.3 retention schedule — every class pinned (REQ-ARCH-29)", () => {
  it("covers every declared class, with the exact day counts", () => {
    expect(Object.keys(RETENTION_SCHEDULE).sort()).toEqual([...RETENTION_CLASSES].sort());
    expect(RETENTION_SCHEDULE["sdk-transcripts"].days).toBe(30);
    expect(RETENTION_SCHEDULE["internal-events"].days).toBe(30);
    expect(RETENTION_SCHEDULE.audit.days).toBe(90);
    expect(RETENTION_SCHEDULE["usage-and-ledger"].days).toBe(2555);
    expect(RETENTION_SCHEDULE["restore-points"].days).toBeNull(); // per-plan, applied at write time
  });

  it("no class carries a zero-or-negative retention", () => {
    for (const rule of Object.values(RETENTION_SCHEDULE)) {
      expect(rule.days === null || rule.days > 0).toBe(true);
    }
  });
});

describe("the deployed retention/backup posture — read off infra/pulumi/data.ts", () => {
  const data = read("infra/pulumi/data.ts");

  it("the database carries automated backups + point-in-time recovery", () => {
    const backup = data.match(/backupConfiguration:\s*\{([\s\S]*?)\n\s*\},?\n/)?.[1];
    expect(backup).toBeTruthy();
    expect(backup).toContain("enabled: true");
    expect(backup).toContain("pointInTimeRecoveryEnabled: true");
    expect(backup).toContain("backupRetentionSettings");
  });

  it("every stage sets a backup horizon — dev/prod keep 35 days, preview is disposable", () => {
    expect(STAGES.dev.database.backupRetentionDays).toBe(35);
    expect(STAGES.prod.database.backupRetentionDays).toBe(35);
    expect(STAGES.preview.database.backupRetentionDays).toBeGreaterThanOrEqual(1);
    expect(STAGES.preview.database.backupRetentionDays).toBeLessThan(35);
  });

  it("prod's database is deletion-protected", () => {
    expect(data).toContain('deletionProtection: cfg.kind === "prod"');
  });

  it("every bucket is IAM-only + public-access-prevented, with per-class lifecycle deletes", () => {
    expect(data).toContain('publicAccessPrevention: "enforced"');
    expect(data).toContain("uniformBucketLevelAccess: true");
    // The lifecycle rules are generated from the SAME schedule the audit reads — every day-bearing class
    // gets a prefix-scoped Delete rule.
    const lifecycle = data.match(/const lifecycleRules = Object\.values\(RETENTION_SCHEDULE\)([\s\S]*?)\}\)\);/)?.[0];
    expect(lifecycle).toBeTruthy();
    expect(lifecycle).toContain('type: "Delete"');
    expect(lifecycle).toContain("matchesPrefixes");
    // Prod buckets survive `pulumi destroy`; previews/dev must tear down cleanly.
    expect(data).toContain('forceDestroy: cfg.kind !== "prod"');
  });

  it("the benchmark-enclave bucket is access-logged to the dedicated access-logs bucket (REQ-EVAL-3)", () => {
    expect(data).toContain("benchmark-enclave-access/");
    expect(data).toContain('b === "benchmark-enclave"');
  });
});

describe("the worker retention jobs — scheduled classes have consumers (REQ-ARCH-28)", () => {
  const worker = read("apps/worker/src/index.ts");

  it.each(["run_events.retention", "project.purge", "voice.purge", "account.hard-delete"])(
    "registers the %s job",
    (job) => {
      expect(worker).toContain(`"${job}"`);
    },
  );
});

describe("the deletion paths — project purge + account hard-delete (REQ-ARCH-28; REQ-ACCT-4)", () => {
  const deletion = read("apps/worker/src/deletion.ts");

  it("project tombstone purges at the 30-day mark and account deletion hard-deletes at 14 days", () => {
    expect(deletion).toMatch(/PROJECT_PURGE_AFTER_DAYS\s*=\s*30/);
    expect(deletion).toMatch(/ACCOUNT_GRACE_DAYS\s*=\s*14/);
    expect(deletion).toMatch(/"hard-delete"/);
    // The account path retains the anonymized ledger + Stripe customer — asserted in the comment contract
    // and exercised by apps/worker/src/deletion.test.ts; the constant presence here is the audit pin.
    expect(deletion).toContain("anonymized ledger");
  });
});
