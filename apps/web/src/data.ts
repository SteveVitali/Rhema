import { createApiClient } from "@rhema/api-client";
import type { ProjectRow, InviteCheckDto, CreateRunDto, CreatedRunDto } from "@rhema/api-client";
import type { ConversionResult, Claim, FindingView } from "@rhema/contracts";
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
 * facts the trust chip derives from (REQ-PROD-2). The live binding (reading it from a delivered run) is the
 * deferred deploy leg — see D-PRB.04-1.
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
  readonly accessReport: AccessReportFacts;
}

export interface DataSource {
  /** The signed-in principal's projects with derived §6.3 state (session forwarded to the api). */
  listProjects(session: SessionHeaders): Promise<ProjectRow[]>;
  /** The delivered-review dossier for a run (PRB.04 reading surface). Live binding = D-PRB.04-1. */
  getDossier(session: SessionHeaders, args: { projectSlug: string; runId: string }): Promise<DossierData>;
  /** Validate a beta invite before any auth request is made (REQ-BETA-19). */
  checkInvite(code: string, email?: string): Promise<InviteCheckDto>;
  /** Convert an upload/paste to a §5.3 preview (the api routes it to the convert service). */
  previewImport(session: SessionHeaders, input: ImportInput): Promise<ConversionResult>;
  /** Create the imported draft from a preview; returns the new draft id. */
  createImport(session: SessionHeaders, input: ImportInput): Promise<{ draftId: string }>;
  /** The sheet's Run click → the api's only run creator (REQ-CHAT-25). Session forwarded. */
  createRun(session: SessionHeaders, projectId: string, req: CreateRunDto): Promise<CreatedRunDto>;
}

/** The production data source: the typed api client over the api base URL. */
export function apiDataSource(baseUrl: string, fetchImpl?: typeof fetch): DataSource {
  const notWired = (): never => {
    // The live import path (browser → presigned PUT to quarantine → api → convert service) is the deploy leg
    // (D-PRB.02): the upload/convert wiring needs GCS + the convert Cloud Run Job. The import UI + the api/
    // convert pipeline are proven deterministically; this binding lands with the live deploy.
    throw new Error("import is not wired live yet (D-PRB.02)");
  };
  const dossierNotWired = (): never => {
    // The delivered-review dossier read (correspondence + findings + claims + rubric + access_report → the
    // reading surfaces) needs a delivered run, which needs the live worker/orchestrator (D-P0.08-1). The
    // findings-core read models + @rhema/ui surfaces are proven deterministically; this binding lands with the
    // live deploy (D-PRB.04-1).
    throw new Error("the dossier read is not wired live yet (D-PRB.04-1)");
  };
  return {
    listProjects: (session) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).listProjects(),
    getDossier: dossierNotWired,
    checkInvite: (code, email) =>
      createApiClient({ baseUrl, fetch: fetchImpl }).checkInvite(code, email),
    previewImport: notWired,
    createImport: notWired,
    // The estimate service is stateless + pure (no GCS/DB-write infra), so the Run click is a real api call:
    // the api's run-creation lifecycle needs a live worker to EXECUTE (D-P0.08-1), but creating the row +
    // hold is the deployed api's job. Session forwarded so the api resolves the principal.
    createRun: (session, projectId, req) =>
      createApiClient({ baseUrl, fetch: fetchImpl, headers: session }).createRun(projectId, req),
  };
}
