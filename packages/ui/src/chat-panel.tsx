// The Desk's Chat panel (P1.11; §7.1/§7.4/§7.6) — the Assistant seat's surface: the thread list, the
// transcript, the composer, the per-turn cost strip (metered numbers only — never model prose), the
// plan card, the pins rail, and the read-only "Chat sources" list. Rendered SSR-static; the island
// enhances, but every write is a real <form method="post"> so a send/pin/correction works with no
// script. Text-agnostic: every string arrives via `labels` from apps/web's COPY table.

import type { ReactNode } from "react";

/** A chat thread row (the default "Project chat" is undeletable — the api owns that rule). */
export interface ChatThreadWire {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly archived: boolean;
}

/** A past turn — a `chat_turn` run's row projected for the transcript. */
export interface ChatTurnWire {
  readonly id: string;
  readonly state: string;
  readonly createdAt: string;
  readonly spentCredits: number;
  readonly capCredits: number;
  readonly modelTier: string;
}

/** A session-transcript entry (an assistant-namespace artifact). */
export interface ChatMessageWire {
  readonly path: string;
  readonly wordCount?: number | null;
}

/** A pin (≤12/thread; the footprint is the token estimate the panel shows). */
export interface ChatPinWire {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly ref?: string;
}

/** A "Chat sources" card — a durable source note under agents/assistant/research/. */
export interface ChatSourceWire {
  readonly path: string;
  readonly kind: string;
  readonly title?: string;
  readonly url?: string;
  readonly unverified?: boolean;
  readonly words?: number;
}

/** The metered cost strip (REQ-CHAT-9): credits vs cap, searches/fetches vs budget, workspace spend. */
export interface ChatStripWire {
  readonly spentCredits: number;
  readonly capCredits: number;
  readonly searchesUsed: number;
  readonly searchesBudget: number;
  readonly fetchesUsed: number;
  readonly fetchesBudget: number;
  readonly workspaceSpent?: number;
  readonly tier: string;
}

/** The plan card payload (the run's consent — REQ-CHAT-10). */
export interface ChatPlanCardWire {
  readonly summary: string;
  readonly steps: readonly string[];
  readonly budget: { readonly credits: number; readonly searches: number; readonly fetches: number };
  readonly modelTier: string;
  readonly actions: readonly string[];
  readonly researchSheetHref?: string;
}

/** The §7.6 empty-state model (quiet Page, Desk on Chat, four chips, one next-step card). */
export interface ChatEmptyStateWire {
  readonly chips: readonly { readonly id: string; readonly label: string; readonly verb: string }[];
  readonly nextStep: { readonly kind: string; readonly label: string; readonly href?: string };
}

/** "Ask about this draft" (§7.4): the anchored composer's prefill — `@v3 ¶4`-shaped. */
export interface ChatAskAboutWire {
  readonly ref: string;
  readonly version?: number;
  readonly block?: string;
}

/** Same-origin write endpoints the forms post to (the web routes forward to the api). */
export interface ChatDeskEndpoints {
  /** POST {message, modelTier} — creates the turn's `chat_turn` run (the plan card is the consent). */
  readonly turn: string;
  /** POST {action, runId?} — the plan card's decisions. */
  readonly planDecision: string;
  /** POST {summary, kind?, ref?} — pin a fact/ref/source. */
  readonly pin: string;
  /** POST — remove a pin. */
  readonly pinRemove: (pinId: string) => string;
  /** POST {text} — a correction to what the assistant remembers (a Guidance-class note). */
  readonly correction: string;
  /** POST {ref, version?, block?, replacement} — the §7.4 anchored suggestion. */
  readonly suggestion: string;
  /** POST {text} — the "Paste my notes" scratch write (agents/author/notes.md). */
  readonly notes: string;
  /** GET — a thread switch / refresh target (the island swaps ?thread=). */
  readonly threadHref: (threadId: string) => string;
}

