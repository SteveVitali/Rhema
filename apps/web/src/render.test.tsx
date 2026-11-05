import { describe, it, expect } from "vitest";
import { renderDocument } from "./render.js";
// SPA.27 — the app-surface elements are deleted; `pageElement`/`notFoundElement` stand in for the
// app-path legs (the title/head contract is path-driven — the element is incidental).
import {
  landingElement,
  loginElement,
  showcaseElement,
  pageElement,
  notFoundElement,
} from "./routes.js";
import { COPY } from "./copy.js";

// UX.1 — the document head: a distinct route-aware `<title>` on every route; meta description +
// Open Graph + Twitter tags on the public set only; the favicon link on every page; canonical/og:url
// only when the handler passed the request origin; every interpolated value attribute-escaped. And
// the companion invariant — exactly one `<h1>` per rendered document.

const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)![1];
const h1Count = (html: string) => html.match(/<h1[\s>]/g)?.length ?? 0;

describe("route-aware document meta (UX.1)", () => {
  it("every route gets a distinct `<page> · Rhēma` title; the landing leads with the brand + tagline", () => {
    const landing = renderDocument("/", landingElement, {}, { origin: "https://rhema.tools" });
    expect(title(landing)).toBe(`Rhēma — ${COPY.tagline}`);
    expect(title(renderDocument("/login", loginElement, {}))).toBe("Sign in · Rhēma");
    expect(title(renderDocument("/showcase", showcaseElement, {}))).toBe("Showcase · Rhēma");
    expect(title(renderDocument("/app", pageElement, {}))).toBe("Projects · Rhēma");
    expect(title(renderDocument("/app/inbox", notFoundElement, {}))).toBe("Inbox · Rhēma");
    expect(title(renderDocument("/app/settings/preferences", landingElement, {}))).toBe(
      "Preferences · Rhēma",
    );
    expect(title(renderDocument("/app/settings", landingElement, {}))).toBe("Settings · Rhēma");
    expect(title(renderDocument("/billing/return", landingElement, {}))).toBe("Billing · Rhēma");
    expect(title(renderDocument("/nope", landingElement, {}))).toBe("Not found · Rhēma");
  });

  it("project surfaces prefix the project title — and escape it", () => {
    const data = { project: { title: 'Essay "Holds" <Draft>', pill: "P", slug: "essay" } };
    const html = renderDocument("/p/essay/run", landingElement, data);
    expect(html).toContain("Run — Essay &quot;Holds&quot; &lt;Draft&gt; · Rhēma");
    // an unknown project sub-path still names the project, never the generic "Rhēma"
    expect(title(renderDocument("/p/essay/anything-else", landingElement, data))).toBe(
      "Essay &quot;Holds&quot; &lt;Draft&gt; · Rhēma",
    );
  });

  it("public routes carry description + OG + Twitter; app routes carry none", () => {
    const landing = renderDocument("/", landingElement, {}, { origin: "https://rhema.tools" });
    expect(landing).toContain(`<meta name="description" content="${COPY.meta.landing}">`);
    expect(landing).toContain('<meta property="og:type" content="website">');
    expect(landing).toContain('<meta property="og:site_name" content="Rhēma">');
    expect(landing).toContain('<meta name="twitter:card" content="summary">');
    expect(landing).toContain(`<meta property="og:title" content="Rhēma — ${COPY.tagline}">`);
    // showcase — its own description
    const sc = renderDocument("/showcase", showcaseElement, {}, { origin: "https://rhema.tools" });
    expect(sc).toContain(`<meta name="description" content="${COPY.meta.showcase}">`);
    // the app shell never leaks a marketing description
    const app = renderDocument("/app", pageElement, {}, { origin: "https://rhema.tools" });
    expect(app).not.toContain('name="description"');
    expect(app).not.toContain('property="og:');
    expect(app).not.toContain('name="twitter:');
  });

  it("canonical + og:url emit only when the origin is passed — and strip the query", () => {
    const withOrigin = renderDocument(
      "/pricing?x=1",
      landingElement,
      {},
      { origin: "https://rhema.tools/" },
    );
    expect(withOrigin).toContain('<link rel="canonical" href="https://rhema.tools/pricing">');
    expect(withOrigin).toContain('<meta property="og:url" content="https://rhema.tools/pricing">');
    const without = renderDocument("/pricing", landingElement, {});
    expect(without).not.toContain('rel="canonical"');
    expect(without).not.toContain('property="og:url"');
  });

  it("every SSR document inlines the kit stylesheet (REQ-KIT-2/5, ADR-129)", () => {
    for (const html of [
      renderDocument("/", landingElement, {}),
      renderDocument("/app", pageElement, {}),
      renderDocument("/nope", landingElement, {}),
    ]) {
      expect(html).toContain(".ui-btn");
    }
  });

  it("every document links the favicon (svg + ico fallback)", () => {
    for (const html of [
      renderDocument("/", landingElement, {}),
      renderDocument("/app", pageElement, {}),
      renderDocument("/nope", landingElement, {}),
    ]) {
      expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
      expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="any">');
    }
  });
});

describe("the all-documents nav counter (REQ-NAVT-1, O2-F18)", () => {
  it('every SSR document stamps data-nav-count="0" — the reset IS the mechanism detector', () => {
    for (const html of [
      renderDocument("/", landingElement, {}),
      renderDocument("/login", loginElement, {}),
      renderDocument("/app", pageElement, {}),
      renderDocument("/p/essay/run", landingElement, {
        project: { title: "Essay", pill: "P", slug: "essay" },
      }),
      renderDocument("/nope", notFoundElement, {}),
    ]) {
      expect(html).toContain('data-nav-count="0"');
    }
  });
});

describe("one page-level <h1> per document (UX.1 — SectionTitle renders <h2>)", () => {
  it("the landing hero carries the only h1; section strips are h2", () => {
    const html = renderDocument("/", landingElement, {});
    expect(h1Count(html)).toBe(1);
    expect(html).toContain("<h2"); // the section strips render as h2 now
  });

  it("login, showcase, and the surviving app-space document (not-found) each render exactly one h1", () => {
    expect(h1Count(renderDocument("/login", loginElement, {}))).toBe(1);
    expect(h1Count(renderDocument("/showcase", showcaseElement, {}))).toBe(1);
    // SPA.27 — the one app-pathed SSR document left is the not-found page a `?ssr=1` deep-link 404
    // emits; it renders exactly one h1 like every document.
    expect(h1Count(renderDocument("/app/inbox", notFoundElement, {}))).toBe(1);
  });
});
