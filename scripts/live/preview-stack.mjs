#!/usr/bin/env node
// OPS.1 (REQ-ARCH-38) — the ONLY path the build uses for `pr-<n>` Pulumi stack lifecycle.
// `dev` and `prod` stay operator-run (`cd infra/pulumi && pulumi …`); this guard owns the
// create/destroy surface for preview stacks and hard-refuses everything else:
//
//   - `prod` is refused for EVERY verb, including reads. There is no override flag.
//   - only `^pr-\d+$` stack names are managed here (stageKindFor maps unknown names to
//     `preview`, so the regex lives here — never trust the stage resolver).
//   - mutating verbs require the ownership tag `rhema:owner=ops-preview` on the stack —
//     a `pr-<n>` stack the guard did not create (a CI stack, a hand stack, another
//     worker's) cannot be up'd, refreshed, destroyed, or removed through this path.
//
// Usage:
//   node scripts/live/preview-stack.mjs init        pr-<n>
//   node scripts/live/preview-stack.mjs select      pr-<n>
//   node scripts/live/preview-stack.mjs config      pr-<n> <key> <value> [--secret]
//   node scripts/live/preview-stack.mjs resend-pull pr-<n>
//   node scripts/live/preview-stack.mjs stripe-pull pr-<n>
//   node scripts/live/preview-stack.mjs output      pr-<n> [name] [--json]
//   node scripts/live/preview-stack.mjs preview     pr-<n>
//   node scripts/live/preview-stack.mjs up          pr-<n>
//   node scripts/live/preview-stack.mjs refresh     pr-<n>
//   node scripts/live/preview-stack.mjs seed-invite pr-<n>
//   node scripts/live/preview-stack.mjs destroy     pr-<n>
//   node scripts/live/preview-stack.mjs rm          pr-<n>
//
// MAINT.6 runbook — a session-capable preview (signed-in journey legs, D-OPS.1-1):
//   init → config rhema:serviceImages <json> (+ rhema:gitSha / rhema:protocolsVersion) →
//   resend-pull → up → `gcloud run jobs execute rhema-<stack>-migrate --region us-central1 --wait`
//   → seed-invite → `rhema-journeys --web https://<web>.run.app --api https://<api>.run.app
//   --invite-code prv-<n>-test …` (the code is deterministic — `prv-<n>-test`, non-secret,
//   admits only test+*@rhema.tools identities through the real magic-link path).
//
// R6POST.2 runbook (REQ-POST-6) — the ruled posture stages extend that recipe:
//   domains stage:   …config rhema:postureDomains '<json>' + rhema:postureLbAddress <name>
//                    (a pre-created `gcloud compute addresses` global IPv4 — the stack ADOPTS
//                    it so the wildcard-DNS names can embed the known IP before `up`)
//   stripe stage:    …config rhema:extraRequiredSecrets stripe-secret → stripe-pull
//                    (pipes the shared `rhema-nonprod-stripe-secret` sk_test into
//                    `rhema:stripeSecret` SECRET config — stdin, never argv/logs)
//
// Every pulumi call runs `-C infra/pulumi` (the program dir) and never touches another
// stack. The guard is deliberately thin: the refusal logic is pure and unit-tested; the
// exec layer shells straight to `pulumi` with inherited stdio.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PROGRAM_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../infra/pulumi");

/** The ownership tag stamped on every stack `init` creates; checked before any mutating verb. */
export const OWNER_TAG_KEY = "rhema:owner";
export const OWNER_TAG_VALUE = "ops-preview";

/** Exactly `pr-<digits>` — NOT stageKindFor (unknown names must not silently map to preview here). */
export const PREVIEW_STACK_RE = /^pr-\d+$/;

/** Verbs that may run against an OWNED stack without creating/destroying it. */
const READ_ONLY_VERBS = new Set(["select", "output"]);
/** Verbs that deploy or refresh state — ownership required. `resend-pull`/`seed-invite`
 *  (MAINT.6) mutate stack config / execute the stack's migrate Job — same ownership gate. */
const DEPLOY_VERBS = new Set(["preview", "up", "refresh", "config", "resend-pull", "stripe-pull", "seed-invite"]);
/** Verbs that destroy state — ownership required, spelled out so a grep finds them. */
const DESTRUCTIVE_VERBS = new Set(["destroy", "rm"]);

