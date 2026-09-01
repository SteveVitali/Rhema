# 15 — Object model, round 2 (workstream B: B1–B4)

Design-round-2 output for ledger §B (`docs/5_round2-ledger.md`), amending spec §11 and its
adjacent surfaces (§5.7, §5.8, §6.8, §5.11). Inputs: critique §7/§10
(`docs/4_external-chatgpt-product-business-critique.md`), crosswalk rows 7.1–7.16 and 10.1–10.8
(`docs/design/14_external-critique-crosswalk.md`), spec §5.7/§5.8/§6.8/§8/§11, design/3 §3.2–3.3,
and web literature fetched this session (B3; every number below was fetched, none inherited from
the critique, per ledger §0). Requirements are numbered `REQ-OBJ-n` (design/1 O6).

## Summary of decisions (≤300 words)

**B1 — adopted for v0.3, MVP scope.** `RevisionObligation` becomes the one deliberately mutable
project object over the immutable correspondence record: blocking/major findings spawn obligations
at delivery (minors on accept/adapt, notes never); the only exits are a verified move
(addressed → discharged), an explicit rebut or defer with DB-enforced rationale, mooting, or a
labeled unverified user discharge; regressions reopen them. Lineage rows make REQ-WF-7's
"carried/closed/new" and §6.8's stall detection computed facts that now work for hand-run rounds
at MVP. `BacklogItem` is folded in; no new `ArtifactKind`; three tables, +1.5–2.5 PM. Surfaced as
version-rail chips, a discharge column in what-changed, run-sheet scope lines, and Decisions-inbox
rows (REQ-OBJ-1…8).

**B2 — build the asset, firewall the Editor.** Capture already exists (verified in the DDL). A
workspace-level preference profile — not Voice — learns from dispositions, decisions, guidance and
usage; the Drafter and Assistant consume it, the Editor **never** does, enforced in three layers:
mount exclusion, a closed derivation schema (no disposition-derived parameter may reach review
configs — the Editor calibrates to venue and evidence only), and a human-approved
standing-guidance release valve. Staged capture (MVP) → deterministic aggregates + suggestions
(1.x) → Drafter priors (2.0). **Q-26: default-on account-local learning with opt-out; cross-account
would be separate opt-in** (REQ-OBJ-9…14).

**B3 — no argument object at MVP or 1.x; v2 falsifiable spike** gated on the eval corpus, with
graduation and kill criteria. Fetched literature: human κ ≈ .52–.74 (κ = 0.56 on editorials),
in-genre relation F1 tops out ≈ 61, cross-domain collapses, no demonstrated writer benefit.
**Q-25: let the evidence decide; not the funded soul** (REQ-OBJ-15/16).

**B4 — verdict vocabulary frozen (spec exceeds, verified); adopt `claim_sources[]` stance edges
and `claim.kind`; reject numeric confidence** (REQ-OBJ-17…19).

---

## 1. B1 — Revision obligations as a first-class durable object

### 1.1 What the current model cannot answer

The crosswalk marked critique 7.9 **ALIGNED**, and at the granularity of one round it is: dispositions
run `proposed → open → done → verified` (§11.3), moves carry discharge evidence joined into the diff
(§5.8), re-review reports "N carried, M closed, K new" (REQ-WF-7), and §6.8 sequences rounds with
"no major finding survives two consecutive rounds (lineage by finding id)". But walk the joins and
four questions have no durable answer:

1. **"What is still owed on this project?"** `Finding` is keyed to one `correspondence_item` — one
   review of one version. `Disposition` is keyed to `(finding, response)` and **frozen at delivery**
   (REQ-DATA-22). After round 2 there is no row whose state means *this debt is still open on v4*;
   the answer exists only by re-reading every frozen ledger in sequence, or by trusting the latest
   Editor prose.
2. **"Was the deferral ever picked back up?"** *Defer* pre-fills "Not this round" (§5.7) and then
   nothing owns the deferral. `BacklogItem` carries next-round agenda as free text with a
   `consumedByRunId`, but it is unlinked to the finding, has no severity, no horizon, and no reopen
   path. A deferred major silently evaporates if the next review doesn't independently re-raise it.
3. **"Did the fix hold?"** REQ-WF-7's "carried / closed / new" is computed by the re-review run and
   delivered as prose+sidecar of *that* correspondence item; it never writes back to anything
   durable. A regression (issue re-raised in round 3 after being "closed" in round 2) is invisible
   as a fact; it is just another new finding.
4. **"Is the loop stalling?"** §6.8's stall detector needs major-issue lineage across rounds. Run
   rounds (1.x) can keep that lineage in its private round log, but MVP users run Review → Revise
   **by hand**, and hand-run rounds leave no lineage at all. The stall criterion as written has no
   substrate at MVP.

The critique's underlying point (§7 "Revision obligation: a durable task produced by a finding and
closed only when discharged") is that revision is *task-shaped* while the spec models it as
*correspondence-shaped*. The correspondence record is the product's spine and stays immutable;
what is missing is one small mutable object that survives rounds. Round 1's draft recommendation
was **adopt for v0.3**; this document confirms it — the object closes a real queryability gap, costs
one table plus derivation logic (it reuses the sidecar, quote-resolution and decision-inbox
machinery that already exists), and it is the substrate three already-specced features (REQ-WF-7,
§6.8 stall detection, §5.8 what-changed) were quietly assuming.

### 1.2 The object

