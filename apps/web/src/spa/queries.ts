// SPA.4 (REQ-FW-7, REQ-BFF-18/20/24, REQ-BFF-10) — the QueryClient + the pinned query objects.
// The client is rebuilt per document boot (REQ-BFF-10: nothing sensitive survives a session). Query
// keys are the endpoint inventory verbatim: `["session"]` (the auth oracle) and `["feed-labels"]`
// (the long-stale server-owned copy maps) are the two the skeleton consumes.

import { QueryClient, queryOptions } from "@tanstack/react-query";
import type {
  AccountExportDto,
  AccountSettingsDto,
  ApprovalSettingsDto,
  BillingBalanceDto,
  BillingPlansDto,
  BillingSubscriptionDto,
  CheckoutStatusDto,
  DataSettingsDto,
  ExportDialogDto,
  ChatPanelDto,
  FigureCardDto,
  FigureListItemDto,
  FilesDto,
  GateCardDto,
  InboxItemDto,
  IntegrationsSettingsDto,
  OutlinePromotionDto,
  NotificationPrefsDto,
  PreferencesSettingsDto,
  PrincipalDto,
  ProjectGroupByDto,
  ProjectRow,
  ProjectSearchHitDto,
  ProjectSettingsDto,
  ProtocolCardDto,
  RunReportDto,
  TimelineDto,
  VoiceListRowDto,
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
import type { GateOutlineView } from "@rhema/findings-core";
import type { FeedLabelMaps } from "@rhema/ide";
import type { FeedRow } from "@rhema/ui";
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

// ---- SPA.14 — the `onboarding` surface's twins (REQ-BFF-1/8/9/11/15/16, REQ-DAT-1/4/6/9;
// design/22 §2 app.new/app.newPreview/p.import/p.importPreview rows). The two /app/new* reads
// gate on `onboarding` alone; the two /p/:p/import* legs AND `ide-chrome` (their payload carries
// the SSR `ideContext` bag the leaf republishes onto the React chrome). Search state — entry,
// picks, `qk`, `src` — rides the query string + the key, never the payload shape. A degraded seam
// lands `null` (protocols/voices); a document redirect leg answers `{ok:true, redirect}` — a JSON
// caller is never handed a 302. `pollAfterSeconds` is the server-owned pending cadence
// (IMPORT_PREVIEW_POLL_SECONDS) — the `refetchInterval` below reads it so the SPA's poll cadence
// IS the document's meta-refresh cadence, never a client-invented timer. ----

/** `GET /bff/app/new` — the sheet's two reads (the document's `loadNewProjectSheet` verbatim). */
export interface BffNewProjectTwin {
  readonly newProject: {
    readonly protocols: readonly ProtocolCardDto[] | null;
    readonly voices: readonly VoiceListRowDto[] | null;
  };
}
export const newProjectQuery = queryOptions({
  queryKey: ["bff", "app", "new"],
  queryFn: () => bffFetch<BffNewProjectTwin>("/bff/app/new"),
  retry: retryPolicy,
});

/** The ready preview payload — `PageData.newProject.preview` verbatim + the resolved title. */
export interface NewProjectPreviewReady {
  readonly status: "ready";
  readonly quarantineKey: string;
  readonly sourceLabel: string;
  readonly sourceText: string;
  readonly convertedMarkdown: string;
  readonly countLine: string;
  readonly warnings: readonly { readonly message: string; readonly blockId?: string | null }[];
  readonly title?: string;
  readonly resolvedTitle: string;
}
export interface NewProjectPreviewPending {
  readonly status: "pending";
  readonly quarantineKey: string;
  readonly sourceLabel: string;
  readonly pollAfterSeconds: number;
}
/** `GET /bff/app/new/preview` — the poll twin: pending/ready, or the document's redirect leg. */
export type BffNewProjectPreviewTwin =
  | { readonly ok: true; readonly redirect: string; readonly newProjectPreview?: never }
  | { readonly newProjectPreview: NewProjectPreviewReady | NewProjectPreviewPending; readonly ok?: never; readonly redirect?: never };

export interface NewProjectPreviewSearch {
  readonly entry?: string;
  readonly qk?: string;
  readonly title?: string;
  readonly protocolId?: string;
  readonly venue?: string;
  readonly personaId?: string;
  readonly startVersion?: string;
  readonly heldToken?: string;
  readonly src?: string;
}
export const newProjectPreviewQuery = (s: NewProjectPreviewSearch) => {
  const qs = new URLSearchParams();
  for (const k of ["entry", "qk", "title", "protocolId", "venue", "personaId", "startVersion", "heldToken", "src"] as const) {
    const v = s[k];
    if (v != null && v !== "") qs.set(k, v);
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return queryOptions({
    queryKey: ["bff", "app", "new", "preview", { ...s }],
    queryFn: () => bffFetch<BffNewProjectPreviewTwin>(`/bff/app/new/preview${suffix}`),
    // pending ⇒ re-ask at the server-owned cadence; ready/error ⇒ stop (REQ-BFF-15).
    refetchInterval: (q) => {
      const d = q.state.data;
      return d?.newProjectPreview?.status === "pending"
        ? (d.newProjectPreview.pollAfterSeconds ?? 3) * 1000
        : false;
    },
    retry: retryPolicy,
  });
};

/**
 * The `ide` bag the import twins carry — the SSR `ideContext` bag (`PageData["ide"]`), declared
 * structurally so the SPA graph never imports page-data.ts (its server seams can't bundle). The
 * leaf maps this onto `IdeChromeData`: `palette` arrives as the JSON string (parsed here), `files`
 * becomes `filesBody`, `chat` becomes `chatBody`, `feed` rides through verbatim.
 */
export interface BffIdeBag {
  readonly userId?: string;
  readonly projectId?: string;
  readonly initialView?: "write" | "read" | "focus";
  readonly sourceHref?: string;
  readonly activeRun?: { readonly runId: string; readonly state: string } | null;
  readonly inboxCount?: number;
  readonly findings?: readonly { readonly id: string; readonly severity: string; readonly kind: string; readonly excerpt: string }[];
  readonly timeline?: readonly { readonly id: string; readonly label: string; readonly state: string; readonly href?: string }[];
  readonly timelineView?: TimelineDto;
  readonly feed?: {
    readonly runId: string;
    readonly eventsUrl: string;
    readonly density: "summary" | "details" | "verbose";
    readonly rows: readonly FeedRow[];
    readonly lastSeq?: number;
  };
  readonly runNextHref?: string;
  readonly palette?: string;
  readonly paletteSearchUrl?: string;
  readonly status?: {
    readonly version?: string;
    readonly words?: number;
    readonly readMin?: number;
    readonly venueCap?: string;
    readonly credits?: number;
    readonly sync?: "synced" | "syncing" | "offline";
  };
  readonly themeUrl?: string;
  readonly paperThemeUrl?: string;
  readonly files?: FilesDto;
  readonly chat?: ChatPanelDto;
  /** §7.4's anchored-composer seed — only surfaces that offer "Ask about this draft" emit it. */
  readonly chatAskAbout?: { readonly ref: string; readonly version?: number; readonly block?: string };
}

/** `GET /bff/p/:slug/import` — project facts + the ide bag for the chrome publish. */
export interface BffImportTwin {
  readonly import: {
    readonly project: { readonly title: string; readonly pill: string; readonly slug: string };
    readonly paperTheme: string;
    readonly appTheme?: string;
    readonly ide: BffIdeBag;
  };
}
export const projectImportQuery = (slug: string) =>
  queryOptions({
    queryKey: ["bff", "p", slug, "import"],
    queryFn: () => bffFetch<BffImportTwin>(`/bff/p/${encodeURIComponent(slug)}/import`),
    retry: retryPolicy,
  });

/** The conversion payload — `PageData["conversion"]` verbatim (+ the pending cadence). */
export type BffConversion =
  | {
      readonly projectSlug: string;
      readonly sourceLabel: string;
      readonly sourceText: string;
      readonly convertedMarkdown: string;
      readonly countLine: string;
      readonly warnings: readonly { readonly message: string; readonly blockId?: string | null }[];
      readonly quarantineKey?: string;
      readonly created?: boolean;
      readonly pending?: false;
    }
  | {
      readonly projectSlug: string;
      readonly sourceLabel: string;
      readonly pending: true;
      readonly quarantineKey: string;
      readonly created?: boolean;
      readonly pollAfterSeconds?: number;
    };

/** `GET /bff/p/:slug/import/preview` — the poll twin (project-scoped `previewImport` re-ask). */
export type BffImportPreviewTwin =
  | { readonly ok: true; readonly redirect: string; readonly importPreview?: never }
  | {
      readonly importPreview: {
        readonly project: { readonly title: string; readonly pill: string; readonly slug: string };
        readonly paperTheme: string;
        readonly appTheme?: string;
        readonly ide: BffIdeBag;
        readonly conversion: BffConversion;
      };
      readonly ok?: never;
      readonly redirect?: never;
    };

export const projectImportPreviewQuery = (slug: string, search: { readonly qk?: string; readonly src?: string } = {}) => {
  const qs = new URLSearchParams();
  if (search.qk) qs.set("qk", search.qk);
  if (search.src) qs.set("src", search.src);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return queryOptions({
    queryKey: ["bff", "p", slug, "import", "preview", { qk: search.qk ?? null, src: search.src ?? null }],
    queryFn: () => bffFetch<BffImportPreviewTwin>(`/bff/p/${encodeURIComponent(slug)}/import/preview${suffix}`),
    refetchInterval: (q) => {
      const c = q.state.data?.importPreview?.conversion;
      return c?.pending === true ? ((c.pollAfterSeconds ?? 3) * 1000) : false;
    },
    retry: retryPolicy,
  });
};

// ---- SPA.15 — the `project-home` surface's twin (REQ-BFF-1/8/9, REQ-DAT-4; design/22 §2 `app`
// row). `GET /bff/app` ships RAW DTOs — the row→view mapping (`toProjectRowView`, `groupByAttention`
// /`groupByVoice`) and the voice/protocol/sort/archived filters run client-side off the shared
// `state-map.ts` seam (design/22 F10 — the mapper is pure COPY+DTO, bundle-portable). Only `?q=` and
// `?deleted=1` drive server reads (search + the deleted scope are never client-derivable), so they
// alone ride the key — the display filters re-render from the cached aggregate. Project mutations
// invalidate the `["bff","app"]` prefix (REQ-BFF-10's list key). ----

/** `GET /bff/app` — the §5.2 home aggregate (the document's seam composition, raw DTOs). */
export interface BffAppHomeTwin {
  readonly rows: readonly ProjectRow[];
  readonly voices: readonly VoiceListRowDto[];
  readonly groupBy: ProjectGroupByDto;
  /** the §14.5 level-0 chip — null when the billing seam degraded (SSR's absent-`bal` verbatim). */
  readonly balance: { readonly spendableCredits: number; readonly heldCredits: number } | null;
  readonly protocols: readonly ProtocolCardDto[];
  /** the 30-day restore window — present only when `?deleted=1` rode the read. */
  readonly deletedRows: readonly ProjectRow[];
  /** set when `?q=` ran — the server-side hits replace the groups (§5.2's interim search). */
  readonly search?: { readonly q: string; readonly results: readonly ProjectSearchHitDto[] };
}

/** The read-driving search params — display filters (`voice`/`protocol`/`sort`/`archived`) never reach the twin. */
export interface ProjectHomeSearch {
  readonly q?: string;
  readonly deleted?: string;
}

export const projectHomeQuery = (s: ProjectHomeSearch = {}) => {
  const qs = new URLSearchParams();
  if (s.q != null && s.q !== "") qs.set("q", s.q);
  if (s.deleted === "1") qs.set("deleted", "1");
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return queryOptions({
    queryKey: ["bff", "app", { q: s.q ?? null, deleted: s.deleted === "1" }],
    queryFn: () => bffFetch<BffAppHomeTwin>(`/bff/app${suffix}`),
    retry: retryPolicy,
  });
};

// ---- SPA.16 — the `billing` surface's twins (REQ-BFF-1/8/9, REQ-DAT-4/12; design/22 §2
// `app.settings.billing` + `billing.return` rows). `GET /bff/settings/billing` composes the
// document's seams verbatim — `billing` is null unless BOTH the subscription and plans reads
// land (the SSR's own `subscription && plans` gate, so the leaf renders `data-billing-down`
// rather than fabricating a free tier); `balance` is the §14.5 read with `paymentLinkUrl`
// already Stripe-allowlist-validated server-side (a refused value never serializes — the key
// is absent). `saved`/`notice` stay URL state (validated search), never payload.
// `GET /bff/billing/return` carries the checkout row + `pollAfterSeconds` — the server owns the
// §14.6 ≤30 s webhook-lag verdict; the leaf's `refetchInterval` reads it (REQ-BFF-15). ----

/** `GET /bff/settings/billing` — the billing surface aggregate (raw DTOs). */
export interface BffBillingSettingsTwin {
  readonly billing: {
    readonly subscription: BillingSubscriptionDto;
    readonly plans: BillingPlansDto;
  } | null;
  readonly balance: BillingBalanceDto | null;
}
export const billingSettingsQuery = queryOptions({
  queryKey: ["bff", "settings", "billing"],
  queryFn: () => bffFetch<BffBillingSettingsTwin>("/bff/settings/billing"),
  retry: retryPolicy,
});

/** `GET /bff/billing/return` — the checkout-return row + the server-owned poll verdict. */
export interface BffBillingReturnTwin {
  readonly checkoutReturn: CheckoutStatusDto | null;
  readonly cancelled: boolean;
  /** present only while `open ∧ ¬cancelled ∧ <30 s old` — the §14.6 webhook-lag window. */
  readonly pollAfterSeconds?: number;
}

export interface BillingReturnSearch {
  readonly session_id?: string;
  readonly cancelled?: string;
}

export const billingReturnQuery = (s: BillingReturnSearch = {}) => {
  const qs = new URLSearchParams();
  if (s.session_id != null && s.session_id !== "") qs.set("session_id", s.session_id);
  if (s.cancelled === "1") qs.set("cancelled", "1");
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return queryOptions({
    queryKey: ["bff", "billing", "return", { session_id: s.session_id ?? null, cancelled: s.cancelled === "1" }],
    queryFn: () => bffFetch<BffBillingReturnTwin>(`/bff/billing/return${suffix}`),
    // The server emits `pollAfterSeconds` only inside the ≤30 s window — its absence stops the
    // poll (an `open` row past the window, an `expired`/`completed` row, or a `cancelled` return
    // all answer without it — the leaf never polls on its own judgment, REQ-BFF-15).
    refetchInterval: (q) => {
      const d = q.state.data;
      return d != null && typeof d.pollAfterSeconds === "number" && d.pollAfterSeconds > 0
        ? d.pollAfterSeconds * 1000
        : false;
    },
    retry: retryPolicy,
  });
};

// ---- SPA.17 — the `export` surface's twin (REQ-BFF-1/8/9/11/16, REQ-DAT-4/6; design/22 §2
// `p.export` row). The §13.4 dialog's own composition verbatim — slug→id off the server's
// request-scoped memo, `getExportDialog` under the SSR's catch→not-found seam — plus project
// facts and the `ide` bag the leaf republishes onto the React chrome (the first IDE-framed
// flip: `export` AND `ide-chrome` are server-ANDed into the boot verdict — REQ-SEQ-6/12).
// `?error`/`?added`/`?focus` stay URL state — flash params are never payload; `compact` is
// boot-owned (`deviceClass`). The export POST itself stays a native document nav — bytes
// never ride a JSON envelope (REQ-BFF-17); `/export/addition` is the surface's one JSON
// mutation (`{ok, redirect:"/p/:slug/export?added=1"}`). ----

/** `GET /bff/p/:slug/export` — the dialog + project facts + the chrome `ide` bag. */
export interface BffExportTwin {
  readonly export: {
    readonly slug: string;
    readonly projectId: string;
    readonly dialog: ExportDialogDto;
    readonly project: { readonly title: string; readonly pill: string; readonly slug: string };
    readonly paperTheme: string;
    readonly appTheme?: string;
    readonly ide: BffIdeBag;
  };
}
export const projectExportQuery = (slug: string) =>
  queryOptions({
    queryKey: ["bff", "p", slug, "export"],
    queryFn: () => bffFetch<BffExportTwin>(`/bff/p/${encodeURIComponent(slug)}/export`),
    retry: retryPolicy,
  });

// ---- SPA.18 — the `outline` surface (design/22 §2 `p.outline`/`p.outlinePromote`) ----------------
// The editor twin is the document's `outline` page-data bag verbatim (view rows, save/delete
// actions, the server-computed Draft estimate, `cited`) minus the URL-owned flashes (`?saved`/
// `?notice` — the leaf renders them) and `editable` carries the api's fact raw — the leaf ANDs
// `deviceClass === "phone"` exactly like the document's `!isPhoneRequest`. `outline: null` is the
// designed no-outline arm (the document's `O.notFound` render), distinct from a missed slug's 404.
// The sheet twin carries the api's promotion facts + the scope/thread/turn the document echoed
// off the URL (the form's hidden fields replay them); `outlinePromotion: null` is its 404 arm.

/** `GET /bff/p/:slug/outline` — the durable editor's page-data twin. */
export interface BffOutlineTwin {
  readonly outline: {
    readonly slug: string;
    readonly editable: boolean;
    readonly saveAction: string;
    readonly deleteAction: string;
    readonly draftEstimateCredits?: number;
    readonly outline: GateOutlineView;
    readonly cited: boolean;
  } | null;
}
export const projectOutlineQuery = (slug: string, opts?: { slug?: string }) =>
  queryOptions({
    queryKey: ["bff", "p", slug, "outline", opts?.slug ?? ""],
    queryFn: () =>
      bffFetch<BffOutlineTwin>(
        `/bff/p/${encodeURIComponent(slug)}/outline${opts?.slug ? `?slug=${encodeURIComponent(opts.slug)}` : ""}`,
      ),
    retry: retryPolicy,
  });

/** `GET /bff/p/:slug/outline/promote` — the consent sheet's facts + the URL-echoed picks. */
export interface BffOutlinePromoteTwin {
  readonly outlinePromotion: {
    readonly slug: string;
    readonly projectTitle: string;
    readonly promotion: OutlinePromotionDto;
    readonly scope: "thread" | "turn" | "research";
    readonly threadId?: string;
    readonly turnId?: string;
    /** set after a successful Promote click — the run started (the document's `data-started` arm). */
    readonly started?: { readonly runId: string; readonly slug: string };
  } | null;
}
export const projectOutlinePromoteQuery = (
  slug: string,
  opts?: { scope?: string; threadId?: string; turnId?: string; slug?: string },
) =>
  queryOptions({
    queryKey: [
      "bff",
      "p",
      slug,
      "outline",
      "promote",
      opts?.scope ?? "",
      opts?.threadId ?? "",
      opts?.turnId ?? "",
      opts?.slug ?? "",
    ],
    queryFn: () => {
      const q = new URLSearchParams();
      if (opts?.scope) q.set("scope", opts.scope);
      if (opts?.threadId) q.set("threadId", opts.threadId);
      if (opts?.turnId) q.set("turnId", opts.turnId);
      if (opts?.slug) q.set("slug", opts.slug);
      const qs = q.toString();
      return bffFetch<BffOutlinePromoteTwin>(
        `/bff/p/${encodeURIComponent(slug)}/outline/promote${qs ? `?${qs}` : ""}`,
      );
    },
    retry: retryPolicy,
  });

// ---- SPA.19 — the `figures` surface's twins (REQ-BFF-1/8/9/11, REQ-DAT-4/6; design/22 §2
// `p.figures`/`p.figureCard`/`p.visualize` rows). The pane twin is the api's FigureListItemDto
// rows verbatim — the `[unverified data]` badge text is the api's, never retyped; a degraded
// list read lands `items:[]` (the SSR's own `.catch(() => null) ?? []` arm). The card twin
// carries the full FigureCardDto + the head-draft id the insert proposal gates on —
// `{figure:null}` is the document's own 404 arm (the leaf renders `COPY.visualize.notFound`,
// not the router's generic not-found). The sheet twin echoes the URL's own entry-point picks
// (`?request`/`?kind`/`?figure`/`?prior`/`?entry`) plus the server-computed figure estimate —
// the leaf never re-derives `fig_`-prefix stripping or the honesty seeds. `?saved`/`?notice`
// stay URL state (validated search), never payload. Binary figure assets never ride JSON
// (REQ-BFF-17-class): the persisted preview ships inline (`card.files.svgLight`), and any
// image/download stays a document navigation. ----

/** `GET /bff/p/:slug/figures` — the pane list twin. */
export interface BffFiguresTwin {
  readonly figures: {
    readonly slug: string;
    readonly items: readonly FigureListItemDto[];
  };
}
export const projectFiguresQuery = (slug: string) =>
  queryOptions({
    queryKey: ["bff", "p", slug, "figures"],
    queryFn: () => bffFetch<BffFiguresTwin>(`/bff/p/${encodeURIComponent(slug)}/figures`),
    retry: retryPolicy,
  });

/** `GET /bff/p/:slug/figures/:figureId` — the card twin (`figure:null` = the 404 arm). */
export interface BffFigureCardTwin {
  readonly figure: {
    readonly slug: string;
    readonly card: FigureCardDto;
    /** the project's head draft — the insert proposal's target (null ⇒ insert disabled). */
    readonly headDraftId: string | null;
  } | null;
}
export const projectFigureCardQuery = (slug: string, figureId: string) =>
  queryOptions({
    queryKey: ["bff", "p", slug, "figures", figureId],
    queryFn: () =>
      bffFetch<BffFigureCardTwin>(
        `/bff/p/${encodeURIComponent(slug)}/figures/${encodeURIComponent(figureId)}`,
      ),
    retry: retryPolicy,
  });

/** `GET /bff/p/:slug/visualize` — the sheet composition + the URL-echoed entry-point picks. */
export interface BffVisualizeTwin {
  readonly visualize: {
    readonly slug: string;
    readonly request: string;
    readonly specKind: string;
    /** iterate mode — the existing figure id + the version it continues from. */
    readonly figureId?: string;
    readonly priorVersion?: number;
    /** the honesty path the entry point seeded (provenance is the run's to classify). */
    readonly entryPoint?: string;
    readonly estimateCredits: number;
    readonly capCredits: number;
  };
}
export const projectVisualizeQuery = (
  slug: string,
  opts?: { request?: string; kind?: string; figure?: string; prior?: string; entry?: string },
) =>
  queryOptions({
    queryKey: [
      "bff",
      "p",
      slug,
      "visualize",
      opts?.request ?? "",
      opts?.kind ?? "",
      opts?.figure ?? "",
      opts?.prior ?? "",
      opts?.entry ?? "",
    ],
    queryFn: () => {
      const q = new URLSearchParams();
      if (opts?.request) q.set("request", opts.request);
      if (opts?.kind) q.set("kind", opts.kind);
      if (opts?.figure) q.set("figure", opts.figure);
      if (opts?.prior) q.set("prior", opts.prior);
      if (opts?.entry) q.set("entry", opts.entry);
      const qs = q.toString();
      return bffFetch<BffVisualizeTwin>(
        `/bff/p/${encodeURIComponent(slug)}/visualize${qs ? `?${qs}` : ""}`,
      );
    },
    retry: retryPolicy,
  });

// ---- SPA.20 — the `run-sheet` surface's twin + estimate revalidation (design/22 §2 `p.run` row +
// §7.3; REQ-BFF-1/8/9/11/12/23, REQ-DAT-4/6/12). The aggregate carries the server-built
// RunSheetView VERBATIM (`sheet` = the `runSheet.view` bag: `recompute.cells`/`idempotencyKey`/
// `entitlementId`/display strings ride inside — F13), the project's facts + the `ide` bag the
// IDE-framed leaf republishes onto the React chrome (the `run-sheet` × `ide-chrome` AND-gate),
// and `pretriage` for the Revise arm. The leaf's lever params (`workflow`/`rigor`/`tier`/`scope`/
// `toggle.*`/…) forward verbatim — the document reads the same grammar off `c.req.query()` —
// while `?notice` stays leaf-rendered URL flash state and never rides the query. The
// `POST /bff/p/:slug/estimate` revalidation takes the api's `EstimateRequestDto` verbatim —
// the typed answer (`EstimateDto`) is for out-of-matrix inputs; the in-matrix lever repaint is a
// `cells` lookup, never a fetch. ----

import type { EstimateRequestDto, EstimateDto } from "@rhema/api-client";
import type { RunSheetView } from "@rhema/run-sheet";

/** `GET /bff/p/:slug/run` — the run-sheet aggregate twin (view-as-DTO + chrome shell bag). */
export interface BffRunSheetTwin {
  readonly runSheet: {
    readonly slug: string;
    readonly projectTitle: string;
    /** the server-built view verbatim — the leaf repaints levers off `view.recompute.cells`. */
    readonly view: RunSheetView;
    /** a non-terminal run blocks this workflow+scope ⇒ the in-progress arm replaces the sheet. */
    readonly activeRun?: { readonly runId: string; readonly state: string };
  };
  /** Revise only — "you pre-triaged N of M" (the document's own PageData key). */
  readonly pretriage?: { readonly triaged: number; readonly total: number };
  readonly project: { readonly title: string; readonly pill: string; readonly slug: string };
  readonly paperTheme: string;
  readonly appTheme?: string;
  readonly ide: BffIdeBag;
}

/** The lever params the twin's composition reads — the document's `c.req.query()` grammar
 *  verbatim. `notice` (a rendered flash, not a read input) is stripped; the query key carries the
 *  full fingerprint so a lever-deep-link and its repaint cache separately. */
export const projectRunSheetQuery = (slug: string, search?: Record<string, string | undefined>) =>
  queryOptions({
    queryKey: [
      "bff",
      "p",
      slug,
      "run",
      JSON.stringify(
        Object.fromEntries(
          Object.entries(search ?? {})
            .filter(([k, v]) => k !== "notice" && v != null && v !== "")
            .sort(([a], [b]) => (a < b ? -1 : 1)),
        ),
      ),
    ],
    queryFn: () => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(search ?? {})) {
        if (k === "notice" || v == null || v === "") continue;
        q.set(k, v);
      }
      const qs = q.toString();
      return bffFetch<BffRunSheetTwin>(
        `/bff/p/${encodeURIComponent(slug)}/run${qs ? `?${qs}` : ""}`,
      );
    },
    retry: retryPolicy,
  });