export class GuardRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = "GuardRefusal";
  }
}

/**
 * The pure half of the guard — decide whether `verb` may run against `stack` at all.
 * `prod` is refused unconditionally (before the regex, so no refactor can accidentally
 * route prod through the preview path). Throws GuardRefusal; returns the verb category.
 */
export function classifyVerb(stack, verb) {
  if (stack === "prod" || /^prod($|-)/.test(stack)) {
    throw new GuardRefusal(
      `preview-stack: '${stack}' is refused for every verb — prod is never touched by the preview guard (no override flag exists)`,
    );
  }
  if (!PREVIEW_STACK_RE.test(stack)) {
    throw new GuardRefusal(
      `preview-stack: only ^pr-\\d+$ stacks may be managed here — refusing '${stack}' for verb '${verb}' ` +
        `(dev/prod/anything else are operator-run outside the guard)`,
    );
  }
  if (verb === "init") return "create";
  if (READ_ONLY_VERBS.has(verb)) return "read";
  if (DEPLOY_VERBS.has(verb)) return "deploy";
  if (DESTRUCTIVE_VERBS.has(verb)) return "destructive";
  throw new GuardRefusal(`preview-stack: unknown verb '${verb}' (allowed: init select output config resend-pull stripe-pull seed-invite preview up refresh destroy rm)`);
}

/**
 * Decide whether the stack's ownership tag permits `category`. `init` is the only verb
 * allowed to run against an untagged name (it creates + stamps the tag); every other
 * verb — read included — requires `rhema:owner=ops-preview` so the guard never deploys
 * over, inspects the outputs of, or destroys a stack it did not create.
 */
export function assertOwned(category, ownerTagValue, stack) {
  if (category === "create") {
    if (ownerTagValue != null) {
      throw new GuardRefusal(
        `preview-stack: stack '${stack}' already exists (${OWNER_TAG_KEY}=${ownerTagValue ?? "(unset)"}) — refusing to adopt; init creates new stacks only`,
      );
    }
    return;
  }
  if (ownerTagValue !== OWNER_TAG_VALUE) {
    throw new GuardRefusal(
      `preview-stack: stack '${stack}' is not owned by the preview guard (${OWNER_TAG_KEY}=${ownerTagValue ?? "(unset)"}; ` +
        `expected '${OWNER_TAG_VALUE}') — refusing ${category} on a foreign pr-<n> stack`,
    );
  }
}

/** `pulumi stack tag get` — returns the tag value, or null when unset/unreadable. */
function readOwnerTag(exec, stack) {
  const r = exec(["stack", "tag", "get", OWNER_TAG_KEY, "--stack", stack], { capture: true });
  if (r.status !== 0) return null;
  const v = (r.stdout ?? "").trim();
  return v === "" ? null : v;
}