```ts
// §11.3 addition. RevisionObligation is MUTABLE project state — the one deliberate exception to
// "correspondence is immutable". Its history is append-only (obligation_transitions); the row's
// current state is a cache of the last transition, exactly like Draft.state.
type ObligationState =
  | 'open'         // spawned; nothing qualifying has happened
  | 'addressed'    // a frozen response ledger records an accept/adapt move against it; verification pending
  | 'discharged'   // verified: the Revise gap check confirmed, or the next covering Review did not re-raise
  | 'rebutted'     // closed by an explicit rebut with rationale (disposition-linked)
  | 'deferred'     // parked with rationale + horizon; returns to 'open' when the horizon arrives
  | 'mooted'       // the anchoring text or claim no longer exists (auto-disposition path, REQ-DATA-26)
  | 'reopened';    // regression: a matching finding re-raised after addressed/discharged
type ObligationSource = 'finding' | 'escalation_decision' | 'agenda' | 'user';

interface RevisionObligation {
  id: Id<'obl'>; projectId: ProjectId;
  source: ObligationSource;
  findingId?: Id<'find'>;            // root finding (source='finding'); null for agenda/user rows
  severity: Severity;                 // max over the lineage set
  kind?: FindingKind;
  title: string;                      // derived from the root finding; free text for agenda/user rows
  state: ObligationState; stateSince: ISO;
  openedOnDraftId: DraftId;
  rationale?: string;                 // rebut/defer rationale, copied from the closing disposition
  deferHorizon?: { rounds?: number; until?: 'next_review' | 'pre_export' };
  roundsOpen: number;                 // consecutive covering reviews delivered while not discharged
  dischargedBy?: { dispositionId?: Id<'disp'>; moveOrdinal?: number; draftId: DraftId;
                   verifiedBy: 'gap_check' | 're_review' | 'user' };
  createdBy: Actor; createdAt: ISO; closedAt?: ISO;
}
// lineage: which findings, across rounds, are "the same debt"
interface ObligationFinding { obligationId: Id<'obl'>; findingId: Id<'find'>;
  correspondenceId: Id<'corr'>; relation: 'root' | 'carried' | 'regression'; }
```

