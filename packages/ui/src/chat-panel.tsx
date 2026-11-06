// R7TALK.1a (REQ-TALK-1/2/3; REQ-RELOAD-1; B6, B16, UXC-1) — the right panel's Chat tab, rebuilt
// on the 225a primitives (REQ-GUARD-1 enabled for this file): the thread is user/assistant
// bubbles with a per-turn cost footnote and inline retry, memory + pins sit in a header
// disclosure, and the composer is an auto-grow TextArea + model-tier Select + the live credit
// meter. The Send path is enhanced by the SPA's fetch mutation (`live`), but every write keeps a
// real `<form method="post">` so the no-JS SSR fallback still works end to end.
//
// Money truth (RV-21; gotcha 5): the footnote shows `debitedCredits` — the cap-clamped ledger
// charge — while `meteredCredits` (burn) stays available and, when it exceeds the cap, is labelled
// through COPY (`aboveCapFmt`) truthfully and never as the charge.
//
// Markdown seam (ordering concern): REQ-TALK-2 asks for rendered markdown, but the one sanitized
// renderer (REQ-COPY-3) is 245's. Until then `renderAssistantText` renders sanitized plain
// paragraphs — no ad-hoc markdown parser; 245 plugs its renderer in at this seam (D-R7TALK.1a-2).

import type { ReactNode } from "react";
import { Button } from "./primitives/button.js";
import { Chip } from "./primitives/chips.js";
import { TextArea } from "./primitives/fields.js";
import { Select } from "./primitives/select.js";

/** A chat thread row (the default "Project chat" is undeletable — the api owns that rule). */
export interface ChatThreadWire {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly archived: boolean;
}

/** A past turn — a `chat_turn` run projected for the transcript. */
export interface ChatTurnWire {
  readonly id: string;
  readonly state: string;
  readonly createdAt: string;
  /** metered burn (usage_records proxy rows) — displayed only via the above-cap label, never
   *  as the charge. */
  readonly spentCredits: number;
  readonly capCredits: number;
  readonly modelTier: string;
  /** the CHARGE — net cap-clamped ledger debits (absent before the first ledger row). */
  readonly debitedCredits?: number;
  /** the user's own words (the `-user.md` session entry). */
  readonly userText?: string;
  /** the reply abstract from the turn-result sidecar (≤600 chars, the distilled reply fact). */
  readonly reply?: string;
  /** typed refs the reply relied on — rendered as citation chips. */
  readonly refs?: readonly string[];
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

/** The §7.6 empty-state model (quiet Page, panel on Chat, four chips, one next-step card). */
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
  // R7TALK.1a — the thread/composer vocabulary (REQ-TALK-2; the above-cap label is the owned
  // copy key — burn above the cap stated truthfully, never presented as the charge).
  readonly threadHeading: string;
  readonly memoryPinsHeading: string;
  readonly retry: string;
  readonly abort: string;
  readonly sending: string;
  readonly youLabel: string;
  readonly assistantLabel: string;
  readonly debitedFmt: string;   // "{n} credits"
  readonly aboveCapFmt: string;  // "metered {n} above the cap — charged {m} (cap-clamped)"
  readonly progressWorking: string;
  readonly demoReadonly: string;
  readonly sourcesUsed: string;
}

/**
 * The live arm's props — absent ⇒ the pure SSR/no-JS render (native form posts). Present ⇒ the
 * SPA composer intercepts the submit and issues the JSON fetch itself (REQ-RELOAD-1).
 */
export interface ChatLiveWire {
  /** the send handler — called with the composer's message + tier; the wrapper owns the fetch. */
  readonly onSend?: (message: string, modelTier: string) => void;
  /** a send in flight (the composer shows the abort affordance). */
  readonly pending?: boolean;
  /** abort: pre-201 aborts the request; post-201 the wrapper posts the plan-decision cancel. */
  readonly onAbort?: () => void;
  /** retry a failed turn — the wrapper re-sends its user text. */
  readonly onRetry?: (turn: ChatTurnWire) => void;
  /** the optimistic user bubble, rendered until the server turn reconciles it. */
  readonly optimistic?: string | null;
  /** the run-event SSE progress line ("phase · step" — never model text). */
  readonly progress?: string | null;
  /** a send-level refusal line (stable code → COPY-side sentence upstream). */
  readonly error?: string | null;
  /** the tier selection (controlled from the wrapper so it survives twin repaints). */
  readonly tier?: string;
  readonly onTierChange?: (tier: string) => void;
  /** the live meter's spent credits (usage.tick-fed); falls back to the strip. */
  readonly spentLive?: number;
  /** disables the composer with the shown reason (demo boot / read-only project). */
  readonly disabledReason?: string;
}

