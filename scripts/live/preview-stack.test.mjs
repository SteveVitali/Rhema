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
  assertOwned,
  GuardRefusal,
  OWNER_TAG_KEY,
  OWNER_TAG_VALUE,
  PREVIEW_STACK_RE,
} from "./preview-stack.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("guard — prod is refused for EVERY verb (no override)", () => {
  const verbs = ["init", "select", "output", "config", "preview", "up", "refresh", "destroy", "rm", "anything"];
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