`BacklogItem` (§11.3) is **folded into this object** and removed: agenda lines from response
letters become `source: 'agenda'` obligations (severity `note`, no finding), and user to-dos become
`source: 'user'`. One durable debt object, one surface, instead of two half-objects
(`BacklogItem` + the §6.8 loop's private lineage) that would drift.

**Not a new `ArtifactKind`.** Findings, claims and dispositions are rows without artifact kinds;
obligations are the same class of thing. The 62-kind enum, the §8.2 policy table and REQ-SPEC-14's
contract test are untouched. Visibility falls out of the row model: obligations render wherever
findings render, so they inherit the SR posture of the surfaces that show them.

### 1.3 Creation: which findings spawn obligations

Decided rules (alternatives noted inline):

1. **Every `blocking` and `major` finding spawns exactly one obligation at delivery**, in the same
   transaction as REQ-DATA-7, actor `system`. Not disposition-dependent for majors: the debt exists
   when the diagnosis is delivered; the disposition then *routes* it (rebut closes it, defer parks
   it). This mirrors the source discipline — respond-to-review requires every major to be
   dispositioned; an undispositioned major is exactly what "open obligation" means. *Rejected:
   spawn-on-accept-only* — it makes the open-obligation count a function of triage progress rather
   than of the review, and a user who never triages would show zero debt.
2. **`minor` findings spawn only on an accept or adapt disposition** — the author opts into the
   debt. **`note` findings never spawn** — Apply handles them inline (REQ-SPEC-6), and an unapplied
   note is taste, not debt. *Rejected: all-severities-spawn* — a 150-finding Academic dossier would
   mint 150 obligations and the chip becomes noise; the severity budget of §5.7 exists for the same
   reason.
3. **Escalations**: an `escalate` disposition keeps the obligation `open` and links the
   `decision_request` it already creates (§5.11); the inbox answer routes it (proceed → stays open
   against the next revise; drop → `rebutted` with the decision's text as rationale).
4. **Reconciliation-rejected second-read findings** spawn nothing unless the author promotes them
   (REQ-IDE-26); promotion spawns per rules 1–2 by severity.
5. **User-created**: "Add to obligations" on any finding (including minors/notes) or free-form from
   the palette (`source: 'user'`).

### 1.4 Discharge semantics — mirroring respond-to-review's discipline

The closing paths are closed-world; there is no silent closure and no bulk close:

- **`addressed`** — set when a response ledger freezes (delivery of the Revise correspondence) with
  an accept/adapt disposition whose `status ∈ {done, verified}` against the root or a carried
  finding. If the Revise run's independent gap check verified the move at Full board, the
  orchestrator sets `discharged` directly with `verifiedBy: 'gap_check'`.
- **`discharged`** — set at delivery of the next covering Review of v(N+1): the obligation's lineage
  matched no new finding (REQ-WF-7's "closed" set, now computed from rows — §1.5). Also settable by
  hand: *Mark discharged* with a required note (`verifiedBy: 'user'`) for the author who revised
  manually and will not re-review; the chip renders it as "discharged (unverified)" — the same
  honesty pattern as "claims pending verification" (REQ-PROD-11).
- **`rebutted`** — only via a `rebut` disposition with its (already mandatory, §5.7) rationale;
  the rationale is copied onto the obligation. A rebutted obligation is *closed with an argument on
  file*, which is what lets REQ-WF-7's re-review decline to re-raise it without losing the record.
- **`deferred`** — only with rationale + horizon. Default horizon `next_review`; horizons in rounds
  (1–3) or `pre_export`. When the horizon arrives (next review delivered, or export requested), the
  obligation returns to `open` and surfaces on the relevant run sheet / export dialog. Deferral is
  therefore a snooze, never a burial — the fix for gap 2 of §1.1.
- **`mooted`** — automatic when quote re-anchoring finds the anchor text gone (REQ-DATA-26's
  `mooted` auto-disposition path), confirmed at the next triage like any mooted disposition.
- **`reopened`** — regression: a delivered review matches a new finding onto an
  `addressed`/`discharged` obligation's lineage. `roundsOpen` increments; the transition is recorded
  with the triggering finding (`relation: 'regression'`).

**Export and archive never block on obligations** (export-only is a founding constraint; gates are
approve-with-deadline, not walls): the export dialog shows "2 blocking obligations open" with links,
and the AI-use statement's run-facts section counts them (REQ-VIS-10 unchanged — the statement
gains a generated sentence only if obligations exist). Archiving freezes obligations as-is.

### 1.5 Lineage, REQ-WF-7 as rows, and §6.8 on a durable substrate

Cross-round identity is the hard part; three matchers run in order at review delivery, first hit
wins, all recorded on `obligation_findings`:

1. **Claim identity**: new finding's `evidence.claimId` resolves (via `normalized_url` + quote) to a
   claim already in an open obligation's lineage.
2. **Editor's own declaration**: the re-review already *reads the response letter first* (REQ-WF-7).
   Amendment: the re-review's mirror gains a read-only `obligations.json` (id, title, state,
   severity, anchor quotes), and its findings sidecar gains an optional `carriesObligationId` field.
   The Editor declaring "this is the same unresolved issue" is the highest-quality signal and costs
   one sidecar field. (Independence note: this file is mounted **only** into the letter-writing
   re-review context that already sees the response letter — never into the second read, whose
   draft-only rule is unchanged, and never into first reviews of a version lineage.)
3. **Anchor overlap**: same `kind` + quote-resolution overlap (the same service that projects
   findings across versions, §5.7) above a confidence floor; below the floor, no match — a false
   merge is worse than a duplicate obligation, which the user can merge by hand.

With lineage durable, two specced features change from prose to queries:

- **REQ-WF-7 (amended)**: "N carried, M closed, K new" is computed by the orchestrator from
  obligation rows at delivery and *asserted against* the Editor's sidecar counts; a mismatch is a
  delivery-validation warning (not failure — matcher 3 is heuristic). The run report renders the
  row-derived numbers.
- **§6.8 stall detection (REQ-WF-15 amended)**: "the same major-issue lineage recurs" becomes
  `exists obligation where severity in ('blocking','major') and roundsOpen ≥ 2 and state != 'rebutted'`
  — and because obligations are project rows, not loop-log rows, **stall detection now works for
  hand-run rounds at MVP**, not only under the 1.x `run_rounds` workflow. The Convergence report
  (REQ-PROD-12) reads the same rows.

### 1.6 DDL delta (§11.4)

```sql
create table revision_obligations (
  id text primary key, project_id text not null references projects on delete cascade,
  source text not null check (source in ('finding','escalation_decision','agenda','user')),
  finding_id text references findings, severity text not null, kind text,
  title text not null, state text not null default 'open', state_since timestamptz not null default now(),
  opened_on_draft_id text references drafts, rationale text, defer_horizon jsonb,
  rounds_open int not null default 0, discharged_by jsonb,
  created_by jsonb not null, created_at timestamptz default now(), closed_at timestamptz,
  check (state not in ('rebutted','deferred') or rationale is not null));
create index on revision_obligations (project_id, state);
create unique index one_obligation_per_root_finding on revision_obligations (finding_id)
  where finding_id is not null;
create table obligation_findings (
  obligation_id text references revision_obligations on delete cascade,
  finding_id text not null references findings, correspondence_id text not null,
  relation text not null check (relation in ('root','carried','regression')),
  primary key (obligation_id, finding_id));
create table obligation_transitions (
  id text primary key, obligation_id text not null references revision_obligations on delete cascade,
  from_state text, to_state text not null, cause text not null, by_actor jsonb not null,
  run_id text, disposition_id text, finding_id text, at timestamptz default now());
-- transitions are the truth; a trigger keeps revision_obligations.state equal to the last transition
-- backlog_items: rows migrated to revision_obligations (source='agenda'); table dropped
```

Forward-only migration per REQ-DATA-3; the seed's three real projects exercise spawn, address,
rebut, defer and carry (all three have multi-round history).

### 1.7 UI surfacing

- **Open-obligations chip per version** (§5.8 version rail): each chip gains `⚑ 3 open · 2 addressed`
  (blocking/major only in the chip; the full list one click away). The project card pill counts
  blocking obligations in the *Reviewed* and *Edited by you* states.
- **What-changed view** (§5.8): the move card's discharge line is upgraded from "discharges F-07" to
  "discharges OBL-3 (F-07, carried from v2) — verified by gap check"; a header strip summarizes
  "7 obligations addressed · 1 rebutted · 2 still open" beside the existing move counts.
- **Findings surface** (§5.7): major/blocking cards show the obligation-state chip; the shared filter
  set gains *open obligations*; triage-mode's progress line adds "obligations: 9 open".
- **Run sheets** (§5.6): Review of v(N+1) lists open obligations on the scope card ("4 open
  obligations will be checked"); Revise's sheet shows "this run addresses 7 open obligations".
- **Decisions inbox** (§5.11): escalated obligations already land as `decision_requests`; add
  horizon-expired deferrals ("Deferred in round 1, horizon reached: decide / re-defer / drop") and
  the stall escalation of §1.5. The inbox badge rule is unchanged (approvals + decisions only).
- **Mobile** (§10): the chip renders read-only; *Mark discharged* is web-only at MVP.

### 1.8 Migration cost and amended requirements

Engineering cost: three tables + transition trigger (S); spawn/route/match logic in the delivery
transaction (M — matcher 3 reuses the quote-resolution service); UI chips and filters (S–M);
`obligations.json` mirror file + one sidecar field (S, inside the REQ-ARCH-5 skill-porting budget).
Estimate **+1.5–2.5 PM** against §17's 52–67 PM — recorded as an amendment to §16.3 #24.

Spec rows amended by adoption: **§11.2** (ER: PROJECT ||--o{ REVISION_OBLIGATION; FINDING joins),
**§11.3** (types above; `BacklogItem` removed), **§11.4** (DDL), **REQ-DATA-7** (delivery
transaction also spawns/joins/transitions obligations), **REQ-WF-7**, **REQ-WF-15 / REQ-PROD-12 /
§6.8** (lineage substrate), **§5.7 / §5.8 / §5.11 / §5.6** (surfacing), **§4.3 vocabulary**
("Obligation" enters the fixed vocabulary; "backlog" leaves), **Appendix D** reserved strings.

**Verdict: adopt for v0.3, MVP scope** (spawn, routes, chips, inbox; matcher 3 may ship behind the
claim-id and Editor-declared matchers if the confidence floor needs tuning).

> **REQ-OBJ-1.** `revision_obligations`, `obligation_findings`, `obligation_transitions` per §1.6;
> transitions append-only; row state maintained by trigger from the last transition. AC: trigger
> test — direct `update … set state` without a transition row raises.
> **REQ-OBJ-2.** Spawn rules: blocking/major at delivery (system); minor on accept/adapt; note
> never; escalation keeps open + links the decision request; promotion and user rows per §1.3.
> AC: golden dossier fixtures assert spawn counts per severity mix.
> **REQ-OBJ-3.** Closing paths are exactly: addressed→discharged (verified), rebutted (rationale
> required, DB-checked), deferred (rationale + horizon; auto-returns to open), mooted, user
> discharge (labeled unverified). No bulk close; export/archive never block. AC: state-machine
> property test enumerating transitions.
> **REQ-OBJ-4.** Re-review consumes `obligations.json` (letter context only; never the second
> read), emits `carriesObligationId`; orchestrator computes carried/closed/new from rows and
> reconciles with the sidecar (mismatch = warning). REQ-WF-7 amended. AC: fixture with a planted
> regression yields `reopened` + roundsOpen increment.
> **REQ-OBJ-5.** Stall detection (§6.8/REQ-WF-15) and the Convergence report read obligation rows;
> works identically for hand-run rounds. AC: two-round hand-run fixture with a persisting major
> escalates to the Decisions inbox.
> **REQ-OBJ-6.** Surfacing per §1.7: version-rail chip, what-changed discharge lines and summary
> strip, findings filter, run-sheet scope lines, inbox rows for escalations and expired deferrals.
> AC: snapshot tests on the three seeded projects.
> **REQ-OBJ-7.** `BacklogItem` is removed; existing rows migrate to `source='agenda'` obligations;
> no new `ArtifactKind` is introduced (REQ-SPEC-14 enum unchanged). AC: migration test + contract
> test count still 62.
> **REQ-OBJ-8.** Obligations are never mounted into independence contexts (second read, fidelity
> audit, gap check) — enforced by the mount manifest like all §12.6 rules, not by convention.
> AC: hydration-manifest test per seat/context.

---

## 2. B2 — The longitudinal author model

Critique asset 10.3; crosswalk verdict **ABSENT — "the data is captured; the asset is never
built."** This section designs the asset, and designs the one thing that must *never* be built.

### 2.1 Capture: verified already in the DDL

Ledger B2 asks for verification that capture exists. Confirmed against design/3 §3.3 and §11.3/§11.4:

| Signal | Where it already lives |
|---|---|
| Accept/adapt/rebut/defer/escalate per finding, with rationale, `adaptedText`, `applied`, actor | `dispositions` (kind, status, rationale, by_actor jsonb incl. userId; §11.3 adds `applied`, `adaptedText`) |
| Finding kind/severity the disposition was about | `findings` (cls/kind, severity) joined via `finding_id` |
| Gate behavior: approve vs approve-autonomous vs expiry, presence, standing-rule promotions | `decisions` (action, by, `standingRule`, presence) |
| Recurring explicit instructions | `guidance` (text, scope `project`, source, `consumedBy`, active) |
| Rigor/tier/phase-opt-out habits | `runs.inputs`, `rigor`, `model_tier`; `usage_records` |
| Revision behavior: rounds to accept, moves per round, human-revision frequency | `drafts.origin`, `correspondence_items`, disposition `moveOrdinal` |
| Venue/format choices | `projects.venue`, `protocol_id`, `register` |

Nothing new must be captured at MVP; the round-1 assessment's premise holds. (One nit: cross-project
aggregation joins dispositions → findings → correspondence → projects to reach `workspace_id`; the
1.x aggregation job adds a covering index, no schema change.)

### 2.2 What may be learned, and who may consume it

Learnable, deterministic aggregates (no model in the loop at 1.x):

1. **Disposition priors** by (finding kind, severity): "rebutted 9 of 11 `voice` findings",
   "accepts 90% of `claim` majors, defers `structure` minors".
2. **Adaptation deltas**: how far `adaptedText` diverges from the suggestion (the author rewrites
   suggestions toward shorter sentences; strips hedges).
3. **Apply behavior**: which note classes get Applied instantly vs ignored.
4. **Recurring guidance**: near-duplicate `guidance` texts across ≥3 projects.
5. **Process preferences**: habitual rigor notch, phases opted out, gate autonomy, round counts.
6. **Venue/format preferences**: protocols, registers, lengths, venues actually used.

Consumption is the entire design problem. The split:

| Signal class | Drafter | Assistant | Editor | Second read / audits |
|---|---|---|---|---|
| Venue/format/protocol facts (explicit project fields) | ✓ (today) | ✓ | ✓ (today — this is the *only* thing the Editor gets, and it already gets it via protocol + venue + register + stage) | per existing rules |
| User-authored standing guidance | ✓ | ✓ | ✓ except independence contexts (REQ-RUN-18, unchanged) | never (unchanged) |
| Learned preference profile (1–6 above) | ✓ (staged, §2.5) | ✓ (phrasing/suggestions) | **never** | **never** |
| Any severity/selection feedback derived from dispositions | — is never computed at all (§2.3) | | | |

### 2.3 The firewall: the Editor never learns to pull punches

The tempting move is FP reduction: "the author rejected these thirty findings; stop raising them."
It is wrong for the same reason the second read exists: **rebutted is not falsified.** An Editor
that calibrates to the author's tolerance converges on sycophancy, silently — the one failure mode
the product's independence architecture (§12.6, second read, reconciliation) is built to make
structurally impossible. And the trust story collapses the day a user realizes their Editor got
softer after they rebutted a few rounds. So the firewall is designed as three enforced layers, in
the style of §12.6 (enforced, never advised):

1. **Data layer.** Learned signals live in workspace-scoped tables (`preference_signals`,
   `preference_profiles`, §2.4) rendered into one mirror file, `preferences.md`, mounted **only**
   into Drafter- and Assistant-seat runs. `agent_types.readable` for the editor seat never includes
   it; the hydration manifest for any Editor-seat run (Review, Fact-check, Steelman, second read,
   and Revise's gap check context) must not contain the path. This is the same mechanism that keeps
   `voice_print` out of the Editor's mount today (§8.2 row 28) — zero new enforcement machinery.
2. **Derivation layer.** The aggregation pipeline has a closed output schema, and that schema
   contains **no field keyed on the reception of Editor outputs as such**: it may say "author
   prefers em-dash-free prose" (a Drafter instruction), never "author rejects severity-major voice
   findings" *as an input to any run that produces findings*. Concretely: no parameter derived from
   `dispositions` may reach `packages/protocols` review configs, severity thresholds, phase
   prompts, or rubric anchors. **The Editor calibrates to the venue and the evidence — venue tables
   (§6.7) and the eval program (design/16) — never to the author.** A contract test greps the
   protocol package's inputs the same way REQ-ARCH-33 greps client bundles.
3. **Release valve — through the human, in the open.** The legitimate need behind FP reduction is
   real (an author genuinely entitled to say "stop flagging sentence fragments; they are my
   style"). The channel for it exists and stays the only channel: **standing guidance**, authored
   or *approved* by the user, visible in Settings → Standing guidance, named in the letter when
   honored (§6.5). The longitudinal model may **draft** a standing-guidance suggestion from
   pattern 4 ("You've rebutted 9 hedging findings across 4 projects with similar rationales — add
   standing guidance?"), but it becomes active only when the user accepts the exact text. What the
   user explicitly instructs is their editorial judgment on the record — categorically different
   from silent statistical adaptation, and it inherits the existing carve-out: never delivered into
   independence contexts.

This resolves the apparent tension in critique §10.3 (which lists "history of accepted/rejected
suggestions" as a moat *without* addressing independence): the history is an asset for the
**Drafter and the workflow defaults**, and a UI asset ("what Rhema has learned about how you work"),
and it is deliberately *not* an input to judgment.

### 2.4 Storage: account-level preference profile, not Voice

Decision: a **workspace-level preference profile**, one per (workspace, user), not part of the
Voice/persona system.

- Voices are portable authorial identities with modes `self | consented | house | study` (Q-11).
  Learning the operating user's dispositions into a `house` or `consented` voice would write one
  person's behavior into another's identity; and one user writes under several voices while
  deciding as one person.
- **Voice learns from what the author writes; the preference profile learns from what the author
  decides.** Style, positions, continuity stay in the Voice (text-derived, §9); behavior-derived
  preferences live in the account profile (decision-derived). A per-voice overlay ("when writing
  as X, I accept more structural intervention") is deferred until telemetry shows within-account
  divergence worth modeling.
- Privacy/retention semantics attach naturally: the profile exports with the account zip
  (REQ-ACCT-3), dies with account deletion, and never rides along when a voice is forked or shared.

```ts
// §11.3 additions (1.x tables; nothing at MVP)
interface PreferenceSignal { id: Id<'psig'>; workspaceId; userId;
  class: 'disposition_prior' | 'adaptation_delta' | 'apply_behavior' | 'recurring_guidance'
       | 'process_default' | 'venue_format';
  statement: string;                       // rendered claim, e.g. "Rebuts hedging findings (9/11)"
  support: Array<{ table: 'dispositions'|'decisions'|'guidance'|'runs'; ids: string[] }>;  // provenance
  strength: { n: number; rate?: number };  // counts, never opaque scores
  computedAt: ISO; retiredBy?: UserId; retiredAt?: ISO }
interface PreferenceProfile { id: Id<'pprof'>; workspaceId; userId; builtAt: ISO;
  signalIds: Id<'psig'>[]; renderedArtifactVersionId: ArtifactVersionId }  // preferences.md snapshot
```

Consumers pin a `PreferenceProfile` snapshot id on the run (like `persona_profile_snapshot_id`), so
a drafting note can say — and does say — which learned statements it honored. Rendering reuses the
`guidance_record` pattern (rows rendered SR, never a file the user edits); corrections are
per-signal *retire*, mirroring "Correct this in your description" (REQ-VIS-8).

### 2.5 Staging

- **MVP:** capture only (§2.1 — already built by other requirements). No pipeline, no UI. Ship the
  Settings→Data toggle copy now so the posture is declared before the feature exists.
- **1.x:** deterministic aggregation job (thresholds: a signal needs n ≥ 5 across ≥ 2 projects);
  "What Rhema has learned" panel (SR) with per-signal provenance and retire; the
  suggest-standing-guidance flow (§2.3.3); process-default suggestions on run sheets ("You usually
  run Full board on Academic — make it the default?").
- **2.0:** Drafter priors injected as a dated, sourced section of the commissioning brief (same
  rendering contract as guidance); Revise's *proposed triage* calibrated by disposition priors
  (safe: Revise is Drafter-seat and proposes to the human, who overrides row by row — REQ-WF-9
  unchanged); estimator personalization.

### 2.6 Privacy default (Q-26 recommendation) and retention

**Recommend: on by default with a first-class opt-out, for account-local learning only; anything
cross-account is a separate, opt-in question that no current design needs.** Reasoning against the
opt-in alternative: (a) no new data is collected — signals are aggregates over rows the account
already holds and can already read one by one; the profile is a *view*, so opt-in would gate a
capability without adding a privacy protection; (b) it is consistent with Q-12 ("reasonable
posture; concede no more than necessary") and with the Voice precedent — profiling the user's own
samples is on-by-default with visible outputs; (c) the scary interpretation ("the AI adapts to
me") is exactly what the §2.3 firewall makes false, and saying so is a trust feature: the toggle
copy reads "Rhema learns your working preferences from your decisions to help the Drafter and
pre-fill defaults. The Editor never sees this — reviews never soften." Controls: master toggle in
Settings → Data (default on); per-signal retire; deleting a project recomputes signals without its
rows; account deletion removes everything (REQ-ACCT-4 path); profile included in the export zip.
Retention follows the source rows — signals are recomputable caches, never independent records.

> **REQ-OBJ-9.** `preference_signals` / `preference_profiles` are workspace+user-scoped (1.x);
> consumers pin a profile snapshot id recorded on the run; the rendered `preferences.md` is SR via
> the guidance_record pattern, per-signal retire, no in-place edit. AC: snapshot pin appears in
> drafting-note header fixture.
> **REQ-OBJ-10.** The preference profile is mounted only into Drafter- and Assistant-seat runs.
> Editor-seat and independence-context hydration manifests must not contain it; contract test
> asserts the editor seat's readable set excludes it (same fixture family as REQ-VIS-7).
> **REQ-OBJ-11.** No parameter derived from `dispositions` (or any reception of Editor output)
> may enter review configs, severity thresholds, phase prompts, or rubric anchors in
> `packages/protocols`. Editor calibration inputs are venue tables and eval-program results only.
> AC: protocol-package input schema is closed; CI test enumerates allowed input sources.
> **REQ-OBJ-12.** Learned patterns may only change agent behavior via (a) Drafter/Assistant
> consumption of the pinned profile or (b) standing-guidance suggestions the user explicitly
> accepts verbatim; accepted suggestions are ordinary `Guidance` rows (existing independence
> carve-outs apply). AC: no code path activates guidance without a user decision row.
> **REQ-OBJ-13.** Every signal statement carries queryable provenance (`support` ids) rendered as
> "because you …" links; strengths are counts/rates, never opaque scores. AC: UI snapshot shows
> provenance on every row.
> **REQ-OBJ-14.** Learning is account-local, default-on with a Settings→Data opt-out (copy per
> §2.6), recomputed on project deletion, exported with the account, deleted with it. Cross-account
> aggregation of any of these signals requires a separate explicit opt-in design (none specced).
> AC: opt-out flips consumption off for new runs within one minute; export zip contains the
> profile.

---

## 3. B3 — The argument graph: evidence, posture, and the falsifiable spike

Critique 7.6 (**ABSENT**: argument nodes — premise, inference, conclusion, objection, rebuttal,
assumption) and 8.2/16.2 ("agentic development environment for arguments"). Round 1's default
stance: v2 research spike, not an MVP object. The evidence fetched this session (2026-09-01)
**confirms and hardens** that stance.

### 3.1 What the literature actually supports

All numbers below were fetched this session (papers on aclanthology/arXiv/CEUR); none are inherited
from the critique.

**Humans only moderately agree on argument structure — and only in thesis-driven school genres.**
On the field's canonical corpus (402 five-paragraph persuasive student essays), Stab & Gurevych
(*Computational Linguistics* 43(3), 2017; scheme from COLING 2014) report strong agreement on
premises (κ = .833) and major claims (κ = .877) but **κ = .635 (αU = .524) on claims** and
**κ ≈ .71–.74 on support/attack relations** — substantial, not high, under a tree-constrained
scheme built for the genre. Move to professional prose and the ceiling drops: news editorials
annotate at **Fleiss' κ = 0.56** over six unit types (Al-Khatib et al., COLING 2016), and an LREC
2022 opinion-article corpus shipped **non-aggregated** per-annotator labels because disagreements
could not be defensibly collapsed. No corpus of professional or literary essays with reliable
argument-structure annotation was found at all — for Rhema's Essay wedge, the construct itself is
under-defined in the target genre.

**Machines: relation extraction is the hard part and remains unsolved.** End-to-end on the student
corpus (the field's easiest): component F1 has reached ~80, but **relation F1 progressed from 12.9
(ILP pipeline) → ~34.8 (Eger et al. 2017) → 46.4 (Ye & Teufel 2021) → ~55 (Longformer biaffine) →
61.1 (FLAN-T5 XXL, Kawarada et al., EACL 2024)** — after nine years, barely three-fifths of edges
correct *on curated 5-paragraph essays with a single gold tree*. On CDCP (user comments) the same
SOTA model manages **relation F1 = 33.96**. Cross-domain is worse: "Limited Generalizability in
Argument Mining" (ACL 2025, arXiv 2505.22137) finds **97% of cross-dataset transfers fall below
the in-domain mean (0.79 macro-F1), 62% under 0.65**; the best model averages 0.61 — "models learn
datasets, not arguments."

**LLMs have not closed the structural gap.** Zero/few-shot LLMs now match fine-tuned PLMs on
pairwise *classification* subtasks (Chen et al., ACL 2024; Gorur, Rago & Toni, COLING 2025 — where,
tellingly, AAEC pairwise **support F1 ≈ 94 but attack F1 ≈ 52** even for 70B models), and a 2026
survey of LLM-based argument mining (arXiv 2506.16383) shows GPT-4-class wins on quality-judgment
tasks, not on component/relation extraction. Attack/objection detection — precisely the edges an
editorial product would care most about — is the weakest class everywhere.

**No demonstrated writer benefit from extracted graphs.** The positive user-study evidence in
writing support is for *revision-purpose feedback* (ArgRewrite; Afrin et al., CHI 2021 — detailed
sentence-level revision categorization helped, in a **Wizard-of-Oz** setup where humans stood in
for the unreliable analysis), and IBM's Key Point Analysis is deployed for opinion summarization,
not for authors. No controlled study was found showing argument-graph visualization improves
writers or their drafts.

### 3.2 Marginal value over what the spec already builds

The dossier already delivers, per review: a **claim ledger** (leaf verification — are the atoms
true), a **discourse report** (positioning — is the thesis original, what is the strongest
counterargument), **argument notes** (I-level prose reasoning), a rubric **Argument rigor**
dimension with entailment caps, and at 1.x the **Steelman + vulnerability map** (adversarial
structure probing) and **reverse outline** (structural skeleton). The graph's *unique* marginal
claim is explicit, anchored inference structure — "premise P2 does not support C without assumption
A, which is never argued." That is real editorial value **when the extraction is right**; at ~60%
relation F1 in-genre, worse out-of-genre, and κ ≈ 0.56–0.71 human ceilings, roughly one edge in
three is wrong or contestable — in a product whose entire trust posture is "every finding is
verified, every URL was fetched" (REQ-VIS-9, §8.4). A confidently rendered wrong graph is
anti-trust in a way a wrong prose note is not, because the graph *looks* like data. The marginal
value over the existing artifacts is demonstrated nowhere (§3.1's last paragraph), so it must be
demonstrated by us or not shipped.

### 3.3 Posture (decides Q-25's timing question)

- **MVP: no argument object.** Confirmed, now with evidence rather than prior.
- **1.x: no argument object either** — but the *substrate* accrues on purpose: anchors on every
  finding, `claim.sources[]` stance edges (§4.3), reverse outline, steelman/vulnerability map.
  These are the graph's nodes and half its edges, each shipped under a feature that stands on its
  own.
- **v2: a funded, falsifiable spike (§3.4), gated on the C-workstream eval corpus existing** —
  the same professionally annotated drafts serve both, and the spike's success criterion is an
  eval-program measurement. If the spike passes, `argument_map` becomes one more sidecar + SR
  dossier view on machinery that already exists (crosswalk 2.2 rank 4 sized it M for exactly this
  reason); if it fails, the substrate was never wasted.

### 3.4 The spike, designed to be falsifiable

**Artifact.** `argument-map.json` sidecar emitted by a phase-subset Editor run (REQ-WF-13 pattern)
on the frozen draft: nodes = {thesis, claim (refs `claim.id` where one exists), premise,
assumption, objection, rebuttal}, each with an §11.3 `Anchor`; edges = {supports, attacks,
assumes}, each with a one-sentence warrant. No new table — the sidecar is the artifact
(REQ-SPEC-12 machinery), parsed only for the spike UI.

**Minimal UI.** One read-only dossier tab: indented outline (thesis at root, alternating
support/objection children), each node clicking through to its passage — explicitly *not* a canvas.
Mermaid rendering is a nice-to-have behind a toggle.

**Corpus.** The 3 real projects + ≥10 essays from the C1 eval corpus that carry professional-editor
annotation, spanning Essay and Op-ed protocols (the wedge genres — where the literature says the
construct is weakest, which is the honest test).

**Success criteria (all three required to graduate; any miss kills or descopes):**
1. **Extraction validity:** relation-level agreement with a professional annotator ≥ the human–human
   ceiling band for comparable genres (target κ ≥ 0.6 on support/attack against adjudicated
   annotation; report per-edge-type — attack edges will be the failure point per §3.1).
2. **Editorial lift (the one that matters):** map-informed reviews surface ≥ 1 material
   (major-or-blocking, editor-adjudicated-valid) finding per 2 essays that the standard dossier
   (claim ledger + discourse report + argument notes + rubric) missed — measured by diffing
   findings from paired reviews with/without the map phase, blind-adjudicated. If this fails, the
   graph is a visualization of what the Editor already knows, not an instrument, and it drops to a
   presentational option at most.
3. **Author recognition:** ≥ 70% of blinded authors judge the map "substantially true of my essay"
   (Likert ≥ 4/5) — the κ = 0.56 genre problem made operational.
4. **Kill criteria stated up front:** attack-edge precision < 0.5, or lift < 0.5 findings/2 essays,
   or recognition < 50% ⇒ do not build the object in any phase; keep the substrate.

**Cost.** ~12–15 annotated essays × (1 map run + 1 paired review) ≈ low hundreds of dollars of
inference at §6.2 Review pricing, plus ~2–3 annotator-days piggybacked on C1's editor budget
(Q-23), plus ~2–3 engineer-weeks (sidecar schema, one skill phase, one read-only view). Small
enough to run twice as models improve — which is the right shape, because §3.1's trendline (relation
F1 +5–7 points/year on the easiest corpus) says the capability may arrive; the spike is how Rhema
notices cheaply when it does.

### 3.5 Q-25: recommended answer

**Let B3's evidence decide the timing; do not fund it now as the product's soul.** The graph is a
plausible long-term moat (critique asset 10.4 extension) but is currently below the reliability
floor the product's trust posture requires, in exactly the genres of the wedge; the compounding
moat the evidence *does* support today is the obligation/lineage/preference graph of §1–§2 plus the
eval corpus — which is also the prerequisite the spike needs anyway. Positioning language ("IDE for
arguments") is a D3 question and does not require the object.

> **REQ-OBJ-15.** No `argument_map` artifact kind, table, or UI ships in MVP or 1.x. The v2 spike
> per §3.4 is the only sanctioned path to one, gated on the eval corpus (design/16) and on all
> three graduation criteria; kill criteria are binding. AC: the spike's protocol doc quotes the
> criteria before any run is paid for.
> **REQ-OBJ-16.** Substrate accrual is deliberate: anchors, `claim.sources[]` (REQ-OBJ-18),
> reverse outline, steelman/vulnerability map ship under their own justifications and their
> schemas must remain joinable by anchor + claim id (no orphan coordinate systems). AC: contract
> test that every structural sidecar uses §11.3 `Anchor` verbatim.

---

## 4. B4 — Evidence-relation audit

### 4.1 The comparison, verified

Critique §7 "Evidence relation": *support / contradict / contextualize / unverifiable* — four
labels, no enforcement stated, implicitly a source↔claim **edge** vocabulary. Spec (§11.3
`ClaimVerdict`): *verified · substantially_accurate · misleading_in_context · unsupported ·
contradicted · unverifiable* (+ `verified_against_user_source` under Memo) — seven **claim-level
verdicts**, enforced (cited ⇒ fetched fails delivery, REQ-VIS-9; `sourceCheck` downgrades
suspicious sources; sidecar schema validation; `humanAdded` claims enter as `unverifiable`
placeholders pending verification, REQ-DATA-25).

Mapping:

| Critique label | Spec coverage | Note |
|---|---|---|
| support | `verified`, `substantially_accurate`, `verified_against_user_source` | graded — the spec distinguishes exact from approximate support |
| contradict | `contradicted` | ✓ |
| unverifiable | `unverifiable` **and** `unsupported` | the spec splits "could not check" from "checked, found nothing" — a distinction the critique lacks and reviewers need |
| contextualize | `misleading_in_context` covers the *failure* direction only | the neutral/positive "this source contextualizes" has no home |

**The crosswalk's "spec exceeds" (7.5 CRITIQUE-WEAKER) verdict stands** — richer, enforced,
delivery-validated — with one precision the crosswalk missed: the two vocabularies live at
different levels. The critique's labels are per-source **edges**; the spec's are per-claim
**judgments**. They are complements, not competitors, and the honest deficit in the spec is not
vocabulary but arity: `Claim` carries **one** `url`/`accessedAt`/`note`. A claim checked against
one supporting and one contradicting source flattens to a single verdict plus prose — the
structured record loses exactly the information the verdict was derived from, and the transparency
floor ("every claim verdict with URL") under-reports multi-source checks the Editor actually
performed (they are in the fetch log, unjoined).

### 4.2 Normalization decision

**Do not change the verdict vocabulary.** Renaming or reducing to the critique's four labels buys
nothing (four unenforced labels replacing seven enforced ones), breaks the sidecar goldens, the
venue-table verdict caps (§6.7), and the Memo protocol's seventh value. The vocabulary is frozen as
the claim-level judgment; Appendix F should disposition critique §7 "Evidence relation" as
**rebut-in-part / adopt-in-part** with this section as rationale.

**Adopt the edge level underneath it — cost S, UI-invisible at MVP:**

```ts
// §11.3: Claim gains
sources?: Array<{ url: string; normalizedUrl: string; accessedAt: ISO;
  stance: 'supports' | 'contradicts' | 'contextualizes'; note?: string }>;
// url/normalizedUrl/accessedAt (singular) remain = sources[0] of the verdict-determining stance,
// so every existing surface, export appendix and REQ-VIS-9 check renders unchanged.
```

```sql
-- §11.4: rows, not jsonb, so the cited⇒fetched join stays mechanical
create table claim_sources (
  claim_id text not null references claims on delete cascade, ordinal int not null,
  url text not null, normalized_url text not null, accessed_at timestamptz not null,
  stance text not null check (stance in ('supports','contradicts','contextualizes')), note text,
  primary key (claim_id, ordinal));
create index on claim_sources (normalized_url);
```

What it buys (the test the ledger row sets): (a) multi-source checks stop losing information, and
the claim card's evidence popover can list all consulted sources with stances — transparency floor
strengthened, not just preserved; (b) REQ-VIS-9 extends mechanically — **every** `sources[].url`
must appear in the proxy fetch log, widening the cited⇒fetched guarantee to the whole evidence set;
(c) the eval program (design/16) can score evidence handling (did the review find the contradicting
source?) deterministically; (d) it is precisely the evidence substrate §3.4's spike needs, acquired
for free. The skill already fetches these URLs (they are in `fetch_log`); the change is emitting
them in the claim-ledger sidecar rather than flattening — an upstream sidecar-schema addition
inside the REQ-ARCH-5 budget.

**Also adopt `claim.kind` (crosswalk 7.3's cheap half); reject `confidence`.**
`kind: 'factual' | 'statistical' | 'quotation' | 'interpretive' | 'normative' | 'predictive'` — the
fact-check phase already decides checkability implicitly (it declines to verify normative claims);
making the decision a field buys scoped verification (Quick's 5-claim cap spends on checkable
claims only), honest ledger rendering ("interpretive — not a matter of verification" instead of a
confusing `unverifiable`), and per-genre ledger analytics, for one enum column. Graded
`confidence` is **rejected**: the categorical-verdict choice was deliberate, numeric confidence on
top of seven calibrated labels invites false precision, and it contradicts the product's
no-aggregate-scores philosophy (REQ-IDE-30). Tier (1–3 load-bearingness) already carries the
prioritization job.

> **REQ-OBJ-17.** The `ClaimVerdict` vocabulary is frozen as the claim-level judgment set; any
> future change is a protocol version bump, never a rename-in-place. AC: sidecar schema pins the
> enum; goldens fail on drift.
> **REQ-OBJ-18.** Claims carry `sources[]` edges (url, normalizedUrl, accessedAt, stance ∈
> supports/contradicts/contextualizes) as `claim_sources` rows emitted by the claim-ledger
> sidecar; singular `url` remains the verdict-determining source for unchanged surfaces. REQ-VIS-9
> amended: every `sources[].url` must appear in the run's proxy fetch log or delivery fails.
> AC: fixture with a two-source claim (support + contradict) round-trips and fails delivery when
> one URL is absent from the fetch log.
> **REQ-OBJ-19.** Claims carry `kind` (six values above); fact-check scopes fetch spend to
> checkable kinds ('factual','statistical','quotation'); non-checkable kinds render "not a matter
> of verification", never `unverifiable`. AC: Quick-notch fixture spends its 5-claim cap only on
> checkable claims.

---

## Ledger updates

| Row | Status | Evidence |
|---|---|---|
| B1 | done | §1: adopt for v0.3 confirmed; type + DDL (§1.2/§1.6), creation §1.3, discharge §1.4, lineage/REQ-WF-7/§6.8 §1.5, UI §1.7, +1.5–2.5 PM §1.8; REQ-OBJ-1…8 |
| B2 | done | §2: capture verified in DDL (§2.1); three-layer Editor firewall (§2.3); account-level profile, not Voice (§2.4); staging capture→1.x aggregates→2.0 priors (§2.5); Q-26 recommendation §2.6; REQ-OBJ-9…14 |
| B3 | done | §3: literature fetched 2026-09-01 (S&G CL 2017 κ=.635 claims/.71 relations; relation F1 61.1 in-genre SOTA, 33.96 CDCP; ACL 2025 generalizability 97% below in-domain mean; editorial κ=0.56; no writer-benefit study found) → MVP/1.x no, v2 falsifiable spike gated on eval corpus (§3.4); Q-25 recommendation §3.5; REQ-OBJ-15/16 |
| B4 | done | §4: "spec exceeds" verified with level distinction (edges vs judgments); verdict vocabulary frozen; adopt `claim_sources` stance edges + `claim.kind`, reject `confidence`; REQ-OBJ-17…19 |

Proposed new rows: **F1 amendments** — fold REQ-OBJ-1…19 into §11 (+§5.7/§5.8/§5.11/§6.8/§4.3,
REQ-WF-7/15, REQ-VIS-9, REQ-DATA-7, Appendix D) at v0.3 synthesis; **C1 linkage** — the eval corpus
should be annotated with the §3.4 spike in mind (argument-structure annotation optional add-on
priced into Q-23); **A-stream note** — none of §3's citations came from the critique; the critique's
"debate or vote" claim remains A4's problem.

## Open questions

1. **Q-25 (operator):** recommendation in §3.5 — evidence-led timing, spike gated on the C1 corpus;
   needs the operator's appetite confirmed only if they want the spike sooner (it would then need
   its own ~10-essay annotation budget, ~$2–4k of Q-23's envelope).
2. **Q-26 (operator):** recommendation in §2.6 — default-on account-local with opt-out; opt-in
   reserved for any future cross-account aggregation.
3. **Obligation matcher confidence floor** (§1.5 matcher 3): the quote-overlap threshold below
   which no auto-carry happens needs tuning on the three real projects before the fixture floors
   are set; ships behind matchers 1–2 if unstable. *Owner: A.*
4. **Deferral horizons vocabulary** (§1.4): `rounds 1–3 | next_review | pre_export` is chosen by
   reasoning; instrument which horizons users actually pick and prune. *Owner: P.*
5. **Per-voice preference overlays** (§2.4): deferred pending telemetry showing within-account
   divergence across voices; revisit at 2.0 scoping. *Owner: P.*
6. **`claim.kind` upstream cost** (§4.2): one more sidecar field is inside the REQ-ARCH-5 budget by
   this document's estimate; confirm during skill porting that the fact-check phase's implicit
   classification surfaces cleanly, else `kind` defaults to `factual` and the scoping benefit
   waits. *Owner: A.*
