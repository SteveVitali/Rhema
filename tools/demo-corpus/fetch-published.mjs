#!/usr/bin/env node
/**
 * REQ-CORPUS-12 (fetch half) / REQ-CORPUS-8 (fetch half) — the ONE-TIME, operator-run Published
 * fetch. Reads each live Substack post once and writes `published.md` in 214's front-matter shape
 * (url, fetched, sha256) into the corresponding project dir under the withheld source root
 * (`agent-scratch/`, gitignored upstream). The exporter ingests it through the same sanitize +
 * denylist path as every other artifact.
 *
 * Pre-authorization (spec §6, ratified GD-RATIFY.R7 / GD-DEMO-PUBLISHED.R7) — this tool exists
 * only inside these conditions, and any failed condition aborts the run:
 *   - GET only (the request is built as method GET, redirect:"error" — a redirect would be a
 *     fifth URL and is refused);
 *   - exactly the four post URLs below — a committed constant; no URL is ever taken from argv,
 *     config or env, and `resolvePost` refuses anything not in the table;
 *   - no credentials, no cookies — the request headers carry only Accept + User-Agent; the tool
 *     reads no env, no keychain, no config;
 *   - output written only to the withheld local path — `assertOutDir` refuses any target inside
 *     this repository;
 *   - never wired into a build, test or runtime path — `fetch-published.test.mjs` fails if any
 *     package.json script, CI workflow or test references this file.
 *
 *   node tools/demo-corpus/fetch-published.mjs --date <YYYY-MM-DD> [--source <root>] [--only <slug>]
 *
 * The fetch date is a recorded input (the tool reads no clock), matching export.mjs's date rule.
 * Tests inject `fetchImpl` and never touch the network.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const DEFAULT_SOURCE = resolve(ROOT, "../agent-discourse/agent-scratch/projects");
const USER_AGENT = "rhema-demo-corpus-fetch/1.0 (one-time operator-run; no cookies)";

/** The four pre-authorized posts — slug → live URL. Anything else is refused. */
export const POSTS = Object.freeze({
  "the-politics-of-visibility":
    "https://sjsebastian.substack.com/p/the-politics-of-visibility",
  "the-governable-mind": "https://sjsebastian.substack.com/p/the-governable-mind",
  "structure-of-political-difference":
    "https://sjsebastian.substack.com/p/the-structure-of-political-difference",
  "constitution-of-reason": "https://sjsebastian.substack.com/p/the-constitution-of-reason",
});

export class FetchPublishedError extends Error {}

export function sha256Hex(text) {
  return createHash("sha256").update(new TextEncoder().encode(text)).digest("hex");
}

/** Slug or URL → the post row, or a hard refusal. The only lookup table is POSTS. */
export function resolvePost(selector) {
  if (Object.hasOwn(POSTS, selector)) return { slug: selector, url: POSTS[selector] };
  const byUrl = Object.entries(POSTS).find(([, url]) => url === selector);
  if (byUrl) return { slug: byUrl[0], url: byUrl[1] };
  throw new FetchPublishedError(
    `refused: not one of the four pre-authorized post URLs/slugs — ${JSON.stringify(selector)}`,
  );
}

/** Extract a `<div>` element whose class contains `token`, balanced-tag, or null. */
function extractBalancedDiv(html, token) {
  const tagRe = /<div\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    if (!new RegExp(`class="[^"]*${token.replace(/\s+/g, "\\s+")}[^"]*"`).test(m[0])) continue;
    let depth = 1;
    const scan = /<div\b[^>]*>|<\/div\s*>/gi;
    scan.lastIndex = tagRe.lastIndex;
    let s;
    while ((s = scan.exec(html)) !== null) {
      depth += s[0].startsWith("</") ? -1 : 1;
      if (depth === 0) return html.slice(m.index, scan.lastIndex);
    }
    return null; // unbalanced markup — fail rather than guess
  }
  return null;
}

