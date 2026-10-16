#!/usr/bin/env node
// SPACAP.2 — the public-surface SSR regression baseline (the "unchanged" AC's BEFORE half;
// REQ-BND-1's forever-SSR set). Read-only GETs — $0, no sessions, no mutations.
//
//   node scripts/live/public-ssr-baseline.mjs \
//     [--web https://rhema.tools] [--out docs/build/reports/<date>_public-ssr-baseline]
//
// Per public route it records every semantic invariant N10 asserts plus the renderer markers the
// SPA chain adds (absent pre-chain, `data-renderer="ssr"` post-chain on this same set), a
// normalized body hash (per-request nonces/CSRF stripped so a post-deploy re-run can diff), and
// the raw HTML snapshot for eyeball diffs. Re-run against the post-deploy tip into a second out
// dir; the two `baseline.json` files must agree on every semantic field — only the marker fields
// and the normalized hash may legitimately move (asset hashes change across builds).
//
// Exit 0 always (this is a capture, not a gate); per-route anomalies print WARN, never silently.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const take = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const web = (take("--web") ?? "https://rhema.tools").replace(/\/+$/, "");
const outDir = resolve(
  take("--out") ??
    `docs/build/reports/${new Date().toISOString().slice(0, 10)}_public-ssr-baseline`,
);

// The forever-SSR set the composed-verification AC names, plus /signup (N10 walks it) and the
// favicon (N10's serve-200 leg).
const ROUTES = ["/", "/pricing", "/signup", "/login", "/showcase"];
const ASSETS = ["/favicon.svg"];
const BANNED = [/\bprivate beta\b/i, /\b1\.x\b/i, /\bcoming soon\b/i];
// The sample dossier a signed-out /showcase must render (manifest invariant 13; N10's leg).
const SHOWCASE_TEXT = ["The Politics of Visibility", "tested"];

const text = (html, re) => re.exec(html)?.[1] ?? null;
const count = (html, re) => (html.match(re) ?? []).length;

/** Strip per-request noise (CSP nonces, csrf-ish hidden inputs) so cross-deploy diffs are real. */
function normalize(html) {
  return html
    .replace(/\snonce="[^"]*"/g, "")
    .replace(/name="csrf[^"]*"\s+value="[^"]*"/g, "")
    .replace(/value="[A-Za-z0-9+/=_-]{32,}"/g, 'value="…"')
    .replace(/\s+/g, " ")
    .trim();
}

const report = {
  capturedAt: new Date().toISOString(),
  web,
  routes: {},
  assets: {},
  warnings: [],
};
const warn = (m) => {
  report.warnings.push(m);
  console.warn(`WARN ${m}`);
};

mkdirSync(outDir, { recursive: true });

for (const path of ROUTES) {
  const res = await fetch(`${web}${path}`);
  const html = await res.text();
  const file = `${path === "/" ? "index" : path.replaceAll("/", "_").replace(/^_/, "")}.html`;
  writeFileSync(join(outDir, file), html);
  const title = text(html, /<title>([^<]*)<\/title>/);
  const h1s = [...html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)].map((m) =>
    m[0].replace(/<[^>]+>/g, "").trim(),
  );
  const rec = {
    status: res.status,
    contentType: res.headers.get("content-type"),
    title,
    titleBranded: typeof title === "string" && /Rhēma/.test(title),
    h1Count: h1s.length,
    h1Text: h1s[0] ?? null,
    meta: {
      description: /<meta name="description"/.test(html),
      ogTitle: /<meta property="og:title"/.test(html),
      ogDescription: /<meta property="og:description"/.test(html),
      twitterCard: /<meta name="twitter:card"/.test(html),
      iconLink: /<link rel="icon"/.test(html),
    },
    markers: {
      // absent on the pre-chain deploy; `data-renderer="ssr"` is the post-chain expectation here.
      dataRenderer: text(html, /<html[^>]*\bdata-renderer="(ssr|spa)"/),
      dataRoute: text(html, /<html[^>]*\bdata-route="([^"]+)"/),
      dataMounted: /<html[^>]*\bdata-mounted/.test(html),
      spaRoot: /id="spa-root"/.test(html),
    },
    bannedCopyHits: BANNED.filter((re) => re.test(html)).map((re) => re.source),
    showcaseDossier:
      path === "/showcase"
        ? Object.fromEntries(SHOWCASE_TEXT.map((s) => [s, html.includes(s)]))
        : undefined,
    normalizedSha256: createHash("sha256").update(normalize(html)).digest("hex"),
    bytes: Buffer.byteLength(html),
  };
  report.routes[path] = rec;
  if (res.status !== 200) warn(`${path} → HTTP ${res.status}`);
  if (!rec.titleBranded) warn(`${path} title missing/unbranded (${JSON.stringify(title)})`);
  if (rec.h1Count !== 1) warn(`${path} renders ${rec.h1Count} <h1> (expect exactly 1)`);
  if (rec.bannedCopyHits.length > 0) warn(`${path} banned copy: ${rec.bannedCopyHits.join(", ")}`);
  if (path === "/showcase" && Object.values(rec.showcaseDossier).some((v) => !v))
    warn(`/showcase missing sample-dossier text ${JSON.stringify(rec.showcaseDossier)}`);
  console.log(`${res.status} ${path}  title=${JSON.stringify(title)}  h1=${rec.h1Count}  sha=${rec.normalizedSha256.slice(0, 12)}  markers=${JSON.stringify(rec.markers)}`);
}

for (const path of ASSETS) {
  const res = await fetch(`${web}${path}`);
  await res.arrayBuffer(); // drain
  report.assets[path] = { status: res.status, contentType: res.headers.get("content-type") };
  if (res.status !== 200) warn(`${path} → HTTP ${res.status}`);
  console.log(`${res.status} ${path}`);
}

writeFileSync(join(outDir, "baseline.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`baseline → ${join(outDir, "baseline.json")} (${report.warnings.length} warnings)`);
