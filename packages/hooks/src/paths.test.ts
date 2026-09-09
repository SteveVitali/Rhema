import { describe, expect, it } from "vitest";
import {
  bashPathTokens,
  bashRecursiveOverRoot,
  classifyPath,
  globToRegExp,
  matchGlob,
  normalizePosix,
  searchTargetsRoot,
  splitBashCommands,
  tokenizeBash,
} from "./paths.js";
import { compileSeatPolicy } from "./seat-tables.js";
import { evaluateToolUse } from "./hook.js";
import { newDenialState } from "./denials.js";
import { lexicalRealpath } from "./realpath.js";
import type { RealpathResolver } from "./realpath.js";
import type { PhasePolicy } from "./types.js";

const GEN: PhasePolicy = { key: "draft", phaseClass: "generate", allowsSubagents: true };
const editor = compileSeatPolicy({ seat: "editor", personaId: "p1", tools: ["read", "write"], phase: GEN, runId: "r1" });

describe("normalizePosix", () => {
  it("collapses . and .. and dedupes slashes", () => {
    expect(normalizePosix("/work/project/../secret")).toBe("/work/secret");
    expect(normalizePosix("/work/project/./drafts//v1.md")).toBe("/work/project/drafts/v1.md");
    expect(normalizePosix("/a/b/c/../../d")).toBe("/a/d");
  });
  it("cannot rise above an absolute root", () => {
    expect(normalizePosix("/../../etc/passwd")).toBe("/etc/passwd");
  });
});

describe("globToRegExp / matchGlob", () => {
  it("prefix/** matches the dir and everything under it", () => {
    expect(matchGlob("drafts", "drafts/**")).toBe(true);
    expect(matchGlob("drafts/v1.md", "drafts/**")).toBe(true);
    expect(matchGlob("drafts/a/b.md", "drafts/**")).toBe(true);
    expect(matchGlob("draftsX/v1.md", "drafts/**")).toBe(false);
  });
  it("an exact glob matches only itself", () => {
    expect(matchGlob("profile/voice-print.md", "profile/voice-print.md")).toBe(true);
    expect(matchGlob("profile/voice-print.md.bak", "profile/voice-print.md")).toBe(false);
  });
  it("escapes regex metacharacters in literals", () => {
    expect(globToRegExp("a.b").test("aXb")).toBe(false);
    expect(globToRegExp("a.b").test("a.b")).toBe(true);
  });
});

describe("classifyPath — escapes (AC2)", () => {
  it("denies a `..` escape out of the project root", () => {
    const c = classifyPath("/work/project/../../etc/passwd", editor, lexicalRealpath);
    expect(c.escaped).toBe(true);
    expect(c.namespace).toBeNull();
  });

  it("denies a symlink that resolves outside the sandbox (fake resolver)", () => {
    // A symlink at drafts/leak -> /etc/passwd: lexically inside, really outside.
    const symlinkResolver: RealpathResolver = (p) =>
      p === "/work/project/drafts/leak" ? "/etc/passwd" : p;
    const c = classifyPath("/work/project/drafts/leak", editor, symlinkResolver);
    expect(c.escaped).toBe(true);
  });

  it("follows a symlink that stays inside the sandbox", () => {
    const resolver: RealpathResolver = (p) =>
      p === "/work/project/drafts/current.md" ? "/work/project/drafts/v3.md" : p;
    const c = classifyPath("/work/project/drafts/current.md", editor, resolver);
    expect(c.escaped).toBe(false);
    expect(c.namespace).toBe("shared");
  });

  it("resolves a relative path against the project root", () => {
    const c = classifyPath("drafts/v1.md", editor, lexicalRealpath);
    expect(c.resolved).toBe("/work/project/drafts/v1.md");
    expect(c.namespace).toBe("shared");
  });

  it("resolves a symlink-parent BEFORE collapsing `..`, so the wall holds (Finding 1)", () => {
    // agents/editor/up is a symlink to agents/author/sub; a read of up/../secret.md really targets the
    // Drafter namespace. The resolver must see the uncollapsed path to catch it.
    const resolver: RealpathResolver = (p) =>
      p.replace("/work/project/agents/editor/up/", "/work/project/agents/author/sub/");
    const c = classifyPath("/work/project/agents/editor/up/../secret.md", editor, resolver);
    expect(c.resolved).toBe("/work/project/agents/author/secret.md");
    expect(c.namespace).toBeNull(); // out of the Editor namespace → denied
  });
});