export interface ChatDeskLabels {
  readonly threadsHeading: string;
  readonly newThread: string;
  readonly transcriptEmpty: string;
  readonly pinsHeading: string;
  readonly pinAddPlaceholder: string;
  readonly pinAdd: string;
  readonly pinRemove: string;
  readonly pinsFootprintFmt: string; // "{m} pins · footprint {n}"
  readonly remembersHeading: string;
  readonly correctionPlaceholder: string;
  readonly correctionSend: string;
  readonly sourcesHeading: string;
  readonly sourcesEmpty: string;
  readonly unverified: string;
  readonly composerPlaceholder: string;
  readonly send: string;
  readonly tierLabel: string;
  readonly tiers: { readonly base: string; readonly balanced: string; readonly frontier: string };
  readonly strip: {
    readonly creditsFmt: string;   // "{n} / {m} credits"
    readonly searchesFmt: string;  // "{n} / {m} searches"
    readonly fetchesFmt: string;   // "{n} / {m} fetches"
    readonly workspaceFmt: string; // "workspace {n} credits"
  };
  readonly planCard: {
    readonly heading: string;
    readonly run: string;       // "Run the research" → the sheet
    readonly firstStep: string; // "Just the first step"
    readonly edit: string;
    readonly cancel: string;
  };
  readonly askAbout: {
    readonly heading: string;   // "Ask about this draft"
    readonly anchorLabel: string;
    readonly placeholder: string;
    readonly send: string;
    readonly tooLarge: string;  // names /lineedit @section / /revise (the api refusal echoes it)
  };
  readonly liveRunNote: string; // "a run is live — chat sees committed artifacts only"
  readonly chipGroupLabel: string;
  readonly notesPlaceholder: string;
  readonly notesSend: string;
}

