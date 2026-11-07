// The beta shell's i18n string table — the single home for every user-facing chrome string. AC4 lints this
// table against Appendix D.2 (via @rhema/contracts `lintCopy`), so the canonical vocabulary is enforced from
// the first screen (REQ-PROD-6 / REQ-BILL-18). Keep ALL user-facing chrome here; editorial CONTENT (the
// sample dossier's prose) lives in sample-dossier.ts and is not product vocabulary.

export const COPY = {
  brand: "Rhēma",
  tagline: "A serious editor for serious writing.",

  // UX.1 — the public routes' meta descriptions (render.tsx emits them as description/OG/Twitter).
  // Factual, no claims beyond what the pages themselves show; figures stay on /pricing (config-derived).
  meta: {
    demo: "A read-only tour of a real essay's editorial record — drafts, review dossiers, and the changes each round made.",
    landing:
      "Rhēma reads a finished draft the way a demanding editor would — it checks every load-bearing claim against real sources and hands back a dossier you can act on.",
    pricing: "Rhēma pricing — plans, credits, and the per-workflow cost cards.",
    signup: "Create a Rhēma account — Google or a magic link, no password.",
    signIn: "Sign in to Rhēma — Google or a magic link, no password.",
    showcase:
      "The Rhēma Showcase — a read-only worked example: a real essay's dossier, letter, claims ledger, and findings.",
    // R6LGL.1 (REQ-LCH-1) — the legal/trust documents' meta descriptions.
    terms: "The Rhēma Terms of Service — the rules for using the writing-review service.",
    privacy:
      "The Rhēma Privacy Policy — what we collect, what happens to your words, and the controls you hold.",
    refunds: "The Rhēma Refund Policy — how a run's credits move and when they come back.",
    acceptableUse:
      "The Rhēma Acceptable Use Policy — what you may upload and what you may do on the service.",
    contact: "How to reach Rhēma — support, privacy, and legal contact details.",
  },

  invite: {
    heading: "Rhēma is in private beta.",
    // UX.1 — open mode never claims a closed program: the invite surface's heading follows the mode.
    headingOpen: "Welcome to Rhēma.",
    lede: "Rhēma reads a finished draft the way a demanding editor would — it checks every load-bearing claim against real sources, maps the argument, and hands back a dossier you can act on.",
    accessNote: "Access is by invitation. If you have a code, sign in below.",
    // PRB.13 — `signup.mode === "open"` variants (REQ-BETA-19 amended 2026-09-16): factual only — no
    // marketing copy, no pricing page language.
    accessNoteOpen:
      "Create an account or sign in — runs are paid for with credits you add yourself.",
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
    // SEC.2 (PR-U1 form half) — the open-mode disclosure the optional code field lives behind.
    codeToggle: "Have an invitation code?",
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
    // SEC.2 — a magic-link verify refusal/expired-token redirect lands on /login?error=…
    errorLinkInvalid: "That sign-in link is no longer valid — request a new one.",
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
    // §16.4 — a venue-table row that was never verified (H4) shows its authored date, never a
    // fabricated "verified" stamp.
    venueStaleFmt:
      "Venue bounds as of {dates} — not yet re-verified; you can always type your own.",
    lengthLabel: "Target length",
    voiceLegend: "Voice",
    voiceGroupYours: "Your voices",
    voiceGroupHouse: "House styles",
    noVoice: "No voice",
    voiceHintNeverBuilt:
      "Rhēma will draft from the description only — build a profile for measured voice.",
    entryScratch: "Start from scratch",
    entryScratchNote:
      "Open the Desk's Chat — research a question, name a thesis, be interviewed, or paste notes.",
    entryOutline: "Upload an outline",
    entryOutlineNote: "Drop a .md/.txt outline — it lands on the Page with a Draft v1 estimate.",
    entryDraft: "Upload a draft",
    entryDraftNote:
      "Drop a manuscript (.md, .txt, .html, .docx, .pdf) — it imports as a numbered Draft and gets a Review estimate.",
    startVersionLabel: "Starting version",
    fileLabel: "Choose a file",
    pasteLabel: "…or paste the text",
    continueCta: "Continue",
    createCta: "Create project",
    backToApp: "All projects",
    // the landing cards (§5.3 — each entry lands on its next-step card)
    nextStepHeading: "Next step",
    nextStepScratch:
      "Start in Chat — research a question, name your thesis, be interviewed, or paste notes.",
    nextStepOutlineFmt: "Draft {v} — the estimate below prices it.",
    nextStepDraftFmt: "Review {v} — the estimate below prices it.",
    estimatePending: "Estimate unavailable",
    conversionNotes: "Conversion notes",
    unconvertedNote:
      "Some source spans could not be converted — they are preserved with [unconverted] markers.",
    // SPA.14 — the sheet's refusal copy, lifted from server.ts literals so the JSON mutation
    // branches' `detail` and the SSR inline re-render share the ONE string (REQ-BFF-5's
    // refusal-as-rerender; REQ-SAFE-10's single-source rule).
    titleRequired: "A title is required.",
    uploadOrPasteRequired: "Upload a file or paste the text.",
    conversionStartFailed: "The conversion could not start — try again.",
    createFailedFmt: "Could not create the project ({detail}).",
    createFailed: "Could not create the project.",
  },

  project: {
    backToList: "All projects",
    backToProject: "Back to the project",
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
    fixNowNote:
      "Fix now opens the affected block; Create and fix later keeps notes on the timeline.",
    created: "Draft created.",
    // ONB.1 (REQ-GROWTH-1) — the converting state, honest about the format: text formats ride the
    // warm convert service (usually seconds); PDFs still run the batch Job (~minutes on a cold
    // start). The page's meta-refresh re-polls the preview GET on the quarantine key.
    convertingFmt: "Converting {name} — this usually takes a few seconds.",
    convertingSlowFmt: "Converting {name} — a PDF can take a few minutes.",
    // the key-only poll can't see the format — say both bounds rather than promise either.
    convertingUnknownFmt:
      "Converting {name} — a text import usually takes a few seconds; a PDF can take a few minutes.",
    convertingNote:
      "This page refreshes itself until the preview is ready; you can also close it and come back to the project.",
  },

  runSheet: {
    heading: "Run the Editor",
    lede: "Choose how thorough the read is. The estimate updates as you change it; you are never charged more than the cap.",
    // R6MNY.1 (REQ-LCH-5a) — the new-user charge explanation, the SAME claim the paid-account
    // notice makes (packages/ledger metered-notice.ts): a run is charged for what it actually did,
    // never the flat estimate, and the cap is the ceiling. The wording is true under BOTH debit
    // modes — under `committed` each phase's actual cost is debited against the cap hold (the
    // refunds page's shipped phrasing), under `metered` the final figure is the metered one.
    meteredNote:
      "You pay for a run's actual cost as each phase completes — never the flat estimate, and never more than the cap you confirm here.",
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
    insufficient:
      "This run's cap is more than your spendable balance. Lower the rigor to fit, or add credits.",
    // PRB.21 / D-PRB.20-1 — the in-progress state that REPLACES the Run affordance while a non-terminal
    // run exists (at most one per project; the api 409s a second create — this is the honest screen).
    inProgress: "A run is already in progress on this project.",
    openRun: "Open the live run",
    // PRB.08 — the exhaustion panel's Payment Link action + the suspended-account notice + the offer
    // line (copy + link only — REQ-BETA-14/15, §14.6; no subscription machinery). UX.1: the old text
    // claimed a "beta plan" no pricing.json plan backs — the honest version just points at /pricing
    // (itself config-derived; no terms are hand-written here).
    buyCredits: "Add credits",
    // BILL.3 — the exhaustion panel + the bounced POST while purchase is closed for the account.
    purchasePaused:
      "Purchases are paused while we finish rolling them out — your balance and work are safe.",
    suspended:
      "This account is paused while a payment dispute is open — runs can't start until it resolves.",
    // PRB.13 — the verified-email gate's notice (REQ-BETA-19 amended): the sign-in link is the verification.
    emailUnverified: "Runs need a verified email — your sign-in link verifies it.",
    // renders only when the deploy configures the offer link (env `BETA_PLAN_OFFER_URL`); the copy
    // makes no pricing claim — it points at the config-derived pricing page.
    planOffer: "Plans and credit packs are listed on the pricing page.",
    planOfferLink: "See pricing",
    factCheckToggle: "Fact-check every claim",
    discourseToggle: "Map the field",
    secondReadToggle: "Second read",
    repairResearchToggle: "Repair research",
    gapCheckToggle: "Gap check",
    backToProject: "Back to the project",
    // P1.06 — the §5.6 collapsed row's editable fields + the §14.3 trial badge + the §7.2 scope pills'
    // whole-draft comparison line.
    approvals: "Approvals",
    approvalDisplay: {
      named: "Named approvals",
      wait_each: "Wait for me at each",
      run_to_completion: "Run to completion",
    },
    // P1.09 (§5.6/§6.4) — the per-run autonomous override ("this run only"; the project policy above
    // is untouched; spend/refusal cards still wait — REQ-SPEC-1).
    autoRunLabel: "This run only — run it to completion",
    capLabel: "Budget cap (credits)",
    dontAskLabel: "Don't ask me to confirm runs under (credits)",
    guidanceLabel: "Guidance",
    guidancePlaceholder: "Anything this run should know?",
    standingNotesFmt: "{n} standing notes apply",
    protocolLabel: "Protocol",
    venueLabel: "Venue",
    stageLabel: "Stage",
    wholeDraftPrefix: "Whole draft:",
    includedLabel: "Included",
    // ACT.1 — the trial refusal notices (§14.3; REQ-SPEC-8): deny / challenge / paused each render
    // honest copy and create no run. The word-cap + shape refusals are plain facts of the claim.
    trialDenied: "This device has already had its included Review — add credits to run.",
    trialCeiling:
      "The included-Review quota is full for today — try again tomorrow, or add credits.",
    trialPhoneChallenge:
      "Before your included Review can start, we need to verify this device — a quick phone check is on the way.",
    entitlementUnavailable:
      "The included Review isn't available on this account — add credits to run.",
    trialWordCapFmt:
      "Your included Review covers up to {cap} words — this draft runs the first {cap}; shorter scope or add credits to run it all.",
    trialShape:
      "The included Review is Standard rigor on Base — switch the levers back or add credits to run your way.",
    // EST.1 — the model-tier select + plan-clamp notice (§6.5's tier choice, REQ-IDE-13 amended) and
    // the unmeasured-inputs estimate state (fail closed — "—", never a fabricated figure).
    modelTierLabel: "Model tier",
    tierLockedSuffix: "(not on your plan)",
    tierClampedFmt: "{requested} isn't on your plan — priced on {resolved}.",
    estimatingLabel: "Estimate pending — the draft is still being measured.",
    resolutionLabels: {
      turn_off_fact_check: "Turn off fact-check",
      use_base: "Switch to Base",
      lower_rigor: "Lower the rigor",
      add_credits: "Add credits",
    },
    // SPA.20 — the two literals the SSR island carried inline (the paywall group's accessible name +
    // the provisional-estimate suffix); the SPA leaf binds them as leaves (REQ-SAFE-10).
    paywallAriaLabel: "Run cost and consent",
    refiningSuffix: " · refining…",
  },

  dossier: {
    letterHeading: "The Editor's letter",
    claimsHeading: "Claim ledger",
    findingsHeading: "Findings",
    readOnlyNote: "Read-only sample. In your projects, each finding is something you can act on.",
    fetchedLabel: "fetched",
    searchResultLabel: "Search result",
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
    // RES.2 (Appendix D.2 "Delivery labels") — the run-level label for a zero-coverage delivery. It renders
    // ABOVE the verdict on the run card + dossier and leads the `run_finished` email. The claim verdict
    // stays `Unverifiable` (verdictLabel.unverifiable, below) — the two never conflate: the label names a
    // RUN whose research could not fetch a single source, the verdict names a CLAIM that cannot be checked.
    deliveryLabel: "Unverified",
    deliveryBannerFmt:
      "{label} — research could not check the claims; the research credits were refunded",
    feedHeading: "Live feed",
    densityLabel: { summary: "Summary", details: "Details", verbose: "Verbose" } as Record<
      string,
      string
    >,
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
    searchResultLabel: "Search result",
    verdictLabel: {
      verified: "Verified",
      substantially_accurate: "Substantially accurate",
      misleading_in_context: "Misleading in context",
      unsupported: "Unsupported",
      contradicted: "Contradicted",
      unverifiable: "Unverifiable",
      verified_against_user_source: "Verified against your source",
    } as Record<string, string>,
    stanceLabel: {
      supports: "supports",
      contradicts: "contradicts",
      contextualizes: "contextualizes",
    } as Record<string, string>,
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
    // P1.13 — the figure-linked Tier-1 claim chip (§7.5; REQ-VIZ-13): links the row to its card.
    figureClaimLabel: "Figure",
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
      // P1.21 — the protocol-declared swap/add dimensions (§6.7: Op-ed +Timeliness; Memo swaps
      // Originality → Decision readiness + adds Scope discipline).
      timeliness: "Timeliness",
      decision_readiness: "Decision readiness",
      scope_discipline: "Scope discipline",
    } as Record<string, string>,
    capFmt: "capped at {at} — {reason}",
    secondReadHeading: "Second read",
    corroboratedFmt: "{n} corroborated by both reads",
    secondReadOnlyFmt: "{n} raised by the second read",
    rejectedHeading: "Considered and rejected",
    promoteLabel: "Address this anyway",
    emptyRejected: "The second read withdrew nothing.",
    findingsHeading: "Findings",
    severityLabel: { blocking: "Blocking", major: "Major", minor: "Minor", note: "Note" } as Record<
      string,
      string
    >,
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
    // ---- P1.07 — the findings surface, full (§5.7): Margin chips, shared filters, triage mode,
    // Apply (the free verb), the one-preview bulk actions, and the deep link. ----
    marginChipFmt: "{count} findings{strengths} · {top} {severity}",
    marginChipAriaFmt: "{count} findings stacked on this passage",
    wholePieceLabel: "Whole piece",
    applyLabel: "Apply",
    applyTitle: "Splice the suggestion into the draft — free, no run",
    appliedToast: "Applied — the suggestion is in the draft",
    addObligationLabel: "Add to obligations",
    // P1.13 — the craft finding's Visualize action (§7.5's fifth entry point): opens the visualize
    // sheet seeded `entry=craft_finding` with the finding's own text as the request.
    visualizeLabel: "Visualize",
    obligatedToast: "Added to obligations",
    promotedToast: "Promoted to the findings list",
    fromReviewFmt: "from Review of v{n}",
    passageLostLabel: "passage changed — still applies?",
    evidenceExplainer:
      "Every link here was actually opened and read by the Editor during this run — never quoted from memory",
    filters: {
      severity: "Severity",
      kind: "Kind",
      status: "Status",
      apply: "Filter",
      clear: "Clear",
      all: "All",
      undecided: "undecided",
      hasSuggestion: "has suggestion",
      hasUrl: "has URL",
      openObligations: "open obligations",
    },
    triageProgressFmt: "{decided} of {total} decided",
    triageObligationsFmt: "obligations: {n} open",
    triageExit: "Exit triage",
    triageEnter: "Triage mode",
    sectionLabelFmt: "§ {key}",
    severityBudgetFmt: "…plus {n} notes folded into the roadmap",
    bulk: {
      applyNotes: "Apply all notes",
      deferMinor: "Defer all minor",
      acceptSection: "Accept all in",
      previewHeading: "Preview — nothing writes until you confirm",
      skippedHeading: "Skipped",
      confirm: "Confirm",
      cancel: "Cancel",
      doneFmt: "{n} findings updated",
      emptyPreview: "Nothing this action covers.",
    },
    findingsEmpty: "No findings on this round.",
    deskTable: {
      finding: "Finding",
      severity: "Severity",
      kind: "Kind",
      status: "Status",
      actions: "Actions",
    },
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
    pretriageFmt:
      "You pre-triaged {n} of {m} findings — your rows are authoritative for the Revise run.",
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
    optInNote:
      "Approve triage waits for you by default; opting in proceeds with the proposals after 24 h.",
    optInSave: "Save",
    // ---- P1.09 — the full §6.4 surface: structured fields, decision record, explainer, the row ----
    factsHeading: "The facts",
    factLabel: {
      workflow: "Workflow",
      estimateCredits: "Estimate",
      capCredits: "Cap",
      spentCredits: "Spent",
      modelTier: "Model tier",
      attempt: "Attempt",
      reason: "Reason",
      round: "Round",
    } as Record<string, string>,
    exceedsCapLine:
      "The re-priced estimate exceeds the cap you consented to — this approval waits for you.",
    scopeFieldsHeading: "Corrections — applied as guidance",
    scopeFieldLabel: {
      stage: "Stage",
      venue: "Venue",
      audience: "Audience",
      concerns: "Concerns",
      narrow: "Narrow the scope",
    } as Record<string, string>,
    plan: {
      spineHeading: "Spine claims",
      sectionsHeading: "Sections",
      alternativesHeading: "Alternatives considered",
      gapsHeading: "Open gaps",
      orderLabel: "#",
      strikeLabel: "strike",
      notePlaceholder: "note",
      addClaimLabel: "Add a claim",
      addClaimPlaceholder: "claim text",
      addNotePlaceholder: "why (required)",
      targetWordsLabel: "target words",
      purposeLabel: "purpose",
      apparatusLabel: "Apparatus budget (credits)",
    },
    thesisLabel: "Thesis — name your pick",
    // P1.12 — the Approve-outline spine-and-sections labels (the shared editor's copy — the unlocked
    // outline editor uses the same table below under `outlinePage`).
    outline: {
      thesisLabel: "Thesis",
      venueLabel: "Venue",
      targetLengthLabel: "Target length (words)",
      protocolLabel: "Protocol",
      voiceLabel: "Voice",
      spineHeading: "Spine",
      sectionsHeading: "Sections",
      alternativesHeading: "Alternatives considered",
      gapsHeading: "Gaps only you can fill",
      sourcesHeading: "Sources",
      orderLabel: "#",
      strikeLabel: "strike",
      notePlaceholder: "note",
      addClaimLabel: "Add a claim",
      addClaimPlaceholder: "claim text",
      addNotePlaceholder: "why",
      addClaimSectionLabel: "in section",
      targetWordsLabel: "target words",
      functionLabel: "function",
      entryLabel: "entry state",
      exitLabel: "exit state",
      moveLabel: "→ section",
      unverifiedBadge: "[unverified]",
      provenanceBadge: {
        thread: "from thread",
        source: "from source",
        user_typed: "you typed",
        generated: "generated",
      } as Record<"thread" | "source" | "user_typed" | "generated", string>,
      answerLabel: "Answer",
      answerPlaceholder: "your answer lands as a claim",
    },
    cutList: {
      heading: "Proposed cuts",
      targetFmt: "target {n} words",
      protectLabel: "protect",
      wordsFmt: "{n} words",
    },
    thisRunLabel: "This run only",
    thisRunDefault: "project default",
    thisRunWait: "wait for me",
    thisRun24h: "24 hours",
    thisRun72h: "72 hours",
    decisionsHeading: "Decisions on this run",
    decisionActorLabel: {
      user: "you",
      timeout: "the deadline",
      policy: "your Run-to-completion policy",
      trial: "the trial",
    } as Record<string, string>,
    decisionActionLabel: {
      approve: "approved",
      approve_autonomous: "approved — the rest of this run runs autonomously",
      keep_planning: "kept planning",
      edit: "approved with edits",
      wait: "left waiting",
      stop: "stopped",
      proceed_conservative: "proceeded conservatively",
      proceed_as_proposed: "auto-continued",
      cancel: "cancelled",
      accept_partial: "accepted the partial",
      skipped: "skipped",
    } as Record<string, string>,
    decisionLineFmt: "{action} by {actor} at {time}{changes}",
    decisionChangesFmt: " · with {n} changes",
    explainer: {
      title: "Approvals, briefly",
      body: "An approval is a pause with a deadline. Each card says what happens if you do nothing — and a parked run spends nothing. Approve, steer, or wait for as long as you need.",
      dismissLabel: "Got it",
    },
    rowOpenLabel: "Review & approve",
    rowArtifactLabel: "Read the artifact",
  },

  // P1.09 — the per-project approval-policy settings section (§6.4 item 3; REQ-SPEC-1) + the standing
  // guidance manager (§6.5; REQ-GATE-10).
  approvals: {
    heading: "Approvals",
    policyLegend: "Approval policy",
    policyLabel: {
      named: "Named approvals",
      wait_each: "Wait for me at each",
      run_to_completion: "Run to completion",
    } as Record<string, string>,
    policyNote: {
      named: "The named cards open; each carries its deadline.",
      wait_each: "A card opens and waits after every phase — no deadlines.",
      run_to_completion:
        "Named approvals resolve by policy; spend and refusal cards still wait for you.",
    } as Record<string, string>,
    overridesHeading: "Deadlines by approval",
    overrideKindColumn: "Approval",
    overrideDefaultColumn: "Default",
    overrideColumn: "This project",
    overrideDefaultOpt: "default",
    overrideWaitOpt: "wait for me",
    overrideHoursFmt: "{n} h",
    overrideNeverLabel: "always waits for you",
    saveLabel: "Save approvals",
    savedLabel: "Saved",
    invalidLabel:
      "That deadline is not allowed for this approval — it can only grow, never shrink.",
    standingHeading: "Standing notes",
    standingEmpty:
      "No standing notes yet — “…and remember this for this project” on any approval adds one.",
    standingRetireLabel: "Retire",
    standingEditSaveLabel: "Replace",
    standingAddLabel: "Add a standing note",
    standingAddPlaceholder: "e.g. Prefer direct quotes over paraphrase",
    standingWorkflowsLabel: "Applies to",
    standingAllWorkflows: "all workflows",
    retiredHeading: "Retired",
  },

  // PRB.05 — the Decisions list (§5.7; the beta Inbox stand-in; REQ-OBJ-7/8).
  decisions: {
    heading: "Decisions",
    empty: "Nothing is waiting on your call.",
    optionLabel: {
      decide: "Decide",
      dismiss: "Dismiss",
      // P1.19 — the horizon/stall rows' real obligation options (§6.8/§11.7; REQ-OBJ-6).
      "re-defer": "Re-defer",
      drop: "Drop",
    } as Record<string, string>,
  },

  // P1.19 — §10.1's ✗ column (REQ-SPEC-20; REQ-MOBILE-3 amended): surfaces that never render their
  // controls on phone width show this note instead. The app banner renders ONLY behind the flag —
  // never at MVP.
  phoneBlocked: {
    note: "This surface needs a larger screen — the phone layout is read + decide + chat.",
  },
  appBanner: {
    enabled: false, // the shipped-app flag — flips when the 1.x app exists (REQ-MOBILE-3 amended)
    label: "Open in the Rhēma app",
  },

  // P1.19 — the §5.11 Inbox (`/app/inbox`; REQ-IDE-2 amended): needs-you → unread → earlier → voices.
  inbox: {
    heading: "Inbox",
    badgeLine: "Waiting on your call: {n}",
    markAllRead: "Mark all read",
    needsYouHeading: "Needs you",
    unreadHeading: "New",
    readHeading: "Earlier",
    voicesHeading: "Voices to update",
    empty: "Nothing here — quiet is good.",
    openCta: "Open",
    detailsCta: "Details",
    markReadCta: "Mark read",
    decideNote: "Approve happens on the card itself — open the artifact first.",
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

  // P1.08 — the §5.8 version rail over the Page (REQ-IDE-32, REQ-OBJ-6, REQ-PROD-11): the chips,
  // the restore-points dropdown (grouped "Earlier today / Yesterday / Before Review of vN / Named" —
  // older points ride Advanced), the preview-diff card, and the undoable-apply notice.
  versions: {
    outline: "Outline",
    workingLabel: "working draft",
    frozenTitle: "frozen — read-only",
    reviewedFlag: "review ✓",
    answeredFlag: "answered",
    claimsPending: "claims pending verification",
    obligationsFmt: "⚑ {open} open · {addressed} addressed",
    wordsFmt: "{n} words",
    // every drafts.origin value — the caption under the chip.
    originLabel: {
      drafted_from_outline: "Drafter",
      response_to_review: "Drafter",
      human_revision: "edited by you",
      human_upload: "you",
      duplicate: "duplicated",
      imported: "imported",
      seeded: "seeded",
      agent: "Drafter",
    } as Record<string, string>,
    compare: "Compare",
    comparePrevious: "Compare with previous",
    restorePoints: "Restore points",
    restoreEmpty: "No restore points yet — ⌘S marks one.",
    restoreGroup: {
      earlier_today: "Earlier today",
      yesterday: "Yesterday",
      before_review: "Before Review of v{n}",
      named: "Named",
      earlier: "Earlier",
    } as Record<string, string>,
    restoreTimeFmt: "{time} · {cause}",
    restorePreviewHeading: "Restore preview",
    restoreApply: "Restore this point",
    restoreUndoHint: "Undoable — restoring first marks a restore point on the current state.",
    restoredFmt:
      "Restored — v{n} carries that point's text; the previous state is a restore point.",
    notFound: "That version isn't here.",
  },

  // P1.08 — the §5.8 compare page (REQ-IDE-33): the three read-only layouts over ONE server-projected
  // diff (/p/:project/v/:n/diff/:m — the shared projection serves both directions).
  compare: {
    heading: "Compare",
    versionFmt: "v{before} → v{after}",
    layouts: {
      side: "Side-by-side",
      inline: "Inline",
      moves: "What changed and why",
    } as Record<string, string>,
    beforeCol: "Before",
    afterCol: "After",
    unchangedFmt: "{n} unchanged passages",
    unlinkedNote:
      "No revision answers this pair — every change below is an unlinked edit (the coherence read).",
    noChanges: "No differences.",
    notFound: "That pair isn't here.",
  },

  // P1.08 — the §5.13 Files pane (REQ-IDE-35/36/37, REQ-VIS-3): the typed artifact Browser's chrome.
  // Never a filesystem — sections are kinds, rows are artifacts, H kinds surface as a count only.
  files: {
    // R7SHELL.2 (UXC-30) — the tree's aria-label; the "Files" label is COPY-owned.
    heading: "Files",
    sectionLabel: {
      outline: "Outline",
      drafts: "Drafts",
      rounds: "Rounds",
      research: "Research",
      voice: "Voice",
      assets: "Assets",
      advanced: "Advanced",
    } as Record<string, string>,
    provenanceYou: "You",
    provenanceSystem: "System",
    provenanceRunFmt: "{seat} · {workflow} run · {phase}",
    lockTitle: {
      editable: "Editable",
      immutable: "Immutable",
      inspect: "Inspect only",
    } as Record<string, string>,
    // R7SHELL.2 (B10) — the frozen/working Badge text replacing the lock glyphs.
    lockBadge: {
      editable: "Working",
      immutable: "Frozen",
      inspect: "Inspect only",
    } as Record<string, string>,
    freshnessFmt: "describes v{n}",
    freshnessStaleFmt: "describes v{n} — since edited",
    sealedFmt: "{n} sealed",
    advanced: "Advanced",
    empty: "Nothing here yet.",
    readOnlyNote: "Read-only — agent memory.",
    wordsFmt: "{n} words",
  },

  // PRB.07 — the source editor (§5.4/§6.3; REQ-BETA-21 stopgap #1): CodeMirror over the canonical markdown
  // with the debounced autosave, the §6.3 lock banner + Cancel-run release, the projected findings rail,
  // the note field (→ Guidance), and "Revise using your edits". No Save button exists — the sync pill tells
  // the save story (synced / syncing / offline-queued).
  editor: {
    notFound: "That draft isn't here.",
    versionFmt: "v{n}",
    // EDIT.1 — §5.4's verbatim fork banner ("Editing vN+1 · findings from vN follow your text").
    versionForkFmt: "Editing v{n} · findings from v{base} follow your text",
    writerLockFmt: "A {workflow} run is writing this draft — editing is locked until it finishes.",
    readerLockFmt:
      "A {workflow} run is reading the frozen draft — editing is locked until it finishes.",
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
    // EDIT.1 — the post-fork banner is §5.4's verbatim wording (matches versionForkFmt above).
    forkFmt: "Editing v{n} · findings from v{base} follow your text",
    readOnlyNote: "This version is read-only.",
    proposalsHeading: "Proposed changes",
    accept: "Accept",
    reject: "Reject",
    danglingCiteNote: "Citations without a bibliography entry",
    authorshipHint: "View → Authorship shows who wrote each block.",
    // SPA.25 — the revived source view (REQ-ED-17; design/30): the toggle is a labelled affordance
    // ("Source" pressed = markdown view), the note explains the foreign-write merge posture.
    sourceToggle: "Source",
    sourceAriaLabel: "Markdown source",
    sourceStaleNote:
      "This draft changed elsewhere while you edited — your pending text applies where you changed it.",
  },

  // PRB.10 — Quick Voice (§9.2–§9.6): the creation sheet, the library list, the detail page (seed editor +
  // samples + build history), the project picker, and the run sheet's voice line. Every pill label comes
  // from the shared status function — these are the chrome strings only.
  voice: {
    nav: "Voices",
    listHeading: "Voices",
    listEmpty: "No voices yet — describe one and add a writing sample.",
    newCta: "New voice",
    sampleCountFmt: "{n} samples",
    // The shared URL placeholder — the create sheet, the link-source row, and the add-sample row
    // all carry it (SPA.13's copy containment needs a leaf, not an attribute literal).
    urlPlaceholder: "https://…",
    // P1.14 — the §9.1 three-group destination.
    groups: {
      yours: "Your voices",
      house: "House styles",
      shared: "Shared with you",
      yoursEmpty: "No voices yet — describe one and add a writing sample.",
      houseEmpty: "No house styles.",
      sharedEmpty: "Nothing shared with you yet.",
    },
    card: {
      projectsFmt: "{n} projects",
      lastBuiltFmt: "built {d}",
      tierLabel: { quick: "Quick", full: "Full" } as Record<string, string>,
      composedFmt: "Composed from {names}",
      forkCta: "Fork — make it yours",
      forkDone: "Forked — this copy is yours.",
      readOnlyNote: "read-only",
    },
    new: {
      heading: "New voice",
      nameLabel: "Name",
      namePlaceholder: "S. J. Sebastian — Substack",
      bylineLabel: "Byline (optional)",
      describeLabel: "Describe it (optional)",
      describeHint: "Leave this blank and Rhēma drafts one from your samples for you to correct.",
      sampleLabel: "Paste a writing sample (optional)",
      sampleFileLabel: "Or upload a file (.md, .txt, .html)",
      sampleUrlLabel: "Or add a sample by URL",
      sampleUrlHint:
        "Rhēma fetches the page once, through the fetcher — the build never re-fetches it.",
      sampleHint: "One sample is enough for a Quick Voice; a Full Profile needs at least four.",
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
      fullOption: "Full Profile",
      fullHint:
        "the full build — census, close reading, voice, substance, and a held-out calibration test",
      fullRequired: "A Full Profile needs at least four samples, two of them readable (≥10 words).",
      sampleRequired: "A Quick Voice build needs at least one sample.",
      nameRequired: "A name is required.",
    },
    detail: {
      backToList: "All voices",
      statusHeading: "Status",
      // P1.14 — the five tabs (§9.5).
      tabs: {
        overview: "Overview",
        description: "Description",
        samples: "Samples",
        profile: "Profile",
        runs: "Runs",
      } as Record<string, string>,
      // P1.14 — the diff-of-inputs panel (§9.3): four facts, plain words, never hashes.
      factsHeading: "What changed since the build",
      factsEmpty: "No build yet — the facts appear after the first one.",
      ageFmt: "{n} days old",
      corpusLineFmt: "{built} → {current} words",
      routeHeading: 'What "Update voice" will do',
      upgradeCta: "Upgrade to Full Profile",
      // P1.14 — the approve_sample gate card (§9.2/§6.4).
      gateHeading: "Approve the sample",
      gateEstimateFmt: "≈{n} credits (cap {cap})",
      gateExclusionsHeading: "Left out",
      gateApprove: "Approve — build the profile",
      gateWait: "Wait — keep thinking",
      gateStop: "Stop the build",
      gateWaitingFmt: "Available after {at}",
      // P1.14 — the corrections ledger (§9.4 "Correct this in your description").
      correctionsHeading: "Corrections",
      correctionsEmpty: "No corrections yet.",
      correctionLabel: "Correct this in your description",
      correctionPlaceholder: "What did the profile miss?",
      correctionCta: "Add correction",
      correctionAdded: "Correction saved — the next build carries it.",
      correctionConsumed: "carried into a build",
      correctionPending: "waiting for the next build",
      // P1.14 — build notes (the Description tab's "Notes from the last build"; §9.4).
      buildNotesHeading: "Notes from the last build",
      // P1.14 — the hold-out (§9.4): generic until calibration reveals it.
      holdoutGeneric:
        "one of your pieces is held back to test the profile — you won't see which until after calibration",
      holdoutRevealedFmt: "★ held out — {title}",
      // P1.14 — the calibration table + the deterministic measures (§9.4 Advanced).
      calibrationHeading: "Calibration",
      calibrationVerdict: {
        tested: "tested",
        untested: "untested",
        "tested-badly-off": "tested — badly off",
        pending: "pending",
      } as Record<string, string>,
      calibrationWithinFmt: "{n} of {total} within one band",
      calibrationTable: {
        feature: "Feature",
        target: "Profile target",
        prediction: "Prediction",
        real: "Held-out piece",
        band: "Within band",
      },
      measuresHeading: "Voice measures",
      advancedTag: "(Advanced)",
      profileHeading: "Profile",
      profileEmpty: "No profile yet — a build writes one.",
      sectionEmpty: "not written yet",
      // P1.14 — the project's adopt/fork hatches (§9.6; REQ-DATA-30/31).
      pinnedStaleNotice: "A refreshed profile is available — this project pins an older one.",
      testCta: "Test this voice",
      projectsHeading: "Projects",
      snapshotsHeading: "Snapshots",
      adoptCta: "Adopt the refreshed profile",
      adoptReseedCta: "Adopt the refreshed profile + reseed",
      adoptReseedLabel: "and reseed the charter (guidance lines are never rewritten)",
      forkProjectCta: "Fork under a different voice",
      reseedPreviewCta: "Preview the charter diff",
      reseedNoCharter: "No charter yet — the reseed writes one.",
      reseedGuidanceKept:
        "Your guidance lines carry over verbatim — the diff above never touches them.",
      reseedGuidanceLost: "Guidance would be lost — the adopt will NOT reseed.",
      voiceLockedNotice:
        "The voice is set once drafts exist — adopt the refreshed profile or fork under a different voice.",
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
      // P1.15 — the Sources pane (§9.5): linked providers, the review step, re-sync, settings.
      sourcesHeading: "Sources",
      sourcesEmpty: "No linked sources yet.",
      linkSubstackLabel: "Substack publication",
      linkSubstackPlaceholder: "name.substack.com",
      linkSubstackCta: "Link Substack",
      linkUrlLabel: "A page URL",
      linkUrlCta: "Link URL",
      linkExportLabel: "Substack export (.zip) — the only path for paid posts",
      linkExportCta: "Import export",
      discoverCta: "Discover items",
      confirmCta: "Confirm selection",
      confirmNote: "Unchecked items stay omitted — they are never fetched.",
      resyncCta: "Re-sync",
      resyncAllCta: "Re-sync all",
      removeSourceCta: "Remove",
      autoIncludeLabel: "Include new items automatically",
      dailySyncLabel: "Re-sync daily",
      saveSettingsCta: "Save",
      lastSyncFmt: "last synced {at}",
      neverSynced: "not synced yet",
      sourceItemsFmt: "{included} of {items} included",
      paywallBadge: "Paywalled — import your export",
      providerLabel: {
        substack: "Substack",
        substack_export: "Substack export",
        url: "URL",
      } as Record<string, string>,
      stateBadge: {
        new: "New",
        included: "Included",
        omitted: "Omitted",
        removed_remote: "Removed at source",
        unreadable: "Unreadable",
      } as Record<string, string>,
      qualityBadge: {
        clean: "clean",
        partial: "partial",
        empty: "empty",
        unreadable: "unreadable",
        reconstructed: "reconstructed",
      } as Record<string, string>,
      viewLabel: "View",
      // P1.15 — the sample drawer: preview + versions + the priced reconstruction.
      drawerHeading: "Sample",
      qualityNotesHeading: "Quality notes",
      previewHeading: "Preview",
      versionsHeading: "Version history",
      versionFmt: "v{n} · {quality}",
      noDocument: "Not fetched yet.",
      reconstructTextCta: "Reconstruct text (~4 credits)",
      reconstructVisualCta: "Visual reconstruction (~180 credits)",
      reconstructQueued: "Reconstruction queued — the new version appears here when it's ready.",
      deleteVoiceHeading: "Delete this voice",
      deleteVoiceNote:
        "Deletes the voice, its samples, and profile data. Type “delete” to confirm.",
      deleteVoiceCta: "Delete voice",
      deletePlaceholder: "delete",
      addSampleLabel: "Paste a new sample",
      addSampleUrlLabel: "Or add a sample by URL",
      addSampleFileLabel: "Or upload a file (.md, .txt, .html)",
      addSampleTitleLabel: "Sample title (optional)",
      addSampleCta: "Add sample",
      addUrlCta: "Fetch and add",
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
      registerDefault: "any register",
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

  // P1.07 — the palette's free-form obligation form (REQ-OBJ-10; `source: 'user'`, standing). The row
  // opens on the project it was created against; the Revise run's sheet lists it like any other debt.
  obligation: {
    heading: "New obligation",
    lede: "Track a revision task that isn't a finding — a note to yourself the next Revise round must clear or close.",
    titleLabel: "What must the next revision do?",
    titlePlaceholder: "e.g. Re-check the tenure statistics against the 2024 census release",
    severityLabel: "Severity",
    severityHint:
      "Pick the weight the obligation carries — blocking holds the verdict, the rest are guidance.",
    createCta: "Add obligation",
    cancel: "Cancel",
    required: "Give the obligation a title.",
    failed: "The obligation wasn't added — try again.",
  },

  // PRB.11 — the export dialog + the AI-use statement (§13.4, §8.4 REQ-VIS-10). Authorship-legibility
  // framing only (REQ-POS-13): what ran, what you decided, what you added — never anything about detection.
  export: {
    heading: "Export",
    lede: "Take the manuscript out as Markdown, plain text, Word, HTML, PDF, RTF, or LaTeX. Exports are never blocked — open obligations are listed, not enforced.",
    formatLegend: "Format",
    profileLegend: "Markdown flavour",
    profileCanonical: "Canonical (byte-faithful)",
    profileNote: "Applies to the .md export only.",
    citationLegend: "Citation style",
    citationNote: "Rendered from the project's bibliography.",
    provenanceLabel: "Include the provenance appendix",
    provenanceUnavailable: "No provenance map yet — the appendix unlocks once the draft has one.",
    obligationsNote: "Listed for your records — export always proceeds.",
    attachLabel: "Attach the AI-use statement",
    attachNote:
      "A generated disclosure of how Rhēma was used on this manuscript — the workflows, model tiers, dates, and your decisions, straight from the run record.",
    disclosureNote:
      "This venue asks for a formal disclosure — the export ships the AI-use statement (the venue template registers in a later release).",
    statementHeading: "AI-use statement",
    statementNote:
      "Recomputed from the run record every time. Add your own sentences below; the generated sentences stay.",
    additionLabel: "Add a sentence to the statement",
    additionPlaceholder: "e.g. I rewrote the conclusion myself.",
    additionCta: "Add sentence",
    standaloneHeading: "Statement on its own",
    standaloneMdLabel: ".md",
    standaloneDocxLabel: ".docx",
    exportCta: "Export",
    exportFailed: "The export did not complete — nothing was downloaded.",
  },

  // P1.18 — the whole-account zip (REQ-ACCT-3): "Export everything" → the worker builds the archive,
  // emails the 7-day link, and the fresh-account import replays it (a re-import is a no-op).
  accountExport: {
    heading: "Your data",
    lede: "Take your whole account out — every project, voice, draft, and figure — as one zip. The download link is emailed to you and lives for 7 days.",
    cta: "Export everything",
    building: "Building your export — the download link arrives by email when it's ready.",
    readyFmt: "Ready — download before it expires ({date}).",
    expired: "The last export's link expired — request a fresh one.",
    failedFmt: "The export failed: {error}",
    downloadCta: "Download now",
    importHeading: "Restore from an export",
    importNote:
      "Import a Rhema export zip into this account. Re-importing the same zip is a no-op — nothing duplicates.",
    importLabel: "Export zip",
    importCta: "Import",
    importDoneFmt: "Imported {projects} project(s), {voices} voice(s), {files} file(s).",
    importDeduped: "That archive was already imported — nothing new was added.",
    importFailed: "That file wasn't a Rhema export zip.",
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
    /** P1.20 — the §14.7 section nav (Team hidden until roles ship — not rendered). */
    sectionsAria: "Settings sections",
    sectionLabels: {
      account: "Account",
      preferences: "Preferences",
      notifications: "Notifications",
      integrations: "Integrations",
      billing: "Billing",
      data: "Data",
    } as Record<string, string>,
    privacyHeading: "Privacy",
    /** REQ-PROD-15 carried into Data — the §14.7 verbatim toggle (checked = excluded). */
    analyticsLabel: "Exclude my usage from product analytics",
    analyticsNote:
      "Usage events tell us which parts of Rhēma earn their keep. Turning this off stops new telemetry and removes your events from every report.",
    // P1.01 — the app-theme control (REQ-IDE-38): dark/light/auto, persisted per user; the IDE shell's
    // theme menu writes the same field.
    themeHeading: "Appearance",
    themeNote: "The shell theme. Paper pages keep their own per-project pin.",
    themeDark: "Dark",
    themeLight: "Light",
    themeAuto: "Auto (follow system)",
    saveCta: "Save",
    saved: "Saved.",
    // ---- P1.20 — Account ----
    accountHeading: "Account",
    profileHeading: "Profile",
    nameLabel: "Name",
    bylineLabel: "Byline",
    bylineNote: "The default voice byline — it prints under your name on exports.",
    avatarLabel: "Avatar URL",
    emailLabel: "Email",
    emailVerified: "Verified",
    emailUnverified: "Not verified",
    emailPendingFmt:
      "Change pending — we emailed a confirmation link to {email}. The account switches when you open it.",
    emailChangeLabel: "New email",
    emailChangeCta: "Send confirmation link",
    emailChangeNote: "A magic link confirms the new address; nothing changes until you open it.",
    signInHeading: "Sign-in methods",
    sessionsHeading: "Active sessions",
    sessionsNote:
      "Revoking kills the token server-side — the shared session contract the mobile app uses too.",
    sessionThisDevice: "This device",
    sessionRevokeCta: "Revoke",
    sessionExpiresFmt: "expires {at}",
    // ---- P1.20 — Preferences (§14.7; REQ-BILL-4's threshold, REQ-PROD-6's tier vocabulary) ----
    preferencesHeading: "Preferences",
    tierHeading: "Default model tier",
    tierAutoLabel: "Plan default",
    tierAutoNote: "Balanced on paid plans, Base on Free.",
    tierWhen: {
      base: "Base — the everyday read; cheapest per run.",
      balanced: "Balanced — the default on paid plans; the everyday cost-quality notch.",
      frontier: "Frontier — the deepest read, reserved for near-final work.",
    } as Record<string, string>,
    rigorHeading: "Default rigor",
    rigorNote:
      "Standard is the default; a project's own setting always wins over the account default.",
    rigorByWorkflowHeading: "Rigor per workflow",
    rigorByWorkflowNote: 'Leave a workflow on "Default" to use the rigor above.',
    rigorDefaultOpt: "Default",
    approvalHeading: "Approval policy default",
    approvalNote: "The policy new projects start on — the project can always pick its own.",
    approvalPolicies: {
      named: "Named approvals — the run asks at the gates you name.",
      wait_each: "Wait for me at each — every approval waits for you.",
      run_to_completion: "Run to completion — no stops mid-run; the letter lists what happened.",
    } as Record<string, string>,
    consentHeading: "Confirmation threshold",
    consentLabel: "Don't ask to confirm under (credits)",
    consentNote: "Runs under this many credits skip the cost-confirm click — 1,000 max.",
    editorHeading: "Editor",
    paperThemeLabel: "Paper theme",
    paperThemeLight: "Light",
    paperThemeDark: "Dark",
    paperThemeFollow: "Follow the app theme",
    fontPresetLabel: "Font",
    fontSerif: "Serif",
    fontSans: "Sans",
    fontMono: "Mono",
    fontSizeLabel: "Size step",
    fontSizeNote: "−2 to +2 steps on either side of the base size.",
    perProjectNote: "Per-project settings always win over these account defaults.",
    // ---- P1.20 — Notifications (§5.11 matrix; REQ-ACCT-1's two locked rows) ----
    notificationsHeading: "Notifications",
    matrixEmailCol: "Email",
    matrixInAppCol: "In app",
    matrixEventCol: "Event",
    lockedNote: "Always on — spend gates and trial/payment mail can't be turned off.",
    emailNoneNote: "—", // the row never mails (in-app only)
    digestHeading: "Digests",
    digestRunFinishedLabel: 'Batch "run finished" mail into an hourly digest',
    quietHeading: "Quiet hours",
    quietNote:
      "Run-finished and chat replies hold until the window ends (UTC). Approvals and spend gates always land.",
    quietEnable: "On",
    quietStartLabel: "From",
    quietEndLabel: "To",
    /** SPA.12 — the shared option labels the matrix selects + quiet-hours + `rp_*` rows carry
     *  (REQ-SAFE-10: the SPA's copy-containment rule needs every user-facing literal on a leaf —
     *  the SSR's bare "On"/"Off" option text now lives here too). */
    optOn: "On",
    optOff: "Off",
    optDigest: "Digest",
    optHourly: "Hourly",
    runProgressHeading: "Run progress — per project",
    runProgressNote: "In-app phase updates — off everywhere by default; opt in per project.",
    runProgressProjectFmt: "{title}",
    notificationEvents: {
      approval_waiting: "An approval is waiting on you",
      spend_gate: "Spend limit",
      gate_reminder: "Approval deadline reminders",
      auto_proceeded: "A deadline auto-proceeded",
      run_finished: "A run finished",
      run_failed: "A run failed",
      credits_threshold: "Credit thresholds (50 / 80 / 100 %)",
      trial_payment: "Trial ending / payment",
      run_cancelled_recovered: "A run was cancelled or recovered",
      voice_stale: "A voice went stale (weekly digest)",
      chat_reply: "The Assistant replied",
      run_progress: "Run progress (per project)",
      product_update: "Product updates",
    } as Record<string, string>,
    // ---- P1.20 — Integrations (REQ-ACCT-2 — one card component) ----
    integrationsHeading: "Integrations",
    integrationsNote:
      "Connections feed a voice's samples. Manage discovery on the voice's Samples tab; disconnect here removes the credential immediately — imported samples stay unless you remove them there.",
    integrationPersonaFmt: "feeds {name}",
    integrationItemsFmt: "{items} items discovered · {included} in the voice",
    integrationLastSyncFmt: "last synced {at}",
    integrationStatusLabels: {
      connected: "Connected",
      pending: "Connecting",
      degraded: "Needs attention",
      removed: "Disconnected",
    } as Record<string, string>,
    integrationDisconnectCta: "Disconnect",
    integrationConnectCta: "Connect on a voice's Samples tab",
    integrationProviders: {
      substack: {
        title: "Substack",
        reads: "Reads your public archive or an export zip — never your cookies.",
        never: "We never post to your Substack.",
      },
      medium: {
        title: "Medium",
        reads: "Reads your public stories or an export zip.",
        never: "We never post to your Medium.",
      },
      gdrive: {
        title: "Google Drive",
        reads: "Reads only the files you pick (drive.file scope) — export only.",
        never: "We never read Drive files you haven't shared with Rhema.",
      },
    } as Record<string, { title: string; reads: string; never: string }>,
    integrationsEmpty: "No connections yet — connect a source from a voice's Samples tab.",
    // ---- P1.20 — Data (Q-12 minimal; §13.3 deletion; Q-26 posture; REQ-VIS-11) ----
    dataHeading: "Data",
    supportAccessLabel: "Allow Rhema staff to view my projects for support (per request, 72 h)",
    supportAccessNote:
      "A grant expires after 72 hours. Every grant, access, and revocation lands in the log below.",
    supportAccessActiveFmt:
      "Active until {at} (UTC) — we can view your projects for support until then.",
    supportAccessLogHeading: "Support access log",
    supportAccessLogEmpty: "No support access on record.",
    supportAccessActions: {
      granted: "You granted access",
      revoked: "You revoked access",
      accessed: "Staff viewed your projects",
      expired: "A grant expired",
    } as Record<string, string>,
    postureHeading: "What happens to your words",
    /** §14.7 verbatim — the training posture + the residual-risk sentence (§12.8); no DPA/SOC 2 badge. */
    trainingPosture:
      "Rhema does not train models on your content. Model providers process it under their commercial API terms: Anthropic. During a review the Editor searches the web to check your claims; Rhema limits and monitors what those searches can carry, but a search query is text that leaves Rhema.",
    dpaLine: "Enterprise? Ask us about a DPA",
    preferenceHeading: "Preference learning",
    /** §11.7 verbatim (Q-26) — capture-only at MVP; the Editor never sees it. */
    preferenceCopy:
      "Rhema learns your working preferences from your decisions to help the Drafter and pre-fill defaults. The Editor never sees this — reviews never soften.",
    preferenceToggleLabel: "Let Rhema learn my working preferences",
    preferenceOffNote:
      "Off — no new preference signals are recorded. The profile is account-local, exports with your data, and dies with the account.",
    exportHeading: "Export",
    // ---- P1.20 — Delete account (REQ-ACCT-4; §13.3) ----
    deletionHeading: "Delete account",
    deletionLede:
      "Deleting starts a 14-day grace period — cancel any time before it ends. After that, Rhema hard-deletes your content and personal information; anonymized ledger rows and the Stripe customer record are retained as tax law requires — nothing else.",
    deletionConfirmLabel: "Type “delete” to confirm",
    deletionCta: "Delete account",
    deletionScheduledFmt:
      "Deletion scheduled — your account and its content are deleted on {date} unless you cancel.",
    deletionCancelCta: "Keep my account",
    deletionCancelledNote: "Deletion cancelled — welcome back.",
    // ---- P1.20 — project settings (/p/:project/settings; §4.2/§6.7, REQ-GENRE-2) ----
    projectSettings: {
      heading: "Project settings",
      protocolHeading: "Protocol & venue",
      venueLabel: "Venue",
      protocolLabel: "Protocol",
      rigorLabel: "Rigor default",
      rigorInherit: "Account default",
      tierLabel: "Model tier default",
      paperThemeLabel: "Paper theme",
      lengthLabel: "Length target",
      lengthNote: "Override the protocol's default length (its own unit — words, pages…).",
      stageLabel: "Stage",
      stages: { early: "Early draft", near_final: "Near final", infer: "Infer" } as Record<
        string,
        string
      >,
      stageNote: "Pick a stage or let the run infer it.",
      phaseDefaultsHeading: "Phase defaults",
      phaseDefaults: {
        verification: "Verification",
        discourse: "Discourse",
        secondRead: "Second read",
        grounding: "Grounding",
        audit: "Fidelity audit",
      } as Record<string, string>,
      phaseOptDefault: "Protocol default",
      phaseOptOn: "On",
      phaseOptOff: "Off",
      changedNote: "The protocol changed — the next Review's scope card carries the mark.",
      voiceHeading: "Voice",
      voiceNone: "No voice linked",
      tagsHeading: "Tags",
      tagsPlaceholder: "Tags aren't available yet — nothing to edit here.",
      approvalsHeading: "Approvals",
      guidanceHeading: "Standing guidance",
      saveCta: "Save settings",
      saved: "Saved.",
      /** UXC-12 — the degraded-twin note: this page's own outage copy, never billing's. */
      unavailable: "Project settings are temporarily unavailable — try again in a moment.",
    },
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
    // P1.16 — the §14.5 level-1 additions: plan/period, bucket bars, warnings, the CSV export.
    planLabel: "Plan",
    trialFmt: "Trial — {n} days left",
    periodFmt: "Period {start} → {end}",
    monthToDateFmt: "{n} cr this period",
    includedFmt: "{remaining} of {monthly} included credits left",
    bucketsHeading: "Balance",
    bucketLabels: {
      included: "Plan credits",
      topup: "Top-ups",
      trial_pocket: "Trial pocket",
      daily: "Daily",
      promo: "Promo",
    } as Record<string, string>,
    expiresFmt: "expires {at}",
    warningsHeading: "Heads up",
    nextExpiryFmt: "{n} {bucket} credits expire {at}",
    csvCta: "Download CSV",
    projectUsageCta: "Project usage",
    // SPA.10 — the recent-runs table's column heads (SSR's literals, COPY-fied for the SPA's
    // copy-containment rule — REQ-SAFE-10).
    columns: { run: "Run", workflow: "Workflow", state: "State", spent: "Spent" } as const,
  },
  // P1.16 — the /settings/billing plan card + /billing/return poll (§14.2/14.3/14.6; REQ-BILL-14/17).
  billing: {
    nav: "Billing",
    heading: "Billing",
    planHeading: "Plan",
    // HOT.1 — `trialActiveFmt` ("your review run is Included") was dead claim copy; the trial_active
    // line falls back to this factual window note while `trial.firstReviewIncluded` is hidden.
    trialWindowFmt: "Trial window — {days} days.",
    trialDeniedNote: "The trial wasn't available for this signup. Plans start below.",
    trialUsedNote: "Trial used. Plans start below.",
    freeNote: "Free — chat only, daily credits.",
    pastDueBanner:
      "Your last renewal payment didn't go through — we'll keep retrying for a few days. Runs continue on your remaining balance.",
    cancelScheduledFmt: "Cancels {at} — access runs to the paid-through date.",
    scheduledDowngradeFmt: "Switching to {tier} on {at}.",
    periodEndFmt: "Renews {at}",
    subscribeCta: "Choose {tier}",
    monthlyLabel: "Monthly",
    annualLabel: "Annual −15%",
    // SPA.16 — axe `select-name`: the subscribe select's accessible name (both renderers carry it).
    cycleLabel: "Billing cycle",
    // PR-U6 — the ladder's annual price reads "$X/mo billed annually" (never the "$/mo Annual" concat).
    annualBillingLabel: "billed annually",
    manageCta: "Manage billing",
    manageNote: "Payment methods, invoices and receipts live in the Stripe portal.",
    cancelCta: "Cancel plan",
    cancelNote: "Cancellation lands at the end of the paid period — nothing stops mid-cycle.",
    topupHeading: "Top up",
    topupCta: "Buy {n} credits — ${usd}",
    autoReloadHeading: "Auto-reload",
    autoReloadNote:
      "The only charge that can happen without a click. When your spendable balance falls below the threshold, we buy the pack — never more than your monthly cap.",
    autoReloadEnable: "On",
    autoReloadThresholdLabel: "When the balance falls below",
    autoReloadPackLabel: "Buy the pack",
    autoReloadCapLabel: "Up to per month ($)",
    autoReloadSave: "Save auto-reload",
    teamHeading: "Team",
    teamNote:
      "Shared workspaces, pooled credits and roles are coming. Leave an email and we'll write when seats open.",
    teamEmailLabel: "Work email",
    teamSeatsLabel: "Seats",
    teamCta: "Join the waitlist",
    teamJoined: "You're on the list.",
    saved: "Saved.",
    // BILL.3 — the per-class failure copy (REQ-BILL-16): each refusal names its own cause, and the
    // generic line only remains for the genuinely-transient case (Stripe itself unreachable).
    stripeDownNote: "Billing is temporarily unavailable — try again in a moment.",
    stripeUnconfiguredNote:
      "Checkout isn't configured on this deployment yet — nothing was charged.",
    purchasePausedNote:
      "Purchases are paused while we finish rolling them out — your balance and work are safe.",
    topupRequiresPlanNote: "Top-ups need a paid plan — choose Writer or above first.",
    firstMonthCapNote:
      "New accounts can add up to $100 of credits in their first month — the cap lifts after.",
    planWaitlistedNote: "That plan isn't open yet — join its waitlist on the card above.",
    noStripeCustomerNote: "There's no card on file yet — choose a plan or buy a top-up first.",
    stripeRejectedNote:
      "Stripe refused that checkout — nothing was charged. The detail is logged; try again in a moment.",
    changeFailedNote: "The plan change didn't apply — try again.",
    cancelFailedNote: "Cancellation didn't apply — try again.",
    autoReloadFailedNote: "The auto-reload settings didn't save — check the values and try again.",
    waitlistFailedNote: "That didn't join the waitlist — check the email and try again.",
    includedBadge: "Included",
    returnHeading: "Checkout",
    returnDone: "Payment confirmed — your credits are in.",
    returnPending:
      "Confirming your payment with Stripe — this page refreshes. If it takes more than a moment, we'll email you when it lands.",
    returnExpired: "That checkout expired — nothing was charged. Start again from Billing.",
    returnCancelled:
      "Checkout cancelled — nothing was charged. Start again from Billing whenever you're ready.",
    returnContinue: "Continue",
    returnBack: "Back to Billing",
    upgradePromptFmt: "{tier} adds {credits} credits a month and unlocks {tiers}.",
    trialEndFmt: "Your trial ends in {n} days. Your projects stay.",
    waitlistBadge: "Waitlist",
  },
  projectUsage: {
    heading: "Usage",
    backToProject: "Back to the project",
    totalFmt: "{n} cr across {runs} runs",
    runEmpty: "No runs yet.",
    runReportCta: "Run report",
    // SPA.10 — the project runs table's column heads (the same copy-containment port; the blank
    // actions column stays header-less).
    columns: { run: "Run", workflow: "Workflow", state: "State", spent: "Spent" } as const,
  },

  // P1.12 — the unlocked outline editor + the promotion sheet (§7.3). The structured rows' copy lives
  // in `gates.outline` — one table feeds the gate card AND this page.
  outlinePage: {
    heading: "Outline",
    backToProject: "Back to the project",
    saveLabel: "Save",
    savedNote: "Saved — a new version.",
    savingNote: "Saving…",
    saveFailedNote: "Save failed — try again.",
    deleteLabel: "Delete outline",
    citedNote: "A draft cites this outline — it can't be deleted.",
    notFound: "This project has no outline yet.",
    draftEstimateFmt: "Draft ≈{n} credits",
  },
  promote: {
    heading: "Promote to an outline",
    backToProject: "Back to the project",
    promoteLabel: "Promote",
    scopeLabel: {
      thread: "this thread",
      turn: "this turn",
      research: "all Assistant research",
    } as Record<string, string>,
    sourcesFmt: "{n} source notes will copy to your research folder.",
    urlsFmt: "{n} URLs will be re-fetched — a failed fetch lands [unverified].",
    estimateFmt: "Estimate {estimate} credits · cap {cap}",
    existingNote: "An outline already exists at this name — the promote lands as a new version.",
    slugLabel: "Outline name",
    slugHint: "lowercase letters, digits, dashes",
    startedFmt: "The outline run started — its approval lands in Needs you.",
    notFound: "That thread or turn wasn't found.",
  },

  // P1.13 — the Figures pane, the figure card, and the /visualize sheet (§7.5). The
  // `[unverified data]` badge text comes from the api verbatim (FIGURE_BADGE_TEXT) — never retyped.
  figuresPage: {
    heading: "Figures",
    backToProject: "Back to the project",
    empty: "No figures yet — /visualize in Chat, or Visualize on a selection, starts one.",
    newLabel: "New figure",
    insertedChip: "inserted",
    proposalChip: "proposal open",
    renderingChip: "rendering…",
    versionFmt: "v{n}",
  },
  figureCard: {
    backToFigures: "Back to figures",
    untitled: "Untitled figure",
    captionLabel: "Caption",
    altLabel: "Alt text",
    sourceLabel: "Source line",
    provenanceHeading: "Where the numbers came from",
    dataHeading: "Data",
    specHeading: "Spec",
    versionsHeading: "Versions",
    chipsHeading: "Chart type",
    chipsNote: "Type chips are local spec edits — 0 credits, no model call.",
    insertHeading: "Insert into the draft",
    insertNote:
      "Insert is a proposal — Accept writes the figure block; a frozen draft forks v(N+1).",
    anchorLabel: "Insert after block (optional — e.g. b7; empty = end of the draft)",
    proposeLabel: "Insert…",
    acceptLabel: "Accept",
    rejectLabel: "Reject",
    restoreLabel: "Restore",
    notReadyFmt: "Insert needs {missing} first.",
    missingAlt: "alt text",
    missingSource: "a source line",
    pendingNote: "A proposal is open — Accept writes the block, Reject keeps the figure.",
    insertedNote: "Inserted into the draft.",
    // the "Edit figure" affordance an inserted figure block renders on the Page (§7.5's fourth
    // entry point) — opens this card at the current version.
    editFigureLabel: "Edit figure",
    // R7DEM.4b (S-7) — the imported-image card's provenance chip + its kind chip.
    importedChip: "Imported image",
    imageKindChip: "image",
    declinedFmt: "This figure type isn't supported — {suggestion}",
    requestLabel: "request",
    emptyField: "—",
  },
  visualize: {
    heading: "Visualize",
    backToProject: "Back to the project",
    requestLabel: "What should the figure show?",
    requestHint:
      "Describe the figure. @claim:<id>, @asset:<id>, or a URL binds the numbers to a source; numbers with no source are refused.",
    kindLabel: "Figure kind",
    kindAuto: "let the run decide",
    insistLabel:
      "Create it anyway with unsourced numbers — carries a persistent [unverified data] badge",
    iterateLabel: "Iterating figure",
    estimateFmt: "Estimate {estimate} credits · cap {cap}",
    chipNote: "Type-chip edits on the card are 0 credits.",
    startLabel: "Visualize",
    startedFmt: "The figure run started — the card lands in Figures.",
    notFound: "That figure wasn't found.",
    requestRequired: "Describe the figure first.",
  },

  // P1.01 — the §5.1 IDE shell's chrome: rail, Files pane, Margin, Timeline, Desk, status bar, the View
  // menu, and the theme/paper controls. Canonical nouns only (Appendix D.2): "Files", never "Browser";
  // the view values are Write / Read / Focus; "Source" is not a View-menu entry.
  ide: {
    // R7SHELL.2 — `rail` survives only for the SSR phone bar (`!hosted`); the `files` bag is
    // gone with the Files pane (the tree's labels live in `COPY.files`).
    rail: {
      home: "Home",
      inbox: "Inbox",
      settings: "Settings",
      project: "Project navigation",
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
    panel: {
      heading: "Panel",
      resize: "Resize the panel",
      tabs: {
        chat: "Chat",
        findings: "Findings",
        claims: "Claims",
        timeline: "Timeline",
        feed: "Live feed",
      },
      emptyChat: "No chat yet — ask the Assistant anything about this project.",
      emptyFeed: "No run activity yet.",
      emptyFindings: "No findings yet.",
      emptyClaims: "No claims yet.",
      findingsTable: {
        finding: "Finding",
        severity: "Severity",
        kind: "Kind",
        status: "Status",
      },
      close: "Close panel",
    },
    // P1.11 — the Desk Chat panel's chrome (§7.1). The assistant's copy lives in the project; the
    // shell's labels only.
    chatDesk: {
      threadsHeading: "Threads",
      newThread: "New thread",
      transcriptEmpty: "Nothing here yet — ask a question, or start with a chip above.",
      pinsHeading: "Pinned",
      pinAddPlaceholder: "Pin a fact or reference…",
      pinAdd: "Pin",
      pinRemove: "Remove pin",
      pinsFootprintFmt: "{m} pins · footprint {n}",
      remembersHeading: "What the assistant remembers",
      correctionPlaceholder: "Correct something the assistant remembers…",
      correctionSend: "Save correction",
      sourcesHeading: "Chat sources",
      sourcesEmpty: "No sources yet — they land here from research and attachments.",
      unverified: "unverified",
      composerPlaceholder: "Ask about this project…",
      send: "Send",
      tierLabel: "Model tier",
      tiers: { base: "Base", balanced: "Balanced", frontier: "Frontier" },
      strip: {
        creditsFmt: "{n}/{m} credits",
        searchesFmt: "{n}/{m} searches",
        fetchesFmt: "{n}/{m} fetches",
        workspaceFmt: "workspace {n} credits",
      },
      planCard: {
        heading: "Plan",
        run: "Run the research",
        firstStep: "Just the first step",
        edit: "Edit the plan",
        cancel: "Cancel",
      },
      askAbout: {
        heading: "Ask about this draft",
        anchorLabel: "Anchored to",
        placeholder: "Suggest a change — one paragraph at most.",
        send: "Suggest",
        tooLarge: "More than a paragraph? Run /lineedit @section or /revise instead.",
      },
      liveRunNote: "A run is live — the assistant sees committed artifacts only.",
      chipGroupLabel: "Start here",
      notesPlaceholder: "Paste your notes…",
      notesSend: "Save notes",
      // R7TALK.1a (REQ-TALK-2; RV-21) — the thread/composer vocabulary. The footnote names the
      // CHARGE (cap-clamped debits); burn above the cap is labelled truthfully, never hidden.
      threadHeading: "Conversation",
      memoryPinsHeading: "Memory & pins",
      retry: "Retry",
      abort: "Stop",
      sending: "Sending…",
      youLabel: "You",
      assistantLabel: "Assistant",
      debitedFmt: "{n} credits",
      // The above-cap label — the ticket's owned copy key. Burn is burn: it says so, and it is
      // never presented as the charge.
      aboveCapFmt: "metered {n} credits above the cap — charged {m} (cap-clamped)",
      progressWorking: "Working…",
      demoReadonly: "The demo is read-only — sign up to chat about your own project.",
      sourcesUsed: "Sources",
    },
    statusBar: {
      view: "View",
      theme: "Theme",
      paper: "Paper",
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
      // R7PANE.1 (REQ-PANE-1/2) — the right panel's on-demand row: below 1280 it is closed by
      // default and rides the session-scoped overlay intent.
      panel: "Right panel",
    },
    // R7FIX.1 (REQ-WRITE-4) — the focus-view exit pill (hover/keyboard revealed; Esc also exits).
    focusExit: "Exit focus · Esc",
    themes: {
      dark: "Dark",
      light: "Light",
      auto: "Auto (system)",
      paperLight: "Pinned light",
      paperFollow: "Follow app theme",
      paperDark: "Pinned dark",
    },
    // P1.06 (§5.12) — the ⌘K palette's + the `?` cheat sheet's chrome.
    palette: {
      dialogLabel: "Command palette",
      placeholder: "Type / for a command, or search…",
      emptyLabel: "Nothing matches.",
      sectionLabels: {
        run: "Run",
        goto: "Go to",
        recent: "Recent runs",
        threads: "Threads",
        settings: "Settings",
      },
      nextStep: "next step",
    },
    cheatsheet: {
      heading: "Keyboard",
      closeLabel: "Close",
    },
    // REQ-UX-16 (design/24 §chrome polish) — the skip link the SPA chrome mounts before the rail.
    skipToPage: "Skip to Page",
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

  // ---- P1.05 — the Timeline pane's round log, steering, feed rows, and the run report (§5.5/§6.5/§14.5) ----
  timeline: {
    /** the next-step card's verbs (§6.3's suggested action → the card's line; {n} = the head draft). */
    nextStep: {
      draft: "Draft v{n}",
      review: "Review v{n}",
      revise: "Revise",
      read_letter: "Read the letter",
      outline: "Make an outline",
      export: "Export",
      archive: "Archive",
      run: "The run in progress",
      approval: "A decision is waiting",
      start: "Start a project",
      none: "",
    } as Record<string, string>,
    estimateFmt: "est. {n} cr",
    versionFmt: "v{n}",
    /** the collapsed round summary's workflow names ("v1 → review (49) → revise → v2"). */
    workflowLabel: {
      review: "review",
      fact_check: "fact-check",
      revise: "revise",
      draft: "draft",
      outline: "outline",
    } as Record<string, string>,
    countFmt: "({n})",
    arrow: "→",
    originChip: { outline: "Outline", imported_draft: "Imported draft" },
    /** the three verbs in the pane header (§5.5; canonical vocabulary verbatim). */
    verbs: { draft: "Draft", review: "Review", revise: "Revise" } as Record<string, string>,
  },
  steer: {
    pause: "Pause after this phase",
    stop: "Stop — keep partials",
    cancel: "Cancel",
    resume: "Resume",
    note: "Note for the next phase",
    notePlaceholder: "A note for the next phase…",
    report: "Run report",
    openDeliverable: "Open the delivered review",
    liveFeed: "Live feed",
    queueFmt: "{n} in line — starts when the run ahead finishes",
    estimateLineFmt: "{actual} cr spent · est. {est}",
    pausedFmt: "Paused after phase {done} of {total}",
    partialFmt: "partial ({done}/{total} phases) — committed work kept",
    waitingGateFmt: "Waiting on you — {kind}",
    queuedNotesFmt: "{n} note(s) queued for the next phase",
    // R7COPY.0 (REQ-COPY-4; ADR-130) — the record-composed "What it delivered" (the generated
    // walkthrough's heading survives verbatim; nothing pending/failed can ever render again).
    deliveredHeading: "What it delivered",
    deliveredCountsFmt: "{findings} findings{strengths} · {claims} claims",
    deliveredStrengthsFmt: " · {n} strength{s}",
    deliveredLinkLabel: {
      dossier: "Dossier",
      letter: "Letter",
      ledger: "Claims ledger",
    } as Record<string, string>,
    deliverableLabel: {
      letter: "Letter",
      response: "Response",
      findings: "{n} findings",
      strengths: "{n} strength{s}",
      claims: "{n} claims",
      second_read: "Second read",
      rubric: "Rubric",
      draft: "Draft",
      outline: "Outline",
      bibliography: "Bibliography",
      citations_manifest: "Citations",
      usage_report: "Usage report",
      changelog: "Changelog",
      moved_map: "Moved map",
    } as Record<string, string>,
  },
  feed: {
    /** per-event row templates — {field} interpolates a whitelisted §12.5 payload value (never prose). */
    templates: {
      "run.state_changed": "Run {to}",
      "run.started": "Run started",
      "run.resumed": "Run resumed",
      "run.hiccup": "Recovered — {reason}",
      "step.started": "{phase} started",
      "step.finished": "{phase} finished — {credits} cr",
      "phase.skipped": "{phase} skipped",
      "gate.opened": "Waiting — {kind}",
      "gate.resolved": "Decision — {action}",
      "gate.expired": "{kind} expired — {action}",
      "gate.reminder": "Reminder — {kind}",
      "search.performed": "Search — {query}",
      "source.read": "Read — {url}",
      "source.denied": "Blocked — {urlDomain}",
      "claim.checked": "Claim {claimOrdinal} — {verdict}",
      "claim.progress": "Claims {checked} of {of} checked",
      "finding.emitted": "Finding {findingOrdinal} — {severity}",
      "section.drafted": "Section {sectionRef} — {words} words",
      "artifact.written": "Wrote {kind}",
      "subagent.started": "Started — {label}",
      "subagent.finished": "Finished — {label}",
      "agent.note": "{text}",
      "boundary.denied": "Denied — {tool}",
      "boundary.attested": "Boundary attested — {paths_touched_count} paths",
      "usage.tick": "{spentCredits} of {capCredits} cr",
      // RPT.1 — a mid-phase proxy-metered reading is labelled provisional in the feed too (the ≈ marker;
      // REQ-SPEC-32(a)). Pseudo-key: renderers pick it when the tick's payload carries provisional:true.
      "usage.tick.provisional": "≈ {spentCredits} of {capCredits} cr",
      "cost.final": "Final — {spentCredits} cr",
      "cost.refunded": "Refunded {credits} cr",
      // RES.2 — the run-level delivery label event; "Unverified" is the reserved D.2 word here.
      "run.unverified": "Unverified — {coveredClaims} of {checkableClaims} claims covered",
      // P1.16 §14.6 — the rate table moved while the run was parked; the cap delta waits on consent.
      "run.repriced": "Re-priced — new cap {newCapCredits} cr",
      "check.result": "Check {name} — {passed}",
      "context.compacted": "Context compacted",
      "run.report": "Run report ready",
      "chat.turn.completed": "Reply posted",
      "chat.plan_card": "Plan — {capCredits} cr · {searches} searches · {fetches} fetches",
      "chat.over_cap": "Over cap — {axis} {used} of {budget}",
      "chat.source_saved": "Source saved — {notePath}",
      "guidance.captured": "Note captured",
      "guidance.delivered": "Note delivered — {phase}",
      "steer.paused": "Paused after the phase",
      "steer.queued": "Note queued",
      "figure.rendered": "Figure rendered",
      "figure.proposed": "Figure proposed",
      "figure.accepted": "Figure accepted",
      "draft.forked": "Draft v{n} forked",
      "revision.move_traced": "{hunkCount} changes traced",
      "rereview.lineage": "{carried} carried · {closed} closed · {new} new",
      "outline.approved": "Outline approved — {slug}",
      // RPT.1 — the run card's credit meter (pseudo-keys, NOT event types): the SSR label and the SSE
      // patch both render the meter from these, so a provisional mid-phase reading carries the ≈ marker
      // everywhere (REQ-SPEC-32(a): provisional vs committed is labelled, never ambiguous).
      "card.meter": "{spentCredits} / {capCredits} cr",
      "card.meterProvisional": "≈ {spentCredits} / {capCredits} cr",
    } as Record<string, string>,
    // enum maps the templates resolve through — {kind}, {verdict}, {to}, {passed}, {severity}.
    gateKind: {
      approve_triage: "Approve triage",
      scope_confirm: "Scope check",
      spend_cap: "Spend cap",
      publish_ready: "Ready to publish",
    } as Record<string, string>,
    artifactKind: {
      letter: "letter",
      response: "response",
      rubric: "rubric",
      findings: "findings",
      claims: "claim ledger",
      draft: "draft",
      outline: "outline",
      bibliography: "bibliography",
      citations_manifest: "citations",
      usage_report: "usage report",
      changelog: "changelog",
      moved_map: "moved map",
      private: "private working notes",
    } as Record<string, string>,
    findingKind: {
      factual: "factual",
      statistical: "statistical",
      quotation: "quotation",
      interpretive: "interpretive",
      normative: "normative",
      predictive: "predictive",
    } as Record<string, string>,
    passed: { true: "passed", false: "failed" } as Record<string, string>,
  },
  report: {
    heading: "Run report",
    estimateFmt: "{spent} cr spent · est. {est}",
    estimateRatioFmt: "{ratio}× estimate",
    noEstimate: "{spent} cr spent",
    refundFmt: "{n} cr returned",
    durationFmt: "{n} min",
    // RPT.1 — the metered-vs-charged reconciliation (§14.4/§14.5; REQ-SPEC-32): the metered figure is
    // stated beside the charged figure, and every difference carries its reason — never an unexplained
    // gap, never an implied charge that did not happen.
    meteredFmt: "{metered} cr metered · {charged} cr charged",
    differenceFmt: {
      cap: "The run metered past your cap — you were not charged for {n} cr of overrun.",
      absorbed: "{n} cr of metered usage was absorbed by the platform — not charged to you.",
      refund: "{n} cr returned — {reason}",
      refundNoReason: "{n} cr returned.",
      entitlement: "{n} cr metered — covered by your included review, no charge.",
      committed: "Charged on the committed phase figures — {n} cr differs from the meter.",
      cross_check:
        "The agent's own estimate read {n} cr — the proxy meter is the figure of record.",
    } as Record<string, string>,
    // RPT.1 — refund ledger reasons → readable words (a machine code never renders raw).
    refundReasonLabel: {
      metered_over_debit: "the committed figure ran ahead of the meter",
      reconcile_drift: "a reconciliation correction",
      platform_fault: "a platform fault",
      operator: "an operator adjustment",
      user_window: "requested within your refund window",
    } as Record<string, string>,
    workedExample:
      "Worked example — the seeded Showcase run; these are illustrative figures, not your usage.",
    phaseHeading: "Phases",
    phaseDetailFmt: "{credits} cr",
    phaseDetailDurationFmt: "{credits} cr · {n} min",
    // RPT.1 — a real sub-minute phase is honest about its seconds (never "0 min"); a legacy row whose
    // started_at = ended_at has no truth to tell and renders the dash the AC words (no backfill).
    phaseDetailDurationSecFmt: "{credits} cr · {n} sec",
    phaseDetailDurationUnknownFmt: "{credits} cr · —",
    seatsHeading: "Seats",
    seatLabel: {
      // Appendix D.2 seat display names (vocab.ts: 'author' displays as Drafter, 'system' as Rhema).
      editor: "Editor",
      author: "Drafter",
      persona_builder: "Voice builder",
      assistant: "Assistant",
      system: "Rhema",
    } as Record<string, string>,
    seatSplitFmt: "{seat} — {credits} cr ({pct}%)",
    flagsHeading: "Flags",
    // RPT.1 — each flag's sentence interpolates ONLY the figures the server computed on it
    // ({pct}/{phase}/{n}/{ratio}); nothing is computed in the UI or asserted by the agent.
    flagLabel: {
      fact_check_dominated: "Fact-checking carried {pct}% of the spend ({n} claims verified).",
      fact_check_dominated_noClaims: "Fact-checking carried {pct}% of the spend.",
      long_draft: "Drafting carried {pct}% of the spend — a long or heavy piece.",
      discourse_map: "The discourse map ran in {phase} (a Standard-tier phase).",
      second_read_model: "The second read in {phase} ran on a different model tier.",
      over_estimate: "The run came in at {ratio}× its estimate — well under.",
      under_estimate: "The run ran {ratio}× its estimate — over.",
      retries: "{n} step(s) needed a retry ({phase}).",
    } as Record<string, string>,
    claimsFmt: "{checked} claims checked · {verified} verified · {per} cr per verified claim",
    claimsNoVerifyFmt: "{checked} claims checked · {verified} verified",
    driversHeading: "What drove it",
    driverPhaseShareFmt: "{phase} — {pct}% of spend",
    driverWithinEstimate: "The run stayed inside its estimate.",
    guidanceHeading: "For the next round",
    guidanceLabel: {
      "guidance.fact_check_dominated": "Consider narrowing the claims scope before the next run.",
      "guidance.long_draft": "Consider a shorter draft or a staged review.",
      "guidance.discourse_map": "No action needed — the field map already ran.",
      "guidance.second_read_model": "Check whether the second read needs the heavier tier.",
      "guidance.over_estimate": "A lighter estimate would fit this workflow.",
      "guidance.under_estimate": "Raise the estimate or narrow the run's scope.",
      "guidance.retries": "Retries added cost — check the flagged phase's inputs.",
    } as Record<string, string>,
    advancedHeading: "Advanced — per-request detail",
    advancedColumns: {
      phase: "Phase",
      seat: "Seat",
      subagent: "Subagent",
      model: "Model",
      modelTier: "Tier",
      credits: "Credits",
      searches: "Searches",
      fetches: "Fetches",
      inputTokens: "Input tokens",
      outputTokens: "Output tokens",
      cacheTokens: "Cache tokens",
      providerIds: "Provider request ids",
    },
    notAvailable: "Per-request detail isn't available for this run.",
    loadAdvanced: "Load per-request detail",
    emptyRun: "This run hasn't produced a report yet.",
    // REQ-BILL-19 (P1.16) — the report links its frozen rate-table version to the published tables.
    rateTableFmt: "Priced under rate table v{v}.",
    rateTableLink: "See the published rates",
    // DEF.4 — the §14.4 refund-window affordance (REQ-SPEC-29): rendered only while the api's
    // `refundWindow` block is present on the report; a plain form POST, never client JS.
    refundCtaFmt: "Get {n} cr back",
    refundNote: "Refundable within 7 days of delivery — the credits return to your balance.",
    refundedFmt: "Refunded {n} cr.",
    refundReviewFmt: "Refund request for {n} cr sent for review.",
    refundDenied: "The refund request was declined.",
  },

  // ---- P1.17 (§15.1–§15.4) — the public funnel: landing (twelve sections, the v0.3 order), the
  //      /pricing page, and /signup. `lintGrowthCopy` runs over these keys too — a generation promise
  //      in a hero/proof zone, detection-evasion language, a placeholder logo, an unbuilt-asset claim,
  //      or a comparative claim without the wave flag fails the copy test (REQ-POS-4/5/11/12/13,
  //      REQ-GROWTH-5 amended, REQ-EVAL-19). ----
  demo: {
    hubTitle: "The demo",
    hubLede: "A read-only walk through a real essay's editorial record — its drafts, the dossiers each review delivered, and what changed between rounds.",
    readOnlyTitle: "Read-only demo",
    readOnlyBody: "This is a read-only demo of a real essay's editorial record. Start your own project to use these tools.",
    // 220a (REQ-DWEB-11/14; S-3/S-14) — the demo surface banner + its exits (document
    // navigations, never client navs — every exit rebuilds a real boot).
    bannerText: "A read-only demo of a real essay's editorial record.",
    exitSignUp: "Create your account",
    exitSignIn: "Sign in",
    exitBackToProjects: "Back to your projects",
    // 221 R7DEM.5 (REQ-DWEB-7/15, REQ-TOUR-6/7; S-9/S-10) — the write backstop's notice (the
    // capture-phase submit listener's answer) and the replayed-record labels.
    submitReadonlyNotice: "This is a read-only demo — that control is disabled here.",
    replayedBadge: "Replayed from the agent-discourse record",
    phaseInferredLabel: "inferred from the delivered files",
    approvalsNotRecorded: "approvals not recorded",
    notPublishedLabel: "not published",
    importRuleNote: "assigned by import rule",
    decisionsHeading: "Decisions",
    // 221a R7DEM.5b (REQ-TOUR-1/3/8; S-10/S-11) — the hub's chrome copy. Essay facts, counts and
    // titles arrive as snapshot DATA (218a's `demoCardFacts`); the {n}-slots below interpolate
    // those structured numbers at render, never recomputing them (P4-6).
    hub: {
      heroTourCta: "Take the guided tour",
      openInRhema: "Open in Rhēma",
      readOnSubstack: "Read on Substack ↗",
      lookAtHeading: "What to look at",
      byline: "S. J. Sebastian",
      countsFmt: "{major} major · {minor} minor · {strengths} strengths · {claimsChecked} claims checked",
      wordsFmt: "{n} words",
      retitleFmt: "Retitled from “{from}” ({atLabel})",
      arcReview: "Review of v{n}",
      arcPublished: "Published",
      // provenanceLead + agentDiscourseLink + provenanceMid render as
      // "{lead}<a>agent-discourse</a>{mid}" — the repo link IS the named mention (S-11).
      provenanceLead: "These essays were drafted and reviewed with ",
      provenanceMid:
        " — open-source editorial protocols that Rhēma's own protocols port.",
      provenanceRoles:
        "The record's roles: the writer, the editor (agent), the revising agent and the drafting agent. Edits the writer made outside a review are marked writer-directed.",
      agentDiscourseLink: "agent-discourse",
    },
    cards: {
      // REQ-TOUR-3 — the "What to look at" bullets (R1 §5; POV's set from R1 §4's beat sheet).
      // Each bullet pairs positionally with the LOOK_AT table's {route, hook} deep link; counts
      // interpolate from the same card facts.
      lookAt: {
        "the-governable-mind": [
          "Two complete review → response rounds — the deepest record on the hub.",
          "The second round's claim ledger carries Contradicted marks the first did not: the revision introduced new errors and the next review caught them.",
          "The v2 response re-checks the review's own claims — the record shows the revising agent disputing several by primary source.",
          "One Decision stays open — the disclosure point the revising agent escalated to the writer (F61).",
          "Length is unresolved: the response offers the writer costed options, including splitting the essay.",
        ],
        "the-politics-of-visibility": [
          "The editor's one thing: put the essay into its conversation by name.",
          "The second reader's sharpest objection — a falsification clause that reads as self-immunizing — became a major finding.",
          "{claimsChecked} claims checked across the record; the letter's verdict records how clean the fact-check came back.",
          "The response ledger shows the revising agent's answers verbatim — accepts, adapts, rebuts and escalations.",
        ],
        "constitution-of-reason": [
          "Two Decisions the writer had to answer: which reader owns the piece (E1), and whether first-person texture is honest under this byline (E3).",
          "The editor's one thing: confront the deflationary compute objection by name.",
          "The craft notes name the style risk — the machine-cadence discount.",
          "An older dossier shape: the record starts at v2 and keeps extra argument and craft files.",
        ],
      },
    },
    // 222 R7DEM.6a (REQ-TOUR-2/5; S-9/S-10) — the guided tour's coach-mark copy. ≤ 2 sentences
    // per step; quoted fragments are verbatim from the committed corpus at the file:line pins
    // recorded in the step table (demo-tour-steps.test.ts asserts every “…” span verbatim).
    // Honesty: "replayed, not recorded" — the record was produced with agent-discourse; roles
    // stay the writer / the editor (agent) / the revising agent / the drafting agent.
    tour: {
      heading: "Guided tour",
      counterFmt: "{n} of {total}",
      next: "Next",
      back: "Back",
      exit: "Exit tour",
      replayedNote:
        "This record is replayed, not recorded — the essay, dossiers and revisions are the committed agent-discourse record, read-only here.",
      steps: {
        published:
          "This is The Structure of Political Difference as published — the end of the record this tour walks back through.",
        v1: "The draft the writer submitted was titled “Politics Has Five Questions”. Everything after this page is what the record did to it.",
        verdict:
          "The editor's verdict was Major revisions: “the fact-check came back cleaner than any draft of this ambition I have seen (zero contradicted claims; your own statistical exercise reproduces from the raw data)”.",
        oneThing:
          "The letter names one thing above the rest: “Claim the ground the piece actually occupies” — the grammar, not the five axes.",
        twoReaders:
          "Two independent readers reached the same first finding — the letter's Major issue 1 and the second read's Objection 1 both ask why five. The record marks this finding's origin as both.",
        claims:
          "The claim ledger checked “24 of 24 (27 ledger entries)” and marked C23a — “Trump is a populist natcon: market-leaning” — Misleading in context, escalated to Tier 1, with its source.",
        claimsAside: "What a contradicted claim looks like → The Governable Mind, III16",
        figure:
          "Figure 2's CHES correlations reproduce from the dataset — the v2 figure is regenerated from the declared composites the review asked for.",
        responses:
          "The revising agent answered every finding in this ledger — F1 “adapt”, F31 “escalate→resolved”, F42 “defer (flagged)”, F23 “constraint” → “honored” — and the writer approved the round.",
        responsesAside: "Then the response letter →",
        whatChanged:
          "Move M2 shows the new section “Why Five, and Not Fifty” discharging finding F1 — the unargued central number gets its genealogy.",
        writerEdit:
          "After the round the writer edited directly — v3 and v4 are writer-directed edits, not reviewed — then published.",
        cta: "That is the whole record — replayed, not staged.",
      },
      ctaSignUp: "Bring your draft",
      ctaNewProject: "New project",
      stepCountNoteFmt: "Step {n} of {total} — ←/→ moves, Esc exits",
    },
  },
  landing: {
    nav: {
      pricing: "Pricing",
      faq: "FAQ",
      signIn: "Sign in",
    },
    hero: {
      // REQ-POS-4 — the locked §15.1 headline (the lint pins it verbatim).
      headline: "An editorial board for everything you write.",
      lede:
        "Rhēma reads a finished draft the way a demanding editor would — checks every load-bearing " +
        "claim against real sources, maps the argument, and hands back a dossier you can act on.",
      // §14.3 — the trial note. HOT.1: the honest default; the "first review is included" variant is
      // gated claim text in contracts' PUBLIC_CLAIM_COPY (trial.firstReviewIncluded), never here.
      trialNote: "No card required.",
      ctaPrimary: "Start with a draft",
      ctaScratch: "Start from scratch",
      ctaOutline: "Upload an outline",
      // 222 R7DEM.6a (REQ-TOUR-4) — the hero's secondary CTA into the demo (a document
      // navigation, S-14).
      demoCta: "See it on four real essays →",
    },
    dropzone: {
      label: "Drop your draft here",
      hint: ".md, .docx, or .pdf — held on this device until you sign in. We never see it first.",
      hintHeld: "Your file is held on this device — it uploads after you sign in.",
      paste: "Or paste your text",
      pastePlaceholder: "Paste your draft…",
      pasteCta: "Hold my text",
    },
    dossier: {
      heading: "What the board hands back",
      bullets: [
        "Every finding quotes its passage",
        "Every verdict carries a URL that was fetched and read",
        "The second read never sees the first reader's notes",
        "Independent second read, not a panel of personas",
      ] as const,
      sampleNote: "A read-only sample dossier — the same worked example the Showcase ships.",
    },
    workflow: {
      heading: "The workflow, in lifecycle order",
      steps: [
        {
          key: "outline",
          label: "Outline",
          note: "The argument's skeleton, checked before prose.",
        },
        {
          key: "draft",
          label: "Draft",
          note: "Your authorship — every suggestion waits for your approval.",
        },
        { key: "review", label: "Review", note: "The full board: claims, structure, discourse." },
        {
          key: "fact_check",
          label: "Fact-check",
          note: "Every checkable claim against fetched sources.",
        },
        {
          key: "revise",
          label: "Revise",
          note: "Moves proposed as a response — you keep the pen.",
        },
      ] as const,
      gateNote: "Draft's suggestions never apply themselves — every one waits for your approval.",
    },
    seat: {
      heading: "The author's seat",
      body:
        "You read the dossier, pick the moves worth making, and watch the diff. Dispositions, " +
        "apply-or-decline, a response letter when you revise — the instruments assume it's your book.",
    },
    voices: {
      heading: "A register, not a person",
      body:
        "A Voice is a set of registers and tics extracted from your own corpus — it tunes the " +
        "review to your room, and a staleness pill tells you when the profile has drifted.",
    },
    runs: {
      heading: "Runs you can watch",
      body:
        "Every run carries its estimate-and-cap card live — the run never exceeds the cap you saw " +
        "before it started, and the meter is on the page while it works.",
    },
    models: {
      heading: "Stay on the frontier",
      body:
        "Powered by Claude — model tiers stay current as the frontier moves, and the rate card " +
        "publishes what each tier costs before you spend it.",
    },
    proof: {
      heading: "Show your work",
      body:
        "The dossier's claims ledger is the proof: every verdict links the source it fetched, every " +
        "contradicted claim shows the passage and the page. Judge the board by its citations.",
    },
    pricing: {
      heading: "Pricing",
      body: "The same numbers the run sheet quotes — plans, credits, and the per-workflow cost cards.",
      cta: "See pricing",
    },
    changelog: {
      heading: "Changelog",
      body: "What's live now: the full editor, the public funnel, and the Showcase.",
    },
    faq: {
      heading: "Questions",
      items: [
        {
          q: "Does Rhēma write my essay?",
          a: "No. The board reviews and proposes; the approval gates keep the pen with you.",
        },
        {
          q: "Do I pay to look?",
          // HOT.1 — honest default; the "first review included" variant is the gated claim
          // `trial.firstReviewIncluded` (its ON text lives in PUBLIC_CLAIM_COPY, not here).
          a: "No card is required to start.",
          claimId: "trial.firstReviewIncluded",
        },
        {
          q: "Is my text used to train models?",
          a: "Never. Drafts, letters, and telemetry stay out of training, and providers are bound by the same terms.",
        },
      ] as const,
    },
    finalCta: {
      heading: "Bring the draft.",
      body: "The board reads first, quotes what it found, and shows its sources.",
      cta: "Start with a draft",
      signIn: "Have an invitation? Sign in",
    },
  },

  // ---- §15.2 — /pricing. Every figure renders through `buildPricingPageData` (contracts) — this
  //      table carries LABELS only; a price hand-typed here is a lint smell, not a shortcut. ----
  pricing: {
    heading: "Pricing",
    lede: "Credits pay for runs; plans bundle them. Every number on this page is derived from the published rate card.",
    monthlyLabel: "Monthly",
    annualLabel: "Annual",
    annualSaveFmt: "Save ${n}/yr",
    annualSavingLine: "Annual billing saves {pct}% — shown in dollars on the card.",
    freeHeading: "Free",
    // HOT.1 — `freeTrialNote` ("the included first review…") removed: an unrendered hidden claim does
    // not belong in the copy table at all; the gated variant lives in contracts' PUBLIC_CLAIM_COPY.
    freePostNote: "After the window: keep your workspace, buy runs with top-ups.",
    waitlistCta: "Join the waitlist",
    startCta: "Start free",
    // PR-U6/ACT.1 — a paid card's CTA names its plan ("Start Writer"), never a generic affordance.
    startPlanCtaFmt: "Start {plan}",
    signInCta: "Sign in",
    includedCreditsLabel: "included credits / mo",
    coversLabel: "What it covers",
    costCardsHeading: "What a run costs",
    costCardsNote:
      "Modeled figures at Standard rigor, across model tiers — the live estimate on the run sheet is authoritative for a real run.",
    // R6MNY.1 (REQ-LCH-5a) — the same charge-what-we-meter sentence the paid-account notice carries
    // (`meteredNoticeTemplate`), told to a new user BEFORE the flip is their first billing model —
    // GD-LAUNCH-MONEY.R6 orders metered debit ahead of purchase-open, so this is never a post-hoc
    // explanation of a charge already taken. The phrasing is the refunds page's shipped "actual
    // cost debited" register — true under `committed` today and `metered` after the flip.
    meteredNote:
      "How a run charges: it shows its estimate and cap before it starts, you pay the run's actual cost as each phase completes, and it can never cost more than the cap you confirm.",
    voiceCardHeading: "Voice profile",
    voiceCardLine: "A profile built from a {words}-word corpus",
    quickLineFmt:
      "A ≤{cap}-word piece on Base: Quick ≈ {quick} cr · Standard ≈ {standard} cr · Full board ≈ {fb} cr",
    factCheckOffLabel: "fact-check off",
    matrixHeading: "The ladder, compared",
    faqHeading: "Questions",
    // HOT.1 — honest default; the "one included Review" variant is the gated claim
    // `trial.firstReviewIncluded` (PUBLIC_CLAIM_COPY), not a copy-table string.
    trialRuleFmt: "One trial per person — {days} days, no card.",
    topUpHeading: "Top-up packs",
    topUpNoteFmt: "Never expire for {months} months.",
    creditsLabel: "credits",
    perSeatLabel: "per seat",
  },

  // ---- §15.3 — /signup + the onboarding states ----
  signup: {
    heading: "Create your account",
    lede: "Google or a magic link — no password, no questionnaire, no card.",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    codeLabel: "Invitation code",
    codeLabelOptional: "Invitation code (optional)",
    // SEC.2 (PR-U1 form half) — the open-mode disclosure the optional code field lives behind.
    codeToggle: "Have an invitation code?",
    continueEmail: "Email me a sign-in link",
    continueGoogle: "Continue with Google",
    orDivider: "or",
    intentNoteDraft: "Your held file is ready — it becomes your first project after you sign in.",
    intentNoteOutline: "Your outline becomes your first project after you sign in.",
    sentHeading: "Check your email",
    sentBody:
      "The link signs you in. While you wait — the dossier below is the worked example waiting in your workspace.",
    sampleHeading: "The Showcase — a worked example",
    chooseEntry: "Or choose your first step:",
    entryScratch: "Start from scratch",
    entryOutline: "Upload an outline",
    entryDraft: "Upload a draft",
  },

  // ---- §15.4 — the Showcase row + dossier chrome ----
  showcase: {
    // UX.1 — `/showcase`'s own page copy (the signed-out static sample; signed-in lands on the
    // viewer's real Showcase project).
    pageHeading: "Showcase",
    pageLede:
      "A read-only worked example — the dossier Rhēma hands back on a real essay: the editor's letter, the claims ledger, and the findings.",
    readOnlyNote:
      "Every account ships this same example in its workspace. Sign in to see yours — it stays read-only so the sample never changes.",
    signUpCta: "Create your account",
    signInCta: "Sign in",
    rowLabel: "Worked example",
    bannerTitle: "Welcome — a worked example",
    bannerBody:
      "This dossier is read-only: it shows what the board hands back before your own work is in. Duplicate it into a project of your own to play with the moves.",
    duplicateCta: "Duplicate it",
    openDossierCta: "Open the dossier",
    heldFileReady: "Your held file is here — upload it to start.",
    // 222 R7DEM.6a (REQ-TOUR-4) — the /showcase → /demo entry (a document navigation, S-14).
    demoLead: "For the full record — drafts, dossiers and each round's changes — walk the demo:",
    demoLink: "Open the demo →",
  },

  // R7RO.1 (REQ-DWEB-14; spec §3.3 S-3) — the ONE client read-only mechanism's copy: one notice
  // per reason (the `run_lock` notice is the Page's existing lock banner — DS §5.4 verbatim — so
  // it has no leaf here) + the per-reason tooltip the withheld write controls carry.
  readOnly: {
    demoNotice:
      "A read-only demo of a real essay's editorial record. Start your own project to use these tools.",
    reason: {
      demo: "Read-only demo — controls are disabled",
      showcase: "Read-only sample — controls are disabled",
      run_lock: "A run has locked this draft — controls are disabled",
    },
  },

  // SPA.3 — the shell's no-JS floor (REQ-BND-12): names the surface honestly instead of leaving a
  // dead document. SPA.28: the "Open the server-rendered version" escape string is retired — no
  // SSR document exists to link (the `?ssr=1` machinery is gone with the flag it escaped).
  spaShell: {
    noJs: "This app surface needs JavaScript — the Rhēma shell mounts it on top of your session.",
  },

  // R7SHELL.1b (REQ-SHELL-3) — the page-header content row's breadcrumb strings. The
  // `Project › Surface` trail replaces the four hand-picked back-link idioms (R6 §3).
  pageHeader: {
    /** The `<nav>` landmark label — the trail is generic, not "settings sections". */
    breadcrumbAria: "Breadcrumb",
    /** The visual separator between crumbs (aria-hidden — never read aloud). */
    separator: "›",
  },

  // R7SHELL.1a (REQ-SHELL-1/2; ADR-128) — the AppShell sidebar + account menu's chrome strings.
  appShell: {
    frameLabel: "Workspace navigation",
    newProject: "New project",
    search: "Search",
    recents: "Recent projects",
    allProjects: "All projects",
    inbox: "Inbox",
    voices: "Voices",
    usage: "Usage",
    settings: "Settings",
    account: "Account",
    billing: "Billing",
    pricing: "Pricing",
    themeLabel: "Theme",
    signOut: "Sign out",
    creditsFmt: "{n} credits",
    collapseTip: "Collapse the sidebar",
    expandTip: "Expand the sidebar",
    menuTip: "Open the menu",
    paneTip: "Toggle the pane",
    closeMenu: "Close the menu",
    // R7SHELL.2 (REQ-SHELL-4) — the project-scope section's item labels.
    project: {
      page: "Page",
      outline: "Outline",
      figures: "Figures",
      versions: "Versions",
      reviews: "Reviews",
      export: "Export",
      settings: "Project settings",
    },
  },
  appShellThemes: {
    dark: "Dark",
    light: "Light",
    auto: "Auto",
  },
  // R7SHELL.1c (REQ-SHELL-7) — the global ⌘K palette's copy (the IDE palette's own labels stay
  // under `ide.palette`; these are the shell-level palette's).
  palette: {
    dialogLabel: "Command palette",
    inputLabel: "Search projects, drafts, letters, Voices, and commands",
    placeholder: "Search or type a command…",
    placeholderScoped: "Search this project — or type / for a command…",
    emptyLabel: "Nothing matches.",
    searchAllProjects: "Search all projects",
    groupProjects: "Projects",
    groupDrafts: "Drafts",
    groupLetters: "Letters",
    groupVoices: "Voices",
    groupWorkspace: "Workspace",
  },

  // SPA.4 — the client route-error boundary's generic strings (the §5.9 "a banner, never a stack
  // trace" posture; per-surface error copy lands with the surface tickets).
  spaError: {
    heading: "Something didn't load",
    body: "The page hit an error — try reloading, or open the server-rendered version.",
    retry: "Reload",
  },

  // ---- R6LGL.1 (REQ-LCH-1; GD-LEGAL.R6 "Agent drafts, you approve" + GD-LEGAL-DETAILS.R6
  // "Placeholders now"; ADR-118) — the five legal/trust documents' drafted text.
  // `⟦KEY⟧` marks an operator-fill LEGAL_DETAILS slot (contracts/legal.ts) — legal.tsx renders
  // each as a visibly-marked placeholder until the operator records the value (HUMAN-H11) and
  // R6CNT.2 fills the slot; the page's `approved` flag stays false until then. Every statement
  // below claims only what the code does — the run ledger's review appendix cites the source
  // (spec section, requirement id, or shipped copy) for each.
  legal: {
    /** The footer link-group's accessible label. */
    footerLabel: "Legal",
    /**
     * Shown atop every legal document while its `approved` flag (contracts `LEGAL_PAGES`) is
     * false — the honesty marker GATE-LAUNCH's `approved: true` retires.
     */
    draftBanner:
      "Draft — the operator has not yet approved this page's text. Slots marked ⟦KEY⟧ are filled before approval.",
    terms: {
      lede: "These terms govern your use of Rhēma — the writing-review service operated by ⟦OPERATING_ENTITY⟧. Questions go to ⟦CONTACT_EMAIL⟧.",
      sections: [
        {
          heading: "The service",
          paragraphs: [
            "Rhēma reads a finished draft the way a demanding editor would — it checks every load-bearing claim against real sources and hands back a dossier you can act on.",
            "The board reviews and proposes; you decide. Every suggested change waits for your approval — the pen stays with you.",
          ],
        },
        {
          heading: "Your account",
          paragraphs: [
            "You sign in with Google or a magic link — there is no password to lose. Keep your sign-in method current and your session yours; you are responsible for activity under your account. Settings lists your active sessions and lets you revoke any of them.",
          ],
        },
        {
          heading: "Credits and payment",
          paragraphs: [
            "Runs draw on credits you add yourself — no card is required to start. Stripe processes payments; Rhēma does not store card numbers.",
            "Every run shows an estimate and a cap before it starts — the cap is what the run may cost you. The Refund Policy states the full accounting.",
          ],
        },
        {
          heading: "Your content",
          paragraphs: [
            "Your drafts, samples, projects, and voices stay yours. Rhēma does not train models on your content — the Privacy Policy states what happens to your words.",
            "Settings › Data exports everything you hold in the service and deletes your account when you ask.",
          ],
        },
        {
          heading: "Acceptable use",
          paragraphs: [
            "The Acceptable Use Policy is part of these terms — it covers what you may upload and what you may do with the service.",
          ],
        },
        {
          heading: "Changes and ending",
          paragraphs: [
            "⟦OPERATING_ENTITY⟧ may update these terms; material changes appear on this page before they take effect. You may stop using Rhēma and delete your account at any time; an account that breaks the Acceptable Use Policy may be suspended.",
          ],
        },
        {
          heading: "Governing law",
          paragraphs: [
            "These terms are governed by the laws of ⟦GOVERNING_LAW⟧, without regard to conflict-of-laws rules, and disputes go to the courts of ⟦GOVERNING_LAW⟧ unless applicable law requires otherwise.",
          ],
        },
      ],
    },
    privacy: {
      lede: "This policy states what ⟦OPERATING_ENTITY⟧ collects through Rhēma, what happens to it, and the controls you hold. Write to ⟦CONTACT_EMAIL⟧ with questions.",
      sections: [
        {
          heading: "What we collect",
          paragraphs: [
            "Account details — your name, email, byline, avatar, and sign-in methods.",
            "Content — the manuscripts, outlines, and samples you upload or paste, and the projects, drafts, and voices you build.",
            "Usage and billing — the records a paid service must keep: run costs, credit movements, and invoices.",
          ],
        },
        {
          heading: "What an integration exposes",
          paragraphs: [
            "Substack reads your public archive or an export zip — never your cookies, and a paywalled item is never fetched with a credential. Medium reads your public stories or an export zip. Google Drive reads only the files you pick, under the drive.file scope, for export only.",
            "Disconnecting an integration removes its credential immediately; imported samples stay unless you remove them on the voice's Samples tab.",
          ],
        },
        {
          heading: "What happens to your words",
          paragraphs: [
            // §14.7 verbatim — pinned identical to `settings.trainingPosture` by legal-pages.test.ts.
            "Rhema does not train models on your content. Model providers process it under their commercial API terms: Anthropic. During a review the Editor searches the web to check your claims; Rhema limits and monitors what those searches can carry, but a search query is text that leaves Rhema.",
          ],
        },
        {
          heading: "Sharing",
          paragraphs: [
            "We do not sell your information. Stripe processes payments; Anthropic processes content under its commercial API terms. Rhēma staff can view your projects only when you grant access — the Settings › Data toggle, per request, 72 hours, with every grant, access, and revocation logged.",
          ],
        },
        {
          heading: "Your controls",
          paragraphs: [
            "Settings › Data exports everything — every project, voice, draft, and figure as one zip whose download link arrives by email and lives for 7 days.",
            "The same page carries the privacy toggles — “Exclude my usage from product analytics” and “Allow Rhema staff to view my projects for support (per request, 72 h)” — both off by default, and the delete-account control described below.",
          ],
        },
        {
          heading: "Retention and deletion",
          paragraphs: [
            "Deleting your account starts a 14-day grace period — cancel any time before it ends. After that, Rhēma hard-deletes your content and personal information; anonymized ledger rows and the Stripe customer record are retained as tax law requires — nothing else.",
            "A deleted project tombstones for 30 days before it is purged. Platform records keep to a fixed schedule — run transcripts 30 days, internal events 30 days, audit records 90 days, usage records and the credit ledger 7 years — and database backups age out on the platform's backup window.",
          ],
        },
        {
          heading: "Cookies and tracking",
          paragraphs: [
            "Rhēma sets the session cookie your sign-in needs and no tracking cookies. Ingestion never asks for or accepts a cookie or any other credential — public endpoints and export zips only.",
          ],
        },
      ],
    },
    refunds: {
      lede: "How a run's credits move and when money comes back — the accounting every run follows. ⟦OPERATING_ENTITY⟧ answers questions at ⟦CONTACT_EMAIL⟧.",
      sections: [
        {
          heading: "How a run is charged",
          paragraphs: [
            "Every run shows an estimate and a cap before it starts — the cap is the consent. Starting a run holds the cap amount; as each phase completes, its actual cost is debited against the hold. Finish under the cap and the remainder is released.",
          ],
        },
        {
          heading: "When credits come back",
          paragraphs: [
            "If a run exceeds its cap because of our error, debits stop at the cap — you are not charged for the excess.",
            "If a run fails, is refused, or is cancelled by us, the debited credits are refunded and the hold releases; the partial results stay with you.",
            "If you stop a run yourself, you pay for the completed phases and the rest of the hold is released.",
          ],
        },
        {
          heading: "Asking for a refund",
          paragraphs: [
            "For a completed run, ask within 7 days — one refund per quarter is processed without review, and anything beyond that is looked at individually. Write to ⟦CONTACT_EMAIL⟧.",
            "Refunds restore credits to your Rhēma balance. If you believe a card charge itself is incorrect, write to ⟦CONTACT_EMAIL⟧.",
          ],
        },
      ],
    },
    acceptableUse: {
      lede: "What you may and may not do on Rhēma, operated by ⟦OPERATING_ENTITY⟧. Questions go to ⟦CONTACT_EMAIL⟧.",
      sections: [
        {
          heading: "Your content",
          paragraphs: [
            "Upload only material you have the right to work on — your own drafts, or material you are licensed to use. Manuscripts import as .md, .txt, .html, .docx, or .pdf, up to 25 MB per file.",
          ],
        },
        {
          heading: "Fair use of the service",
          paragraphs: [
            "Do not break or probe the service, scrape it, share your sign-in, or use it to break the law or someone else's rights. A magic link is for you alone.",
          ],
        },
        {
          heading: "Sources and integrations",
          paragraphs: [
            "A voice's samples come from your public archive or an export zip — never a paywalled item fetched with a credential, never your cookies. Google Drive contributes only files you pick, for export only. Rhēma never posts to your Substack or Medium.",
          ],
        },
        {
          heading: "Enforcement",
          paragraphs: [
            "Breaking this policy can suspend or close the account. If you think something was refused incorrectly, write to ⟦CONTACT_EMAIL⟧.",
          ],
        },
      ],
    },
    contact: {
      lede: "How to reach ⟦OPERATING_ENTITY⟧ — the operator of Rhēma.",
      sections: [
        {
          heading: "Support",
          paragraphs: [
            "Email ⟦CONTACT_EMAIL⟧ for help with your account, billing, or a run.",
            "Staff can view your projects only when you grant access — the Settings › Data toggle, per request, 72 hours — and every grant, access, and revocation is logged on the same page.",
          ],
        },
        {
          heading: "Privacy and legal",
          paragraphs: [
            "Export, deletion, and privacy questions go to ⟦CONTACT_EMAIL⟧.",
            "Enterprise? Ask us about a DPA.",
          ],
        },
      ],
    },
  },

  footer: "Rhēma",
  // 222 R7DEM.6a (REQ-TOUR-4) — the shared public footer's demo entry (document navigation).
  footerDemo: "Demo",
} as const;

/**
 * SPA.9 — the IdeShell label bag the React chrome passes verbatim: the SSR IdeFrame's inline
 * `{...COPY.ide, viewMenu: {advanced}}` form (pages.tsx), hoisted so the copy-contained SPA graph
 * keeps a leaf-only `COPY.*` import surface.
 */
export const IDE_CHROME_LABELS = {
  ...COPY.ide,
  viewMenu: { ...COPY.ide.viewMenu, advanced: COPY.runSheet.advanced },
};

/** SPA.9 — the live feed's `LiveFeedLabels` twin (pages.tsx's `feedLabels` const, hoisted). */
export const IDE_FEED_LABELS = {
  densityLabel: (d: string) => COPY.review.densityLabel[d] ?? d,
  heading: COPY.review.feedHeading,
};

/** A `[path, value]` pair for every string leaf in the copy tree (functions/objects skipped). */
export function collectCopyStrings(obj: unknown = COPY, prefix = ""): [string, string][] {
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
