import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  type OrchestratorTestDb,
} from "./testing/index.js";
import { InMemoryContentStore } from "@rhema/mirror";
import { figureClaimsForDraft, figureClaimsMountProvider, FIGURE_CLAIMS_PATH } from "./figure-claims.js";
import { figureBlockMarkdown, verificationFromVerdicts } from "@rhema/contracts";

// P1.13 — the figure-claims inventory (§7.5; REQ-VIZ-13/14): the reviewed draft's figure markers
// resolve to deterministic Tier-1 claim rows (values from data.csv, labels + axis ranges from the
// spec), grouped under the figure's document-order number; a `kind:"none"` figure inventories
// UNSUPPORTED by construction — claims exist but carry no refs. The mount provider lands the file
// into a review/fact_check run's Editor hydration.

let db: OrchestratorTestDb;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;

const FIG_ID = "01ARZ3NDEKTSV4RRFFQ69G5FBF";
const CLAIM_REF = "01ARZ3NDEKTSV4RRFFQ69G5FC1";

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  store = new InMemoryContentStore();
  seed = await seedProject(db, {
    userId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    billingAccountId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
    projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
  });
});
afterEach(() => db.close());

async function seedMirrorFile(path: string, text: string, suffix: string) {
  const { sha256 } = await store.putText(seed.workspaceId, text);
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,'figure','shared',$4,$5)`,
    [`art_${suffix}`, seed.workspaceId, seed.projectId, path, `av_${suffix}`],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,1,$3,'k',$4,'application/octet-stream','{}'::jsonb)`,
    [`av_${suffix}`, `art_${suffix}`, sha256, Buffer.byteLength(text)],
  );
}

const VEGA_SPEC = JSON.stringify({
  mark: "bar",
  data: { values: [] },
  encoding: {
    x: { field: "group", type: "nominal", title: "Group" },
    y: { field: "score", type: "quantitative", title: "Score" },
  },
});

async function seedFigure(provenance: Record<string, unknown>) {
  await seedMirrorFile(`assets/figures/${FIG_ID}/spec.vl.json`, VEGA_SPEC, "figspec");
  await seedMirrorFile(`assets/figures/${FIG_ID}/data.csv`, "group,score\nradical,0.71\nmoderate,0.44\n", "figdata");
  await db.pg.query(
    `insert into figures(id, project_id, spec_kind, caption, alt, title, provenance)
     values ($1,$2,'vega_lite','Scores by group.','Alt.','Visibility scores',$3::jsonb)`,
    [FIG_ID, seed.projectId, JSON.stringify(provenance)],
  );
}

const DRAFT_MD = [
  "Intro.",
  "",
  figureBlockMarkdown({
    figureId: FIG_ID,
    version: 1,
    alt: "Alt.",
    caption: "Scores by group.",
    figureNumber: 1,
    footnoteId: "fig1",
    sourceLine: "The ledger.",
  }),
  "",
  "Outro.",
].join("\n");

