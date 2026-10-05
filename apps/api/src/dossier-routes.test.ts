import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import { createApp, parseLetterSections, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

// PRB.16 — the delivered-review dossier read (PRB.04's deferred live binding, §5.5/§5.7/§6.6): the route
// assembles the whole reading surface from delivered rows — the correspondence review row + rubric sidecar,
// findings+dispositions → FindingView, claims+claim_sources + the proxy fetch_log (cited⇒fetched), the letter
// markdown → sections with finding refs joined via the canonical letter_section slots (never parsed out of
// agent prose), the access_report re-derived from server-side facts (REQ-PROD-2), the run card from the
// whitelisted event stream only (REQ-IDE-11), and the obligation summary + per-finding chips (REQ-OBJ-6).

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

const RUN = "run_dossier";
const CORR = "corr_dossier";

const LETTER_MD = [
  "# The Quiet Cost of Convenience",
  "",
  "## Verdict",
  "",
  "A precise, persuasive draft with one structural soft spot.",
  "",
  "## Major findings",
  "",
  "The middle third leans on an unsupported stat.",
  "",
  "## Revision roadmap",
  "",
  "Restate the pillar; re-source the stat.",
].join("\n");

async function seedDeliveredReview() {
  const letter = await store.putText(seed.workspaceId, LETTER_MD);
  await seedRun(db, {
    runId: RUN,
    workspaceId: seed.workspaceId,
    projectId: seed.projectId,
    workflow: "review",
    state: "completed",
    capCredits: 840,
  });
  await db.txRunner.run(seed.workspaceId, async (tx) => {
    // the committed phases (second_read stayed off — no step row, like prod run 01M2RGNK…)
    for (const [i, phase] of [
      "intake",
      "craft",
      "verification",
      "discourse",
      "argument",
      "letter",
    ].entries()) {
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits) values ($1,$2,$3,$4,'done',50)`,
        [`st_${phase}`, RUN, phase, i + 1],
      );
    }
    // only whitelisted card events + one agent-prose event that must be ignored (REQ-IDE-11)
    await tx.query(
      `insert into run_events(run_id, seq, workspace_id, day, type, payload, density, at)
       values
         ($1,1,$2,current_date,'run.state_changed','{"to":"completed"}'::jsonb,'summary',now()),
         ($1,2,$2,current_date,'usage.tick','{"credits":520}'::jsonb,'summary',now()),
         ($1,3,$2,current_date,'agent.note','{"text":"fabricated progress"}'::jsonb,'normal',now())`,
      [RUN, seed.workspaceId],
    );
    // the letter artifact + version the correspondence points at
    await tx.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
       values ('art_letter',$1,$2,'editors_letter','run','correspondence/letter.md')`,
      [seed.workspaceId, seed.projectId],
    );
    await tx.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_letter','art_letter',1,$1,'k',700,'text/markdown','{"kind":"system"}'::jsonb)`,
      [letter.sha256],
    );
    // the review correspondence row carrying the rubric sidecar (ordinal is the delivery round, 1-based)
    await tx.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids, rubric)
       values ($1,$2,'review',$3,$4,1, now(), '{av_letter}', $5::jsonb)`,
      [
        CORR,
        seed.projectId,
        seed.draftId,
        RUN,
        JSON.stringify({ dimensions: [{ dimension: "structure", score: 3 }] }),
      ],
    );
    // two findings (0-based ordinals, like the delivered sidecar): one slotted into the letter's major
    // section, one unanchored
    await tx.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body, letter_section)
       values
         ('fnd_1',$1,$2,0,'argument','major','editor','weak pillar','the middle third leans on a stat','major'),
         ('fnd_2',$1,$2,1,'claim','minor','editor','unsupported stat','no source backs the figure',NULL)`,
      [CORR, seed.draftId],
    );
    // the user's disposition on fnd_1
    await tx.query(
      `insert into dispositions(id, finding_id, kind, status, rationale, by_actor)
       values ('disp_1','fnd_1','accept','proposed','will restate','{"kind":"user","userId":"usr_seed"}'::jsonb)`,
    );
    // a claim with a source that the proxy fetch log corroborates (cited⇒fetched)
    await tx.query(
      `insert into claims(id, correspondence_id, draft_id, ordinal, text, tier, verdict)
       values ('clm_1',$1,$2,0,'the stat in §2',2,'unsupported')`,
      [CORR, seed.draftId],
    );
    await tx.query(
      `insert into claim_sources(claim_id, ordinal, url, normalized_url, accessed_at, stance)
       values ('clm_1',1,'https://example.com/stat','https://example.com/stat',now(),'supports')`,
    );
    await tx.query(
      `insert into fetch_log(run_id, ts, agent_label, kind, url, normalized_url, status, decision)
       values
         ($1,now(),'w1','fetch','https://example.com/stat','https://example.com/stat',200,'allow'),
         ($1,now(),'w1','fetch','https://api.anthropic.com/v1/messages',NULL,403,'deny')`,
      [RUN],
    );
    // the mount row the access report re-derives from (REQ-PROD-2)
    await tx.query(
      `insert into run_mounts(run_id, attempt, seat, manifest)
       values ($1,1,'reviewer','[{"path":"drafts/v1.md","sha256":"x","bytes":10}]'::jsonb)`,
      [RUN],
    );
    // obligations: one open on fnd_1, one discharged → the summary counts + the per-finding chip
    await tx.query(
      `insert into revision_obligations(id, project_id, source, finding_id, severity, title, state, created_by)
       values
         ('obl_1',$1,'finding','fnd_1','major','restate the pillar','open','{"kind":"system"}'::jsonb),
         ('obl_2',$1,'finding','fnd_2','minor','re-source the stat','discharged','{"kind":"system"}'::jsonb)`,
      [seed.projectId],
    );
  });
}

