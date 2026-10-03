import { createApiClient, ApiError } from "@rhema/api-client";
import type {
  ProjectRow,
  InviteCheckDto,
  CreateRunDto,
  CreatedRunDto,
  RecordDispositionDto,
  DispositionDto,
  DecisionItemDto,
  GateCardDto,
  GateDecisionDto,
  PretriageDto,
  ApprovalOverridesDto,
  WhatChangedDto,
  HunkCommentDto,
  EditorDocDto,
  EditorResolveDto,
  BibliographyDto,
  BibliographyImportDto,
  EditorSaveDto,
  EditorNoteDto,
  EditorCancelRunDto,
  EditorReviseDto,
  BillingBalanceDto,
  VoiceListRowDto,
  VoiceListDto,
  CreateVoiceDto,
  CreatedVoiceDto,
  VoiceDetailDto,
  AddVoiceSampleDto,
  AddedVoiceSampleDto,
  AddVoiceSampleUrlDto,
  AddedVoiceSampleUrlDto,
  VoiceUpdatePlanDto,
  UpdateVoiceDto,
  UpdatedVoiceDto,
  AddVoiceCorrectionDto,
  AddedVoiceCorrectionDto,
  ForkedVoiceDto,
  AdoptProjectVoiceDto,
  AdoptedProjectVoiceDto,
  ForkProjectVoiceDto,
  ForkedProjectVoiceDto,
  ReseedPreviewDto,
  SaveVoiceSeedDto,
  SavedVoiceSeedDto,
  VoiceEstimateDto,
  BuildVoiceDto,
  BuiltVoiceDto,
  ProjectVoiceDto,
  VoiceStatusDto,
  ExportDialogDto,
  ExportRequestDto,
  ExportDownloadDto,
  AiUseStatementDto,
  AiUseAdditionDto,
  AnalyticsEventRequestDto,
  PrivacySettingsDto,
  UsageDto,
  ThemeSettingsDto,
  PaperThemeDto,
  PrincipalDto,
  CreateProjectDto,
  CreatedProjectDto,
  ProjectSearchHitDto,
  ProjectGroupByDto,
  ProtocolCardDto,
  TimelineDto,
  RunReportDto,
  RunSheetContextDto,
  ApplyResultDto,
  FindingResolveDto,
  BulkPreviewDto,
  BulkResultDto,
  VersionRailDto,
  VersionDiffDto,
  FilesDto,
  RestorePointsDto,
  RestorePreviewDto,
  RestoreApplyDto,
  ApprovalSettingsDto,
  ExplainersDto,
  ChatPanelDto,
  ChatThreadDto,
  ChatTurnRequestDto,
  ChatTurnCreatedDto,
  ChatTurnStatusDto,
  ChatPlanDecisionDto,
  ChatPinsDto,
  ChatSuggestionDto,
  ChatAttachmentDto,
  OutlinePromotionDto,
  OutlinePromoteRequestDto,
  OutlineDto,
  OutlinePatchDto,
  FigureListItemDto,
  FigureCardDto,
  FigureProposeDto,
  FigureProposedDto,
  FigureAcceptedDto,
  FigureSpecEditDto,
  VoiceConnectionsDto,
  CreateVoiceConnectionDto,
  CreatedVoiceConnectionDto,
  DiscoveredVoiceConnectionDto,
  ConfirmVoiceConnectionDto,
  VoiceSyncResponseDto,
  PatchVoiceConnectionDto,
  VoiceSampleDetailDto,
  VoiceSampleVersionsDto,
  ReconstructVoiceSampleDto,
  ReconstructVoiceSampleResponseDto,
  DeletedVoiceDto,
} from "@rhema/api-client";
import type { ConversionResult, Claim, FindingView, ObligationState } from "@rhema/contracts";
import type { RunCardInput, RubricRowInput, AccessReportFacts } from "@rhema/findings-core";
import type { LetterSection } from "@rhema/ui";

// The web shell's data seam. SSR loaders never touch the DB directly — they call the api through this
// interface (the real impl forwards the viewer's session). Injected so route handlers are unit-testable with
// an in-memory fake (no api, no network).

export type SessionHeaders = Readonly<Record<string, string>>;

/** P1.04 — the new-project flow's upload input (no project exists yet — the key is workspace-scoped). */
export interface WorkspaceImportInput {
  readonly text?: string;
  readonly fileName?: string;
  readonly bytes?: Uint8Array;
  readonly quarantineKey?: string;
}

export interface ImportInput {
  readonly projectSlug: string;
  /** Pasted markdown/text, or the bytes of an uploaded file (the impl uploads them to quarantine first). */
  readonly text?: string;
  readonly fileName?: string;
  readonly bytes?: Uint8Array;
  /**
   * PRB.20 — the minted `quarantine/<workspaceId>/<uploadId>` from a prior preview (the create form's
   * hidden `qk` field replays it so Create does not re-upload/re-convert the same bytes). Wins over
   * bytes/text when present.
   */
  readonly quarantineKey?: string;
}

/**
 * The preview leg's outcome (PRB.21): `ready` carries the §5.3 conversion payload + the quarantine key
 * the create form replays; `pending` means the cold convert Job is still running — the shell re-polls on
 * the same quarantine key (the api joins the in-flight execution, never re-runs it, never re-uploads).
 */
export type ImportPreviewOutcome =
  | { readonly status: "ready"; readonly preview: ConversionResult; readonly quarantineKey: string }
  | { readonly status: "pending"; readonly quarantineKey: string };

/**
 * The per-request preview wait budget handed to the api (PRB.21). A cold convert Job runs ~2.5–4 min;
 * each call waits at most this long (well inside the prod LB's backend timeout) before the shell renders
 * the converting state and the page re-polls.
 */
export const IMPORT_PREVIEW_WAIT_MS = 20_000;

/**
 * The delivered-review dossier the reading surfaces render (PRB.04). Semi-raw domain data + the proxy fetch
 * log; the web page assembles the view models via @rhema/findings-core and renders them with @rhema/ui. The
 * `runCard` state is already the orchestrator-only projection (REQ-IDE-11); the `accessReport` is the §12.6
 * facts the trust chip derives from (REQ-PROD-2). The live binding (reading it from a delivered run) landed
 * in PRB.16 — `apiDataSource.getDossier` below hits `GET /projects/:id/review/:runId/dossier` (D-PRB.04-1).
 */
export interface DossierData {
  readonly slug: string;
  readonly runId: string;
  readonly projectTitle: string;
  readonly versionLabel: string;
  /** P1.07 — the run's rigor drives the §5.7 severity budget (Quick's 40-finding rendered cap). */
  readonly rigor?: string;
  /** P1.07 — the reviewed draft the Apply path splices (its working head when forked). */
  readonly reviewedDraftId?: string;
  /** P1.06 — a scoped run's dossier label (§7.2 scope chips, e.g. "§III"); absent on whole-draft runs. */
  readonly scopeLabels?: readonly string[];
  readonly openObligations: number;
  readonly addressedObligations: number;
  readonly runCard: RunCardInput;
  readonly letterTitle: string;
  readonly letterSections: readonly LetterSection[];
  readonly claims: readonly Claim[];
  /** normalized URLs the proxy request log confirms fetched (the cited⇒fetched source — §12.7). */
  readonly fetchLog: readonly string[];
  readonly findings: readonly FindingView[];
  readonly rubric: readonly RubricRowInput[];
  /** PRB.06 — the prior round's rubric when this dossier is a re-review (the round-summary delta renders
   *  per-dimension before/after, never an aggregate — REQ-IDE-30). */
  readonly priorRubric?: readonly RubricRowInput[];
  readonly accessReport: AccessReportFacts;
  /** PRB.16 — finding id → its revision obligation's state, for the per-finding state chip (REQ-OBJ-6). */
  readonly findingObligations?: Readonly<Record<string, ObligationState>>;
}

