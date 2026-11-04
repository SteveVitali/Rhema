import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readCorpusRules } from "./rules.js";
import { sanitizeMarkdown } from "./sanitize.js";

// REQ-CORPUS-3 (S-10): rewrites only, each recorded; _rules rows applied; workflow "operator" →
// "the writer", content sense untouched; drafts change only by the image-path fix.

const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic", import.meta.url));
const SRC = join(FIXTURE, "source/the-borrowed-commons");
const RULES = readCorpusRules(join(FIXTURE, "corpus"));
const src = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("sanitizer (REQ-CORPUS-3)", () => {
  it("applies file-targeted _rules rows and records them", () => {
    const out = sanitizeMarkdown(
      "agents/author/ledgers/v1-response-ledger.md",
      src("agents/author/ledgers/v1-response-ledger.md"),
      RULES.rewrites,
    );
    expect(out.text).toContain('by the writer "approved, proceed."');
    expect(out.text).toContain("the S. J. Sebastian corpus");
    const rw = out.redactions.find((r) => r.rule === "rw-operator-writer");
    expect(rw).toMatchObject({ file: "agents/author/ledgers/v1-response-ledger.md", line: 3 });
    expect(out.redactions.find((r) => r.rule === "persona-slug")).toBeDefined();
  });

  it("rewrites workflow 'operator' → 'the writer'; content-sense lines stay untouched", () => {
    const content = sanitizeMarkdown(
      "drafts/v1.md",
      "The utility operator shall file the roster.\n",
      RULES.rewrites,
    );
    expect(content.text).toContain("operator shall file");
    expect(content.redactions).toHaveLength(0);
  });

  it("draft prose changes only by the figures/ image-path fix", () => {
    const out = sanitizeMarkdown("drafts/v1.md", src("drafts/v1.md"), RULES.rewrites);
    expect(out.redactions.map((r) => r.rule)).toEqual(["figure-path"]);
    expect(out.text).toContain("](figures/figure_1_signal_map.png)");
    // everything else unchanged: strip the one rewritten link and diff is empty
    expect(
      out.text.replace("](figures/figure_1_signal_map.png)", "]X(") ===
        src("drafts/v1.md").replace("](figure_1_signal_map.png)", "]X("),
    ).toBe(true);
  });

  it("runs the URL guards before any normalizeUrl consumer (utm strip, r.jina.ai unwrap)", () => {
    const out = sanitizeMarkdown(
      "agents/author/research/sources/ekwueme-commons-2019.md",
      src("agents/author/research/sources/ekwueme-commons-2019.md"),
      RULES.rewrites,
    );
    expect(out.text).not.toMatch(/utm_/);
    expect(out.text).toContain("https://press.example.org/ekwueme/shared-plant");
    const jina = sanitizeMarkdown(
      "agents/author/research/sources/ondatje-ledger-2024.md",
      src("agents/author/research/sources/ondatje-ledger-2024.md"),
      RULES.rewrites,
    );
    expect(jina.text).not.toMatch(/r\.jina\.ai/);
    expect(jina.text).toContain("https://journal.example.org/ondatje/drainage-boards");
  });

  it("normalizes persona paths, persona slug, Desktop path, utm prose row", () => {
    const brief = sanitizeMarkdown(
      "agents/author/drafting/v1/01-voice-brief.md",
      src("agents/author/drafting/v1/01-voice-brief.md"),
      RULES.rewrites,
    );
    expect(brief.text).toContain("the persona profile");
    expect(brief.text).not.toMatch(/agent-scratch|personas\//);
    const letter = sanitizeMarkdown(
      "correspondence/v1-review/editors-letter.md",
      src("correspondence/v1-review/editors-letter.md"),
      RULES.rewrites,
    );
    expect(letter.text).toContain("(from the writer's Substack package)");
    const commissioning = sanitizeMarkdown(
      "agents/author/drafting/v1/00-commissioning-brief.md",
      src("agents/author/drafting/v1/00-commissioning-brief.md"),
      RULES.rewrites,
    );
    expect(commissioning.text).toContain("a deep-research tracking parameter");
    expect(commissioning.text).not.toContain("utm_source");
  });

  it("a slug-scoped row applies only to its project (real-data fix: shared project paths)", () => {
    // Projects share project-relative paths (e.g. `correspondence/v1-response.md` exists in
    // several); a row must target exactly one project or a same-named file elsewhere hard-fails.
    const row = {
      id: "rw-scoped",
      file: "f.md",
      line: 1,
      pattern: "hit",
      replacement: "done",
      reason: "r",
      slug: "essay-a",
    };
    const a = sanitizeMarkdown("f.md", "a hit here\n", [row], "essay-a");
    expect(a.text).toContain("a done here");
    expect(a.redactions[0]?.rule).toBe("rw-scoped");
    // same path in another project: the scoped row does not fire, no stale-row error
    const b = sanitizeMarkdown("f.md", "a hit here\n", [row], "essay-b");
    expect(b.text).toContain("a hit here");
    expect(b.redactions).toHaveLength(0);
    // an unscoped row still applies to every project carrying the path
    const c = sanitizeMarkdown("f.md", "a hit here\n", [{ ...row, slug: undefined }], "essay-b");
    expect(c.text).toContain("a done here");
  });

  it("a stale rewrite row (pattern absent at file:line) fails", () => {
    expect(() =>
      sanitizeMarkdown("x.md", "no target here\n", [
        {
          id: "rw-x",
          file: "x.md",
          line: 1,
          pattern: "absent phrase",
          replacement: "y",
          reason: "r",
        },
      ]),
    ).toThrow(/rw-x/);
  });
});
