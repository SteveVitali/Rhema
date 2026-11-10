// 243a_R7KIT.3e — the demo dossier snapshot renders the shared article + panel bodies.
// Regression: the one-line run header must keep the RunCard's null-meter guard
// (the replayed demo card carries no spentCredits/capCredits).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DossierArticle, dossierSurfaces } from "./dossier-view.js";
import type { DossierViewData } from "./dossier-view.js";

const SNAPSHOTS = fileURLToPath(new URL("../../../packages/demo-corpus/fixtures/synthetic/snapshots", import.meta.url));
function load(slug: string, runId: string): DossierViewData {
  const env = JSON.parse(readFileSync(join(SNAPSHOTS, slug, "dossier", `${runId}.json`), "utf8")) as { dto: unknown };
  return env.dto as DossierViewData;
}

describe("the demo dossier snapshot through DossierArticle + dossierSurfaces", () => {
  for (const slug of ["the-borrowed-commons"]) {
    for (const runId of ["v1-review","v2-review"]) {
      it(`${slug} ${runId}`, () => {
        const d = load(slug, runId);
        const html = renderToStaticMarkup(<DossierArticle dossier={d} compact={false} />);
        expect(html).toContain("data-letter-view");
        const sur = dossierSurfaces({ dossier: d });
        const panel = renderToStaticMarkup(<>{sur.deskFindingsBody}</>);
        expect(panel).toContain("data-dossier-desk");
      });
    }
  }
});
