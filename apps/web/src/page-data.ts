import { createContext, useContext } from "react";
import type { ProjectRowView } from "@rhema/ui";
import type { RunSheetView } from "@rhema/run-sheet";
import type { ApprovalOverridesDto, DecisionItemDto, GateCardDto, WhatChangedDto } from "@rhema/api-client";
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
  };
  readonly project?: { readonly title: string; readonly pill: string; readonly slug: string };
  readonly conversion?: {
    readonly projectSlug: string;
    readonly sourceLabel: string;
    readonly sourceText: string;
    readonly convertedMarkdown: string;
    readonly countLine: string;
    readonly warnings: readonly { readonly message: string; readonly blockId?: string | null }[];
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
  /** §10.1 — the phone-width input set (UA-sniffed at SSR; the same components render narrower). */
  readonly compact?: boolean;
}

export const PageDataContext = createContext<PageData>({});
export function usePageData(): PageData {
  return useContext(PageDataContext);
}
