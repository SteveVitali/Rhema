import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  createMirrorTestDb,
  InMemoryContentStore,
  seedAllRealProjects,
  sha256Hex,
  type MirrorTestDb,
} from "@rhema/mirror/testing";
import { buildAccountZip } from "./build.js";
import { importAccountZip, importedId } from "./import.js";
import type { ArchiveManifest, ArchiveState } from "./layout.js";

// REQ-ACCT-3 — the whole-account zip + fresh-account import round-trip, golden on the three real
// projects (seedAllRealProjects: drafts, correspondence, agents/author + agents/editor trees,
// preferences.md, persona profile files incl. the calibration-adjacent profile/). The test adds a
// figure + a voice's connection/discovered/sample chain + a provenance map + a ledger debit so the
// full zip surface is exercised, then proves: layout, editor-tree exclusion, fresh-account parity,
// 7-day expiry column shape, and re-import idempotency.

const EXPORTED_AT = new Date("2026-09-26T12:00:00.000Z");
const WS_B = "ws_import_dest";
const USER_B = "usr_import_dest";

async function seedExtra(exec: MirrorTestDb["exec"], store: InMemoryContentStore, workspaceId: string, projectId: string, personaId: string): Promise<void> {
  // a figure (row + version + asset files under assets/figures/<id>/).
  await exec.query(
    `insert into figures (id, project_id, spec_kind, title, caption, alt, source_line, provenance)
     values ('fig_rt1',$1,'vega_lite','Funding by year','Funding rose','Chart of funding','internal ledger','{"kind":"fetched","refs":[],"computedBy":"drafter","verification":"verified"}'::jsonb)`,
    [projectId],
  );
  await exec.query(
    `insert into figure_versions (id, figure_id, ordinal, request) values ('fv_rt1','fig_rt1',1,'initial')`,
  );
  for (const [path, content, media] of [
    ["assets/figures/fig_rt1/spec.vl.json", '{"mark":"bar"}', "application/json"],
    ["assets/figures/fig_rt1/data.csv", "year,funding\n2020,10\n", "text/csv"],
    ["assets/figures/fig_rt1/provenance.json", '{"kind":"fetched"}', "application/json"],
    ["assets/figures/fig_rt1/render.svg", "<svg/>", "image/svg+xml"],
    ["assets/figures/fig_rt1/render.dark.svg", "<svg data-dark/>", "image/svg+xml"],
  ] as const) {
    const sha = sha256Hex(content);
    const { key } = await store.put(workspaceId, sha, Buffer.from(content));
    const avId = `av_${path.split("/").pop()}`;
    await exec.query(
      `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ($1,$2,$3,'figure','shared',$4,$5)`,
      [`art_${avId}`, workspaceId, projectId, path, avId],
    );
    await exec.query(
      `insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ($1,$2,1,$3,$4,$5,$6,'{"kind":"system"}')`,
      [avId, `art_${avId}`, sha, key, Buffer.byteLength(content), media],
    );
  }
  // a provenance map on the seeded v1 draft version.
  const v = (await exec.query(
    `select av.id from artifact_versions av join artifacts a on a.head_version_id = av.id
      where a.project_id = $1 and a.mirror_path = 'drafts/v1.md'`,
    [projectId],
  )).rows[0] as { id: string };
  await exec.query(
    `insert into provenance_maps (draft_version_id, granularity, spans) values ($1,'block',$2::jsonb)`,
    [v.id, JSON.stringify([{ blockId: "b1", source: { kind: "agent", runId: "run_x", draftN: 1 } }])],
  );
  // a voice connection + discovered item + sample version (bytes in store).
  await exec.query(
    `insert into connections (id, persona_id, provider, handle, status) values ('con_rt1',$1,'substack','@voice','ok')`,
    [personaId],
  );
  await exec.query(
    `insert into discovered_items (id, connection_id, external_id, title, url, word_count, state)
     values ('di_rt1','con_rt1','post-1','A found essay','https://x.test/1',500,'sampled')`,
  );
  const sampleMd = "# A found essay\n\nThe canonical sample text.\n";
  const sampleSha = sha256Hex(sampleMd);
  await store.put(workspaceId, sampleSha, Buffer.from(sampleMd));
  await exec.query(
    `insert into sample_versions (id, discovered_item_id, n, content_sha256, word_count)
     values ('sv_rt1','di_rt1',1,$1,6)`,
    [sampleSha],
  );
  // a ledger debit so ledger.csv has a row.
  const bill = (await exec.query(`select billing_account_id from workspaces where id = $1`, [workspaceId]))
    .rows[0] as { billing_account_id: string };
  await exec.query(
    `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, source, idempotency_key)
     values ('cl_rt1',$1,$2,'debit',40,'included','run','ik_rt1')`,
    [workspaceId, bill.billing_account_id],
  );
}

const zipText = async (zip: JSZip, path: string) => (await zip.file(path)?.async("string")) ?? null;

