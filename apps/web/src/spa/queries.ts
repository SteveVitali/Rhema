// SPA.4 (REQ-FW-7, REQ-BFF-18/20/24, REQ-BFF-10) — the QueryClient + the pinned query objects.
// The client is rebuilt per document boot (REQ-BFF-10: nothing sensitive survives a session). Query
// keys are the endpoint inventory verbatim: `["session"]` (the auth oracle) and `["feed-labels"]`
// (the long-stale server-owned copy maps) are the two the skeleton consumes.

import { QueryClient, queryOptions } from "@tanstack/react-query";
import type { GateCardDto, InboxItemDto, PrincipalDto, UsageAccountDto, UsageDto, UsageProjectDto } from "@rhema/api-client";
import type { FeedLabelMaps } from "@rhema/ide";
import { BffError, bffFetch } from "./bff.js";

/**
 * Retry only TRANSPORT failures (fetch rejected — network drop): an HTTP status is a definitive
 * server answer, never retried (a 502/422/401 re-asked immediately is a lie loop).
 */
function retryPolicy(failureCount: number, error: unknown): boolean {
  if (error instanceof BffError) return false;
  return failureCount < 2;
}

/** The per-boot client — a fresh instance per `mountSpa`, never a module singleton. */
export function makeSpaQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: retryPolicy },
      // REQ-BFF-30 — mutations (the POST legs) never auto-retry; a refused write is data.
      mutations: { retry: false },
    },
  });
}

/**
 * `GET /session` — the auth oracle (REQ-BFF-18's pinned path, NOT `/bff/session`). Seeded from
 * `data-spa-boot` at mount; the boot embed is a seed, not a grant — this stays refetchable so the
 * api remains the oracle (spec §3.2).
 */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: () => bffFetch<PrincipalDto>("/session"),
  staleTime: 30_000,
  retry: retryPolicy,
});

/**
 * `GET /bff/feed-labels` — the server-built label maps (REQ-BFF-24; spec R12). Copy is
 * deploy-versioned: a fresh document boot rebuilds the client, so `Infinity` stale is honest.
 */
export const feedLabelsQuery = queryOptions({
  queryKey: ["feed-labels"],
  queryFn: () => bffFetch<FeedLabelMaps>("/bff/feed-labels"),
  staleTime: Infinity,
  retry: retryPolicy,
});

/**
 * The `GET /bff/usage` reference twin's payload (SPA.5; REQ-BFF-1/8/9): raw api-client DTOs,
 * degrade semantics as `null` fields — never a fabricated zero.
 */
export interface BffUsageTwin {
  readonly usage: UsageDto | null;
  readonly account: UsageAccountDto | null;
}

/**
 * `GET /bff/usage` — the reference twin's query (REQ-BFF-10's `["bff", …]` key family; SPA.10's
 * `usage` surface consumes this). No slug — the key is the endpoint verbatim.
 */
export const usageQuery = queryOptions({
  queryKey: ["bff", "usage"],
  queryFn: () => bffFetch<BffUsageTwin>("/bff/usage"),
  retry: retryPolicy,
});

/**
 * The `GET /bff/p/:slug/usage` twin's payload (SPA.10; REQ-BFF-11, REQ-DAT-4): the level-2 rollup
 * verbatim + the slug the SSR model attached (the back-link needs no second read). A 404 is the
 * route's own answer — `bffFetch` throws `BffError{status:404}`, the leaf maps it to `notFound()`.
 */
export interface BffProjectUsageTwin {
  readonly usageProject: UsageProjectDto & { readonly slug: string };
}

/**
 * `GET /bff/p/:slug/usage` — the project rollup's query. The browser key carries the SLUG
 * (`["bff","p",slug,"usage"]` — REQ-BFF-11's key grammar); the server resolves slug→id off its
 * request-scoped memo.
 */
export const projectUsageQuery = (slug: string) =>
  queryOptions({
    queryKey: ["bff", "p", slug, "usage"],
    queryFn: () => bffFetch<BffProjectUsageTwin>(`/bff/p/${encodeURIComponent(slug)}/usage`),
    retry: retryPolicy,
  });

/**
 * The `GET /bff/app/inbox` twin's payload (SPA.11; REQ-BFF-1/8/9, REQ-DAT-4): the SAME aggregate the
 * `/app/inbox` document composes — the api-ordered `items`, the raw `badge` count, and the §6.4 gate
 * cards keyed by inbox-ITEM id (the row's `gate.gateId` is the join). A missed gate join degrades the
 * row to its deep link, verbatim from the SSR.
 */
export interface BffInboxTwin {
  readonly items: InboxItemDto[];
  readonly badge: number;
  readonly gateCards: Record<string, GateCardDto>;
}

/**
 * `GET /bff/app/inbox` — the inbox aggregate's query. `["bff","app","inbox"]` — the endpoint verbatim
 * under the REQ-BFF-10/11 key grammar. The mark-read mutations invalidate this key on settle so the
 * badge + unread rows repaint from the server, never optimistic mirroring.
 */
export const inboxQuery = queryOptions({
  queryKey: ["bff", "app", "inbox"],
  queryFn: () => bffFetch<BffInboxTwin>("/bff/app/inbox"),
  retry: retryPolicy,
});