function extractTitle(html) {
  const postTitle = /<h1\b[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const any = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(postTitle ? "" : html);
  const inner = (postTitle ?? any)?.[1];
  if (!inner) return null;
  const text = inner
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * Reduce a fetched post page to its post-content element + title. Substack renders the essay in
 * `div.body.markup` inside `div.available-content`; everything else (nav, subscribe widgets,
 * footer, author-profile links) is page chrome and never enters `published.md`.
 */
export function extractPostHtml(html) {
  const title = extractTitle(html);
  const body =
    extractBalancedDiv(html, "body markup") ?? extractBalancedDiv(html, "available-content");
  if (!body) {
    throw new FetchPublishedError("post content container (.body.markup) not found in fetched HTML");
  }
  return { title, contentHtml: body };
}

/** HTML → markdown (the turndown precedent from apps/convert; atx headings, fenced code, gfm). */
export function htmlToMarkdown(html) {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
  });
  td.use(gfm);
  return td.turndown(html);
}

/** The `published.md` document 214's exporter parses: front matter + body; sha256 covers the body. */
export function renderPublishedDoc({ url, fetched, body }) {
  const normalized = body.endsWith("\n") ? body : `${body}\n`;
  return `---\nurl: ${url}\nfetched: ${fetched}\nsha256: ${sha256Hex(normalized)}\n---\n${normalized}`;
}

/** The output dir may never be inside this repository (a repo path could be committed). */
export function assertOutDir(dir, repoRoot = ROOT) {
  const abs = resolve(dir);
  if (abs === repoRoot || abs.startsWith(repoRoot + sep)) {
    throw new FetchPublishedError(
      `refused: output dir is inside the repository (${abs}); published.md may only be written to the withheld source root`,
    );
  }
  return abs;
}

/** Build the GET request — the single place the request's shape is fixed (the conditions above). */
export function buildRequest(url) {
  return new Request(url, {
    method: "GET",
    redirect: "error", // a redirect is a fifth URL — refused by construction
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
}

/** One GET of `url` → post body markdown + title. `fetchImpl` is injectable for tests. */
export async function fetchPost(url, fetchImpl = fetch) {
  const res = await fetchImpl(buildRequest(url));
  if (!res.ok) throw new FetchPublishedError(`GET ${url} → HTTP ${res.status}`);
  const { title, contentHtml } = extractPostHtml(await res.text());
  return { title, markdown: htmlToMarkdown(contentHtml) };
}

/** Run the fetch for the selected posts; writes `<sourceRoot>/<slug>/published.md`. */
export async function runFetch({ sourceRoot, fetched, only = null, fetchImpl = fetch }) {
  const outRoot = assertOutDir(sourceRoot);
  const targets = Object.keys(POSTS).filter((slug) => !only || only.includes(slug));
  const results = [];
  for (const slug of targets) {
    const { url } = resolvePost(slug);
    const { markdown } = await fetchPost(url, fetchImpl); // exactly one GET per post
    const doc = renderPublishedDoc({ url, fetched, body: markdown });
    const dir = join(outRoot, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "published.md"), doc);
    results.push({ slug, url, sha256: sha256Hex(markdown.endsWith("\n") ? markdown : `${markdown}\n`), bytes: doc.length });
  }
  return results;
}

function arg(name, all = false) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}`) out.push(process.argv[++i]);
  }
  return all ? out : out[0];
}

async function main() {
  const source = arg("source") ?? DEFAULT_SOURCE;
  const date = arg("date");
  const only = arg("only", true);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(
      "usage: fetch-published.mjs --date <YYYY-MM-DD> [--source <root>] [--only <slug> ...]",
    );
    process.exit(2);
  }
  for (const sel of only) resolvePost(sel); // refuse early on any non-listed selector
  try {
    const results = await runFetch({ sourceRoot: source, fetched: date, only: only.length ? only : null });
    for (const r of results) {
      console.log(`${r.slug}: GET ${r.url} → published.md (${r.bytes} B, sha256 ${r.sha256})`);
    }
    console.log(`fetched ${results.length} post(s) → ${resolve(source)} (withheld source root)`);
  } catch (err) {
    console.error(`fetch FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// CLI-only entry — importing this module runs nothing (the never-invoked test's premise).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