/** `POST /bff/p/:slug/estimate` — REQ-BFF-23's typed revalidation: the api's
 *  `EstimateRequestDto` verbatim body forwards; the `EstimateDto` lands untouched. Lever repaints
 *  never reach here (the matrix's `cells` cover them) — this is for out-of-matrix inputs. */
export function postRunSheetEstimate(slug: string, req: EstimateRequestDto): Promise<EstimateDto> {
  return bffFetch<EstimateDto>(`/bff/p/${encodeURIComponent(slug)}/estimate`, {
    method: "POST",
    json: req,
  });
}

// ---- SPA.21 — the `dossier` surface's twins (REQ-BFF-1/8/9/11, REQ-DAT-1/4/5; design/22 §2
// `p.review` + `p.obligationNew` rows — the heaviest search surface). `GET /bff/p/:slug/review/:runId`
// is the document GET's SHARED composition verbatim: the dossier carries RAW findings + `rigor` so
// the leaf's client-ported `filterFindings`/`applySeverityBudget` (design/22 OQ8 option (b) — the
// filter keys stay URL state and never refetch) re-derives the same `visible` set the SSR handler
// computed. What rides the key is only what the SERVER still owns: the `?bulk=`/`?bsec` preview
// read, the `?gate=` focused-card lookup, the `?disposed`/`?applied`/`?promoted`/`?obligated`/
// `?ferr`/`?fmsg`/`?bulkdone`/`?bulkskip` flash echoes (a mutation's redirect lands the changed
// server truth + the notice in one read), and `?focus` (the `initialView:"focus"` seed). `sev`/
// `kind`/`disp`/`sec`/`url`/`sug`/`obl`/`triage` are the leaf's own — the dossier's filters are
// the one surface that derives client-side. ----

