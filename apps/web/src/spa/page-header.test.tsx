// R7SHELL.1b (REQ-SHELL-3/5) — the header-removal census + the page-header row's unit contract.
//
//   1. The census: NO `<Shell` remains under `apps/web/src/spa/surfaces/**` or `spa/states.tsx`.
//      The named exemption list is EMPTY — reconfirmed at build time that no SSR/no-JS document
//      imports a `spa/surfaces/*` body (`pages.tsx`, `marketing.tsx` and `legal.tsx` render their
//      own components and keep their own `<Shell>` chrome, out of scope).
//   2. The row contract: `<PageHeader>` emits `data-page-header`, the `Project › Surface` trail
//      (`data-page-breadcrumb` + `data-breadcrumb-link` on every non-terminal crumb, the last
//      crumb `aria-current="page"` and never a link), and the h1 stays the document's only
//      `<PageTitle>` — REQ-COPY-7's `[data-spa-root] h1` focus target.
//   3. `<PageBody>` is the leaf's `<main>` landmark (the retired `<Shell>`'s column, verbatim).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageBody, PageHeader } from "./page-header.js";
import { COPY } from "../copy.js";

const SURFACES_DIR = join(__dirname, "surfaces");

/** The named exemption list — empty unless an SSR-shared body requires a `<Shell>` (none does). */
const SHELL_EXEMPTIONS: readonly string[] = [];

function spaSources(): { file: string; src: string }[] {
  const files = [
    ...readdirSync(SURFACES_DIR)
      .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      .map((f) => join(SURFACES_DIR, f)),
    join(__dirname, "states.tsx"),
  ];
  return files.map((file) => ({ file, src: readFileSync(file, "utf8") }));
}

describe("the per-leaf <Shell> headers are gone (REQ-SHELL-3)", () => {
  it("no <Shell element or Shell import remains under spa/surfaces/** or states.tsx", () => {
    const offenders: string[] = [];
    for (const { file, src } of spaSources()) {
      // Comments may cite `<Shell>` historically — the census pins code: JSX usage and imports.
      const code = src
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//"))
        .join("\n")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      if (/<Shell[\s>]/.test(code) || /import[^;]*\bShell\b[^;]*from "@rhema\/ui"/.test(code)) {
        offenders.push(file);
      }
    }
    expect(offenders, `exemptions: ${SHELL_EXEMPTIONS.join(", ") || "(none)"}`).toEqual([]);
  });

  it("no SSR/no-JS document imports a spa/surfaces body (the exemption list stays empty)", () => {
    for (const doc of ["pages.tsx", "marketing.tsx", "legal.tsx", "server.ts"]) {
      const src = readFileSync(join(__dirname, "..", doc), "utf8");
      expect(src.includes("spa/surfaces"), `${doc} shares a surface body — declare the exemption`).toBe(false);
    }
  });
});

describe("<PageHeader> — the title row contract", () => {
  it("emits the row hook + the h1, and no breadcrumb outside project scope", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { title: "Usage" }));
    expect(html).toContain('data-page-header="true"');
    expect(html).not.toContain("data-page-breadcrumb");
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain("Usage");
  });

  it("renders Project › Surface — the project crumb links, the surface is current text", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        title: "Outline",
        crumbs: [
          { label: "Alpha Essay", href: "/p/alpha-essay" },
          { label: "Outline" },
        ],
      }),
    );
    expect(html).toContain('data-page-breadcrumb="true"');
    const links = html.match(/data-breadcrumb-link="true"/g) ?? [];
    expect(links.length).toBe(1);
    expect(html).toContain('href="/p/alpha-essay"');
    expect(html).toContain("Alpha Essay");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(COPY.pageHeader.separator);
    // the current crumb is text, never a link — and the trail is the plain-anchor SPA seam.
    expect(html).toContain(`<span aria-current="page">Outline</span>`);
  });

  it("a detail page keeps the middle crumb linked (Project › Surface › item)", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        title: "Visibility scores",
        crumbs: [
          { label: "alpha", href: "/p/alpha" },
          { label: "Figures", href: "/p/alpha/figures" },
          { label: "Visibility scores" },
        ],
      }),
    );
    const links = html.match(/data-breadcrumb-link="true"/g) ?? [];
    expect(links.length).toBe(2);
    expect(html).toContain('href="/p/alpha/figures"');
  });
});

describe("<PageBody>", () => {
  it("is the leaf's <main> landmark", () => {
    const html = renderToStaticMarkup(createElement(PageBody, null, createElement("p", null, "x")));
    expect(html.startsWith("<main")).toBe(true);
    expect(html).toContain(">x</p>");
  });
});
