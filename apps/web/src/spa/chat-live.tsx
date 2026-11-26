// R7TALK.1a (REQ-TALK-3, REQ-RELOAD-1; GD-UX-STREAM.R7 "progress now, tokens later") — the chat
// panel's LIVE arm. `<ChatPanelLive>` wraps the pure `<ChatDesk>` render with:
//   - Send: a JSON `bffFetch` mutation (the web's `mutationOutcome` arm answers the 201's
//     `{runId, state}` in `data`) + an optimistic user bubble + abort (pre-201 aborts the fetch;
//     post-201 the existing plan-decision cancel stops the turn). Empty sends never leave.
//   - `/outline` and `/visualize` sends still resolve to their SHEETS — the envelope's redirect
//     rides `router.navigate` (the consent rule; never a document load, never an inline run).
//   - Progress: the existing run-event SSE (`/p/:slug/r/:runId/events`) feeds the phase line and
//     the live meter (`usage.tick`); a terminal event closes the tail and invalidates `["bff"]`
//     so the transcript refetches and the reply renders. No new event type/payload/visibility.
//   - 332_R7UX.9 (BL-99b; ADR-137): `chat.token` deltas accumulate into the pending turn's bubble.
//     Frames are NAMED SSE events (`event: <type>`), so the tail binds per-type listeners —
//     `onmessage` would never fire on this stream. Deltas dedup by payload `seq` (a mid-flight
//     reconnect replays them idempotently), coalesce at rAF cadence (one DOM write per frame,
//     never per event), and the completion event swaps to the canonical turn record — the
//     transcript's `reply` outranks the stream on any mismatch.
//   - Demo boot (REQ-DWEB-7 re-asserted): the composer renders disabled through
//     `ReadOnlyProject{reason:"demo"}` — no send, no thread/turn fetch, no EventSource.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  ChatDesk,
  type ChatDeskLabels,
  type ChatDeskProps,
  type ChatLiveWire,
  type ChatStreamWire,
} from "@rhema/ui";
import { formatFeedRow } from "@rhema/ide";
import { BffError, bffFetch } from "./bff.js";
import { errorMessage } from "../error-copy.js";
import { COPY } from "../copy.js";
import { isDemo } from "./demo.js";
import { feedLabelsQuery } from "./queries.js";
import { chatDeskEndpoints, chatDeskLabels, chatDeskModel } from "../chat-pane.js";

interface TurnCreated {
  readonly runId: string;
  readonly state: string;
  readonly deduped: boolean;
}

interface Envelope {
  readonly ok?: true;
  readonly redirect?: string;
  readonly data?: TurnCreated;
}

const TERMINAL_EVENTS = new Set([
  "chat.turn.completed",
  "run.state_changed",
  "cost.final",
  "chat.over_cap",
]);

// `run.state_changed` fires per-TRANSITION, not just at the end — only a terminal `to` closes the
// tail (the §12.4 absorbing states + the legacy terminal spellings the probe also breaks on).
const TERMINAL_TO = new Set([
  "completed",
  "completed_partial",
  "failed",
  "cancelled",
  "error_during_execution",
  "aborted",
]);

/** The tail's one in-flight token buffer — `turnId` unknown until the first delta binds it. */
interface TokenStream {
  readonly runId: string;
  turnId: string | null;
  /** seq → delta text. Replayed seqs overwrite the identical delta (idempotent dedup). */
  readonly parts: Map<number, string>;
}

