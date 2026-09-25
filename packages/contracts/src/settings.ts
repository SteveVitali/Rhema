import { z } from "zod";
import { modelTierSchema, rigorSchema, approvalPolicySchema } from "./vocab.js";
import { workflowKeySchema } from "./enums.js";

// settings.ts — the §14.7 settings tree's shared contracts (P1.20): the account-level preference
// blob (stored on "user".prefs), the project-settings safe-field patch (REQ-GENRE-2), the
// support-access grant constants (REQ-VIS-11), and the deletion-confirmation token (REQ-ACCT-4).

// ---------- the settings tree (§14.7 nav; §4.2 paths) ----------

/** The §14.7 sections in nav order. `team` is listed but hidden until roles ship. */
export const SETTINGS_SECTIONS = [
  "account",
  "preferences",
  "notifications",
  "integrations",
  "billing",
  "data",
  "team",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const settingsSectionSchema = z.enum(SETTINGS_SECTIONS);
/** Sections the nav renders (Team stays hidden until roles ship — §14.7). */
export const VISIBLE_SETTINGS_SECTIONS = SETTINGS_SECTIONS.filter((s) => s !== "team");

// ---------- account-level preferences ("user".prefs — the Preferences section) ----------

/** The editor preference vocabulary (§14.7 "editor prefs: paper theme, font preset, size stepper"). */
export const FONT_PRESETS = ["serif", "sans", "mono"] as const;
export type FontPreset = (typeof FONT_PRESETS)[number];
/** The size-stepper bounds (steps on either side of the base size). */
export const FONT_SIZE_STEPS = [-2, -1, 0, 1, 2] as const;

export const userEditorPrefsSchema = z.object({
  /** §14.7 editor prefs — the paper theme default a new project stamps ('follow' = app theme). */
  paperTheme: z.enum(["light", "follow", "dark"]).optional(),
  fontPreset: z.enum(FONT_PRESETS).optional(),
  fontSizeStep: z.number().int().min(-2).max(2).optional(),
});

/**
 * The `user.prefs` jsonb (P1.20): account-level defaults the per-project settings override —
 * the default model tier (vocabulary tier names only — never a raw model name), the default rigor
 * (overall + per-workflow), the approval-policy default a new project stamps, editor prefs, the
 * account byline, and the Q-26 preference-profile opt-out (default-ON learning ⇒ the flag is the
 * opt-OUT, absent ⇒ learning on; REQ-OBJ-14).
 */
export const userPrefsSchema = z
  .object({
    defaultModelTier: modelTierSchema.optional(),
    defaultRigor: rigorSchema.optional(),
    /** per-workflow rigor overrides (§14.7 "default rigor per workflow"). */
    rigorByWorkflow: z.record(workflowKeySchema, rigorSchema).optional(),
    approvalPolicy: approvalPolicySchema.optional(),
    editor: userEditorPrefsSchema.optional(),
    /** the Account section's byline — the default voice byline (§14.7). */
    byline: z.string().max(140).optional(),
    /** REQ-OBJ-14 (Q-26): account-local learning is default-on; this flag is the first-class
     *  opt-out. The capture path must check `preferenceCaptureEnabled` before recording a signal. */
    preferenceOptOut: z.boolean().optional(),
  })
  .strict();
export type UserPrefs = z.infer<typeof userPrefsSchema>;

/** Parse a stored `user.prefs` blob — an unparseable/foreign blob resolves to `{}` (never throws). */
export function parseUserPrefs(raw: unknown): UserPrefs {
  const parsed = userPrefsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

/** REQ-OBJ-14's consumption rule: capture is on unless the user opted out (default-on, Q-26). */
export function preferenceCaptureEnabled(prefs: UserPrefs | null | undefined): boolean {
  return prefs?.preferenceOptOut !== true;
}

// ---------- support access (REQ-VIS-11) ----------

/** The §14.7 support-access grant's TTL: "per request, 72 h". */
export const SUPPORT_ACCESS_TTL_MS = 72 * 60 * 60 * 1000;

/** The grant's lifecycle: active while granted, unrevoked, and unexpired at `now`. */
export function supportGrantActive(
  grant: { granted_at: Date | string; expires_at: Date | string; revoked_at: Date | string | null } | null | undefined,
  now: Date,
): boolean {
  if (!grant || grant.revoked_at != null) return false;
  return new Date(grant.expires_at).getTime() > now.getTime();
}

// ---------- account deletion (REQ-ACCT-4; §13.3) ----------

/** The typed-confirmation string the Delete-account form requires (§14.7 "typed confirmation"). */
export const ACCOUNT_DELETION_CONFIRMATION = "delete";

/** The 14-day grace end for a request made at `requestedAt` (mirror of the worker's policy). */
export function deletionGraceEndsAt(requestedAt: Date, graceDays = 14): Date {
  return new Date(requestedAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
}

// ---------- project settings (§4.2 /p/:project/settings; REQ-GENRE-2 safe fields) ----------

export const PROJECT_STAGES = ["early", "near_final", "infer"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

/**
 * The REQ-GENRE-2 safe-field set — the ONLY protocol fields a user may edit until custom
 * protocols ship: venue (the project's own column), plus the protocol-body overrides
 * `length_norms.default`, `phase_defaults`, and `stage` (stored on `projects.protocol_overrides`).
 */
export const projectProtocolOverridesSchema = z
  .object({
    /** a length-norm override: the target unit count (e.g. words/pages, per the protocol's unit). */
    length: z.number().int().positive().max(1_000_000).optional(),
    phaseDefaults: z
      .object({
        verification: z.boolean().optional(),
        discourse: z.boolean().optional(),
        secondRead: z.boolean().optional(),
        grounding: z.boolean().optional(),
        audit: z.boolean().optional(),
      })
      .strict()
      .optional(),
    stage: z.enum(PROJECT_STAGES).optional(),
  })
  .strict();
export type ProjectProtocolOverrides = z.infer<typeof projectProtocolOverridesSchema>;

/** The writable patch for PUT /projects/:id/settings — safe fields only (§6.7, REQ-GENRE-2). */
export const projectSettingsPatchSchema = z
  .object({
    venue: z.string().max(200).nullable().optional(),
    protocolId: z.string().max(80).optional(),
    rigorDefault: rigorSchema.nullable().optional(),
    modelTierDefault: modelTierSchema.nullable().optional(),
    paperTheme: z.enum(["light", "follow", "dark"]).optional(),
    protocolOverrides: projectProtocolOverridesSchema.nullable().optional(),
  })
  .strict();
export type ProjectSettingsPatch = z.infer<typeof projectSettingsPatchSchema>;

// ---------- the DTOs the api's settings routes answer (the web SSR reads them) ----------

/** A sign-in method on the account: the email magic link plus each OAuth provider row. */
export interface SignInMethodDto {
  readonly kind: string; // 'magic_link' | a provider_id ('google', …)
  readonly label: string;
  readonly detail?: string | null;
}

/** An active session row — `current` marks the session this request rode in on. */
export interface SessionInfoDto {
  readonly id: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly current: boolean;
}

/** GET /settings/account — profile, sign-in methods, sessions, the pending-deletion banner state. */
export interface AccountSettingsDto {
  readonly user: {
    readonly id: string;
    readonly name: string | null;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly image: string | null;
    readonly byline: string | null;
    /** an un-consumed email-change link — the field shows the pending address until confirmed. */
    readonly pendingEmail: string | null;
  };
  readonly signInMethods: readonly SignInMethodDto[];
  readonly sessions: readonly SessionInfoDto[];
  /** set ⇒ the deletion grace is running; the banner + cancel render. */
  readonly deletion: { readonly requestedAt: string; readonly graceEndsAt: string } | null;
}

/** One row of the user-visible support-access log (REQ-VIS-11). */
export interface SupportAccessLogDto {
  readonly id: string;
  readonly grantId: string | null;
  /** 'user' for grant/revoke; the operator id for an access. */
  readonly actor: string;
  readonly action: "granted" | "revoked" | "accessed" | "expired";
  readonly detail: string | null;
  readonly at: string;
}

/** GET /settings/data — the Data & privacy section's read. */
export interface DataSettingsDto {
  readonly analyticsOptOut: boolean;
  /** Q-26 — the preference-profile capture opt-out (default-on learning ⇒ true means OFF). */
  readonly preferenceOptOut: boolean;
  readonly supportAccess: {
    readonly active: boolean;
    readonly grant: { readonly grantedAt: string; readonly expiresAt: string } | null;
    readonly log: readonly SupportAccessLogDto[];
  };
  readonly deletion: { readonly requestedAt: string; readonly graceEndsAt: string } | null;
}

/** GET /settings/preferences — the account defaults + the P1.01/P1.06 companions. */
export interface PreferencesSettingsDto {
  readonly prefs: UserPrefs;
  readonly consentDontAskUnder: number;
  readonly appTheme: string;
}

/** One uniform integrations card (§14.7 — Connect / status / items / Disconnect). */
export interface IntegrationConnectionDto {
  readonly id: string;
  readonly provider: "substack" | "medium" | "gdrive";
  readonly handle: string | null;
  readonly status: "connected" | "degraded" | "removed" | "pending";
  readonly error: string | null;
  readonly lastSyncAt: string | null;
  /** the voice the connection feeds (P1.15's connection is voice-scoped). */
  readonly persona: { readonly id: string; readonly name: string | null; readonly slug: string | null };
  /** confirmed + candidate items the connection has discovered. */
  readonly items: number;
  /** items already consumed into the voice's corpus (kept after disconnect). */
  readonly includedItems: number;
}

export interface IntegrationsSettingsDto {
  readonly connections: readonly IntegrationConnectionDto[];
  /** the workspace's voices — a Connect card links to a voice's Samples tab (P1.15's surface). */
  readonly voices: readonly { readonly id: string; readonly slug: string | null; readonly name: string }[];
}

/** GET /projects/:id/settings — the §4.2 project-settings read. */
export interface ProjectSettingsDto {
  readonly project: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
    readonly protocolId: string | null;
    readonly protocolVersion: number;
    readonly venue: string | null;
    /** NULL ⇒ inherit the account default (§14.7 — per-project overrides win when set). */
    readonly rigorDefault: string | null;
    readonly modelTierDefault: string | null;
    readonly paperTheme: string;
    readonly approvalPolicy: string;
    readonly persona: { readonly id: string; readonly name: string | null; readonly slug: string | null } | null;
    readonly tags: readonly string[];
    /** §6.7 — set ⇒ the next Review's scope card carries "protocol changed". */
    readonly protocolChangedAt: string | null;
    readonly protocolOverrides: ProjectProtocolOverrides | null;
  };
  /** the selectable protocols (id + display name). */
  readonly protocols: readonly { readonly id: string; readonly name: string }[];
}
