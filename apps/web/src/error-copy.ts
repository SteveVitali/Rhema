// R7COPY.1c (REQ-COPY-2; UXC-27; REQ-RELOAD-4's stable codes) — `errorCopy(code)`: every API
// `{error}` code maps to a COPY sentence plus an action, with a generic fallback, and every mapped
// error logs its `{code, requestId}` to the client console (manifest invariant 10 — the code and the
// correlation id only, never `detail`, never PII). The committed `ERROR_CODES` inventory below is
// the extraction output asserted by `error-copy.test.ts`: the test scans `apps/api/src/**` (minus
// tests) for `error:` literals (codes AND prose — both are emitted), `reason:` snake literals,
// `.(reason|error) ===` comparisons, `??` code defaults, `code:` literals, and `*Invalid(`-helper
// argument codes; `apps/web/src/*.ts` top-level the same; `apps/web/src/spa/bff.ts`'s `new BffError(`
// literal codes; and the named producer modules whose `{ok:false, reason|error}` unions the routes
// surface verbatim through `c.json({ error: res.reason })` — `packages/orchestrator/src/
// {run-creation,cancel,reactions,gate-resolution}.ts`, `packages/mirror/src/manual-revision.ts`,
// `packages/findings-core/src/apply.ts`, `packages/assistant/src/threads.ts`. A NEW pass-through
// producer file must be appended to the test's PRODUCER_FILES constant, and template-literal
// emissions are dynamic — they resolve to the fallback.

import { COPY } from "./copy.js";

/**
 * The `BffError` shape `errorCopy` needs — declared structurally so `server.ts` (which emits
 * mapped `?notice=` text through `errorSentence`) can import this module WITHOUT pulling the
 * client-only `./bff.js` graph into the server tsconfig.
 */
export interface BffErrorLike {
  readonly code: string;
  readonly requestId?: string;
}

/** What `errorCopy` hands a surface: one sentence of what happened plus the suggested next step. */
export interface ErrorCopyEntry {
  readonly sentence: string;
  readonly action: string;
}

const S = COPY.errors;
const A = COPY.errorActions;

/**
 * The committed error-code inventory — the extraction output, sorted. The inventory test
 * re-derives it from the sources above and fails on any drift (a new un-inventoried emitted
 * code is exactly the test's job to catch); rows are appended, never renamed.
 */