import type { DossierViewData, DossierViewState, TriageSurfaceState } from "../dossier-view.js";

/**
 * `GET /bff/p/:slug/review/:runId` — the dossier aggregate twin. `dossier` is `DossierViewData`
 * verbatim; `dossierView` is the server-decided arms (`bulk`, `bulkDone`, `notice`, `focusedGate` —
 * `filters`/`triage` echo the forwarded query but the leaf overrides them from its own validated
 * search); `triage.savedFindingId` echoes `?disposed`; `project`/`paperTheme`/`appTheme`/`ide` are
 * the chrome shell slice the leaf republishes (REQ-SEQ-12).
 */
export interface BffDossierTwin {
  readonly dossier: DossierViewData;
  readonly dossierView: DossierViewState;
  readonly triage?: TriageSurfaceState;
  readonly project: { readonly title: string; readonly pill: string; readonly slug: string };
  readonly paperTheme: string;
  readonly appTheme?: string;
  readonly ide: BffIdeBag;
}

/** The twin's server-owned search keys — verbatim the document's `c.req.query()` grammar. */
export interface DossierTwinSearch {
  readonly disposed?: string;
  readonly gate?: string;
  readonly bulk?: string;
  readonly bsec?: string;
  readonly bulkdone?: string;
  readonly bulkskip?: string;
  readonly applied?: string;
  readonly promoted?: string;
  readonly obligated?: string;
  readonly ferr?: string;
  readonly fmsg?: string;
  readonly focus?: string;
}

