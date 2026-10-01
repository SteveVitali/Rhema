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
  ThemeSettingsDto,
  PaperThemeDto,
  PrincipalDto,
  CreateProjectDto,
  CreatedProjectDto,
  ProjectSearchHitDto,
  ProjectGroupByDto,
  ProtocolCardDto,
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
  };
}
