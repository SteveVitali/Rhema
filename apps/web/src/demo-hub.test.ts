// 221a R7DEM.5b — the filled `/demo` hub (REQ-TOUR-1/3/8; P4-6). The equality leg reads each
// essay's committed `card-facts.json` snapshot (218a's `demoCardFacts` output) and asserts the
// served HTML carries those exact numbers — plus the grep leg that fails if any count is
// computed inside `apps/web` hub code. Runs against the real committed corpus (219 landed) and
// the synthetic fixture (zero public cards — honest empty, never fabricated facts).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_HUB_ESSAYS,
  DEMO_ROUTE_IDS,
  DEMO_TOUR_ENTRY_HREF,
  demoDeepLink,
  demoInternalPath,
  spaRouteFor,
} from "@rhema/contracts";
import type { DemoCardFactsDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import { demoHubCards } from "./demo-data.js";
import { domContractMatch } from "./dom-contract.js";
import { LOOK_AT } from "./demo-page.js";
import { COPY } from "./copy.js";
import type { DataSource, SessionHeaders } from "./data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "..", "..", "packages", "demo-corpus");
const FIXTURE = join(CORPUS, "fixtures", "synthetic");

const cardFacts = (essay: string): DemoCardFactsDto =>
  (JSON.parse(
    readFileSync(join(CORPUS, "snapshots", essay, "card-facts.json"), "utf8"),
  ) as { dto: DemoCardFactsDto }).dto;

const throwing: DataSource = new Proxy({} as Record<string, unknown>, {
  get(_t, prop) {
    return () => Promise.reject(new Error(`outer DataSource touched: ${String(prop)}`));
  },
}) as DataSource;
const sessionFor = (c: { req: { header: (n: string) => string | undefined } }): SessionHeaders | null =>
  c.req.header("cookie") ? { cookie: c.req.header("cookie") } : null;

function app(root: string | null) {
  const deps: WebDeps = {
    dataSource: throwing,
    session: sessionFor,
    ...(root != null ? { demoCorpusRoot: root } : {}),
    buildGitSha: "testsha",
  };
  return createWebApp(deps);
}

const get = (a: ReturnType<typeof app>, path: string, init?: RequestInit) =>
  a.request(`http://local.test${path}`, init);

describe("REQ-TOUR-1 — the filled hub on the real snapshots", () => {
  it("demoHubCards returns every DEMO_HUB_ESSAYS facts dto, in order; fixture serves none", async () => {
    const cards = await demoHubCards(CORPUS);
    expect(cards.map((c) => c.essay)).toEqual([...DEMO_HUB_ESSAYS]);
    for (const c of cards) expect(c).toEqual(cardFacts(c.essay));
    expect(await demoHubCards(FIXTURE)).toEqual([]);
    expect(await demoHubCards(join(FIXTURE, "nope"))).toEqual([]);
  });

  it("GET /demo renders four ordered cards whose numbers equal card-facts.json verbatim (P4-6)", async () => {
    const html = await (await get(app(CORPUS), "/demo")).text();
    const order = [...html.matchAll(/data-demo-essay-card="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([...DEMO_HUB_ESSAYS]);
    for (const essay of DEMO_HUB_ESSAYS) {
      const f = cardFacts(essay);
      expect(html, `${essay} title`).toContain(f.title);
      expect(html, `${essay} counts`).toContain(
        `${f.counts.major} major · ${f.counts.minor} minor · ${f.counts.strengths} strengths · ${f.counts.claimsChecked} claims checked`,
      );
      expect(html, `${essay} words`).toContain(`${f.words} words`);
      expect(html, `${essay} published label`).toContain(f.publishedLabel!);
      expect(html, `${essay} substack link`).toContain(`href="${f.publishedUrl}"`);
      expect(html, `${essay} open link`).toContain(`href="/demo/${essay}"`);
    }
    // the retitle note renders where the record holds one (SPD) and nowhere else
    const spd = cardFacts("structure-of-political-difference");
    expect(html).toContain(`Retitled from “${spd.retitle!.from}”`);
    expect(html).toContain(spd.retitle!.atLabel);
    expect(html.match(/Retitled/g)?.length).toBe(1);
    // the arc chip row + the hero's tour-entry CTA
    expect(html.match(/data-demo-card-arc/g)?.length).toBe(4);
    expect(html).toContain(`data-demo-tour-entry`);
    expect(html).toContain(`href="${DEMO_TOUR_ENTRY_HREF}"`);
    // provenance paragraph: agent-discourse + repo link + S-10 roles + the byline
    expect(html).toContain("data-demo-provenance");
    expect(html).toContain("https://github.com/SteveVitali/agent-discourse");
    expect(html).toContain("the writer");
    expect(html).toContain("the editor (agent)");
    expect(html).toContain("the revising agent");
    expect(html).toContain("the drafting agent");
    expect(html).toContain("S. J. Sebastian");
  });

  it("the hub is cookie-invariant and keeps the N10 head + zero outer reads", async () => {
    const anon = await get(app(CORPUS), "/demo");
    const cookied = await get(app(CORPUS), "/demo", {
      headers: { cookie: "rhema.session_token=x" },
    });
    expect(anon.status).toBe(200);
    // documents carry a per-request CSP nonce — compare with it stripped (the twins' byte-
    // identity leg lives in demo.test.ts; here the claim is zero session variance).
    const strip = (t: string) => t.replace(/nonce="[^"]*"/g, 'nonce="X"');
    expect(strip(await anon.text())).toBe(strip(await cookied.text()));
    const html = await (await get(app(CORPUS), "/demo")).text();
    expect(html).toContain("<title>Demo · Rhēma</title>");
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('rel="icon"');
  });

  it("the synthetic fixture serves an honest card-free hub (no fabricated facts)", async () => {
    const html = await (await get(app(FIXTURE), "/demo")).text();
    expect(html).toContain("data-demo-root");
    expect(html).toContain("data-demo-hub");
    expect(html).not.toContain("data-demo-essay-card");
    expect(html).toContain("data-demo-provenance"); // the provenance frame is copy, not data
  });
});

describe("REQ-TOUR-3 — the 'What to look at' bullets", () => {
  it("every essay's bullets pair positionally with its LOOK_AT link table", () => {
    for (const [essay, links] of Object.entries(LOOK_AT)) {
      const bullets = COPY.demo.cards.lookAt[essay as keyof typeof COPY.demo.cards.lookAt];
      expect(bullets.length, essay).toBe(links.length);
      expect(links.length, essay).toBeGreaterThanOrEqual(3);
      expect(links.length, essay).toBeLessThanOrEqual(5);
    }
    expect(Object.keys(LOOK_AT).sort()).toEqual(
      DEMO_HUB_ESSAYS.filter((e) => e !== "structure-of-political-difference").sort(),
    );
  });

  it("GET /demo emits every bullet as a data-demo-look-at link", async () => {
    const html = await (await get(app(CORPUS), "/demo")).text();
    const emitted = [...html.matchAll(/data-demo-look-at[^>]*href="([^"]+)"/g)].map((m) => m[1]!);
    const wanted = Object.entries(LOOK_AT).flatMap(([essay, links]) =>
      links.map((l) => demoDeepLink(essay, l.route, l.hook)),
    );
    for (const w of wanted) expect(emitted, w).toContain(w);
    expect(emitted.length).toBe(wanted.length);
  });
});

describe("REQ-TOUR-8 — every deep link resolves inside the allowlist + the DOM contract", () => {
  it("every LOOK_AT route maps to a DEMO_ROUTE_IDS route and a declared hook", () => {
    for (const [essay, links] of Object.entries(LOOK_AT)) {
      for (const { route, hook } of links) {
        const link = demoDeepLink(essay, route, hook);
        const [path, fragment] = link.split("#");
        const internal = demoInternalPath(path!);
        expect(internal, link).not.toBeNull();
        expect(DEMO_ROUTE_IDS, link).toContain(spaRouteFor(internal!).routeId);
        expect(domContractMatch(fragment!), link).not.toBeNull();
      }
    }
  });
});

describe("P4-6 — no count is computed in `apps/web` hub code (grep)", () => {
  it("demo-page.tsx formats only: no counting machinery, arithmetic, or raw-record access", () => {
    const src = readFileSync(join(HERE, "demo-page.tsx"), "utf8");
    for (const banned of [
      /deliveredRecordCounts\s*\(/,
      /findingsAt\s*\(/,
      /claimsAt\s*\(/,
      /statusMeters\s*\(/,
      /demoCardFacts\s*\(/, // the owner lives in demo-corpus; the hub reads its DTO
      /\.reduce\s*\(/,
      /\+\+/,
      /\.(findings|claims)\b(?!Checked)/,
      /Math\./,
    ]) {
      expect(src, `hub source contains ${banned}`).not.toMatch(banned);
    }
  });
});