const DOSSIER_TWIN_KEYS = [
  "disposed",
  "gate",
  "bulk",
  "bsec",
  "bulkdone",
  "bulkskip",
  "applied",
  "promoted",
  "obligated",
  "ferr",
  "fmsg",
  "focus",
] as const;

export const dossierQuery = (slug: string, runId: string, search: DossierTwinSearch = {}) =>
  queryOptions({
    queryKey: [
      "bff",
      "p",
      slug,
      "review",
      runId,
      JSON.stringify(
        DOSSIER_TWIN_KEYS.map((k) => [k, search[k] ?? null] as const).filter(
          ([, v]) => v != null && v !== "",
        ),
      ),
    ],
    queryFn: () => {
      const qs = new URLSearchParams();
      for (const k of DOSSIER_TWIN_KEYS) {
        const v = search[k];
        if (v != null && v !== "") qs.set(k, v);
      }
      const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
      return bffFetch<BffDossierTwin>(
        `/bff/p/${encodeURIComponent(slug)}/review/${encodeURIComponent(runId)}${suffix}`,
      );
    },
    retry: retryPolicy,
  });

/** `GET /bff/p/:slug/obligations/new` — the one-field obligation sheet's composition verbatim:
 *  slug, project title, and the `safeBack`-resolved `back` (the `?back` key's `/p/…` confinement
 *  runs server-side, never client-derived). The create POST is the SAME `/p/:slug/obligations`
 *  document path — the leaf's JSON branch gets `{ok,redirect}` or `{error}` verbatim. */