export const ERROR_CODES: readonly string[] = [
    "a public http(s) url is required", "a publication address like name.substack.com is required", "a quarantineKey for the export zip is required", "absorbed",
    "accept_failed", "account_suspended", "action required", "action_taken required",
    "already_clean", "already_resolved", "alt_too_long", "analyticsOptOut must be a boolean",
    "anchor required", "anchor_lost", "appTheme must be 'dark' | 'light' | 'auto'", "auth_unavailable",
    "bad signature", "bad_request", "bad_signature", "base_draft_not_found",
    "batch_too_large", "bff_body_ambiguous", "bff_path_must_be_same_origin", "binary_download",
    "body required", "boundary", "build_in_progress", "cancel_to_edit",
    "chat_action_required", "chat_attachment_required", "chat_correction_required", "chat_name_required",
    "chat_not_wired", "chat_note_required", "chat_only_plan", "chat_pin_required",
    "chat_refused", "chat_suggestion_required", "chat_thread_required", "chat_turn_required",
    "chat_unavailable", "chat_upstream_error", "chip_not_supported", "concurrency_limit",
    "confirm_required", "confirmation_required", "content required", "content store unavailable",
    "content_store_unavailable", "conversion_pending", "conversion_start_failed", "converter_unavailable",
    "daily_run_ceiling", "demo", "demo_read_only", "denied",
    "digest must be an object", "digest.run_finished must be 'hourly' or 'off'", "dontAskUnder must be an integer ≥ 0", "download_unavailable",
    "draft_not_found", "draft_outline_required", "edit produced no rows", "edits_not_implemented",
    "email actions are not configured", "email required", "email_required", "email_unverified",
    "empty", "empty_body", "empty_draft", "enabled_required",
    "entitlement_unavailable", "entry must be 'scratch' | 'outline' | 'draft'", "estimate_unavailable", "event required",
    "expired_or_consumed", "export_link_expired", "export_not_wired", "external_nav_refused",
    "fetcher_unavailable", "figure.request required", "figure_not_found", "figure_not_ready",
    "first_month_cap", "forbidden", "forbidden_origin", "fork_has_edits",
    "fork_read_by_run", "frozen", "full_required", "gap_not_found",
    "groupBy must be 'attention' | 'voice'", "hunk_not_found", "idempotencyKey and workflow required", "import_not_wired",
    "import_too_large", "insufficient_balance", "internal_error", "invalid",
    "invalid event payload", "invalid payload", "invalid quietHours", "invalid_action",
    "invalid_auto_reload", "invalid_email", "invalid_json", "invalid_name",
    "invalid_or_expired_token", "invalid_outline", "invalid_overrides", "invalid_patch",
    "invalid_policy", "invalid_preferences", "invalid_request", "invalid_user_sources",
    "invite_rejected", "invite_required", "killed", "kind required (subscribe|topup|auto_reload_setup)",
    "locked", "malformed", "markdown required", "message required",
    "message_too_long", "missing event id/type", "model_profile_rejected", "model_tier_requires_upgrade",
    "name required", "name_empty", "name_required", "no_anchor",
    "no_discovery", "no_draft", "no_head", "no_pending_proposal",
    "no_profile", "no_review", "no_store", "no_stripe_customer",
    "no_subscription", "no_voice", "not a client-mintable event", "not a landing event",
    "not an acquisition event", "not found", "not_a_fork", "not_a_human_revision",
    "not_a_rhema_export", "not_applyable", "not_cancellable", "not_editable",
    "not_found", "not_found_or_retired", "not_locked", "not_markdown",
    "not_rejected", "not_rendered", "not_waiting", "nothing_to_update",
    "obligation_unavailable", "optOut_required", "outline or edit required", "outline_cited",
    "outline_sidecar_missing", "packId required (topup_10|topup_50|topup_200)", "paperTheme must be 'light' | 'follow' | 'dark'", "personaId required",
    "persona_not_found", "phone_challenge_required", "pins_full", "plan required (writer|studio|studio_max)",
    "plan_waitlisted", "project must be an object", "project not found", "project writes one opt-in at a time",
    "project.<id>.run_progress must be a boolean", "project_archived", "propose_failed", "props must be an object",
    "provider must be substack | substack_export | url", "provider_error", "purchase_closed", "quarantineKey required",
    "queue_unavailable", "rasterizer_unavailable", "rate_limited", "raw_unavailable",
    "read_only_artifact", "refund_closed", "replacement required", "replan",
    "request_failed", "request_required", "restore_unavailable", "run_in_progress",
    "run_lock", "run_progress is a per-project opt-in — use project.<id>.run_progress", "same_email", "sample_required",
    "save_failed", "scope must be thread|turn|research", "sentence required", "session_required",
    "session_unavailable", "showcase", "showcase_not_deletable", "showcase_read_only",
    "source_required", "spec_invalid", "spec_missing", "stop",
    "store_unavailable", "stripe intake is not wired", "stripe webhook not configured", "stripe_rejected",
    "stripe_unavailable", "stripe_unconfigured", "suggestion_too_large", "summary required",
    "text required", "threadId required", "thread_not_found", "tier required",
    "title required", "title_required", "token_required", "topups_require_plan",
    "trial", "trial_base_only", "trial_ceiling", "trial_denied",
    "trial_shape", "trial_word_cap", "turnId required", "turn_not_found",
    "unauthenticated", "unavailable", "uncommitted_head", "undeletable",
    "unknown_protocol", "unknown_provider", "unrecognized bibliography format", "unsupported action",
    "unsupported_csl_style", "unsupported_format", "unsupported_media", "unsupported_profile",
    "unsupported_version", "upgrade_required", "upload_unavailable", "upstream_refused",
    "upstream_unavailable", "user_sources_memo_only", "usercontent_unavailable", "voice_locked",
    "workflows must be a string array",
];

/**
 * The per-code table — the codes whose copy needs its own words. Anything not named here
 * resolves through FAMILIES (the ordered classifiers below), then the generic fallback.
 */
