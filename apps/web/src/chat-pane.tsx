// SPA.21 — the Chat panel's shared composition (§7.1/§7.4/§7.6), hoisted out of pages.tsx
// so the dossier's SPA leaf mounts the SAME `chatBody` the SSR `IdeFrame` renders (the
// gate-card.tsx/dossier-view.tsx precedent — one composition, both renderers; REQ-TST-2).
// R7TALK.1a: the body is `<ChatPanelLive>` — the pure `<ChatDesk>` render plus the SPA's
// fetch-send/SSE-progress arm; SSR and no-JS keep the native form path (REQ-RELOAD-1).
// Pure React + @rhema/ui + COPY — no server seams, bundle-safe.
import type { ReactNode } from "react";
import { ChatDesk, type ChatDeskLabels, type ChatDeskProps } from "@rhema/ui";
import type { ChatPanelDto } from "@rhema/api-client";
import { COPY } from "./copy.js";

export const chatDeskLabels: ChatDeskLabels = COPY.ide.chatDesk;

/** Map the api's `GET /projects/:id/chat` DTO onto the desk model (turns carry debitedCredits +
 *  userText/reply/refs from R7TALK.1a). */
export function chatDeskModel(chat: ChatPanelDto, ide: {
  readonly chatAskAbout?: { readonly ref: string; readonly version?: number; readonly block?: string };
}): ChatDeskProps["model"] {
  return {
    threads: chat.threads.map((t) => ({
      id: t.id,
      name: t.name,
      isDefault: t.isDefault,
      archived: t.archived ?? false,
    })),
    activeThreadId: chat.activeThreadId,
    turns: chat.turns.map((t) => ({
      id: t.id,
      state: t.state,
      createdAt: t.created_at,
      spentCredits: t.spent_credits,
      capCredits: t.cap_credits,
      modelTier: t.model_tier,
      ...(t.debited_credits != null ? { debitedCredits: t.debited_credits } : {}),
      ...(t.user_text != null ? { userText: t.user_text } : {}),
      ...(t.reply != null ? { reply: t.reply } : {}),
      ...(t.refs != null ? { refs: t.refs } : {}),
    })),
    messages: chat.messages.map((msg) => ({ path: msg.mirror_path, wordCount: msg.word_count })),
    pins: chat.pins,
    sources: chat.sources,
    liveRun: chat.liveRun,
    emptyState: chat.emptyState,
    budgets: chat.budgets,
    tier: chat.defaultTier,
    ...(ide.chatAskAbout ? { askAbout: ide.chatAskAbout } : {}),
  };
}

/** The same-origin write endpoints (shared by the SSR and SPA mounts). */
export function chatDeskEndpoints(slug: string): ChatDeskProps["endpoints"] {
  return {
    turn: `/p/${slug}/chat/turns`,
    planDecision: `/p/${slug}/chat/plan-decision`,
    pin: `/p/${slug}/chat/pins`,
    pinRemove: (pinId: string) => `/p/${slug}/chat/pins/${encodeURIComponent(pinId)}/remove`,
    correction: `/p/${slug}/chat/corrections`,
    suggestion: `/p/${slug}/chat/suggestions`,
    notes: `/p/${slug}/chat/notes`,
    threadHref: (threadId: string) => `/p/${slug}?thread=${encodeURIComponent(threadId)}#chat`,
  };
}

/**
 * The ChatDesk body from the api's `GET /projects/:id/chat` DTO. Every write endpoint is same-origin
 * (the web routes forward to the api); the §7.4 anchored composer prefills when the Page offered
 * "Ask about this draft" (`ide.chatAskAbout`).
 */
export function chatPanel(
  chat: ChatPanelDto,
  slug: string,
  /** the SSR `PageData.ide` bag's one read field — declared structurally so this module stays
   *  bundle-clean (page-data.ts pulls server seams the SPA graph never typechecks). */
  ide: {
    readonly chatAskAbout?: {
      readonly ref: string;
      readonly version?: number;
      readonly block?: string;
    };
  },
  compact: boolean,
  /** R7RO.1 (REQ-DWEB-14) — the read-only reason text; set ⇒ every chat write (turns, plan
   *  decisions, pins, corrections, suggestions, notes) withholds inside a disabled fieldset
   *  with the tooltip before any request is made. `run_lock` is never fed here — the chat is
   *  run-lifecycle and stays live. */
  readOnlyTitle?: string | null,
): ReactNode {
  const endpoints = chatDeskEndpoints(slug);
  const model = chatDeskModel(chat, ide);
  const body = (
    <ChatDesk
      model={model}
      endpoints={endpoints}
      labels={chatDeskLabels}
      {...(compact ? { compact } : {})}
      {...(readOnlyTitle != null ? { readOnlyReason: readOnlyTitle } : {})}
    />
  );
  return readOnlyTitle != null ? (
    <fieldset disabled title={readOnlyTitle} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {body}
    </fieldset>
  ) : (
    body
  );
}