export interface BffObligationNewTwin {
  readonly obligationNew: {
    readonly slug: string;
    readonly projectTitle: string;
    readonly back: string;
  };
}
export const obligationNewQuery = (slug: string, back?: string) =>
  queryOptions({
    queryKey: ["bff", "p", slug, "obligations", "new", back ?? ""],
    queryFn: () =>
      bffFetch<BffObligationNewTwin>(
        `/bff/p/${encodeURIComponent(slug)}/obligations/new${back ? `?back=${encodeURIComponent(back)}` : ""}`,
      ),
    retry: retryPolicy,
  });

// ---- SPA.22 — the `run-report` surface's twin (REQ-BFF-1/8/9/11, REQ-DAT-4/6, REQ-UX-15;
// design/22 §2 `p.runReport` row + §3's stale-state note). `GET /bff/p/:slug/r/:runId` composes
// the document's `runReportComposition` verbatim — the `?advanced=1` Level-4 read + the Timeline
// pane read + the Inbox read-receipt — plus the `ide` chrome bag with the LIVE feed slice the
// `/p/:slug` reader carries when a live run exists (design/22 §2 note (f)): replayed rows +
// `lastSeq` + the same-origin `/p/:slug/r/:runId/events` URL — so the leaf's `useIdeFeed` binds
// the one EventSource with `?after=`/`Last-Event-ID` resume and the report's run progress +
// spend ticker is a live binding, never a JSON poll. The surface's own write (the §14.4 refund
// POST) and the §6.5 steering verbs keep their document paths — JSON callers get the
// `{ok,redirect}`/`{error}` envelope at the preserved status. ----

