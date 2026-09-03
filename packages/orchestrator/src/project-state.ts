// The §6.3 project lifecycle as one pure function (REQ-PROD-9; REQ-SPEC-3; ledger K8).
//
// The user-visible state is a PURE function of the project's row-sets, shared by the project card pill, the
// Suggested-next button, the palette's enabled verbs, notifications and the mobile app. It is COMPUTED, never
// stored — no surface holds a `status` column (REQ-SPEC-3). This function and the §12.4 run state machine are
// the product's only two state models. Consumed by PRB.01 / P1.04 / notifications / palette.

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

/** The two overlays (§6.3): a run executing (`running`) or any run in `waiting_gate` (`needs_you`). */
export type ProjectStateOverlay = "running" | "needs_you";

export interface SuggestedNext {
  /** Machine action key the palette / Suggested-next button dispatches. */
  readonly action:
    | "start_or_upload"
    | "make_outline"
    | "draft_v1"
    | "review"
    | "read_letter"
    | "revise"
    | "revise_using_edits"
    | "export"
    | "archive"
    | "show_run"
    | "approval"
    | "none";
  readonly label: string | null;
}

export interface ProjectState {
  readonly key: ProjectStateKey;
  readonly pill: string;
  readonly overlay: ProjectStateOverlay | null;
  readonly suggested: SuggestedNext;
}

// ---- inputs: the row-sets §6.3 names (kept minimal + structural so fixtures reproduce every row) ----

export interface DraftVersionRef {
  readonly n: number;
  /** `human_revision` marks a version the user forked by editing a reviewed draft (§6.3). */
  readonly origin: string;
}
export interface ReviewRef {
  /** The draft version this review is of. */
  readonly draftN: number;
  /** When the Editor's-letter route was first visited (enables Revise; §6.3). */
  readonly letterOpenedAt?: Date | string | null;
}
export interface ResponseRef {
  /** The draft version whose review this response (Revise output) answered. */
  readonly reviewDraftN: number;
}
export interface RunStateRef {
  readonly state: string;
}
export interface ExportRef {
  readonly versionN: number;
}
export interface ChatSignals {
  readonly assistantTurns: number;
  readonly claimShapedMessages: number;
}

export interface ProjectStateInput {
  readonly outlinePresent: boolean;
  readonly versions: readonly DraftVersionRef[];
  readonly reviews: readonly ReviewRef[];
  readonly responses: readonly ResponseRef[];
  readonly runs: readonly RunStateRef[];
  readonly acceptedVersionN?: number | null;
  readonly exports: readonly ExportRef[];
  readonly archivedAt?: Date | string | null;
  readonly chat?: ChatSignals;
}

const PILL: Record<ProjectStateKey, string> = {
  empty: "Empty",
  researching: "Researching",
  outlined: "Outlined",
  draft: "Draft",
  reviewed: "Reviewed",
  edited_by_you: "Edited by you",
  accepted: "Accepted",
  exported: "Exported",
  archived: "Archived",
};

// A run is "executing" (holds compute / a write lock and is not parked at a gate) in these states.
const EXECUTING = new Set(["provisioning", "running", "cancelling", "finalizing", "orphaned"]);

function suggested(action: SuggestedNext["action"], label: string | null): SuggestedNext {
  return { action, label };
}

function base(key: ProjectStateKey, s: SuggestedNext): ProjectState {
  return { key, pill: PILL[key], overlay: null, suggested: s };
}

/** Compute the §6.3 state (base key + pill + suggested next) with the running / needs_you overlays applied. */
export function projectState(input: ProjectStateInput): ProjectState {
  const archived = input.archivedAt != null;
  const executing = input.runs.some((r) => EXECUTING.has(r.state));
  const needsYou = input.runs.some((r) => r.state === "waiting_gate");

  // Overlay precedence follows §6.3's pseudocode: archived first, then a running run, then an open approval.
  if (archived) {
    return base("archived", suggested("none", null));
  }
  if (executing) {
    return { key: baseKey(input), pill: "Running", overlay: "running", suggested: suggested("show_run", "the run card") };
  }
  if (needsYou) {
    return {
      key: baseKey(input),
      pill: "Needs you",
      overlay: "needs_you",
      suggested: suggested("approval", "the Approval card"),
    };
  }
  return baseState(input);
}

/** The underlying content-derived key (ignoring overlays) — used as the overlay's `key` too. */
function baseKey(input: ProjectStateInput): ProjectStateKey {
  return baseState(input).key;
}

function baseState(input: ProjectStateInput): ProjectState {
  const hasDraft = input.versions.length > 0;

  if (!hasDraft) {
    if (input.outlinePresent) return base("outlined", suggested("draft_v1", "Draft v1"));
    const chat = input.chat ?? { assistantTurns: 0, claimShapedMessages: 0 };
    if (chat.assistantTurns >= 1) {
      // researching; the Make-an-outline verb is suggested only once the chat holds ≥1 claim-shaped message.
      return {
        key: "researching",
        pill: PILL.researching,
        overlay: null,
        suggested:
          chat.claimShapedMessages >= 1
            ? suggested("make_outline", "Make an outline")
            : suggested("none", null),
      };
    }
    return base("empty", suggested("start_or_upload", "Start from scratch / Upload"));
  }

  const latest = input.versions.reduce((a, b) => (b.n > a.n ? b : a));

  // Accepted / exported take precedence over review state (§6.3): accepted && !exported → Export; exported → Archive.
  if (input.acceptedVersionN != null) {
    const exportedAccepted = input.exports.some((e) => e.versionN === input.acceptedVersionN);
    if (exportedAccepted) return base("exported", suggested("archive", "Archive"));
    return base("accepted", suggested("export", "Export"));
  }

  const reviewOfLatest = input.reviews.find((r) => r.draftN === latest.n);
  const latestAnswered =
    reviewOfLatest != null && input.responses.some((resp) => resp.reviewDraftN === latest.n);

  if (reviewOfLatest != null && !latestAnswered) {
    const letterOpened = reviewOfLatest.letterOpenedAt != null;
    return base(
      "reviewed",
      letterOpened
        ? suggested("revise", "Revise from this review")
        : suggested("read_letter", "Read the Editor's letter"),
    );
  }

  // A human edit to a reviewed draft forked to v(N+1) (origin human_revision), orphaning the earlier review.
  const orphanedReview = input.reviews.some(
    (r) => r.draftN < latest.n && !input.responses.some((resp) => resp.reviewDraftN === r.draftN),
  );
  if (latest.origin === "human_revision" && orphanedReview) {
    return base("edited_by_you", suggested("revise_using_edits", "Revise using your edits"));
  }

  // latest vN has no (unanswered) review → Draft, suggested Review.
  return base("draft", suggested("review", "Review"));
}
