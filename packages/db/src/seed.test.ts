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

    const { n: protos } = (await db.query("select count(*)::int n from protocols where id='essay'"))
      .rows[0] as {
      n: number;
    };
    expect(Number(protos)).toBe(1);

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
    await db.close();
  });
});
