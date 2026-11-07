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
//   - Demo boot (REQ-DWEB-7 re-asserted): the composer renders disabled through
//     `ReadOnlyProject{reason:"demo"}` — no send, no thread/turn fetch, no EventSource.
//
// No token deltas — those are BACKLOG (RV-3).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ChatDesk, type ChatDeskLabels, type ChatDeskProps, type ChatLiveWire } from "@rhema/ui";
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
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const closeTail = (): void => {
    // `close?.()` — the tail is the component's own EventSource; in tests a stub may lack it.
    esRef.current?.close?.();
    esRef.current = null;
  };
  // The tail's lifetime is the component's — never outlives unmount.
  useEffect(() => () => closeTail(), []);

  const openTail = (runId: string): void => {
    if (demo || typeof EventSource === "undefined") return;
    closeTail();
    const src = new EventSource(`/p/${slug}/r/${encodeURIComponent(runId)}/events`);
    esRef.current = src;
    src.onmessage = (ev) => {
      let parsed: { type?: string; payload?: unknown };
      try {
        parsed = JSON.parse(ev.data as string) as { type?: string; payload?: unknown };
      } catch {
        return; // malformed frame drops — fail-closed
      }
      const type = typeof parsed.type === "string" ? parsed.type : "";
      const payload = (parsed.payload ?? {}) as Record<string, unknown>;
      if (type === "usage.tick") {
        const spent = Number(payload["spentCredits"]);
        if (Number.isFinite(spent)) setSpentLive(spent);
        return; // the meter reads it — not a progress line
      }
      if (maps.data != null) {
        const row = formatFeedRow(type, parsed.payload, maps.data);
        if (row != null) setProgress(row.label);
      } else {
        setProgress(L.progressWorking);
      }
      if (TERMINAL_EVENTS.has(type)) {
        closeTail();
        setProgress(null);
        setOptimistic(null);
        void queryClient.invalidateQueries({ queryKey: ["bff", "p", slug] });
      }
    };
    src.onerror = () => {
      /* EventSource auto-reconnects; Last-Event-ID resumes (§12.5) */
    };
  };

  const send = (message: string, modelTier: string): void => {
    const text = message.trim();
    if (demo || text === "" || pending) return; // empty send blocked — no request
    setError(null);
    setOptimistic(text);
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
      ...(demo ? { disabledReason: L.demoReadonly } : {}),
    }),
    //
    [pending, optimistic, progress, error, tier, spentLive, demo, m.activeThreadId, maps.data],
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