function fmt(template: string, vars: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const TIER_NOTCHES = ["base", "balanced", "frontier"] as const;

/**
 * THE render seam for assistant text (REQ-TALK-2 + the markdown-seam note): today, sanitized
 * plain paragraphs — double-newline split, each paragraph a text node (React escapes by
 * construction). 245_R7COPY.1b plugs the one sanitized markdown renderer in HERE — every
 * assistant bubble and the optimistic/pending rows go through this single function.
 */
export function renderAssistantText(text: string, keyPrefix: string): ReactNode {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (paras.length === 0) return null;
  return (
    <>
      {paras.map((p, i) => (
        <p key={`${keyPrefix}-p${i}`} className="chat-bubble-text">
          {p}
        </p>
      ))}
    </>
  );
}

const TERMINAL_STATES: ReadonlySet<string> = new Set([
  "completed",
  "completed_partial",
  "failed",
  "cancelled",
]);

/** The per-turn cost footnote (REQ-TALK-2; RV-21): the debited (cap-clamped) charge; when metered
 *  burn exceeds the cap the COPY label says so — truthfully, never as the charge. */
function CostFootnote({ turn: t, labels: L }: { turn: ChatTurnWire; labels: ChatDeskLabels }): ReactNode {
  const charge = t.debitedCredits ?? t.spentCredits;
  const overCap = t.spentCredits > t.capCredits;
  return (
    <div className="chat-footnote" data-chat-footnote={t.id}>
      <span className="chat-footnote-charge">{fmt(L.debitedFmt, { n: charge })}</span>
      {overCap ? (
        <span className="chat-footnote-overcap" data-chat-overcap={t.id}>
          {fmt(L.aboveCapFmt, { n: t.spentCredits - t.capCredits, m: charge })}
        </span>
      ) : null}
    </div>
  );
}

/** One conversation turn: the user's bubble, then the assistant's (bubble or pending/failed row). */
function TurnBubbles({
  turn: t,
  labels: L,
  live,
}: {
  turn: ChatTurnWire;
  labels: ChatDeskLabels;
  live?: ChatLiveWire;
}): ReactNode {
  const failed = t.state === "failed" || t.state === "cancelled";
  const pending = !TERMINAL_STATES.has(t.state);
  return (
    <li className="chat-turn" data-chat-turn={t.id}>
      {t.userText != null && t.userText !== "" ? (
        <div className="chat-bubble chat-bubble-user" data-chat-bubble="user">
          <span className="chat-bubble-who">{L.youLabel}</span>
          {renderAssistantText(t.userText, `u-${t.id}`)}
        </div>
      ) : null}
      <div className="chat-bubble chat-bubble-assistant" data-chat-bubble="assistant">
        <span className="chat-bubble-who">{L.assistantLabel}</span>
        {t.reply != null && t.reply !== "" ? (
          renderAssistantText(t.reply, `a-${t.id}`)
        ) : pending ? (
          <span className="chat-bubble-pending">{L.progressWorking}</span>
        ) : failed ? (
          <span className="chat-bubble-failed" data-chat-failed={t.id}>
            {t.state}
            {live?.onRetry != null ? (
              <Button
                size="sm"
                variant="ghost"
                data-chat-retry={t.id}
                onClick={() => live.onRetry?.(t)}
              >
                {L.retry}
              </Button>
            ) : null}
          </span>
        ) : null}
        {t.refs != null && t.refs.length > 0 ? (
          <div className="chat-citations" data-chat-citations={t.id}>
            <span className="chat-citations-label">{L.sourcesUsed}</span>
            {t.refs.map((ref) => (
              <Chip key={ref} label={ref} data-chat-cite={ref} />
            ))}
          </div>
        ) : null}
      </div>
      <CostFootnote turn={t} labels={L} />
    </li>
  );
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
  /** the SPA live arm — absent ⇒ pure SSR/no-JS render. */
  readonly live?: ChatLiveWire;
  /** a read-only reason shown with the composer disabled (demo boot / showcase / run_lock). */
  readonly readOnlyReason?: string | null;
  /**
   * P1.19 — §10.1 phone width: text only, no promote. Compact keeps the threads, transcript, the
   * free-text composer, and the meter; it drops the plan card's run-start/config actions, the
   * anchored-suggestion form, and the tier picker (rigor/model is a ✗-column control).
   */
  readonly compact?: boolean;
}

export function ChatDesk(props: ChatDeskProps): ReactNode {
  const { model: m, endpoints: E, labels: L, compact, live, readOnlyReason } = props;
  const empty = m.emptyState ?? null;
  const composerDisabled = live?.disabledReason != null || readOnlyReason != null;
  const disabledReason = live?.disabledReason ?? readOnlyReason ?? null;
  // The meter's numbers always come from the strip DTO/budgets — `spentLive` is the usage.tick-fed
  // live reading, never an estimate.
  const spent = live?.spentLive ?? m.strip?.spentCredits ?? 0;
  const cap = m.strip?.capCredits ?? m.budgets.credits;

  const onComposerSubmit = (e: { preventDefault(): void; currentTarget: unknown }): void => {
    if (live?.onSend == null) return; // no live arm — the native post happens
    e.preventDefault();
    // packages/ui builds without DOM lib — read the named fields structurally (the browser's
    // real form element carries them).
    const form = e.currentTarget as unknown as {
      querySelector(sel: string): { value?: string } | null;
    };
    const message = (form.querySelector('[name="message"]')?.value ?? "").trim();
    const tier = form.querySelector('[name="modelTier"]')?.value ?? m.tier;
    if (message === "") return; // empty send blocked client-side — no request
    live.onSend(message, tier);
  };

  return (
    <div className="chat-desk" data-chat="1" data-chat-thread={m.activeThreadId}>
      <div className="chat-body">
        {/* threads — the project-scoped list; the default "Project chat" renders first. */}
        <div className="chat-threads" role="navigation" aria-label={L.threadsHeading}>
          <ul className="chat-threads-list">
            {m.threads.map((t) => (
              <li key={t.id}>
                <a
                  href={E.threadHref(t.id)}
                  data-chat-thread-link={t.id}
                  aria-current={t.id === m.activeThreadId ? "true" : undefined}
                  className="chat-thread-link"
                >
                  {t.name}
                  {t.isDefault ? " ·" : ""}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* §7.6 — the empty state: starter chips + the one next-step card. */}
        {empty ? (
          <div className="chat-empty" data-chat-empty="1">
            <div role="group" aria-label={L.chipGroupLabel} className="chat-chips">
              {empty.chips.map((chip) =>
                chip.verb === "notes" ? (
                  <form key={chip.id} method="post" action={E.notes} className="chat-inline-form">
                    <Button type="submit" name="chip" value={chip.id} variant="secondary" size="sm" data-chat-chip={chip.id}>
                      {chip.label}
                    </Button>
                  </form>
                ) : chip.verb === "/research" ? (
                  <a key={chip.id} data-chat-chip={chip.id} href={empty.nextStep.href ?? "#"} className="chat-chip-link">
                    {chip.label}
                  </a>
                ) : (
                  <Button key={chip.id} type="button" variant="secondary" size="sm" data-chat-chip={chip.id}>
                    {chip.label}
                  </Button>
                ),
              )}
            </div>
            <form method="post" action={E.notes} data-chat-notes className="chat-notes-form">
              <TextArea name="text" rows={3} placeholder={L.notesPlaceholder} aria-label={L.notesPlaceholder} />
              <Button type="submit" variant="primary">{L.notesSend}</Button>
            </form>
          </div>
        ) : null}

        {/* the thread — user/assistant bubbles (REQ-TALK-2); the status-only rows are gone. */}
        <div className="chat-log" data-chat-log aria-live="polite" aria-label={L.threadHeading}>
          {m.turns.length === 0 && m.messages.length === 0 && !empty && live?.optimistic == null ? (
            <p className="chat-empty-note">{L.transcriptEmpty}</p>
          ) : (
            <ul className="chat-turn-list">
              {m.turns.map((t) => (
                <TurnBubbles key={t.id} turn={t} labels={L} {...(live != null ? { live } : {})} />
              ))}
              {live?.optimistic != null ? (
                <li className="chat-turn" data-chat-turn="optimistic">
                  <div className="chat-bubble chat-bubble-user" data-chat-bubble="user">
                    <span className="chat-bubble-who">{L.youLabel}</span>
                    {renderAssistantText(live.optimistic, "opt")}
                  </div>
                  <div className="chat-bubble chat-bubble-assistant" data-chat-bubble="assistant">
                    <span className="chat-bubble-who">{L.assistantLabel}</span>
                    <span className="chat-bubble-pending" data-chat-progress>
                      {live.progress ?? L.progressWorking}
                    </span>
                  </div>
                </li>
              ) : null}
            </ul>
          )}
          {live?.progress != null && live.optimistic == null ? (
            <p className="chat-progress" data-chat-progress>{live.progress}</p>
          ) : null}
          {live?.error != null ? (
            <p className="chat-error" role="alert" data-chat-error>{live.error}</p>
          ) : null}
        </div>

        {/* REQ-CHAT-20 — during a live (non-chat) run the assistant reads committed artifacts only. */}
        {m.liveRun ? <p data-chat-live-note className="chat-note">{L.liveRunNote}</p> : null}

        {/* the plan card — the turn's consent echo, while a decision is pending. */}
        {m.planCard ? (
          <form method="post" action={E.planDecision} className="chat-plan-card" data-chat-plan-card>
            <input type="hidden" name="threadId" value={m.activeThreadId} />
            <strong className="chat-card-title">{L.planCard.heading}</strong>
            <p className="chat-card-body">{m.planCard.summary}</p>
            <ol className="chat-card-steps">
              {m.planCard.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <p className="chat-note">
              {fmt(L.strip.creditsFmt, { n: m.planCard.budget.credits, m: m.planCard.budget.credits })} ·{" "}
              {fmt(L.strip.searchesFmt, { n: m.planCard.budget.searches, m: m.planCard.budget.searches })} ·{" "}
              {fmt(L.strip.fetchesFmt, { n: m.planCard.budget.fetches, m: m.planCard.budget.fetches })} ·{" "}
              {m.planCard.modelTier}
            </p>
            <div className="chat-card-actions">
              {compact !== true && m.planCard.researchSheetHref ? (
                <a href={m.planCard.researchSheetHref} data-chat-plan="run_research">
                  {L.planCard.run}
                </a>
              ) : null}
              {compact !== true ? (
                <>
                  <Button type="submit" name="action" value="first_step" data-chat-plan="first_step">
                    {L.planCard.firstStep}
                  </Button>
                  <Button type="submit" name="action" value="edit" data-chat-plan="edit" variant="secondary">
                    {L.planCard.edit}
                  </Button>
                </>
              ) : null}
              <Button type="submit" name="action" value="cancel" data-chat-plan="cancel" variant="ghost">
                {L.planCard.cancel}
              </Button>
            </div>
          </form>
        ) : null}

        {/* §7.4 — "Ask about this draft" (never at phone width). */}
        {m.askAbout && compact !== true ? (
          <form method="post" action={E.suggestion} className="chat-ask" data-chat-ask>
            <strong className="chat-card-title">{L.askAbout.heading}</strong>
            <p className="chat-note">
              {L.askAbout.anchorLabel} <code>{m.askAbout.ref}</code>
            </p>
            <input type="hidden" name="ref" value={m.askAbout.ref} />
            {m.askAbout.version != null ? (
              <input type="hidden" name="version" value={m.askAbout.version} />
            ) : null}
            {m.askAbout.block ? <input type="hidden" name="block" value={m.askAbout.block} /> : null}
            <TextArea
              name="replacement"
              rows={3}
              placeholder={L.askAbout.placeholder}
              aria-label={L.askAbout.placeholder}
            />
            <div className="chat-card-actions">
              <Button type="submit" variant="primary">{L.askAbout.send}</Button>
              <span className="chat-hint">{L.askAbout.tooLarge}</span>
            </div>
          </form>
        ) : null}

        {/* memory + pins sit in a header disclosure (REQ-TALK-2). */}
        <details className="chat-remembers" data-chat-remembers>
          <summary className="chat-disclosure">{L.memoryPinsHeading}</summary>
          {m.brief ? <pre className="chat-brief">{m.brief}</pre> : null}
          <form method="post" action={E.correction} className="chat-notes-form">
            <input type="hidden" name="threadId" value={m.activeThreadId} />
            <TextArea
              name="text"
              rows={2}
              placeholder={L.correctionPlaceholder}
              aria-label={L.correctionPlaceholder}
            />
            <Button type="submit">{L.correctionSend}</Button>
          </form>
          <div className="chat-pins" data-chat-pins>
            <strong className="chat-card-title">{L.pinsHeading}</strong>
            <span className="chat-hint">
              {fmt(L.pinsFootprintFmt, { n: m.pins.footprint, m: m.pins.pins.length })}
            </span>
            <ul className="chat-pin-list">
              {m.pins.pins.map((p) => (
                <li key={p.id} data-chat-pin={p.id} className="chat-pin">
                  <span className="chat-pin-summary">
                    {p.summary}
                    {p.ref ? <code> {p.ref}</code> : null}
                  </span>
                  <form method="post" action={E.pinRemove(p.id)} className="chat-inline-form">
                    <input type="hidden" name="threadId" value={m.activeThreadId} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={L.pinRemove} title={L.pinRemove}>
                      ×
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            {m.pins.pins.length < m.pins.cap ? (
              <form method="post" action={E.pin} className="chat-pin-form">
                <input type="hidden" name="threadId" value={m.activeThreadId} />
                <TextArea
                  name="summary"
                  rows={1}
                  placeholder={L.pinAddPlaceholder}
                  aria-label={L.pinAddPlaceholder}
                />
                <Button type="submit">{L.pinAdd}</Button>
              </form>
            ) : null}
          </div>
        </details>

        {/* "Chat sources" — durable source notes (read-only). */}
        <div className="chat-sources" data-chat-sources>
          <strong className="chat-card-title">{L.sourcesHeading}</strong>
          {m.sources.length === 0 ? (
            <p className="chat-note">{L.sourcesEmpty}</p>
          ) : (
            <ul className="chat-source-list">
              {m.sources.map((s) => (
                <li key={s.path} data-chat-source={s.path}>
                  <Chip
                    label={`${s.title ?? s.path}${s.unverified ? ` [${L.unverified}]` : ""}`}
                    data-chat-source-chip={s.path}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>{/* /chat-body */}

      {/* the composer — primitives over a real form: the SPA arm fetches JSON on submit
          (REQ-RELOAD-1); no script ⇒ the native post still lands the turn. */}
      <form method="post" action={E.turn} className="chat-composer" data-chat-composer onSubmit={onComposerSubmit}>
        <input type="hidden" name="threadId" value={m.activeThreadId} />
        {disabledReason != null ? (
          <p className="chat-note" data-chat-readonly>{disabledReason}</p>
        ) : null}
        <TextArea
          name="message"
          rows={2}
          required
          placeholder={L.composerPlaceholder}
          aria-label={L.composerPlaceholder}
          disabled={composerDisabled || live?.pending === true}
          onKeyDown={(e) => {
            // ⏎ sends, ⇧⏎ inserts a newline (REQ-TALK-2).
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const el = e.currentTarget as unknown as {
                value?: string;
                form?: { requestSubmit(): void } | null;
              };
              if (live?.onSend != null) {
                const message = (el.value ?? "").trim();
                if (message !== "") live.onSend(message, live.tier ?? m.tier);
              } else {
                el.form?.requestSubmit();
              }
            }
          }}
        />
        <div className="chat-composer-row">
          {live?.onAbort != null && live.pending === true ? (
            <Button type="button" variant="secondary" onClick={live.onAbort} data-chat-abort>
              {L.abort}
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={composerDisabled || live?.pending === true} data-chat-send>
              {live?.pending === true ? L.sending : L.send}
            </Button>
          )}
          {/* REQ-CHAT-14 — tier is notch-only, never model text. The Radix Select wires a hidden
              native select so the no-JS form post still carries modelTier. */}
          {compact !== true ? (
            <Select
              name="modelTier"
              aria-label={L.tierLabel}
              value={live?.tier ?? m.tier}
              {...(live?.onTierChange != null ? { onValueChange: live.onTierChange } : {})}
              disabled={composerDisabled}
              items={TIER_NOTCHES.map((t) => ({ value: t, label: L.tiers[t] }))}
              data-chat-tier
            />
          ) : null}
          {/* the live credit meter — "0 / 40 credits" from the strip DTO (usage.tick-fed when live). */}
          <span data-chat-strip className="chat-strip">
            {fmt(L.strip.creditsFmt, { n: spent, m: cap })}
          </span>
        </div>
      </form>
    </div>
  );
}
