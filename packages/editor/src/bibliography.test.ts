import { describe, it, expect } from "vitest";
import {
  parseBibtex, parseCslJson, parseZoteroExport, importBibliography, detectBibliographyFormat,
  citeKeysIn, resolveCites, citeLabel,
} from "./bibliography.js";
import { markdownToDoc } from "./md-to-pm.js";
import { docToMarkdown } from "./pm-to-md.js";

// Bibliography + structured citations (P1.02; §5.4, matrix row 37): CSL-JSON items keyed by cite key,
// BibTeX/CSL-JSON/Zotero imports, `[@key]` round-trips, dangling keys visible.

const BIB = `@article{smith2020,
  author  = {Smith, Alice and Jones, Bob},
  title   = {The Politics of Visibility},
  journal = {Journal of Things},
  year    = {2020},
  volume  = {12},
  number  = {3},
  pages   = {100--120},
  doi     = {10.1234/jot.2020.12}
}

@book{rawls1971,
  author    = {Rawls, John},
  title     = {A Theory of Justice},
  publisher = {Harvard University Press},
  year      = {1971},
  address   = {Cambridge, MA}
}

@misc{dangling-free,
  title = {Untitled note}
}`;

const CSL = JSON.stringify([
  { id: "smith2020", type: "article-journal", title: "The Politics of Visibility",
    author: [{ family: "Smith", given: "Alice" }, { family: "Jones", given: "Bob" }],
    issued: { "date-parts": [[2020]] }, "container-title": "Journal of Things", DOI: "10.1234/jot.2020.12" },
  { id: "jones2021", type: "chapter", title: "Counterpoints", author: [{ family: "Jones", given: "Bob" }], issued: { "date-parts": [[2021]] } },
]);

const ZOTERO = JSON.stringify([
  { id: 12345, itemKey: "ABC123", key: "ABC123", type: "journalArticle", title: "Zotero item",
    creators: [{ creatorType: "author", firstName: "Zed", lastName: "Author" }],
    date: "2022", DOI: "10.5555/x" },
]);

describe("BibTeX import", () => {
  it("parses entries with keys, fields, nested braces", () => {
    const items = parseBibtex(BIB);
    expect(items.length).toBe(3);
    const smith = items.find((i) => i.id === "smith2020")!;
    expect(smith.type).toBe("article-journal");
    expect(smith.title).toBe("The Politics of Visibility");
    expect(smith["container-title"]).toBe("Journal of Things");
    expect(smith.author).toEqual([{ family: "Smith", given: "Alice" }, { family: "Jones", given: "Bob" }]);
    expect(smith.issued?.["date-parts"]).toEqual([[2020]]);
    expect(smith.page).toBe("100–120"); // -- → en dash
    expect(smith.DOI).toBe("10.1234/jot.2020.12");
    const rawls = items.find((i) => i.id === "rawls1971")!;
    expect(rawls.type).toBe("book");
    expect(rawls["publisher-place"]).toBe("Cambridge, MA");
  });
});

describe("CSL-JSON + Zotero import", () => {
  it("parses a CSL-JSON array verbatim", () => {
    const items = parseCslJson(CSL);
    expect(items.length).toBe(2);
    expect(items[0]!.id).toBe("smith2020");
    expect(items[1]!.author![0]!.family).toBe("Jones");
  });

  it("parses a Zotero export (numeric ids → string keys via itemKey)", () => {
    const items = parseZoteroExport(ZOTERO);
    expect(items.length).toBe(1);
    // numeric `id` loses to the itemKey — Zotero's own cite key wins
    expect(items[0]!.id).toBe("ABC123");
    expect(items[0]!.type).toBe("journalArticle");
  });

  it("Zotero BibTeX exports route through the BibTeX parser", () => {
    const items = parseZoteroExport(BIB);
    expect(items.length).toBe(3);
  });

  it("detectBibliographyFormat sniffs the three shapes", () => {
    expect(detectBibliographyFormat(BIB)).toBe("bibtex");
    expect(detectBibliographyFormat(CSL)).toBe("csl-json");
    expect(detectBibliographyFormat(ZOTERO)).toBe("zotero");
    expect(detectBibliographyFormat("not a bibliography")).toBeNull();
  });

  it("importBibliography dispatches on format", () => {
    expect(importBibliography("bibtex", BIB).length).toBe(3);
    expect(importBibliography("csl-json", CSL).length).toBe(2);
    expect(importBibliography("zotero", ZOTERO).length).toBe(1);
  });
});

describe("cite resolution", () => {
  it("collects every referenced key in first-reference order (multi-cites split, locators stripped)", () => {
    const keys = citeKeysIn("a \\[@smith2020] and \\[@a; @b] and \\[@smith2020, p. 12]");
    expect(keys).toEqual(["smith2020", "a", "b"]);
  });

  it("resolveCites marks missing keys dangling — never dropped", () => {
    const items = parseCslJson(CSL);
    const res = resolveCites("see \\[@smith2020] and \\[@missing2024]", items);
    expect(res).toEqual([
      { key: "smith2020", item: items[0] },
      { key: "missing2024", item: null },
    ]);
  });

  it("citeLabel renders 'Family (year) — title'", () => {
    const [item] = parseCslJson(CSL);
    expect(citeLabel(item!)).toBe("Smith (2020) — The Politics of Visibility");
  });

  it("the cite node round-trips through PM", () => {
    const md = "a \\[@smith2020] and \\[@a; @b] cites.";
    const doc = markdownToDoc(md);
    const cites: string[][] = [];
    doc.descendants((n) => {
      if (n.type.name === "cite") cites.push(n.attrs.keys as string[]);
      return true;
    });
    expect(cites).toEqual([["smith2020"], ["a", "b"]]);
    expect(docToMarkdown(doc)).toBe(md + "\n");
  });
});