const BY_CODE: Readonly<Record<string, ErrorCopyEntry>> = {
  // session / access
  unauthenticated: { sentence: S.sessionEnded, action: A.signIn },
  session_required: { sentence: S.sessionEnded, action: A.signIn },
  session_unavailable: { sentence: S.sessionEnded, action: A.signIn },
  invite_required: { sentence: S.needInvite, action: A.goBack },
  email_unverified: { sentence: S.emailUnverified, action: A.verifyFirst },
  phone_challenge_required: { sentence: S.phoneRequired, action: A.verifyFirst },
  forbidden: { sentence: S.noAccess, action: A.goBack },
  forbidden_origin: { sentence: S.notAllowed, action: A.goBack },
  denied: { sentence: S.notAllowed, action: A.goBack },
  // money / plan
  insufficient_balance: { sentence: S.needCredits, action: A.addCredits },
  upgrade_required: { sentence: S.needPlan, action: A.openBilling },
  model_tier_requires_upgrade: { sentence: S.needPlan, action: A.openBilling },
  trial_base_only: { sentence: S.needPlan, action: A.openBilling },
  chat_only_plan: { sentence: S.needPlan, action: A.openBilling },
  trial_denied: { sentence: S.needPlan, action: A.openBilling },
  trial_ceiling: { sentence: S.needPlan, action: A.openBilling },
  trial_word_cap: { sentence: S.needPlan, action: A.openBilling },
  trial_shape: { sentence: S.needPlan, action: A.openBilling },
  topups_require_plan: { sentence: S.topupsNeedPlan, action: A.openBilling },
  purchase_closed: { sentence: S.purchasesPaused, action: A.tryAgainSoon },
  plan_waitlisted: { sentence: S.planWaitlisted, action: A.openBilling },
  first_month_cap: { sentence: S.firstMonthCap, action: A.openBilling },
  no_stripe_customer: { sentence: S.noBillingAccount, action: A.openBilling },
  no_subscription: { sentence: S.noBillingAccount, action: A.openBilling },
  stripe_rejected: { sentence: S.billingRefused, action: A.fixAndRetry },
  stripe_unconfigured: { sentence: S.billingDown, action: A.tryAgainSoon },
  stripe_unavailable: { sentence: S.billingDown, action: A.tryAgainSoon },
  same_email: { sentence: S.sameEmail, action: A.nothingToDo },
  refund_closed: { sentence: S.expired, action: A.goBack },
  account_suspended: { sentence: S.accountSuspended, action: A.contactSupport },
  daily_run_ceiling: { sentence: S.limitHit, action: A.tryAgainSoon },
  concurrency_limit: { sentence: S.limitHit, action: A.tryAgainSoon },
  // run / state conflicts
  locked: { sentence: S.busyRun, action: A.waitForRun },
  run_lock: { sentence: S.busyRun, action: A.waitForRun },
  run_in_progress: { sentence: S.busyRun, action: A.waitForRun },
  build_in_progress: { sentence: S.busyRun, action: A.waitForRun },
  conversion_pending: { sentence: S.busyRun, action: A.waitForRun },
  voice_locked: { sentence: S.busyRun, action: A.waitForRun },
  fork_read_by_run: { sentence: S.forkReadByRun, action: A.waitForRun },
  fork_has_edits: { sentence: S.forkHasEdits, action: A.nothingToDo },
  not_a_fork: { sentence: S.notAFork, action: A.nothingToDo },
  cancel_to_edit: { sentence: S.cancelToEdit, action: A.fixAndRetry },
  frozen: { sentence: S.frozen, action: A.pickSupported },
  not_editable: { sentence: S.frozen, action: A.pickSupported },
  project_archived: { sentence: S.archived, action: A.goBack },
  uncommitted_head: { sentence: S.notSavedYet, action: A.fixAndRetry },
  already_resolved: { sentence: S.alreadyDone, action: A.nothingToDo },
  already_clean: { sentence: S.alreadyDone, action: A.nothingToDo },
  nothing_to_update: { sentence: S.alreadyDone, action: A.nothingToDo },
  no_pending_proposal: { sentence: S.noPendingProposal, action: A.goBack },
  figure_not_ready: { sentence: S.notReadyYet, action: A.tryAgainSoon },
  outline_cited: { sentence: S.outlineCited, action: A.goBack },
  draft_outline_required: { sentence: S.needOutline, action: A.fixAndRetry },
  not_a_human_revision: { sentence: S.notHumanRevision, action: A.pickSupported },
  showcase_read_only: { sentence: S.readOnly, action: A.nothingToDo },
  showcase_not_deletable: { sentence: S.readOnly, action: A.nothingToDo },
  demo_read_only: { sentence: S.readOnly, action: A.nothingToDo },
  read_only_artifact: { sentence: S.readOnly, action: A.nothingToDo },
  undeletable: { sentence: S.undeletable, action: A.goBack },
  not_a_rhema_export: { sentence: S.notRhemaExport, action: A.pickSupported },
  not_markdown: { sentence: S.notMarkdown, action: A.pickSupported },
  pins_full: { sentence: S.pinsFull, action: A.fixAndRetry },
  external_nav_refused: { sentence: S.externalNav, action: A.goBack },
  binary_download: { sentence: S.binaryDownload, action: A.goBack },
  // not-found family heads
  not_found: { sentence: S.notFound, action: A.goBack },
  "not found": { sentence: S.notFound, action: A.goBack },
  "project not found": { sentence: S.notFound, action: A.goBack },
  draft_not_found: { sentence: S.notFound, action: A.goBack },
  base_draft_not_found: { sentence: S.notFound, action: A.goBack },
  figure_not_found: { sentence: S.notFound, action: A.goBack },
  thread_not_found: { sentence: S.notFound, action: A.goBack },
  turn_not_found: { sentence: S.notFound, action: A.goBack },
  hunk_not_found: { sentence: S.notFound, action: A.goBack },
  gap_not_found: { sentence: S.notFound, action: A.goBack },
  not_found_or_retired: { sentence: S.notFound, action: A.goBack },
  persona_not_found: { sentence: S.noProfile, action: A.fixAndRetry },
  no_voice: { sentence: S.noVoice, action: A.fixAndRetry },
  no_profile: { sentence: S.noProfile, action: A.fixAndRetry },
  no_head: { sentence: S.noDraft, action: A.fixAndRetry },
  no_draft: { sentence: S.noDraft, action: A.fixAndRetry },
  no_review: { sentence: S.noReview, action: A.goBack },
  // validation notables
  title_required: { sentence: S.titleRequired, action: A.fixAndRetry },
  name_required: { sentence: S.nameRequired, action: A.fixAndRetry },
  name_empty: { sentence: S.nameRequired, action: A.fixAndRetry },
  message_too_long: { sentence: S.messageTooLong, action: A.shorten },
  alt_too_long: { sentence: S.messageTooLong, action: A.shorten },
  suggestion_too_large: { sentence: S.tooLarge, action: A.shorten },
  import_too_large: { sentence: S.tooLarge, action: A.shorten },
  batch_too_large: { sentence: S.tooLarge, action: A.shorten },
  empty_draft: { sentence: S.draftEmpty, action: A.fixAndRetry },
  unsupported_format: { sentence: S.notSupported, action: A.pickSupported },
  unsupported_media: { sentence: S.notSupported, action: A.pickSupported },
  unsupported_csl_style: { sentence: S.notSupported, action: A.pickSupported },
  unsupported_profile: { sentence: S.notSupported, action: A.pickSupported },
  unsupported_version: { sentence: S.notSupported, action: A.pickSupported },
  // faults
  internal_error: { sentence: S.ourFault, action: A.tryAgain },
  request_failed: { sentence: S.ourFault, action: A.tryAgain },
  upstream_unavailable: { sentence: S.unavailable, action: A.tryAgainSoon },
  upstream_refused: { sentence: S.unavailable, action: A.tryAgainSoon },
  rate_limited: { sentence: S.tooFast, action: A.tryAgainSoon },
  estimate_unavailable: { sentence: S.estimateUnavailable, action: A.tryAgainSoon },
  entitlement_unavailable: { sentence: S.unavailable, action: A.tryAgainSoon },
  model_profile_rejected: { sentence: S.modelProfileRejected, action: A.pickSupported },
  chat_not_wired: { sentence: S.chatUnavailable, action: A.tryAgainSoon },
  chat_unavailable: { sentence: S.chatUnavailable, action: A.tryAgainSoon },
  chat_upstream_error: { sentence: S.chatUnavailable, action: A.tryAgainSoon },
  save_failed: { sentence: S.saveFailed, action: A.tryAgain },
};

