import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { indexSourceNote, sourceNoteIndex } from "./source-note.js";

// REQ-CONV-5 — the source-note index extracts `{slug, title, url?, accessed?}` from each
// `sources/*.md` (labelled and free-form shapes); bodies stay raw. The reused-note recovery in
// claim-ledger.ts resolves against this map.

const SOURCES = join(
  fileURLToPath(new URL("../../fixtures/synthetic/corpus/the-borrowed-commons", import.meta.url)),
  "agents",
);
const note = (who: "author" | "editor", slug: string) => ({
  slug,
  markdown: readFileSync(join(SOURCES, who, "research/sources", `${slug}.md`), "utf8"),
});

describe("indexSourceNote", () => {
  it("reads the labelled `**URL:**`/`**Accessed:**` form", () => {
    const n = indexSourceNote(
      "marsh-viscosity-2021",
      note("author", "marsh-viscosity-2021").markdown,
    );
    expect(n).toEqual({
      slug: "marsh-viscosity-2021",
      title: "Source note — Marsh, Averly footbridge (2021)",
      url: "https://books.example.org/marsh/averly-footbridge",
      accessed: "2026-07-29",
    });
  });

  it("reads the free-form note: bare URL bullet, no ISO access date", () => {
    const n = indexSourceNote(
      "freeform-gazette-note",
      note("editor", "freeform-gazette-note").markdown,
    );
    expect(n.url).toBe("https://gazette.example.org/averly/seal-failure");
    expect(n.accessed).toBeUndefined();
    expect(n.title).toContain("Gazette");
  });

  it("builds the slug→note index", () => {
    const idx = sourceNoteIndex([
      note("author", "marsh-viscosity-2021"),
      note("author", "ekwueme-commons-2019"),
      note("editor", "freeform-gazette-note"),
    ]);
    expect(idx.size).toBe(3);
    expect(idx.get("ekwueme-commons-2019")?.url).toBe(
      "https://press.example.org/ekwueme/shared-plant",
    );
  });
});
