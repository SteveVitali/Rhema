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
  EditorSaveDto,
  EditorNoteDto,
  EditorCancelRunDto,
  EditorReviseDto,
  BillingBalanceDto,
  VoiceListRowDto,
  CreateVoiceDto,
  CreatedVoiceDto,
  VoiceDetailDto,
  AddVoiceSampleDto,
  AddedVoiceSampleDto,
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
} from "@rhema/api-client";
import type { ConversionResult, Claim, FindingView, ObligationState } from "@rhema/contracts";
import type { RunCardInput, RubricRowInput, AccessReportFacts } from "@rhema/findings-core";
import type { LetterSection } from "@rhema/ui";

// The web shell's data seam. SSR loaders never touch the DB directly — they call the api through this
// interface (the real impl forwards the viewer's session). Injected so route handlers are unit-testable with
// an in-memory fake (no api, no network).

export type SessionHeaders = Readonly<Record<string, string>>;

export interface ImportInput {
  readonly projectSlug: string;
  /** Pasted markdown/text, or the bytes of an uploaded file (the real impl uploads to quarantine first). */
  readonly text?: string;
  readonly fileName?: string;
  readonly bytes?: Uint8Array;
}

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
  /** Convert an upload/paste to a §5.3 preview (the api routes it to the convert service). */
  previewImport(session: SessionHeaders, input: ImportInput): Promise<ConversionResult>;
  /** Create the imported draft from a preview; returns the new draft id. */
  createImport(session: SessionHeaders, input: ImportInput): Promise<{ draftId: string }>;
  /** The sheet's Run click → the api's only run creator (REQ-CHAT-25). Session forwarded. */
  createRun(session: SessionHeaders, projectId: string, req: CreateRunDto): Promise<CreatedRunDto>;
  /** PRB.05 — write the user's disposition on a finding (§5.7; reversible until freeze). */
  recordDisposition(
    session: SessionHeaders,
    projectId: string,
    findingId: string,
    req: RecordDispositionDto,
  ): Promise<DispositionDto>;
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
  getEditorDoc(session: SessionHeaders, projectId: string, draftId: string): Promise<EditorDocDto>;
  /** PRB.07 — the debounced autosave POST (no Save button — this IS the save; §5.4). */
  saveEditorDraft(
    session: SessionHeaders,
    projectId: string,
    draftId: string,
    markdown: string,
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
    req: { personaId: string | null; profileSnapshotId?: string | null },
  ): Promise<ProjectVoiceDto>;
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
}

/** The production data source: the typed api client over the api base URL. */
export function apiDataSource(baseUrl: string, fetchImpl?: typeof fetch): DataSource {
  const notWired = (): never => {
    // The live import path (browser → presigned PUT to quarantine → api → convert service) is the deploy leg
    // (D-PRB.02): the upload/convert wiring needs GCS + the convert Cloud Run Job. The import UI + the api/
    // convert pipeline are proven deterministically; this binding lands with the live deploy.
    throw new Error("import is not wired live yet (D-PRB.02)");
  };
  return {
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
    previewImport: notWired,
    createImport: notWired,
    // The estimate service is stateless + pure (no GCS/DB-write infra), so the Run click is a real api call:
    // the api's run-creation lifecycle needs a live worker to EXECUTE (D-P0.08-1), but creating the row +
    // hold is the deployed api's job. Session forwarded so the api resolves the principal.
    createRun: (session, projectId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).createRun(projectId, req),
    recordDisposition: (session, projectId, findingId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).recordDisposition(projectId, findingId, req),
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
    getWhatChanged: (session, projectId, responseId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getWhatChanged(projectId, responseId),
    commentOnHunk: (session, projectId, responseId, hunkId, text) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).commentOnHunk(projectId, responseId, hunkId, text),
    getEditorDoc: (session, projectId, draftId) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).getEditorDoc(projectId, draftId),
    saveEditorDraft: (session, projectId, draftId, markdown) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).saveEditorDraft(projectId, draftId, markdown),
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
  };
}