/** The real exec layer: `pulumi -C infra/pulumi <args>`; capture only where asked. */
function pulumiExec(args, { capture = false } = {}) {
  const r = spawnSync("pulumi", ["-C", PROGRAM_DIR, ...args], {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
}

/** The gcloud seam (resend-pull reads the shared secret; seed-invite executes the migrate Job). */
function gcloudExec(args, { capture = false } = {}) {
  const r = spawnSync("gcloud", args, {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
}

/**
 * `pulumi config set` with the value on STDIN — MAINT.6's `resend-pull` moves the Resend key
 * process-to-process (gcloud stdout → this script's memory → pulumi stdin) so it NEVER lands in
 * an argv list, a log line, or the repo. `config set` reads stdin when the value arg is absent.
 */
function pulumiSecretStdin(args, value) {
  const r = spawnSync("pulumi", ["-C", PROGRAM_DIR, ...args], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf8",
  });
  return { status: r.status ?? 1 };
}

/** `rhema:<key>` config value on the stack, or undefined when unset/unreadable. */
function stackConfigValue(exec, stack, key) {
  const r = exec(["config", "get", key, "--stack", stack], { capture: true });
  const v = r.status === 0 ? (r.stdout ?? "").trim() : "";
  return v === "" ? undefined : v;
}

// --- MAINT.6 constants (D-OPS.1-1) -----------------------------------------------------------

/** The shared, operator-seeded Secret Manager name holding the send-only non-prod Resend key. */
export const NONPROD_RESEND_SECRET = "rhema-nonprod-resend-api-key";
/**
 * R6POST.2 — the shared, operator-seeded Secret Manager name holding the Stripe TEST-MODE
 * `sk_test` every ruled Stripe stage pulls (REQ-ARCH-38 — previews never bind a prod secret;
 * `rhema-prod-stripe-secret` is never in play). `stripe-pull` refuses loudly when the secret
 * is absent — the N9 leg then withholds with a dated re-owe rather than fabricate green.
 */
export const NONPROD_STRIPE_SECRET = "rhema-nonprod-stripe-secret";
/** The Resend From address — the verified sender on the shared (prod-account) key, plain config. */
export const RESEND_FROM = "hello@rhema.tools";
const DEFAULT_PROJECT = "rhema-507501";
const DEFAULT_REGION = "us-central1";

/** The deterministic, non-secret invite code a preview carries — `prv-<n>-test`. */
export function previewInviteCode(stack) {
  return `prv-${stack.slice(3)}-test`;
}

/**
 * Resolve the concrete migrate-Job name for `stack` from `gcloud run jobs list --format=json`.
 * The Job is Pulumi-autonamed (`rhema-<stack>-migrate-<7hex>`), so the literal prefix 404s live
 * (F-VERIF.2-1 — found on pr-186). Pure — unit-tested; returns null on unparseable/empty output
 * or an ambiguous match (the suffix is optional so an explicitly-named Job still resolves).
 */
export function migrateJobName(jsonText, stack) {
  let list;
  try {
    list = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const re = new RegExp(`^rhema-${stack}-migrate(-[a-z0-9]+)?$`);
  const names = list
    .map((j) => j?.metadata?.name)
    .filter((n) => typeof n === "string" && re.test(n));
  return names.length === 1 ? names[0] : null;
}

/**
 * Parse `gcloud run jobs executions list --format=json` output into the newest execution's
 * success facts. Pure — unit-tested; returns null on unparseable/empty output.
 */
export function latestExecutionFacts(jsonText) {
  let list;
  try {
    list = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const item = Array.isArray(list) ? list[0] : undefined;
  if (!item) return null;
  return {
    name: item?.metadata?.name ?? null,
    succeededCount: item?.status?.succeededCount ?? 0,
    failedCount: item?.status?.failedCount ?? 0,
    completionTime: item?.status?.completionTime ?? null,
  };
}

/**
 * Dispatch `verb` for `stack`. `exec` is injectable so tests never shell out.
 * `rest` carries verb-local args (config: key/value; output: name/--json).
 */
export function run(stack, verb, rest = [], { exec = pulumiExec, gcloud = gcloudExec, execSecret = pulumiSecretStdin } = {}) {
  const category = classifyVerb(stack, verb);
  if (verb === "init") {
    // Refuse adoption when the name already resolves to a stack (tagged or not).
    const existing = readOwnerTag(exec, stack);
    // `stack init` itself fails on a taken name; the tag read just discriminates
    // "does not exist" (null — proceed) from "exists but foreign" (any value).
    assertOwned("create", existing, stack);
    const a = exec(["stack", "init", stack]);
    if (a.status !== 0) return a.status;
    const t = exec(["stack", "tag", "set", OWNER_TAG_KEY, OWNER_TAG_VALUE, "--stack", stack]);
    if (t.status !== 0) {
      console.error(`preview-stack: FAILED to stamp ${OWNER_TAG_KEY}=${OWNER_TAG_VALUE} on '${stack}' — leaving the stack in place; ` +
        `run 'rm ${stack}' is now refused until ownership is stamped by hand or the stack is dropped`);
      return t.status;
    }
    console.log(`preview-stack: initialized '${stack}' with ${OWNER_TAG_KEY}=${OWNER_TAG_VALUE}`);
    return 0;
  }
  assertOwned(category, readOwnerTag(exec, stack), stack);
  switch (verb) {
    case "select":
      return exec(["stack", "select", stack]).status;
    case "output":
      return exec(["stack", "output", "--stack", stack, ...rest]).status;
    case "config": {
      // `config <key> <value> [--secret]` — the only config path the guard permits.
      const secret = rest.includes("--secret");
      const [key, value] = rest.filter((x) => x !== "--secret");
      if (!key || value == null) {
        console.error("preview-stack: config requires <key> <value> [--secret]");
        return 2;
      }
      return exec(["config", "set", "--stack", stack, ...(secret ? ["--secret"] : []), key, value]).status;
    }
    case "resend-pull": {
      // MAINT.6 — pull the shared non-prod Resend key into `rhema:resendApiKey` SECRET config so
      // the stack's `resend-api-key` placeholder is replaced by the real send-only key at `up`
      // (index.ts resendVersionPlan; prod stacks are refused at classifyVerb before any of this).
      const project = stackConfigValue(exec, stack, "gcp:project") ?? DEFAULT_PROJECT;
      const access = gcloud(
        ["secrets", "versions", "access", "latest", "--secret", NONPROD_RESEND_SECRET, "--project", project],
        { capture: true },
      );
      if (access.status !== 0 || (access.stdout ?? "").trim() === "") {
        // OPERATOR PREREQUISITE (ticket 149): the operator seeds the shared secret out of band.
        console.error(
          `preview-stack: resend-pull could not read '${NONPROD_RESEND_SECRET}' in project '${project}' — ` +
            "the operator prerequisite is unmet (a send-only Resend key on the prod account, so " +
            "rhema.tools stays a verified sender). Nothing was changed.",
        );
        return 1;
      }
      const set = execSecret(["config", "set", "--secret", "--stack", stack, "rhema:resendApiKey"], access.stdout);
      if (set.status !== 0) return set.status;
      // The worker's mailer also needs EMAIL_FROM — the verified sender on the shared account
      // (plain, non-secret deploy config; same value prod carries in Pulumi.prod.yaml).
      const from = exec(["config", "set", "--stack", stack, "rhema:emailFrom", RESEND_FROM]);
      if (from.status !== 0) return from.status;
      console.log(
        `preview-stack: resend-pull set rhema:resendApiKey (--secret, stdin — never printed) ` +
          `+ rhema:emailFrom=${RESEND_FROM} on '${stack}'`,
      );
      return 0;
    }
    case "stripe-pull": {
      // R6POST.2 — pull the shared non-prod sk_test into `rhema:stripeSecret` SECRET config so
      // the ruled stack's `stripe-secret` placeholder is replaced by the real test-mode key at
      // `up` (index.ts's stripePlan — same resendVersionPlan semantics; prod is refused at
      // classifyVerb before any of this). The gcloud→pulumi stdin pipe keeps the value out of
      // argv/logs/the repo — the same shape resend-pull proved.
      const project = stackConfigValue(exec, stack, "gcp:project") ?? DEFAULT_PROJECT;
      const access = gcloud(
        ["secrets", "versions", "access", "latest", "--secret", NONPROD_STRIPE_SECRET, "--project", project],
        { capture: true },
      );
      if (access.status !== 0 || (access.stdout ?? "").trim() === "") {
        // OPERATOR PREREQUISITE (H10 / ticket 190): the operator seeds `sk_test` here out of
        // band. Absent ⇒ the N9 leg withholds with a dated re-owe — never a fabricated green.
        console.error(
          `preview-stack: stripe-pull could not read '${NONPROD_STRIPE_SECRET}' in project '${project}' — ` +
            "the operator prerequisite is unmet (a TEST-MODE Stripe key seeded in nonprod Secret " +
            "Manager; the H10 'provided: yes' attestation names this container). Nothing was changed.",
        );
        return 1;
      }
      const set = execSecret(["config", "set", "--secret", "--stack", stack, "rhema:stripeSecret"], access.stdout);
      if (set.status !== 0) return set.status;
      console.log(
        `preview-stack: stripe-pull set rhema:stripeSecret (--secret, stdin — never printed) on '${stack}'`,
      );
      return 0;
    }
    case "seed-invite": {
      // MAINT.6 — one code-bound invite row (`email NULL`, max_uses 10000, deterministic
      // `prv-<n>-test`) written by the in-VPC migrate Job over its system-database-url
      // secretKeyRef — no DSN materializes on this workstation (REQ-ARCH-39).
      const project = stackConfigValue(exec, stack, "gcp:project") ?? DEFAULT_PROJECT;
      const region = stackConfigValue(exec, stack, "gcp:region") ?? DEFAULT_REGION;
      const code = previewInviteCode(stack);
      // F-VERIF.2-1 — the Job is Pulumi-autonamed (`rhema-<stack>-migrate-<7hex>`); resolve the
      // concrete name before executing (the literal prefix NOT_FOUNDs live on pr-186).
      const jobList = gcloud(
        [
          "run", "jobs", "list",
          "--project", project,
          "--region", region,
          "--filter", `metadata.name~^rhema-${stack}-migrate`,
          "--format", "json",
        ],
        { capture: true },
      );
      if (jobList.status !== 0) return jobList.status;
      const job = migrateJobName(jobList.stdout, stack);
      if (!job) {
        console.error(
          `preview-stack: seed-invite could not resolve exactly one migrate Job matching ` +
            `'rhema-${stack}-migrate*' — is the stack up?`,
        );
        return 1;
      }
      const run = gcloud(
        [
          "run", "jobs", "execute", job,
          "--project", project,
          "--region", region,
          "--wait",
          "--args", `node,/app/dist/migrate.js,--seed-invite,${code}`,
        ],
        { capture: true },
      );
      if (run.status !== 0) {
        console.error(
          `preview-stack: seed-invite failed to execute ${job} — is the stack up? ` +
            "(the migrate Job exists after the first 'up'; it bootstraps + migrates the db itself)",
        );
        return run.status;
      }
      // Assert the execution actually SUCCEEDED — `--wait` returns on completion either way.
      const listed = gcloud(
        [
          "run", "jobs", "executions", "list",
          "--job", job,
          "--project", project,
          "--region", region,
          "--sort-by", "~createTime",
          "--limit", "1",
          "--format", "json",
        ],
        { capture: true },
      );
      if (listed.status !== 0) return listed.status;
      const latest = latestExecutionFacts(listed.stdout);
      if (!latest || !latest.completionTime || latest.succeededCount < 1 || latest.failedCount > 0) {
        console.error(
          `preview-stack: seed-invite execution did not complete cleanly ` +
            `(succeeded=${latest?.succeededCount ?? "?"}, failed=${latest?.failedCount ?? "?"}) — ` +
            `inspect 'gcloud run jobs executions list --job ${job} --region ${region}'`,
        );
        return 1;
      }
      console.log(
        `preview-stack: seeded invite '${code}' on '${stack}' via ${job} ` +
          `(execution ${latest.name ?? "(unnamed)"} completed)`,
      );
      return 0;
    }
    case "preview":
      return exec(["preview", "--stack", stack]).status;
    case "up":
      return exec(["up", "--stack", stack, "--yes", "--skip-preview", ...rest]).status;
    case "refresh":
      return exec(["refresh", "--stack", stack, "--yes", ...rest]).status;
    case "destroy":
      // Destroy keeps the stack registered: the AC pair is `destroy` → orphan enumeration →
      // `stack rm` (three separate, guard-scoped acts — `--remove` would fold the rm into the
      // destroy and `--exclude-protected` could silently leave protected resources behind).
      return exec(["destroy", "--stack", stack, "--yes", ...rest]).status;
    case "rm":
      return exec(["stack", "rm", stack, "--yes", ...rest]).status;
    default:
      return 2; // classifyVerb already threw — unreachable
  }
}

function usage() {
  console.error(
    "usage: node scripts/live/preview-stack.mjs <init|select|output|config|resend-pull|stripe-pull|seed-invite|preview|up|refresh|destroy|rm> <pr-<n>> [args]\n" +
      "  the only permitted stack names match ^pr-\\d+$; prod is refused for every verb; " +
      `mutations require ${OWNER_TAG_KEY}=${OWNER_TAG_VALUE}`,
  );
  return 2;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , verb, stack, ...rest] = process.argv;
  if (!verb || !stack) process.exit(usage());
  try {
    process.exit(run(stack, verb, rest));
  } catch (err) {
    if (err instanceof GuardRefusal) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
