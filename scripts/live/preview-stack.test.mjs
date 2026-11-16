// OPS.1 (REQ-ARCH-38) — the preview-stack guard's refusal contract. Every leg must fail
// if the corresponding check is removed: prod refusal for every verb, the ^pr-\d+$ name
// gate, the ownership tag on mutating verbs, and the tree-scan that proves no other
// script shells `pulumi destroy`/`stack rm` outside the guard.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  run,
  classifyVerb,
  GuardRefusal,
  OWNER_TAG_KEY,
  OWNER_TAG_VALUE,
  PREVIEW_STACK_RE,
  NONPROD_RESEND_SECRET,
  NONPROD_STRIPE_SECRET,
  PREVIEW_RESEND_FROM,
  newestEnabledVersion,
  previewInviteCode,
  latestExecutionFacts,
  migrateJobName,
} from "./preview-stack.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("guard — prod is refused for EVERY verb (no override)", () => {
  const verbs = ["init", "select", "output", "config", "resend-pull", "stripe-pull", "seed-invite", "preview", "up", "refresh", "destroy", "rm", "anything"];
  for (const verb of verbs) {
    it(`refuses prod for '${verb}'`, () => {
      expect(() => classifyVerb("prod", verb)).toThrow(GuardRefusal);
    });
  }
  it("also refuses prod-prefixed names (prod-2, prod-x)", () => {
    for (const name of ["prod-2", "prod-x", "production"]) {
      expect(() => classifyVerb(name, "up"), name).toThrow(GuardRefusal);
    }
  });
  it("the refusal fires through run() — no exec ever happens for prod", () => {
    const calls = [];
    const exec = (args) => {
      calls.push(args);
      return { status: 0, stdout: "" };
    };
    for (const verb of ["init", "up", "destroy", "rm", "refresh", "select", "output"]) {
      expect(() => run("prod", verb, [], { exec }), `prod ${verb}`).toThrow(GuardRefusal);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("guard — the ^pr-\\d+$ name gate", () => {
  it("accepts only pr-<digits>", () => {
    for (const ok of ["pr-1", "pr-102", "pr-9999"]) {
      expect(PREVIEW_STACK_RE.test(ok), ok).toBe(true);
      expect(() => classifyVerb(ok, "up"), ok).not.toThrow();
    }
  });
  it("refuses dev, named previews, and malformed pr names for every verb", () => {
    for (const bad of ["dev", "pr-test", "pr-", "pr", "pr1", "pr-1a", "PR-1", "pr-01x", "previews", "stage", "staging", ""]) {
      for (const verb of ["init", "up", "destroy", "rm", "refresh"]) {
        expect(() => classifyVerb(bad, verb), `${bad}/${verb}`).toThrow(GuardRefusal);
      }
    }
  });
});

describe("guard — ownership tag gates every non-init verb", () => {
  /** An exec stub that reports a specific owner tag and records calls. */
  const execWithTag = (tag) => {
    const calls = [];
    const exec = (args) => {
      calls.push(args);
      if (args[0] === "stack" && args[1] === "tag" && args[2] === "get") {
        return tag == null ? { status: 1, stdout: "" } : { status: 0, stdout: `${tag}\n` };
      }
      return { status: 0, stdout: "" };
    };
    return { calls, exec };
  };

  for (const verb of ["up", "preview", "refresh", "destroy", "rm", "select", "output"]) {
    it(`refuses '${verb}' on an untagged pr-<n>`, () => {
      const { calls, exec } = execWithTag(null);
      expect(() => run("pr-7", verb, [], { exec })).toThrow(GuardRefusal);
      // the only pulumi call was the ownership probe — nothing mutating ran
      expect(calls).toHaveLength(1);
    });
    it(`refuses '${verb}' on a foreign-tagged pr-<n>`, () => {
      const { calls, exec } = execWithTag("someone-else");
      expect(() => run("pr-7", verb, [], { exec })).toThrow(GuardRefusal);
      expect(calls).toHaveLength(1);
    });
    it(`permits '${verb}' on an owned pr-<n>`, () => {
      const { exec } = execWithTag(OWNER_TAG_VALUE);
      expect(run("pr-7", verb, [], { exec })).toBe(0);
    });
  }

  it("init stamps the ownership tag on a fresh stack", () => {
    const { calls, exec } = execWithTag(null);
    expect(run("pr-7", "init", [], { exec })).toBe(0);
    const cmds = calls.map((c) => c.join(" "));
    expect(cmds).toContain(`stack init pr-7`);
    expect(cmds).toContain(`stack tag set ${OWNER_TAG_KEY} ${OWNER_TAG_VALUE} --stack pr-7`);
  });
  it("init refuses to adopt an already-tagged stack", () => {
    const { exec } = execWithTag(OWNER_TAG_VALUE);
    expect(() => run("pr-7", "init", [], { exec })).toThrow(GuardRefusal);
  });
  it("a failed tag-set on init leaves a nonzero exit", () => {
    const exec = (args) =>
      args[0] === "stack" && args[1] === "tag" && args[2] === "set"
        ? { status: 1, stdout: "" }
        : { status: 0, stdout: "" };
    expect(run("pr-7", "init", [], { exec })).toBe(1);
  });
});

describe("guard — verb dispatch maps to the right pulumi commands", () => {
  const exec = (args) => {
    if (args[0] === "stack" && args[1] === "tag" && args[2] === "get") {
      return { status: 0, stdout: `${OWNER_TAG_VALUE}\n` };
    }
    return { status: 0, stdout: "" };
  };
  const calls = [];
  const rec = (args) => {
    calls.push(args.join(" "));
    return exec(args);
  };
  it("dispatches the lifecycle verbs", () => {
    expect(run("pr-3", "up", [], { exec: rec })).toBe(0);
    expect(run("pr-3", "destroy", [], { exec: rec })).toBe(0);
    expect(run("pr-3", "rm", [], { exec: rec })).toBe(0);
    expect(calls).toContain("up --stack pr-3 --yes --skip-preview");
    expect(calls).toContain("destroy --stack pr-3 --yes");
    expect(calls).toContain("stack rm pr-3 --yes");
    // destroy must NOT carry --remove (the rm is a separate guard-scoped act) nor
    // --exclude-protected (protected leftovers would hide orphans).
    const destroy = calls.find((c) => c.startsWith("destroy"));
    expect(destroy).not.toContain("--remove");
    expect(destroy).not.toContain("--exclude-protected");
  });
  it("propagates nonzero exits", () => {
    const failing = (args) =>
      args[0] === "stack" && args[1] === "tag" ? { status: 0, stdout: `${OWNER_TAG_VALUE}\n` } : { status: 3, stdout: "" };
    expect(run("pr-3", "up", [], { exec: failing })).toBe(3);
    expect(run("pr-3", "destroy", [], { exec: failing })).toBe(3);
  });
});

// MAINT.6 (D-OPS.1-1) — the two session-plumbing verbs: same ^pr-\d+$ + ownership gates, and
// the resend-pull contract that the key moves gcloud→pulumi over stdin — never argv/logs.
describe("guard — the new verbs inherit the full refusal contract", () => {
  it("prod + non-pr names refuse resend-pull and seed-invite before any exec", () => {
    const calls = [];
    const exec = (args) => {
      calls.push(args);
      return { status: 0, stdout: "" };
    };
    for (const verb of ["resend-pull", "seed-invite", "stripe-pull"]) {
      expect(() => classifyVerb("prod", verb), `prod/${verb}`).toThrow(GuardRefusal);
      expect(() => classifyVerb("dev", verb), `dev/${verb}`).toThrow(GuardRefusal);
      expect(() => classifyVerb("pr-test", verb), `pr-test/${verb}`).toThrow(GuardRefusal);
      expect(() => run("prod", verb, [], { exec }), `prod run ${verb}`).toThrow(GuardRefusal);
    }
    expect(calls).toHaveLength(0);
  });
  it("resend-pull + stripe-pull + seed-invite refuse an untagged (unowned) pr-<n> stack", () => {
    const calls = [];
    const exec = (args) => {
      calls.push(args);
      if (args[0] === "stack" && args[1] === "tag" && args[2] === "get") {
        return { status: 1, stdout: "" }; // no tag
      }
      return { status: 0, stdout: "" };
    };
    for (const verb of ["resend-pull", "seed-invite", "stripe-pull"]) {
      expect(() => run("pr-9", verb, [], { exec }), verb).toThrow(GuardRefusal);
    }
  });
});

describe("newestEnabledVersion — the pinned-version parser (RH-29)", () => {
  it("picks the greatest trailing digits across resource-name lines", () => {
    const text = "projects/p/secrets/rhema-nonprod-resend-api-key/versions/1\n" +
      "projects/p/secrets/rhema-nonprod-resend-api-key/versions/7\n" +
      "projects/p/secrets/rhema-nonprod-resend-api-key/versions/3\n";
    expect(newestEnabledVersion(text)).toBe("7");
  });
  it("bare-number output parses too (gcloud NAME column shape)", () => {
    expect(newestEnabledVersion("1\n12\n")).toBe("12");
  });
  it("empty/unparseable output ⇒ null (the absent-secret arm)", () => {
    expect(newestEnabledVersion("")).toBeNull();
    expect(newestEnabledVersion("  \n\n")).toBeNull();
    expect(newestEnabledVersion(undefined)).toBeNull();
    expect(newestEnabledVersion("versions/\nabc\n")).toBeNull();
  });
});

// RH-29 (271_R6SEC.3) — the pull binds the shared secret BY REFERENCE: it lists ENABLED
// versions (metadata, never `versions access`), pins the newest into a PLAIN config, and the
// Resend sender is the nonprod-only identity — no key value transits stack state, argv, or logs.
describe("resend-pull — pins the shared secret's version into plain config", () => {
  const ownedExec = () => {
    const calls = [];
    const exec = (args) => {
      calls.push(args);
      if (args[0] === "stack" && args[1] === "tag" && args[2] === "get")
        return { status: 0, stdout: `${OWNER_TAG_VALUE}\n` };
      if (args[0] === "config" && args[1] === "get") return { status: 1, stdout: "" };
      return { status: 0, stdout: "" };
    };
    return { calls, exec };
  };
  const LIST_OUT = "projects/p/secrets/rhema-nonprod-resend-api-key/versions/2\n" +
    "projects/p/secrets/rhema-nonprod-resend-api-key/versions/5\n";

  it("lists ENABLED versions, pins the newest via `config set`, sets the nonprod sender", () => {
    const { calls, exec } = ownedExec();
    const gcloudCalls = [];
    const gcloud = (args) => {
      gcloudCalls.push(args);
      return { status: 0, stdout: LIST_OUT };
    };
    expect(run("pr-131", "resend-pull", [], { exec, gcloud })).toBe(0);
    const list = gcloudCalls[0].join(" ");
    expect(list).toContain(`secrets versions list ${NONPROD_RESEND_SECRET}`);
    expect(list).toContain("--project rhema-507501"); // default project when stack config unset
    expect(list).not.toContain("versions access"); // metadata only — never the payload
    expect(calls.map((c) => c.join(" "))).toContain(
      "config set --stack pr-131 rhema:nonprodResendVersion 5",
    );
    expect(calls.map((c) => c.join(" "))).toContain(
      `config set --stack pr-131 rhema:emailFrom ${PREVIEW_RESEND_FROM}`,
    );
    // no --secret config write happens anywhere on this path
    expect(calls.every((c) => !(c[0] === "config" && c[1] === "set" && c.includes("--secret")))).toBe(true);
  });

  it("absent/empty version list ⇒ nonzero exit + NO pulumi write", () => {
    for (const out of [{ status: 1, stdout: "" }, { status: 0, stdout: " \n" }]) {
      const { calls, exec } = ownedExec();
      expect(run("pr-131", "resend-pull", [], { exec, gcloud: () => out })).toBe(1);
      expect(calls.every((c) => c[0] === "stack" || (c[0] === "config" && c[1] === "get"))).toBe(true);
    }
  });
});

describe("stripe-pull — pins the shared nonprod sk_test version into plain config", () => {
  const ownedExec = () => {
    const calls = [];
    const exec = (args) => {
      calls.push(args);
      if (args[0] === "stack" && args[1] === "tag" && args[2] === "get")
        return { status: 0, stdout: `${OWNER_TAG_VALUE}\n` };
      if (args[0] === "config" && args[1] === "get") return { status: 1, stdout: "" };
      return { status: 0, stdout: "" };
    };
    return { calls, exec };
  };

  it("lists ENABLED versions of the shared nonprod secret and pins the newest", () => {
    const { calls, exec } = ownedExec();
    const gcloudCalls = [];
    const gcloud = (args) => {
      gcloudCalls.push(args);
      return { status: 0, stdout: "projects/p/secrets/rhema-nonprod-stripe-secret/versions/3\n" };
    };
    expect(run("pr-213", "stripe-pull", [], { exec, gcloud })).toBe(0);
    const list = gcloudCalls[0].join(" ");
    expect(list).toContain(`secrets versions list ${NONPROD_STRIPE_SECRET}`);
    expect(list).not.toContain("versions access");
    // The ONLY stripe container this path may ever name is the shared nonprod one.
    expect(list).not.toContain("rhema-prod-");
    expect(calls.map((c) => c.join(" "))).toContain(
      "config set --stack pr-213 rhema:nonprodStripeVersion 3",
    );
    expect(calls.every((c) => !(c[0] === "config" && c[1] === "set" && c.includes("--secret")))).toBe(true);
  });

  it("absent version list ⇒ nonzero exit + NO pulumi write (the N9 withhold arm)", () => {
    const { calls, exec } = ownedExec();
    expect(run("pr-213", "stripe-pull", [], { exec, gcloud: () => ({ status: 1, stdout: "" }) })).toBe(1);
    expect(calls.every((c) => c[0] === "stack" || (c[0] === "config" && c[1] === "get"))).toBe(true);
  });
});

describe("seed-invite — the in-VPC migrate-Job execution", () => {
  const ownedExec = () => {
    const calls = [];
    const exec = (args) => {
      calls.push(args);
      if (args[0] === "stack" && args[1] === "tag" && args[2] === "get")
        return { status: 0, stdout: `${OWNER_TAG_VALUE}\n` };
      if (args[0] === "config" && args[1] === "get") return { status: 1, stdout: "" };
      return { status: 0, stdout: "" };
    };
    return { calls, exec };
  };

  const jobsListPayload = () =>
    JSON.stringify([{ metadata: { name: "rhema-pr-131-migrate-abcde" } }]);

  it("generates the deterministic code and executes the migrate Job with the --args override", () => {
    expect(previewInviteCode("pr-131")).toBe("prv-131-test");
    const { exec } = ownedExec();
    const gcloudCalls = [];
    const gcloud = (args) => {
      gcloudCalls.push(args);
      if (args[1] === "jobs" && args[2] === "list") return { status: 0, stdout: jobsListPayload() };
      if (args[1] === "jobs" && args[2] === "execute") return { status: 0, stdout: "" };
      return {
        status: 0,
        stdout: JSON.stringify([
          {
            metadata: { name: "rhema-pr-131-migrate-abcde-x" },
            status: { succeededCount: 1, failedCount: 0, completionTime: "2026-10-09T00:00:00Z" },
          },
        ]),
      };
    };
    expect(run("pr-131", "seed-invite", [], { exec, gcloud })).toBe(0);
    // the resolved (auto-named) Job is what executes — the literal prefix would 404 (F-VERIF.2-1)
    expect(gcloudCalls[0].join(" ")).toContain("run jobs list");
    const execArgs = gcloudCalls[1].join(" ");
    expect(execArgs).toContain("run jobs execute rhema-pr-131-migrate-abcde");
    expect(execArgs).toContain("--wait");
    expect(execArgs).toContain("--args node,/app/dist/migrate.js,--seed-invite,prv-131-test");
    // success was verified on the newest execution, not just the execute call's exit code
    expect(gcloudCalls[2].join(" ")).toContain("jobs executions list --job rhema-pr-131-migrate-abcde");
  });

  it("an unresolvable/ambiguous job name fails before execute", () => {
    const { exec } = ownedExec();
    const gcloudCalls = [];
    const gcloud = (args) => {
      gcloudCalls.push(args);
      if (args[1] === "jobs" && args[2] === "list")
        return { status: 0, stdout: JSON.stringify([{ metadata: { name: "unrelated-job" } }]) };
      return { status: 0, stdout: "[]" };
    };
    expect(run("pr-131", "seed-invite", [], { exec, gcloud })).toBe(1);
    expect(gcloudCalls).toHaveLength(1); // never reached execute
  });

  it("a failed execution (failedCount>0 / no completion) fails the verb", () => {
    const { exec } = ownedExec();
    const gcloud = (args) => {
      if (args[1] === "jobs" && args[2] === "list") return { status: 0, stdout: jobsListPayload() };
      if (args[2] === "execute") return { status: 0, stdout: "" };
      return {
        status: 0,
        stdout: JSON.stringify([
          { metadata: { name: "x" }, status: { succeededCount: 0, failedCount: 1 } },
        ]),
      };
    };
    expect(run("pr-131", "seed-invite", [], { exec, gcloud })).toBe(1);
  });

  it("an unparseable/absent executions list fails closed", () => {
    const { exec } = ownedExec();
    const gcloud = (args) => {
      if (args[1] === "jobs" && args[2] === "list") return { status: 0, stdout: jobsListPayload() };
      if (args[2] === "execute") return { status: 0, stdout: "" };
      return { status: 0, stdout: "not json" };
    };
    expect(run("pr-131", "seed-invite", [], { exec, gcloud })).toBe(1);
  });

  it("a failed jobs-list call short-circuits (no execute)", () => {
    const { exec } = ownedExec();
    const gcloudCalls = [];
    const gcloud = (args) => {
      gcloudCalls.push(args);
      return { status: 4, stdout: "" };
    };
    expect(run("pr-131", "seed-invite", [], { exec, gcloud })).toBe(4);
    expect(gcloudCalls).toHaveLength(1);
  });
});

describe("migrateJobName — the autonamed-Job resolver (F-VERIF.2-1)", () => {
  it("resolves the single suffixed match, tolerates the bare name, refuses none/ambiguous", () => {
    const one = JSON.stringify([{ metadata: { name: "rhema-pr-131-migrate-abc1234" } }]);
    expect(migrateJobName(one, "pr-131")).toBe("rhema-pr-131-migrate-abc1234");
    const bare = JSON.stringify([{ metadata: { name: "rhema-pr-131-migrate" } }]);
    expect(migrateJobName(bare, "pr-131")).toBe("rhema-pr-131-migrate");
    expect(migrateJobName("[]", "pr-131")).toBeNull();
    expect(migrateJobName("not json", "pr-131")).toBeNull();
    const two = JSON.stringify([
      { metadata: { name: "rhema-pr-131-migrate-aaaaaaa" } },
      { metadata: { name: "rhema-pr-131-migrate-bbbbbbb" } },
    ]);
    expect(migrateJobName(two, "pr-131")).toBeNull();
    // a multi-dash sibling (e.g. `name("migrate-x-y")`) is not the autoname shape — refuse it
    const other = JSON.stringify([{ metadata: { name: "rhema-pr-131-migrate-x-y" } }]);
    expect(migrateJobName(other, "pr-131")).toBeNull();
  });
});

describe("latestExecutionFacts — the gcloud executions-list parser", () => {
  it("extracts name/counts/completionTime from the json row", () => {
    const f = latestExecutionFacts(
      JSON.stringify([
        {
          metadata: { name: "exec-1" },
          status: { succeededCount: 1, failedCount: 0, completionTime: "2026-10-09T00:00:01Z" },
        },
      ]),
    );
    expect(f).toEqual({
      name: "exec-1",
      succeededCount: 1,
      failedCount: 0,
      completionTime: "2026-10-09T00:00:01Z",
    });
  });
  it("returns null on empty or unparseable output (fail-closed)", () => {
    expect(latestExecutionFacts("[]")).toBeNull();
    expect(latestExecutionFacts("{nope")).toBeNull();
    expect(latestExecutionFacts("")).toBeNull();
  });
});

describe("guard — the tree scan: no unguarded pulumi destroy/rm (AC)", () => {
  const scanRoots = [join(REPO_ROOT, "scripts", "live"), join(REPO_ROOT, "infra")];
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === "dist") continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      // Executable script shapes only — the AC is "no script calls pulumi destroy/rm";
      // README prose legitimately documents the guard's own commands.
      else if (/\.(mjs|cjs|ts|sh)$/.test(e)) files.push(p);
    }
  };
  for (const root of scanRoots) walk(root);

  it("no file outside preview-stack.mjs invokes `pulumi destroy` or `pulumi stack rm`", () => {
    // Comments can legitimately discuss the verbs ("…tears down cleanly on pulumi destroy"), so
    // strip line + block comments (and shell `#` comments) before matching command-shaped calls.
    const stripComments = (src) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ")
        .replace(/^[ \t]*#[^\n]*/gm, " ");
    const offenders = [];
    for (const f of files) {
      // the guard itself + this test (its prose names the verbs)
      if (f.endsWith("preview-stack.mjs") || f.endsWith(".test.mjs") || f.endsWith(".test.ts")) continue;
      const src = stripComments(readFileSync(f, "utf8"));
      for (const m of src.matchAll(/(^|[\s'"`(=|&;])pulumi\s+(destroy|stack\s+rm)\b/gm)) {
        offenders.push(`${f.replace(REPO_ROOT + "/", "")}: …${m[0].trim()}`);
      }
    }
    expect(offenders, "unguarded destructive pulumi calls").toEqual([]);
  });
  it("the guard file exists and is the declared path", () => {
    expect(statSync(join(REPO_ROOT, "scripts/live/preview-stack.mjs")).isFile()).toBe(true);
  });
});
