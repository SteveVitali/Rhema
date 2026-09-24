import { AGENT_TYPE_KEYS, SEAT_DISPLAY } from "@rhema/contracts";
import type { MigrationDb } from "../migrate.js";

// Code seeds applied on deploy, versioned with the schema (REQ-DATA-3): the `agent_types` rows (the five
// seats P0.02 owns) and the `protocols` scaffolding. The §8.2 artifactPolicy is enforced in CODE
// (@rhema/contracts `artifactPolicy`), not a DB table, so it needs no row seed. The precise per-seat
// readable/writable namespace sets and tool lists are refined by the boundary tickets (§12.6: P0.05/P0.06);
// P0.02 seeds correct, minimal rows so a fresh DB has the five seats and downstream tickets have something to
// extend. Protocol BODIES are P0.03 (the skill port); here we seed only the row scaffold.

/** Minimal, faithful per-seat namespace + tool defaults (§6.6, §12.6). */
const SEAT_DEFAULTS: Record<
  (typeof AGENT_TYPE_KEYS)[number],
  {
    readable: string[];
    writable: string[];
    personaView: string[];
    tools: string[];
    modelProfile: string;
  }
> = {
  author: {
    readable: ["shared", "agent:author"],
    writable: ["agent:author"],
    personaView: [
      "voice_print",
      "structure_repertoire",
      "lexicon",
      "exemplars",
      "audience_venue",
      "positions",
      "continuity",
      "register_map",
    ],
    tools: [
      "read",
      "write",
      "web_search",
      "web_fetch",
      "subagent",
      "measure",
      "visualize",
      "elicit",
    ],
    modelProfile: "balanced",
  },
  editor: {
    // the Editor never mounts the persona voice files or the Drafter's notebook (independence; REQ-OBJ-8/10).
    readable: ["shared", "agent:editor"],
    writable: ["agent:editor"],
    personaView: [],
    tools: ["read", "write", "web_search", "web_fetch", "subagent", "measure"],
    modelProfile: "frontier",
  },
  assistant: {
    readable: ["shared", "agent:assistant"],
    writable: ["agent:assistant"],
    personaView: [],
    // §7.1 (P1.11): the Assistant tool list — search/fetch (web_search/web_fetch), read_artifact,
    // start_workflow, propose_outline, visualize, elicit, measure, attach — plus read/write inside
    // the assistant namespace (threads, source notes, pins, briefs). The preparatory subset
    // (start_workflow/propose_outline/visualize/elicit/measure) returns run SHEETS, never runs.
    tools: [
      "read",
      "write",
      "web_search",
      "web_fetch",
      "read_artifact",
      "start_workflow",
      "propose_outline",
      "visualize",
      "elicit",
      "measure",
      "attach",
    ],
    modelProfile: "balanced",
  },
  persona_builder: {
    readable: ["shared", "agent:persona_builder"],
    writable: ["agent:persona_builder"],
    personaView: [],
    tools: ["read", "write", "web_search", "web_fetch", "measure"],
    modelProfile: "balanced",
  },
  system: {
    readable: ["shared"],
    writable: [],
    personaView: [],
    tools: [],
    modelProfile: "base",
  },
};

/** Seed the five `agent_types` rows (idempotent: on conflict do nothing). */
export async function agentTypesSeed(db: MigrationDb): Promise<void> {
  for (const key of AGENT_TYPE_KEYS) {
    const d = SEAT_DEFAULTS[key];
    await db.query(
      `insert into agent_types (key, display_name, readable, writable, persona_view, tools, skills, default_model_profile, subagents)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (key) do nothing`,
      [
        key,
        SEAT_DISPLAY[key],
        d.readable,
        d.writable,
        d.personaView,
        d.tools,
        [],
        d.modelProfile,
        JSON.stringify({}),
      ],
    );
  }
  // P1.11 (§7.1) — the assistant row's per-turn budgets + read-deny globs + thread default tier.
  // The 0033 migration stamps the same values on an already-seeded row; this keeps a fresh seed
  // and the migration-derived row identical.
  await db.query(
    `update agent_types set
       denies = array['agents/author/**','!agents/author/ledgers/**','agents/editor/**','agents/persona_builder/**','HOLDOUT-*'],
       default_thread_tier = 'base',
       per_turn_credits = 40,
       per_turn_searches = 5,
       per_turn_fetches = 10
     where key = 'assistant'`,
  );
}

/**
 * Seed the `protocols` scaffold. P0.02 seeds only the row placeholder for the Essay protocol (the one Phase-0
 * protocol, §17 Q-22); P0.03 fills the body. Idempotent on (id, version).
 */
export async function protocolsSeed(db: MigrationDb): Promise<void> {
  await db.query(
    `insert into protocols (id, version, body, seeded_at)
     values ($1,$2,$3, now()) on conflict (id, version) do nothing`,
    ["essay", 1, JSON.stringify({ scaffold: true, note: "body seeded by P0.03" })],
  );
}
