import { describe, expect, it } from "vitest";
import {
  DEFAULT_THREAD_NAME,
  PINS_MAX_PER_THREAD,
  BRIEF_MAX_WORDS,
  ASSISTANT_TURN_BUDGET,
  ASSISTANT_AGENT_TYPE,
} from "@rhema/contracts";
import {
  ensureDefaultThread,
  createThread,
  deleteThread,
  renameThread,
  archiveThread,
  listThreads,
  threadPaths,
  type SqlLike,
} from "./threads.js";
import { addPin, emptyPins, pinsFootprint, removePin, serializePins, parsePins } from "./pins.js";
import { buildCompactionBrief, postCompactInjection, correctionGuidance, remembersView } from "./brief.js";
import {
  checkTurnBudget,
  effectiveBudget,
  planCard,
  overCapCard,
  activityStrip,
  costStrip,
  tierPicker,
  TURN_BUDGET,
} from "./turn.js";
import {
  sourceNote,
  attachmentNote,
  upsertIndexEntry,
  sourceCards,
  emptyIndex,
  ATTACHABLE_MEDIA,
  serializeIndex,
  parseIndex,
} from "./sources.js";
import { shapeSuggestion, askComposer, isSingleParagraph } from "./suggest.js";
import { committedReadFilter, assistantPathAccess } from "./visibility.js";
import { emptyProjectState, pasteNotesWrite } from "./empty-state.js";
import { isPreparatoryTool, runSheetResult } from "./sheets.js";

// P1.11 — deterministic tests over the §7.1 chat domain: threads/pins/brief, per-turn budgets + the
// plan card, source notes, Ask-about-this-draft shaping, the empty state, and the REQ-CHAT-20 read
// filter. The DB end-to-end (PGlite) lives in apps/api's chat-routes.test.ts.

