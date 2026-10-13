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
//   node scripts/live/preview-stack.mjs init     pr-<n>
//   node scripts/live/preview-stack.mjs select   pr-<n>
//   node scripts/live/preview-stack.mjs config   pr-<n> <key> <value> [--secret]
//   node scripts/live/preview-stack.mjs output   pr-<n> [name] [--json]
//   node scripts/live/preview-stack.mjs preview  pr-<n>
//   node scripts/live/preview-stack.mjs up       pr-<n>
//   node scripts/live/preview-stack.mjs refresh  pr-<n>
//   node scripts/live/preview-stack.mjs destroy  pr-<n>
//   node scripts/live/preview-stack.mjs rm       pr-<n>
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
/** Verbs that deploy or refresh state — ownership required. */
const DEPLOY_VERBS = new Set(["preview", "up", "refresh", "config"]);
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
  throw new GuardRefusal(`preview-stack: unknown verb '${verb}' (allowed: init select output config preview up refresh destroy rm)`);
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

/**
 * Dispatch `verb` for `stack`. `exec` is injectable so tests never shell out.
 * `rest` carries verb-local args (config: key/value; output: name/--json).
 */
export function run(stack, verb, rest = [], { exec = pulumiExec } = {}) {
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
    "usage: node scripts/live/preview-stack.mjs <init|select|output|config|preview|up|refresh|destroy|rm> <pr-<n>> [args]\n" +
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
