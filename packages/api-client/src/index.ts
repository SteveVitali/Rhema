// @rhema/api-client — the typed HTTP client the web + mobile shells call the api through (carries no protocol
// text; REQ-ARCH-33). The DTOs mirror the api's wire shapes; `createApiClient` takes an injectable `fetch` so
// SSR loaders (which forward the viewer's session) and tests bind their own transport.

import type {
  CalibrationStatus,
  Claim,
  ConversionResult,
  CorpusMeasures,
  CslStyle,
  ExportFormat,
  FindingView,
  MdExportProfile,
  ObligationState,
  RunState,
  VoiceMeasureRow,
} from "@rhema/contracts";
import type {
  AccessReportFacts,
  ApproveSampleCard,
  ProfileSection,
  RubricRowInput,
  VoiceFactsPanel,
  VoiceUpdateRoute,
  RunCardInput,
  RunCardView,
  RoundSummaryPart,
  RunReportView,
  RunReportAdvancedView,
  TimelineDraft,
  GateCardWire,
  GateStructuredEdits,
  VoiceUpdateScope,
} from "@rhema/findings-core";

export const PACKAGE_NAME = "@rhema/api-client" as const;

/** The §6.3 state keys (mirrors @rhema/orchestrator ProjectStateKey; kept structural to avoid a heavy dep). */
export type ProjectStateKey =
  | "empty"
  | "researching"
  | "outlined"
  | "draft"
  | "reviewed"
  | "edited_by_you"
  | "accepted"
  | "exported"
  | "archived";

export type ProjectStateOverlay = "running" | "needs_you";

export interface SuggestedNextDto {
  readonly action: string;
  readonly label: string | null;
}

/** The derived §6.3 state the project list renders — pill + one primary action, no stored status. */
export interface ProjectStateDto {
  readonly key: ProjectStateKey;
  readonly pill: string;
  readonly overlay: ProjectStateOverlay | null;
  readonly suggested: SuggestedNextDto;
}

/** P1.04 — the §5.2 attention groups (derived per row by the assembler, never persisted). */
export type ProjectGroupKey = "needs_you" | "running" | "ready_to_read" | "quiet";

export interface ProjectRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly state: ProjectStateDto;
  /** The highest-n draft head — the source editor's entry point (PRB.07). */
  readonly headDraftId?: string | null;
  /** P1.04 — the head draft's ordinal for the row's "vN" version label (null ⇒ no drafts). */
  readonly headDraftN?: number | null;
  /**
   * PRB.21 — the project's ONE non-terminal run when it has one (D-PRB.20-1: at most one — the create
   * route 409s a second). The run sheet renders its in-progress state + links here instead of Run.
   */
  readonly activeRun?: { readonly runId: string; readonly state: string; readonly workflow?: string } | null;
  /** PRB.10 — the linked voice's chip (persona + the shared status pill); null ⇒ ad-hoc (§9.6). */
  readonly voice?: {
    readonly personaId: string;
    readonly name: string | null;
    readonly status: VoiceStatusDto;
    /** P1.04 — the project pins an older profile snapshot (the voice group header's count). */
    readonly usesOlderProfile?: boolean;
  } | null;
  /** P1.01 — the project's paper pin ('light'|'follow'|'dark'; REQ-IDE-38); the IDE SSR stamps it. */
  readonly paperTheme?: "light" | "follow" | "dark";
  /** P1.04 — protocol + venue picks (the row's secondary chips / search facets). */
  readonly protocolId?: string | null;
  readonly venue?: string | null;
  /** P1.04 — archived rows render under the Archived affordance only. */
  readonly archivedAt?: string | null;
  /** P1.04 — set only on `?scope=deleted` reads (the 30-day restore window's rows). */
  readonly deletedAt?: string | null;
  /** P1.04 — the latest run ended failed/cancelled (the row's red indicator). */
  readonly lastRunFailed?: boolean;
  /** P1.04 — the soonest unresolved blocking-gate deadline (Needs-you ordering). */
  readonly needsYouDeadlineAt?: string | null;
  /** P1.04 — the latest review letter has been opened (Ready-to-read clears). */
  readonly letterOpened?: boolean;
  /** P1.04 — the assembled ≤120-char status line (state + phase + counts, deterministic). */
  readonly statusLine?: string;
  /** P1.04 — the row's §5.2 attention group (server-derived). */
  readonly group?: ProjectGroupKey;
  /** P1.17 (§15.4) — the workspace's read-only worked example (the "Worked example" row). */
  readonly showcase?: boolean;
  /** P1.17 — the latest review correspondence's delivering run (the dossier href). */
  readonly latestReviewRunId?: string | null;
}

// ---------------------------------------------------------------------------------------------------------
// P1.04 — the workspace home's writes + reads (§5.2/§5.3): the row actions, the new-project create
// (entry + protocol/venue/Voice picks + the quarantined conversion the workspace-scoped preview
// produced), the server-side search, and the per-user grouping preference.
// ---------------------------------------------------------------------------------------------------------

/** `POST /projects` — the §5.3 three-entry create. */
export interface CreateProjectDto {
  readonly title: string;
  readonly entry: "scratch" | "outline" | "draft";
  readonly protocolId?: string | null;
  readonly venue?: string | null;
  readonly personaId?: string | null;
  /** REQ-PROD-8 — the first draft's version label (a project may start at v3). */
  readonly startVersion?: number;
  /** Upload entries only: the quarantined conversion the workspace preview produced (reused — never
   *  re-uploaded or re-converted). */
  readonly quarantineKey?: string;
}

export interface CreatedProjectDto {
  readonly id: string;
  readonly slug: string;
  readonly draftId?: string | null;
  readonly draftN?: number | null;
  /** set when the quarantined conversion left warnings — the Page's Conversion notes card. */
  readonly conversionNotes?: { warnings: number; unconverted: number } | null;
}

/** The §5.3 protocol card (picker metadata — the full §6.7 body stays server-side). */
export interface ProtocolCardDto {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly holdYouTo: string;
  readonly venueBar: {
    readonly kind: string;
    readonly table: readonly { venue: string; minWords?: number; maxWords?: number }[];
    readonly prompt: string;
  };
  readonly lengthNorms: { readonly unit: string; readonly default?: number; readonly apparatus: string };
  readonly entryDefault: string;
  /** the api-computed typical Review figure for this protocol's card ("Review ≈ N credits"). */
  readonly typicalReviewCredits?: number;
}

/** `GET /projects/search` hit (§5.2's interim search — the ⌘K palette is P1.06's). */
export interface ProjectSearchHitDto {
  readonly projectId: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: "project" | "draft" | "letter";
  readonly snippet: string;
  /** P1.06 — the doc's ref ('' project · draft id · correspondence id) so a palette row deep-links. */
  readonly refId?: string;
}

/** The per-user /app grouping preference ('attention' | 'voice'). */
export type ProjectGroupByDto = "attention" | "voice";