export interface DataSource {
  /**
   * true when the forwarded session resolves to a live principal (the api's `GET /session`). Used by the
   * public landing/login routes to skip the sign-in page for an already-authenticated viewer.
   */
  checkSession(session: SessionHeaders): Promise<boolean>;
  /** The signed-in principal's projects with derived §6.3 state (session forwarded to the api). */
  listProjects(session: SessionHeaders): Promise<ProjectRow[]>;
  /** The delivered-review dossier for a run (PRB.04 reading surface; live-bound in PRB.16, D-PRB.04-1). */
  getDossier(session: SessionHeaders, args: { projectSlug: string; runId: string }): Promise<DossierData>;
  /** Validate a beta invite before any auth request is made (REQ-BETA-19). */
  checkInvite(code: string, email?: string): Promise<InviteCheckDto>;
  /**
   * PRB.13 — admit + provision an account through the api's `POST /signup` (REQ-BETA-19 amended
   * 2026-09-16). Invite mode requires `code`; open mode treats it as optional. The api owns admission —
   * invite consume happens there at creation; a returning account resolves `created:false`. Pre-auth: no
   * session is forwarded.
   */
  signup(req: { email: string; code?: string; method?: string }): Promise<
    | { readonly ok: true; readonly created: boolean }
    | { readonly ok: false; readonly status: number; readonly error: string }
  >;
  /** Convert an upload/paste to a §5.3 preview: presign → PUT to quarantine → api convert Job (PRB.20).
   *  PRB.21: resolves `pending` while a cold Job still converts — the caller re-invokes with the same
   *  `quarantineKey` to poll (no re-upload, no duplicate execution). */
  previewImport(session: SessionHeaders, input: ImportInput): Promise<ImportPreviewOutcome>;
  /** Create the imported draft from a preview's quarantine key; returns the new draft id. */
  createImport(session: SessionHeaders, input: ImportInput): Promise<{ draftId: string }>;
  /** The sheet's Run click → the api's only run creator (REQ-CHAT-25). Session forwarded. */
  createRun(session: SessionHeaders, projectId: string, req: CreateRunDto): Promise<CreatedRunDto>;
  /**
   * P1.06 — the run sheet's single context read (`GET /projects/:id/run-sheet-context`, §5.6): head
   * draft, sections, obligations, entitlement, consent pref, `blockedBy` under the P1.06 lock ruling.
   * Optional like the other live-read seams: a fixture without it renders the sheet's bare defaults.
   */
  getRunSheetContext?(
    session: SessionHeaders,
    projectId: string,
    args?: { workflow?: string; scope?: string },
  ): Promise<RunSheetContextDto>;
  /** P1.06 (REQ-BILL-4) — the "don't ask under N credits" pref (`PUT /settings/consent`). */
  setConsentPref?(session: SessionHeaders, dontAskUnder: number): Promise<{ ok: true; dontAskUnder: number }>;
  /** P1.06 — the palette's free-text search over the project index (`GET /projects/search?q=`). */
  searchPalette?(session: SessionHeaders, q: string, projectId?: string): Promise<ProjectSearchHitDto[]>;
  /** PRB.05 — write the user's disposition on a finding (§5.7; reversible until freeze). */
  recordDisposition(
    session: SessionHeaders,
    projectId: string,
    findingId: string,
    req: RecordDispositionDto,
  ): Promise<DispositionDto>;
  /** P1.07 — Apply (REQ-SPEC-6): splice the suggestion into the working head + accept·applied.
   *  Optional like the other live-write seams: a fixture without it renders Apply disabled. */
  applyFinding?(session: SessionHeaders, projectId: string, findingId: string): Promise<ApplyResultDto>;
  /** P1.07 — promote a reconciliation-rejected finding to the main list (REQ-IDE-26). */
  promoteFinding?(
    session: SessionHeaders,
    projectId: string,
    findingId: string,
  ): Promise<{ ok: true; findingId: string; obligationId?: string }>;
  /** P1.07 — "Add to obligations" on any finding (REQ-OBJ-9). */
  addFindingToObligations?(
    session: SessionHeaders,
    projectId: string,
    findingId: string,
  ): Promise<{ ok: true; obligationId: string }>;
  /** P1.07 — the palette's free-form obligation (REQ-OBJ-10; `source: 'user'`). */
  createObligation?(
    session: SessionHeaders,
    projectId: string,
    req: { title: string; severity?: "blocking" | "major" | "minor" | "note" },
  ): Promise<{ ok: true; obligationId: string }>;
  /** P1.07 — the shared deep link: resolve a finding to its dossier run + anchor. */
  resolveFinding?(session: SessionHeaders, projectId: string, findingId: string): Promise<FindingResolveDto>;
  /** P1.07 — the consolidated bulk preview (§5.7) before any writes. */
  previewBulkFindings?(
    session: SessionHeaders,
    projectId: string,
    runId: string,
    req: { action: BulkPreviewDto["action"]; section?: string },
  ): Promise<BulkPreviewDto>;
  /** P1.07 — dispatch a previewed bulk action (`only` = the checklist's checked subset). */
  applyBulkFindings?(
    session: SessionHeaders,
    projectId: string,
    runId: string,
    req: { action: BulkPreviewDto["action"]; section?: string; only?: string[] },
  ): Promise<BulkResultDto>;
  /** PRB.05 — the open gate cards for the project's runs (the Needs-you surface). */
  listGates(session: SessionHeaders, projectId: string): Promise<GateCardDto[]>;
  /** PRB.05 — a gate card's decision (approve / wait / stop / …). */
  decideGate(session: SessionHeaders, projectId: string, gateId: string, req: GateDecisionDto): Promise<void>;
  /** PRB.05 — a presence/reading ping for the gate's timer (§6.4 item 2; REQ-SPEC-18). */
  recordGateActivity(
    session: SessionHeaders,
    projectId: string,
    gateId: string,
    activity: "present" | "reading" | "blur",
  ): Promise<void>;
  /** PRB.05 — the Decisions list (open decision_requests for the project). */
  listDecisions(session: SessionHeaders, projectId: string): Promise<DecisionItemDto[]>;
  /** PRB.05 — answer a Decisions row. */
  answerDecision(session: SessionHeaders, projectId: string, decisionId: string, answer: string): Promise<void>;
  /** PRB.05 — pre-triage facts for the Revise sheet ("you pre-triaged N of M"). */
  getPretriage(session: SessionHeaders, projectId: string): Promise<PretriageDto>;
  /** PRB.05 — the project's approval-deadline overrides (§6.4 R3; the approve_triage 24-h opt-in). */
  getApprovalOverrides(session: SessionHeaders, projectId: string): Promise<ApprovalOverridesDto>;
  /** PRB.05 — set the approval-deadline overrides (validated server-side; REQ-SPEC-1). */
  setApprovalOverrides(
    session: SessionHeaders,
    projectId: string,
    overrides: ApprovalOverridesDto,
  ): Promise<void>;
  // ---- P1.09 — the §6.4 approval-policy surface + standing guidance + explainers ----
  /** `GET /projects/:id/settings/approvals` — policy + overrides + R3 defaults + standing guidance. */
  getApprovalSettings?(session: SessionHeaders, projectId: string): Promise<ApprovalSettingsDto>;
  /** `PUT /projects/:id/settings/approvals` — save policy and/or overrides (422 on an illegal one). */
  putApprovalSettings?(
    session: SessionHeaders,
    projectId: string,
    req: { policy?: "named" | "wait_each" | "run_to_completion"; overrides?: ApprovalOverridesDto },
  ): Promise<ApprovalSettingsDto>;
  /** `PUT /projects/:id/runs/:runId/gate-overrides` — the per-run override ("this run only"). */
  setRunGateOverrides?(
    session: SessionHeaders,
    projectId: string,
    runId: string,
    req: { overrides?: ApprovalOverridesDto; gatesOff?: boolean },
  ): Promise<{ ok: true }>;
  /** `POST /projects/:id/guidance` — add a standing-guidance rule from the settings surface (§6.5). */
  createProjectGuidance?(
    session: SessionHeaders,
    projectId: string,
    req: { body: string; workflows?: readonly string[] },
  ): Promise<{ ok: true; guidanceId: string }>;
  /** `POST /projects/:id/guidance/:gid/retire` — standing guidance retires, never deletes. */
  retireGuidance?(session: SessionHeaders, projectId: string, guidanceId: string): Promise<{ ok: true }>;
  /** `GET /settings/explainers` — the user's dismissed one-time inline explainers (§5.11/§6.4). */
  getExplainers?(session: SessionHeaders): Promise<ExplainersDto>;
  /** `POST /settings/explainers/:name/dismiss` — mark the one-time explainer seen. */
  dismissExplainer?(session: SessionHeaders, name: string): Promise<{ ok: true }>;
  /** PRB.06 — the What-changed read for a delivered response (§5.8 move cards + Inline hunks). */
  getWhatChanged(session: SessionHeaders, projectId: string, responseId: string): Promise<WhatChangedDto>;
  /** PRB.06 — a hunk comment → a Guidance row the next Revise consumes (§6.5). */
  commentOnHunk(
    session: SessionHeaders,
    projectId: string,
    responseId: string,
    hunkId: string,
    text: string,
  ): Promise<HunkCommentDto>;
  /** PRB.07 — the editor document read (markdown + the §6.3 lock + the projected findings rail). */
  getEditorDoc(
    session: SessionHeaders,
    projectId: string,
    draftId: string,
    opts?: { exact?: boolean },
  ): Promise<EditorDocDto>;
  /** P1.02 — resolve a `/v/:n|working` ref to its draft id (the Page's versioned routes). */
  resolveEditorDraft(session: SessionHeaders, projectId: string, v: string): Promise<EditorResolveDto>;
  /** P1.02 — the project's stored CSL-JSON bibliography items. */
  getBibliography(session: SessionHeaders, projectId: string): Promise<BibliographyDto>;
  /** P1.02 — import BibTeX/CSL-JSON/Zotero text into the project's bibliography items. */
  importBibliography(
    session: SessionHeaders,
    projectId: string,
    req: { format?: string; content: string },
  ): Promise<BibliographyImportDto>;
  /** P1.02 — the read-only Page read for a non-draft artifact (`/a/:artifactId`). */
  getArtifactPage(session: SessionHeaders, projectId: string, artifactId: string): Promise<EditorDocDto>;
  // ---- P1.08 — §5.8 versions/compare/restore + the §5.13 Files pane ----
  /** the version rail read model (every origin, reviewed/answered flags, the ⚑ chip). */
  getVersions(session: SessionHeaders, projectId: string): Promise<VersionRailDto>;
  /** the generalized compare — any draft pair (`m` may be `working`), server-projected. */
  getVersionDiff(session: SessionHeaders, projectId: string, n: string, m: string): Promise<VersionDiffDto>;
  /** a compare-hunk comment → `Guidance{source:'inline_comment'}` (the next Revise consumes it). */
  commentOnCompareHunk(
    session: SessionHeaders,
    projectId: string,
    n: string,
    m: string,
    hunkId: string,
    text: string,
  ): Promise<HunkCommentDto>;
  /** the §5.13 Files pane (typed sections; default rows carry no I/H kinds). Optional seam — a
   *  fixture without it renders the Files strip unchanged. */
  getFiles?(session: SessionHeaders, projectId: string): Promise<FilesDto>;
  /** the §5.8-grouped restore points for a draft's live doc. */
  listRestorePoints?(session: SessionHeaders, projectId: string, draftId: string): Promise<RestorePointsDto>;
  /** a point's reconstructed content diffed against the current head. */
  previewRestorePoint?(
    session: SessionHeaders,
    projectId: string,
    draftId: string,
    pointId: string,
  ): Promise<RestorePreviewDto>;
  /** the undoable restore apply (writes the pre-restore snapshot, then saveManualRevision). */
  applyRestorePoint?(
    session: SessionHeaders,
    projectId: string,
    draftId: string,
    pointId: string,
  ): Promise<RestoreApplyDto>;
  /** PRB.07 — the debounced autosave POST (no Save button — this IS the save; §5.4). */
  saveEditorDraft(
    session: SessionHeaders,
    projectId: string,
    draftId: string,
    markdown: string,
    meta?: { provenanceSpans?: { blockId: string; source: unknown }[]; agentSpans?: { blockId: string; from: number; to: number }[] },
  ): Promise<EditorSaveDto>;
  /** PRB.07 — the one note field → a Guidance row (§6.3's comment path; REQ-DATA-41 beta form). */
  postEditorNote(
    session: SessionHeaders,
    projectId: string,
    draftId: string,
    text: string,
  ): Promise<EditorNoteDto>;
  /** PRB.07 — the banner's "Cancel run to edit" release (§6.3). */
  cancelEditorRun(session: SessionHeaders, projectId: string, draftId: string): Promise<EditorCancelRunDto>;
  /** PRB.07 — "Revise using your edits" (REQ-DATA-26): review of vN + the v(N+1) human-revision base. */
  reviseWithEdits(session: SessionHeaders, projectId: string, draftId: string): Promise<EditorReviseDto>;
  /** PRB.08 — the account's spendable balance + suspension + the beta Payment Link (§14.6). Drives the run
   *  sheet's real balance (replacing the flat beta constant) + the exhaustion panel's Payment Link. */
  getBillingBalance(session: SessionHeaders): Promise<BillingBalanceDto>;
  /** PRB.08 — record `credits.exhausted_prompt{action_taken}` (REQ-BETA-12) when the exhaustion panel shows
   *  or resolves. */
  recordExhaustedPrompt(session: SessionHeaders, actionTaken: string): Promise<void>;
  // ---- PRB.10 — Quick Voice (§9.2–§9.6) ----
  /** the library's persona list with the shared pill (GET /voices). */
  listVoices(session: SessionHeaders): Promise<VoiceListRowDto[]>;
  /** the §9.2 creation sheet's write (name + byline + optional description + Mode metadata). */
  createVoice(session: SessionHeaders, req: CreateVoiceDto): Promise<CreatedVoiceDto>;
  /** the detail page's full read (status + samples + history + artifacts + the seed text). */
  getVoice(session: SessionHeaders, personaId: string): Promise<VoiceDetailDto>;
  /** a pasted sample through the §9.5 model; returns the refreshed corpus words + status (REQ-PERSONA-3). */
  addVoiceSample(session: SessionHeaders, personaId: string, req: AddVoiceSampleDto): Promise<AddedVoiceSampleDto>;
  /** the per-item include/omit toggle (REQ-INGEST-4). */
  setVoiceSampleIncluded(
    session: SessionHeaders,
    personaId: string,
    itemId: string,
    included: boolean,
  ): Promise<{ status: VoiceStatusDto | null }>;
  /** the seed editor's save — recomputes the J9 hash; the returned status is the live pill (§9.3). */
  saveVoiceSeed(session: SessionHeaders, personaId: string, req: SaveVoiceSeedDto): Promise<SavedVoiceSeedDto>;
  /** the tier estimate over the current included corpus (REQ-PERSONA-3). */
  estimateVoice(session: SessionHeaders, personaId: string, tier: "quick" | "full"): Promise<VoiceEstimateDto>;
  /** "Create and build" / "Update voice" — a profile_voice{tier} run (§9.2 item 3). */
  buildVoice(session: SessionHeaders, personaId: string, req: BuildVoiceDto): Promise<BuiltVoiceDto>;
  /** cancel an open build run. */
  cancelVoiceRun(session: SessionHeaders, runId: string): Promise<{ runId: string; state: string }>;
  /** the project's linked-voice facts (§9.6). */
  getProjectVoice(session: SessionHeaders, projectId: string): Promise<ProjectVoiceDto>;
  /** REQ-DATA-32 — pin the project's voice (personaId null ⇒ "No voice" / ad-hoc). */
  setProjectVoice(
    session: SessionHeaders,
    projectId: string,
    req: { personaId: string | null; profileSnapshotId?: string | null; register?: string | null },
  ): Promise<ProjectVoiceDto>;
  // ---- P1.14 — the full Voices workspace (§9.1–§9.6) ----
  /** the /app/voices three-group destination (§9.1) — the flat list plus the server split. */
  listVoiceGroups(session: SessionHeaders): Promise<VoiceListDto>;
  /** the fetcher-only URL ingestion path (REQ-INGEST-13). */
  addVoiceSampleUrl(
    session: SessionHeaders,
    personaId: string,
    req: AddVoiceSampleUrlDto,
  ): Promise<AddedVoiceSampleUrlDto>;
  /** the diff-of-inputs sheet's pre-computed route + estimate (§9.3). */
  getVoiceUpdatePlan(session: SessionHeaders, personaId: string): Promise<VoiceUpdatePlanDto>;
  /** the ONE Update-voice verb (§9.3; REQ-SPEC-27's scope routing). */
  updateVoice(session: SessionHeaders, personaId: string, req: UpdateVoiceDto): Promise<UpdatedVoiceDto>;
  /** "Correct this in your description" — blockquote + consume-once row (§9.4; REQ-PERSONA-7). */
  addVoiceCorrection(
    session: SessionHeaders,
    personaId: string,
    req: AddVoiceCorrectionDto,
  ): Promise<AddedVoiceCorrectionDto>;
  /** the read-only (house/shared) card's copy becomes your editable persona (§9.1). */
  forkVoice(session: SessionHeaders, personaId: string): Promise<ForkedVoiceDto>;
  // ---- P1.15 — the §9.5 Samples tab (sources + items + preview + priced reconstruction) ----
  /** the Sources pane list — linked providers + status + item counts. */
  listVoiceConnections(session: SessionHeaders, personaId: string): Promise<VoiceConnectionsDto>;
  /** link a source (substack host | url | export-zip quarantine key). Never a credential (AC-I-B). */
  createVoiceConnection(
    session: SessionHeaders,
    personaId: string,
    req: CreateVoiceConnectionDto,
  ): Promise<CreatedVoiceConnectionDto>;
  /** the review step — discovery rows only, never bodies (REQ-INGEST-3). */
  discoverVoiceConnection(
    session: SessionHeaders,
    personaId: string,
    connectionId: string,
  ): Promise<DiscoveredVoiceConnectionDto>;
  /** persist the reviewed include/omit set, then the fetch pass (REQ-INGEST-4). */
  confirmVoiceConnection(
    session: SessionHeaders,
    personaId: string,
    connectionId: string,
    req: ConfirmVoiceConnectionDto,
  ): Promise<VoiceSyncResponseDto>;
  /** the manual Re-sync (REQ-INGEST-6). */
  syncVoiceConnection(
    session: SessionHeaders,
    personaId: string,
    connectionId: string,
  ): Promise<VoiceSyncResponseDto>;
  /** "Re-sync all" — one job per live connection. */
  syncAllVoiceConnections(session: SessionHeaders, personaId: string): Promise<VoiceSyncResponseDto>;
  /** the per-source settings (auto-include new items; daily auto-sync). */
  patchVoiceConnection(
    session: SessionHeaders,
    personaId: string,
    connectionId: string,
    req: PatchVoiceConnectionDto,
  ): Promise<{ ok: true }>;
  /** Remove — soft-detach the source; items + versions are retained. */
  removeVoiceConnection(
    session: SessionHeaders,
    personaId: string,
    connectionId: string,
  ): Promise<{ ok: true }>;
  /** the export-zip path end-to-end: presign → PUT the bytes to quarantine → link the source. */
  linkVoiceExportZip(
    session: SessionHeaders,
    personaId: string,
    bytes: Uint8Array,
  ): Promise<CreatedVoiceConnectionDto>;
  /** the sample drawer's preview read — canonical document + listing facts + versions. */
  getVoiceSample(
    session: SessionHeaders,
    personaId: string,
    itemId: string,
  ): Promise<VoiceSampleDetailDto>;
  /** the version-history list (v1..vN newest first). */
  listVoiceSampleVersions(
    session: SessionHeaders,
    personaId: string,
    itemId: string,
  ): Promise<VoiceSampleVersionsDto>;
  /** the priced reconstruction pass (REQ-INGEST-10): the button label shows the estimate; the POST
   *  carries `confirmed: true`. `tier:'visual'` is the opt-in ~180-credit pass. */
  reconstructVoiceSample(
    session: SessionHeaders,
    personaId: string,
    itemId: string,
    req: ReconstructVoiceSampleDto,
  ): Promise<ReconstructVoiceSampleResponseDto>;
  /** delete the voice (REQ-INGEST-16) — the purge job cascades owned rows + bytes. */
  deleteVoice(session: SessionHeaders, personaId: string): Promise<DeletedVoiceDto>;
  /** adopt hatch — pin the refreshed snapshot (+ optional charter reseed) (§9.6; REQ-DATA-30). */
  adoptProjectVoice(
    session: SessionHeaders,
    projectId: string,
    req: AdoptProjectVoiceDto,
  ): Promise<AdoptedProjectVoiceDto>;
  /** fork hatch — a NEW project at `outlined`, outline copied, drafts not (§9.6). */
  forkProjectVoice(
    session: SessionHeaders,
    projectId: string,
    req: ForkProjectVoiceDto,
  ): Promise<ForkedProjectVoiceDto>;
  /** the adopt dialog's charter diff — guidance lines never appear (§9.6). */
  getVoiceReseedPreview(session: SessionHeaders, projectId: string): Promise<ReseedPreviewDto>;
  /** resolve a persona run's gate — the approve_sample card (§9.2/§6.4). */
  decideRunGate(
    session: SessionHeaders,
    runId: string,
    gateId: string,
    req: { action: "approve" | "wait" | "stop" | "edit" | "hold"; guidance?: string },
  ): Promise<void>;
  // ---- PRB.11 — export + the AI-use statement (§13.4, §8.4 REQ-VIS-10) ----
  /** the export dialog read — formats, the never-blocking obligation line + links, the statement preview.
   *  Opening it sweeps `pre_export` deferral horizons (REQ-OBJ-3). */
  getExportDialog(session: SessionHeaders, projectId: string): Promise<ExportDialogDto>;
  /** the export POST → the binary download (bytes + media type + filename). Never blocks on obligations. */
  exportProject(
    session: SessionHeaders,
    projectId: string,
    req: ExportRequestDto,
  ): Promise<ExportDownloadDto>;
  /** the AI-use statement JSON (generated sentences recomputed from run rows + append-only additions). */
  getAiUseStatement(session: SessionHeaders, projectId: string): Promise<AiUseStatementDto>;
  /** the standalone statement download (md/txt/docx). */
  downloadAiUseStatement(
    session: SessionHeaders,
    projectId: string,
    format: "md" | "txt" | "docx",
  ): Promise<ExportDownloadDto>;
  /** append one of the viewer's own sentences to the statement (the ONLY statement write — append-only). */
  appendAiUseAddition(
    session: SessionHeaders,
    projectId: string,
    sentence: string,
  ): Promise<AiUseAdditionDto>;
  // ---- PRB.12 — beta analytics + the privacy toggle + the usage glance ----
  /** mint a client-whitelisted analytics event (the SSR surfaces' view/dwell/timer emissions). */
  postAnalyticsEvent(
    session: SessionHeaders,
    req: AnalyticsEventRequestDto,
  ): Promise<{ ok: boolean; recorded: boolean }>;
  /** the account's analytics opt-out flag (the Settings toggle). */
  getPrivacySettings(session: SessionHeaders): Promise<PrivacySettingsDto>;
  /** flip `analytics_opt_out` — stops future writes AND hides existing rows from reads (REQ-PROD-15). */
  setAnalyticsOptOut(session: SessionHeaders, analyticsOptOut: boolean): Promise<PrivacySettingsDto>;
  /** the level-1 usage glance: balance + recent runs' spend (§14.5). */
  getUsage(session: SessionHeaders): Promise<UsageDto>;
  // ---- P1.01 — theme policy (REQ-IDE-38 amended) ----
  /** the resolved session principal (GET /session) — the IDE pane key's userId + SSR's theme stamping. */
  getSessionPrincipal(session: SessionHeaders): Promise<PrincipalDto>;
  /** the account's app theme (GET /settings/theme) — dark | light | auto. */
  getTheme(session: SessionHeaders): Promise<ThemeSettingsDto>;
  /** set the app theme (the IDE theme menu's POST → PUT /settings/theme). */
  setTheme(session: SessionHeaders, appTheme: ThemeSettingsDto["appTheme"]): Promise<ThemeSettingsDto>;
  /** set the project's paper pin (⌘⇧L → PUT /projects/:id/paper-theme). */
  setPaperTheme(
    session: SessionHeaders,
    projectId: string,
    paperTheme: PaperThemeDto["paperTheme"],
  ): Promise<PaperThemeDto>;
  // ---- P1.04 — the §5.2 workspace home + the §5.3 new-project flow ----
  /** POST /projects — the three-entry create; upload entries adopt the quarantined conversion. */
  createProject(session: SessionHeaders, req: CreateProjectDto): Promise<CreatedProjectDto>;
  /** The workspace-scoped conversion preview — the new-project flow's leg before any project exists. */
  previewWorkspaceImport(session: SessionHeaders, input: WorkspaceImportInput): Promise<ImportPreviewOutcome>;
  /** Row action — rename (the slug stays put). */
  renameProject(session: SessionHeaders, projectId: string, title: string): Promise<void>;
  /** Row action — duplicate drafts + outline + Voice link (never correspondence; origin=duplicate). */
  duplicateProject(session: SessionHeaders, projectId: string): Promise<CreatedProjectDto>;
  /** Row action — archive (soft; runs block; the row leaves the list). */
  archiveProject(session: SessionHeaders, projectId: string): Promise<void>;
  /** Restore an archived project. */
  unarchiveProject(session: SessionHeaders, projectId: string): Promise<void>;
  /** Row action — soft-delete (30-day window). */
  deleteProject(session: SessionHeaders, projectId: string): Promise<void>;
  /** Restore a soft-deleted project inside the window. */
  restoreProject(session: SessionHeaders, projectId: string): Promise<void>;
  /** The 30-day restore window's rows — soft-deleted projects only (`GET /projects?scope=deleted`). */
  listDeletedProjects?(session: SessionHeaders): Promise<ProjectRow[]>;
  /** `GET /projects/search?q=` — title / Voice / venue / materialized markdown. */
  searchProjects(session: SessionHeaders, q: string): Promise<ProjectSearchHitDto[]>;
  /** The per-user /app grouping preference. */
  getProjectGrouping(session: SessionHeaders): Promise<ProjectGroupByDto>;
  /** Persist the grouping preference (the Group-by select). */
  setProjectGrouping(session: SessionHeaders, groupBy: ProjectGroupByDto): Promise<void>;
  /** The four §5.3 protocol cards (+ venue tables + the estimator's cost band). */
  listProtocolCards(session: SessionHeaders): Promise<ProtocolCardDto[]>;
  // ---- P1.05 — the Timeline round log, the run report, and §6.5 steering ----
  /** `GET /projects/:id/timeline` — the round log (project resolved from its slug). */
  getTimeline(session: SessionHeaders, projectSlug: string): Promise<TimelineDto>;
  /** `GET /runs/:id/report` — Level 3; `advanced` adds the Level-4 drill-down. */
  getRunReport(session: SessionHeaders, runId: string, opts?: { advanced?: boolean }): Promise<RunReportDto>;
  /** `POST /runs/:id/pause` — "Pause after this phase" (honored at the next committed boundary). */
  pauseRun(session: SessionHeaders, runId: string): Promise<{ ok: true; state: string }>;
  /** `POST /runs/:id/resume` — resume a steering-parked run; `note` is Resume-with-note. */
  resumeRun(session: SessionHeaders, runId: string, note?: string): Promise<{ ok: true; state: string }>;
  /** `POST /runs/:id/notes` — a note for the next phase → Guidance{queued_message}. */
  postRunNote(session: SessionHeaders, runId: string, text: string): Promise<{ ok: true; guidanceId: string }>;
  /** `POST /runs/:id/stop` — Stop, keep partials. */
  stopRun(session: SessionHeaders, runId: string): Promise<{ ok: true; state: string }>;
  /** `POST /runs/:id/walkthrough/retry` — re-enqueue the one package-class walkthrough call. */
  retryWalkthrough(session: SessionHeaders, runId: string): Promise<{ status: string }>;
  /**
   * The run's user-visible events — the `GET /runs/:id/events?poll=1` finite replay parsed to rows
   * (the SSR feed's initial rows; the island tails the live stream afterwards).
   */
  getRunEvents(session: SessionHeaders, runId: string): Promise<FeedEventRow[]>;
  /** The live SSE response for a run (the web route pipes it through — the session forwards). */
  streamRunEvents(
    session: SessionHeaders,
    runId: string,
    opts?: { after?: string; lastEventId?: string },
  ): Promise<Response>;
  // ---- P1.11 — the Assistant chat surface (§7.1/§7.4/§7.6; every method session-forwards) ----
  /** `GET /projects/:id/chat` — the Desk Chat read (threads + ensured default, turns, pins, sources,
   *  the §7.6 empty-state model, the live-run flag). Optional seam: absent ⇒ the tab's placeholder. */
  getChat?(session: SessionHeaders, projectId: string, opts?: { thread?: string }): Promise<ChatPanelDto>;
  /** `POST …/threads/:tid/turns` — send a message; creates the turn's `chat_turn` run. */
  postChatTurn?(
    session: SessionHeaders,
    projectId: string,
    threadId: string,
    req: ChatTurnRequestDto,
  ): Promise<ChatTurnCreatedDto>;
  /** `GET …/threads/:tid/turns/:runId` — the turn's status + metered cost strip. */
  getChatTurn?(
    session: SessionHeaders,
    projectId: string,
    threadId: string,
    runId: string,
  ): Promise<ChatTurnStatusDto>;
  /** `POST …/threads/:tid/plan-decision` — run_research resolves to the research_burst sheet link. */
  postChatPlanDecision?(
    session: SessionHeaders,
    projectId: string,
    threadId: string,
    req: { runId?: string; action: "run_research" | "first_step" | "edit" | "cancel" },
  ): Promise<ChatPlanDecisionDto>;
  /** `POST /projects/:id/chat/threads` — a named thread. */
  createChatThread?(
    session: SessionHeaders,
    projectId: string,
    req: { name: string },
  ): Promise<{ thread: ChatThreadDto }>;
  /** `DELETE /projects/:id/chat/threads/:tid` — the default thread is undeletable (the api's rule). */
  deleteChatThread?(session: SessionHeaders, projectId: string, threadId: string): Promise<{ ok: true }>;
  /** `POST …/threads/:tid/pins` — pin a fact/ref/source (≤12; `dropOldest` rotates). */
  addChatPin?(
    session: SessionHeaders,
    projectId: string,
    threadId: string,
    req: { summary: string; kind?: "fact" | "ref" | "source"; ref?: string; dropOldest?: boolean },
  ): Promise<ChatPinsDto>;
  /** `DELETE …/threads/:tid/pins/:pinId` — unpin. */
  removeChatPin?(
    session: SessionHeaders,
    projectId: string,
    threadId: string,
    pinId: string,
  ): Promise<ChatPinsDto>;
  /** `POST …/threads/:tid/remembers/corrections` — a correction (a Guidance-class note). */
  postChatCorrection?(
    session: SessionHeaders,
    projectId: string,
    threadId: string,
    req: { text: string },
  ): Promise<{ ok: true; guidanceId: string }>;
  /** `POST /projects/:id/chat/suggestions` — "Ask about this draft" (≤1 paragraph or a refusal). */
  postChatSuggestion?(
    session: SessionHeaders,
    projectId: string,
    req: { anchor: { ref: string; version?: number; block?: string }; replacement: string },
  ): Promise<ChatSuggestionDto>;
  /** `POST /projects/:id/chat/notes` — "Paste my notes" → agents/author/notes.md. */
  postChatNote?(
    session: SessionHeaders,
    projectId: string,
    req: { text: string },
  ): Promise<{ ok: true; path: string }>;
  /** `POST /projects/:id/chat/attachments` — quarantine → convert → an assistant source note. */
  postChatAttachment?(
    session: SessionHeaders,
    projectId: string,
    req: { quarantineKey: string; filename: string; mediaType: string; threadId?: string; waitMs?: number },
  ): Promise<ChatAttachmentDto>;
  // ---- P1.12 — the Outline surface (§7.3; every method session-forwards) ----
  /** `GET /projects/:id/outline/promotion` — the promotion sheet's facts. */
  getOutlinePromotion?(
    session: SessionHeaders,
    projectId: string,
    opts: { scope?: "thread" | "turn" | "research"; threadId?: string; turnId?: string; tier?: string; rigor?: string; slug?: string },
  ): Promise<OutlinePromotionDto>;
  /** `POST /projects/:id/outline/promotions` — create the `outline` run (Promote = consent). */
  promoteOutline?(
    session: SessionHeaders,
    projectId: string,
    req: OutlinePromoteRequestDto,
  ): Promise<{ runId: string; state: string; deduped: boolean; slug: string }>;
  /** `GET /projects/:id/outline` — the editor DTO (head artifact + parsed twin + citations). */
  getOutline?(session: SessionHeaders, projectId: string, opts?: { slug?: string }): Promise<OutlineDto>;
  /** `PATCH /projects/:id/outline` — the autosave: a structured `ed.*` delta → a new version pair. */
  patchOutline?(
    session: SessionHeaders,
    projectId: string,
    req: OutlinePatchDto,
  ): Promise<{ ok: true; versionIds: string[]; versionId: string | null; ordinal: number | null }>;
  /** `DELETE /projects/:id/outline` — refused 409 `outline_cited` while a draft cites the outline. */
  deleteOutline?(session: SessionHeaders, projectId: string, opts?: { slug?: string }): Promise<{ ok: true }>;
  /** `POST /projects/:id/outline/gaps/:gapId/answer` — a gap's Answer → a `user_typed` claim row. */
  answerOutlineGap?(
    session: SessionHeaders,
    projectId: string,
    gapId: string,
    req: { text: string; slug?: string },
  ): Promise<{ ok: true; versionIds: string[] }>;
  // ---- P1.13 — the Figures pane + card (§7.5; every method session-forwards) ----
  /** `GET /projects/:id/figures` — the pane list (badge + insert/render state per card). */
  listFigures?(session: SessionHeaders, projectId: string): Promise<FigureListItemDto[]>;
  /** `GET /projects/:id/figures/:figureId` — the card (preview + disclosures + readiness). */
  getFigure?(session: SessionHeaders, projectId: string, figureId: string): Promise<FigureCardDto>;
  /** `PATCH …/figures/:figureId` — the card's field edits (title/caption/alt ≤250/sourceLine). */
  patchFigure?(
    session: SessionHeaders,
    projectId: string,
    figureId: string,
    req: { title?: string; caption?: string; alt?: string; sourceLine?: string },
  ): Promise<FigureCardDto>;
  /** `POST …/proposals` — the insert-as-proposal card (409 `figure_not_ready` while alt/source is missing). */
  proposeFigure?(
    session: SessionHeaders,
    projectId: string,
    figureId: string,
    req: FigureProposeDto,
  ): Promise<FigureProposedDto>;
  /** `POST …/proposals/accept` — the one-tx splice (frozen draft ⇒ forked v(N+1)). */
  acceptFigureProposal?(session: SessionHeaders, projectId: string, figureId: string): Promise<FigureAcceptedDto>;
  /** `POST …/proposals/reject` — clear the card; the asset stays in working figures. */
  rejectFigureProposal?(session: SessionHeaders, projectId: string, figureId: string): Promise<{ ok: true }>;
  /** `POST …/spec-edit` — the 0-cr type-chip mark edit → new version + re-render. */
  editFigureSpec?(
    session: SessionHeaders,
    projectId: string,
    figureId: string,
    req: FigureSpecEditDto,
  ): Promise<{ ok: true; n: number; specVersionId: string | null }>;
  /** `POST …/versions/:n/restore` — copy the version's spec/data/provenance to head + re-render. */
  restoreFigureVersion?(session: SessionHeaders, projectId: string, figureId: string, n: number): Promise<{ ok: true }>;
}