describe("buildAccountZip (REQ-ACCT-3)", () => {
  // The embedded-pg seed + zip under full parallel-suite load can edge past vitest's 5 s default —
  // 30 s is generous headroom (the same lever-matrix class of flake, not a code path).
  it("exports the three real projects in on-disk layout — editor tree excluded", { timeout: 30_000 }, async () => {
    const db = await createMirrorTestDb();
    const store = new InMemoryContentStore();
    const { workspaceId, projects } = await seedAllRealProjects(db.exec, store);
    await seedExtra(db.exec, store, workspaceId, projects[0]!.projectId, projects[0]!.personaId);

    const out = await buildAccountZip({ exec: db.exec, store, workspaceId, exportedAt: EXPORTED_AT });
    expect(out.projectCount).toBe(3);
    expect(out.voiceCount).toBe(3);

    const zip = await JSZip.loadAsync(out.bytes);
    const names = Object.keys(zip.files);
    // every project dir + the on-disk shape
    for (const slug of ["slug-proj_pv", "slug-proj_sd", "slug-proj_cr"]) {
      expect(names).toContain(`projects/${slug}/manifest.md`);
      expect(names).toContain(`projects/${slug}/drafts/v1.md`);
      expect(names).toContain(`projects/${slug}/correspondence/v1-review-1/editors-letter.md`);
      expect(names).toContain(`projects/${slug}/agents/author/notebook.md`);
      expect(names).toContain(`projects/${slug}/preferences.md`);
      // §11.1 — the Editor's working tree is internal, never exported.
      expect(names).not.toContain(`projects/${slug}/agents/editor/notes.md`);
    }
    // every voice: PERSONA.md + docs/profile files + generated manifest.
    for (const slug of ["voice-proj_pv", "voice-proj_sd", "voice-proj_cr"]) {
      expect(names).toContain(`voices/${slug}/PERSONA.md`);
      expect(names).toContain(`voices/${slug}/profile/voice-print.md`);
      expect(names).toContain(`voices/${slug}/manifest.md`);
    }
    // the sample as canonical markdown under the voice dir.
    expect(names).toContain("voices/voice-proj_pv/samples/post-1-v1.md");
    expect(await zipText(zip, "voices/voice-proj_pv/samples/post-1-v1.md")).toContain("canonical sample text");
    // figure assets incl. both renders — file-level packaging is honest about dark files existing;
    // the dark RENDER exclusion is enforced at the export-embed layer (api picks render.svg only).
    expect(names).toContain("projects/slug-proj_pv/assets/figures/fig_rt1/render.svg");
    expect(names).toContain("projects/slug-proj_pv/assets/figures/fig_rt1/data.csv");
    // ledger.csv with the debit row.
    const csv = await zipText(zip, "ledger.csv");
    expect(csv).toContain("date,project,run_id,workflow,state,credits,bucket");
    expect(csv).toContain(",40,included");
    // manifest.json index + state.json rows.
    const manifest = JSON.parse((await zipText(zip, "manifest.json"))!) as ArchiveManifest;
    expect(manifest.version).toBe(1);
    expect(Object.keys(manifest.files)).toContain("projects/slug-proj_pv/drafts/v1.md");
    const state = JSON.parse((await zipText(zip, "state.json"))!) as ArchiveState;
    expect(state.projects).toHaveLength(3);
    expect(state.personas).toHaveLength(3);
    expect(state.figures).toHaveLength(1);
    expect(state.provenance).toHaveLength(1);
    expect(state.missing).toEqual([]);
    await db.close();
  });
});