/**
 * The ordered classifiers for the long tail — first match wins. The absence family runs first
 * so `no_pending_proposal` can't land on `pending ⇒ busy`; billing runs before the busy family
 * so `plan_waitlisted` never reads as "a run is working on it".
 */
const FAMILIES: readonly { re: RegExp; entry: ErrorCopyEntry }[] = [
  { re: /not_found|not found|^no_|_no_/, entry: { sentence: S.notFound, action: A.goBack } },
  {
    re: /required|must be|empty|missing|malformed|invalid|bad_|^bad |not a |not an |unrecognized|out of range|object$|array$|boolean$|integer|too_(long|large)|too large|ambiguous|at a time|opt-in|produced no rows/,
    entry: { sentence: S.missingOrInvalid, action: A.fixAndRetry },
  },
  { re: /unsupported|not_supported|not_implemented|unknown_(protocol|provider|workflow)|applyable|rejected|rendered|anchor_lost|boundary/, entry: { sentence: S.notSupported, action: A.pickSupported } },
  {
    re: /insufficient|entitlement|upgrade|requires_|^trial|_trial|plan_|purchase|stripe|topups|subscription|suspended|refund|ceiling|_cap$|_limit$|balance|billing/,
    entry: { sentence: S.limitHit, action: A.openBilling },
  },
  { re: /lock|in_progress|pending|wait|busy|conflict|concurrency/, entry: { sentence: S.busyRun, action: A.waitForRun } },
  { re: /frozen|editable|archived|uncommitted|fork|revision|cancellable|replan|stop/, entry: { sentence: S.conflict, action: A.reload } },
  { re: /already|nothing_to_update|absorbed|killed|resolved|clean/, entry: { sentence: S.alreadyDone, action: A.nothingToDo } },
  { re: /expired|window|closed/, entry: { sentence: S.expired, action: A.goBack } },
  { re: /unauthenticated|session|invite|token|email|challenge|auth/, entry: { sentence: S.sessionEnded, action: A.signIn } },
  { re: /forbidden|denied|origin|access/, entry: { sentence: S.noAccess, action: A.goBack } },
  { re: /demo|showcase|read_only|deletable|memo_only/, entry: { sentence: S.readOnly, action: A.nothingToDo } },
  {
    re: /unavailable|unwired|unconfigured|failed|refused|_error$|upstream|provider|store|fetch|download|upload|raster|convert|queue|restore|accept|propose|import_|export_|raw|discovery|content/,
    entry: { sentence: S.unavailable, action: A.tryAgainSoon },
  },
];

