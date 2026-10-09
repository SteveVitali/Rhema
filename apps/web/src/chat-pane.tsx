// SPA.21 — the Desk Chat panel's shared composition (§7.1/§7.4/§7.6), hoisted out of pages.tsx
// so the dossier's SPA leaf mounts the SAME `chatBody` the SSR `IdeFrame` renders (the
// gate-card.tsx/dossier-view.tsx precedent — one composition, both renderers; REQ-TST-2).
// Pure React + @rhema/ui + COPY — no server seams, bundle-safe.
import type { ReactNode } from "react";
import { ChatDesk, type ChatDeskLabels } from "@rhema/ui";
import type { ChatPanelDto } from "@rhema/api-client";
import { COPY } from "./copy.js";

export const chatDeskLabels: ChatDeskLabels = COPY.ide.chatDesk;

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
): ReactNode {
  return (
    <ChatDesk compact={compact}
      model={{
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
        })),
        messages: chat.messages.map((msg) => ({ path: msg.mirror_path, wordCount: msg.word_count })),
        pins: chat.pins,
        sources: chat.sources,
        liveRun: chat.liveRun,
        emptyState: chat.emptyState,
        budgets: chat.budgets,
        tier: chat.defaultTier,
        ...(ide.chatAskAbout ? { askAbout: ide.chatAskAbout } : {}),
      }}
      endpoints={{
        turn: `/p/${slug}/chat/turns`,
        planDecision: `/p/${slug}/chat/plan-decision`,
        pin: `/p/${slug}/chat/pins`,
        pinRemove: (pinId) => `/p/${slug}/chat/pins/${encodeURIComponent(pinId)}/remove`,
        correction: `/p/${slug}/chat/corrections`,
        suggestion: `/p/${slug}/chat/suggestions`,
        notes: `/p/${slug}/chat/notes`,
        threadHref: (threadId) => `/p/${slug}?thread=${encodeURIComponent(threadId)}#chat`,
      }}
      labels={chatDeskLabels}
    />
  );
}