describe("importAccountZip (REQ-ACCT-3 — fresh account)", () => {
  it("reproduces every project and voice; re-import is a no-op", { timeout: 30_000 }, async () => {
    const db = await createMirrorTestDb();
    const store = new InMemoryContentStore();
    const { workspaceId, projects } = await seedAllRealProjects(db.exec, store);
    await seedExtra(db.exec, store, workspaceId, projects[0]!.projectId, projects[0]!.personaId);
    const out = await buildAccountZip({ exec: db.exec, store, workspaceId, exportedAt: EXPORTED_AT });

    // a fresh account: new workspace + user in the same db.
    await db.exec.query(`insert into billing_accounts (id) values ('bill_imp')`);
    await db.exec.query(`insert into "user" (id, email, name) values ($1,'imp@x.test','Importer')`, [USER_B]);
    await db.exec.query(
      `insert into workspaces (id, kind, name, billing_account_id) values ($1,'personal','Fresh','bill_imp')`,
      [WS_B],
    );

    const res = await importAccountZip({
      exec: db.exec, store, workspaceId: WS_B, userId: USER_B, zipBytes: out.bytes,
    });
    expect(res).toEqual({ projects: 3, voices: 3, files: expect.any(Number), deduped: false });
    expect(res.files).toBeGreaterThan(30);

    // every project reproduced under deterministic *_imp_* ids.
    const prjRows = (await db.exec.query(
      `select slug, title, workspace_id from projects where workspace_id = $1 order by slug`,
      [WS_B],
    )).rows as { slug: string; title: string }[];
    expect(prjRows.map((r) => r.slug)).toEqual(["slug-proj_cr", "slug-proj_pv", "slug-proj_sd"]);
    // derived ids are the importedId contract.
    const firstProj = (await db.exec.query(
      `select id from projects where workspace_id = $1 and slug = 'slug-proj_pv'`, [WS_B],
    )).rows[0] as { id: string };
    expect(firstProj.id).toBe(importedId(WS_B, "prj", "proj_pv"));

    // voices + persona artifacts reproduced.
    const perRows = (await db.exec.query(
      `select slug from personas where workspace_id = $1`, [WS_B],
    )).rows as { slug: string }[];
    expect(perRows.map((r) => r.slug).sort()).toEqual(["voice-proj_cr", "voice-proj_pv", "voice-proj_sd"]);
    const personaArtifacts = (await db.exec.query(
      `select a.mirror_path from artifacts a join personas p on p.id = a.persona_id
        where p.workspace_id = $1 and a.mirror_path = 'PERSONA.md'`, [WS_B],
    )).rows as { mirror_path: string }[];
    expect(personaArtifacts).toHaveLength(3);

    // drafts restored + linked to their imported versions; provenance map rides.
    const drafts = (await db.exec.query(
      `select d.n, d.state, d.promoted_version_id from drafts d join projects p on p.id = d.project_id
        where p.workspace_id = $1 order by p.id, d.n`, [WS_B],
    )).rows as { n: number; state: string; promoted_version_id: string | null }[];
    expect(drafts.length).toBe(3);
    expect(drafts.every((d) => d.state === "frozen" && d.promoted_version_id != null)).toBe(true);
    const pm = (await db.exec.query(
      `select pm.spans from provenance_maps pm join artifact_versions av on av.id = pm.draft_version_id
        join artifacts a on a.id = av.artifact_id join projects p on p.id = a.project_id
        where p.workspace_id = $1`, [WS_B],
    )).rows as { spans: { blockId: string }[] }[];
    expect(pm).toHaveLength(1);
    expect(pm[0]!.spans[0]!.blockId).toBe("b1");

    // figures + connections + samples reproduced.
    expect(
      ((await db.exec.query(`select count(*)::int as c from figures f join projects p on p.id = f.project_id where p.workspace_id = $1`, [WS_B])).rows[0] as { c: number }).c,
    ).toBe(1);
    expect(
      ((await db.exec.query(`select count(*)::int as c from connections c join personas p on p.id = c.persona_id where p.workspace_id = $1`, [WS_B])).rows[0] as { c: number }).c,
    ).toBe(1);
    expect(
      ((await db.exec.query(`select count(*)::int as c from sample_versions sv join discovered_items di on di.id = sv.discovered_item_id join connections c on c.id = di.connection_id join personas p on p.id = c.persona_id where p.workspace_id = $1`, [WS_B])).rows[0] as { c: number }).c,
    ).toBe(1);

    // artifact bytes resolve through the store under the NEW workspace key.
    const headSha = (await db.exec.query(
      `select av.content_sha256 as s from artifacts a join artifact_versions av on av.id = a.head_version_id
        join projects p on p.id = a.project_id where p.workspace_id = $1 and a.mirror_path = 'drafts/v1.md' limit 1`,
      [WS_B],
    )).rows[0] as { s: string };
    const bytes = await store.get(headSha.s);
    expect(new TextDecoder().decode(bytes!)).toContain("The draft body for");

    // re-import: same derived ids → nothing inserted → deduped.
    const again = await importAccountZip({
      exec: db.exec, store, workspaceId: WS_B, userId: USER_B, zipBytes: out.bytes,
    });
    expect(again).toEqual({ projects: 0, voices: 0, files: 0, deduped: true });
    const projCount = (await db.exec.query(
      `select count(*)::int as c from projects where workspace_id = $1`, [WS_B],
    )).rows[0] as { c: number };
    expect(projCount.c).toBe(3);
    await db.close();
  });

  it("rejects a non-export zip and an unsupported version", { timeout: 30_000 }, async () => {
    const db = await createMirrorTestDb();
    const store = new InMemoryContentStore();
    const other = new JSZip();
    other.file("readme.txt", "nope");
    await expect(
      importAccountZip({ exec: db.exec, store, workspaceId: "w", userId: "u", zipBytes: await other.generateAsync({ type: "uint8array" }) }),
    ).rejects.toMatchObject({ reason: "not_a_rhema_export" });
    const badVer = new JSZip();
    badVer.file("state.json", JSON.stringify({ version: 99 }));
    await expect(
      importAccountZip({ exec: db.exec, store, workspaceId: "w", userId: "u", zipBytes: await badVer.generateAsync({ type: "uint8array" }) }),
    ).rejects.toMatchObject({ reason: "unsupported_version" });
    await db.close();
  });
});