const FALLBACK: ErrorCopyEntry = { sentence: S.fallback, action: A.tryAgain };

/**
 * REQ-COPY-2 — the sentence-plus-action for an API error code, falling back to the generic
 * entry for anything un-mapped (a code emitted by a route that never entered the inventory
 * still never reaches the user verbatim).
 */
export function errorCopy(code: string): ErrorCopyEntry {
  return BY_CODE[code] ?? FAMILIES.find((f) => f.re.test(code))?.entry ?? FALLBACK;
}

/** True when a code resolves to real copy (a named entry or a family), not the fallback. */
export function hasErrorCopy(code: string): boolean {
  return BY_CODE[code] != null || FAMILIES.some((f) => f.re.test(code));
}

/**
 * The REQ-COPY-2 observability seam — `{code, requestId}` to the client console. Invariant 10:
 * the log line carries the code and the correlation id ONLY — never `detail`, never message
 * text (detail can carry PII, e.g. `detail: user.email`).
 */
export function logBffError(err: BffErrorLike): void {
  const req = err.requestId != null && err.requestId !== "" ? err.requestId : "none";
  // the client console IS the REQ-COPY-2 observability seam.
  console.warn(`[rhema] request failed: ${err.code} (request ${req})`);
}

/**
 * The composed "sentence action" text for a code — also the server-side seam (the
 * `?notice=` flash vocabulary the figure POSTs emit), where no `BffError`/`requestId` exists.
 */
export function errorSentence(code: string): string {
  const { sentence, action } = errorCopy(code);
  return `${sentence} ${action}`;
}

/**
 * The display string for a failed call — the mapped sentence plus action; `requestId` logged.
 * `err.detail` is deliberately never rendered: the api carries zod fragments, internal error
 * text, and the odd PII field in it, so the code's mapped copy is the authoritative message.
 */
export function errorMessage(err: BffErrorLike): string {
  logBffError(err);
  return errorSentence(err.code);
}
