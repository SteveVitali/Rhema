import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownProse, SafeUrlLink, markdownToReact, safeHref } from "./markdown-prose.js";

// R7COPY.1b (REQ-COPY-3; C8/D2/G2/I3) — the one sanitized markdown renderer's markup contract:
// emphasis/lists/paragraphs render (the *Paradoxides* case — no literal asterisks); raw HTML,
// <img onerror> and javascript: hrefs are neutralized (never an anchor, never markup); safe
// links get rel/target; code stays mono; headings clamp into the card's outline; long bare URLs
// truncate with the full URL in title.

const render = (text: string) => renderToStaticMarkup(<MarkdownProse text={text} />);

describe("MarkdownProse (R7COPY.1b / REQ-COPY-3)", () => {
  it("renders emphasis, strong, lists and paragraphs — the *Paradoxides* case with no asterisks", () => {
    const html = render("scaled off *Paradoxides* and **bold**.\n\n- one\n- two\n\n1. first\n2. second");
    expect(html).toContain("<em>Paradoxides</em>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>");
    expect(html).toContain("<ol");
    expect(html).toContain("<p");
    expect(html).toContain('data-md-block');
    // no literal asterisk survives into the rendered markup
    expect(html).not.toMatch(/off \*Paradoxides\*/);
  });

  it("neutralizes raw <script>, <img onerror> and javascript: links — no raw HTML reaches the DOM", () => {
    const html = render("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))");
    // the raw sources render as ESCAPED text (code/pre), never live elements
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("onerror");
    // a javascript: href renders its label text without an anchor
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<a");
  });

  it("javascript: through a reference link is also neutralized", () => {
    const html = render("[x][id]\n\n[id]: javascript:alert(1)");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("x");
  });

  it("safe links render with rel/target on externals; internals and mailto stay anchors", () => {
    const html = render("[ext](https://ex.com/a) [rel](/p/x) [mail](mailto:a@b.c) [frag](#s)");
    expect(html).toContain('href="https://ex.com/a"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="/p/x"');
    expect(html).toContain('href="mailto:a@b.c"');
    expect(html).toContain('href="#s"');
  });

  it("smuggled schemes (control chars, entities) never become anchors", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>x</script>")).toBeNull();
    expect(safeHref("vbscript:x")).toBeNull();
    expect(safeHref("file:///etc/passwd")).toBeNull();
    expect(safeHref("JaVaScRiPt:x")).toBeNull();
    expect(safeHref("https://ok.com")).toBe("https://ok.com");
    expect(safeHref("/p/x")).toBe("/p/x");
    expect(safeHref("#top")).toBe("#top");
    const html = render("[x](java\tscript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("a long bare URL truncates with the full URL in title; a labelled link keeps its text", () => {
    const long = "https://example.com/this/is/a/very/long/url/path/that/would/overflow/a/card";
    const html = render(`<${long}> [see the source](${long})`);
    expect(html).toContain(`title="${long}"`);
    expect(html).toContain("…");
    // the labelled link keeps its full label text
    expect(html).toContain("see the source");
  });

  it("SafeUrlLink truncates + titles long URLs and refuses unsafe hrefs", () => {
    const long = "https://example.com/".padEnd(80, "x");
    const html = renderToStaticMarkup(<SafeUrlLink url={long} />);
    expect(html).toContain(`title="${long}"`);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("…");
    expect(renderToStaticMarkup(<SafeUrlLink url="javascript:x" />)).not.toContain("<a");
  });

  it("code blocks and inline code keep the mono face; markdown syntax renders not raw text", () => {
    const html = render("`inline` \n\n```\nlet x = 1;\n```");
    expect(html).toContain("<code");
    expect(html).toContain("ui-d-mono");
    expect(html).toContain("let x = 1;");
  });

  it("headings clamp into the card outline (h1 → h3) and blockquotes reuse the quote face", () => {
    const html = render("# Top\n\n## Mid\n\n> quoted");
    expect(html).toContain("<h3");
    expect(html).not.toContain("<h1");
    expect(html).toContain("<blockquote");
    expect(html).toContain("ui-d-q");
  });

  it("images render as labelled links — never auto-loaded <img>", () => {
    const html = render("![alt text](https://ex.com/i.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://ex.com/i.png"');
    expect(html).toContain("alt text");
  });

  it("unparseable input falls back to escaped plain paragraphs — never nothing, never markup", () => {
    const html = renderToStaticMarkup(<MarkdownProse text={"\0\0broken" as string} />);
    expect(html).toContain("broken");
    expect(markdownToReact("")).toBeNull();
  });

  it("tables and footnotes render structurally", () => {
    const html = render("| a | b |\n|---|---|\n| 1 | 2 |\n\nnote[^1]\n\n[^1]: a footnote");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("footnote");
  });
});
