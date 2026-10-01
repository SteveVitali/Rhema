// @rhema/api-client — the typed HTTP client the web + mobile shells call the api through (carries no protocol
// text; REQ-ARCH-33). The DTOs mirror the api's wire shapes; `createApiClient` takes an injectable `fetch` so
// SSR loaders (which forward the viewer's session) and tests bind their own transport.

import type { Claim, ConversionResult, FindingView, ObligationState } from "@rhema/contracts";
import type { AccessReportFacts, RubricRowInput, RunCardInput } from "@rhema/findings-core";

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
}

export interface CreatedRunDto {
  readonly runId: string;
  readonly state: string;
  readonly deduped?: boolean;
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

/** A gate card's facts (§6.4) — what the shared `GateCard` renders. */
export interface GateCardDto {
  readonly id: string;
  readonly runId: string;
  readonly kind: string;
  readonly workflow: string;
  readonly artifactVersionId?: string;
  readonly artifactTitle?: string;
  readonly openedAt: string;
  readonly deadlineAt?: string;
  readonly presenceDeadlineAt?: string;
  readonly pausedWhileReading: boolean;
  readonly held: boolean;
  readonly blocking: boolean;
  readonly onExpiry: string;
  readonly spentCredits: number;
  readonly capCredits: number;
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

/** A library card (GET /voices). */
export interface VoiceListRowDto {
  readonly personaId: string;
  readonly name: string | null;
  readonly byline: string | null;
  readonly mode: string;
  readonly sampleCount: number;
  readonly status: VoiceStatusDto;
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
}

// ---------------------------------------------------------------------------------------------------------
// PRB.11 — export (md/txt/docx) + the AI-use statement (§13.4, §8.4 REQ-VIS-10). The dialog read carries the
// format list, the never-blocking obligation line + linkable items, and the statement preview; the export
// POST returns the binary download. The statement's generated sentences are recomputed from run rows on
// every read — the only write is `appendAiUseAddition` (append-only; there is no update/delete).
// ---------------------------------------------------------------------------------------------------------

/** One beta export format on the dialog (the §13.4 beta subset: md/txt/docx). */
export interface ExportFormatDto {
  readonly id: "md" | "txt" | "docx";
  readonly label: string;
  readonly extension: string;
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
  readonly format: "md" | "txt" | "docx";
  /** the draft to export (default the highest-n head). */
  readonly draftId?: string;
  /** attach the AI-use statement as a trailing section (§8.4). */
  readonly attachAiUse?: boolean;
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
  /** `GET /projects/search?q=` — the server-side index over title/Voice/venue/materialized markdown. */
  searchProjects(q: string, init?: RequestInitLite): Promise<ProjectSearchHitDto[]>;
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
  /** The account's analytics opt-out flag (the Settings toggle's read). */
  getPrivacySettings(init?: RequestInitLite): Promise<PrivacySettingsDto>;
  /** Flip `analytics_opt_out` (REQ-PROD-15 — stops future writes AND hides existing rows from reads). */
  setAnalyticsOptOut(analyticsOptOut: boolean, init?: RequestInitLite): Promise<PrivacySettingsDto>;
  /** The level-1 usage glance: the balance + the account's recent runs' spend (P0.11 data). */
  getUsage(init?: RequestInitLite): Promise<UsageDto>;
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
  /** The library's "Your voices" group — every persona + its shared pill. */
  listVoices(init?: RequestInitLite): Promise<VoiceListRowDto[]>;
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
  /** The project's linked-voice facts (the run-sheet line / picker chip; §9.6). */
  getProjectVoice(projectId: string, init?: RequestInitLite): Promise<ProjectVoiceDto>;
  /** REQ-DATA-32 — pin the project's voice (personaId null ⇒ "No voice" / ad-hoc). */
  setProjectVoice(
    projectId: string,
    req: { personaId: string | null; profileSnapshotId?: string | null },
    init?: RequestInitLite,
  ): Promise<ProjectVoiceDto>;
  // ---- PRB.11 — export + the AI-use statement ----
  /** The export dialog read (formats, the never-blocking obligation line + links, the statement preview).
   *  Opening the dialog sweeps `pre_export` deferral horizons (REQ-OBJ-3). */
  getExportDialog(projectId: string, init?: RequestInitLite): Promise<ExportDialogDto>;
  /** POST /projects/:id/export → the binary download. Never blocks on obligations (§11.7). */
  exportProject(projectId: string, req: ExportRequestDto, init?: RequestInitLite): Promise<ExportDownloadDto>;
  /** GET /projects/:id/ai-use — the statement JSON; `format` returns the standalone binary download. */
  getAiUseStatement(projectId: string, init?: RequestInitLite): Promise<AiUseStatementDto>;
  downloadAiUseStatement(
    projectId: string,
    format: "md" | "txt" | "docx",
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
    // ---- PRB.10 — Quick Voice ----
    async listVoices(init): Promise<VoiceListRowDto[]> {
      const body = await json<{ voices: VoiceListRowDto[] }>("/voices", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
      return body.voices;
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
    async searchProjects(q, init): Promise<ProjectSearchHitDto[]> {
      const body = await json<{ results: ProjectSearchHitDto[] }>(
        `/projects/search?q=${encodeURIComponent(q)}`,
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
  };
}