export interface InviteCheckDto {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * PRB.13 — the self-serve/invite signup admission request (REQ-BETA-19 amended 2026-09-16). `code` is
 * required when the deploy runs `signup.mode=invite` and optional when `open` (a supplied code is still
 * validated + consumed — partner cohorts keep redeeming). `method` labels the auth path for telemetry.
 */
export interface SignupRequestDto {
  readonly email: string;
  readonly code?: string;
  readonly method?: string;
  /**
   * P1.17 (§15.3) — the funnel intent the signup carried: `entry` is the chosen first step
   * (a carried file reads `draft`), `src` the acquisition label. Persisted once at creation;
   * `GET /showcase` returns it for the `GET /app` precedence redirect.
   */
  readonly intent?: { readonly entry?: "scratch" | "outline" | "draft"; readonly src?: string; readonly held?: boolean };
}

/**
 * `POST /signup`'s outcome. Expected refusals come back as data (`ok:false` + a stable `error` code:
 * `email_required`, `invite_required`, an invite reject reason, or `rate_limited`), matching
 * `checkInvite`'s `{ok, reason}` shape — only transport failures throw.
 */
export type SignupResultDto =
  | { readonly ok: true; readonly created: boolean }
  | { readonly ok: false; readonly status: number; readonly error: string };

/** The stateless estimate request (REQ-SPEC-16). Mirrors the api's `POST /projects/:id/estimates` body. */
export interface EstimateRequestDto {
  readonly workflow: string;
  readonly rigor: "quick" | "standard" | "full_board";
  readonly modelTier: "base" | "balanced" | "frontier";
  readonly inputs?: Readonly<{ words?: number; claims?: number; findings?: number; movesWithResearch?: number }>;
  readonly variant?: string;
  readonly draftSha?: string;
  readonly refine?: boolean;
  /** P1.06 (§7.2) — the canonical serialized scope (`"section:III"`); part of the estimate cache key. */
  readonly scope?: string;
}

/** The estimate response (REQ-SPEC-16): `{estimate, cap, levers, claimCount?}`. `levers` is the lever matrix. */
export interface EstimateDto {
  readonly estimateCredits: number;
  readonly capCredits: number;
  readonly rateTableVersion: number;
  readonly provisional: boolean;
  readonly claimCount?: number;
  readonly levers: unknown;
}

/** The run-creation body the sheet's Run click POSTs (REQ-CHAT-25 — the only run creator). */
export interface CreateRunDto {
  readonly idempotencyKey: string;
  readonly workflow: string;
  readonly modelProfile: unknown;
  readonly modelTier: "base" | "balanced" | "frontier";
  readonly rigor: "quick" | "standard" | "full_board";
  readonly estimateCredits: number;
  readonly capCredits: number;
  readonly rateTableVersion: number;
  readonly inputs?: Readonly<Record<string, unknown>>;
  /** the frozen input snapshot (REQ-BILL-6): word/claim counts the estimate was computed for. */
  readonly inputSnapshot?: Readonly<Record<string, unknown>>;
  /**
   * PRB.23 — the sheet's resolved Advanced per-phase toggle set (rigor defaults + user
   * overrides). The api freezes it into the run's inputs as manifest `optOutFlag`s and
   * re-derives the estimate from the SAME set, so the priced phase set is the executed one.
   */
  readonly toggles?: Readonly<Record<string, boolean>>;
  readonly draftId?: string;
  /**
   * P1.06 (§7.2; REQ-CHAT-23) — the run's scope in the canonical serialized form (`"section:III"`); the
   * api parses it into `runs.scope` and uses it to discriminate the corr lock (scoped readers parallelize).
   */
  readonly scope?: string;
  /** the sheet's free-text guidance → a run-scope Guidance row (§6.5). */
  readonly guidance?: string;
  /** the sheet's Approvals choice → the project's `approval_policy` (§5.6). */
  readonly approvalPolicy?: "named" | "wait_each" | "run_to_completion";
  /**
   * P1.09 (§5.6; REQ-GATE-3) — the per-run override: "this run only, autonomously" freezes
   * `runs.gates_off` at creation (the same flag "Approve and run autonomously" sets mid-run).
   */
  readonly autoProceedRun?: boolean;
  /** the reader's correspondence kind + variant slot (the corr lock discriminator). */
  readonly corrKind?: string;
  readonly corrK?: number;
  /**
   * P1.13 — the `figure` workflow's facts (§7.5): the verbatim visualize request, the entry point's
   * provenance seeds, and (iterate) the existing figure id. The api mints/verifies the row — a
   * client-invented figureId 404s.
   */
  readonly figure?: FigureRunFactsDto;
}

export interface CreatedRunDto {
  readonly runId: string;
  readonly state: string;
  readonly deduped?: boolean;
}

/**
 * P1.06 (§5.6; REQ-IDE-13) — `GET /projects/:id/run-sheet-context`: the ONE read the sheet's GET
 * consumes — head-draft facts (version, words, sha, derived sections), the project's scope defaults,
 * obligation + standing-note counts, the unused trial entitlement, the consent pref, the project's
 * non-terminal runs, and `blockedBy` (the per-lock conflict under the P1.06 concurrency ruling).
 */
export interface RunSheetContextDto {
  readonly project: {
    readonly protocol: string | null;
    readonly venue: string | null;
    readonly approvalPolicy: string;
  };
  readonly headDraft: {
    readonly id: string;
    readonly n: number;
    readonly state: string;
    readonly words: number | null;
    readonly sha256: string | null;
  } | null;
  readonly sections: readonly { readonly ref: string; readonly title: string; readonly words: number }[];
  readonly openObligations: number;
  readonly reviewScopeLine: string | null;
  readonly reviseScopeLine: string | null;
  readonly standingNotes: number;
  readonly entitlement: {
    readonly id: string;
    readonly kind: string;
    readonly wordCap: number;
    readonly rigor: string;
    readonly modelTier: string;
  } | null;
  readonly dontAskUnder: number;
  readonly activeRuns: readonly { readonly id: string; readonly workflow: string; readonly state: string; readonly scope: unknown }[];
  readonly blockedBy: { readonly runId: string; readonly state: string } | null;
}

// ---------------------------------------------------------------------------------------------------------
// PRB.05 — triage, dispositions, gate cards, Decisions (§5.7/§6.4). The DTOs mirror the api's wire shapes;
// the same contracts serve desktop and phone widths (REQ-SPEC-20).
// ---------------------------------------------------------------------------------------------------------

/** A disposition write (§5.7): the five verbs; rationale required only for rebut/escalate. */
export interface RecordDispositionDto {
  readonly kind: "accept" | "adapt" | "rebut" | "defer" | "escalate";
  readonly rationale?: string;
  /** `adapt` may carry edited suggestion text. */
  readonly adaptedText?: string;
  /** REQ-BETA-6 — optional on every verb. */
  readonly reasonCode?: string;
  /** the free Apply verb flag (REQ-SPEC-6). */
  readonly applied?: boolean;
  /** the defer horizon the obligation parks on ("next_review" default; REQ-OBJ-5 / §11.7). */
  readonly deferHorizon?: "next_review" | "pre_export";
  readonly deferRounds?: number;
}

export interface DispositionDto {
  readonly id: string;
  readonly findingId: string;
  readonly kind: string;
  readonly status: string;
  readonly rationale?: string;
  readonly adaptedText?: string;
  readonly reasonCode?: string;
  readonly moveOrdinal?: number;
  readonly applied?: boolean;
  readonly frozenAt?: string;
}

/** P1.07 — Apply's result (REQ-SPEC-6): the working head the splice landed on + the accept·applied row. */
export interface ApplyResultDto {
  readonly ok: true;
  readonly draftId: string;
  readonly draftN: number;
  readonly versionId: string;
  readonly disposition: DispositionDto;
}

/** P1.07 — the deep-link resolve: finding → its dossier anchor (§5.7). */
export interface FindingResolveDto {
  readonly findingId: string;
  readonly runId: string;
  readonly anchor: string;
}

/** P1.07 — one row of the consolidated bulk preview (§5.7). */
export interface BulkPreviewRowDto {
  readonly findingId: string;
  readonly title: string;
  readonly severity: string;
  readonly disposition: "accept" | "defer";
  readonly obligation: "none" | "revision";
  readonly appliedMarkdown?: string;
}

export interface BulkPreviewDto {
  readonly action: "apply_notes" | "defer_minor" | "accept_section";
  readonly rows: readonly BulkPreviewRowDto[];
  readonly skipped: readonly { readonly findingId: string; readonly title: string; readonly reason: string }[];
  readonly total: number;
}

export interface BulkResultDto {
  readonly ok: true;
  readonly applied: readonly string[];
  readonly skipped: readonly { readonly findingId: string; readonly reason: string }[];
  readonly count: number;
}

/** A Decisions-inbox row (a `decision_requests` open row). */
export interface DecisionItemDto {
  readonly id: string;
  readonly projectId: string | null;
  readonly obligationId: string | null;
  readonly text: string;
  readonly options: string[];
  readonly createdAt: string | null;
}

/** A row of the ledger an approve_triage card presents (finding + current/proposed disposition). */
export interface TriageRowDto {
  readonly findingId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly severity: string;
  readonly disposition?: {
    readonly kind: string;
    readonly rationale?: string;
    /** "user" marks a row the human wrote (REQ-SPEC-9). */
    readonly actor?: string;
  };
}

/**
 * A gate card's facts (§6.4) — what the shared `GateCard` renders. P1.09: the shape is the shared
 * `GateCardWire` (findings-core) so the session gate list AND the Timeline's per-run `gate` carry the
 * identical fields — one card, every surface.
 */
export interface GateCardDto extends GateCardWire {
  readonly remainingEstimateCredits?: number;
  /** approve_triage only — the response-ledger rows the card approves (escalation-pinned). */
  readonly triage?: { readonly rows: TriageRowDto[] };
}

/** A gate decision the card POSTs (§6.4 item 1's five actions + hold). */
export interface GateDecisionDto {
  readonly action:
    | "approve"
    | "approve_autonomous"
    | "keep_planning"
    | "edit"
    | "wait"
    | "stop"
    | "hold";
  /** the Edit-guidance / gate-note text captured with the decision. */
  readonly guidance?: string;
  /** "…and remember this for this project" → a standing guidance rule (REQ-GATE-10). */
  readonly standingRule?: boolean;
  /**
   * P1.09 (§6.4 item 4) — the structured edits the card's `ed.*` fields carried: row edits applied to
   * the artifact's sidecar server-side (→ `edits.rows` → the write-back overlay), labeled `values`
   * recorded on the decision + composed into the edit summary.
   */
  readonly edits?: GateStructuredEdits & { readonly rows?: unknown };
  /** P1.09 — per-run gate-timing overrides riding the resolution (validated like project overrides). */
  readonly overrides?: ApprovalOverridesDto;
}

/** Pre-triage facts for the Revise sheet ("you pre-triaged N of M") + the seeded user ledger rows. */
export interface PretriageDto {
  readonly correspondenceId: string | null;
  readonly triaged: number;
  readonly total: number;
  /** the user-authored ledger rows (actor "user") a Revise run seeds as highest-precedence guidance. */
  readonly entries: unknown[];
}

/** The project's per-kind approval-deadline overrides (§6.4 R3 / REQ-SPEC-1) — e.g. the approve_triage
 *  24-h opt-in (`{ approve_triage: 86400000 }` → proceed_as_proposed). Server-validates with
 *  `approvalOverridesSchema`. */
export type ApprovalOverridesDto = Record<string, number | null>;

// ---- P1.09 — the approval-policy settings surface + standing-guidance management + explainers (§6.4) ----

/** A standing-guidance row as the settings surface lists it (§6.5 — retired, never deleted). */
export interface StandingGuidanceDto {
  readonly id: string;
  readonly body: string;
  readonly workflows: readonly string[];
  readonly active: boolean;
  readonly createdAt: string;
}

/** `GET /projects/:id/settings/approvals` — the policy + per-kind overrides + standing guidance. */
export interface ApprovalSettingsDto {
  /** the project's approval policy — one of the three §6.4 values. */
  readonly policy: "named" | "wait_each" | "run_to_completion";
  /** per-kind deadline overrides (REQ-SPEC-1 — add ≥2 h to wait-default, lengthen/remove otherwise). */
  readonly overrides: ApprovalOverridesDto;
  /** the R3 defaults per kind, for the override grid's baseline column. */
  readonly defaults: readonly {
    readonly kind: string;
    readonly deadlineMs: number | null;
    readonly onExpiry: string;
    /** true = the kind never takes an override (spend/refusal/partial — REQ-SPEC-1). */
    readonly overridable: boolean;
  }[];
  /** active standing guidance (project-scope). */
  readonly standing: readonly StandingGuidanceDto[];
  /** retired standing guidance (audit — retired, never deleted). */
  readonly retired: readonly StandingGuidanceDto[];
}

/** `GET /settings/explainers` — which one-time inline explainers the user has dismissed. */
export interface ExplainersDto {
  readonly dismissed: readonly string[];
}

// ---------------------------------------------------------------------------------------------------------
// PRB.06 — What-changed (§5.8): the server-joined revision read (move cards + Inline hunks + obligation
// discharge lines + the summary strip) and the hunk-comment → Guidance write. Shapes mirror
// @rhema/findings-core's WhatChangedView (kept structural to avoid a heavy dep).
// ---------------------------------------------------------------------------------------------------------

/** One changed block inside a hunk (a heading or blank-line-separated run of canonical markdown). */
export interface DiffBlockDto {
  readonly blockId: string;
  readonly text: string;
  readonly index: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

/** A contiguous run of changed blocks between two unchanged anchors. */
export interface DiffHunkDto {
  readonly id: string;
  readonly kind: "edited" | "added" | "removed" | "mixed";
  readonly before: DiffBlockDto[];
  readonly after: DiffBlockDto[];
  readonly charsChanged: number;
}

/** An obligation discharge line on a move card ("discharges OBL-3 (F-07, carried from v2) — verified by
 *  gap check"). */
export interface ObligationLineDto {
  readonly obligationId: string;
  readonly label: string;
  readonly lineage?: string;
  readonly verifiedBy?: "gap_check" | "re_review" | "user";
  readonly state: string;
}

/** A move card: the ledger move + its answered findings + its discharge lines + its joined hunks. */
export interface MoveCardDto {
  readonly moveOrdinal: number;
  readonly moveId: string;
  readonly title: string;
  readonly type?: string;
  readonly findings: {
    readonly findingOrdinal: number;
    readonly findingId?: string;
    readonly title?: string;
    readonly severity?: string;
    readonly kind: string;
    readonly rationale?: string;
  }[];
  readonly dischargeLines: ObligationLineDto[];
  readonly hunks: DiffHunkDto[];
}

/** A rebutted finding card — rationale shown, NO hunk (§5.8). */
export interface RebuttedCardDto {
  readonly findingOrdinal: number;
  readonly findingId?: string;
  readonly title?: string;
  readonly severity?: string;
  readonly rationale: string;
}

/** The summary strip counts + the move/hunk tallies ("7 obligations addressed · 1 rebutted · 2 still open"). */
export interface WhatChangedStripDto {
  readonly addressed: number;
  readonly rebutted: number;
  readonly stillOpen: number;
  readonly moves: number;
  readonly hunks: number;
}

/** The full What-changed payload the revision page renders (GET …/what-changed). */
export interface WhatChangedDto {
  readonly ok: true;
  readonly responseId: string;
  readonly reviewId: string | null;
  readonly beforeN: number;
  readonly afterN: number | null;
  readonly view: {
    readonly strip: WhatChangedStripDto;
    readonly moves: MoveCardDto[];
    readonly unlinked: { readonly hunks: DiffHunkDto[]; readonly entries: unknown[] };
    readonly rebutted: RebuttedCardDto[];
  };
}

/** A hunk comment → the `Guidance` row the next Revise consumes (§6.5). */
export interface HunkCommentDto {
  readonly guidanceId: string;
  readonly hunkId: string;
}

// ---------------------------------------------------------------------------------------------------------
// P1.08 — the generalized compare (§5.8): `/v/:n/diff/:m` over ANY draft pair, the version rail, the
// restore-point browse/preview/apply, and the §5.13 Files pane read models.
// ---------------------------------------------------------------------------------------------------------

/** Draft meta on a compare pair endpoint (both sides carry it). */
export interface VersionDraftMetaDto {
  readonly draftId: string;
  readonly n: number;
  readonly origin: string;
  readonly state: string;
  readonly frozenAt: string | null;
  readonly createdAt: string;
  readonly claimsPendingVerification: boolean;
}

/** The full block diff (the side-by-side layout's data). */
export interface BlockDiffDto {
  readonly hunks: DiffHunkDto[];
  readonly unchanged: number;
  readonly beforeBlocks: DiffBlockDto[];
  readonly afterBlocks: DiffBlockDto[];
}

/** GET /projects/:id/v/:n/diff/:m — the pair + the joined (or all-Unlinked) What-changed view. */
export interface VersionDiffDto {
  readonly ok: true;
  /** the response correspondence this pair answers, when one links the drafts — else null. */
  readonly responseId: string | null;
  readonly reviewId: string | null;
  readonly before: VersionDraftMetaDto;
  readonly after: VersionDraftMetaDto;
  readonly diff: BlockDiffDto;
  readonly view: WhatChangedDto["view"];
}

/** GET /projects/:id/versions — the version rail read model (§5.8). */
export interface VersionRailDto {
  readonly workingN: number | null;
  /** the project-level ⚑ chip — blocking/major obligations only (REQ-OBJ-6). */
  readonly chip: { readonly open: number; readonly addressed: number };
  readonly outline: { readonly artifactId: string; readonly createdAt: string | null; readonly words: number | null } | null;
  readonly drafts: readonly {
    readonly draftId: string;
    readonly n: number;
    readonly origin: string;
    readonly state: string;
    readonly frozen: boolean;
    readonly frozenAt: string | null;
    readonly createdAt: string;
    readonly words: number | null;
    readonly reviewed: boolean;
    readonly answered: boolean;
    readonly claimsPendingVerification: boolean;
    readonly obligations: { readonly open: number; readonly addressed: number };
  }[];
}

/** One Files-pane row (§5.13) — SE/SR/I only; H kinds arrive as a section's `sealedCount`. */
export interface FileRowDto {
  readonly artifactId: string;
  readonly kind: string;
  readonly label: string;
  readonly level: "SE" | "SR" | "I";
  readonly editMode: string;
  readonly lock: "editable" | "immutable" | "inspect";
  readonly readOnly: boolean;
  readonly words: number | null;
  readonly createdAt: string | null;
  readonly provenance: {
    readonly actor: "you" | "system" | "agent";
    readonly userId?: string;
    readonly seat?: string;
    readonly runId?: string;
    readonly workflow?: string;
    readonly phase?: string;
  };
  readonly draftRef?: { readonly n: number; readonly state: string };
  readonly freshness?: { readonly subjectDraftN: number; readonly stale: boolean };
}

/** A §5.13 typed section: `rows` are the default tree (SE/SR), `advancedRows` the I-level links
 *  behind the disclosure, `sealedCount` the H-kind count (never rows). */
export interface FileSectionDto {
  readonly key: string;
  readonly rows: FileRowDto[];
  readonly advancedRows: FileRowDto[];
  readonly sealedCount: number;
}

/** GET /projects/:id/files — the Files pane. */
export interface FilesDto {
  readonly sections: FileSectionDto[];
}

/** A restore point in the §5.8 grouped dropdown. */
export interface RestorePointDto {
  readonly id: string;
  readonly kind: string;
  readonly cause: string;
  readonly label: string | null;
  readonly createdAt: string;
  readonly group: "named" | "earlier_today" | "yesterday" | "before_review" | "earlier";
  readonly beforeReviewN?: number;
  /** older-than-today ⇒ sits behind the Advanced disclosure. */
  readonly advanced: boolean;
}

/** GET …/restore-points — the grouped list for the working head's live doc. */
export interface RestorePointsDto {
  readonly draftId: string;
  readonly liveDocId: string | null;
  readonly points: RestorePointDto[];
}

/** GET …/restore-points/:rp/preview — the point's content diffed against the current head. */
export interface RestorePreviewDto {
  readonly ok: true;
  readonly point: {
    readonly id: string;
    readonly kind: string;
    readonly cause: string;
    readonly label: string | null;
    readonly createdAt: string;
  };
  readonly view: WhatChangedDto["view"];
}

/** POST …/restore-points/:rp/restore — the undoable apply (undoPointId = the pre-restore snapshot). */
export interface RestoreApplyDto {
  readonly ok: true;
  readonly draftId: string;
  readonly draftN: number;
  readonly forked: boolean;
  readonly restorePointId: string | null;
  readonly undoPointId: string | null;
  readonly restoredFrom: string;
}

// ---------------------------------------------------------------------------------------------------------
// PRB.16 — the delivered-review dossier read (PRB.04's deferred live binding): `GET …/review/:runId/dossier`
// assembles the reading surface's data from the delivered rows — never a client-side reconstruction.
// ---------------------------------------------------------------------------------------------------------

/** A passage reference in the letter that resolves to a finding card (§5.7). */
export interface DossierLetterFindingRefDto {
  readonly findingId: string;
  readonly label: string;
}

/** One `## ` section of the delivered editors-letter (structural mirror of @rhema/ui's LetterSection). */
export interface DossierLetterSectionDto {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly findingRefs?: readonly DossierLetterFindingRefDto[];
}

/** The full dossier payload: rows → the reading surfaces' models (REQ-SPEC-10 — server-side facts only). */
export interface DossierDto {
  readonly slug: string;
  readonly runId: string;
  readonly projectTitle: string;
  readonly versionLabel: string;
  /** P1.07 — the run's rigor drives the §5.7 severity budget (Quick's 40-finding rendered cap). */
  readonly rigor: string;
  /** P1.07 — the reviewed draft the Apply path splices (its working head when forked). */
  readonly reviewedDraftId: string;
  /** P1.06 (§7.2) — a scoped run's scope as chip labels ("§III"); absent on whole-draft runs. */
  readonly scopeLabels?: readonly string[];
  readonly openObligations: number;
  readonly addressedObligations: number;
  readonly runCard: RunCardInput;
  readonly letterTitle: string;
  readonly letterSections: readonly DossierLetterSectionDto[];
  readonly claims: readonly Claim[];
  /** normalized URLs the proxy request log confirms fetched (the cited⇒fetched source — §12.7). */
  readonly fetchLog: readonly string[];
  readonly findings: readonly FindingView[];
  readonly rubric: readonly RubricRowInput[];
  /** the prior round's rubric when this dossier is a re-review (REQ-IDE-30). */
  readonly priorRubric?: readonly RubricRowInput[];
  /** the §12.6 facts the trust chip derives from (REQ-PROD-2). */
  readonly accessReport: AccessReportFacts;
  /** finding id → the obligation's current state — the per-finding state chip (REQ-OBJ-6). */
  readonly findingObligations: Readonly<Record<string, ObligationState>>;
}

// ---------------------------------------------------------------------------------------------------------
// PRB.07 — the source editor (§5.4/§6.3; REQ-BETA-21, REQ-DATA-24/26/41). The CodeMirror stopgap's wire
// shapes: document + run lock + projected findings rail; the debounced autosave; the note→Guidance field;
// Cancel-run; and "Revise using your edits" (REQ-DATA-26). There is no Save button — `saveEditorDraft` is
// the debounced autosave POST.
// ---------------------------------------------------------------------------------------------------------

/** The §6.3 run lock the editor's read-only banner renders (null ⇒ editable). */
export interface EditorLockDto {
  readonly runId: string;
  readonly kind: "writer" | "reader";
  readonly workflow: string;
}

/** A finding projected onto the edited head — the rail's "from Review of vN" card. */
export interface EditorFindingDto {
  readonly findingId: string;
  readonly title: string;
  readonly severity: string;
  /** P1.07 — the kind hue + the suggestion the "suggestions inline" toggle previews (§5.7). */
  readonly kind?: string;
  readonly suggestion?: { replacement: string } | null;
  /** e.g. "from Review of v2" — the finding is a projection of the source review, not a re-file. */
  readonly sourceLabel: string;
  readonly anchor: unknown;
  readonly method: "exact" | "normalized" | "fuzzy" | "unresolved" | "unanchored";
  /** true ⇒ "passage changed — still applies?" under Whole piece (a moot candidate at triage). */
  readonly lost: boolean;
}

/** The editor document read (GET …/editor/:draftId). */
export interface EditorDocDto {
  readonly draftId: string;
  readonly draftN: number;
  readonly origin: string;
  readonly state: string;
  readonly baseDraftId: string | null;
  readonly baseDraftN: number | null;
  readonly markdown: string;
  readonly sha256: string | null;
  readonly lock: EditorLockDto | null;
  readonly findings: EditorFindingDto[];
  // ---- P1.02 — the Page's sidecar reads (all absent on older servers; the client degrades) ----
  /** the displayed version's block-level provenance (`{blockId → ProvenanceSource}` — the overlay + the
   *  provenance plugin's init state). */
  readonly provenance?: Record<string, unknown> | null;
  /** the displayed version's stored block-id sidecar `{blockId → {ordinal, contentHash}}`. */
  readonly blockIdMap?: Record<string, { ordinal: number; contentHash: string }> | null;
  /** the project's CSL-JSON bibliography items (cite resolution + dangling-key rendering). */
  readonly bibliography?: { citeKey: string; item: Record<string, unknown> }[];
  /** the REQ-PROD-14 venue-cap meter, already rendered (e.g. "+212 over WaPo"); null when no venue. */
  readonly venueCap?: string | null;
  /** the word count + reading-time meters, server-computed for SSR parity. */
  readonly meters?: { words: number; readMin: number };
  /** proposal cards queued for the Page (agent-origin in-place changes; empty until a producer lands). */
  readonly proposals?: {
    id: string;
    kind: "replace" | "insert";
    from: number;
    to: number;
    markdown: string;
    origin: string;
    label?: string;
  }[];
}

/** `?exact=1` — read THIS draft's bytes (a frozen vN stays vN); the default follows a frozen head to
 *  its working human_revision child (the edit-path semantics PRB.07 established). */
export interface EditorDocOptions {
  readonly exact?: boolean;
}

/** The draft-ref resolution for `/v/:n` + `/v/working` routing (P1.02). */
export interface EditorResolveDto {
  readonly draftId: string;
  readonly draftN: number;
  readonly state: string;
  readonly origin: string;
}

/** A CSL-JSON item as stored for the project (P1.02; matrix row 37). */
export interface BibliographyDto {
  readonly items: { citeKey: string; item: Record<string, unknown> }[];
}

/** The bibliography import result (POST …/bibliography). */
export interface BibliographyImportDto {
  readonly imported: number;
  readonly format: string;
  readonly items: { citeKey: string; item: Record<string, unknown> }[];
}

/** The autosave response — `forked` marks the first save on a frozen head (v(N+1) created). */
export interface EditorSaveDto {
  readonly draftId: string;
  readonly draftN: number;
  readonly versionId: string;
  readonly sha256: string;
  readonly forked: boolean;
  readonly changed: boolean;
  readonly restorePointId: string | null;
  readonly sync: "synced";
}

/** The note field → a `Guidance` row (§6.3's comment path; REQ-DATA-41's beta form). */
export interface EditorNoteDto {
  readonly guidanceId: string;
}

/** The Cancel-run release (§6.3). */
export interface EditorCancelRunDto {
  readonly ok: true;
  readonly state: string;
  readonly alreadyTerminal: boolean;
}

/** "Revise using your edits" (REQ-DATA-26): the run id + the auto-mooted findings awaiting triage. */
export interface EditorReviseDto {
  readonly runId: string;
  readonly state: string;
  readonly deduped?: boolean;
  readonly mootedFindingIds: string[];
}

// ---------------------------------------------------------------------------------------------------------
// PRB.08 — beta billing (REQ-BETA-14/15; §14.6). The spendable-balance read the run sheet's paywall box and
// the exhaustion prompt's telemetry write; the Payment Link URL arrives from deploy config on the balance.
// ---------------------------------------------------------------------------------------------------------

/** GET /billing/balance — the account's spendable credits + suspension + the beta Payment Link. */
export interface BillingBalanceDto {
  readonly spendableCredits: number;
  /** PRB.12 — credits held against in-flight runs (the §14.5 level-0 chip's hover line). */
  readonly heldCredits?: number;
  readonly suspended: boolean;
  readonly clawbackDebt: number;
  readonly paymentLinkUrl?: string;
  /** PRB.19 (F32) — the authenticated account's id; the web composes `client_reference_id` onto the
   *  Payment-Link redirect from it so a Stripe-originated checkout joins this account. */
  readonly billingAccountId?: string;
}

// ---------------------------------------------------------------------------------------------------------
// PRB.12 — beta analytics (REQ-PROD-15/16; design/9 §7.2). The client mint accepts ONLY the whitelisted
// view/dwell/timer events (`CLIENT_ANALYTICS_EVENTS` in @rhema/contracts); server-owned facts are never
// client-forgeable.
// ---------------------------------------------------------------------------------------------------------

/** POST /analytics/events — a client-whitelisted event mint (view/dwell/timer signals). */
export interface AnalyticsEventRequestDto {
  readonly event: string;
  readonly props?: Record<string, unknown>;
  readonly projectId?: string;
  readonly runId?: string;
  /** retry-safe mint: a heartbeat/beacon can name its key so a replayed POST lands once. */
  readonly dedupeKey?: string;
}

// ---------------------------------------------------------------------------------------------------------
// P1.17 — the acquisition funnel (§15.3/§15.4; §3.5 events). `GET /showcase` is the precedence read the
// `GET /app` redirect consumes (the workspace's Showcase entry + the signup intent it carried);
// `POST /analytics/acquisition` is the session-authed funnel mint; `POST /analytics/landing` is the
// pre-auth channel (acquisition_events — no session, no PII, the IP hashes server-side).
// ---------------------------------------------------------------------------------------------------------

/** `GET /showcase` — the workspace's Showcase entry + the recorded signup intent. */
export interface ShowcaseEntryDto {
  readonly showcase: {
    readonly slug: string;
    readonly projectId: string;
    readonly reviewRunId: string;
    readonly firstFindingId: string | null;
    /** the letter has been opened at least once — the precedence redirect's "already seen" flag. */
    readonly opened: boolean;
    readonly archived: boolean;
  } | null;
  /** the intent POST /signup recorded (`user.signup_intent`; null ⇒ none carried). `held` marks a
   *  device-local drop-zone hold the /app redirect must route to the claim form — a flag, never bytes. */
  readonly intent: { readonly entry?: "scratch" | "outline" | "draft"; readonly src?: string; readonly held?: boolean } | null;
}

/** POST /analytics/acquisition — the §3.5 funnel mint (session-bound identity). */
export type AcquisitionEventRequestDto = AnalyticsEventRequestDto;

/** POST /analytics/landing — the pre-auth landing/drop-zone beacon. */
export interface LandingEventRequestDto {
  readonly event: "landing.viewed" | "landing.dropzone_used";
  readonly props?: Record<string, unknown>;
  /** the drop-zone hold token (localStorage key suffix — the claim lands post-auth). */
  readonly token?: string;
}

/** GET/POST /settings/privacy — the account's analytics opt-out flag. */
export interface PrivacySettingsDto {
  readonly analyticsOptOut: boolean;
}

/**
 * P1.01 — GET/PUT /settings/theme (the app theme) and PUT /projects/:id/paper-theme (the per-project
 * paper pin; REQ-IDE-38 amended). `appTheme`: 'dark' | 'light' | 'auto'. `paperTheme`:
 * 'light' | 'follow' | 'dark' — pinned-light is the default (the warm sheet inside the dark shell).
 */
export interface ThemeSettingsDto {
  readonly appTheme: "dark" | "light" | "auto";
}
export interface PaperThemeDto {
  readonly paperTheme: "light" | "follow" | "dark";
}
/** GET /session — the resolved principal (mirrors apps/api's Principal shape). */
export interface PrincipalDto {
  readonly userId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
}

/** GET /billing/usage — the level-1 usage glance: balance + the account's recent runs' spend. */
export interface UsageRunDto {
  readonly runId: string;
  readonly projectId: string | null;
  readonly workflow: string;
  readonly state: string;
  readonly estimateCredits: number;
  readonly capCredits: number;
  readonly spentCredits: number;
  readonly createdAt: string;
  readonly endedAt: string | null;
}
export interface UsageDto {
  readonly spendableCredits: number;
  readonly heldCredits: number;
  readonly runs: readonly UsageRunDto[];
}

// ---------------------------------------------------------------------------------------------------------
// P1.16 — billing, full (§14.2/14.3/14.5/14.6). The plan ladder, checkout/portal, subscription reads,
// auto-reload, the trial card, and the usage dashboard read models — all server-computed.
// ---------------------------------------------------------------------------------------------------------

/** One plan-tier card's wire shape (GET /billing/plans → plans[<tier>]). */
export interface BillingPlanDto {
  readonly display: string;
  readonly monthlyUsd: number;
  readonly annualMonthlyUsd: number;
  readonly includedCreditsMonthly: number;
  readonly dailyChatCredits: number | null;
  readonly concurrency: number;
  readonly modelTiers: readonly string[];
  readonly chatOnly: boolean;
  readonly researchTools: boolean;
  readonly runWordCap: number | null;
  readonly topUps: boolean;
  readonly projects: number | "unlimited";
  readonly voices: number | "unlimited";
  readonly exportFormats: readonly string[] | "all";
  readonly sharing: string;
  readonly dailyRunCeiling?: number;
  readonly priorityQueue?: boolean;
  readonly waitlist?: boolean;
  readonly seatsIncluded?: number;
  readonly whatItCovers: string;
}

/** GET /billing/plans — the published pricing payload (REQ-GROWTH-4/7/8; §14.2). */
export interface BillingPlansDto {
  readonly version: string;
  readonly issuedAt: string;
  readonly usdPerCredit: number;
  readonly platformRate: number;
  readonly annualSavingsPct: number;
  readonly plans: Record<string, BillingPlanDto>;
  readonly trial: {
    readonly windowDays: number;
    readonly entitlement: { readonly kind: string; readonly wordCap: number; readonly rigor: string; readonly modelTier: string };
    readonly pocketCredits: number;
    readonly upgradePromoCredits: number;
    readonly includedNote: string;
    readonly postTrialNote: string;
    readonly eligibilityLine: string;
  };
  readonly topUpPacks: readonly { readonly id: string; readonly usd: number; readonly credits: number }[];
  readonly autoReloadDefaults: unknown;
}

/** POST /billing/checkout — mint a Checkout session; the client redirects to `url`. */
export interface CheckoutRequestDto {
  readonly kind: "subscribe" | "topup" | "auto_reload_setup";
  readonly plan?: string;
  readonly cycle?: "monthly" | "annual";
  readonly packId?: string;
  readonly returnTo?: string;
  readonly email?: string;
}
export interface CheckoutSessionDto {
  readonly sessionId: string;
  readonly url: string;
}
/** GET /billing/checkout-sessions/:id — the checkout-return poll (webhook lag ≤30 s). */
export interface CheckoutStatusDto {
  readonly state: "open" | "completed" | "expired";
  readonly kind: string;
  readonly returnTo: string | null;
}

/** GET /billing/subscription — the plan card's read model (sub + trial + auto-reload + Stripe link). */
export interface BillingSubscriptionDto {
  readonly tier: string;
  readonly subscription: {
    readonly id: string;
    readonly tier: string;
    readonly cycle: string | null;
    readonly status: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly cancelAtPeriodEnd: boolean;
    readonly scheduledTier: string | null;
    readonly pastDue: boolean;
  } | null;
  readonly trial: {
    readonly state: string | null;
    readonly entitlement: { readonly id: string; readonly state: string; readonly wordCap: number; readonly expiresAt: string | null } | null;
  };
  readonly autoReload: {
    readonly enabled: boolean;
    readonly thresholdCredits: number | null;
    readonly packId: string | null;
    readonly monthlyCapUsd: number | null;
  };
  readonly hasStripeCustomer: boolean;
}

/** PUT /billing/auto-reload — the opt-in charge path's settings (REQ-BILL-17). */
export interface AutoReloadRequestDto {
  readonly enabled: boolean;
  readonly thresholdCredits?: number;
  readonly packId?: string;
  readonly monthlyCapUsd?: number;
}

/** GET /billing/usage/account — the §14.5 level-1 account read (buckets, MTD, period, warnings). */
export interface UsageAccountDto {
  readonly level0: {
    readonly spendableCredits: number;
    readonly heldCredits: number;
    readonly plan: string;
    readonly trialState: string | null;
    readonly trialDaysLeft: number | null;
  };
  readonly buckets: readonly {
    readonly bucket: string;
    readonly available: number;
    readonly held: number;
    readonly expiresAt: string | null;
  }[];
  readonly monthToDateCredits: number;
  readonly includedRemaining: number;
  readonly includedMonthly: number;
  readonly includedRolloverCap: number;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly warnings: readonly string[];
  readonly nextExpiry: { readonly bucket: string; readonly credits: number; readonly at: string } | null;
}

/** GET /billing/usage/project/:id — the §14.5 level-2 project rollup. */
export interface UsageProjectDto {
  readonly projectId: string;
  readonly projectName: string;
  readonly totalCredits: number;
  readonly runs: readonly {
    readonly runId: string;
    readonly at: string;
    readonly workflow: string;
    readonly state: string;
    readonly credits: number;
    readonly estimateCredits: number;
    readonly capCredits: number;
  }[];
}

/** GET /pricing/rates — the public rate-table publication (REQ-BILL-19): current + previous tables
 *  with effective dates and the platform rate; every run report links its frozen version. */
export interface RatesPublicationDto {
  readonly platformRate: number;
  readonly usdPerCredit: number;
  readonly currentVersion: number;
  readonly tables: readonly {
    readonly version: number;
    readonly effectiveDate: string;
    readonly current: boolean;
    readonly models: unknown;
    readonly cacheReadMultiplier: number;
    readonly cacheWriteMultiplier: number;
    readonly webSearchUsdPerRequest: number;
  }[];
}

/** GET /billing/usage/run/:id/advanced — the level-4 phase×seat×model rows (Advanced disclosure). */
export interface UsageRunAdvancedDto {
  readonly rows: readonly {
    readonly runId: string;
    readonly phase: string;
    readonly seat: string;
    readonly model: string;
    readonly modelTier: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
    readonly searches: number;
    readonly fetches: number;
    readonly credits: number;
    readonly providerRequestId: string | null;
  }[];
}

// ---------------------------------------------------------------------------------------------------------
// PRB.10 — Quick Voice (§9.2–§9.6). The shared pill/status DTO mirrors @rhema/findings-core's VoiceStatus
// (kept structural to avoid a heavy dep); every surface renders this ONE shape byte-identically.
// ---------------------------------------------------------------------------------------------------------

/** The §9.3 eight states (the beta's reachable subset: never_built / building / seed_changed /
 *  samples_changed / unfalsified). */
export type VoiceStateDto =
  | "never_built"
  | "building"
  | "seed_changed"
  | "samples_changed"
  | "aged"
  | "unfalsified"
  | "badly_off"
  | "fresh";

/** The ONE shared voice status — `deriveVoiceStatus`'s wire shape (REQ-PERSONA-14). */
export interface VoiceStatusDto {
  readonly state: VoiceStateDto;
  readonly pill: { readonly label: string; readonly tone: string };
  readonly action: "build" | "open_run" | "update_voice" | "test" | "rebuild" | "none";
  readonly detail: {
    readonly seedChanged: boolean;
    readonly samples: { readonly added: number; readonly removed: number; readonly changed: number };
    readonly growthRatio: number | null;
    readonly ageDays: number | null;
  };
}

/** The stored profile snapshot's §9.3 facts (persona_profiles row). */
export interface VoiceSnapshotDto {
  readonly builtAt: string;
  readonly seedSha256: string | null;
  readonly sampleSet: Record<string, string>;
  readonly corpusWordsAtBuild: number | null;
  readonly calibrationStatus: string | null;
  readonly tier: string | null;
}

/** The /app/voices three-group destination (§9.1). */
export type VoiceGroupKey = "your_voices" | "house_styles" | "shared_with_you";

/** A library card (GET /voices). */
export interface VoiceListRowDto {
  readonly personaId: string;
  readonly name: string | null;
  readonly byline: string | null;
  readonly mode: string;
  readonly kind: string;
  /** the §9.1 destination group the card renders under. */
  readonly group: VoiceGroupKey;
  /** House styles + shared personas are forkable, not editable on this surface. */
  readonly readOnly: boolean;
  readonly sampleCount: number;
  /** the distinct providers feeding the corpus (the card's source chips). */
  readonly sources: string[];
  readonly projectCount: number;
  readonly lastBuiltAt: string | null;
  readonly tier: string | null;
  /** composite members ("Composed from A, B"; empty for leaf personas). */
  readonly members: readonly { readonly personaId: string; readonly name: string | null }[];
  readonly registers: readonly string[];
  readonly status: VoiceStatusDto;
}

/** GET /voices — the flat list plus the §9.1 three-group split the page renders. */
export interface VoiceListDto {
  readonly voices: readonly VoiceListRowDto[];
  readonly groups: Record<VoiceGroupKey, readonly VoiceListRowDto[]>;
}

export interface CreateVoiceDto {
  readonly name: string;
  readonly byline?: string;
  readonly description?: string;
  /** Mode (`self` | `consented` | `house` | `study`) — metadata only (Q-11; REQ-PERSONA-27). */
  readonly mode?: string;
  readonly registers?: string[];
}

export interface CreatedVoiceDto {
  readonly personaId: string;
  readonly mode: string;
  /** 'persona_builder' until the first user seed edit (the agent-drafted marker; REQ-PERSONA-4). */
  readonly seedAuthoredBy: string;
  readonly status: VoiceStatusDto | null;
}

/** A sample row on the detail page (a discovered_item + its head sample_version). */
export interface VoiceSampleDto {
  readonly id: string;
  readonly title: string | null;
  readonly state: string;
  readonly access: string | null;
  readonly date: string | null;
  /** P1.15 — the owning connection (the Samples tab's per-source confirm grouping). */
  readonly connection_id?: string | null;
  readonly url?: string | null;
  /** P1.15 — the provider's stable key (the confirm step's include/omit selector). */
  readonly external_id?: string | null;
  readonly version_id: string | null;
  readonly content_sha256: string | null;
  readonly word_count: number | null;
  readonly quality: string | null;
  readonly n: number | null;
}

/** A profile snapshot row in the build history. */
export interface VoiceProfileRowDto {
  readonly id: string;
  readonly built_at: string;
  readonly tier: string | null;
  readonly corpus_size_at_build: number | null;
  readonly calibration_status: string | null;
  readonly built_by_run_id: string | null;
}

/** A build/refresh run row in the voice's history. */
export interface VoiceRunRowDto {
  readonly id: string;
  readonly state: string;
  readonly workflow: string;
  readonly spent_credits: number;
  readonly created_at: string;
  readonly ended_at: string | null;
}

/** A persona artifact row (seed + samples + derived profile artifacts). */
export interface VoiceArtifactRowDto {
  readonly id: string;
  readonly kind: string;
  readonly mirror_path: string;
  readonly version_id: string;
  readonly created_at: string;
}

// ---------------------------------------------------------------------------------------------------------
// P1.14 — the full Voices workspace wire shapes (§9.2–§9.6). The detail read carries the diff-of-inputs
// panel, the routed Update-voice verb, the hold-out (identity hidden pre-calibration), the deterministic
// measure set + calibration table, the corrections ledger, the approve-sample gate card, composite
// members, build notes, and the Profile tab's fixed section order — all server-computed so the page
// can't drift from the run's frozen inputs.
// ---------------------------------------------------------------------------------------------------------

/** The hold-out as the wire may name it — pre-calibration ONLY the fact that one exists (§9.4). */
export interface VoiceHoldoutDto {
  readonly held: boolean;
  readonly revealed: boolean;
  readonly itemId?: string;
  readonly title?: string;
  readonly revealedAt?: string;
}

/** The calibration comparison table (§9.4): target vs prediction vs real, one band wide. */
export interface VoiceCalibrationDto {
  readonly verdict: CalibrationStatus | string | null;
  readonly rows: readonly VoiceMeasureRow[];
  readonly withinCount: number;
  readonly totalCount: number;
}

/** A profile-correction ledger row (§9.4 "Correct this in your description"). */
export interface VoiceCorrectionDto {
  readonly id: string;
  readonly profile_id: string | null;
  readonly target_artifact_id: string | null;
  readonly statement_ref: string | null;
  readonly text: string;
  readonly source: string;
  readonly consumed_by_profile_id: string | null;
  readonly at: string;
}

/** The approve_sample gate card the detail page renders while a build waits on it (§9.2/§6.4). */
export interface VoiceGateCardDto {
  readonly gateId: string;
  readonly runId: string;
  readonly workflow: string;
  readonly card: ApproveSampleCard;
}

/** A composite persona's member (the "Composed from A, B" line; §9.6). */
export interface VoiceMemberDto {
  readonly id: string;
  readonly display_name: string | null;
  readonly byline: string | null;
}

/** A build note row — the Description tab's "Notes from the last build" (§9.4). */
export interface VoiceBuildNoteDto {
  readonly id: string;
  readonly profile_id: string | null;
  readonly body: unknown;
  readonly created_at: string;
}

/** GET /voices/:id — the detail page's full read. */
export interface VoiceDetailDto {
  readonly persona: {
    readonly id: string;
    readonly display_name: string | null;
    readonly slug: string | null;
    readonly byline: string | null;
    readonly mode: string;
    readonly registers: string[] | null;
    readonly seed_artifact_id: string | null;
    readonly seed_sha256: string | null;
    readonly seed_authored_by: string | null;
    readonly seed_updated_at: string | null;
    readonly current_profile_id: string | null;
    readonly active_run_id: string | null;
  };
  readonly status: VoiceStatusDto;
  readonly snapshot: VoiceSnapshotDto | null;
  readonly seedMarkdown: string;
  readonly samples: VoiceSampleDto[];
  readonly profiles: VoiceProfileRowDto[];
  readonly runs: VoiceRunRowDto[];
  readonly artifacts: VoiceArtifactRowDto[];
  readonly projects: { readonly id: string; readonly slug: string; readonly title: string }[];
  // ---- P1.14 surfaces (all server-computed; absent only from stale fixtures). ----
  /** the diff-of-inputs popover's four facts + the one verb (§9.3). */
  readonly factsPanel?: VoiceFactsPanel;
  /** the routed Update-voice verb (§9.3; scope `none` ⇒ the pill is resting). */
  readonly updateRoute?: VoiceUpdateRoute;
  /** the "Upgrade to Full Profile" offer on a Quick snapshot (§9.2; null otherwise). */
  readonly upgradeRoute?: VoiceUpdateRoute | null;
  readonly holdout?: VoiceHoldoutDto;
  /** the deterministic corpus measures (the Profile tab's Advanced table; §9.4). */
  readonly measures?: CorpusMeasures | null;
  /** the calibration comparison table — present only post-reveal. */
  readonly calibration?: VoiceCalibrationDto | null;
  readonly corrections?: readonly VoiceCorrectionDto[];
  /** the open approve_sample gate card (null unless a build waits on it). */
  readonly gate?: VoiceGateCardDto | null;
  readonly members?: readonly VoiceMemberDto[];
  readonly buildNotes?: readonly VoiceBuildNoteDto[];
  /** profile/index.md's head text — the Overview tab's hub paragraph. */
  readonly hubMarkdown?: string | null;
  /** the Profile tab's fixed §9.4 section order. */
  readonly profileSections?: readonly ProfileSection[];
  readonly tier?: string | null;
}

export interface AddVoiceSampleDto {
  /** Pasted text, or a quarantine key for an uploaded file (the PRB.02 convert seam). */
  readonly text?: string;
  readonly quarantineKey?: string;
  readonly title?: string;
}

export interface AddedVoiceSampleDto {
  readonly itemId: string;
  readonly sampleVersionId: string;
  /** the refreshed included-corpus word count (the sheet's estimate re-renders from this; REQ-PERSONA-3). */
  readonly words: number;
  readonly status: VoiceStatusDto | null;
}

export interface SaveVoiceSeedDto {
  readonly description?: string;
  readonly byline?: string;
  readonly registers?: string[];
}

export interface SavedVoiceSeedDto {
  readonly seedSha256: string;
  readonly status: VoiceStatusDto | null;
}

/** GET /voices/:id/estimate — the tier figure + the corpus words it was computed for. */
export interface VoiceEstimateDto extends EstimateDto {
  readonly words: number;
  readonly samples: number;
  readonly tier: string;
}

export interface BuildVoiceDto {
  readonly tier?: "quick" | "full";
  readonly projectId?: string;
  readonly modelTier?: "base" | "balanced" | "frontier";
  readonly idempotencyKey?: string;
}

export interface BuiltVoiceDto {
  readonly runId: string;
  readonly state: string;
  readonly deduped?: boolean;
}

/** GET/PATCH /projects/:id/voice — the project's linked-voice facts (§9.6; REQ-DATA-32). */
export interface ProjectVoiceDto {
  readonly voiceMode: "linked" | "ad_hoc";
  readonly personaId: string | null;
  readonly name?: string | null;
  readonly snapshotId?: string | null;
  readonly profileSnapshotId?: string | null;
  readonly status: VoiceStatusDto | null;
  readonly snapshot?: VoiceSnapshotDto | null;
  /** P1.14 — the project pins an older profile snapshot; true ⇒ the adopt/fork hatches show (§9.6). */
  readonly pinnedStale?: boolean;
}

/** POST /voices/:id/samples/url — the fetcher-only URL ingestion path (REQ-INGEST-13). */
export interface AddVoiceSampleUrlDto {
  readonly url: string;
  readonly title?: string;
}

export interface AddedVoiceSampleUrlDto {
  readonly itemId: string;
  readonly deduped?: boolean;
  readonly sampleVersionId?: string;
  readonly words?: number;
  readonly status: VoiceStatusDto | null;
}

/** GET /voices/:id/update — the diff-of-inputs sheet's pre-computed route + estimate (§9.3). */
export interface VoiceUpdatePlanDto {
  readonly route: VoiceUpdateRoute;
  readonly estimate: EstimateDto | null;
  /** the "Upgrade to Full Profile" offer (a Quick snapshot only; §9.2). */
  readonly upgrade: VoiceUpdateRoute | null;
  readonly upgradeEstimate: EstimateDto | null;
}

/** POST /voices/:id/update — the ONE Update-voice verb; absent `scope` ⇒ the routed one (§9.3). */
export interface UpdateVoiceDto {
  readonly scope?: VoiceUpdateScope;
  readonly register?: string;
  readonly modelTier?: "base" | "balanced" | "frontier";
  readonly idempotencyKey?: string;
}

export interface UpdatedVoiceDto {
  readonly runId: string;
  readonly state: string;
  readonly deduped?: boolean;
  readonly route: VoiceUpdateRoute;
  readonly estimate: EstimateDto;
}

/** POST /voices/:id/corrections — "Correct this in your description" (§9.4; REQ-PERSONA-7). */
export interface AddVoiceCorrectionDto {
  readonly text: string;
  readonly statementRef?: string;
  readonly artifactId?: string;
  readonly source?: string;
}

export interface AddedVoiceCorrectionDto {
  readonly correctionId: string;
  readonly seedSha256: string;
  readonly status: VoiceStatusDto | null;
}

/** POST /voices/:id/fork — the read-only card's copy becomes your editable persona (§9.1). */
export interface ForkedVoiceDto {
  readonly personaId: string;
  readonly status: VoiceStatusDto | null;
}

// ---------------------------------------------------------------------------------------------------------
// P1.15 — the ingestion surface (§9.5): the voice's Samples tab — the Sources pane (linked providers),
// the discover→confirm→sync flow, the items pane, the quality drawer, preview + version history, the
// priced reconstruction enqueue, and voice delete. NEVER a credential field anywhere (AC-I-B).
// ---------------------------------------------------------------------------------------------------------

/** A linked source row (GET /voices/:id/connections). */
export interface VoiceConnectionDto {
  readonly id: string;
  readonly provider: "substack" | "substack_export" | "url" | "upload" | "paste" | string;
  readonly handle: string | null;
  readonly status: string | null;
  readonly last_sync_at: string | null;
  readonly schedule: string | null;
  readonly auto_include_new: boolean | null;
  /** The verbatim provider error + remedy line (REQ-INGEST-11); null when healthy. */
  readonly error: string | null;
  /** The pane's counts: all discovered items, and the corpus-included ones. */
  readonly items: number;
  readonly included: number;
}

export interface VoiceConnectionsDto {
  readonly connections: readonly VoiceConnectionDto[];
}

/** POST /voices/:id/connections — link a source. There is NO credential field (never-cookies). */
export interface CreateVoiceConnectionDto {
  readonly provider: "substack" | "substack_export" | "url";
  /** substack: a publication address (name.substack.com). url: the linked page. */
  readonly handle?: string;
  readonly url?: string;
  /** substack_export: the presigned-upload quarantine key for the export zip. */
  readonly quarantineKey?: string;
  readonly autoIncludeNew?: boolean;
  readonly dailySync?: boolean;
}

export interface CreatedVoiceConnectionDto {
  readonly connectionId: string;
  readonly provider: string;
  readonly handle: string;
}

/** A discovery row on the review step — listing data only, NEVER a body (REQ-INGEST-3). */
export interface DiscoveredItemDto {
  readonly id: string;
  readonly external_id: string | null;
  readonly state: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly date: string | null;
  readonly word_count: number | null;
  readonly access: string | null;
  readonly remote_change_key: string | null;
}

/** POST /voices/:id/connections/:cid/discover — the review list (each row's `state` is the
 *  proposed default the confirm screen shows checked/unchecked). */
export interface DiscoveredVoiceConnectionDto {
  readonly items: readonly DiscoveredItemDto[];
}

/** POST …/confirm — the reviewed include/omit set, keyed by externalId. */
export interface ConfirmVoiceConnectionDto {
  readonly items: readonly { readonly externalId: string; readonly include: boolean }[];
}

/** One connection's sync report (the ingest.sync job's result; inline-sync responses carry it). */
export interface IngestSyncReportDto {
  readonly connectionId: string;
  readonly discovered: number;
  readonly added: number;
  readonly removedRemote: number;
  readonly changed: number;
  readonly newVersions: number;
  readonly skippedUnchanged: number;
  readonly errors: readonly { readonly itemId: string | null; readonly message: string; readonly remedy: string }[];
}

/** confirm/sync responses: `{queued:true}` in prod, `{report}` under the inline test seam. */
export interface VoiceSyncResponseDto {
  readonly queued?: boolean | number;
  readonly report?: IngestSyncReportDto;
  readonly reports?: readonly (IngestSyncReportDto | { error: string })[];
}

/** PATCH /voices/:id/connections/:cid — per-source settings. */
export interface PatchVoiceConnectionDto {
  readonly autoIncludeNew?: boolean;
  readonly dailySync?: boolean;
}

/** A sample_versions row (the version-history list; newest first). */
export interface SampleVersionDto {
  readonly id: string;
  readonly n: number;
  readonly content_sha256: string;
  readonly original_sha256: string | null;
  readonly original_key?: string | null;
  readonly quality: string | null;
  readonly quality_notes: readonly string[] | null;
  readonly word_count: number | null;
}

/** GET /voices/:id/samples/:itemId — the preview: the canonical document + listing facts + versions. */
export interface VoiceSampleDetailDto {
  readonly item: {
    readonly id: string;
    readonly external_id: string | null;
    readonly title: string | null;
    readonly url: string | null;
    readonly date: string | null;
    readonly word_count: number | null;
    readonly access: string | null;
    readonly state: string;
    readonly provider: string;
    readonly connection_id: string;
  };
  readonly versions: readonly SampleVersionDto[];
  /** The canonical Rhema Markdown document (front matter + normalized body); null when unfetched. */
  readonly document: string | null;
}

export interface VoiceSampleVersionsDto {
  readonly versions: readonly SampleVersionDto[];
}

/** POST /voices/:id/samples/:itemId/reconstruct — REQ-INGEST-10. confirmed!==true ⇒ the route
 *  answers 400 with the estimate the drawer shows; confirmed ⇒ 202 + the metered job's enqueue. */
export interface ReconstructVoiceSampleDto {
  readonly tier?: "text" | "visual";
  readonly confirmed?: boolean;
}

export interface ReconstructVoiceSampleResponseDto {
  readonly queued?: boolean;
  readonly estimateCredits: number;
  readonly capCredits: number;
}

/** DELETE /voices/:id — stamps deleted_at; the voice.purge job cascades owned rows (REQ-INGEST-16). */
export interface DeletedVoiceDto {
  readonly deleted: boolean;
  readonly personaId: string;
}

/** POST /projects/:id/voice/adopt — hatch 1: pin the refreshed snapshot (§9.6; REQ-DATA-30). */
export interface AdoptProjectVoiceDto {
  /** launch a reseed_charter run over the adopted snapshot (the charter's guidance never rewrites). */
  readonly reseed?: boolean;
  readonly modelTier?: string;
  readonly idempotencyKey?: string;
}

export interface AdoptedProjectVoiceDto {
  readonly adopted: true;
  readonly personaId: string;
  readonly profileSnapshotId: string;
  readonly status: VoiceStatusDto | null;
  readonly reseedRun: { readonly runId: string; readonly state: string } | null;
}

/** POST /projects/:id/voice/fork — hatch 2: a NEW project at `outlined`, outline copied, drafts not. */
export interface ForkProjectVoiceDto {
  readonly personaId: string;
  readonly title?: string;
}

export interface ForkedProjectVoiceDto {
  readonly projectId: string;
  readonly slug: string;
  readonly personaId: string;
  readonly profileSnapshotId: string | null;
}

/** GET /projects/:id/voice/reseed-preview — the adopt dialog's charter diff (§9.6). */
export interface ReseedPreviewDto {
  readonly charterFound: boolean;
  readonly current: string;
  readonly next: string;
  readonly diff: readonly { readonly kind: "same" | "removed" | "added"; readonly line: string }[];
  /** the server guarantees guidance bytes carry verbatim — the diff never shows a guidance line. */
  readonly guidancePreserved: boolean;
}

// ---------------------------------------------------------------------------------------------------------
// PRB.11 — export (md/txt/docx) + the AI-use statement (§13.4, §8.4 REQ-VIS-10). The dialog read carries the
// format list, the never-blocking obligation line + linkable items, and the statement preview; the export
// POST returns the binary download. The statement's generated sentences are recomputed from run rows on
// every read — the only write is `appendAiUseAddition` (append-only; there is no update/delete).
// ---------------------------------------------------------------------------------------------------------

/** One export format on the dialog (P1.18 — the full seven-format registry, one shared table). */
export interface ExportFormatDto {
  readonly id: ExportFormat;
  readonly label: string;
  readonly extension: string;
  readonly blurb: string;
  /** whether the §8.4 block-level provenance appendix can ride this format. */
  readonly provenanceAppendix: boolean;
}

/** P1.18 — an `md`-only export profile (`substack`; never an eighth format). */
export interface MdExportProfileDto {
  readonly id: MdExportProfile;
  readonly label: string;
  readonly blurb: string;
}

/** P1.18 — the dialog's citation block: the bibliography artifact's presence + the vendored styles. */
export interface ExportCitationsDto {
  readonly hasBibliography: boolean;
  readonly styles: { readonly id: CslStyle; readonly label: string }[];
}

/** P1.18 — the provenance-appendix toggle's state (off by default; greyed without a map). */
export interface ExportProvenanceDto {
  readonly available: boolean;
  readonly defaultOn: boolean;
  readonly label: string;
  readonly formats: readonly ExportFormat[];
}

/** P1.18 — the protocol-conditioned surfaces (§6.7): Academic's disclosure toggle copy and the
 *  op-ed exclusivity reminder (a reminder, never a gate). */
export interface ExportSurfacesDto {
  readonly disclosure: boolean;
  readonly exclusivityReminder: string | null;
}

/** An open obligation surfaced on the export dialog (informational — export never blocks, §11.7). */
export interface ExportObligationDto {
  readonly id: string;
  readonly title: string;
  readonly severity: string;
  readonly state: string;
  readonly findingId: string | null;
  /** the review run the obligation's root finding was filed on — the dialog's link target. */
  readonly reviewRunId: string | null;
}

/** The generated AI-use statement + the author's append-only additions (§8.4 REQ-VIS-10). */
export interface AiUseStatementDto {
  readonly template: string;
  /** generated sentences — recomputed from run rows on every read; never user-editable. */
  readonly generated: string[];
  /** the author's appended sentences (oldest first). */
  readonly additions: { readonly id: string; readonly sentence: string; readonly createdAt: string }[];
  /** the standalone statement rendered to markdown (title + sentences + additions + generated-on line). */
  readonly markdown: string;
  readonly openObligations: number;
  readonly blockingOpen: number;
  readonly generatedAt: string;
}

/** GET /projects/:id/export/dialog — the dialog's whole read. */
export interface ExportDialogDto {
  readonly projectId: string;
  readonly formats: ExportFormatDto[];
  readonly mdProfiles: MdExportProfileDto[];
  readonly citations: ExportCitationsDto;
  readonly provenance: ExportProvenanceDto;
  readonly surfaces: ExportSurfacesDto;
  readonly obligations: {
    readonly blockingOpen: number;
    readonly open: number;
    /** the §11.7 line — "2 blocking obligations open"; export never blocks on it. */
    readonly line: string;
    readonly items: ExportObligationDto[];
    /** deferred obligations whose `pre_export` horizon just arrived (now open). */
    readonly returnedIds: string[];
  };
  readonly statement: AiUseStatementDto;
}

export interface ExportRequestDto {
  readonly format: ExportFormat;
  /** the draft to export (default the highest-n head). */
  readonly draftId?: string;
  /** an `md`-only profile (`substack`) — the api rejects it on any other format. */
  readonly profile?: MdExportProfile;
  /** CSL style for `--citeproc` (honored only when the project carries `bibliography/csl.json`). */
  readonly cslStyle?: CslStyle;
  /** attach the AI-use statement as a trailing section (§8.4). */
  readonly attachAiUse?: boolean;
  /** append the §8.4 block-level provenance appendix (off by default). */
  readonly attachProvenance?: boolean;
}

/** A binary download result (the export POST + the standalone statement GET). */
export interface ExportDownloadDto {
  readonly bytes: ArrayBuffer;
  readonly mediaType: string;
  readonly fileName: string;
}

export interface AiUseAdditionDto {
  readonly id: string;
  readonly sentence: string;
  readonly createdAt: string;
}

// ---- P1.18 — the whole-account export/import (REQ-ACCT-3) ----

export type AccountExportStatus = "building" | "ready" | "failed";

/** One account_exports row as the api reports it (the download token NEVER appears — it lives in
 *  the email; `downloadPath` is the session-authed in-app route). */
export interface AccountExportDto {
  readonly id: string;
  readonly status: AccountExportStatus;
  readonly bytes: number | null;
  readonly sha256: string | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly readyAt: string | null;
  readonly expiresAt: string | null;
  readonly expired: boolean;
  readonly downloadedAt: string | null;
  readonly downloadPath?: string;
}

/** POST /account/import — the fresh-account replay's counts (a re-import is `deduped: true`). */
export interface AccountImportResultDto {
  readonly projects: number;
  readonly voices: number;
  readonly files: number;
  readonly deduped: boolean;
}

// ---- PRB.20 — the live ingestion path (D-PRB.02-1) ----

/** POST /import/presign's response: the v4-signed PUT URL + the workspace-scoped quarantine key + the
 *  signed headers the browser MUST echo verbatim (the content-length bound is inside the signature). */
export interface PresignedImportDto {
  readonly url: string;
  readonly key: string;
  readonly maxBytes: number;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

/** The body both import endpoints take — the minted `quarantine/<workspaceId>/<uploadId>` key. */
export interface ImportRequestDto {
  readonly quarantineKey: string;
  /**
   * PRB.21 — the caller's wait budget in ms (clamped server-side). With it, `import/preview` answers
   * 202 `pending` instead of holding open through a ~2.5–4 min cold convert Job; the caller retries
   * (read-back + the in-flight marker make a retry cheap — never a duplicate `jobs:run`).
   */
  readonly waitMs?: number;
  /** REQ-PROD-8 (P1.04) — `import/create` only: the imported draft's declared version label
   *  (a project may start at v3; ignored when lower than the next ordinal). */
  readonly startVersion?: number;
}

/** `import/preview`'s response — the §5.3 payload once converted, `pending` while the Job still runs. */
export type ImportPreviewDto =
  | { readonly status: "ready"; readonly preview: ConversionResult }
  | { readonly status: "pending"; readonly quarantineKey: string };

/** The imported draft the create endpoint returns (§5.3 "Create and fix later" → frozen draft 1). */
export interface CreatedImportDraftDto {
  readonly draftId: string;
  readonly versionId: string;
  readonly artifactId: string;
  readonly n: number;
  readonly wordCount: number;
  readonly contentSha256: string;
}

// ---- P1.05 — Timeline / run report / steering DTOs (§5.5/§6.5/§14.5) ----

/** A run inside a round (or ungrouped): the card view is the whitelisted orchestrator projection. */
export interface TimelineRunDto {
  readonly runId: string;
  readonly workflow: string;
  readonly state: RunState;
  readonly createdAt: string;
  readonly subjectN: number | null;
  readonly producedN: number | null;
  readonly card: RunCardView;
  /** P1.09 — the waiting run's full approval card DTO (the Timeline mounts the identical card). */
  readonly gate?: GateCardDto;
}

/** One round card: `vN` anchor → the runs that consumed it → the `v(N+1)` it produced. */
export interface TimelineRoundDto {
  readonly n: number;
  readonly anchor: TimelineDraft | null;
  readonly producedN: number | null;
  /** the collapsed summary parts (`v1 → review (49) → revise → v2`) — controlled tokens, numbers only. */
  readonly parts: readonly RoundSummaryPart[];
  readonly runs: readonly TimelineRunDto[];
}

/** The next-step card above the newest round (§5.5): the state function's verb + a re-derived estimate. */
export interface TimelineNextStepDto {
  readonly verb: string;
  readonly label: string | null;
  readonly estimateCredits: number | null;
  readonly headDraftN: number | null;
}

/** `GET /projects/:id/timeline` — the full Timeline pane read. */
export interface TimelineDto {
  readonly project: { readonly id: string; readonly slug: string; readonly title: string };
  readonly state: ProjectStateDto;
  readonly nextStep: TimelineNextStepDto;
  readonly rounds: readonly TimelineRoundDto[];
  readonly ungrouped: readonly TimelineRunDto[];
  /** the Outline/"Imported draft" chip rendered below the oldest round. */
  readonly originChip: { readonly kind: "outline" | "imported_draft" } | null;
}

/** `GET /runs/:id/report` — Level 3; `advancedView` present only on `?advanced=1`. */
export interface RunReportDto {
  readonly kind: "ok";
  readonly report: RunReportView;
  readonly advancedView?: RunReportAdvancedView;
  /** the owning project's slug (the `/app/usage/r/:run` redirect resolves its /p/ path from it). */
  readonly projectSlug?: string | null;
}

// ---- P1.11 — the Assistant chat DTOs (§7.1/§7.4/§7.6; they mirror the api's chat-routes wire
// shapes — every number on them is metered, never model prose) ----

export interface ChatThreadDto {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly archived?: boolean;
}

export interface ChatTurnRowDto {
  readonly id: string;
  readonly state: string;
  readonly created_at: string;
  readonly spent_credits: number;
  readonly cap_credits: number;
  readonly model_tier: string;
}

export interface ChatMessageDto {
  readonly mirror_path: string;
  readonly created_at: string;
  readonly word_count: number | null;
}

export interface ChatPinDto {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly ref?: string;
  readonly pinnedAt?: string;
}

export interface ChatSourceDto {
  readonly path: string;
  readonly kind: string;
  readonly title?: string;
  readonly url?: string;
  readonly unverified?: boolean;
  readonly words?: number;
}

export interface ChatBudgetDto {
  readonly credits: number;
  readonly searches: number;
  readonly fetches: number;
}

/** The §7.6 empty state (quiet Page + Desk on Chat + the four chips + one next-step card). */
export interface ChatEmptyStateDto {
  readonly page: "quiet";
  readonly deskTab: "chat";
  readonly chips: readonly { readonly id: string; readonly label: string; readonly verb: string }[];
  readonly nextStep: { readonly kind: string; readonly label: string; readonly href?: string };
}

export interface ChatPlanCardDto {
  readonly kind: "plan_card";
  readonly threadId: string;
  readonly summary: string;
  readonly steps: readonly string[];
  readonly budget: ChatBudgetDto;
  readonly modelTier: string;
  readonly actions: readonly string[];
  readonly researchSheetHref?: string;
}

export interface ChatPanelDto {
  readonly threads: readonly ChatThreadDto[];
  readonly activeThreadId: string;
  readonly turns: readonly ChatTurnRowDto[];
  readonly messages: readonly ChatMessageDto[];
  readonly pins: { readonly pins: readonly ChatPinDto[]; readonly footprint: number; readonly cap: number };
  readonly sources: readonly ChatSourceDto[];
  /** a non-chat live run id — while set the assistant reads committed artifacts only (REQ-CHAT-20). */
  readonly liveRun: string | null;
  readonly emptyState: ChatEmptyStateDto | null;
  readonly budgets: ChatBudgetDto;
  readonly defaultTier: string;
}

export interface ChatTurnRequestDto {
  readonly message: string;
  readonly budget?: Partial<ChatBudgetDto>;
  readonly modelTier?: string;
  readonly urlPolicy?: Record<string, unknown>;
  readonly idempotencyKey?: string;
}

export interface ChatTurnCreatedDto {
  readonly runId: string;
  readonly state: string;
  readonly deduped: boolean;
  readonly planCard: ChatPlanCardDto;
}

/** The metered turn read — the strip's numbers come from usage rows + the run row. */
export interface ChatTurnStatusDto {
  readonly runId: string;
  readonly state: string;
  readonly strip: {
    readonly spentCredits: number;
    readonly capCredits: number;
    readonly searchesUsed: number;
    readonly searchesBudget: number;
    readonly fetchesUsed: number;
    readonly fetchesBudget: number;
    readonly workspaceSpent?: number;
    readonly tier: string;
  };
  readonly activity: { readonly searches: number; readonly fetches: number; readonly artifactReads: number; readonly sourcesRead: number };
  readonly result: { readonly turnResultSha: string } | null;
}

export interface ChatPlanDecisionDto {
  readonly ok: true;
  readonly action: string;
  readonly state?: string;
  /** `run_research` resolves to the research_burst SHEET link — the sheet's Run is the run creator. */
  readonly sheet?: { readonly kind: string; readonly workflow: string; readonly href: string };
}

export interface ChatPinsDto {
  readonly ok: true;
  readonly pins: readonly ChatPinDto[];
  readonly footprint: number;
  readonly droppedOldest?: boolean;
}

export interface ChatRemembersDto {
  readonly brief: string | null;
  readonly pins: { readonly pins: readonly ChatPinDto[] };
  readonly footprint: number;
}

export type ChatAttachmentDto =
  | { readonly ok: true; readonly note: { readonly path: string; readonly entry: ChatSourceDto } }
  | { readonly pending: true; readonly quarantineKey: string };

export interface ChatSuggestionDto {
  readonly ok: true;
  readonly proposal: {
    readonly id: string;
    readonly label: string;
    readonly markdown: string;
    readonly kind: "replace";
    readonly anchor: { readonly ref: string; readonly version?: number; readonly block?: string };
    /** always "assistant" — the §7.4 block-provenance tag. */
    readonly provenance: string;
  };
}

// ---- P1.12 — the Outline surface (§7.3): promotion sheet facts, the durable outline DTO, and the
// editor's save/answer payloads. Provenance + `unverified` are DATA on every row (REQ-DATA-23). ----

/** The promotion sheet's facts (GET /projects/:id/outline/promotion) — rendered verbatim; the sheet's
 *  Promote click posts the same scope/slug to /outline/promotions. */
export interface OutlinePromotionDto {
  readonly slug: string;
  readonly scope: "thread" | "turn" | "research";
  readonly threadId?: string;
  readonly turnId?: string;
  readonly sources: number;
  readonly sourceCopies: readonly { readonly src: string; readonly dst: string }[];
  readonly urls: readonly string[];
  readonly threadTokens: number;
  readonly urlsRefetched: number;
  readonly estimateCredits: number;
  readonly capCredits: number;
  readonly modelTier: string;
  readonly rigor: string;
  /** an outline already exists at this slug (the promote lands as a new version). */
  readonly existing: boolean;
}

/** The request body for POST /projects/:id/outline/promotions. */
export interface OutlinePromoteRequestDto {
  readonly threadId?: string;
  readonly scope?: "thread" | "turn" | "research";
  readonly turnId?: string;
  readonly modelTier?: string;
  readonly rigor?: string;
  readonly slug?: string;
  readonly thesis?: string;
  readonly venue?: string;
  readonly targetLength?: number;
  readonly protocol?: string;
  readonly voice?: string;
  readonly idempotencyKey?: string;
}

/** One outline claim row (the shared spine-and-sections row; provenance rides the DATA). */
export interface OutlineClaimDto {
  readonly id: string;
  readonly text: string;
  readonly provenance: {
    readonly kind: "thread" | "source" | "user_typed" | "generated";
    readonly turnId?: string;
    readonly url?: string;
    readonly notePath?: string;
  };
  readonly unverified?: boolean;
}

/** The editor DTO (GET /projects/:id/outline): the artifact's head + its parsed outline.json twin. */
export interface OutlineDto {
  readonly artifactId: string;
  readonly slug: string;
  readonly mirrorPath: string;
  readonly versionId: string | null;
  readonly ordinal: number | null;
  readonly words: number | null;
  readonly markdown: string;
  readonly outline: {
    readonly sidecar: "outline";
    readonly version: 1;
    readonly thesis: string;
    readonly venue?: string;
    readonly targetLength?: number;
    readonly protocol?: string;
    readonly voice?: string;
    readonly provenance?: {
      readonly threadId?: string;
      readonly scope?: string;
      readonly runId?: string;
      readonly generatedAt?: string;
      readonly urls?: readonly { readonly url: string; readonly fetchedAt?: string; readonly unverified?: boolean }[];
    };
    readonly spine: readonly string[];
    readonly sections: readonly {
      readonly ref: string;
      readonly title: string;
      readonly targetWords?: number;
      readonly function?: string;
      readonly entry?: string;
      readonly exit?: string;
      readonly claims: readonly OutlineClaimDto[];
    }[];
    readonly alternativesConsidered?: readonly string[];
    readonly gaps: readonly {
      readonly id: string;
      readonly needed: string;
      readonly relatedClaimId?: string;
      readonly sectionRef?: string;
    }[];
  } | null;
  /** the drafts that cite this outline (their existence makes DELETE answer 409 `outline_cited`). */
  readonly citedBy: { readonly runs: readonly string[]; readonly draftIds: readonly string[] };
  readonly editable: boolean;
}

/** The editor's structured save body (PATCH /projects/:id/outline): a full document OR a delta. */
export interface OutlinePatchDto {
  readonly slug?: string;
  readonly outline?: Record<string, unknown>;
  readonly edit?: Record<string, unknown>;
}

// ---- P1.13 — the Figures pane + card DTOs (§7.5; GET /projects/:id/figures[/:figureId]) ----

/** The figure's provenance object (the row's `provenance` jsonb, verbatim §7.5). */
export interface FigureProvenanceDto {
  readonly kind: "selection" | "claim_ledger" | "asset_upload" | "fetched" | "user_typed" | "none";
  readonly refs: readonly {
    readonly url?: string;
    readonly accessedAt?: string;
    readonly claimId?: string;
    readonly assetId?: string;
    readonly transform?: string;
  }[];
  readonly computedBy: "assistant" | "drafter" | "user";
  readonly verification: "unverified" | "verified" | "contradicted" | "unverifiable";
}

/** One Figures-pane row (GET /projects/:id/figures). */
export interface FigureListItemDto {
  readonly id: string;
  readonly assetUri: string;
  readonly title: string;
  readonly caption: string;
  readonly specKind: "vega_lite" | "mermaid" | "table";
  readonly kind: "chart" | "diagram" | "table";
  /** `unverified_data` | `author_supplied` | `verified` | `contradicted` | `unverifiable` | null. */
  readonly badge: string | null;
  readonly badgeText: string | null;
  readonly n: number;
  readonly renderStatus: string;
  readonly hasRender: boolean;
  readonly insertedInDraftId: string | null;
  readonly pendingProposal: boolean;
  readonly latestRunId: string | null;
}

/** One figure_versions row on the card's Versions strip. */
export interface FigureVersionDto {
  readonly n: number;
  readonly request: string | null;
  readonly renderStatus: string;
  readonly renderError: string | null;
  readonly createdAt: string;
}

/** The open insert-proposal's state (the card's anchor + pinned block markdown). */
export interface FigurePendingProposalDto {
  readonly draftId: string;
  readonly afterBlockId: string | null;
  readonly version: number;
  readonly markdown: string;
  readonly at: string;
}

/** The figure card (GET /projects/:id/figures/:figureId) — preview + disclosures + readiness. */
export interface FigureCardDto {
  readonly id: string;
  readonly assetUri: string;
  readonly title: string;
  readonly caption: string;
  readonly alt: string;
  readonly sourceLine: string;
  readonly specKind: "vega_lite" | "mermaid" | "table";
  readonly kind: "chart" | "diagram" | "table";
  readonly provenance: FigureProvenanceDto;
  readonly badge: string | null;
  readonly badgeText: string | null;
  readonly latestRunId: string | null;
  readonly insertedInDraftId: string | null;
  readonly insertedAtVersionId: string | null;
  readonly pendingProposal: FigurePendingProposalDto | null;
  readonly versions: readonly FigureVersionDto[];
  readonly files: {
    readonly spec: string | null;
    readonly dataCsv: string | null;
    readonly svgLight: string | null;
    readonly svgDark: string | null;
    readonly tableSource: string | null;
  };
  readonly render: { readonly lightAvailable: boolean; readonly darkAvailable: boolean; readonly pngAvailable: boolean };
  readonly readiness: { readonly ok: boolean; readonly missing: readonly ("alt" | "sourceLine")[] };
}

/** The figure-run facts the `/visualize` sheet + run creation carry (§7.5 entry points). */
export interface FigureRunFactsDto {
  /** iterate runs name the existing figure; absent ⇒ the api mints the row. */
  readonly figureId?: string;
  /** the §7.5 entry point (chat / selection / command / edit_block / craft_finding). */
  readonly entryPoint?: string;
  /** the verbatim visualize request ("make a chart of the visibility scores"). */
  readonly request: string;
  readonly specKind?: "vega_lite" | "mermaid" | "table";
  /** the provenance seeds the entry point implies (all optional — the honesty step classifies). */
  readonly sourceRefs?: {
    readonly selection?: { readonly draftId?: string; readonly quote?: string };
    readonly claimIds?: readonly string[];
    readonly assetId?: string;
    readonly url?: string;
    readonly typedRows?: readonly Record<string, unknown>[];
    /** the user insisted on unsourced numbers (the refuse→insist path → kind:"none"). */
    readonly insisted?: boolean;
  };
  /** iterate runs name the version they continue from (Versions-strip "iterate from here"). */
  readonly priorVersion?: number;
}

/** A type-chip edit (POST …/spec-edit): the 0-cr mark change. */
export interface FigureSpecEditDto {
  readonly mark: "bar" | "line" | "point" | "area" | "rect" | "tick" | "arc" | "rule" | "circle" | "square";
}

/** A propose request (POST …/proposals): the draft + the optional after-block anchor. */
export interface FigureProposeDto {
  readonly draftId: string;
  readonly afterBlockId?: string;
}

/** The propose response — the pending card + the exact block markdown accept will splice. */
export interface FigureProposedDto {
  readonly ok: true;
  readonly pendingProposal: FigurePendingProposalDto;
  readonly block: string;
}

/** The accept response — the forked/updated draft version the splice produced. */
export interface FigureAcceptedDto {
  readonly ok: true;
  readonly inserted: {
    readonly figureId: string;
    readonly draftId: string;
    readonly draftN: number;
    readonly draftVersionId: string;
    readonly forked: boolean;
  };
}

export interface ApiClientOptions {
  /** The api base URL (no trailing slash needed). */
  readonly baseUrl: string;
  /** Injectable fetch (default the global) — SSR/tests supply their own. */
  readonly fetch?: typeof fetch;
  /** Default headers applied to every request (e.g. a forwarded session cookie). */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RequestInitLite {
  readonly headers?: Readonly<Record<string, string>>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message?: string,
    /**
     * The api's stable `{error}` code when the response body carried one (PRB.13 — lets a caller
     * distinguish a 403's reason: `account_suspended` vs `email_unverified` vs an invite refusal).
     */
    readonly code?: string,
  ) {
    super(message ?? `api ${status} for ${url}`);
    this.name = "ApiError";
  }
}

export interface ApiClient {
  /** List the signed-in principal's projects with their derived §6.3 state (session forwarded via headers).
   *  `scope: "deleted"` reads back only the soft-deleted rows (the §5.2 30-day restore window). */
  listProjects(init?: RequestInitLite, opts?: { scope?: "deleted" }): Promise<ProjectRow[]>;
  /** Validate a beta invite code (and, for an email-bound invite, the email) before a signup is attempted. */
  checkInvite(code: string, email?: string): Promise<InviteCheckDto>;
  /**
   * PRB.13 — admit + provision an account through `POST /signup` (REQ-BETA-19 amended 2026-09-16): in
   * `invite` mode a valid code is required and consumed at creation; in `open` mode the code is optional.
   * Expected refusals resolve as `{ok:false, error}` — the same data shape `checkInvite` returns.
   */
  signup(req: SignupRequestDto): Promise<SignupResultDto>;
  /** The stateless, cached estimate (REQ-SPEC-16) — creates no run row and emits `run.estimated`. */
  estimate(projectId: string, req: EstimateRequestDto, init?: RequestInitLite): Promise<EstimateDto>;
  /** The sheet's Run click — the ONLY run creator (REQ-CHAT-25); the client-minted idempotency key is in the body. */
  createRun(projectId: string, req: CreateRunDto, init?: RequestInitLite): Promise<CreatedRunDto>;
  /**
   * P1.06 — `GET /projects/:id/run-sheet-context` (§5.6): the ONE read the sheet's GET consumes (head
   * draft, derived sections, obligations, entitlement, consent pref, `blockedBy` under the P1.06 ruling).
   */
  runSheetContext(projectId: string, args?: { workflow?: string; scope?: string }, init?: RequestInitLite): Promise<RunSheetContextDto>;
  /** P1.06 (REQ-BILL-4) — `PUT /settings/consent`: the per-user "don't ask under N credits" pref (≤1,000). */
  setConsentPref(dontAskUnder: number, init?: RequestInitLite): Promise<{ ok: true; dontAskUnder: number }>;
  // ---- P1.04 — project home: create + row actions + search + grouping (§5.2/§5.3) ----
  /** `POST /projects` — the §5.3 create (entry + picks + the adopted quarantined conversion). */
  createProject(req: CreateProjectDto, init?: RequestInitLite): Promise<CreatedProjectDto>;
  /** The row action — rename (the slug stays put). */
  renameProject(projectId: string, title: string, init?: RequestInitLite): Promise<{ ok: true }>;
  /** The row action — duplicate drafts + outline + Voice link (never correspondence; origin=duplicate). */
  duplicateProject(projectId: string, init?: RequestInitLite): Promise<CreatedProjectDto>;
  /** The row action — archive (soft; runs block; the row leaves the list). */
  archiveProject(projectId: string, init?: RequestInitLite): Promise<{ ok: true }>;
  /** Restore an archived project to the list. */
  unarchiveProject(projectId: string, init?: RequestInitLite): Promise<{ ok: true }>;
  /** The row action — soft-delete (30-day window; hidden from every read). */
  deleteProject(projectId: string, init?: RequestInitLite): Promise<{ ok: true }>;
  /** Restore a soft-deleted project inside the 30-day window. */
  restoreProject(projectId: string, init?: RequestInitLite): Promise<{ ok: true }>;
  /** `GET /projects/search?q=` — the server-side index over title/Voice/venue/materialized markdown.
   *  P1.06: `projectId` narrows the hits to one project (the ⌘K palette's "Go to" section). */
  searchProjects(q: string, init?: RequestInitLite, opts?: { projectId?: string }): Promise<ProjectSearchHitDto[]>;
  /** The per-user grouping preference (GET /settings/project-grouping). */
  getProjectGrouping(init?: RequestInitLite): Promise<ProjectGroupByDto>;
  /** Set the per-user grouping preference. */
  setProjectGrouping(groupBy: ProjectGroupByDto, init?: RequestInitLite): Promise<{ ok: true }>;
  /** `GET /protocols` — the four §5.3 protocol cards + venue tables + the computed cost band. */
  listProtocolCards(init?: RequestInitLite): Promise<ProtocolCardDto[]>;
  /** P1.04 — the workspace-scoped conversion preview (new-project flow: no project exists yet). */
  previewImportWorkspace(req: ImportRequestDto, init?: RequestInitLite): Promise<ImportPreviewDto>;
  /** Write/replace the user's disposition on a finalized finding (§5.7; reversible until freeze). */
  recordDisposition(
    projectId: string,
    findingId: string,
    req: RecordDispositionDto,
    init?: RequestInitLite,
  ): Promise<DispositionDto>;
  /** P1.07 — Apply (REQ-SPEC-6): splice the finding's suggestion into the working head + accept·applied.
   *  `ApiError(422)` carries `reason` (no_suggestion/already_applied/unanchored/anchor_lost); 409 = frozen. */
  applyFinding(projectId: string, findingId: string, init?: RequestInitLite): Promise<ApplyResultDto>;
  /** P1.07 — promote a reconciliation-rejected second-read finding to the main list (REQ-IDE-26). */
  promoteFinding(
    projectId: string,
    findingId: string,
    init?: RequestInitLite,
  ): Promise<{ ok: true; findingId: string; obligationId?: string }>;
  /** P1.07 — "Add to obligations" on any finding (REQ-OBJ-9); idempotent per root finding. */
  addFindingToObligations(
    projectId: string,
    findingId: string,
    init?: RequestInitLite,
  ): Promise<{ ok: true; obligationId: string }>;
  /** P1.07 — the palette's free-form obligation (REQ-OBJ-10; `source: 'user'`, standing). */
  createObligation(
    projectId: string,
    req: { title: string; severity?: "blocking" | "major" | "minor" | "note" },
    init?: RequestInitLite,
  ): Promise<{ ok: true; obligationId: string }>;
  /** P1.07 — the shared deep link: resolve a finding to its dossier's run + anchor. */
  resolveFinding(projectId: string, findingId: string, init?: RequestInitLite): Promise<FindingResolveDto>;
  /** P1.07 — the consolidated bulk preview (§5.7): checklist + spliced diffs + obligations, before writes. */
  previewBulkFindings(
    projectId: string,
    runId: string,
    req: { action: BulkPreviewDto["action"]; section?: string },
    init?: RequestInitLite,
  ): Promise<BulkPreviewDto>;
  /** P1.07 — dispatch a previewed bulk action (§5.7). `only` = the checklist's checked subset —
   *  unchecked rows are never written (no blind accept-all). */
  applyBulkFindings(
    projectId: string,
    runId: string,
    req: { action: BulkPreviewDto["action"]; section?: string; only?: string[] },
    init?: RequestInitLite,
  ): Promise<BulkResultDto>;
  /** The Decisions list — open `decision_requests` for the project (§5.7; beta Inbox stand-in). */
  listDecisions(projectId: string, init?: RequestInitLite): Promise<DecisionItemDto[]>;
  /** Answer a Decisions row (the row's option, or "dismiss"). */
  answerDecision(projectId: string, decisionId: string, answer: string, init?: RequestInitLite): Promise<void>;
  /** The open gate cards for a project's runs (§6.4; the Needs-you surface feed). */
  listGates(projectId: string, init?: RequestInitLite): Promise<GateCardDto[]>;
  /** A gate card's decision (approve / approve_autonomous / keep_planning / wait / stop / hold). */
  decideGate(projectId: string, gateId: string, req: GateDecisionDto, init?: RequestInitLite): Promise<void>;
  /** A presence/reading ping for the gate's presence timer (§6.4 item 2; REQ-SPEC-18). */
  recordGateActivity(
    projectId: string,
    gateId: string,
    activity: "present" | "reading" | "blur",
    init?: RequestInitLite,
  ): Promise<void>;
  /** Pre-triage facts for the Revise sheet — "you pre-triaged N of M" + the user ledger rows. */
  getPretriage(projectId: string, init?: RequestInitLite): Promise<PretriageDto>;
  /** The project's approval-deadline overrides (§6.4 R3; the approve_triage 24-h opt-in lives here). */
  getApprovalOverrides(projectId: string, init?: RequestInitLite): Promise<ApprovalOverridesDto>;
  /** Set the project's approval-deadline overrides — validated server-side (REQ-SPEC-1 rules). */
  setApprovalOverrides(projectId: string, overrides: ApprovalOverridesDto, init?: RequestInitLite): Promise<void>;
  // ---- P1.09 — the approval-policy surface (§6.4 R3; REQ-SPEC-1) ----
  /** `GET /projects/:id/settings/approvals` — policy + overrides + R3 defaults + standing guidance. */
  getApprovalSettings(projectId: string, init?: RequestInitLite): Promise<ApprovalSettingsDto>;
  /** `PUT /projects/:id/settings/approvals` — save the policy and/or overrides (422 on an illegal one). */
  putApprovalSettings(
    projectId: string,
    req: { policy?: "named" | "wait_each" | "run_to_completion"; overrides?: ApprovalOverridesDto },
    init?: RequestInitLite,
  ): Promise<ApprovalSettingsDto>;
  /** `PUT /projects/:id/runs/:runId/gate-overrides` — the per-run override (§6.4; "this run only"). */
  setRunGateOverrides(
    projectId: string,
    runId: string,
    req: { overrides?: ApprovalOverridesDto; gatesOff?: boolean },
    init?: RequestInitLite,
  ): Promise<{ ok: true }>;
  /** `POST /projects/:id/guidance` — add a standing-guidance rule from the settings surface (§6.5). */
  createProjectGuidance(
    projectId: string,
    req: { body: string; workflows?: readonly string[] },
    init?: RequestInitLite,
  ): Promise<{ ok: true; guidanceId: string }>;
  /** `POST /projects/:id/guidance/:gid/retire` — standing guidance retires, never deletes. */
  retireGuidance(projectId: string, guidanceId: string, init?: RequestInitLite): Promise<{ ok: true }>;
  /** `GET /settings/explainers` — the user's dismissed one-time inline explainers. */
  getExplainers(init?: RequestInitLite): Promise<ExplainersDto>;
  /** `POST /settings/explainers/:name/dismiss` — mark the one-time explainer seen (§5.11/§6.4). */
  dismissExplainer(name: string, init?: RequestInitLite): Promise<{ ok: true }>;
  /** The delivered-review dossier (§5.7; PRB.04's live binding) — assembled server-side from delivered rows. */
  getDossier(projectId: string, runId: string, init?: RequestInitLite): Promise<DossierDto>;
  /** The server-joined What-changed read for a delivered response (§5.8; PRB.06). */
  getWhatChanged(projectId: string, responseId: string, init?: RequestInitLite): Promise<WhatChangedDto>;
  /** A comment on a changed hunk → a `Guidance` row the next Revise consumes (§6.5). */
  commentOnHunk(
    projectId: string,
    responseId: string,
    hunkId: string,
    text: string,
    init?: RequestInitLite,
  ): Promise<HunkCommentDto>;
  /** The editor document: markdown + the §6.3 run lock + the projected findings rail (PRB.07). */
  getEditorDoc(projectId: string, draftId: string, init?: RequestInitLite & { opts?: EditorDocOptions }): Promise<EditorDocDto>;
  /** P1.02 — resolve a `/v/:n|working` ref to its draft (for the Page's versioned routes). */
  resolveEditorDraft(projectId: string, v: string, init?: RequestInitLite): Promise<EditorResolveDto>;
  /** P1.02 — the project's stored CSL-JSON bibliography. */
  getBibliography(projectId: string, init?: RequestInitLite): Promise<BibliographyDto>;
  /** P1.02 — import a bibliography (BibTeX / CSL-JSON / Zotero export text) into the project's items. */
  importBibliography(
    projectId: string,
    req: { format?: string; content: string },
    init?: RequestInitLite,
  ): Promise<BibliographyImportDto>;
  /** P1.02 — the read-only Page read for a non-draft artifact (`/a/:artifactId`). */
  getArtifactPage(projectId: string, artifactId: string, init?: RequestInitLite): Promise<EditorDocDto>;
  // ---- P1.08 — §5.8 versions/compare/restore + the §5.13 Files pane ----
  /** The version rail read model (every origin, flags, the ⚑ chip). */
  getVersions(projectId: string, init?: RequestInitLite): Promise<VersionRailDto>;
  /** The generalized compare: any draft pair (`m` may be `working`), server-projected. */
  getVersionDiff(projectId: string, n: string, m: string, init?: RequestInitLite): Promise<VersionDiffDto>;
  /** A comment on a compare hunk → `Guidance{source:'inline_comment'}` for the next Revise. */
  commentOnCompareHunk(
    projectId: string,
    n: string,
    m: string,
    hunkId: string,
    text: string,
    init?: RequestInitLite,
  ): Promise<HunkCommentDto>;
  /** The §5.13 Files pane — typed sections; default rows carry no I/H kinds. */
  getFiles(projectId: string, init?: RequestInitLite): Promise<FilesDto>;
  /** The §5.8-grouped restore points for a draft's live doc. */
  listRestorePoints(projectId: string, draftId: string, init?: RequestInitLite): Promise<RestorePointsDto>;
  /** The point's reconstructed content diffed against the current head (all-Unlinked view). */
  previewRestorePoint(
    projectId: string,
    draftId: string,
    pointId: string,
    init?: RequestInitLite,
  ): Promise<RestorePreviewDto>;
  /** The undoable restore apply — writes a pre-restore snapshot, then saveManualRevision. */
  applyRestorePoint(
    projectId: string,
    draftId: string,
    pointId: string,
    init?: RequestInitLite,
  ): Promise<RestoreApplyDto>;
  /** The debounced autosave — forks a frozen head to v(N+1) `human_revision` on first save (REQ-DATA-24).
   *  Throws `ApiError(409)` while a run holds the head (read-only during runs, §6.3). */
  saveEditorDraft(
    projectId: string,
    draftId: string,
    markdown: string,
    init?: RequestInitLite & {
      /** P1.02 — the live provenance capture the Page sends with the save. */
      meta?: { provenanceSpans?: { blockId: string; source: unknown }[]; agentSpans?: { blockId: string; from: number; to: number }[] };
    },
  ): Promise<EditorSaveDto>;
  /** The one note field → a Guidance row the next Revise consumes (REQ-DATA-41's comment path). */
  postEditorNote(projectId: string, draftId: string, text: string, init?: RequestInitLite): Promise<EditorNoteDto>;
  /** "Cancel run to edit" — cancels the run holding the head (§6.3 banner release). */
  cancelEditorRun(projectId: string, draftId: string, init?: RequestInitLite): Promise<EditorCancelRunDto>;
  /** "Revise using your edits" (REQ-DATA-26): review of vN + base v(N+1); lost quotes auto-mooted. */
  reviseWithEdits(projectId: string, draftId: string, init?: RequestInitLite): Promise<EditorReviseDto>;
  /** PRB.08 — the account's spendable balance + suspension + the beta Payment Link (§14.6). */
  getBillingBalance(init?: RequestInitLite): Promise<BillingBalanceDto>;
  /** PRB.08 — record `credits.exhausted_prompt{action_taken}` when the exhaustion panel resolves (REQ-BETA-12). */
  recordExhaustedPrompt(actionTaken: string, init?: RequestInitLite): Promise<void>;
  // ---- PRB.12 — beta analytics + privacy + the usage glance ----
  /** Mint a client-whitelisted analytics event (view/dwell/timer). `recorded:false` ⇒ the user opted out. */
  postAnalyticsEvent(
    req: AnalyticsEventRequestDto,
    init?: RequestInitLite,
  ): Promise<{ ok: boolean; recorded: boolean }>;
  /**
   * P1.17 — the §3.5 acquisition funnel mint (POST /analytics/acquisition): the small funnel set —
   * entry.chosen / outline.approved / paywall.shown / showcase.* / email.verified / landing.* —
   * with identity bound server-side from the session.
   */
  postAcquisitionEvent(
    req: AcquisitionEventRequestDto,
    init?: RequestInitLite,
  ): Promise<{ ok: boolean; recorded: boolean }>;
  /** P1.17 — the pre-auth landing beacon (POST /analytics/landing → acquisition_events). The caller
   *  MAY forward the client IP in `init.headers["x-forwarded-for"]` — the api hashes it for dedupe. */
  recordLandingEvent(req: LandingEventRequestDto, init?: RequestInitLite): Promise<{ ok: boolean }>;
  /**
   * P1.17 (§15.4) — GET /showcase: the workspace's Showcase entry (slug/dossier run/opened flag)
   * + the recorded signup intent — the `GET /app` precedence redirect's read.
   */
  getShowcase(init?: RequestInitLite): Promise<ShowcaseEntryDto>;
  /** The account's analytics opt-out flag (the Settings toggle's read). */
  getPrivacySettings(init?: RequestInitLite): Promise<PrivacySettingsDto>;
  /** Flip `analytics_opt_out` (REQ-PROD-15 — stops future writes AND hides existing rows from reads). */
  setAnalyticsOptOut(analyticsOptOut: boolean, init?: RequestInitLite): Promise<PrivacySettingsDto>;
  /** The level-1 usage glance: the balance + the account's recent runs' spend (P0.11 data). */
  getUsage(init?: RequestInitLite): Promise<UsageDto>;
  // ---- P1.16 — billing, full (§14.2/14.3/14.5/14.6) ----
  /** The published plan ladder + trial + top-up packs (the pricing page's payload). */
  getPlans(init?: RequestInitLite): Promise<BillingPlansDto>;
  /** Mint a Stripe Checkout session (subscribe / top-up / auto-reload setup); redirect to `url`. */
  startCheckout(req: CheckoutRequestDto, init?: RequestInitLite): Promise<CheckoutSessionDto>;
  /** Mint a Stripe Billing-Portal session (plan/card management lives Stripe-side). */
  createBillingPortalSession(returnTo?: string, init?: RequestInitLite): Promise<{ url: string }>;
  /** The billing settings read: plan, subscription, trial state, auto-reload, Stripe link. */
  getSubscription(init?: RequestInitLite): Promise<BillingSubscriptionDto>;
  /** Cancel = cancel_at_period_end — the plan runs to the paid-through date (§14.6). */
  cancelSubscription(init?: RequestInitLite): Promise<{ applied: boolean }>;
  /** Change plan: an upgrade applies now; a downgrade schedules to period end. */
  changePlan(tier: string, cycle?: "monthly" | "annual", init?: RequestInitLite): Promise<{ applied: "now" | "scheduled" } | { error: string }>;
  /** The checkout-return poll (webhook lag ≤30 s, then the email fallback). */
  getCheckoutSession(sessionId: string, init?: RequestInitLite): Promise<CheckoutStatusDto>;
  /** Opt in/out of auto-reload — the only unattended charge path (REQ-BILL-17). */
  setAutoReload(req: AutoReloadRequestDto, init?: RequestInitLite): Promise<{ ok: true }>;
  /** The Team tier's waitlist row (§14.2 — the tier is listed; mechanics out of scope). */
  joinTeamWaitlist(
    req: { email: string; seats?: number; note?: string },
    init?: RequestInitLite,
  ): Promise<{ ok: true }>;
  /** §14.5 level 1 — the account usage dashboard read. */
  getUsageAccount(init?: RequestInitLite): Promise<UsageAccountDto>;
  /** §14.5 level 2 — one project's spend rollup. */
  getUsageProject(projectId: string, init?: RequestInitLite): Promise<UsageProjectDto>;
  /** §14.5 level 4 — the phase×seat×model drill-down behind the run report's Advanced disclosure. */
  getUsageRunAdvanced(runId: string, init?: RequestInitLite): Promise<UsageRunAdvancedDto>;
  /** The §14.5 level-1 CSV export (REQ-BILL-11 — the RFC-4180 download). */
  downloadUsageCsv(init?: RequestInitLite): Promise<ExportDownloadDto>;
  /** The public rate-table publication (REQ-BILL-19) — the run report's rate-table link target. */
  getRates(init?: RequestInitLite): Promise<RatesPublicationDto>;
  // ---- P1.01 — theme policy (REQ-IDE-38 amended) ----
  /** The resolved session principal — the pane-storage key's userId + the boot asserts' "am I signed in". */
  getSession(init?: RequestInitLite): Promise<PrincipalDto>;
  /** The per-user app theme (dark | light | auto — dark default; §5.9 theme policy). */
  getTheme(init?: RequestInitLite): Promise<ThemeSettingsDto>;
  /** Set the app theme (the Settings control; the IDE's light/dark/auto cycle posts here). */
  setTheme(appTheme: ThemeSettingsDto["appTheme"], init?: RequestInitLite): Promise<ThemeSettingsDto>;
  /** Set a project's paper pin (⌘⇧L posts here — 'light' | 'follow' | 'dark'). */
  setPaperTheme(
    projectId: string,
    paperTheme: PaperThemeDto["paperTheme"],
    init?: RequestInitLite,
  ): Promise<PaperThemeDto>;
  // ---- PRB.10 — Quick Voice (§9.2–§9.6) ----
  /** The library's flat persona list — every persona + its shared pill. */
  listVoices(init?: RequestInitLite): Promise<VoiceListRowDto[]>;
  /** P1.14 — the /app/voices three-group destination (§9.1): your voices, house styles, shared. */
  listVoiceGroups(init?: RequestInitLite): Promise<VoiceListDto>;
  /** The §9.2 creation sheet — name + byline + optional description + Mode metadata. */
  createVoice(req: CreateVoiceDto, init?: RequestInitLite): Promise<CreatedVoiceDto>;
  /** The voice detail read: status + samples + build history + profile artifacts. */
  getVoice(personaId: string, init?: RequestInitLite): Promise<VoiceDetailDto>;
  /** Upload/paste a sample through the §9.5 model (REQ-INGEST-1); returns the refreshed corpus words. */
  addVoiceSample(personaId: string, req: AddVoiceSampleDto, init?: RequestInitLite): Promise<AddedVoiceSampleDto>;
  /** The per-item include/omit toggle (REQ-INGEST-4). */
  setVoiceSampleIncluded(
    personaId: string,
    itemId: string,
    included: boolean,
    init?: RequestInitLite,
  ): Promise<{ status: VoiceStatusDto | null }>;
  /** The seed editor's save — recomputes the J9 hash and flips the pill live (§9.3; REQ-PERSONA-4). */
  saveVoiceSeed(personaId: string, req: SaveVoiceSeedDto, init?: RequestInitLite): Promise<SavedVoiceSeedDto>;
  /** The ≤500 ms tier estimate over the current included corpus (REQ-PERSONA-3). */
  estimateVoice(personaId: string, tier: "quick" | "full", init?: RequestInitLite): Promise<VoiceEstimateDto>;
  /** "Create and build" — a `profile_voice{tier}` run (§9.2 item 3). */
  buildVoice(personaId: string, req: BuildVoiceDto, init?: RequestInitLite): Promise<BuiltVoiceDto>;
  /** Cancel an open build run. */
  cancelVoiceRun(runId: string, init?: RequestInitLite): Promise<{ runId: string; state: string }>;
  /** P1.14 — resolve a persona run's gate (the approve_sample card; §9.2/§6.4). Run-scoped — the
   *  voice build is a persona run, not a project run. */
  decideRunGate(runId: string, gateId: string, req: GateDecisionDto, init?: RequestInitLite): Promise<void>;
  /** P1.14 — the fetcher-only URL ingestion path: the URL is fetched server-side, never by the
   *  sample's reader (REQ-INGEST-13). */
  addVoiceSampleUrl(personaId: string, req: AddVoiceSampleUrlDto, init?: RequestInitLite): Promise<AddedVoiceSampleUrlDto>;
  /** P1.14 — the diff-of-inputs sheet's pre-computed route + estimate (§9.3). */
  getVoiceUpdatePlan(personaId: string, init?: RequestInitLite): Promise<VoiceUpdatePlanDto>;
  /** P1.14 — the ONE Update-voice verb: absent `scope` ⇒ the routed scope (§9.3; REQ-SPEC-27). */
  updateVoice(personaId: string, req: UpdateVoiceDto, init?: RequestInitLite): Promise<UpdatedVoiceDto>;
  /** P1.14 — "Correct this in your description": a blockquote on PERSONA.md + a consume-once
   *  corrections row (§9.4; REQ-PERSONA-7). */
  addVoiceCorrection(
    personaId: string,
    req: AddVoiceCorrectionDto,
    init?: RequestInitLite,
  ): Promise<AddedVoiceCorrectionDto>;
  /** P1.14 — the read-only (house/shared) card's copy becomes your editable persona (§9.1). */
  forkVoice(personaId: string, init?: RequestInitLite): Promise<ForkedVoiceDto>;
  // ---- P1.15 — the §9.5 ingestion surface (the Samples tab) ----
  /** The Sources pane list — linked providers + status + per-source item counts. */
  listVoiceConnections(personaId: string, init?: RequestInitLite): Promise<VoiceConnectionsDto>;
  /** Link a source (substack | substack_export | url). NEVER accepts a credential (AC-I-B). */
  createVoiceConnection(
    personaId: string,
    req: CreateVoiceConnectionDto,
    init?: RequestInitLite,
  ): Promise<CreatedVoiceConnectionDto>;
  /** The review step — discovery rows only, never bodies (REQ-INGEST-3). */
  discoverVoiceConnection(
    personaId: string,
    connectionId: string,
    init?: RequestInitLite,
  ): Promise<DiscoveredVoiceConnectionDto>;
  /** Persist the reviewed include/omit set, then the fetch pass (REQ-INGEST-4). */
  confirmVoiceConnection(
    personaId: string,
    connectionId: string,
    req: ConfirmVoiceConnectionDto,
    init?: RequestInitLite,
  ): Promise<VoiceSyncResponseDto>;
  /** The manual Re-sync (REQ-INGEST-6). */
  syncVoiceConnection(
    personaId: string,
    connectionId: string,
    init?: RequestInitLite,
  ): Promise<VoiceSyncResponseDto>;
  /** "Re-sync all" — one job per live connection. */
  syncAllVoiceConnections(personaId: string, init?: RequestInitLite): Promise<VoiceSyncResponseDto>;
  /** The per-source settings (auto-include new items; daily auto-sync). */
  patchVoiceConnection(
    personaId: string,
    connectionId: string,
    req: PatchVoiceConnectionDto,
    init?: RequestInitLite,
  ): Promise<{ ok: true }>;
  /** Remove: soft-detach the source — items + versions are retained. */
  removeVoiceConnection(
    personaId: string,
    connectionId: string,
    init?: RequestInitLite,
  ): Promise<{ ok: true }>;
  /** The item preview: canonical document + quality notes + version list (the quality drawer). */
  getVoiceSample(personaId: string, itemId: string, init?: RequestInitLite): Promise<VoiceSampleDetailDto>;
  /** The version-history list (v1..vN newest first). */
  listVoiceSampleVersions(
    personaId: string,
    itemId: string,
    init?: RequestInitLite,
  ): Promise<VoiceSampleVersionsDto>;
  /** The ORIGINAL bytes (the side-by-side preview's raw side — a PDF page for pdf.js). */
  getVoiceSampleRaw(personaId: string, itemId: string, init?: RequestInitLite): Promise<ExportDownloadDto>;
  /** The priced reconstruction pass (REQ-INGEST-10): omit `confirmed` to read the estimate; pass
   *  `confirmed: true` to enqueue the metered worker job. `tier:'visual'` is the opt-in ~180-credit pass. */
  reconstructVoiceSample(
    personaId: string,
    itemId: string,
    req: ReconstructVoiceSampleDto,
    init?: RequestInitLite,
  ): Promise<ReconstructVoiceSampleResponseDto>;
  /** Delete the voice (REQ-INGEST-16): the persona vanishes from every read; the purge job cascades. */
  deleteVoice(personaId: string, init?: RequestInitLite): Promise<DeletedVoiceDto>;
  /** The project's linked-voice facts (the run-sheet line / picker chip; §9.6). */
  getProjectVoice(projectId: string, init?: RequestInitLite): Promise<ProjectVoiceDto>;
  /** REQ-DATA-32 — pin the project's voice (personaId null ⇒ "No voice" / ad-hoc). P1.14: `register`
   *  is a run input, never a pin — a register-only patch stays open even under the soft lock. */
  setProjectVoice(
    projectId: string,
    req: { personaId: string | null; profileSnapshotId?: string | null; register?: string | null },
    init?: RequestInitLite,
  ): Promise<ProjectVoiceDto>;
  /** P1.14 — adopt hatch: pin the refreshed snapshot (§9.6; REQ-DATA-30); `reseed` launches a
   *  reseed_charter run that rewrites the charter's seeded lines only. */
  adoptProjectVoice(projectId: string, req: AdoptProjectVoiceDto, init?: RequestInitLite): Promise<AdoptedProjectVoiceDto>;
  /** P1.14 — fork hatch: a NEW project at `outlined` with the outline copied, drafts not (§9.6). */
  forkProjectVoice(projectId: string, req: ForkProjectVoiceDto, init?: RequestInitLite): Promise<ForkedProjectVoiceDto>;
  /** P1.14 — the adopt dialog's charter diff; guidance lines never appear in it (§9.6). */
  getVoiceReseedPreview(projectId: string, init?: RequestInitLite): Promise<ReseedPreviewDto>;
  // ---- PRB.11 — export + the AI-use statement ----
  /** The export dialog read (formats, the never-blocking obligation line + links, the statement preview).
   *  Opening the dialog sweeps `pre_export` deferral horizons (REQ-OBJ-3). */
  getExportDialog(projectId: string, init?: RequestInitLite): Promise<ExportDialogDto>;
  /** POST /projects/:id/export → the binary download. Never blocks on obligations (§11.7). */
  exportProject(projectId: string, req: ExportRequestDto, init?: RequestInitLite): Promise<ExportDownloadDto>;
  // ---- P1.18 — the whole-account zip (REQ-ACCT-3) ----
  /** GET /account/export — the latest build's state (null when never requested). */
  getAccountExportState(init?: RequestInitLite): Promise<{ export: AccountExportDto | null }>;
  /** POST /account/export — enqueue the build; deduped when a build runs or a link still lives. */
  requestAccountExport(init?: RequestInitLite): Promise<{ export: AccountExportDto; deduped: boolean }>;
  /** GET /account/export/download → a presigned object URL for the ready zip (410 when expired). */
  getAccountExportDownloadUrl(exportId?: string, init?: RequestInitLite): Promise<{ downloadUrl: string }>;
  /** POST /account/import — replay an export zip into this (fresh) account; idempotent. */
  importAccountExport(zipBytes: ArrayBuffer | Uint8Array, init?: RequestInitLite): Promise<AccountImportResultDto>;
  /** GET /projects/:id/ai-use — the statement JSON; `format` returns the standalone binary download. */
  getAiUseStatement(projectId: string, init?: RequestInitLite): Promise<AiUseStatementDto>;
  downloadAiUseStatement(
    projectId: string,
    format: ExportFormat,
    init?: RequestInitLite,
  ): Promise<ExportDownloadDto>;
  /** Append one author sentence to the statement (REQ-VIS-10 — the ONLY statement write; append-only). */
  appendAiUseAddition(
    projectId: string,
    sentence: string,
    init?: RequestInitLite,
  ): Promise<AiUseAdditionDto>;
  // ---- PRB.20 — import (browser upload → quarantine → convert → preview → draft 1) ----
  /** POST /import/presign — mint a workspace-scoped quarantine key + a ≤25 MB v4-signed PUT. */
  presignImportUpload(init?: RequestInitLite): Promise<PresignedImportDto>;
  /** POST /projects/:id/import/preview — convert the quarantine key → §5.3 preview. With `waitMs` the
   *  api answers `pending` instead of holding through a cold Job (PRB.21); retry to join the same run. */
  previewImport(projectId: string, req: ImportRequestDto, init?: RequestInitLite): Promise<ImportPreviewDto>;
  /** POST /projects/:id/import/create — convert + write the frozen `human_upload` draft 1 (201). */
  createImport(projectId: string, req: ImportRequestDto, init?: RequestInitLite): Promise<CreatedImportDraftDto>;
  // ---- P1.05 — the Timeline round log, run report, and §6.5 steering ----
  /** GET /projects/:id/timeline — the round log: per-run cards, rounds, the next-step card. */
  getTimeline(projectId: string, init?: RequestInitLite): Promise<TimelineDto>;
  /** GET /runs/:id/report — the Level-3 report; `advanced` adds the Level-4 drill-down. */
  getRunReport(runId: string, opts?: { advanced?: boolean }, init?: RequestInitLite): Promise<RunReportDto>;
  /** POST /runs/:id/pause — "Pause after this phase" (honored at the next committed boundary). */
  pauseRun(runId: string, init?: RequestInitLite): Promise<{ ok: true; state: string }>;
  /** POST /runs/:id/resume — resume a steering-parked run; `note` captures Resume-with-note. */
  resumeRun(runId: string, req?: { note?: string }, init?: RequestInitLite): Promise<{ ok: true; state: string }>;
  /** POST /runs/:id/notes — a note for the next phase → Guidance{queued_message}. */
  postRunNote(runId: string, text: string, init?: RequestInitLite): Promise<{ ok: true; guidanceId: string }>;
  /** POST /runs/:id/stop — Stop, keep partials. */
  stopRun(runId: string, init?: RequestInitLite): Promise<{ ok: true; state: string }>;
  /** POST /runs/:id/walkthrough/retry — re-enqueue the one package-class walkthrough call. */
  retryWalkthrough(runId: string, init?: RequestInitLite): Promise<{ status: string }>;