function fmt(template: string, vars: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export interface ChatDeskProps {
  readonly model: {
    readonly threads: readonly ChatThreadWire[];
    readonly activeThreadId: string;
    readonly turns: readonly ChatTurnWire[];
    readonly messages: readonly ChatMessageWire[];
    readonly pins: { readonly pins: readonly ChatPinWire[]; readonly footprint: number; readonly cap: number };
    readonly sources: readonly ChatSourceWire[];
    readonly liveRun: string | null;
    readonly emptyState?: ChatEmptyStateWire | null;
    readonly budgets: { readonly credits: number; readonly searches: number; readonly fetches: number };
    readonly tier: string;
    /** the most recent turn's metered strip (absent before the first turn). */
    readonly strip?: ChatStripWire | null;
    /** a pending plan card (the just-created turn's consent echo). */
    readonly planCard?: ChatPlanCardWire | null;
    /** the §7.4 anchored-composer prefill ("Ask about this draft"). */
    readonly askAbout?: ChatAskAboutWire | null;
    /** "What the assistant remembers" — the compaction brief (read-only). */
    readonly brief?: string | null;
  };
  readonly endpoints: ChatDeskEndpoints;
  readonly labels: ChatDeskLabels;
}

export function ChatDesk(props: ChatDeskProps): ReactNode {
  const { model: m, endpoints: E, labels: L } = props;
  const empty = m.emptyState ?? null;
  const tierNotches = ["base", "balanced", "frontier"] as const;
  return (
    <div className="chat-desk" data-chat="1" data-chat-thread={m.activeThreadId}>
      {/* threads — the project-scoped list; the default "Project chat" renders first, undeletable. */}
      <div className="chat-threads" role="navigation" aria-label={L.threadsHeading}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {m.threads.map((t) => (
            <li key={t.id}>
              <a
                href={E.threadHref(t.id)}
                data-chat-thread-link={t.id}
                aria-current={t.id === m.activeThreadId ? "true" : undefined}
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid var(--shell-line)",
                  color: t.id === m.activeThreadId ? "var(--shell-fg)" : "var(--shell-fg-muted)",
                  textDecoration: "none",
                }}
              >
                {t.name}
                {t.isDefault ? " ·" : ""}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* §7.6 — the empty state: the four starter chips + the one next-step card. */}
      {empty ? (
        <div className="chat-empty" data-chat-empty="1">
          <div role="group" aria-label={L.chipGroupLabel} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {empty.chips.map((chip) =>
              chip.verb === "notes" ? (
                <form key={chip.id} method="post" action={E.notes} style={{ display: "contents" }}>
                  <button type="submit" name="chip" value={chip.id} data-chat-chip={chip.id}>
                    {chip.label}
                  </button>
                </form>
              ) : chip.verb === "/research" ? (
                <a
                  key={chip.id}
                  data-chat-chip={chip.id}
                  href={empty.nextStep.href ?? "#"}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--shell-line)",
                  }}
                >
                  {chip.label}
                </a>
              ) : (
                <button key={chip.id} type="button" data-chat-chip={chip.id}>
                  {chip.label}
                </button>
              ),
            )}
          </div>
          {/* the "Paste my notes" scratch pad — the notes chip's write target (agents/author/notes.md). */}
          <form method="post" action={E.notes} data-chat-notes style={{ marginTop: 8 }}>
            <textarea
              name="text"
              rows={3}
              placeholder={L.notesPlaceholder}
              style={{ width: "100%", fontSize: 13 }}
            />
            <button type="submit">{L.notesSend}</button>
          </form>
        </div>
      ) : null}

      {/* the transcript — the thread's committed session entries + the turns they came from. */}
      <div className="chat-log" data-chat-log aria-live="polite">
        {m.turns.length === 0 && m.messages.length === 0 && !empty ? (
          <p style={{ color: "var(--shell-fg-muted)", fontSize: 13 }}>{L.transcriptEmpty}</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {m.turns.map((t) => (
              <li key={t.id} data-chat-turn={t.id} style={{ fontSize: 13, padding: "4px 0" }}>
                <span style={{ color: "var(--shell-fg-muted)", fontSize: 12 }}>
                  turn · {t.state} · {t.spentCredits}/{t.capCredits} cr · {t.modelTier}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* REQ-CHAT-20 — during a live (non-chat) run the assistant reads committed artifacts only. */}
      {m.liveRun ? (
        <p data-chat-live-note style={{ fontSize: 12, color: "var(--shell-fg-muted)" }}>{L.liveRunNote}</p>
      ) : null}

      {/* the plan card — the turn's consent echo (run the research → the sheet, first step, edit,
          cancel). Rendered only while a decision is pending. */}
      {m.planCard ? (
        <form method="post" action={E.planDecision} className="chat-plan-card" data-chat-plan-card>
          <input type="hidden" name="threadId" value={m.activeThreadId} />
          <strong style={{ fontSize: 13 }}>{L.planCard.heading}</strong>
          <p style={{ fontSize: 13, margin: "4px 0" }}>{m.planCard.summary}</p>
          <ol style={{ fontSize: 12, margin: "4px 0", paddingLeft: 18 }}>
            {m.planCard.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p style={{ fontSize: 12, color: "var(--shell-fg-muted)" }}>
            {fmt(L.strip.creditsFmt, { n: m.planCard.budget.credits, m: m.planCard.budget.credits })} ·{" "}
            {fmt(L.strip.searchesFmt, { n: m.planCard.budget.searches, m: m.planCard.budget.searches })} ·{" "}
            {fmt(L.strip.fetchesFmt, { n: m.planCard.budget.fetches, m: m.planCard.budget.fetches })} ·{" "}
            {m.planCard.modelTier}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* run_research resolves to the SHEET link — never a direct run create (REQ-CHAT-6/10). */}
            {m.planCard.researchSheetHref ? (
              <a href={m.planCard.researchSheetHref} data-chat-plan="run_research">
                {L.planCard.run}
              </a>
            ) : null}
            <button type="submit" name="action" value="first_step" data-chat-plan="first_step">
              {L.planCard.firstStep}
            </button>
            <button type="submit" name="action" value="edit" data-chat-plan="edit">
              {L.planCard.edit}
            </button>
            <button type="submit" name="action" value="cancel" data-chat-plan="cancel">
              {L.planCard.cancel}
            </button>
          </div>
        </form>
      ) : null}

      {/* §7.4 — "Ask about this draft": the anchored composer (a ≤1-paragraph suggestion; the api
          refuses larger with the /lineedit|/revise pointer — the copy names them as commands). */}
      {m.askAbout ? (
        <form method="post" action={E.suggestion} className="chat-ask" data-chat-ask>
          <strong style={{ fontSize: 13 }}>{L.askAbout.heading}</strong>
          <p style={{ fontSize: 12, color: "var(--shell-fg-muted)", margin: "2px 0" }}>
            {L.askAbout.anchorLabel} <code>{m.askAbout.ref}</code>
          </p>
          <input type="hidden" name="ref" value={m.askAbout.ref} />
          {m.askAbout.version != null ? (
            <input type="hidden" name="version" value={m.askAbout.version} />
          ) : null}
          {m.askAbout.block ? <input type="hidden" name="block" value={m.askAbout.block} /> : null}
          <textarea
            name="replacement"
            rows={3}
            placeholder={L.askAbout.placeholder}
            aria-label={L.askAbout.placeholder}
            style={{ width: "100%", fontSize: 13 }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit">{L.askAbout.send}</button>
            <span style={{ fontSize: 12, color: "var(--shell-fg-faint)" }}>{L.askAbout.tooLarge}</span>
          </div>
        </form>
      ) : null}

      {/* the composer — a real form; the island swaps it for the streaming composer when script runs. */}
      <form method="post" action={E.turn} className="chat-composer" data-chat-composer>
        <input type="hidden" name="threadId" value={m.activeThreadId} />
        <textarea
          name="message"
          rows={2}
          required
          placeholder={L.composerPlaceholder}
          aria-label={L.composerPlaceholder}
          style={{ width: "100%", fontSize: 13 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit">{L.send}</button>
          {/* REQ-CHAT-14 — the tier picker is notch-only (Base/Balanced/Frontier), never model text. */}
          <span role="radiogroup" aria-label={L.tierLabel} style={{ display: "inline-flex", gap: 4 }}>
            {tierNotches.map((t) => (
              <label key={t} data-chat-tier={t} style={{ fontSize: 12 }}>
                <input type="radio" name="modelTier" value={t} defaultChecked={m.tier === t} />{" "}
                {L.tiers[t]}
              </label>
            ))}
          </span>
          {/* the per-turn cost strip — metered rows only (REQ-CHAT-9). */}
          {m.strip ? (
            <span data-chat-strip style={{ fontSize: 12, color: "var(--shell-fg-muted)", marginLeft: "auto" }}>
              {fmt(L.strip.creditsFmt, { n: m.strip.spentCredits, m: m.strip.capCredits })} ·{" "}
              {fmt(L.strip.searchesFmt, { n: m.strip.searchesUsed, m: m.strip.searchesBudget })} ·{" "}
              {fmt(L.strip.fetchesFmt, { n: m.strip.fetchesUsed, m: m.strip.fetchesBudget })}
              {m.strip.workspaceSpent != null
                ? ` · ${fmt(L.strip.workspaceFmt, { n: m.strip.workspaceSpent })}`
                : ""}
            </span>
          ) : (
            <span data-chat-strip style={{ fontSize: 12, color: "var(--shell-fg-faint)", marginLeft: "auto" }}>
              {fmt(L.strip.creditsFmt, { n: 0, m: m.budgets.credits })} ·{" "}
              {fmt(L.strip.searchesFmt, { n: 0, m: m.budgets.searches })} ·{" "}
              {fmt(L.strip.fetchesFmt, { n: 0, m: m.budgets.fetches })}
            </span>
          )}
        </div>
      </form>

      {/* pins + "what the assistant remembers" (read-only brief; the correction posts a
          Guidance-class note — §7.1). */}
      <details className="chat-remembers" data-chat-remembers>
        <summary style={{ fontSize: 12 }}>{L.remembersHeading}</summary>
        {m.brief ? <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{m.brief}</pre> : null}
        <form method="post" action={E.correction} style={{ marginTop: 6 }}>
          <input type="hidden" name="threadId" value={m.activeThreadId} />
          <textarea
            name="text"
            rows={2}
            placeholder={L.correctionPlaceholder}
            style={{ width: "100%", fontSize: 12 }}
          />
          <button type="submit">{L.correctionSend}</button>
        </form>
      </details>

      <div className="chat-pins" data-chat-pins>
        <strong style={{ fontSize: 12 }}>{L.pinsHeading}</strong>
        <span style={{ fontSize: 11, color: "var(--shell-fg-faint)", marginLeft: 6 }}>
          {fmt(L.pinsFootprintFmt, { n: m.pins.footprint, m: m.pins.pins.length })}
        </span>
        <ul style={{ listStyle: "none", margin: "4px 0", padding: 0 }}>
          {m.pins.pins.map((p) => (
            <li key={p.id} data-chat-pin={p.id} style={{ fontSize: 12, display: "flex", gap: 6 }}>
              <span style={{ flex: 1 }}>
                {p.summary}
                {p.ref ? <code style={{ fontSize: 11 }}> {p.ref}</code> : null}
              </span>
              <form method="post" action={E.pinRemove(p.id)} style={{ display: "inline" }}>
                <input type="hidden" name="threadId" value={m.activeThreadId} />
                <button type="submit" aria-label={L.pinRemove} title={L.pinRemove}>
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
        {m.pins.pins.length < m.pins.cap ? (
          <form method="post" action={E.pin} style={{ display: "flex", gap: 6 }}>
            <input type="hidden" name="threadId" value={m.activeThreadId} />
            <input
              name="summary"
              placeholder={L.pinAddPlaceholder}
              aria-label={L.pinAddPlaceholder}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button type="submit">{L.pinAdd}</button>
          </form>
        ) : null}
      </div>

      {/* "Chat sources" — the durable source notes (read-only, newest first; a failed fetch shows
          its [unverified] marker). */}
      <div className="chat-sources" data-chat-sources>
        <strong style={{ fontSize: 12 }}>{L.sourcesHeading}</strong>
        {m.sources.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--shell-fg-muted)" }}>{L.sourcesEmpty}</p>
        ) : (
          <ul style={{ listStyle: "none", margin: "4px 0", padding: 0 }}>
            {m.sources.map((s) => (
              <li key={s.path} data-chat-source={s.path} style={{ fontSize: 12 }}>
                {s.title ?? s.path}
                {s.unverified ? (
                  <span style={{ color: "var(--shell-fg-muted)" }}> [{L.unverified}]</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
