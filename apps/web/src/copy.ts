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
    // PRB.13 — `signup.mode === "open"` variants (REQ-BETA-19 amended 2026-09-16): factual only — no
    // marketing copy, no pricing page language.
    accessNoteOpen: "Create an account or sign in — runs are paid for with credits you add yourself.",
    sampleHeading: "See what it hands back",
    sampleLede:
      "A read-only sample dossier from a real essay. Note the contradicted claim, verified against the source it cites.",
    signInCta: "Have a code? Sign in",
    signInCtaOpen: "Sign in or create an account",
  },

  login: {
    heading: "Sign in",
    note: "Private beta — an invitation code is required.",
    noteOpen: "Create an account or sign in — an invitation code is optional.",
    codeLabel: "Invitation code",
    codeLabelOptional: "Invitation code (optional)",
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
    // PRB.13 — self-serve + abuse-control copy (factual; REQ-POS-4/5/13).
    emailRequiredSelfServe: "Enter your email to get a sign-in link.",
    errorRateLimited: "Too many attempts — wait a few minutes and try again.",
    errorSignupUnavailable: "Signup isn't available right now — try again shortly.",
  },

  projects: {
    heading: "Your projects",
    empty: "No projects yet.",
    signOut: "Sign out",
  },

  // P1.04 — the §5.2 workspace home (attention groups, voice grouping, row actions, search).
  projectHome: {
    newProject: "New project",
    searchPlaceholder: "Search title, Voice, venue, or text",
    searchSubmit: "Search",
    searchResults: "Search results",
    groupByLabel: "Group by",
    groupAttention: "Attention",
    groupVoice: "Voice",
    applyLabel: "Apply",
    archivedToggle: "Archived",
    archivedShow: "Show archived",
    archivedHide: "Hide archived",
    archivedHeading: "Archived",
    deletedShow: "Show recently deleted",
    deletedHide: "Hide recently deleted",
    deletedHeading: "Recently deleted",
    deletedNote: "Deleted projects can be restored for 30 days.",
    protocolFilterLabel: "Protocol",
    protocolAll: "All protocols",
    sortLabel: "Sort",
    sortRecent: "Recent",
    sortTitle: "Title A–Z",
    filterAll: "All",
    unfiled: "Unfiled",
    unfiledVoice: "a Voice",
    voiceNoun: "Voice",
    allWorkflows: "All workflows",
    // the seven row actions (the "…" menu)
    actionOpen: "Open",
    actionRename: "Rename",
    actionDuplicate: "Duplicate",
    actionChangeVoice: "Change voice",
    actionExport: "Export…",
    actionArchive: "Archive",
    actionUnarchive: "Restore",
    actionDelete: "Delete",
    actionRestore: "Restore",
    // disabled-reason strings (§5.2: "disabled items say why")
    voiceLockedReason: "Voice is set once drafts exist — change it on the project's page",
    needsDraftReason: "Needs a draft — start or upload one first",
    needsReviewReason: "Needs a delivered review first",
    chipRun: "Run",
    chipSheet: "Sheet",
    renamePlaceholder: "New title",
    renameSave: "Rename",
    quietSummaryUnfiled: "Unfiled",
    quietSummaryVoiced: "with a Voice",
  },

  // P1.04 — the §5.3 new-project sheet: exactly three entries + protocol/venue/Voice picks.
  newProject: {
    heading: "New project",
    lede: "Three ways in. Pick one — everything else has a sensible default.",
    titleLabel: "Title",
    titlePlaceholder: "The working title",
    protocolLegend: "Protocol",
    venueLabel: "Venue",
    venuePlaceholder: "Pick or type a venue",
    lengthLabel: "Target length",
    voiceLegend: "Voice",
    voiceGroupYours: "Your voices",
    voiceGroupHouse: "House styles",
    noVoice: "No voice",
    voiceHintNeverBuilt: "Rhēma will draft from the description only — build a profile for measured voice.",
    entryScratch: "Start from scratch",
    entryScratchNote: "Open the Desk's Chat — research a question, name a thesis, be interviewed, or paste notes.",
    entryOutline: "Upload an outline",
    entryOutlineNote: "Drop a .md/.txt outline — it lands on the Page with a Draft v1 estimate.",
    entryDraft: "Upload a draft",
    entryDraftNote: "Drop a manuscript (.md, .txt, .html, .docx, .pdf) — it imports as a numbered Draft and gets a Review estimate.",
    startVersionLabel: "Starting version",
    fileLabel: "Choose a file",
    pasteLabel: "…or paste the text",
    continueCta: "Continue",
    createCta: "Create project",
    backToApp: "All projects",
    // the landing cards (§5.3 — each entry lands on its next-step card)
    nextStepHeading: "Next step",
    nextStepScratch: "Start in Chat — research a question, name your thesis, be interviewed, or paste notes.",
    nextStepOutlineFmt: "Draft {v} — the estimate below prices it.",
    nextStepDraftFmt: "Review {v} — the estimate below prices it.",
    estimatePending: "Estimate unavailable",
    conversionNotes: "Conversion notes",
    unconvertedNote: "Some source spans could not be converted — they are preserved with [unconverted] markers.",
  },

  project: {
    backToList: "All projects",
    betaNote: "The full editing surface arrives with the studio. This is the beta view.",
    importCta: "Import a draft",
    editCta: "Edit source",
    exportCta: "Export",
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
    // PRB.21 — the converting state (a cold convert Job runs ~2.5–4 min): honest pending copy while the
    // page's meta-refresh re-polls the preview GET on the quarantine key.
    convertingFmt: "Converting {name} — a cold start can take a few minutes.",
    convertingNote: "This page refreshes itself until the preview is ready; you can also close it and come back to the project.",
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
    // PRB.21 / D-PRB.20-1 — the in-progress state that REPLACES the Run affordance while a non-terminal
    // run exists (at most one per project; the api 409s a second create — this is the honest screen).
    inProgress: "A run is already in progress on this project.",
    openRun: "Open the live run",
    // PRB.08 — the exhaustion panel's Payment Link action + the suspended-account notice + the final-month
    // beta-plan offer (copy + link only — REQ-BETA-14/15, §14.6; no subscription machinery).
    buyCredits: "Add credits",
    suspended: "This account is paused while a payment dispute is open — runs can't start until it resolves.",
    // PRB.13 — the verified-email gate's notice (REQ-BETA-19 amended): the sign-in link is the verification.
    emailUnverified: "Runs need a verified email — your sign-in link verifies it.",
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
      // §5.10's verbatim vocabulary (lowercase, as the status-bar mock renders) — `offline`
      // interpolates {n} (the queued-change count).
      synced: "synced ✓",
      syncing: "syncing…",
      queued: "offline — queued",
      locked: "read-only",
      offline: "offline · {n} changes queued",
      readOnly: "read-only",
    },
    findingsHeading: "Findings on this draft",
    wholePiece: "Whole piece",
    lostNote: "passage changed — still applies?",
    noteLabel: "A note for the next revision",
    notePlaceholder: "Anything the revision should keep in mind…",
    noteSubmit: "Add note",
    noteSaved: "Noted — the next revision will read it.",
    revise: "Revise using your edits",
    // P1.02 — the Page (schema-first editor): the strings the Source stopgap never had.
    frozenBannerFmt: "v{n} is frozen — your edits here open a new revision.",
    forkFmt: "v{n} — your revision of v{base}",
    readOnlyNote: "This version is read-only.",
    proposalsHeading: "Proposed changes",
    accept: "Accept",
    reject: "Reject",
    danglingCiteNote: "Citations without a bibliography entry",
    authorshipHint: "View → Authorship shows who wrote each block.",
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

  // PRB.11 — the export dialog + the AI-use statement (§13.4, §8.4 REQ-VIS-10). Authorship-legibility
  // framing only (REQ-POS-13): what ran, what you decided, what you added — never anything about detection.
  export: {
    heading: "Export",
    lede: "Take the manuscript out as Markdown, plain text, or Word. Exports are never blocked — open obligations are listed, not enforced.",
    formatLegend: "Format",
    obligationsNote: "Listed for your records — export always proceeds.",
    attachLabel: "Attach the AI-use statement",
    attachNote: "A generated disclosure of how Rhēma was used on this manuscript — the workflows, model tiers, dates, and your decisions, straight from the run record.",
    statementHeading: "AI-use statement",
    statementNote: "Recomputed from the run record every time. Add your own sentences below; the generated sentences stay.",
    additionLabel: "Add a sentence to the statement",
    additionPlaceholder: "e.g. I rewrote the conclusion myself.",
    additionCta: "Add sentence",
    standaloneHeading: "Statement on its own",
    exportCta: "Export",
    exportFailed: "The export did not complete — nothing was downloaded.",
  },

  // PRB.12 — the §14.5 balance chip + usage glance, and the Settings privacy toggle (REQ-PROD-15).
  balance: {
    /** the chip's label — "1,240 cr". */
    labelFmt: "{n} cr",
    /** the hover line — "300 cr held against running jobs". */
    heldTitleFmt: "{n} cr held against running jobs",
  },
  settings: {
    nav: "Settings",
    heading: "Settings",
    privacyHeading: "Privacy",
    analyticsLabel: "Share product analytics",
    analyticsNote:
      "Usage events tell us which parts of the beta earn their keep. Turning this off stops new telemetry and removes your events from every report.",
    // P1.01 — the app-theme control (REQ-IDE-38): dark/light/auto, persisted per user; the IDE shell's
    // theme menu writes the same field.
    themeHeading: "Appearance",
    themeNote: "The shell theme. Paper pages keep their own per-project pin.",
    themeDark: "Dark",
    themeLight: "Light",
    themeAuto: "Auto (follow system)",
    saveCta: "Save",
    saved: "Saved.",
  },
  usage: {
    nav: "Usage",
    heading: "Usage",
    spendableLabel: "Spendable",
    heldLabel: "Held",
    heldNote: "credits held against running jobs",
    runsHeading: "Recent runs",
    runEmpty: "No runs yet.",
    creditsSuffix: "cr",
  },

  // P1.01 — the §5.1 IDE shell's chrome: rail, Files pane, Margin, Timeline, Desk, status bar, the View
  // menu, and the theme/paper controls. Canonical nouns only (Appendix D.2): "Files", never "Browser";
  // the view values are Write / Read / Focus; "Source" is not a View-menu entry.
  ide: {
    rail: {
      home: "Home",
      inbox: "Inbox",
      settings: "Settings",
      project: "Project navigation",
    },
    files: {
      heading: "Files",
      open: "Files ⌘1",
      close: "Close Files",
      empty: "Import a draft to add files to this project.",
      sourceFile: "Source",
    },
    margin: {
      heading: "Findings",
      ticksLabel: "Finding markers",
    },
    timeline: {
      heading: "Timeline",
      empty: "No runs yet — the round log appears here.",
      close: "Close Timeline",
    },
    desk: {
      heading: "Desk",
      tabs: {
        chat: "Chat",
        feed: "Live feed",
        findings: "Findings",
        claims: "Claims",
      },
      emptyChat: "The Assistant lands here in a later pass.",
      emptyFeed: "No run activity yet.",
      emptyFindings: "No findings yet.",
      emptyClaims: "No claims yet.",
      findingsTable: {
        finding: "Finding",
        severity: "Severity",
        kind: "Kind",
        status: "Status",
      },
      close: "Close Desk",
    },
    statusBar: {
      view: "View",
      theme: "Theme",
      paper: "Paper",
      synced: "Synced",
      syncing: "Syncing…",
      offline: "Offline — changes queued",
      creditsFmt: "{n} cr",
      versionPrefix: "",
      wordsFmt: "{n} words",
      readMinFmt: "{n} min read",
    },
    viewMenu: {
      heading: "View",
      views: {
        write: "Write",
        read: "Read",
        focus: "Focus",
      },
      findingCards: "Finding cards",
      suggestionsInline: "Inline suggestions",
      authorship: "Authorship",
      // NOTE: the Advanced toggle reuses COPY.runSheet.advanced at the IdeFrame labels site — Appendix D.2
      // sanctions the term ONCE (the progressive-disclosure label); a second copy-table entry trips the
      // copy lint even though this is the same permitted role.
      fontSerif: "Serif paper",
      fontSans: "Sans paper",
      readerBigger: "Bigger text",
      readerSmaller: "Smaller text",
    },
    themes: {
      dark: "Dark",
      light: "Light",
      auto: "Auto (system)",
      paperLight: "Pinned light",
      paperFollow: "Follow app theme",
      paperDark: "Pinned dark",
    },
    emptyProject: {
      titlePlaceholder: "Untitled project",
      cards: [
        { title: "Import a file", body: "Bring in a draft — docx, markdown, or text." },
        { title: "Paste text", body: "Drop a manuscript in directly." },
        { title: "Start a review", body: "Run the reader over what you have." },
      ],
    },
    states: {
      emptyFindings: "No findings.",
      runFailed: {
        heading: "The run failed",
        phaseLabel: "Stopped during",
        refund: "Partial output kept. Credits for the unfinished work were returned.",
        resume: "Resume",
        inboxNote: "An Inbox item was created.",
      },
      conflict: "This changed elsewhere — your edits are queued until the conflict resolves.",
      frozen: "This version is frozen — it can't be edited.",
      insufficient: "Not enough credits — top up to run.",
      cancelRun: {
        heading: "Cancel this run?",
        body: "The run stops and its partial output is kept. This can't be undone.",
        confirm: "Cancel run",
        keep: "Keep running",
      },
    },
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
