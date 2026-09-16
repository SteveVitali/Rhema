// @rhema/api-client — the typed HTTP client the web + mobile shells call the api through (carries no protocol
// text; REQ-ARCH-33). The DTOs mirror the api's wire shapes; `createApiClient` takes an injectable `fetch` so
// SSR loaders (which forward the viewer's session) and tests bind their own transport.

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

export interface ProjectRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly state: ProjectStateDto;
  /** The highest-n draft head — the source editor's entry point (PRB.07). */
  readonly headDraftId?: string | null;
  /** PRB.10 — the linked voice's chip (persona + the shared status pill); null ⇒ ad-hoc (§9.6). */
  readonly voice?: {
    readonly personaId: string;
    readonly name: string | null;
    readonly status: VoiceStatusDto;
  } | null;
}

export interface InviteCheckDto {
  readonly ok: boolean;
  readonly reason?: string;
}

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
  readonly suspended: boolean;
  readonly clawbackDebt: number;
  readonly paymentLinkUrl?: string;
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
  ) {
    super(message ?? `api ${status} for ${url}`);
    this.name = "ApiError";
  }
}

export interface ApiClient {
  /** List the signed-in principal's projects with their derived §6.3 state (session forwarded via headers). */
  listProjects(init?: RequestInitLite): Promise<ProjectRow[]>;
  /** Validate a beta invite code (and, for an email-bound invite, the email) before a signup is attempted. */
  checkInvite(code: string, email?: string): Promise<InviteCheckDto>;
  /** The stateless, cached estimate (REQ-SPEC-16) — creates no run row and emits `run.estimated`. */
  estimate(projectId: string, req: EstimateRequestDto, init?: RequestInitLite): Promise<EstimateDto>;
  /** The sheet's Run click — the ONLY run creator (REQ-CHAT-25); the client-minted idempotency key is in the body. */
  createRun(projectId: string, req: CreateRunDto, init?: RequestInitLite): Promise<CreatedRunDto>;
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
  getEditorDoc(projectId: string, draftId: string, init?: RequestInitLite): Promise<EditorDocDto>;
  /** The debounced autosave — forks a frozen head to v(N+1) `human_revision` on first save (REQ-DATA-24).
   *  Throws `ApiError(409)` while a run holds the head (read-only during runs, §6.3). */
  saveEditorDraft(projectId: string, draftId: string, markdown: string, init?: RequestInitLite): Promise<EditorSaveDto>;
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
    if (!res.ok) throw new ApiError(res.status, url);
    return (await res.json()) as T;
  }

  return {
    async listProjects(init?: RequestInitLite): Promise<ProjectRow[]> {
      const body = await json<{ projects: ProjectRow[] }>("/projects", {
        method: "GET",
        headers: init?.headers as Record<string, string> | undefined,
      });
      return body.projects;
    },
    async checkInvite(code: string, email?: string): Promise<InviteCheckDto> {
      return json<InviteCheckDto>("/invite/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, email }),
      });
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
      return json<EditorDocDto>(
        `/projects/${encodeURIComponent(projectId)}/editor/${encodeURIComponent(draftId)}`,
        { method: "GET", headers: init?.headers as Record<string, string> | undefined },
      );
    },
    async saveEditorDraft(projectId, draftId, markdown, init): Promise<EditorSaveDto> {
      return json<EditorSaveDto>(
        `/projects/${encodeURIComponent(projectId)}/editor/${encodeURIComponent(draftId)}/save`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
          body: JSON.stringify({ markdown }),
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
  };
}
