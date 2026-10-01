import { createContext, useContext } from "react";
import type { ProjectRowView } from "@rhema/ui";
import type { RunSheetView } from "@rhema/run-sheet";
import type {
  ApprovalOverridesDto,
  DecisionItemDto,
  EditorDocDto,
  ExportDialogDto,
  GateCardDto,
  ProjectVoiceDto,
  UsageDto,
  VoiceDetailDto,
  VoiceEstimateDto,
  VoiceListRowDto,
  WhatChangedDto,
} from "@rhema/api-client";
import type { DossierData } from "./data.js";

// Per-request data the SSR route handler resolves (project list, login form state, the resolved project) and
// hands to the page tree through React context. Pages read it with `usePageData()`.

export interface PageData {
  readonly projects?: readonly ProjectRowView[];
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
  };
  // ---- PRB.10 — Quick Voice (§9.2–§9.6) ----
  /** the library list (GET /voices): every persona + its shared pill + sample count. */
  readonly voices?: readonly VoiceListRowDto[];
  /** the §9.2 creation sheet's per-request state (a validation error re-renders with the error). */
  readonly voiceNew?: { readonly error?: string };
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