const getDossier = (projectId: string, runId: string) =>
  app.request(`/projects/${projectId}/review/${runId}/dossier`);

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  seed = await seedProject(db, { draftN: 1 });
  app = createApp({ ...deps, principal: () => principal(), db: sql, store });
});
afterEach(() => db.close());

describe("parseLetterSections", () => {
  it("splits the letter on ## headings, skips the H1 title, and keeps paragraph bodies", () => {
    const sections = parseLetterSections(LETTER_MD);
    expect(sections.map((s) => s.title)).toEqual(["Verdict", "Major findings", "Revision roadmap"]);
    expect(sections[0]!.paragraphs).toEqual([
      "A precise, persuasive draft with one structural soft spot.",
    ]);
    expect(sections[0]!.id).toBe("verdict");
  });
});

describe("GET /projects/:id/review/:runId/dossier — the delivered-review read (§5.5/§5.7)", () => {
  it("404s when no review correspondence row exists for the run", async () => {
    await seedRun(db, {
      runId: "run_none",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
    });
    const res = await getDossier(seed.projectId, "run_none");
    expect(res.status).toBe(404);
  });

  it("assembles the whole dossier from delivered rows — letter, findings, claims, rubric, trust chip, obligations", async () => {
    await seedDeliveredReview();
    const res = await getDossier(seed.projectId, RUN);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as Record<string, unknown> & {
      letterSections: { title: string; findingRefs?: { findingId: string; label: string }[] }[];
      findings: { id: string; disposition?: { kind: string } }[];
      claims: { id: string; sources?: { normalizedUrl: string }[] }[];
      rubric: { dimension: string; score: number }[];
      accessReport: { seat: string; fetches: number; deniedAttempts: number };
      runCard: { state: string };
      findingObligations: Record<string, string>;
    };

    expect(dto.slug).toBe(`slug-${seed.projectId}`);
    expect(dto.runId).toBe(RUN);
    expect(dto.versionLabel).toBe("Review of v1");
    expect(dto.openObligations).toBe(1);
    expect(dto.addressedObligations).toBe(1);

    // letter: markdown → sections; the finding ref joins via the letter_section slot → heading pattern,
    // never by parsing agent prose for links.
    expect(dto.letterSections.map((s) => s.title)).toEqual([
      "Verdict",
      "Major findings",
      "Revision roadmap",
    ]);
    const major = dto.letterSections.find((s) => s.title === "Major findings");
    expect(major?.findingRefs).toEqual([{ findingId: "fnd_1", label: "See finding 1" }]);

    // findings → FindingView with the user's disposition attached.
    expect(dto.findings.map((f) => f.id)).toEqual(["fnd_1", "fnd_2"]);
    expect(dto.findings[0]?.disposition?.kind).toBe("accept");
    expect(dto.findings[1]?.disposition).toBeUndefined();

    // the claim ledger with its source edge; the cited⇒fetched source is the proxy fetch_log.
    expect(dto.claims[0]?.id).toBe("clm_1");
    expect(dto.claims[0]?.sources?.[0]?.normalizedUrl).toBe("https://example.com/stat");
    expect(dto.fetchLog).toEqual(["https://example.com/stat"]);

    // rubric straight from the correspondence sidecar.
    expect(dto.rubric).toEqual([{ dimension: "structure", score: 3 }]);

    // the trust chip re-derived from server-side facts (seat + mount + the denied proxy call counted).
    expect(dto.accessReport.seat).toBe("reviewer");
    expect(dto.accessReport.fetches).toBe(1);
    expect(dto.accessReport.deniedAttempts).toBe(1);

    // the run card derives only from whitelisted events — agent.note can never feed it (REQ-IDE-11).
    expect(dto.runCard.state).toBe("completed");
    expect(JSON.stringify(dto.runCard)).not.toContain("fabricated progress");

    // the per-finding obligation chips (REQ-OBJ-6).
    expect(dto.findingObligations).toEqual({ fnd_1: "open", fnd_2: "discharged" });
  });

  it("STB.2 — a dossier in ANOTHER workspace 404s even without RLS (the SQL workspace predicate)", async () => {
    // The live finding: the deployed api connects as a BYPASSRLS role, so withTenant's GUC never
    // filtered — this run's correspondence row in ws_other must be invisible to ws_seed's principal.
    const foreign = await seedProject(db, {
      userId: "usr_other",
      billingAccountId: "ba_other",
      workspaceId: "ws_other",
      projectId: "prj_other",
      draftN: 1,
    });
    await seedRun(db, {
      runId: "run_foreign",
      workspaceId: foreign.workspaceId,
      projectId: foreign.projectId,
      workflow: "review",
      state: "completed",
    });
    await db.pg.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids)
       values ('corr_foreign',$1,'review',$2,'run_foreign',1,now(),'{}')`,
      [foreign.projectId, foreign.draftId],
    );
    const res = await getDossier(foreign.projectId, "run_foreign");
    expect(res.status).toBe(404);
  });
});