export function ChatPanelLive(props: {
  readonly model: ChatDeskProps["model"];
  readonly endpoints: ChatDeskProps["endpoints"];
  readonly slug: string;
  readonly labels: ChatDeskLabels;
  readonly compact?: boolean;
  /** SSR/read-only reason (showcase/run_lock). The demo arm is derived inside. */
  readonly readOnlyReason?: string | null;
}): ReactNode {
  const { model: m, endpoints: E, slug, labels: L, compact, readOnlyReason } = props;
  const router = useRouter();
  const queryClient = useQueryClient();
  const demo = isDemo();
  const maps = useQuery({ ...feedLabelsQuery, enabled: !demo });

  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState(m.tier);
  const [spentLive, setSpentLive] = useState<number | null>(null);
  const [streamed, setStreamed] = useState<ChatStreamWire | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const streamRef = useRef<TokenStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const closeTail = (): void => {
    // `close?.()` — the tail is the component's own EventSource; in tests a stub may lack it.
    esRef.current?.close?.();
    esRef.current = null;
  };

  // rAF-coalesced flush: deltas accumulate in the buffer per event; ONE state write per frame
  // carries the whole assembled text to the DOM (ADR-137's coalescing clause).
  const flushStream = (): void => {
    const s = streamRef.current;
    if (s == null || s.turnId == null) return;
    const text = [...s.parts.keys()]
      .sort((a, b) => a - b)
      .map((seq) => s.parts.get(seq) ?? "")
      .join("");
    setStreamed(text === "" ? null : { runId: s.runId, turnId: s.turnId, text });
  };
  const scheduleFlush = (): void => {
    if (rafRef.current != null) return;
    if (typeof requestAnimationFrame !== "function") {
      flushStream(); // no frame clock in this environment — flush directly
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      flushStream();
    });
  };
  const cancelFlush = (): void => {
    if (rafRef.current != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = null;
  };
  const clearStream = (): void => {
    cancelFlush();
    streamRef.current = null;
    setStreamed(null);
  };
  // The tail's lifetime is the component's — never outlives unmount.
  useEffect(
    () => () => {
      closeTail();
      cancelFlush();
      streamRef.current = null;
    },
    [],
  );

  const openTail = (runId: string): void => {
    if (demo || typeof EventSource === "undefined") return;
    closeTail();
    clearStream();
    const src = new EventSource(`/p/${slug}/r/${encodeURIComponent(runId)}/events`);
    esRef.current = src;
    streamRef.current = { runId, turnId: null, parts: new Map() };

    const onTerminal = (): void => {
      closeTail();
      clearStream(); // the canonical record replaces the stream — it wins on any mismatch
      setProgress(null);
      setOptimistic(null);
      void queryClient.invalidateQueries({ queryKey: ["bff", "p", slug] });
    };
    const parseFrame = (ev: Event): { type: string; payload: Record<string, unknown> } | null => {
      let parsed: { type?: string; payload?: unknown };
      try {
        parsed = JSON.parse((ev as MessageEvent).data as string) as {
          type?: string;
          payload?: unknown;
        };
      } catch {
        return null; // malformed frame drops — fail-closed
      }
      return {
        type: typeof parsed.type === "string" ? parsed.type : "",
        payload: (parsed.payload ?? {}) as Record<string, unknown>,
      };
    };
    const onToken = (ev: Event): void => {
      const frame = parseFrame(ev);
      if (frame == null) return;
      const p = frame.payload;
      const turnId = p["turnId"];
      const seq = p["seq"];
      const text = p["text"];
      if (typeof turnId !== "string" || turnId === "") return;
      if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return;
      if (typeof text !== "string") return;
      const s = streamRef.current;
      if (s == null) return; // a token after the tail died — dropped, never rendered
      if (s.turnId !== turnId) {
        // A different turn on the same tail means a re-attempt minted a new id — its deltas
        // replace the stale buffer (the completion record reconciles regardless, ADR-137).
        s.turnId = turnId;
        s.parts.clear();
      }
      s.parts.set(seq, text);
      scheduleFlush();
    };
    const onFrame = (ev: Event): void => {
      const frame = parseFrame(ev);
      if (frame == null) return;
      const { type, payload } = frame;
      if (type === "usage.tick") {
        const spent = Number(payload["spentCredits"]);
        if (Number.isFinite(spent)) setSpentLive(spent);
        return; // the meter reads it — not a progress line
      }
      if (maps.data?.t != null) {
        const row = formatFeedRow(type, payload, maps.data);
        if (row != null) setProgress(row.label);
      } else {
        setProgress(L.progressWorking);
      }
      const terminal =
        type === "run.state_changed"
          ? typeof payload["to"] === "string" && TERMINAL_TO.has(payload["to"])
          : TERMINAL_EVENTS.has(type);
      if (terminal) onTerminal();
    };

    // Named-event binding (the wire carries `event: <type>`): `chat.token` + the terminal set +
    // `usage.tick` always; the feed-label types join when the maps have resolved (they cover the
    // progress line's every templated row). Replayed frames re-fire these same listeners after an
    // auto-reconnect — the EventSource object and its listeners persist.
    src.addEventListener("chat.token", onToken);
    src.addEventListener("usage.tick", onFrame);
    for (const type of TERMINAL_EVENTS) src.addEventListener(type, onFrame);
    for (const type of Object.keys(maps.data?.t ?? {})) {
      if (!type.startsWith("card.")) src.addEventListener(type, onFrame);
    }
    src.onerror = () => {
      /* EventSource auto-reconnects; Last-Event-ID resumes (§12.5) — replayed deltas dedup by seq */
    };
  };

  const send = (message: string, modelTier: string): void => {
    const text = message.trim();
    if (demo || text === "" || pending) return; // empty send blocked — no request
    setError(null);
    setOptimistic(text);
    clearStream(); // a new send retires any prior turn's stream before its tail opens
    setPending(true);
    runIdRef.current = null;
    const ctl = new AbortController();
    abortRef.current = ctl;
    void bffFetch<Envelope>(E.turn, {
      method: "POST",
      json: { threadId: m.activeThreadId, message: text, modelTier },
      signal: ctl.signal,
    })
      .then((env) => {
        // The verb arms (/outline, /visualize) resolve to their SHEETS — SPA navigation to the
        // consented sheet, never an inline run and never a document load.
        if (env.data == null && env.redirect != null) {
          setOptimistic(null);
          setPending(false);
          void router.navigate({ href: env.redirect });
          return;
        }
        const runId = env.data?.runId ?? null;
        runIdRef.current = runId;
        setPending(false);
        // The server turn exists — refetch so the optimistic bubble reconciles into a real row,
        // and open the run-event tail for progress until the terminal event.
        void queryClient.invalidateQueries({ queryKey: ["bff", "p", slug] });
        if (runId != null) openTail(runId);
        else setOptimistic(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          setOptimistic(null);
          setPending(false);
          return;
        }
        setPending(false);
        setOptimistic(null);
        setError(err instanceof BffError ? errorMessage(err) : COPY.spaError.body);
      });
  };

  const abort = (): void => {
    if (runIdRef.current != null) {
      // Post-201: the request already landed — the existing plan-decision cancel stops the turn.
      const runId = runIdRef.current;
      closeTail();
      clearStream();
      setOptimistic(null);
      setProgress(null);
      void bffFetch<Envelope>(E.planDecision, {
        method: "POST",
        json: { threadId: m.activeThreadId, action: "cancel", runId },
      })
        .catch(() => undefined)
        .finally(() => void queryClient.invalidateQueries({ queryKey: ["bff", "p", slug] }));
      return;
    }
    abortRef.current?.abort(); // pre-201: cancels the request itself
  };

  const retry = (turn: { readonly userText?: string; readonly modelTier: string }): void => {
    if (turn.userText == null || turn.userText === "") return;
    send(turn.userText, turn.modelTier);
  };

  const live = useMemo<ChatLiveWire>(
    () => ({
      onSend: send,
      pending,
      onAbort: abort,
      onRetry: retry,
      optimistic,
      progress,
      error,
      tier,
      onTierChange: setTier,
      ...(spentLive != null ? { spentLive } : {}),
      ...(streamed != null ? { streamed } : {}),
      ...(demo ? { disabledReason: L.demoReadonly } : {}),
    }),
    //
    [pending, optimistic, progress, error, tier, spentLive, streamed, demo, m.activeThreadId, maps.data],
  );

  return (
    <ChatDesk
      model={m}
      endpoints={E}
      labels={L}
      live={live}
      {...(compact != null ? { compact } : {})}
      {...(readOnlyReason != null ? { readOnlyReason } : {})}
    />
  );
}

/** The SPA mount of the chat panel (REQ-TALK-3) — the same composition `chatPanel` builds for
 *  SSR, with the live send/progress arm wired. `readOnlyTitle` keeps the fieldset wrap. */
export function chatPanelLive(
  chat: import("@rhema/api-client").ChatPanelDto,
  slug: string,
  ide: {
    readonly chatAskAbout?: {
      readonly ref: string;
      readonly version?: number;
      readonly block?: string;
    };
  },
  compact: boolean,
  readOnlyTitle?: string | null,
): ReactNode {
  const model = chatDeskModel(chat, ide);
  const body = (
    <ChatPanelLive
      model={model}
      endpoints={chatDeskEndpoints(slug)}
      slug={slug}
      labels={chatDeskLabels}
      {...(compact ? { compact } : {})}
      {...(readOnlyTitle != null ? { readOnlyReason: readOnlyTitle } : {})}
    />
  );
  return readOnlyTitle != null ? (
    <fieldset
      disabled
      title={readOnlyTitle}
      className="ui-c2-m0 ui-d-p0 ui-t-mw0"
      style={{ border: 0 }}
    >
      {body}
    </fieldset>
  ) : (
    body
  );
}
