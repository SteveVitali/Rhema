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
  };
}