/** A user-visible run event as the feed consumes it (the SSE `data:` payload). */
export interface FeedEventRow {
  readonly seq: number;
  readonly type: string;
  readonly payload: unknown;
  readonly density: string;
  readonly agentLabel?: string;
  readonly at: string;
}

/** Parse a `?poll=1` SSE replay body into event rows (id:/event:/data: triplets, one record per block). */
export function parseSseReplay(text: string): FeedEventRow[] {
  const out: FeedEventRow[] = [];
  for (const block of text.split("\n\n")) {
    const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    try {
      const ev = JSON.parse(dataLine.slice(5).trim()) as FeedEventRow;
      if (typeof ev.seq === "number" && typeof ev.type === "string") out.push(ev);
    } catch {
      /* a malformed record is skipped, never fatal */
    }
  }
  return out;
}

/** The production data source: the typed api client over the api base URL. */
export function apiDataSource(baseUrl: string, fetchImpl?: typeof fetch): DataSource {
  const f = fetchImpl ?? fetch;
  const client = (session: SessionHeaders) =>
    createApiClient({ baseUrl, fetch: f, headers: session });
  const projectIdFor = async (session: SessionHeaders, slug: string): Promise<string> => {
    const row = (await client(session).listProjects()).find((r) => r.slug === slug);
    if (!row) throw new ApiError(404, `project ${slug}`);
    return row.id;
  };
  // PRB.20 — the quarantine leg (D-PRB.02-1): presign a workspace-scoped key, then PUT the bytes straight
  // to GCS on the signed URL with the signed headers echoed verbatim. The session cookie rides ONLY the
  // api calls — it never leaves for a third-party origin. A replayed `quarantineKey` (the preview form's
  // hidden field) skips the upload entirely.
  const uploadKey = async (session: SessionHeaders, input: WorkspaceImportInput): Promise<string> => {
    if (input.quarantineKey) return input.quarantineKey;
    const bytes =
      input.bytes ?? (typeof input.text === "string" ? new TextEncoder().encode(input.text) : undefined);
    if (!bytes || bytes.byteLength === 0) throw new ApiError(400, "import", "import source required");
    const pre = await client(session).presignImportUpload();
    if (bytes.byteLength > pre.maxBytes)
      throw new ApiError(413, pre.key, `upload exceeds ${pre.maxBytes} bytes`);
    const put = await f(pre.url, {
      method: "PUT",
      headers: { ...pre.requiredHeaders },
      body: bytes as unknown as NonNullable<RequestInit["body"]>,
    });
    if (!put.ok) throw new ApiError(put.status, pre.url);
    return pre.key;
  };
  return {
    checkSession: async (session) => {
      const res = await (fetchImpl ?? fetch)(`${baseUrl}/session`, { headers: session });
      return res.ok;
    },
    listProjects: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listProjects(),
    // PRB.16 — the delivered-review dossier read IS wired now (PRB.04's deferred live binding): the api's
    // dossier endpoint assembles the reading-surface data from the delivered rows server-side.
    getDossier: async (session, { projectSlug, runId }) => {
      const client = createApiClient({ baseUrl, fetch: fetchImpl, headers: session });
      const row = (await client.listProjects()).find((r) => r.slug === projectSlug);
      if (!row) throw new ApiError(404, `project ${projectSlug}`);
      return client.getDossier(row.id, runId);
    },
    checkInvite: (code, email) =>
      createApiClient({ baseUrl, fetch: fetchImpl }).checkInvite(code, email),
    // PRB.13 — the api's account-creation path (pre-auth; the api throttles per source IP + email).
    signup: (req) => createApiClient({ baseUrl, fetch: fetchImpl }).signup(req),
    // PRB.20 — the import golden path (D-PRB.02-1): preview = presign→PUT→convert Job→§5.3 payload;
    // create replays the same quarantine key into import/create (no second upload).
    previewImport: async (session, input) => {
      const projectId = await projectIdFor(session, input.projectSlug);
      const quarantineKey = await uploadKey(session, input);
      const out = await client(session).previewImport(projectId, {
        quarantineKey,
        waitMs: IMPORT_PREVIEW_WAIT_MS,
      });
      if (out.status === "pending") return { status: "pending", quarantineKey };
      return { status: "ready", preview: out.preview, quarantineKey };
    },
    createImport: async (session, input) => {
      const projectId = await projectIdFor(session, input.projectSlug);
      const quarantineKey = await uploadKey(session, input);
      const draft = await client(session).createImport(projectId, { quarantineKey });
      return { draftId: draft.draftId };
    },
    // The estimate service is stateless + pure (no GCS/DB-write infra), so the Run click is a real api call:
    // the api's run-creation lifecycle needs a live worker to EXECUTE (D-P0.08-1), but creating the row +
    // hold is the deployed api's job. Session forwarded so the api resolves the principal.
    createRun: (session, projectId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).createRun(projectId, req),
    // P1.06 — the run sheet's single context read + the consent-pref write + the palette's search.
    getRunSheetContext: (session, projectId, args) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).runSheetContext(projectId, args),
    setConsentPref: (session, dontAskUnder) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).setConsentPref(dontAskUnder),
    searchPalette: (session, q, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).searchProjects(q, undefined, {
        ...(projectId ? { projectId } : {}),
      }),
    recordDisposition: (session, projectId, findingId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).recordDisposition(projectId, findingId, req),
    // P1.07 — the findings surface writes: Apply, promote, Add-to-obligations, the deep-link resolve,
    // and the one-preview bulk actions (§5.7; REQ-SPEC-6, REQ-IDE-26, REQ-OBJ-9).
    applyFinding: (session, projectId, findingId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).applyFinding(projectId, findingId),
    promoteFinding: (session, projectId, findingId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).promoteFinding(projectId, findingId),
    addFindingToObligations: (session, projectId, findingId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).addFindingToObligations(projectId, findingId),
    createObligation: (session, projectId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).createObligation(projectId, req),
    resolveFinding: (session, projectId, findingId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).resolveFinding(projectId, findingId),
    previewBulkFindings: (session, projectId, runId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).previewBulkFindings(projectId, runId, req),
    applyBulkFindings: (session, projectId, runId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).applyBulkFindings(projectId, runId, req),
    listGates: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listGates(projectId),
    decideGate: (session, projectId, gateId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).decideGate(projectId, gateId, req),
    recordGateActivity: (session, projectId, gateId, activity) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).recordGateActivity(projectId, gateId, activity),
    listDecisions: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listDecisions(projectId),
    answerDecision: (session, projectId, decisionId, answer) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).answerDecision(projectId, decisionId, answer),
    getPretriage: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getPretriage(projectId),
    getApprovalOverrides: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getApprovalOverrides(projectId),
    setApprovalOverrides: (session, projectId, overrides) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).setApprovalOverrides(projectId, overrides),
    // P1.09 — the §6.4 approval-policy surface + standing guidance + explainers.
    getApprovalSettings: (session, projectId) =>
      client(session).getApprovalSettings(projectId),
    putApprovalSettings: (session, projectId, req) =>
      client(session).putApprovalSettings(projectId, req),
    setRunGateOverrides: (session, projectId, runId, req) =>
      client(session).setRunGateOverrides(projectId, runId, req),
    createProjectGuidance: (session, projectId, req) =>
      client(session).createProjectGuidance(projectId, req),
    retireGuidance: (session, projectId, guidanceId) =>
      client(session).retireGuidance(projectId, guidanceId),
    getExplainers: (session) => client(session).getExplainers(),
    dismissExplainer: (session, name) => client(session).dismissExplainer(name),
    getWhatChanged: (session, projectId, responseId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getWhatChanged(projectId, responseId),
    commentOnHunk: (session, projectId, responseId, hunkId, text) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).commentOnHunk(projectId, responseId, hunkId, text),
    getEditorDoc: (session, projectId, draftId, opts) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getEditorDoc(projectId, draftId, { opts }),
    resolveEditorDraft: (session, projectId, v) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).resolveEditorDraft(projectId, v),
    getBibliography: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getBibliography(projectId),
    importBibliography: (session, projectId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).importBibliography(projectId, req),
    getArtifactPage: (session, projectId, artifactId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getArtifactPage(projectId, artifactId),
    // P1.08 — the version rail, the generalized compare + hunk comments, the Files pane, and the
    // restore-point browse/preview/apply (§5.8, §5.13).
    getVersions: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getVersions(projectId),
    getVersionDiff: (session, projectId, n, m) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getVersionDiff(projectId, n, m),
    commentOnCompareHunk: (session, projectId, n, m, hunkId, text) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).commentOnCompareHunk(projectId, n, m, hunkId, text),
    getFiles: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getFiles(projectId),
    listRestorePoints: (session, projectId, draftId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listRestorePoints(projectId, draftId),
    previewRestorePoint: (session, projectId, draftId, pointId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).previewRestorePoint(projectId, draftId, pointId),
    applyRestorePoint: (session, projectId, draftId, pointId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).applyRestorePoint(projectId, draftId, pointId),
    saveEditorDraft: (session, projectId, draftId, markdown, meta) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).saveEditorDraft(projectId, draftId, markdown, { meta }),
    postEditorNote: (session, projectId, draftId, text) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).postEditorNote(projectId, draftId, text),
    cancelEditorRun: (session, projectId, draftId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).cancelEditorRun(projectId, draftId),
    reviseWithEdits: (session, projectId, draftId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).reviseWithEdits(projectId, draftId),
    getBillingBalance: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getBillingBalance(),
    recordExhaustedPrompt: (session, actionTaken) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).recordExhaustedPrompt(actionTaken),
    // ---- PRB.10 — Quick Voice ----
    listVoices: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listVoices(),
    createVoice: (session, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).createVoice(req),
    getVoice: (session, personaId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getVoice(personaId),
    addVoiceSample: (session, personaId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).addVoiceSample(personaId, req),
    setVoiceSampleIncluded: (session, personaId, itemId, included) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).setVoiceSampleIncluded(personaId, itemId, included),
    saveVoiceSeed: (session, personaId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).saveVoiceSeed(personaId, req),
    estimateVoice: (session, personaId, tier) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).estimateVoice(personaId, tier),
    buildVoice: (session, personaId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).buildVoice(personaId, req),
    cancelVoiceRun: (session, runId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).cancelVoiceRun(runId),
    getProjectVoice: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getProjectVoice(projectId),
    setProjectVoice: (session, projectId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).setProjectVoice(projectId, req),
    // ---- P1.14 — the full Voices workspace ----
    listVoiceGroups: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listVoiceGroups(),
    addVoiceSampleUrl: (session, personaId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).addVoiceSampleUrl(personaId, req),
    getVoiceUpdatePlan: (session, personaId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getVoiceUpdatePlan(personaId),
    updateVoice: (session, personaId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).updateVoice(personaId, req),
    addVoiceCorrection: (session, personaId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).addVoiceCorrection(personaId, req),
    forkVoice: (session, personaId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).forkVoice(personaId),
    // ---- P1.15 — the §9.5 Samples tab ----
    listVoiceConnections: (session, personaId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listVoiceConnections(personaId),
    createVoiceConnection: (session, personaId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).createVoiceConnection(personaId, req),
    discoverVoiceConnection: (session, personaId, connectionId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).discoverVoiceConnection(personaId, connectionId),
    confirmVoiceConnection: (session, personaId, connectionId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).confirmVoiceConnection(personaId, connectionId, req),
    syncVoiceConnection: (session, personaId, connectionId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).syncVoiceConnection(personaId, connectionId),
    syncAllVoiceConnections: (session, personaId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).syncAllVoiceConnections(personaId),
    patchVoiceConnection: (session, personaId, connectionId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).patchVoiceConnection(personaId, connectionId, req),
    removeVoiceConnection: (session, personaId, connectionId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).removeVoiceConnection(personaId, connectionId),
    linkVoiceExportZip: async (session, personaId, bytes) => {
      // The quarantine leg (D-PRB.02-1): presign → PUT → link the export-zip source by key.
      const quarantineKey = await uploadKey(session, { bytes });
      return createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).createVoiceConnection(
        personaId,
        { provider: "substack_export", quarantineKey },
      );
    },
    getVoiceSample: (session, personaId, itemId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getVoiceSample(personaId, itemId),
    listVoiceSampleVersions: (session, personaId, itemId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listVoiceSampleVersions(personaId, itemId),
    reconstructVoiceSample: (session, personaId, itemId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).reconstructVoiceSample(personaId, itemId, req),
    deleteVoice: (session, personaId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).deleteVoice(personaId),
    adoptProjectVoice: (session, projectId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).adoptProjectVoice(projectId, req),
    forkProjectVoice: (session, projectId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).forkProjectVoice(projectId, req),
    getVoiceReseedPreview: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getVoiceReseedPreview(projectId),
    decideRunGate: (session, runId, gateId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).decideRunGate(runId, gateId, req),
    // ---- PRB.11 — export + the AI-use statement ----
    getExportDialog: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getExportDialog(projectId),
    exportProject: (session, projectId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).exportProject(projectId, req),
    getAiUseStatement: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getAiUseStatement(projectId),
    downloadAiUseStatement: (session, projectId, format) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).downloadAiUseStatement(projectId, format),
    appendAiUseAddition: (session, projectId, sentence) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).appendAiUseAddition(projectId, sentence),
    // ---- PRB.12 — analytics + privacy + usage ----
    postAnalyticsEvent: (session, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).postAnalyticsEvent(req),
    getPrivacySettings: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getPrivacySettings(),
    setAnalyticsOptOut: (session, analyticsOptOut) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).setAnalyticsOptOut(analyticsOptOut),
    getUsage: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getUsage(),
    // ---- P1.01 — theme policy ----
    getSessionPrincipal: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getSession(),
    getTheme: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getTheme(),
    setTheme: (session, appTheme) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).setTheme(appTheme),
    setPaperTheme: (session, projectId, paperTheme) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).setPaperTheme(projectId, paperTheme),
    // ---- P1.04 — the workspace home + the §5.3 new-project flow ----
    createProject: (session, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).createProject(req),
    // The workspace-scoped preview leg: presign → PUT to quarantine → POST /import/preview. Replaying a
    // `quarantineKey` polls the SAME conversion (no re-upload, no duplicate Job).
    previewWorkspaceImport: async (session, input) => {
      const quarantineKey = await uploadKey(session, input);
      const out = await client(session).previewImportWorkspace({
        quarantineKey,
        waitMs: IMPORT_PREVIEW_WAIT_MS,
      });
      if (out.status === "pending") return { status: "pending", quarantineKey };
      return { status: "ready", preview: out.preview, quarantineKey };
    },
    renameProject: async (session, projectId, title) => {
      await createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).renameProject(projectId, title);
    },
    duplicateProject: (session, projectId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).duplicateProject(projectId),
    archiveProject: async (session, projectId) => {
      await createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).archiveProject(projectId);
    },
    unarchiveProject: async (session, projectId) => {
      await createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).unarchiveProject(projectId);
    },
    deleteProject: async (session, projectId) => {
      await createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).deleteProject(projectId);
    },
    restoreProject: async (session, projectId) => {
      await createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).restoreProject(projectId);
    },
    listDeletedProjects: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listProjects(undefined, {
        scope: "deleted",
      }),
    searchProjects: (session, q) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).searchProjects(q),
    getProjectGrouping: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getProjectGrouping(),
    setProjectGrouping: async (session, groupBy) => {
      await createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).setProjectGrouping(groupBy);
    },
    listProtocolCards: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listProtocolCards(),
    // ---- P1.05 — the Timeline round log, the run report, §6.5 steering ----
    getTimeline: async (session, projectSlug) => {
      const projectId = await projectIdFor(session, projectSlug);
      return client(session).getTimeline(projectId);
    },
    getRunReport: (session, runId, opts) => client(session).getRunReport(runId, opts),
    pauseRun: (session, runId) => client(session).pauseRun(runId),
    resumeRun: (session, runId, note) =>
      client(session).resumeRun(runId, note != null ? { note } : undefined),
    postRunNote: (session, runId, text) => client(session).postRunNote(runId, text),
    stopRun: (session, runId) => client(session).stopRun(runId),
    retryWalkthrough: (session, runId) => client(session).retryWalkthrough(runId),
    getRunEvents: async (session, runId) => {
      const res = await f(
        `${baseUrl}/runs/${encodeURIComponent(runId)}/events?poll=1`,
        { headers: session },
      );
      if (!res.ok) throw new ApiError(res.status, `run ${runId} events`);
      return parseSseReplay(await res.text());
    },
    streamRunEvents: (session, runId, opts) =>
      f(
        `${baseUrl}/runs/${encodeURIComponent(runId)}/events${opts?.after ? `?after=${encodeURIComponent(opts.after)}` : ""}`,
        {
          headers: {
            ...session,
            accept: "text/event-stream",
            ...(opts?.lastEventId ? { "last-event-id": opts.lastEventId } : {}),
          },
        },
      ),
    // P1.11 — the Assistant chat surface (every call session-forwarded; the api owns the rules).
    getChat: (session, projectId, opts) => client(session).getChat(projectId, opts),
    createChatThread: (session, projectId, req) => client(session).createChatThread(projectId, req),
    deleteChatThread: (session, projectId, threadId) =>
      client(session).deleteChatThread(projectId, threadId),
    postChatTurn: (session, projectId, threadId, req) =>
      client(session).postChatTurn(projectId, threadId, req),
    getChatTurn: (session, projectId, threadId, runId) =>
      client(session).getChatTurn(projectId, threadId, runId),
    postChatPlanDecision: (session, projectId, threadId, req) =>
      client(session).postChatPlanDecision(projectId, threadId, req),
    addChatPin: (session, projectId, threadId, req) =>
      client(session).addChatPin(projectId, threadId, req),
    removeChatPin: (session, projectId, threadId, pinId) =>
      client(session).removeChatPin(projectId, threadId, pinId),
    postChatCorrection: (session, projectId, threadId, req) =>
      client(session).postChatCorrection(projectId, threadId, req),
    postChatSuggestion: (session, projectId, req) => client(session).postChatSuggestion(projectId, req),
    postChatNote: (session, projectId, req) => client(session).postChatNote(projectId, req),
    postChatAttachment: (session, projectId, req) =>
      client(session).postChatAttachment(projectId, req),

    // ---- P1.12 — the Outline surface ----
    getOutlinePromotion: (session, projectId, opts) =>
      client(session).getOutlinePromotion(projectId, opts),
    promoteOutline: (session, projectId, req) =>
      client(session).promoteOutline(projectId, req),
    getOutline: (session, projectId, opts) => client(session).getOutline(projectId, opts),
    patchOutline: (session, projectId, req) => client(session).patchOutline(projectId, req),
    deleteOutline: (session, projectId, opts) => client(session).deleteOutline(projectId, opts),
    answerOutlineGap: (session, projectId, gapId, req) =>
      client(session).answerOutlineGap(projectId, gapId, req),

    // ---- P1.13 — the Figures pane + card (§7.5) ----
    listFigures: (session, projectId) => client(session).listFigures(projectId),
    getFigure: (session, projectId, figureId) => client(session).getFigure(projectId, figureId),
    patchFigure: (session, projectId, figureId, req) =>
      client(session).patchFigure(projectId, figureId, req),
    proposeFigure: (session, projectId, figureId, req) =>
      client(session).proposeFigure(projectId, figureId, req),
    acceptFigureProposal: (session, projectId, figureId) =>
      client(session).acceptFigureProposal(projectId, figureId),
    rejectFigureProposal: (session, projectId, figureId) =>
      client(session).rejectFigureProposal(projectId, figureId),
    editFigureSpec: (session, projectId, figureId, req) =>
      client(session).editFigureSpec(projectId, figureId, req),
    restoreFigureVersion: (session, projectId, figureId, n) =>
      client(session).restoreFigureVersion(projectId, figureId, n),
  };
}
