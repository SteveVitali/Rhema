/**
 * REQ-CORPUS-12 (fetch half) — unit tests for `fetch-published.mjs` on committed local HTML
 * fixtures. No network: `runFetch`/`fetchPost` take an injected `fetchImpl`, and the module's
 * `main()` only runs under direct CLI invocation (import is side-effect-free).
 *
 * The last describe block is the never-invoked guard: this tool must not be reachable from any
 * package.json script, CI workflow or other test — the only reference allowed anywhere is this
 * file.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { parsePublished } from "@rhema/demo-corpus";
import {
  POSTS,
  FetchPublishedError,
  assertOutDir,
  buildRequest,
  extractPostHtml,
  fetchPost,
  htmlToMarkdown,
  renderPublishedDoc,
  resolvePost,
  runFetch,
  sha256Hex,
} from "./fetch-published.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "../..");
const fixture = (name) => readFileSync(join(HERE, "fixtures", name), "utf8");

const EXPECTED_SLUGS = [
  "constitution-of-reason",
  "structure-of-political-difference",
  "the-governable-mind",
  "the-politics-of-visibility",
];

function stubFetch(htmlByUrl, seen = []) {
  return async (req) => {
    seen.push(req);
    const html = htmlByUrl[req.url];
    if (html === undefined) return new Response("nope", { status: 404 });
    return new Response(html, { status: 200 });
  };
}

describe("the committed URL constant", () => {
  it("holds exactly the four pre-authorized posts", () => {
    expect(Object.keys(POSTS).sort()).toEqual(EXPECTED_SLUGS);
    for (const url of Object.values(POSTS)) {
      expect(url).toMatch(/^https:\/\/sjsebastian\.substack\.com\/p\/[a-z0-9-]+$/);
    }
  });

  it("resolvePost accepts a listed slug or its exact URL, and refuses anything else", () => {
    for (const [slug, url] of Object.entries(POSTS)) {
      expect(resolvePost(slug)).toEqual({ slug, url });
      expect(resolvePost(url)).toEqual({ slug, url });
    }
    for (const bad of [
      "not-a-post",
      "https://sjsebastian.substack.com/p/some-other-post",
      "https://example.org/p/the-politics-of-visibility",
      "the-politics-of-visibility/extra",
      "",
    ]) {
      expect(() => resolvePost(bad)).toThrow(FetchPublishedError);
    }
  });
});

describe("conversion + front matter (local fixtures)", () => {
  it("extracts the post title and the body container, dropping page chrome", () => {
    const { title, contentHtml } = extractPostHtml(fixture("post-basic.html"));
    expect(title).toBe("A Synthetic Post");
    expect(contentHtml).toContain("body markup");
    expect(contentHtml).not.toContain("Fixture Stack");
    expect(contentHtml).not.toContain("Subscribe");
  });

  it("converts headings, lists, emphasis, links and blockquotes to markdown", () => {
    const md = htmlToMarkdown(extractPostHtml(fixture("post-basic.html")).contentHtml);
    expect(md).toContain("## Section One");
    expect(md).toContain("**strong text**");
    expect(md).toContain("_emphasis_");
    expect(md).toContain("[fixture link](https://example.org/notes)");
    expect(md).toContain("-   alpha");
    expect(md).toContain("> A quoted line.");
    expect(md).not.toContain("chrome that must not appear");
  });

  it("throws on a page with no post-content container (fail, never guess)", () => {
    expect(() => extractPostHtml(fixture("post-no-body.html"))).toThrow(FetchPublishedError);
  });

  it("writes front matter the exporter's parser accepts, sha256 covering the body", () => {
    const body = "# Title\n\nBody text.\n";
    const doc = renderPublishedDoc({
      url: POSTS["the-politics-of-visibility"],
      fetched: "2026-11-04",
      body,
    });
    const parsed = parsePublished(doc); // 214's real parser — shape contract
    expect(parsed.url).toBe(POSTS["the-politics-of-visibility"]);
    expect(parsed.fetched).toBe("2026-11-04");
    expect(parsed.sha256).toBe(sha256Hex(parsed.body));
    expect(parsed.body).toBe(body);
    expect(doc.startsWith(`---\nurl: ${parsed.url}\nfetched: 2026-11-04\nsha256: `)).toBe(true);
  });
});

describe("the request shape (the pre-authorization conditions)", () => {
  it("is GET only, redirect:error, and carries no cookie or credential header", () => {
    const req = buildRequest(POSTS["constitution-of-reason"]);
    expect(req.method).toBe("GET");
    expect(req.redirect).toBe("error");
    const names = [...req.headers.keys()].sort();
    expect(names).toEqual(["accept", "user-agent"]);
    expect(req.headers.get("cookie")).toBeNull();
    expect(req.headers.get("authorization")).toBeNull();
  });

  it("runFetch issues exactly one GET per post and writes published.md under the out root", async () => {
    const out = mkdtempSync(join(tmpdir(), "fetch-published-"));
    const htmlByUrl = Object.fromEntries(
      Object.values(POSTS).map((u) => [u, fixture("post-basic.html")]),
    );
    const seen = [];
    const results = await runFetch({
      sourceRoot: out,
      fetched: "2026-11-04",
      fetchImpl: stubFetch(htmlByUrl, seen),
    });
    expect(results).toHaveLength(4);
    expect(seen).toHaveLength(4);
    expect(seen.map((r) => r.url).sort()).toEqual(Object.values(POSTS).sort());
    for (const req of seen) {
      expect(req.method).toBe("GET");
      expect([...req.headers.keys()].sort()).toEqual(["accept", "user-agent"]);
    }
    for (const slug of Object.keys(POSTS)) {
      const doc = readFileSync(join(out, slug, "published.md"), "utf8");
      const parsed = parsePublished(doc);
      expect(parsed.url).toBe(POSTS[slug]);
      expect(parsed.fetched).toBe("2026-11-04");
      expect(parsed.sha256).toBe(sha256Hex(parsed.body));
    }
  });

  it("a non-OK response fails with the post's HTTP status", async () => {
    await expect(fetchPost(POSTS["the-governable-mind"], stubFetch({}))).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe("the output guard", () => {
  it("refuses any output dir inside the repository (a committable path)", () => {
    expect(() => assertOutDir(ROOT)).toThrow(FetchPublishedError);
    expect(() => assertOutDir(join(ROOT, "packages/demo-corpus/corpus"))).toThrow(
      FetchPublishedError,
    );
    expect(assertOutDir(mkdtempSync(join(tmpdir(), "fetch-published-")))).toContain("fetch-published-");
  });
});

describe("never invoked by build, test or runtime", () => {
  const SELF = "tools/demo-corpus/fetch-published.test.mjs";

  function tracked() {
    return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  }

  it("no package.json script references fetch-published", () => {
    const offenders = [];
    for (const rel of tracked().filter((p) => p.endsWith("package.json"))) {
      const pkg = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
      for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
        if (String(cmd).includes("fetch-published")) offenders.push(`${rel} scripts.${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no CI workflow references fetch-published", () => {
    const offenders = tracked()
      .filter((p) => p.startsWith(".github/workflows/"))
      .filter((p) => readFileSync(join(ROOT, p), "utf8").includes("fetch-published"));
    expect(offenders).toEqual([]);
  });

  it("no other test or harness file references fetch-published (this file is the only allowed name)", () => {
    const offenders = tracked()
      .filter((p) => /\.test\.(ts|tsx|mjs)$/.test(p) && p !== SELF)
      .filter((p) => readFileSync(join(ROOT, p), "utf8").includes("fetch-published"));
    expect(offenders).toEqual([]);
  });
});