/**
 * `GET /bff/p/:slug/r/:runId`'s payload — `runReport` is the SSR `PageData["runReport"]` bag
 * verbatim (`{slug, runId, report}` — `report` is the `RunReportDto` including the optional
 * `advancedView` when `?advanced=1` rode the read); `project`/`paperTheme`/`appTheme`/`ide` are
 * the chrome facts the leaf republishes (`ide.feed` carries the live binding when `activeRun`
 * is non-terminal).
 */
export interface BffRunReportTwin {
  readonly runReport: {
    readonly slug: string;
    readonly runId: string;
    readonly report: RunReportDto;
  };
  readonly project: {
    readonly title: string;
    readonly pill: string;
    readonly slug: string;
  };
  readonly paperTheme: string;
  readonly appTheme?: string;
  readonly ide: BffIdeBag;
}

/** The twin's server-owned search keys — verbatim the document's `c.req.query()` grammar:
 *  `advanced` selects the Level-4 report read; `focus` seeds the chrome's Focus view (read by
 *  `ideContext`, not the composition). */
export interface RunReportTwinSearch {
  readonly advanced?: string;
  readonly focus?: string;
}

const RUN_REPORT_TWIN_KEYS = ["advanced", "focus"] as const;

export const runReportQuery = (slug: string, runId: string, search: RunReportTwinSearch = {}) =>
  queryOptions({
    queryKey: [
      "bff",
      "p",
      slug,
      "r",
      runId,
      JSON.stringify(
        RUN_REPORT_TWIN_KEYS.map((k) => [k, search[k] ?? null] as const).filter(
          ([, v]) => v != null && v !== "",
        ),
      ),
    ],
    queryFn: () => {
      const qs = new URLSearchParams();
      for (const k of RUN_REPORT_TWIN_KEYS) {
        const v = search[k];
        if (v != null && v !== "") qs.set(k, v);
      }
      const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
      return bffFetch<BffRunReportTwin>(
        `/bff/p/${encodeURIComponent(slug)}/r/${encodeURIComponent(runId)}${suffix}`,
      );
    },
    retry: retryPolicy,
  });