describe("figureClaimsForDraft — the deterministic claim inventory", () => {
  it("inventories a supported figure: value claims carry the provenance refs, grouped under Figure 1", async () => {
    await seedMirrorFile("drafts/v3.md", DRAFT_MD, "draft3");
    await seedFigure({ kind: "claim_ledger", refs: [{ claimId: CLAIM_REF }], computedBy: "drafter", verification: "unverified" });
    const out = await figureClaimsForDraft(db.client, { store }, { projectId: seed.projectId, draftN: 3 });
    expect(out).not.toBeNull();
    expect(out!.file).toBe("figure-claims");
    expect(out!.figures).toHaveLength(1);
    const f = out!.figures[0]!;
    expect(f.figureId).toBe(FIG_ID);
    expect(f.figureNumber).toBe(1);
    expect(f.supported).toBe(true);
    expect(f.evidence.provenance).toBe(`assets/figures/${FIG_ID}/provenance.json`);
    const values = f.claims.filter((c) => c.kind === "value");
    expect(values.map((c) => c.text)).toContain("score: 0.71");
    expect(values.map((c) => c.text)).toContain("score: 0.44");
    expect(values[0]!.refs).toEqual([{ claimId: CLAIM_REF }]);
    // the spec's asserted labels ride the same stream (axis titles the reviewer re-checks)
    expect(f.claims.some((c) => c.kind === "label" && c.text === "Score")).toBe(true);
  });

  it("a kind:\"none\" figure inventories UNSUPPORTED — claims exist but carry no refs (§7.5)", async () => {
    await seedMirrorFile("drafts/v3.md", DRAFT_MD, "draft3");
    await seedFigure({ kind: "none", refs: [], computedBy: "drafter", verification: "unverified" });
    const out = await figureClaimsForDraft(db.client, { store }, { projectId: seed.projectId, draftN: 3 });
    const f = out!.figures[0]!;
    expect(f.supported).toBe(false);
    expect(f.provenanceKind).toBe("none");
    expect(f.claims.length).toBeGreaterThan(0);
    expect(f.claims.every((c) => c.refs.length === 0)).toBe(true);
  });

  it("a draft with no figure markers yields no file", async () => {
    await seedMirrorFile("drafts/v3.md", "No figures here.\n", "draft3");
    const out = await figureClaimsForDraft(db.client, { store }, { projectId: seed.projectId, draftN: 3 });
    expect(out).toBeNull();
  });

  it("markers number by DOCUMENT order (the figure number is never the model's)", async () => {
    const OTHER = "01ARZ3NDEKTSV4RRFFQ69G5FC9";
    await seedMirrorFile(`assets/figures/${OTHER}/spec.vl.json`, VEGA_SPEC, "ospec");
    await seedMirrorFile(`assets/figures/${OTHER}/data.csv`, "k,v\nx,1\n", "odata");
    await db.pg.query(
      `insert into figures(id, project_id, spec_kind, provenance) values ($1,$2,'vega_lite','{}'::jsonb)`,
      [OTHER, seed.projectId],
    );
    const md = [
      figureBlockMarkdown({ figureId: OTHER, version: 1, alt: "a", caption: "c", footnoteId: "f1", sourceLine: "s" }),
      "",
      figureBlockMarkdown({ figureId: FIG_ID, version: 2, alt: "b", caption: "d", footnoteId: "f2", sourceLine: "t" }),
    ].join("\n");
    await seedMirrorFile("drafts/v3.md", md, "draft3");
    await seedFigure({ kind: "claim_ledger", refs: [{ claimId: CLAIM_REF }], computedBy: "drafter", verification: "unverified" });
    const out = await figureClaimsForDraft(db.client, { store }, { projectId: seed.projectId, draftN: 3 });
    expect(out!.figures.map((f) => [f.figureId, f.figureNumber])).toEqual([
      [OTHER, 1],
      [FIG_ID, 2],
    ]);
  });
});

describe("the mount provider — the review run's hydration seam", () => {
  it("lands .rhema/figure-claims.json for a draft with markers; none without", async () => {
    await seedMirrorFile("drafts/v3.md", DRAFT_MD, "draft3");
    await seedFigure({ kind: "claim_ledger", refs: [{ claimId: CLAIM_REF }], computedBy: "drafter", verification: "unverified" });
    const provider = figureClaimsMountProvider(async () => store, seed.workspaceId);
    const file = await provider.forHydration(db.client, {
      runId: "run_1",
      projectId: seed.projectId,
      draftN: 3,
      workflow: "review",
    });
    expect(file).not.toBeNull();
    expect(file!.path).toBe(FIGURE_CLAIMS_PATH);
    const parsed = JSON.parse(Buffer.from(file!.bytes).toString("utf8")) as { figures: unknown[] };
    expect(parsed.figures).toHaveLength(1);
  });
});

describe("verificationFromVerdicts — the Review write-back fold", () => {
  it("all verified ⇒ verified; any contradicted ⇒ contradicted; else unverifiable; empty ⇒ null", () => {
    expect(verificationFromVerdicts(["verified", "verified"])).toBe("verified");
    expect(verificationFromVerdicts(["verified", "contradicted"])).toBe("contradicted");
    expect(verificationFromVerdicts(["verified", "unverifiable"])).toBe("unverifiable");
    expect(verificationFromVerdicts([])).toBeNull();
  });
});
