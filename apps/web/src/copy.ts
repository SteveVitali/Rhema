// The beta shell's i18n string table — the single home for every user-facing chrome string. AC4 lints this
// table against Appendix D.2 (via @rhema/contracts `lintCopy`), so the canonical vocabulary is enforced from
// the first screen (REQ-PROD-6 / REQ-BILL-18). Keep ALL user-facing chrome here; editorial CONTENT (the
// sample dossier's prose) lives in sample-dossier.ts and is not product vocabulary.

export const COPY = {
  brand: "Rhēma",
  tagline: "A serious editor for serious writing.",

  invite: {
    heading: "Rhēma is in private beta.",
    lede:
      "Rhēma reads a finished draft the way a demanding editor would — it checks every load-bearing claim against real sources, maps the argument, and hands back a dossier you can act on.",
    accessNote: "Access is by invitation. If you have a code, sign in below.",
    sampleHeading: "See what it hands back",
    sampleLede:
      "A read-only sample dossier from a real essay. Note the contradicted claim, verified against the source it cites.",
    signInCta: "Have a code? Sign in",
  },

  login: {
    heading: "Sign in",
    note: "Private beta — an invitation code is required.",
    codeLabel: "Invitation code",
    codePlaceholder: "Enter your code",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    continueEmail: "Email me a sign-in link",
    continueGoogle: "Continue with Google",
    orDivider: "or",
    linkSent: "Check your email for a sign-in link.",
    errorRequired: "An invitation code is required to sign in.",
    errorInvalid: "That invitation code isn't valid.",
    errorExpired: "That invitation code has expired.",
    errorRevoked: "That invitation code is no longer active.",
    errorExhausted: "That invitation code has already been used.",
    errorEmailMismatch: "That invitation code is reserved for a different email.",
    errorEmailRequired: "Enter the email your invitation was sent to.",
  },

  projects: {
    heading: "Your projects",
    empty: "No projects yet.",
    signOut: "Sign out",
  },

  project: {
    backToList: "All projects",
    betaNote: "The full editing surface arrives with the studio. This is the beta view.",
    importCta: "Import a draft",
    editCta: "Edit source",
  },

  import: {
    heading: "Import a draft",
    lede: "Upload a manuscript (.md, .txt, .html, .docx, .pdf) or paste it. We convert it to clean text and show you exactly what changed before anything is created.",
    fileLabel: "Choose a file",
    pasteLabel: "…or paste your draft",
    convertCta: "Convert and preview",
    previewHeading: "Conversion preview",
    sourceHeading: "Source",
    convertedHeading: "Converted",
    warningsHeading: "Conversion notes",
    noWarnings: "Everything converted cleanly.",
    createLabel: "Create and fix later",
    fixNowLabel: "Fix now",
    fixNowNote: "Fix now opens the affected block; Create and fix later keeps notes on the timeline.",
    created: "Draft created.",
  },

  runSheet: {
    heading: "Run the Editor",
    lede: "Choose how thorough the read is. The estimate updates as you change it; you are never charged more than the cap.",
    rigorLegend: "Rigor",
    runReview: "Run review",
    runRevise: "Run revise",
    runFactCheck: "Run fact-check",
    confirm: "Confirm and run",
    ask: "Ask a question first",
    change: "Change",
    why: "Why this estimate?",
    advanced: "Advanced",
    started: "Your run has started. Watch it on the project.",
    insufficient: "This run's cap is more than your spendable balance. Lower the rigor to fit, or add credits.",
    // PRB.08 — the exhaustion panel's Payment Link action + the suspended-account notice + the final-month
    // beta-plan offer (copy + link only — REQ-BETA-14/15, §14.6; no subscription machinery).
    buyCredits: "Add credits",
    suspended: "This account is paused while a payment dispute is open — runs can't start until it resolves.",
    planOffer: "Beta pricing ends when we launch. Founding users keep the beta rate for a year.",
    planOfferLink: "See the beta plan",
    factCheckToggle: "Fact-check every claim",
    discourseToggle: "Map the field",
    secondReadToggle: "Second read",
    repairResearchToggle: "Repair research",
    gapCheckToggle: "Gap check",
    backToProject: "Back to the project",
  },

  dossier: {
    letterHeading: "The Editor's letter",
    claimsHeading: "Claim ledger",
    findingsHeading: "Findings",
    readOnlyNote: "Read-only sample. In your projects, each finding is something you can act on.",
    fetchedLabel: "fetched",
    contradictedTierOneLabel: "Contradicted · Tier 1",
  },

  // The delivered-review dossier reading surfaces (PRB.04, §5.5/§5.7/§6.6). Editorial CONTENT (the letter
  // prose, claim text) is data, not vocabulary; these are the chrome labels. Kept free of banned strings.
  review: {
    backToProject: "Back to the project",
    heading: "The review",
    notReviewed: "No delivered review yet. Run the Editor to get your dossier.",
    runStateLabel: {
      created: "Created",
      queued: "Queued",
      provisioning: "Starting",
      running: "Running",
      waiting_gate: "Waiting for you",
      finalizing: "Finishing",
      completed: "Completed",
      completed_partial: "Completed in part",
      failed: "Failed",
      cancelled: "Cancelled",
    } as Record<string, string>,
    phaseLabel: {
      reading_the_piece: "Reading the piece",
      checking_claims: "Checking claims",
      mapping_the_field: "Mapping the field",
      second_read: "Second read (independent)",
      weighing_the_argument: "Weighing the argument",
      editors_letter: "Editor's letter and rubric",
    } as Record<string, string>,
    offLabel: "off",
    // PRB.08 — the run card's refund line (failed/refused/cancelled, or a silent reconciliation refund).
    refundFmt: "refunded {n} credits; partial results kept",
    feedHeading: "Live feed",
    densityLabel: { summary: "Summary", details: "Details", verbose: "Verbose" } as Record<string, string>,
    letterTocHeading: "Contents",
    attestationHeading: "The boundary",
    trust: {
      boundary:
        "The Editor's sandbox never had the Drafter's notes mounted — verified by the hydration manifest and the proxy log",
      fetchedFmt: "{n} URLs fetched",
      secondRead: "second read received the draft only",
      blockedOne: "{n} blocked attempt",
      blockedMany: "{n} blocked attempts",
    },
    claimsHeading: "Claim ledger",
    fetchedLabel: "fetched",
    verdictLabel: {
      verified: "Verified",
      substantially_accurate: "Substantially accurate",
      misleading_in_context: "Misleading in context",
      unsupported: "Unsupported",
      contradicted: "Contradicted",
      unverifiable: "Unverifiable",
      verified_against_user_source: "Verified against your source",
    } as Record<string, string>,
    stanceLabel: { supports: "supports", contradicts: "contradicts", contextualizes: "contextualizes" } as Record<string, string>,
    kindNounLabel: {
      factual: "factual",
      statistical: "statistical",
      quotation: "quotation",
      interpretive: "interpretive",
      normative: "normative",
      predictive: "predictive",
    } as Record<string, string>,
    notCheckableFmt: "{kind} — not a matter of verification",
    contradictedTierOneLabel: "Contradicted · Tier 1",
    rubricHeading: "Rubric",
    dimensionLabel: {
      thesis_contribution: "Thesis and contribution",
      argument_rigor: "Argument rigor",
      evidence_accuracy: "Evidence and accuracy",
      originality_situatedness: "Originality and situatedness",
      structure: "Structure",
      prose: "Prose",
      voice_audience_fit: "Voice and audience fit",
      intellectual_honesty: "Intellectual honesty",
    } as Record<string, string>,
    capFmt: "capped at {at} — {reason}",
    secondReadHeading: "Second read",
    corroboratedFmt: "{n} corroborated by both reads",
    secondReadOnlyFmt: "{n} raised by the second read",
    rejectedHeading: "Considered and rejected",
    promoteLabel: "Address this anyway",
    emptyRejected: "The second read withdrew nothing.",
    findingsHeading: "Findings",
    severityLabel: { blocking: "Blocking", major: "Major", minor: "Minor", note: "Note" } as Record<string, string>,
    findingKindLabel: {
      claim: "claim",
      discourse: "discourse",
      argument: "argument",
      structure: "structure",
      craft: "craft",
      voice: "voice",
      continuity: "continuity",
    } as Record<string, string>,
    provisionalLabel: "streaming…",
    dispositionPast: {
      accept: "accepted",
      adapt: "adapted",
      rebut: "rebutted",
      defer: "deferred",
      escalate: "escalated",
    } as Record<string, string>,
    disposedFmt: "You {verb} this",
    appliedLabel: "You applied this suggestion",
    conflictsHeading: "Where you and the second read disagree",
    conflictLineFmt: "You {verb} this; the Editor withdrew it — keep your disposition?",
    obligationSummaryFmt: "⚑ {open} open · {addressed} addressed",
    obligationStateLabel: {
      open: "open",
      addressed: "addressed",
      discharged: "discharged",
      rebutted: "rebutted",
      deferred: "deferred",
      mooted: "discharged (pending)",
      reopened: "reopened",
    } as Record<string, string>,
  },

  // PRB.05 — the five-verb triage controls (§5.7; REQ-BETA-6, REQ-MOBILE-11 amended).
  triage: {
    verbLabel: {
      accept: "Accept",
      adapt: "Adapt",
      rebut: "Rebut",
      defer: "Defer",
      escalate: "Escalate",
    } as Record<string, string>,
    noteLabel: "Note — required for Rebut and Escalate",
    noteRequired: "A note is required for Rebut and Escalate — nothing was saved.",
    notePlaceholder: "Not this round",
    reasonLegend: "Why? (optional)",
    reasonLabel: {
      // REQ-BETA-6's `wrong` code — "wrong" is a banned string outside a calibration verdict (Appendix
      // D.2), so the chip reads "Incorrect".
      wrong: "Incorrect",
      stylistic_disagreement: "Stylistic disagreement",
      already_knew: "Already knew",
      too_costly: "Too costly",
      not_this_round: "Not this round",
      other: "Other",
    } as Record<string, string>,
    adaptLabel: "Proposed edit",
    appliedNote: "applies at revision time",
    pretriageFmt: "You pre-triaged {n} of {m} findings — your rows are authoritative for the Revise run.",
    promoFmt: "More than {n} findings — the Drafter can propose a triage on the Revise run.",
    savedLabel: "Saved",
  },

  // PRB.05 — the §6.4 gate cards (all beta kinds) on the Needs-you surface.
  gates: {
    heading: "Needs you",
    kindLabel: {
      approve_triage: "Approve triage",
      approve_scope: "Approve scope",
      approve_sample: "Approve the sample",
      confirm_cost: "Confirm the cost",
      spend_overrun: "Spend overrun",
      resume_partial: "Resume from the partial",
      refusal: "The run refused",
      approve_plan: "Approve the plan",
      approve_outline: "Approve the outline",
      approve_cutlist: "Approve the cut list",
      choose_thesis: "Choose a thesis",
      continue_rounds: "Continue?",
    } as Record<string, string>,
    approveLabel: {
      approve_triage: "Approve proposals",
      default: "Approve",
    },
    approveAutonomousLabel: "Approve and run autonomously",
    keepPlanningLabel: "Edit guidance / keep planning",
    waitLabel: "Wait for me",
    stopLabel: "Stop",
    waitingLine: "Waiting for you — no deadline.",
    deadlineFmt: "Due {absolute} · {remaining}",
    expiredLine: "Overdue — it resolves on the next sweep.",
    doNothingLine: {
      proceed_as_proposed: "If you do nothing: it proceeds with the proposals.",
      proceed_conservative: "If you do nothing: it proceeds conservatively.",
      cancel: "If you do nothing: the run is cancelled.",
      accept_partial: "If you do nothing: the partial is accepted.",
      wait: "If you do nothing: it waits for you.",
    },
    spendFmt: "Spent {spent} credits · cap {cap}{remaining}",
    remainingFmt: " · ~{n} left on the estimate",
    presenceFmt: "Proposed to proceed in {countdown} unless you say otherwise.",
    pausedNote: "Paused while you read.",
    heldLine: "Waiting for you — the deadline is cleared.",
    guidanceLabel: "Add guidance for the run",
    standingLabel: "…and remember this for this project",
    informationalNote: "Informational — the run continues while you read.",
    escalationNote: "This ledger has escalations — they are decided only by you.",
    undecidedLabel: "Undecided",
    userActorLabel: "by you",
    // §6.4 R3 — the per-project approve_triage 24-h opt-in (default: wait for you).
    optInHeading: "Approval timing",
    optInLabel: "Auto-approve triage after 24 h on this project",
    optInNote: "Approve triage waits for you by default; opting in proceeds with the proposals after 24 h.",
    optInSave: "Save",
  },

  // PRB.05 — the Decisions list (§5.7; the beta Inbox stand-in; REQ-OBJ-7/8).
  decisions: {
    heading: "Decisions",
    empty: "Nothing is waiting on your call.",
    optionLabel: {
      decide: "Decide",
      dismiss: "Dismiss",
    } as Record<string, string>,
  },

  // PRB.06 — the What-changed surface (§5.8): what changed and why — the move cards, the obligation
  // discharge lines, the summary strip, the Inline hunk list, and the rebutted findings.
  revision: {
    heading: "What changed",
    notFound: "No delivered revision to show yet.",
    versionFmt: "v{before} → v{after}",
    stripFmt: "{addressed} obligations addressed · {rebutted} rebutted · {stillOpen} still open",
    movesFmt: "{moves} moves · {hunks} changed passages",
    moveHeadingFmt: "Move {ordinal} · {title}",
    findingLineFmt: "F-{ordinal} · {kind}",
    dischargeVerifiedFmt: "discharges {label} {lineage} — verified by {by}",
    dischargePlainFmt: "discharges {label} {lineage} — {state}",
    verifiedByLabel: {
      gap_check: "gap check",
      re_review: "re-review",
      user: "you (unverified)",
    } as Record<string, string>,
    hunkKindLabel: {
      edited: "Edited",
      added: "Added",
      removed: "Removed",
      mixed: "Changed",
    } as Record<string, string>,
    unlinkedHeading: "Unlinked changes",
    rebuttedHeading: "Rebutted",
    rebutLabel: "Rebutted",
    commentLabel: "Comment on this change",
    commentPlaceholder: "A note for the next revision…",
    commentSubmit: "Send",
    commentSavedLabel: "Noted — the next revision will read it.",
    rubricDeltaHeading: "Rubric across rounds",
    rubricBeforeLabel: "before",
    rubricAfterLabel: "after",
  },

  // PRB.07 — the source editor (§5.4/§6.3; REQ-BETA-21 stopgap #1): CodeMirror over the canonical markdown
  // with the debounced autosave, the §6.3 lock banner + Cancel-run release, the projected findings rail,
  // the note field (→ Guidance), and "Revise using your edits". No Save button exists — the sync pill tells
  // the save story (synced / syncing / offline-queued).
  editor: {
    notFound: "That draft isn't here.",
    versionFmt: "v{n}",
    versionForkFmt: "v{n} — your revision of v{base}",
    writerLockFmt: "A {workflow} run is writing this draft — editing is locked until it finishes.",
    readerLockFmt: "A {workflow} run is reading the frozen draft — editing is locked until it finishes.",
    cancelRun: "Cancel run to edit",
    sync: {
      synced: "Synced",
      syncing: "Syncing…",
      queued: "Offline — queued",
      locked: "Locked",
    },
    findingsHeading: "Findings on this draft",
    wholePiece: "Whole piece",
    lostNote: "passage changed — still applies?",
    noteLabel: "A note for the next revision",
    notePlaceholder: "Anything the revision should keep in mind…",
    noteSubmit: "Add note",
    noteSaved: "Noted — the next revision will read it.",
    revise: "Revise using your edits",
  },

  // PRB.10 — Quick Voice (§9.2–§9.6): the creation sheet, the library list, the detail page (seed editor +
  // samples + build history), the project picker, and the run sheet's voice line. Every pill label comes
  // from the shared status function — these are the chrome strings only.
  voice: {
    nav: "Voices",
    listHeading: "Your voices",
    listEmpty: "No voices yet.",
    newCta: "New voice",
    sampleCountFmt: "{n} samples",
    new: {
      heading: "New voice",
      nameLabel: "Name",
      namePlaceholder: "S. J. Sebastian — Substack",
      bylineLabel: "Byline (optional)",
      describeLabel: "Describe it (optional)",
      describeHint: "Leave this blank and Rhēma drafts one from your samples for you to correct.",
      sampleLabel: "Paste a writing sample (optional)",
      sampleFileLabel: "Or upload a file (.md, .txt, .html)",
      sampleHint: "One sample is enough for a Quick Voice.",
      sampleTitleLabel: "Sample title (optional)",
      modeLabel: "This voice is",
      modeOption: {
        self: "my own writing",
        house: "a house style",
        consented: "another writer, with permission",
        study: "for study",
      } as Record<string, string>,
      aup: "Build voices only from writing you have the right to use; Rhēma must not be used to pass generated text off as a real person's own.",
      createBuild: "Create and build",
      createOnly: "Just save — build later",
      tierLabel: "How much to build now",
      quickOption: "Quick Voice",
      quickHint: "≈ 60–150 credits · a few minutes · untested",
      sampleRequired: "A Quick Voice build needs at least one sample.",
      nameRequired: "A name is required.",
    },
    detail: {
      backToList: "All voices",
      statusHeading: "Status",
      seedHeading: "Description",
      agentDraftedMark: "Drafted by Rhēma — correct it",
      bylineLabel: "Byline",
      registersLabel: "Registers (optional, comma-separated)",
      seedSave: "Save description",
      seedSaved: "Saved — the status above updated.",
      samplesHeading: "Samples",
      samplesEmpty: "No samples yet.",
      includeLabel: "Include",
      omitLabel: "Omit",
      addSampleLabel: "Paste a new sample",
      addSampleFileLabel: "Or upload a file (.md, .txt, .html)",
      addSampleTitleLabel: "Sample title (optional)",
      addSampleCta: "Add sample",
      runsHeading: "Build history",
      runsEmpty: "No builds yet.",
      runStateLabel: {
        created: "Created",
        queued: "Queued",
        provisioning: "Starting",
        running: "Running",
        waiting_gate: "Waiting for you",
        finalizing: "Finishing",
        completed: "Completed",
        completed_partial: "Completed in part",
        failed: "Failed",
        cancelled: "Cancelled",
      } as Record<string, string>,
      artifactsHeading: "Profile artifacts",
      artifactsEmpty: "No profile artifacts yet.",
      artifactsNote: "Profile artifacts are read-only.",
      estimateFmt: "≈ {n} credits",
      buildCta: "Build voice",
      updateCta: "Update voice",
      cancelRun: "Cancel build",
      cancelDone: "Build cancelled.",
      sampleAdded: "Sample added.",
    },
    picker: {
      heading: "Voice",
      noVoice: "No voice (ad-hoc)",
      noVoiceNote: "This project writes with an ad-hoc voice.",
      save: "Save",
    },
    sheet: {
      lineLabel: "Voice",
      adHoc: "No voice — ad-hoc",
      updateFirstFmt: "Update voice first (≈{n} cr)",
      updated: "Voice update started — run this sheet when it finishes.",
    },
  },

  notFound: {
    heading: "Not found",
    body: "That page doesn't exist.",
    home: "Go home",
  },

  footer: "Rhēma · private beta",
} as const;

/** A `[path, value]` pair for every string leaf in the copy tree (functions/objects skipped). */
export function collectCopyStrings(
  obj: unknown = COPY,
  prefix = "",
): [string, string][] {
  const out: [string, string][] = [];
  if (typeof obj === "string") {
    out.push([prefix || "(root)", obj]);
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      out.push(...collectCopyStrings(v, prefix ? `${prefix}.${k}` : k));
    }
  }
  return out;
}