describe("recursive-over-root (Glob/Grep/Bash)", () => {
  it("flags a search whose path is the project root", () => {
    expect(searchTargetsRoot(undefined, editor)).toBe(true); // default cwd = root
    expect(searchTargetsRoot("/work/project", editor)).toBe(true);
    expect(searchTargetsRoot(".", editor)).toBe(true);
    expect(searchTargetsRoot("/work/project/agents/editor", editor)).toBe(false);
  });

  it("detects recursive Bash commands over a root", () => {
    expect(bashRecursiveOverRoot("find /work/project -name '*.md'", editor)).toBe(true);
    expect(bashRecursiveOverRoot("grep -r secret /work/project", editor)).toBe(true);
    expect(bashRecursiveOverRoot("grep -r secret", editor)).toBe(true); // no path → cwd root
    expect(bashRecursiveOverRoot("ls -R", editor)).toBe(true);
    expect(bashRecursiveOverRoot("grep -r x /work/project/agents/editor", editor)).toBe(false);
    expect(bashRecursiveOverRoot("cat /work/project/drafts/v1.md", editor)).toBe(false);
  });

  it("is not bypassed by command chaining or substitution (Finding 2)", () => {
    expect(bashRecursiveOverRoot("echo hi; find /work/project", editor)).toBe(true);
    expect(bashRecursiveOverRoot("cat drafts/v1.md | grep -r secret /work/project", editor)).toBe(true);
    expect(bashRecursiveOverRoot("true && rg foo /work/project", editor)).toBe(true);
    expect(bashRecursiveOverRoot("echo $(find /work/project)", editor)).toBe(true);
    expect(bashRecursiveOverRoot("echo hi; cat /work/project/drafts/v1.md", editor)).toBe(false);
  });

  it("checks every positional search path, not just the last (Finding 7)", () => {
    expect(bashRecursiveOverRoot("grep -r x /work/project /work/project/agents/editor", editor)).toBe(true);
  });

  it("splitBashCommands splits on operators and extracts substitutions", () => {
    expect(splitBashCommands("a; b | c && d")).toEqual(["a", "b", "c", "d"]);
    expect(splitBashCommands("echo $(find /x)")).toContain("find /x");
  });
});

describe("Bash tokenization + argv escapes (AC2)", () => {
  it("tokenizes honoring quotes and dropping operators", () => {
    expect(tokenizeBash("cat 'my file.md' | grep x")).toEqual(["cat", "my file.md", "grep", "x"]);
    expect(tokenizeBash('echo "a b" > out')).toEqual(["echo", "a b", "out"]);
  });

  it("extracts only path-like tokens", () => {
    expect(bashPathTokens("cat /work/project/drafts/v1.md")).toEqual(["/work/project/drafts/v1.md"]);
    expect(bashPathTokens("grep -n foo ../secret")).toEqual(["../secret"]);
    expect(bashPathTokens("echo hello")).toEqual([]);
  });

  it("denies a Bash argv `..` escape through the full hook", () => {
    const d = evaluateToolUse(
      { tool: "Bash", input: { command: "cat /work/project/../../etc/passwd" } },
      editor,
      newDenialState(),
      { resolveRealpath: lexicalRealpath, now: () => "T" },
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toBe("path escapes the sandbox root");
  });

  it("allows a Bash read within the seat namespace", () => {
    const d = evaluateToolUse(
      { tool: "Bash", input: { command: "cat /work/project/drafts/v1.md" } },
      editor,
      newDenialState(),
      { resolveRealpath: lexicalRealpath, now: () => "T" },
    );
    expect(d.decision).toBe("allow");
  });
});