  // ---- P1.11 — the Assistant chat surface (§7.1/§7.4/§7.6) ----
  /** GET /projects/:id/chat — the Desk Chat read (threads, turns, pins, sources, the empty state). */
  getChat(projectId: string, opts?: { thread?: string }, init?: RequestInitLite): Promise<ChatPanelDto>;
  /** POST /projects/:id/chat/threads — a named thread (the default "Project chat" exists already). */
  createChatThread(projectId: string, req: { name: string }, init?: RequestInitLite): Promise<{ thread: ChatThreadDto }>;
  /** DELETE /projects/:id/chat/threads/:tid — archives purge thread files; the default is undeletable. */
  deleteChatThread(projectId: string, threadId: string, init?: RequestInitLite): Promise<{ ok: true }>;
  /** POST …/threads/:tid/turns — send a message; creates the turn's `chat_turn` run (plan card = consent). */
  postChatTurn(
    projectId: string,
    threadId: string,
    req: ChatTurnRequestDto,
    init?: RequestInitLite,
  ): Promise<ChatTurnCreatedDto>;
  /** GET …/threads/:tid/turns/:runId — the turn's status + the metered cost strip. */
  getChatTurn(
    projectId: string,
    threadId: string,
    runId: string,
    init?: RequestInitLite,
  ): Promise<ChatTurnStatusDto>;
  /** POST …/threads/:tid/plan-decision — run_research returns the research_burst SHEET (never a run). */
  postChatPlanDecision(
    projectId: string,
    threadId: string,
    req: { runId?: string; action: "run_research" | "first_step" | "edit" | "cancel" },
    init?: RequestInitLite,
  ): Promise<ChatPlanDecisionDto>;
  /** POST …/threads/:tid/pins — pin a fact/ref/source (≤12; `dropOldest` rotates the oldest out). */
  addChatPin(
    projectId: string,
    threadId: string,
    req: { summary: string; kind?: "fact" | "ref" | "source"; ref?: string; dropOldest?: boolean },
    init?: RequestInitLite,
  ): Promise<ChatPinsDto>;
  /** DELETE …/threads/:tid/pins/:pinId — unpin. */
  removeChatPin(
    projectId: string,
    threadId: string,
    pinId: string,
    init?: RequestInitLite,
  ): Promise<ChatPinsDto>;
  /** GET …/threads/:tid/remembers — "what the assistant remembers" (brief + pins, read-only). */
  getChatRemembers(projectId: string, threadId: string, init?: RequestInitLite): Promise<ChatRemembersDto>;
  /** POST …/threads/:tid/remembers/corrections — a correction lands as a Guidance-class note. */
  postChatCorrection(
    projectId: string,
    threadId: string,
    req: { text: string },
    init?: RequestInitLite,
  ): Promise<{ ok: true; guidanceId: string }>;
  /** POST /projects/:id/chat/attachments — quarantine key → convert → an assistant source note. */
  postChatAttachment(
    projectId: string,
    req: { quarantineKey: string; filename: string; mediaType: string; threadId?: string; waitMs?: number },
    init?: RequestInitLite,
  ): Promise<ChatAttachmentDto>;
  /** GET /projects/:id/chat/sources — the "Chat sources" list (read-only). */
  getChatSources(projectId: string, init?: RequestInitLite): Promise<{ sources: ChatSourceDto[] }>;
  /** POST /projects/:id/chat/suggestions — "Ask about this draft" (≤1 paragraph or a 422 refusal). */
  postChatSuggestion(
    projectId: string,
    req: { anchor: { ref: string; version?: number; block?: string }; replacement: string },
    init?: RequestInitLite,
  ): Promise<ChatSuggestionDto>;
  /** POST /projects/:id/chat/notes — "Paste my notes" → agents/author/notes.md (the scratch path). */
  postChatNote(projectId: string, req: { text: string }, init?: RequestInitLite): Promise<{ ok: true; path: string }>;

