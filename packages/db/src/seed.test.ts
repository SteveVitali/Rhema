import { describe, expect, it } from "vitest";
import { createTestDb } from "./testing/pglite.js";
import { seedRealProjects } from "./seed/real-projects.js";
import { agentTypesSeed, protocolsSeed } from "./seed/code-seed.js";

// The three-real-project seed applies against migrated schema (part of AC2) and exercises obligation spawn,
// address, rebut, defer and carry (REQ-DATA-3; §11.7).

describe("real-project seed (REQ-DATA-3)", () => {
  it("applies cleanly and seeds the five seats + essay protocol + three projects", async () => {
    const db = await createTestDb();
    await seedRealProjects(db);

    const seats = (await db.query("select key from agent_types order by key")).rows.map(
      (r) => (r as { key: string }).key,
    );
    expect(seats).toEqual(["assistant", "author", "editor", "persona_builder", "system"]);

    // P1.21 (REQ-GENRE-1) — all four §6.7 protocol rows seed: essay, academic, op-ed, memo.
    const protoIds = (
      await db.query("select id from protocols order by id")
    ).rows.map((r) => (r as { id: string }).id);
    expect(protoIds).toEqual(["academic", "essay", "memo", "op-ed"]);

    const projects = (await db.query("select slug from projects order by slug")).rows.map(
      (r) => (r as { slug: string }).slug,
    );
    expect(projects).toEqual([
      "constitution-of-reason",
      "structure-of-political-difference",
      "the-politics-of-visibility",
    ]);
    await db.close();
  });

  it("exercises spawn/address, defer+carry, and rebut across the three projects", async () => {
    const db = await createTestDb();
    await seedRealProjects(db);

    const states = new Map(
      (
        await db.query("select id, state, rationale from revision_obligations order by id")
      ).rows.map((r) => {
        const o = r as { id: string; state: string; rationale: string | null };
        return [o.id, o] as const;
      }),
    );
    // spawn → address
    expect(states.get("obl_pv1")?.state).toBe("addressed");
    // defer (rationale required + horizon) — the cache reflects the last transition
    expect(states.get("obl_sd1")?.state).toBe("deferred");
    expect(states.get("obl_sd1")?.rationale).toBeTruthy();
    // rebut (argument on file)
    expect(states.get("obl_cr1")?.state).toBe("rebutted");
    expect(states.get("obl_cr1")?.rationale).toBeTruthy();

    // carry: the structure obligation has a carried lineage edge onto round two's finding
    const carried = (
      await db.query(
        "select relation from obligation_findings where obligation_id='obl_sd1' order by relation",
      )
    ).rows.map((r) => (r as { relation: string }).relation);
    expect(carried).toEqual(["carried", "root"]);
    await db.close();
  });

  // D-P0.15k-1: the revise + profile_voice instrumented fixtures. A revise run needs a delivered review's
  // obligations on a revise-target draft (the seed's corr_* + obl_* + working v2 drafts); a profile_voice run
  // needs an author body-of-work — the seeded persona's included corpus the §9.3 snapshot reads.
  it("seeds the revise targets and the author corpus the instrumented folds need (D-P0.15k-1)", async () => {
    const db = await createTestDb();
    await seedRealProjects(db);

    // revise target: every project has a delivered 'review' correspondence (the run's server-resolved
    // priorReviewId; proj_sd has two rounds) AND a working draft to revise.
    const corr = (
      await db.query("select count(*)::int n from correspondence_items where kind='review' and delivered_at is not null")
    ).rows[0] as { n: number };
    expect(Number(corr.n)).toBe(4);
    const working = (
      await db.query("select count(*)::int n from drafts where state='working'")
    ).rows[0] as { n: number };
    expect(Number(working.n)).toBe(3);
    // … and each working draft carries a head artifact_version (materializable bytes — the revise target).
    const workingHeads = (
      await db.query(
        `select count(*)::int n from artifacts a join artifact_versions av on av.artifact_id = a.id
          where a.mirror_path = 'drafts/v2.md'`,
      )
    ).rows[0] as { n: number };
    expect(Number(workingHeads.n)).toBe(3);
    const openObl = (
      await db.query("select count(*)::int n from revision_obligations")
    ).rows[0] as { n: number };
    expect(Number(openObl.n)).toBe(3);

    // author corpus: per_seed with a connection + three INCLUDED samples carrying a current sample_version
    // (what the build's §9.3 sample_set/corpus_size snapshot reads).
    const persona = (await db.query("select mode, kind from personas where id='per_seed'")).rows[0] as
      | { mode: string; kind: string }
      | undefined;
    expect(persona).toEqual({ mode: "self", kind: "leaf" });
    const corpus = (
      await db.query(
        `select di.id, sv.content_sha256, sv.word_count
           from discovered_items di
           join connections cn on cn.id = di.connection_id
           join sample_versions sv on sv.id = di.current_sample_id
          where cn.persona_id = 'per_seed' and di.state = 'included'`,
      )
    ).rows as { id: string; content_sha256: string; word_count: number }[];
    expect(corpus.map((r) => r.id).sort()).toEqual(["di_seed1", "di_seed2", "di_seed3"]);
    expect(corpus.every((r) => r.content_sha256.length === 64 && r.word_count > 0)).toBe(true);
    await db.close();
  });

  it("code seeds are idempotent", async () => {
    const db = await createTestDb();
    await agentTypesSeed(db);
    await agentTypesSeed(db);
    await protocolsSeed(db);
    await protocolsSeed(db);
    const { n } = (await db.query("select count(*)::int n from agent_types")).rows[0] as {
      n: number;
    };
    expect(Number(n)).toBe(5);
    const { n: protoN } = (await db.query("select count(*)::int n from protocols")).rows[0] as {
      n: number;
    };
    expect(Number(protoN)).toBe(4); // the four §6.7 rows; re-seeding is idempotent on (id, version)
    await db.close();
  });
});
