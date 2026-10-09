// SPA.4 (REQ-FW-7, REQ-BFF-18/20/24, REQ-BFF-10) — the QueryClient + the pinned query objects.
// The client is rebuilt per document boot (REQ-BFF-10: nothing sensitive survives a session). Query
// keys are the endpoint inventory verbatim: `["session"]` (the auth oracle) and `["feed-labels"]`
// (the long-stale server-owned copy maps) are the two the skeleton consumes.

import { QueryClient, queryOptions } from "@tanstack/react-query";
import type {
  AccountExportDto,
  AccountSettingsDto,
  ApprovalSettingsDto,
  DataSettingsDto,
  GateCardDto,
  InboxItemDto,
  IntegrationsSettingsDto,
  NotificationPrefsDto,
  PreferencesSettingsDto,
  PrincipalDto,
  ProjectSettingsDto,
  ReseedPreviewDto,
  UsageAccountDto,
  UsageDto,
  UsageProjectDto,
  VoiceConnectionsDto,
  VoiceDetailDto,
  VoiceEstimateDto,
  VoiceListDto,
  VoiceSampleDetailDto,
  VoiceUpdatePlanDto,
} from "@rhema/api-client";
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

// ---- SPA.12 — the `settings` surface's twins (REQ-BFF-1/8/9/11/16, REQ-DAT-4; design/22 §2
// settings rows). One query per section leaf — the payload IS the document's PageData aggregate
// minus URL state (`saved`/`notice`/`confirmEmail`/`?p,v,f` stay validated search params — flash
// state is never payload). A degraded seam lands `null` — the section renders its own
// `data-settings-unavailable` state, never a fabricated value. ----

/** `GET /bff/settings/account` — profile + sign-in methods + sessions + the deletion state. */
export interface BffSettingsAccountTwin {
  readonly account: AccountSettingsDto | null;
}
export const settingsAccountQuery = queryOptions({
  queryKey: ["bff", "settings", "account"],
  queryFn: () => bffFetch<BffSettingsAccountTwin>("/bff/settings/account"),
  retry: retryPolicy,
});

/** `GET /bff/settings/preferences` — the user.prefs blob + consent threshold + app theme. */
export interface BffSettingsPreferencesTwin {
  readonly preferences: PreferencesSettingsDto | null;
}
export const settingsPreferencesQuery = queryOptions({
  queryKey: ["bff", "settings", "preferences"],
  queryFn: () => bffFetch<BffSettingsPreferencesTwin>("/bff/settings/preferences"),
  retry: retryPolicy,
});

/**
 * `GET /bff/settings/notifications` — the §5.11 matrix prefs + quiet hours + the user's projects
 * mapped to `{id,title}` (the `rp_*` per-project run_progress opt-in rows) — the document's own
 * composition, verbatim.
 */
export interface BffSettingsNotificationsTwin {
  readonly notifications:
    | (NotificationPrefsDto & {
        readonly projects?: readonly { readonly id: string; readonly title: string }[];
      })
    | null;
}
export const settingsNotificationsQuery = queryOptions({
  queryKey: ["bff", "settings", "notifications"],
  queryFn: () => bffFetch<BffSettingsNotificationsTwin>("/bff/settings/notifications"),
  retry: retryPolicy,
});

/** `GET /bff/settings/integrations` — the uniform REQ-ACCT-2 provider cards + the voice list. */
export interface BffSettingsIntegrationsTwin {
  readonly integrations: IntegrationsSettingsDto | null;
}
export const settingsIntegrationsQuery = queryOptions({
  queryKey: ["bff", "settings", "integrations"],
  queryFn: () => bffFetch<BffSettingsIntegrationsTwin>("/bff/settings/integrations"),
  retry: retryPolicy,
});

/**
 * `GET /bff/settings/data` — the three-way compose: the REQ-PROD-15 privacy toggle, the §14.7
 * Data read (support grant/log + preference opt-out + deletion), and the latest account-export
 * build. The notice/import-count flash params stay URL state, never payload.
 */
export interface BffSettingsDataTwin {
  readonly privacy: { readonly analyticsOptOut: boolean };
  readonly data: DataSettingsDto | null;
  readonly accountExport: { readonly export: AccountExportDto | null };
}
export const settingsDataQuery = queryOptions({
  queryKey: ["bff", "settings", "data"],
  queryFn: () => bffFetch<BffSettingsDataTwin>("/bff/settings/data"),
  retry: retryPolicy,
});

/**
 * `GET /bff/p/:slug/settings` — the `/p/:p/settings` document's aggregate (REQ-BFF-11,
 * REQ-DAT-4/6): slug→id off the server's request-scoped memo, `getProjectSettings` verbatim (a
 * miss is the route's own 404), the P1.09 approval-settings read as the best-effort join.
 */
