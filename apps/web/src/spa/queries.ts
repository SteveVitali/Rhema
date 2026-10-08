// SPA.4 (REQ-FW-7, REQ-BFF-18/20/24, REQ-BFF-10) — the QueryClient + the pinned query objects.
// The client is rebuilt per document boot (REQ-BFF-10: nothing sensitive survives a session). Query
// keys are the endpoint inventory verbatim: `["session"]` (the auth oracle) and `["feed-labels"]`
// (the long-stale server-owned copy maps) are the two the skeleton consumes.

import { QueryClient, queryOptions } from "@tanstack/react-query";
import type { PrincipalDto, UsageAccountDto, UsageDto } from "@rhema/api-client";
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