  // ---- P1.12 — the Outline surface (§7.3) ----
  /** GET /projects/:id/outline/promotion — the promotion sheet's facts (scope: thread|turn|research). */
  getOutlinePromotion(
    projectId: string,
    opts: { scope?: "thread" | "turn" | "research"; threadId?: string; turnId?: string; tier?: string; rigor?: string; slug?: string },
    init?: RequestInitLite,
  ): Promise<OutlinePromotionDto>;
  /** POST /projects/:id/outline/promotions — create the `outline` run (the sheet's Promote = consent). */
  promoteOutline(
    projectId: string,
    req: OutlinePromoteRequestDto,
    init?: RequestInitLite,
  ): Promise<{ runId: string; state: string; deduped: boolean; slug: string }>;
  /** GET /projects/:id/outline — the editor DTO (head artifact + parsed twin + citations). */
  getOutline(projectId: string, opts?: { slug?: string }, init?: RequestInitLite): Promise<OutlineDto>;
  /** PATCH /projects/:id/outline — the autosave: full document or a structured delta → new versions. */
  patchOutline(
    projectId: string,
    req: OutlinePatchDto,
    init?: RequestInitLite,
  ): Promise<{ ok: true; versionIds: string[]; versionId: string | null; ordinal: number | null }>;
  /** DELETE /projects/:id/outline — refused 409 `outline_cited` while a draft cites the outline. */
  deleteOutline(projectId: string, opts?: { slug?: string }, init?: RequestInitLite): Promise<{ ok: true }>;
  /** POST /projects/:id/outline/gaps/:gapId/answer — a gap's Answer → a `user_typed` claim row. */
  answerOutlineGap(
    projectId: string,
    gapId: string,
    req: { text: string; slug?: string },
    init?: RequestInitLite,
  ): Promise<{ ok: true; versionIds: string[] }>;
  // ---- P1.13 — the Figures pane + card (§7.5) ----
  /** GET /projects/:id/figures — the pane list (badge + insert/render state per card). */
  listFigures(projectId: string, init?: RequestInitLite): Promise<FigureListItemDto[]>;
  /** GET /projects/:id/figures/:figureId — the card (preview + disclosures + readiness). */
  getFigure(projectId: string, figureId: string, init?: RequestInitLite): Promise<FigureCardDto>;
  /** PATCH …/figures/:figureId — the card's field edits (title/caption/alt ≤250/sourceLine). */
  patchFigure(
    projectId: string,
    figureId: string,
    req: { title?: string; caption?: string; alt?: string; sourceLine?: string },
    init?: RequestInitLite,
  ): Promise<FigureCardDto>;
  /** POST …/proposals — the insert-as-proposal card (gated on alt + sourceLine). */
  proposeFigure(
    projectId: string,
    figureId: string,
    req: FigureProposeDto,
    init?: RequestInitLite,
  ): Promise<FigureProposedDto>;
  /** POST …/proposals/accept — ONE tx: the block splices through the draft save path (frozen ⇒ fork). */
  acceptFigureProposal(projectId: string, figureId: string, init?: RequestInitLite): Promise<FigureAcceptedDto>;
  /** POST …/proposals/reject — clear the pending card; the asset stays in working figures. */
  rejectFigureProposal(projectId: string, figureId: string, init?: RequestInitLite): Promise<{ ok: true }>;
  /** POST …/spec-edit — the 0-cr type-chip (a Vega-Lite mark edit → new version + re-render). */
  editFigureSpec(
    projectId: string,
    figureId: string,
    req: FigureSpecEditDto,
    init?: RequestInitLite,
  ): Promise<{ ok: true; n: number; specVersionId: string | null }>;
  /** POST …/versions/:n/restore — copy version n's spec/data/provenance to head + re-render. */
  restoreFigureVersion(projectId: string, figureId: string, n: number, init?: RequestInitLite): Promise<{ ok: true }>;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/+$/, "");
  const baseHeaders = opts.headers ?? {};