export interface BffProjectSettingsTwin {
  readonly projectSettings: {
    readonly slug: string;
    readonly settings: ProjectSettingsDto;
    readonly approvalSettings?: ApprovalSettingsDto;
  };
}
export const projectSettingsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["bff", "p", slug, "settings"],
    queryFn: () => bffFetch<BffProjectSettingsTwin>(`/bff/p/${encodeURIComponent(slug)}/settings`),
    retry: retryPolicy,
  });

// ---- SPA.13 — the `voices` surface's twins (REQ-BFF-1/8/9/11/16, REQ-DAT-4/9; design/22 §2
// voices/voicesNew/voiceDetail/p.voiceReseed rows). One payload per document GET, the SAME
// composition the SSR handler runs — `?tab`/`?sample` stay URL state (they ride the query string,
// never the key's shape beyond the leaf's own search). A degraded seam lands `null`/absent — the
// SSR's own tolerate-and-degrade branches, never a fabricated value; an upstream 401 rides
// `swallowDegraded`'s rethrow into the `unauthenticated` envelope. ----

/** `GET /bff/voices` — the §9.1 library's three-group read (the document's `listVoiceGroups`
 *  composition verbatim — the same `{voices, groups}` shape `PageData.voices` carries). */
export interface BffVoicesTwin {
  readonly voices: VoiceListDto | null;
}
export const voicesQuery = queryOptions({
  queryKey: ["bff", "voices"],
  queryFn: () => bffFetch<BffVoicesTwin>("/bff/voices"),
  retry: retryPolicy,
});

/**
 * `GET /bff/voices/new` — the §9.2 creation sheet's options seam (design/22 §2 `voicesNew`). The
 * document composes nothing today (`{voiceNew:{}}` — the sheet's fields are static copy), so the
 * twin is a `{voiceNew:{}}` marker the leaf warms for the uniform pending/error path; when the
 * api grows creation options they land here, not in a second fetch.
 */
export interface BffVoiceNewTwin {
  readonly voiceNew: { readonly error?: never };
}
export const voiceNewQuery = queryOptions({
  queryKey: ["bff", "voices", "new"],
  queryFn: () => bffFetch<BffVoiceNewTwin>("/bff/voices/new"),
  retry: retryPolicy,
});

/**
 * `GET /bff/voices/:persona` — the §9.5 detail aggregate (design/22 §2 `voiceDetail` — the
 * document's own composition: `getVoice` 404 → the route's own `not_found`; `estimateVoice` +
 * `getVoiceUpdatePlan` best-effort; `listVoiceConnections`/`getVoiceSample` only when
 * `?tab=samples`). `?tab`/`?sample` are search state — they ride the endpoint's query string and
 * the key carries them verbatim.
 */
export interface BffVoiceDetailTwin {
  readonly voice: {
    readonly detail: VoiceDetailDto;
    readonly estimate?: VoiceEstimateDto;
    readonly updatePlan?: VoiceUpdatePlanDto;
    readonly connections?: VoiceConnectionsDto;
    readonly sampleDetail?: VoiceSampleDetailDto;
    readonly tab?: string;
  };
}
export const voiceDetailQuery = (
  personaId: string,
  search: { readonly tab?: string; readonly sample?: string } = {},
) => {
  const qs = new URLSearchParams();
  if (search.tab != null && search.tab !== "") qs.set("tab", search.tab);
  if (search.sample != null && search.sample !== "") qs.set("sample", search.sample);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return queryOptions({
    queryKey: ["bff", "voices", personaId, { tab: search.tab ?? null, sample: search.sample ?? null }],
    queryFn: () =>
      bffFetch<BffVoiceDetailTwin>(`/bff/voices/${encodeURIComponent(personaId)}${suffix}`),
    retry: retryPolicy,
  });
};

/**
 * `GET /bff/p/:slug/voice/reseed` — the §9.6 adopt dialog's charter-diff preview (design/22 §2
 * `p.voiceReseed`): slug→id through the request memo, `getVoiceReseedPreview` verbatim — a miss is
 * the document's own 404.
 */
export interface BffVoiceReseedTwin {
  readonly voiceReseed: {
    readonly slug: string;
    readonly projectId: string;
    readonly preview: ReseedPreviewDto;
  };
}
export const projectVoiceReseedQuery = (slug: string) =>
  queryOptions({
    queryKey: ["bff", "p", slug, "voice-reseed"],
    queryFn: () =>
      bffFetch<BffVoiceReseedTwin>(`/bff/p/${encodeURIComponent(slug)}/voice/reseed`),
    retry: retryPolicy,
  });
