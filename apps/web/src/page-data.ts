import { createContext, useContext } from "react";
import type { ProjectGroupView, ProjectRowView, VoiceGroupView, FeedRow } from "@rhema/ui";
import type { RunSheetView } from "@rhema/run-sheet";
import type {
  ApprovalOverridesDto,
  ApprovalSettingsDto,
  BulkPreviewDto,
  DecisionItemDto,
  EditorDocDto,
  ExportDialogDto,
  GateCardDto,
  ProjectGroupByDto,
  ProjectSearchHitDto,
  ProjectVoiceDto,
  ProtocolCardDto,
  UsageDto,
  VoiceDetailDto,
  VoiceEstimateDto,
  VoiceListRowDto,
  WhatChangedDto,
  TimelineDto,
  RunReportDto,
  VersionRailDto,
  VersionDiffDto,
  RestorePointDto,
  FilesDto,
} from "@rhema/api-client";
import type { DossierData } from "./data.js";

// Per-request data the SSR route handler resolves (project list, login form state, the resolved project) and
// hands to the page tree through React context. Pages read it with `usePageData()`.

export interface PageData {
  readonly projects?: readonly ProjectRowView[];
  /**
   * P1.04 — the §5.2 workspace home (`/app`): the attention groups (or the voice grouping when the
   * user's pref says so), the Voice filter chips, the search box + its hits, and the archived affordance.
   */
  readonly home?: {
    readonly groupBy: ProjectGroupByDto;
    readonly attentionGroups: readonly ProjectGroupView[];
    readonly voiceGroups: readonly VoiceGroupView[];
    /** the filter chips' voices (Your voices + House styles upstream). */
    readonly voices: readonly VoiceListRowDto[];
    /** the selected Voice filter — a personaId or 'unfiled'; null ⇒ all. */
    readonly voiceFilter: string | null;
    /** the selected Protocol filter — a protocol id; null ⇒ all (§5.2's protocol organisation). */
    readonly protocolFilter: string | null;
    /** the Protocol filter dropdown's options (the four seeded cards). */
    readonly protocols: readonly ProtocolCardDto[];
    /** the row order — `recent` (default; newest first) or `title` (A–Z within each group). */
    readonly sort: "recent" | "title";
    /** `?archived=1` — archived rows render under the checkbox affordance. */
    readonly showArchived: boolean;
    readonly archivedRows: readonly ProjectRowView[];
    /** `?deleted=1` — the soft-deleted rows render under the restore affordance (30-day window). */
    readonly showDeleted: boolean;
    readonly deletedRows: readonly ProjectRowView[];
    /** set when `?q=` ran — the server-side search hits replace the groups. */
    readonly search?: { readonly q: string; readonly results: readonly ProjectSearchHitDto[] };
  };
  /** P1.04 — the §5.3 new-project sheet's per-request state (entry + picks + preview/pending). */
  readonly newProject?: {
    readonly entry: "scratch" | "outline" | "draft";
    readonly protocols: readonly ProtocolCardDto[];
    readonly voices: readonly VoiceListRowDto[];
    /** the resolved REQ-GENRE-4 default for the submitted Voice pick; null ⇒ the sheet asks once. */
    readonly defaultProtocolId: string | null;
    readonly askProtocol: boolean;
    /** the submitted form values (re-rendered on error/preview). */
    readonly form: {
      readonly title: string;
      readonly protocolId: string | null;
      readonly venue: string | null;
      readonly personaId: string | null;
      readonly startVersion: number | null;
    };
    /** a validation error from the last POST. */
    readonly error?: string;
    /** the conversion is still running — the page meta-refreshes on this quarantine key. */
    readonly pending?: { readonly quarantineKey: string; readonly sourceLabel: string };
    /** the ready conversion preview (source/converted/warnings/counts + the key to replay). */
    readonly preview?: {
      readonly quarantineKey: string;
      readonly sourceLabel: string;
      readonly sourceText: string;
      readonly convertedMarkdown: string;
      readonly countLine: string;
      readonly warnings: readonly { readonly message: string; readonly blockId?: string | null }[];
    };
  };
  readonly login?: {
    readonly error?: string;
    readonly sent?: boolean;
    readonly code?: string;
    readonly email?: string;
    /** PRB.13 — `signup.mode === "open"`: the code field is optional and the copy shifts to self-serve. */
    readonly signupOpen?: boolean;
  };
  /** PRB.13 — the public invite/landing page's mode flag (the access note + sign-in CTA copy). */
  readonly invite?: {
    readonly signupOpen?: boolean;
  };
  readonly project?: {
    readonly title: string;
    readonly pill: string;
    readonly slug: string;
    /** the highest-n draft head — the "Edit source" link's target (PRB.07). */
    readonly headDraftId?: string | null;
    /** P1.04 — `?rename=1` renders the row-action's inline title form. */
    readonly rename?: boolean;
    /**
     * P1.04 — the create landing (`?created=<entry>`): the §5.3 next-step card renders at the top —
     * scratch → the Chat note, outline → Draft v1, draft → Review vN. `notes` carries the conversion's
     * warning/unconverted counts for the Conversion-notes line.
     */
    readonly created?: {
      readonly entry: "scratch" | "outline" | "draft";
      readonly draftN?: number | null;
      readonly notes?: { readonly warnings: number; readonly unconverted: number };
    };
  };
  /**
   * P1.01 — theme stamping (REQ-IDE-38 amended): the account's stored app-theme pref (dark|light|auto),
   * emitted as `data-app-theme` so the pre-paint boot script resolves it; the per-project paper policy is
   * `paperTheme` (emitted as `data-paper`). `ide` marks the document as an IDE surface — it carries the
   * §5.1 stylesheet + the ide.js island and feeds the shell's per-user×project pane key + endpoints.
   */
  readonly theme?: { readonly pref?: "dark" | "light" | "auto" };
  readonly paperTheme?: "light" | "follow" | "dark";
  readonly ide?: {
    readonly userId?: string;
    readonly projectId?: string;
    /** ?focus=1 — the ONE shareable pane flag (applied, then stripped from the address bar). */
    readonly initialView?: "write" | "read" | "focus";
    /** the Advanced-tier source file row's link (PRB.07 editor). */
    readonly sourceHref?: string;
    /** a non-terminal run — the Desk auto-opens on its Live feed (§5.1). */
    readonly activeRun?: { readonly runId: string; readonly state: string } | null;
    /** the Inbox badge = open gates + open decisions for the project. */
    readonly inboxCount?: number;
    /** the Margin's findings (absent ⇒ the region hides — §5.1). */
    readonly findings?: readonly { id: string; severity: string; kind: string; excerpt: string }[];
    /** the Timeline's run rows. */
    readonly timeline?: readonly { id: string; label: string; state: string; href?: string }[];
    /**
     * P1.05 — the structured Timeline pane read (GET /projects/:id/timeline): rounds, run cards, the
     * next-step card. Supersedes the flat `timeline` rows when present (§5.5).
     */
    readonly timelineView?: TimelineDto;
    /**
     * P1.05 — the Desk's Live feed tab data (§5.5; REQ-IDE-14): the replayed rows at `density` plus the
     * same-origin events URL the island tails.
     */
    readonly feed?: {
      readonly runId: string;
      readonly eventsUrl: string;
      readonly density: "summary" | "details" | "verbose";
      readonly rows: readonly FeedRow[];
      /** the highest replayed seq — the island's EventSource resumes at `?after=<lastSeq>`. */
      readonly lastSeq?: number;
    };
    /** the ⌘⇧R "run next step" target (the run sheet for the next-step verb). */
    readonly runNextHref?: string;
    /**
     * P1.06 (§5.12) — the ⌘K palette's embedded `PaletteData` JSON (@rhema/ide) + the same-origin
     * palette search URL the island calls for free-text hits. Every palette row navigates or opens the
     * run sheet's GET — the palette never launches a run.
     */
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
    /** P1.08 — the §5.13 Files pane's typed sections (GET /projects/:id/files; best-effort — absent ⇒
     *  the pane shows its empty state). */
    readonly files?: FilesDto;
  };
  readonly conversion?:
    | {
        readonly projectSlug: string;
        readonly sourceLabel: string;
        readonly sourceText: string;
        readonly convertedMarkdown: string;
        readonly countLine: string;
        readonly warnings: readonly { readonly message: string; readonly blockId?: string | null }[];
        /** PRB.20 — the minted quarantine key; the create form replays it in the hidden `qk` field. */
        readonly quarantineKey?: string;
        readonly created?: boolean;
        readonly pending?: false;
      }
    | {
        // PRB.21 — the converting state: a cold Job is still running; the page carries a meta-refresh
        // (autoRefresh) that re-polls the preview GET on this quarantine key until it's ready.
        readonly projectSlug: string;
        readonly sourceLabel: string;
        readonly pending: true;
        readonly quarantineKey: string;
        readonly created?: boolean;
      };
  readonly runSheet?: {
    readonly slug: string;
    readonly projectTitle: string;
    readonly view: RunSheetView;
    /** set after a successful Run click — the run started (§5.6 item 10). */
    readonly started?: boolean;
    /** a blocking notice (e.g. insufficient balance — §14.6) shown in place of the started confirmation. */
    readonly notice?: string;
    /**
     * PRB.21 / D-PRB.20-1 — the project's non-terminal run. Set ⇒ the sheet renders the in-progress
     * state (a link to the run's surface) INSTEAD of the Run affordance; the api's create 409 maps here.
     */
    readonly activeRun?: { readonly runId: string; readonly state: string } | null;
  };
  /** the delivered-review dossier the reading surfaces render (PRB.04). */
  readonly dossier?: DossierData;
  /**
   * P1.07 — the dossier's findings-surface view state (§5.7): the shared filters echoed from the GET
   * params, triage mode (`?triage=1`), the one consolidated bulk preview (`?bulk=<action>`), a dispatch
   * result line, and the notice a bounced Apply/promote/obligations POST re-renders with.
   */
  readonly dossierView?: {
    readonly filters: Record<string, string | undefined>;
    readonly triage: boolean;
    readonly bulk?: { readonly action: string; readonly section?: string; readonly preview: BulkPreviewDto };
    readonly bulkDone?: { readonly count: number; readonly skipped: number };
    readonly notice?: { readonly kind: "applied" | "promoted" | "obligated" | "error"; readonly findingId: string; readonly message?: string };
  };
  /** PRB.05 — per-request shell state for the triage surfaces. */
  readonly triage?: {
    /** a disposition-validation error from the last POST (re-rendered under the finding card). */
    readonly dispositionError?: { readonly findingId: string; readonly message: string };
    /** a saved marker ("Saved") under the card the last POST wrote. */
    readonly savedFindingId?: string;
  };
  /** PRB.05 — the Needs-you surface feed: open gate cards for the project's runs. */
  readonly gates?: readonly GateCardDto[];
  /** PRB.05 — the Decisions list (open decision_requests). */
  readonly decisions?: readonly DecisionItemDto[];
  /** PRB.05 — pre-triage facts for the Revise sheet ("you pre-triaged N of M"). */
  readonly pretriage?: { readonly triaged: number; readonly total: number };
  /** PRB.05 — the project's approval-deadline overrides (§6.4 R3; approve_triage 24-h opt-in). */
  readonly approvalOverrides?: ApprovalOverridesDto;
  /**
   * P1.09 — the full approval-settings read (`GET /projects/:id/settings/approvals`): the policy, the
   * per-kind override grid (with the R3 defaults it annotates), and standing guidance. Absent ⇒ the
   * project page falls back to the PRB.05 opt-in form.
   */
  readonly approvalSettings?: ApprovalSettingsDto;
  /**
   * P1.09 — the user's dismissed one-time inline explainers (§5.11/§6.4). The first Approval card
   * mounts the explainer when `"approvals"` is absent here.
   */
  readonly explainersDismissed?: readonly string[];
  /** PRB.06 — the What-changed read for a delivered response (the revision page; §5.8). */
  readonly revision?: { readonly slug: string; readonly data: WhatChangedDto; readonly commentedHunkId?: string };
  /** PRB.07 — the source editor (§5.4/§6.3): the doc + lock + projected rail the SSR page renders. */
  readonly editor?: {
    readonly slug: string;
    readonly projectId: string;
    readonly doc: EditorDocDto;
    /** a note POST redirected back with this set — the "Noted" marker renders. */
    readonly noteSaved?: boolean;
  };
  /** P1.02 — the Page (the schema-first editor surface): the api doc read + the PM doc JSON the island
   *  mounts (built server-side so SSR and the client see the SAME nodes). */
  readonly page?: {
    readonly slug: string;
    readonly projectId: string;
    readonly doc: EditorDocDto;
    /** `markdownToDoc(doc.markdown).toJSON()` — embedded as `data-page-doc` for the island. */
    readonly docJson: unknown;
    /** a note POST redirected back with this set — the "Noted" marker renders. */
    readonly noteSaved?: boolean;
    /** the finding to focus (a /f/:findingId deep link landed here). */
    readonly focusFindingId?: string;
    /** non-draft artifact reads (/a/:artifactId) — the Page renders them read-only (P1.02 item 4). */
    readonly readOnly?: boolean;
    /** P1.03 — the collab WSS base the island connects to (`wss://<host>/collab`; env COLLAB_WS_URL). */
    readonly collabWsUrl?: string;
    /**
     * P1.08 — the §5.8 version rail over the Page (REQ-IDE-32): the chips' read model, the
     * restore-point dropdown for this draft's live doc, the `?restore=<id>` preview card, and the
     * `?restored=<n>` notice. Absent ⇒ the rail hides.
     */
    readonly rail?: {
      readonly data: VersionRailDto;
      readonly currentN: number;
      readonly points: readonly RestorePointDto[];
      readonly preview?: { readonly point: RestorePointDto; readonly view: WhatChangedDto["view"] };
      readonly restoredN?: number;
    };
  };
  /**
   * P1.08 — the §5.8 compare page (`/p/:project/v/:n/diff/:m`; REQ-IDE-33): the server-projected
   * pair + the picked layout. `commentedHunkId` echoes a saved hunk comment (→ Guidance).
   */
  readonly compare?: {
    readonly slug: string;
    readonly n: string;
    readonly m: string;
    readonly layout: "side" | "inline" | "moves";
    readonly data: VersionDiffDto;
    readonly commentedHunkId?: string;
  };
  // ---- PRB.10 — Quick Voice (§9.2–§9.6) ----
  /** the library list (GET /voices): every persona + its shared pill + sample count. */
  readonly voices?: readonly VoiceListRowDto[];
  /** the §9.2 creation sheet's per-request state (a validation error re-renders with the error). */
  readonly voiceNew?: { readonly error?: string };
  /** P1.07 — the palette's free-form obligation form (REQ-OBJ-10): `back` is where POST/Cancel returns. */
  readonly obligationNew?: {
    readonly slug: string;
    readonly projectTitle: string;
    readonly back: string;
    readonly error?: string;
  };
  /** the voice detail page's full read + any post-action notice. */
  readonly voice?: {
    readonly detail: VoiceDetailDto;
    readonly estimate?: VoiceEstimateDto;
    readonly notice?: string;
  };
  /** the project's voice picker facts (the linked voice + the selectable personas; §9.6). */
  readonly projectVoice?: {
    readonly current: ProjectVoiceDto;
    readonly options: readonly VoiceListRowDto[];
  };
  /** PRB.11 — the export dialog (§13.4, §8.4): the format list, the never-blocking obligation line +
   *  linkable items (incl. `pre_export` horizons just returned to open), and the statement preview. */
  readonly export?: {
    readonly slug: string;
    readonly projectId: string;
    readonly dialog: ExportDialogDto;
    /** a bounced export POST re-renders with this error. */
    readonly error?: string;
    /** a sentence just appended to the statement. */
    readonly added?: boolean;
  };
  /** §10.1 — the phone-width input set (UA-sniffed at SSR; the same components render narrower). */
  readonly compact?: boolean;
  // ---- PRB.12 — beta analytics chrome ----
  /** the §14.5 level-0 balance chip's data (spendable + held-on-hover); the authed shells render it in nav. */
  readonly balance?: { readonly spendableCredits: number; readonly heldCredits: number };
  /** the settings page's privacy toggle (REQ-PROD-15 — binds "user".analytics_opt_out). */
  readonly privacy?: { readonly analyticsOptOut: boolean; readonly saved?: boolean };
  /** the level-1 usage glance (balance + recent runs' spend). */
  readonly usage?: UsageDto;
  /** P1.05 — the run report page (`/p/:project/r/:run`; §14.5 Level 3 + the Advanced Level-4 read). */
  readonly runReport?: {
    readonly slug: string;
    readonly runId: string;
    readonly report: RunReportDto;
  };
  /** the page's dwell-heartbeat surface label — set ⇒ renderDocument emits the beacon script (REQ-BETA-10). */
  readonly dwellSurface?: string;
  /**
   * PRB.21 — set ⇒ the document emits `<meta http-equiv="refresh" content="<seconds>;url=<url>">` so a
   * pending page re-polls itself without a client bundle (the import preview's converting state).
   */
  readonly autoRefresh?: { readonly seconds: number; readonly url: string };
}

export const PageDataContext = createContext<PageData>({});
export function usePageData(): PageData {
  return useContext(PageDataContext);
}

// ---------------------------------------------------------------------------------------------------------------------
// P1.02 — the Page loader: read the draft doc (exact — the /v/:n view shows THAT draft's bytes; the
// frozen→fork dance is the save path's job) and build its PM doc JSON server-side so the SSR preview
// and the mounted island share the same nodes. `@rhema/editor` is DOM-free for this path (md→PM uses
// prosemirror-model only).
// ---------------------------------------------------------------------------------------------------------------------

import { markdownToDoc } from "@rhema/editor";
import type { DataSource, SessionHeaders } from "./data.js";

export async function loadEditorPage(
  dataSource: DataSource,
  session: SessionHeaders,
  projectId: string,
  draftId: string,
): Promise<{ doc: EditorDocDto; docJson: unknown }> {
  const doc = await dataSource.getEditorDoc(session, projectId, draftId, { exact: true });
  return { doc, docJson: docJsonFor(doc) };
}

/** The PM doc JSON for an already-fetched doc read (the artifact page + the draft path share it). */
export function docJsonFor(doc: EditorDocDto): unknown {
  return markdownToDoc(doc.markdown).toJSON();
}