  async function json<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${base}${path}`;
    const res = await f(url, {
      ...init,
      headers: { ...baseHeaders, ...(init.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) {
      // Surface the api's stable `{error}` code on the ApiError so callers can branch on it.
      const errBody = (await res.json().catch(() => null)) as { error?: unknown } | null;
      throw new ApiError(
        res.status,
        url,
        undefined,
        typeof errBody?.error === "string" ? errBody.error : undefined,
      );
    }
    return (await res.json()) as T;
  }

  /** A binary download (the export POST / standalone statement GET): bytes + media type + filename. */
  async function download(path: string, init: RequestInit): Promise<ExportDownloadDto> {
    const url = `${base}${path}`;
    const res = await f(url, {
      ...init,
      headers: { ...baseHeaders, ...(init.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) throw new ApiError(res.status, url);
    const cd = res.headers.get("content-disposition") ?? "";
    const fileName = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? "export";
    return {
      bytes: await res.arrayBuffer(),
      mediaType: res.headers.get("content-type") ?? "application/octet-stream",
      fileName,
    };
  }

  return {
    async listProjects(init?: RequestInitLite, opts?: { scope?: "deleted" }): Promise<ProjectRow[]> {
      const body = await json<{ projects: ProjectRow[] }>(
        opts?.scope === "deleted" ? "/projects?scope=deleted" : "/projects",
        {
          method: "GET",
          headers: init?.headers as Record<string, string> | undefined,
        },
      );
      return body.projects;
    },
    async checkInvite(code: string, email?: string): Promise<InviteCheckDto> {
      return json<InviteCheckDto>("/invite/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, email }),
      });
    },
    async signup(req: SignupRequestDto): Promise<SignupResultDto> {
      try {
        const body = await json<{ ok: true; created: boolean }>("/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req),
        });
        return { ok: true, created: body.created === true };
      } catch (e) {
        // Expected refusals (invite codes, the 429 throttle) arrive as ApiError carrying the api's
        // `{error}` code — data, not an exception. Anything else (transport, 5xx) rethrows.
        if (e instanceof ApiError && e.status < 500 && e.code) {
          return { ok: false, status: e.status, error: e.code };
        }
        if (e instanceof ApiError && e.status < 500) {
          return { ok: false, status: e.status, error: "signup_failed" };
        }
        throw e;
      }
    },
    async estimate(projectId: string, req: EstimateRequestDto, init?: RequestInitLite): Promise<EstimateDto> {
      return json<EstimateDto>(`/projects/${encodeURIComponent(projectId)}/estimates`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async createRun(projectId: string, req: CreateRunDto, init?: RequestInitLite): Promise<CreatedRunDto> {
      return json<CreatedRunDto>(`/projects/${encodeURIComponent(projectId)}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async runSheetContext(projectId, args, init): Promise<RunSheetContextDto> {
      const qs = new URLSearchParams();
      if (args?.workflow) qs.set("workflow", args.workflow);
      if (args?.scope) qs.set("scope", args.scope);
      const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
      return json<RunSheetContextDto>(
        `/projects/${encodeURIComponent(projectId)}/run-sheet-context${suffix}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async setConsentPref(dontAskUnder, init): Promise<{ ok: true; dontAskUnder: number }> {
      return json<{ ok: true; dontAskUnder: number }>("/settings/consent", {
        method: "PUT",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ dontAskUnder }),
      });
    },
    async recordDisposition(projectId, findingId, req, init): Promise<DispositionDto> {
      return json<DispositionDto>(
        `/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/disposition`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async applyFinding(projectId, findingId, init): Promise<ApplyResultDto> {
      return json<ApplyResultDto>(
        `/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/apply`,
        { method: "POST", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async promoteFinding(projectId, findingId, init) {
      return json<{ ok: true; findingId: string; obligationId?: string }>(
        `/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/promote`,
        { method: "POST", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async addFindingToObligations(projectId, findingId, init) {
      return json<{ ok: true; obligationId: string }>(
        `/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/obligations`,
        { method: "POST", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async createObligation(projectId, req, init) {
      return json<{ ok: true; obligationId: string }>(
        `/projects/${encodeURIComponent(projectId)}/obligations`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async resolveFinding(projectId, findingId, init): Promise<FindingResolveDto> {
      return json<FindingResolveDto>(
        `/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/resolve`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async previewBulkFindings(projectId, runId, req, init): Promise<BulkPreviewDto> {
      return json<BulkPreviewDto>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/findings/bulk-preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async applyBulkFindings(projectId, runId, req, init): Promise<BulkResultDto> {
      return json<BulkResultDto>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/findings/bulk`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async listDecisions(projectId, init): Promise<DecisionItemDto[]> {
      const body = await json<{ decisions: DecisionItemDto[] }>(
        `/projects/${encodeURIComponent(projectId)}/decisions`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
      return body.decisions;
    },
    async answerDecision(projectId, decisionId, answer, init): Promise<void> {
      await json<{ ok: true }>(
        `/projects/${encodeURIComponent(projectId)}/decisions/${encodeURIComponent(decisionId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({ answer }),
        },
      );
    },
    async listGates(projectId, init): Promise<GateCardDto[]> {
      const body = await json<{ gates: GateCardDto[] }>(
        `/projects/${encodeURIComponent(projectId)}/gates`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
      return body.gates;
    },
    async decideGate(projectId, gateId, req, init): Promise<void> {
      await json<{ ok: true }>(
        `/projects/${encodeURIComponent(projectId)}/gates/${encodeURIComponent(gateId)}/decide`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async recordGateActivity(projectId, gateId, activity, init): Promise<void> {
      await json<unknown>(
        `/projects/${encodeURIComponent(projectId)}/gates/${encodeURIComponent(gateId)}/activity`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({ activity }),
        },
      );
    },
    async getPretriage(projectId, init): Promise<PretriageDto> {
      return json<PretriageDto>(`/projects/${encodeURIComponent(projectId)}/pretriage`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async getApprovalOverrides(projectId, init): Promise<ApprovalOverridesDto> {
      const body = await json<{ overrides: ApprovalOverridesDto }>(
        `/projects/${encodeURIComponent(projectId)}/approval-overrides`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
      return body.overrides;
    },
    async setApprovalOverrides(projectId, overrides, init): Promise<void> {
      await json<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/approval-overrides`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ overrides }),
      });
    },
    // ---- P1.09 — the approval-policy surface (§6.4 R3; REQ-SPEC-1) ----
    async getApprovalSettings(projectId, init): Promise<ApprovalSettingsDto> {
      return json<ApprovalSettingsDto>(
        `/projects/${encodeURIComponent(projectId)}/settings/approvals`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async putApprovalSettings(projectId, req, init): Promise<ApprovalSettingsDto> {
      return json<ApprovalSettingsDto>(
        `/projects/${encodeURIComponent(projectId)}/settings/approvals`,
        {
          method: "PUT",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async setRunGateOverrides(projectId, runId, req, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/gate-overrides`,
        {
          method: "PUT",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async createProjectGuidance(projectId, req, init): Promise<{ ok: true; guidanceId: string }> {
      return json<{ ok: true; guidanceId: string }>(
        `/projects/${encodeURIComponent(projectId)}/guidance`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async retireGuidance(projectId, guidanceId, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(
        `/projects/${encodeURIComponent(projectId)}/guidance/${encodeURIComponent(guidanceId)}/retire`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: "{}",
        },
      );
    },
    async getExplainers(init): Promise<ExplainersDto> {
      return json<ExplainersDto>(`/settings/explainers`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async dismissExplainer(name, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(`/settings/explainers/${encodeURIComponent(name)}/dismiss`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },
    async getDossier(projectId, runId, init): Promise<DossierDto> {
      return json<DossierDto>(
        `/projects/${encodeURIComponent(projectId)}/review/${encodeURIComponent(runId)}/dossier`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async getWhatChanged(projectId, responseId, init): Promise<WhatChangedDto> {
      return json<WhatChangedDto>(
        `/projects/${encodeURIComponent(projectId)}/responses/${encodeURIComponent(responseId)}/what-changed`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async commentOnHunk(projectId, responseId, hunkId, text, init): Promise<HunkCommentDto> {
      return json<HunkCommentDto>(
        `/projects/${encodeURIComponent(projectId)}/responses/${encodeURIComponent(responseId)}/hunks/${encodeURIComponent(hunkId)}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({ text }),
        },
      );
    },
    async getEditorDoc(projectId, draftId, init): Promise<EditorDocDto> {
      const exact = init?.opts?.exact ? "?exact=1" : "";
      return json<EditorDocDto>(
        `/projects/${encodeURIComponent(projectId)}/editor/${encodeURIComponent(draftId)}${exact}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async resolveEditorDraft(projectId, v, init): Promise<EditorResolveDto> {
      return json<EditorResolveDto>(
        `/projects/${encodeURIComponent(projectId)}/editor/resolve/${encodeURIComponent(v)}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async getBibliography(projectId, init): Promise<BibliographyDto> {
      return json<BibliographyDto>(
        `/projects/${encodeURIComponent(projectId)}/bibliography`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async importBibliography(projectId, req, init): Promise<BibliographyImportDto> {
      return json<BibliographyImportDto>(
        `/projects/${encodeURIComponent(projectId)}/bibliography`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async getArtifactPage(projectId, artifactId, init): Promise<EditorDocDto> {
      return json<EditorDocDto>(
        `/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/page`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async getVersions(projectId, init): Promise<VersionRailDto> {
      return json<VersionRailDto>(
        `/projects/${encodeURIComponent(projectId)}/versions`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async getVersionDiff(projectId, n, m, init): Promise<VersionDiffDto> {
      return json<VersionDiffDto>(
        `/projects/${encodeURIComponent(projectId)}/v/${encodeURIComponent(n)}/diff/${encodeURIComponent(m)}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async commentOnCompareHunk(projectId, n, m, hunkId, text, init): Promise<HunkCommentDto> {
      return json<HunkCommentDto>(
        `/projects/${encodeURIComponent(projectId)}/v/${encodeURIComponent(n)}/diff/${encodeURIComponent(m)}/hunks/${encodeURIComponent(hunkId)}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({ text }),
        },
      );
    },
    async getFiles(projectId, init): Promise<FilesDto> {
      return json<FilesDto>(
        `/projects/${encodeURIComponent(projectId)}/files`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async listRestorePoints(projectId, draftId, init): Promise<RestorePointsDto> {
      return json<RestorePointsDto>(
        `/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(draftId)}/restore-points`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async previewRestorePoint(projectId, draftId, pointId, init): Promise<RestorePreviewDto> {
      return json<RestorePreviewDto>(
        `/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(draftId)}/restore-points/${encodeURIComponent(pointId)}/preview`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async applyRestorePoint(projectId, draftId, pointId, init): Promise<RestoreApplyDto> {
      return json<RestoreApplyDto>(
        `/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(draftId)}/restore-points/${encodeURIComponent(pointId)}/restore`,
        { method: "POST", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async saveEditorDraft(projectId, draftId, markdown, init): Promise<EditorSaveDto> {
      return json<EditorSaveDto>(
        `/projects/${encodeURIComponent(projectId)}/editor/${encodeURIComponent(draftId)}/save`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({ markdown, ...(init?.meta ?? {}) }),
        },
      );
    },
    async postEditorNote(projectId, draftId, text, init): Promise<EditorNoteDto> {
      return json<EditorNoteDto>(
        `/projects/${encodeURIComponent(projectId)}/editor/${encodeURIComponent(draftId)}/note`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({ text }),
        },
      );
    },
    async cancelEditorRun(projectId, draftId, init): Promise<EditorCancelRunDto> {
      return json<EditorCancelRunDto>(
        `/projects/${encodeURIComponent(projectId)}/editor/${encodeURIComponent(draftId)}/cancel-run`,
        { method: "POST", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async reviseWithEdits(projectId, draftId, init): Promise<EditorReviseDto> {
      return json<EditorReviseDto>(
        `/projects/${encodeURIComponent(projectId)}/editor/${encodeURIComponent(draftId)}/revise`,
        { method: "POST", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async getBillingBalance(init?: RequestInitLite): Promise<BillingBalanceDto> {
      return json<BillingBalanceDto>("/billing/balance", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async recordExhaustedPrompt(actionTaken: string, init?: RequestInitLite): Promise<void> {
      await json<{ ok: true }>("/billing/exhausted-prompt", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ action_taken: actionTaken }),
      });
    },
    // ---- PRB.12 — analytics + privacy + usage ----
    async postAnalyticsEvent(req, init): Promise<{ ok: boolean; recorded: boolean }> {
      return json<{ ok: boolean; recorded: boolean }>("/analytics/events", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    // ---- P1.17 — the acquisition funnel + the Showcase precedence read ----
    async postAcquisitionEvent(req, init): Promise<{ ok: boolean; recorded: boolean }> {
      return json<{ ok: boolean; recorded: boolean }>("/analytics/acquisition", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async recordLandingEvent(req, init): Promise<{ ok: boolean }> {
      // Pre-auth by design — no session headers; the api hashes the forwarded IP itself.
      return json<{ ok: boolean }>("/analytics/landing", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(init?.headers as Record<string, string> | undefined),
        },
        body: JSON.stringify(req),
      });
    },
    async getShowcase(init): Promise<ShowcaseEntryDto> {
      return json<ShowcaseEntryDto>("/showcase", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async getPrivacySettings(init): Promise<PrivacySettingsDto> {
      return json<PrivacySettingsDto>("/settings/privacy", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async setAnalyticsOptOut(analyticsOptOut, init): Promise<PrivacySettingsDto> {
      return json<PrivacySettingsDto>("/settings/privacy", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ analyticsOptOut }),
      });
    },
    async getUsage(init): Promise<UsageDto> {
      return json<UsageDto>("/billing/usage", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    // ---- P1.16 — billing, full ----
    async downloadUsageCsv(init): Promise<ExportDownloadDto> {
      return download("/billing/usage.csv", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async getRates(init): Promise<RatesPublicationDto> {
      return json<RatesPublicationDto>("/pricing/rates", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async getPlans(init): Promise<BillingPlansDto> {
      return json<BillingPlansDto>("/billing/plans", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async startCheckout(req, init): Promise<CheckoutSessionDto> {
      return json<CheckoutSessionDto>("/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async createBillingPortalSession(returnTo, init): Promise<{ url: string }> {
      return json<{ url: string }>("/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(returnTo ? { returnTo } : {}),
      });
    },
    async getSubscription(init): Promise<BillingSubscriptionDto> {
      return json<BillingSubscriptionDto>("/billing/subscription", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async cancelSubscription(init): Promise<{ applied: boolean }> {
      return json<{ applied: boolean }>("/billing/subscription/cancel", {
        method: "POST",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async changePlan(tier, cycle, init) {
      return json<{ applied: "now" | "scheduled" } | { error: string }>("/billing/subscription/change-plan", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ tier, ...(cycle ? { cycle } : {}) }),
      });
    },
    async getCheckoutSession(sessionId, init): Promise<CheckoutStatusDto> {
      return json<CheckoutStatusDto>(`/billing/checkout-sessions/${encodeURIComponent(sessionId)}`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async setAutoReload(req, init): Promise<{ ok: true }> {
      return json<{ ok: true }>("/billing/auto-reload", {
        method: "PUT",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async joinTeamWaitlist(req, init): Promise<{ ok: true }> {
      return json<{ ok: true }>("/billing/team-waitlist", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async getUsageAccount(init): Promise<UsageAccountDto> {
      return json<UsageAccountDto>("/billing/usage/account", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async getUsageProject(projectId, init): Promise<UsageProjectDto> {
      return json<UsageProjectDto>(`/billing/usage/project/${encodeURIComponent(projectId)}`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async getUsageRunAdvanced(runId, init): Promise<UsageRunAdvancedDto> {
      return json<UsageRunAdvancedDto>(`/billing/usage/run/${encodeURIComponent(runId)}/advanced`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    // ---- P1.01 — theme policy ----
    async getSession(init): Promise<PrincipalDto> {
      return json<PrincipalDto>("/session", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async getTheme(init): Promise<ThemeSettingsDto> {
      return json<ThemeSettingsDto>("/settings/theme", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async setTheme(appTheme, init): Promise<ThemeSettingsDto> {
      return json<ThemeSettingsDto>("/settings/theme", {
        method: "PUT",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ appTheme }),
      });
    },
    async setPaperTheme(projectId, paperTheme, init): Promise<PaperThemeDto> {
      return json<PaperThemeDto>(`/projects/${encodeURIComponent(projectId)}/paper-theme`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ paperTheme }),
      });
    },
    // ---- PRB.10 — Quick Voice / P1.14 — the full Voices workspace ----
    async listVoices(init): Promise<VoiceListRowDto[]> {
      const body = await json<VoiceListDto>("/voices", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
      return [...body.voices];
    },
    async listVoiceGroups(init): Promise<VoiceListDto> {
      return json<VoiceListDto>("/voices", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async createVoice(req, init): Promise<CreatedVoiceDto> {
      return json<CreatedVoiceDto>("/voices", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async getVoice(personaId, init): Promise<VoiceDetailDto> {
      return json<VoiceDetailDto>(`/voices/${encodeURIComponent(personaId)}`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async addVoiceSample(personaId, req, init): Promise<AddedVoiceSampleDto> {
      return json<AddedVoiceSampleDto>(`/voices/${encodeURIComponent(personaId)}/samples`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async setVoiceSampleIncluded(personaId, itemId, included, init): Promise<{ status: VoiceStatusDto | null }> {
      return json<{ status: VoiceStatusDto | null }>(
        `/voices/${encodeURIComponent(personaId)}/samples/${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({ included }),
        },
      );
    },
    async saveVoiceSeed(personaId, req, init): Promise<SavedVoiceSeedDto> {
      return json<SavedVoiceSeedDto>(`/voices/${encodeURIComponent(personaId)}/seed`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async estimateVoice(personaId, tier, init): Promise<VoiceEstimateDto> {
      return json<VoiceEstimateDto>(
        `/voices/${encodeURIComponent(personaId)}/estimate?tier=${encodeURIComponent(tier)}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async buildVoice(personaId, req, init): Promise<BuiltVoiceDto> {
      return json<BuiltVoiceDto>(`/voices/${encodeURIComponent(personaId)}/build`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async cancelVoiceRun(runId, init): Promise<{ runId: string; state: string }> {
      return json<{ runId: string; state: string }>(`/runs/${encodeURIComponent(runId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ action: "cancel" }),
      });
    },
    async getProjectVoice(projectId, init): Promise<ProjectVoiceDto> {
      return json<ProjectVoiceDto>(`/projects/${encodeURIComponent(projectId)}/voice`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async setProjectVoice(projectId, req, init): Promise<ProjectVoiceDto> {
      return json<ProjectVoiceDto>(`/projects/${encodeURIComponent(projectId)}/voice`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async addVoiceSampleUrl(personaId, req, init): Promise<AddedVoiceSampleUrlDto> {
      return json<AddedVoiceSampleUrlDto>(`/voices/${encodeURIComponent(personaId)}/samples/url`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async getVoiceUpdatePlan(personaId, init): Promise<VoiceUpdatePlanDto> {
      return json<VoiceUpdatePlanDto>(`/voices/${encodeURIComponent(personaId)}/update`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async updateVoice(personaId, req, init): Promise<UpdatedVoiceDto> {
      return json<UpdatedVoiceDto>(`/voices/${encodeURIComponent(personaId)}/update`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async addVoiceCorrection(personaId, req, init): Promise<AddedVoiceCorrectionDto> {
      return json<AddedVoiceCorrectionDto>(`/voices/${encodeURIComponent(personaId)}/corrections`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async forkVoice(personaId, init): Promise<ForkedVoiceDto> {
      return json<ForkedVoiceDto>(`/voices/${encodeURIComponent(personaId)}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({}),
      });
    },
    // ---- P1.15 — the §9.5 ingestion surface (the Samples tab) ----
    async listVoiceConnections(personaId, init): Promise<VoiceConnectionsDto> {
      return json<VoiceConnectionsDto>(`/voices/${encodeURIComponent(personaId)}/connections`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async createVoiceConnection(personaId, req, init): Promise<CreatedVoiceConnectionDto> {
      return json<CreatedVoiceConnectionDto>(`/voices/${encodeURIComponent(personaId)}/connections`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async discoverVoiceConnection(personaId, connectionId, init): Promise<DiscoveredVoiceConnectionDto> {
      return json<DiscoveredVoiceConnectionDto>(
        `/voices/${encodeURIComponent(personaId)}/connections/${encodeURIComponent(connectionId)}/discover`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({}),
        },
      );
    },
    async confirmVoiceConnection(personaId, connectionId, req, init): Promise<VoiceSyncResponseDto> {
      return json<VoiceSyncResponseDto>(
        `/voices/${encodeURIComponent(personaId)}/connections/${encodeURIComponent(connectionId)}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async syncVoiceConnection(personaId, connectionId, init): Promise<VoiceSyncResponseDto> {
      return json<VoiceSyncResponseDto>(
        `/voices/${encodeURIComponent(personaId)}/connections/${encodeURIComponent(connectionId)}/sync`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({}),
        },
      );
    },
    async syncAllVoiceConnections(personaId, init): Promise<VoiceSyncResponseDto> {
      return json<VoiceSyncResponseDto>(`/voices/${encodeURIComponent(personaId)}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({}),
      });
    },
    async patchVoiceConnection(personaId, connectionId, req, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(
        `/voices/${encodeURIComponent(personaId)}/connections/${encodeURIComponent(connectionId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async removeVoiceConnection(personaId, connectionId, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(
        `/voices/${encodeURIComponent(personaId)}/connections/${encodeURIComponent(connectionId)}`,
        { method: "DELETE", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async getVoiceSample(personaId, itemId, init): Promise<VoiceSampleDetailDto> {
      return json<VoiceSampleDetailDto>(
        `/voices/${encodeURIComponent(personaId)}/samples/${encodeURIComponent(itemId)}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async listVoiceSampleVersions(personaId, itemId, init): Promise<VoiceSampleVersionsDto> {
      return json<VoiceSampleVersionsDto>(
        `/voices/${encodeURIComponent(personaId)}/samples/${encodeURIComponent(itemId)}/versions`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async getVoiceSampleRaw(personaId, itemId, init): Promise<ExportDownloadDto> {
      return download(
        `/voices/${encodeURIComponent(personaId)}/samples/${encodeURIComponent(itemId)}/raw`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async reconstructVoiceSample(personaId, itemId, req, init): Promise<ReconstructVoiceSampleResponseDto> {
      return json<ReconstructVoiceSampleResponseDto>(
        `/voices/${encodeURIComponent(personaId)}/samples/${encodeURIComponent(itemId)}/reconstruct`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async deleteVoice(personaId, init): Promise<DeletedVoiceDto> {
      return json<DeletedVoiceDto>(`/voices/${encodeURIComponent(personaId)}`, {
        method: "DELETE",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async adoptProjectVoice(projectId, req, init): Promise<AdoptedProjectVoiceDto> {
      return json<AdoptedProjectVoiceDto>(`/projects/${encodeURIComponent(projectId)}/voice/adopt`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async forkProjectVoice(projectId, req, init): Promise<ForkedProjectVoiceDto> {
      return json<ForkedProjectVoiceDto>(`/projects/${encodeURIComponent(projectId)}/voice/fork`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async getVoiceReseedPreview(projectId, init): Promise<ReseedPreviewDto> {
      return json<ReseedPreviewDto>(`/projects/${encodeURIComponent(projectId)}/voice/reseed-preview`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async decideRunGate(runId, gateId, req, init): Promise<void> {
      await json(`/runs/${encodeURIComponent(runId)}/gates/${encodeURIComponent(gateId)}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    // ---- PRB.11 — export + the AI-use statement ----
    async getExportDialog(projectId, init): Promise<ExportDialogDto> {
      return json<ExportDialogDto>(`/projects/${encodeURIComponent(projectId)}/export/dialog`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async exportProject(projectId, req, init): Promise<ExportDownloadDto> {
      return download(`/projects/${encodeURIComponent(projectId)}/export`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async getAiUseStatement(projectId, init): Promise<AiUseStatementDto> {
      return json<AiUseStatementDto>(`/projects/${encodeURIComponent(projectId)}/ai-use`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async downloadAiUseStatement(projectId, format, init): Promise<ExportDownloadDto> {
      return download(
        `/projects/${encodeURIComponent(projectId)}/ai-use?format=${encodeURIComponent(format)}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async appendAiUseAddition(projectId, sentence, init): Promise<AiUseAdditionDto> {
      return json<AiUseAdditionDto>(`/projects/${encodeURIComponent(projectId)}/ai-use/additions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ sentence }),
      });
    },
    // ---- P1.18 — the whole-account zip ----
    async getAccountExportState(init): Promise<{ export: AccountExportDto | null }> {
      return json<{ export: AccountExportDto | null }>("/account/export", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async requestAccountExport(init): Promise<{ export: AccountExportDto; deduped: boolean }> {
      return json<{ export: AccountExportDto; deduped: boolean }>("/account/export", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },
    async getAccountExportDownloadUrl(exportId, init): Promise<{ downloadUrl: string }> {
      const qs = exportId ? `?id=${encodeURIComponent(exportId)}` : "";
      return json<{ downloadUrl: string }>(`/account/export/download${qs}`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async importAccountExport(zipBytes, init): Promise<AccountImportResultDto> {
      const url = `${base}/account/import`;
      const res = await f(url, {
        method: "POST",
        headers: {
          ...baseHeaders,
          "content-type": "application/zip",
          ...(init?.headers as Record<string, string> | undefined),
        },
        body: zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new ApiError(
          res.status,
          url,
          undefined,
          typeof errBody?.error === "string" ? errBody.error : undefined,
        );
      }
      return (await res.json()) as AccountImportResultDto;
    },
    async presignImportUpload(init?: RequestInitLite): Promise<PresignedImportDto> {
      return json<PresignedImportDto>("/import/presign", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },
    async previewImport(projectId, req, init): Promise<ImportPreviewDto> {
      const body = await json<{ preview?: ConversionResult; pending?: boolean; quarantineKey?: string }>(
        `/projects/${encodeURIComponent(projectId)}/import/preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
      // 202 pending ⇒ still converting (the api joined/launched the Job's execution — retry, never re-upload).
      if (body.pending === true || body.preview == null) {
        return { status: "pending", quarantineKey: body.quarantineKey ?? req.quarantineKey };
      }
      return { status: "ready", preview: body.preview };
    },
    async createImport(projectId, req, init): Promise<CreatedImportDraftDto> {
      const body = await json<{ draft: CreatedImportDraftDto }>(
        `/projects/${encodeURIComponent(projectId)}/import/create`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
      return body.draft;
    },
    // ---- P1.04 — project home (§5.2/§5.3) ----
    async createProject(req, init): Promise<CreatedProjectDto> {
      const body = await json<{ project: CreatedProjectDto }>("/projects", {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
      return body.project;
    },
    async renameProject(projectId, title, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/rename`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ title }),
      });
    },
    async duplicateProject(projectId, init): Promise<CreatedProjectDto> {
      const body = await json<{ project: CreatedProjectDto }>(
        `/projects/${encodeURIComponent(projectId)}/duplicate`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: "{}",
        },
      );
      return body.project;
    },
    async archiveProject(projectId, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/archive`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },
    async unarchiveProject(projectId, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/unarchive`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },
    async deleteProject(projectId, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },
    async restoreProject(projectId, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },
    async searchProjects(q, init, opts): Promise<ProjectSearchHitDto[]> {
      const qs = new URLSearchParams({ q });
      if (opts?.projectId) qs.set("project", opts.projectId);
      const body = await json<{ results: ProjectSearchHitDto[] }>(
        `/projects/search?${qs.toString()}`,
        { headers: { ...(init?.headers as Record<string, string> | undefined) } },
      );
      return body.results;
    },
    async getProjectGrouping(init): Promise<ProjectGroupByDto> {
      const body = await json<{ groupBy: ProjectGroupByDto }>("/settings/project-grouping", {
        headers: { ...(init?.headers as Record<string, string> | undefined) },
      });
      return body.groupBy;
    },
    async setProjectGrouping(groupBy, init): Promise<{ ok: true }> {
      return json<{ ok: true }>("/settings/project-grouping", {
        method: "PUT",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ groupBy }),
      });
    },
    async listProtocolCards(init): Promise<ProtocolCardDto[]> {
      const body = await json<{ protocols: ProtocolCardDto[] }>("/protocols", {
        headers: { ...(init?.headers as Record<string, string> | undefined) },
      });
      return body.protocols;
    },
    async previewImportWorkspace(req, init): Promise<ImportPreviewDto> {
      const body = await json<{ preview?: ConversionResult; pending?: boolean; quarantineKey?: string }>(
        "/import/preview",
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
      if (body.pending === true || body.preview == null) {
        return { status: "pending", quarantineKey: body.quarantineKey ?? req.quarantineKey };
      }
      return { status: "ready", preview: body.preview };
    },
    // ---- P1.05 — Timeline / report / steering ----
    async getTimeline(projectId, init): Promise<TimelineDto> {
      return json<TimelineDto>(`/projects/${encodeURIComponent(projectId)}/timeline`, {
        method: "GET",
        headers: { ...(init?.headers as Record<string, string> | undefined) },
      });
    },
    async getRunReport(runId, opts, init): Promise<RunReportDto> {
      return json<RunReportDto>(`/runs/${encodeURIComponent(runId)}/report${opts?.advanced ? "?advanced=1" : ""}`, {
        method: "GET",
        headers: { ...(init?.headers as Record<string, string> | undefined) },
      });
    },
    async pauseRun(runId, init): Promise<{ ok: true; state: string }> {
      return json(`/runs/${encodeURIComponent(runId)}/pause`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },
    async resumeRun(runId, req, init): Promise<{ ok: true; state: string }> {
      return json(`/runs/${encodeURIComponent(runId)}/resume`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req ?? {}),
      });
    },
    async postRunNote(runId, text, init): Promise<{ ok: true; guidanceId: string }> {
      return json(`/runs/${encodeURIComponent(runId)}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ text }),
      });
    },
    async stopRun(runId, init): Promise<{ ok: true; state: string }> {
      return json(`/runs/${encodeURIComponent(runId)}/stop`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },
    async retryWalkthrough(runId, init): Promise<{ status: string }> {
      return json(`/runs/${encodeURIComponent(runId)}/walkthrough/retry`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: "{}",
      });
    },

    // ---- P1.11 — the Assistant chat surface ----
    async getChat(projectId, opts, init): Promise<ChatPanelDto> {
      const qs = opts?.thread ? `?thread=${encodeURIComponent(opts.thread)}` : "";
      return json<ChatPanelDto>(`/projects/${encodeURIComponent(projectId)}/chat${qs}`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async createChatThread(projectId, req, init): Promise<{ thread: ChatThreadDto }> {
      return json<{ thread: ChatThreadDto }>(`/projects/${encodeURIComponent(projectId)}/chat/threads`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async deleteChatThread(projectId, threadId, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(
        `/projects/${encodeURIComponent(projectId)}/chat/threads/${encodeURIComponent(threadId)}`,
        {
          method: "DELETE",
          headers: init?.headers as Record<string, string> | undefined,
        },
      );
    },
    async postChatTurn(projectId, threadId, req, init): Promise<ChatTurnCreatedDto> {
      return json<ChatTurnCreatedDto>(
        `/projects/${encodeURIComponent(projectId)}/chat/threads/${encodeURIComponent(threadId)}/turns`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async getChatTurn(projectId, threadId, runId, init): Promise<ChatTurnStatusDto> {
      return json<ChatTurnStatusDto>(
        `/projects/${encodeURIComponent(projectId)}/chat/threads/${encodeURIComponent(threadId)}/turns/${encodeURIComponent(runId)}`,
        {
          method: "GET",
          headers: init?.headers as Record<string, string> | undefined,
        },
      );
    },
    async postChatPlanDecision(projectId, threadId, req, init): Promise<ChatPlanDecisionDto> {
      return json<ChatPlanDecisionDto>(
        `/projects/${encodeURIComponent(projectId)}/chat/threads/${encodeURIComponent(threadId)}/plan-decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async addChatPin(projectId, threadId, req, init): Promise<ChatPinsDto> {
      return json<ChatPinsDto>(
        `/projects/${encodeURIComponent(projectId)}/chat/threads/${encodeURIComponent(threadId)}/pins`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async removeChatPin(projectId, threadId, pinId, init): Promise<ChatPinsDto> {
      return json<ChatPinsDto>(
        `/projects/${encodeURIComponent(projectId)}/chat/threads/${encodeURIComponent(threadId)}/pins/${encodeURIComponent(pinId)}`,
        {
          method: "DELETE",
          headers: init?.headers as Record<string, string> | undefined,
        },
      );
    },
    async getChatRemembers(projectId, threadId, init): Promise<ChatRemembersDto> {
      return json<ChatRemembersDto>(
        `/projects/${encodeURIComponent(projectId)}/chat/threads/${encodeURIComponent(threadId)}/remembers`,
        {
          method: "GET",
          headers: init?.headers as Record<string, string> | undefined,
        },
      );
    },
    async postChatCorrection(projectId, threadId, req, init): Promise<{ ok: true; guidanceId: string }> {
      return json<{ ok: true; guidanceId: string }>(
        `/projects/${encodeURIComponent(projectId)}/chat/threads/${encodeURIComponent(threadId)}/remembers/corrections`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async postChatAttachment(projectId, req, init): Promise<ChatAttachmentDto> {
      return json<ChatAttachmentDto>(`/projects/${encodeURIComponent(projectId)}/chat/attachments`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async getChatSources(projectId, init): Promise<{ sources: ChatSourceDto[] }> {
      return json<{ sources: ChatSourceDto[] }>(`/projects/${encodeURIComponent(projectId)}/chat/sources`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async postChatSuggestion(projectId, req, init): Promise<ChatSuggestionDto> {
      return json<ChatSuggestionDto>(`/projects/${encodeURIComponent(projectId)}/chat/suggestions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },
    async postChatNote(projectId, req, init): Promise<{ ok: true; path: string }> {
      return json<{ ok: true; path: string }>(`/projects/${encodeURIComponent(projectId)}/chat/notes`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        body: JSON.stringify(req),
      });
    },

    // ---- P1.12 — the Outline surface (§7.3) ----
    async getOutlinePromotion(projectId, opts, init): Promise<OutlinePromotionDto> {
      const qs = new URLSearchParams();
      if (opts.scope) qs.set("scope", opts.scope);
      if (opts.threadId) qs.set("threadId", opts.threadId);
      if (opts.turnId) qs.set("turnId", opts.turnId);
      if (opts.tier) qs.set("tier", opts.tier);
      if (opts.rigor) qs.set("rigor", opts.rigor);
      if (opts.slug) qs.set("slug", opts.slug);
      const q = qs.toString();
      return json<OutlinePromotionDto>(
        `/projects/${encodeURIComponent(projectId)}/outline/promotion${q ? `?${q}` : ""}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async promoteOutline(projectId, req, init): Promise<{ runId: string; state: string; deduped: boolean; slug: string }> {
      return json<{ runId: string; state: string; deduped: boolean; slug: string }>(
        `/projects/${encodeURIComponent(projectId)}/outline/promotions`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async getOutline(projectId, opts, init): Promise<OutlineDto> {
      const q = opts?.slug ? `?slug=${encodeURIComponent(opts.slug)}` : "";
      return json<OutlineDto>(`/projects/${encodeURIComponent(projectId)}/outline${q}`, {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async patchOutline(projectId, req, init): Promise<{ ok: true; versionIds: string[]; versionId: string | null; ordinal: number | null }> {
      return json<{ ok: true; versionIds: string[]; versionId: string | null; ordinal: number | null }>(
        `/projects/${encodeURIComponent(projectId)}/outline`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async deleteOutline(projectId, opts, init): Promise<{ ok: true }> {
      const q = opts?.slug ? `?slug=${encodeURIComponent(opts.slug)}` : "";
      return json<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/outline${q}`, {
        method: "DELETE",
        headers: init?.headers as Record<string, string> | undefined,
      });
    },
    async answerOutlineGap(projectId, gapId, req, init): Promise<{ ok: true; versionIds: string[] }> {
      return json<{ ok: true; versionIds: string[] }>(
        `/projects/${encodeURIComponent(projectId)}/outline/gaps/${encodeURIComponent(gapId)}/answer`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    // ---- P1.13 — the Figures pane + card (§7.5) ----
    async listFigures(projectId, init): Promise<FigureListItemDto[]> {
      const body = await json<{ figures: FigureListItemDto[] }>(
        `/projects/${encodeURIComponent(projectId)}/figures`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
      return body.figures;
    },
    async getFigure(projectId, figureId, init): Promise<FigureCardDto> {
      return json<FigureCardDto>(
        `/projects/${encodeURIComponent(projectId)}/figures/${encodeURIComponent(figureId)}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async patchFigure(projectId, figureId, req, init): Promise<FigureCardDto> {
      return json<FigureCardDto>(
        `/projects/${encodeURIComponent(projectId)}/figures/${encodeURIComponent(figureId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async proposeFigure(projectId, figureId, req, init): Promise<FigureProposedDto> {
      return json<FigureProposedDto>(
        `/projects/${encodeURIComponent(projectId)}/figures/${encodeURIComponent(figureId)}/proposals`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async acceptFigureProposal(projectId, figureId, init): Promise<FigureAcceptedDto> {
      return json<FigureAcceptedDto>(
        `/projects/${encodeURIComponent(projectId)}/figures/${encodeURIComponent(figureId)}/proposals/accept`,
        {
          method: "POST",
          headers: init?.headers as Record<string, string> | undefined,
        },
      );
    },
    async rejectFigureProposal(projectId, figureId, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(
        `/projects/${encodeURIComponent(projectId)}/figures/${encodeURIComponent(figureId)}/proposals/reject`,
        {
          method: "POST",
          headers: init?.headers as Record<string, string> | undefined,
        },
      );
    },
    async editFigureSpec(projectId, figureId, req, init): Promise<{ ok: true; n: number; specVersionId: string | null }> {
      return json<{ ok: true; n: number; specVersionId: string | null }>(
        `/projects/${encodeURIComponent(projectId)}/figures/${encodeURIComponent(figureId)}/spec-edit`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify(req),
        },
      );
    },
    async restoreFigureVersion(projectId, figureId, n, init): Promise<{ ok: true }> {
      return json<{ ok: true }>(
        `/projects/${encodeURIComponent(projectId)}/figures/${encodeURIComponent(figureId)}/versions/${n}/restore`,
        {
          method: "POST",
          headers: init?.headers as Record<string, string> | undefined,
        },
      );
    },
  };
}