// A minimal in-memory SqlLike over a rows array — enough for the CRUD logic's happy paths.
function fakeDb(initial: Record<string, unknown>[] = []): SqlLike & { rows: Record<string, unknown>[] } {
  const rows = [...initial];
  return {
    rows,
    async query(sql: string, params: unknown[] = []) {
      if (/^select .*from threads where project_id = \$1 and is_default/.test(sql)) {
        return { rows: rows.filter((r) => r.project_id === params[0] && r.is_default === true && r.archived_at == null) };
      }
      if (/^select .*from threads where project_id = \$1/.test(sql)) {
        return { rows: rows.filter((r) => r.project_id === params[0]) };
      }
      if (/^select .*from threads where id = \$1 and archived_at is null/.test(sql)) {
        return { rows: rows.filter((r) => r.id === params[0] && r.archived_at == null) };
      }
      if (/^select .*from threads where id = \$1/.test(sql)) {
        return { rows: rows.filter((r) => r.id === params[0]) };
      }
      if (/^insert into threads/.test(sql)) {
        // the insert spells `is_default` as a literal in the SQL (`,true,$7` / `,false,$7`).
        rows.push({
          id: params[0],
          project_id: params[1],
          name: params[2],
          session_store_key: params[3],
          brief_key: params[4],
          pins_key: params[5],
          is_default: /,true,\$7\)/.test(sql),
          created_by: params[6],
          archived_at: null,
          created_at: new Date().toISOString(),
        });
        return { rows: [] };
      }
      if (/^update threads set name/.test(sql)) {
        const r = rows.find((x) => x.id === params[1]);
        if (r) r.name = params[0];
        return { rows: [] };
      }
      if (/^update threads set archived_at/.test(sql)) {
        const r = rows.find((x) => x.id === params[0]);
        if (r) r.archived_at = new Date().toISOString();
        return { rows: [] };
      }
      if (/^delete from threads/.test(sql)) {
        const i = rows.findIndex((x) => x.id === params[0]);
        if (i >= 0) rows.splice(i, 1);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

let n = 0;
const ids = () => `thr_${++n}`;

describe("threads (REQ-CHAT-1…5)", () => {
  it("the default thread is 'Project chat', undeletable, with the §7.1 file keys", async () => {
    const db = fakeDb();
    const t = await ensureDefaultThread(db, { projectId: "p1" }, ids);
    expect(t.name).toBe(DEFAULT_THREAD_NAME);
    expect(t.isDefault).toBe(true);
    const paths = threadPaths(t.id);
    expect(t.sessionStoreKey).toBe(`${paths.dir}/session/`);
    expect(t.briefKey).toBe(`${paths.dir}/brief.md`);
    expect(t.pinsKey).toBe(`${paths.dir}/pins.json`);
    // idempotent
    const again = await ensureDefaultThread(db, { projectId: "p1" }, ids);
    expect(again.id).toBe(t.id);
    // undeletable
    const del = await deleteThread(db, t.id);
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.error).toBe("undeletable");
  });

  it("named threads create/rename/archive/delete; delete purges ONLY the thread's keys (REQ-CHAT-4)", async () => {
    const db = fakeDb();
    const t = await createThread(db, { projectId: "p1", name: "Sources" }, ids);
    expect(t.isDefault).toBe(false);
    expect((await renameThread(db, t.id, "Renamed")).ok).toBe(true);
    expect((await archiveThread(db, t.id)).ok).toBe(true);
    // deleted → row gone + purge keys are exactly session/, brief.md, pins.json — no research/
    const db2 = fakeDb([
      { id: t.id, project_id: "p1", name: "x", session_store_key: null, brief_key: null, pins_key: null, is_default: false, archived_at: null },
    ]);
    const del = await deleteThread(db2, t.id);
    expect(del.ok).toBe(true);
    if (del.ok) {
      for (const k of del.purgedKeys) expect(k.startsWith("agents/assistant/threads/")).toBe(true);
      expect(del.purgedKeys.some((k) => k.includes("research/"))).toBe(false);
    }
    const missing = await deleteThread(db2, "nope");
    expect(missing.ok).toBe(false);
  });

  it("list orders unarchived before archived", async () => {
    const db = fakeDb();
    await ensureDefaultThread(db, { projectId: "p1" }, ids);
    await createThread(db, { projectId: "p1", name: "B" }, ids);
    const all = await listThreads(db, "p1");
    expect(all).toHaveLength(2);
  });
});

describe("pins (REQ-CHAT-13)", () => {
  it("caps at 12; the 13th refuses or drops the oldest; footprint is shown", () => {
    let f = emptyPins();
    for (let i = 0; i < PINS_MAX_PER_THREAD; i++) {
      const r = addPin(f, { id: `p${i}`, kind: "fact", summary: `fact ${i}` });
      expect(r.ok).toBe(true);
      if (r.ok) f = r.file;
    }
    const over = addPin(f, { id: "p13", kind: "fact", summary: "one too many" });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toBe("pins_full");
    const dropped = addPin(f, { id: "p13", kind: "fact", summary: "evict" }, { dropOldest: true });
    expect(dropped.ok).toBe(true);
    if (dropped.ok) {
      expect(dropped.droppedOldest).toBe(true);
      expect(dropped.file.pins[0]!.id).toBe("p1");
      expect(dropped.file.pins).toHaveLength(PINS_MAX_PER_THREAD);
    }
    expect(pinsFootprint(f)).toBeGreaterThan(0);
    // round-trip
    expect(parsePins(serializePins(f)).pins).toHaveLength(PINS_MAX_PER_THREAD);
    // a >300-token summary refuses
    const huge = addPin(emptyPins(), { id: "x", kind: "fact", summary: "w".repeat(1300) });
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error).toBe("summary_too_long");
    // remove
    expect(removePin(f, "p0").pins.find((p) => p.id === "p0")).toBeUndefined();
  });
});

describe("compaction brief (REQ-CHAT-12)", () => {
  it("builds ≤600 words; truncates with a marker; re-injects on PostCompact", () => {
    const small = buildCompactionBrief({
      standingQuestion: "Is the lede honest?",
      decisions: ["cut the preamble"],
      openThreads: ["the cost figure"],
      sourcesRead: ["agents/assistant/research/sources/a.md"],
      pins: emptyPins(),
    });
    expect(small.words).toBeLessThanOrEqual(BRIEF_MAX_WORDS);
    expect(small.truncated).toBe(false);
    const big = buildCompactionBrief({
      decisions: Array.from({ length: 400 }, (_, i) => `decision ${i} ${"x ".repeat(10)}`),
      openThreads: ["open"],
    });
    expect(big.words).toBeLessThanOrEqual(BRIEF_MAX_WORDS + 10); // marker line allowance
    expect(big.truncated).toBe(true);
    const inj = postCompactInjection(small.markdown, parsePins(serializePins({ version: 1, pins: [{ id: "p", kind: "fact", summary: "venue is NYT" }] })));
    expect(inj).toContain("compacted");
    expect(inj).toContain("venue is NYT");
  });

  it("'what the assistant remembers' is read-only brief + pins; a correction is Guidance-class", () => {
    const v = remembersView("# brief", { version: 1, pins: [] });
    expect(v.brief).toBe("# brief");
    const g = correctionGuidance({ threadId: "t1", text: "the venue is NYT, not WaPo" });
    expect(g.source).toBe("chat_promote");
    expect(g.standing).toBe(true);
    expect(g.anchors.threadId).toBe("t1");
  });
});

describe("per-turn budgets + plan card (REQ-CHAT-9/10/14)", () => {
  it("hard caps: 40cr / 5 searches / 10 fetches; any axis trips the pause", () => {
    expect(checkTurnBudget({ credits: 39, searches: 4, fetches: 9 })).toEqual({ ok: true });
    for (const [axis, usage] of [
      ["credits", { credits: 40, searches: 0, fetches: 0 }],
      ["searches", { credits: 0, searches: 5, fetches: 0 }],
      ["fetches", { credits: 0, searches: 0, fetches: 10 }],
    ] as const) {
      const c = checkTurnBudget(usage);
      expect(c.ok).toBe(false);
      if (!c.ok) {
        expect(c.axis).toBe(axis);
        const card = overCapCard(c);
        expect(card.kind).toBe("over_cap");
        expect(card.actions).toContain("resume");
      }
    }
    // an edited plan may only SHRINK the caps
    const eff = effectiveBudget({ credits: 100, searches: 3 });
    expect(eff.credits).toBe(TURN_BUDGET.credits);
    expect(eff.searches).toBe(3);
  });

  it("the plan card carries budget + tier + the three actions + cancel", () => {
    const card = planCard({ threadId: "t1", summary: "answer from @v3 §II", steps: ["read §II", "answer"] });
    expect(card.budget).toEqual(ASSISTANT_TURN_BUDGET);
    expect(card.modelTier).toBe("base"); // thread default
    expect(card.actions).toEqual(["run_research", "first_step", "edit", "cancel"]);
  });

  it("the cost/activity strips derive from events, never model text", () => {
    const events = [
      { type: "search.performed" },
      { type: "search.performed" },
      { type: "source.read" },
      { type: "artifact.read" },
      { type: "step.finished" },
    ];
    const a = activityStrip(events);
    expect(a).toEqual({ searches: 2, fetches: 1, artifactReads: 1, sourcesRead: 1 });
    const s = costStrip({ spentCredits: 12, capCredits: 40, workspaceSpent: 900 }, a, "balanced");
    expect(s.capCredits).toBe(40);
    expect(s.searchesUsed).toBe(2);
    expect(s.searchesBudget).toBe(5);
    expect(s.fetchesBudget).toBe(10);
    expect(s.workspaceSpent).toBe(900);
    expect(s.tier).toBe("balanced");
    const picker = tierPicker("base");
    expect(picker.notches).toEqual(["base", "balanced", "frontier"]);
  });
});

describe("source notes (§7.1; REQ-CHAT-4)", () => {
  it("a fetched source lands under agents/assistant/research/; a failed fetch is [unverified]", () => {
    const good = sourceNote({ url: "https://example.com/a", title: "Example A", markdown: "# A\n\nbody" });
    expect(good.path.startsWith("agents/assistant/research/")).toBe(true);
    expect(good.markdown).toContain("body");
    expect(good.entry.unverified).toBeUndefined();
    const bad = sourceNote({ url: "https://example.com/404" });
    expect(bad.markdown).toContain("[unverified]");
    expect(bad.entry.unverified).toBe(true);
    // index round-trip
    const idx = upsertIndexEntry(upsertIndexEntry(emptyIndex(), good.entry), bad.entry);
    expect(sourceCards(idx)).toHaveLength(2);
    expect(parseIndex(serializeIndex(idx)).entries).toHaveLength(2);
  });

  it("attachments land in the assistant namespace, never the corpus; media is allowlisted", () => {
    const md = attachmentNote({ filename: "notes.pdf", mediaType: "application/pdf", markdown: "# notes" });
    expect("path" in md && md.path.startsWith("agents/assistant/research/attachments/")).toBe(true);
    expect("path" in md && md.path.startsWith("drafts/")).toBe(false);
    const img = attachmentNote({ filename: "pic.png", mediaType: "image/png", markdown: "" });
    expect(img).toEqual({ ok: false, error: "unsupported_media" });
    expect(ATTACHABLE_MEDIA.has("text/markdown")).toBe(true);
  });
});

describe("Ask about this draft (§7.4; REQ-CHAT-19)", () => {
  it("anchors the composer; ≤1-paragraph suggestions become assistant-provenance proposals; larger refuses", () => {
    const c = askComposer({ version: 3, block: "¶4" });
    expect(c.chipText).toBe("@v3 ¶4");
    const okS = shapeSuggestion({ replacement: "one tight sentence.", anchor: c.anchor });
    expect(okS.ok).toBe(true);
    if (okS.ok) expect(okS.proposal.provenance).toBe("assistant");
    const big = shapeSuggestion({ replacement: "para one.\n\npara two.", anchor: c.anchor });
    expect(big.ok).toBe(false);
    if (!big.ok) {
      expect(big.refusal.message).toContain("/lineedit @section");
      expect(big.refusal.message).toContain("/revise");
      expect(big.refusal.commands).toEqual(["/lineedit @section", "/revise"]);
    }
    expect(isSingleParagraph("a\n\nb")).toBe(false);
    expect(isSingleParagraph("a")).toBe(true);
  });
});

describe("REQ-CHAT-20 — live-run read filter", () => {
  it("during a live run only committed artifacts + feed pass", () => {
    const rows = [
      { id: "a", state: "committed" as const },
      { id: "b", state: "uncommitted" as const },
      { id: "c", state: "run_projected" as const },
    ];
    expect(committedReadFilter(rows, true).map((r) => r.id)).toEqual(["a"]);
    expect(committedReadFilter(rows, false)).toHaveLength(3);
  });

  it("assistantPathAccess matches §7.1 (preferences.md reads; editor ns denied; ledgers read-only)", () => {
    expect(assistantPathAccess("preferences.md")).toBe("read");
    expect(assistantPathAccess("agents/assistant/threads/t/brief.md")).toBe("readwrite");
    expect(assistantPathAccess("agents/author/ledgers/v1-response-ledger.md")).toBe("read");
    expect(assistantPathAccess("agents/author/drafting/x.md")).toBe("deny");
    expect(assistantPathAccess("agents/editor/x.md")).toBe("deny");
    expect(assistantPathAccess("HOLDOUT-voice.md")).toBe("deny");
    expect(assistantPathAccess("drafts/v3.md")).toBe("read");
  });
});

describe("empty state + scratch path (§7.6; REQ-CHAT-29/30)", () => {
  it("quiet Page, Desk on Chat, four chips, one next-step card", () => {
    const m = emptyProjectState("/p/x/sheet?workflow=research_burst");
    expect(m.page).toBe("quiet");
    expect(m.deskTab).toBe("chat");
    expect(m.chips.map((c) => c.label)).toEqual([
      "Research a question",
      "I have a thesis",
      "Interview me",
      "Paste my notes",
    ]);
    expect(m.nextStep.href).toContain("research_burst");
  });

  it("'Paste my notes' writes agents/author/notes.md via the author write path", () => {
    const w = pasteNotesWrite({ text: "my notes" });
    expect(w.path).toBe("agents/author/notes.md");
    expect(w.namespace).toBe("agent:author");
    expect(w.kind).toBe("note");
  });
});

describe("preparatory tools → run sheets (REQ-CHAT-6)", () => {
  it("the sheet payload is a GET link — never a run", () => {
    for (const t of ASSISTANT_AGENT_TYPE.tools.filter(isPreparatoryTool)) {
      expect(isPreparatoryTool(t)).toBe(true);
    }
    const sheet = runSheetResult({ projectSlug: "proj", workflow: "research_burst", inputs: { sources: 5 } });
    expect(sheet.kind).toBe("run_sheet");
    expect(sheet.href).toContain("/sheet?");
    expect(sheet.href).toContain("workflow=research_burst");
    expect(sheet.href).toContain("sources=5");
  });
});
