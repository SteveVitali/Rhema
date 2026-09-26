import type { ReactNode } from "react";
import {
  Shell,
  SectionTitle,
  ProjectList,
  DossierView,
  ConversionPreview,
  RunSheet,
  RunCard,
  LetterView,
  ClaimsTable,
  RubricView,
  SecondReadView,
  FindingsList,
  VersionObligationChip,
  DispositionControls,
  GateCard,
  TriageLedger,
  DecisionsList,
  WhatChangedView,
  RubricDelta,
  SourceEditor,
  type WhatChangedLabels,
  type SourceEditorLabels,
  type DispositionControlsLabels,
  type GateCardLabels,
  type TriageLedgerLabels,
  type DecisionsListLabels,
  type TriageLedgerRow,
  type DossierLabels,
  type RunSheetLabels,
  type RunCardLabels,
  type LetterViewLabels,
  type ClaimsTableLabels,
  type RubricLabels,
  type SecondReadLabels,
  type FindingsListLabels,
  type ClaimTableRow,
} from "@rhema/ui";
import {
  buildRunCardView,
  buildRubricView,
  buildTrustChip,
  buildGateCard,
  buildTriageQueue,
  pretriageSummary,
  groupFindingsForList,
  detectReconciliationConflicts,
  collapsedRejected,
  summarizeReconciliation,
  claimUrlViews,
  fetchLogFromRows,
  buildRubricDelta,
  type TrustChipLabels,
  type DoNothingOutcome,
} from "@rhema/findings-core";
import type { EditorDocDto, GateCardDto } from "@rhema/api-client";
import { CHECKABLE_CLAIM_KINDS, type ClaimKind } from "@rhema/contracts";
import { COPY } from "./copy.js";
import { SAMPLE_DOSSIER } from "./sample-dossier.js";
import { usePageData } from "./page-data.js";

/** Replace `{key}` placeholders in a copy template with string/number values. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// The beta's flat pages. Every string comes from COPY (lint-checked). Progressive enhancement: forms POST and
// links navigate — no client JS is required.

const dossierLabels: DossierLabels = {
  letterHeading: COPY.dossier.letterHeading,
  claimsHeading: COPY.dossier.claimsHeading,
  findingsHeading: COPY.dossier.findingsHeading,
  readOnlyNote: COPY.dossier.readOnlyNote,
  fetchedLabel: COPY.dossier.fetchedLabel,
  tierLabel: (t: number) => `Tier ${t}`,
  contradictedTierOneLabel: COPY.dossier.contradictedTierOneLabel,
};

function footer(): ReactNode {
  return <span>{COPY.footer}</span>;
}

/** Public: the invite page + the read-only sample dossier. No pricing, no plans, no public signup. */
export function InvitePage(): ReactNode {
  return (
    <Shell brand={COPY.brand} tagline={COPY.tagline} nav={<a href="/login">{COPY.invite.signInCta}</a>} footer={footer()}>
      <SectionTitle>{COPY.invite.heading}</SectionTitle>
      <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--shell-fg)", maxWidth: "68ch" }}>{COPY.invite.lede}</p>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{COPY.invite.accessNote}</p>

      <h2 style={{ fontSize: "16px", fontWeight: 600, marginTop: "32px" }}>{COPY.invite.sampleHeading}</h2>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", marginBottom: "16px", maxWidth: "68ch" }}>
        {COPY.invite.sampleLede}
      </p>
      <DossierView
        title={SAMPLE_DOSSIER.projectTitle}
        letter={SAMPLE_DOSSIER.letter}
        claims={SAMPLE_DOSSIER.claims}
        findings={SAMPLE_DOSSIER.findings}
        labels={dossierLabels}
      />
    </Shell>
  );
}

const fieldStyle = {
  display: "block",
  width: "100%",
  padding: "8px 10px",
  marginTop: "4px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
  fontSize: "14px",
  boxSizing: "border-box" as const,
};
const submitStyle = {
  width: "100%",
  padding: "9px 14px",
  borderRadius: "8px",
  border: "none",
  background: "var(--accent)",
  color: "var(--shell-bg)",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

/** The ONLY signup path: invitation code required (REQ-BETA-19). No public signup, no pricing. */
export function LoginPage(): ReactNode {
  const { login } = usePageData();
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <div style={{ maxWidth: "380px", margin: "0 auto" }}>
        <SectionTitle>{COPY.login.heading}</SectionTitle>
        <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{COPY.login.note}</p>

        {login?.error ? (
          <p role="alert" style={{ color: "var(--sev-blocking)", fontSize: "13px" }}>
            {login.error}
          </p>
        ) : null}
        {login?.sent ? (
          <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>
            {COPY.login.linkSent}
          </p>
        ) : null}

        <form method="post" action="/login">
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
            {COPY.login.codeLabel}
            <input name="code" required defaultValue={login?.code ?? ""} placeholder={COPY.login.codePlaceholder} style={fieldStyle} />
          </label>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "12px", display: "block" }}>
            {COPY.login.emailLabel}
            <input name="email" type="email" defaultValue={login?.email ?? ""} placeholder={COPY.login.emailPlaceholder} style={fieldStyle} />
          </label>
          <div style={{ marginTop: "16px" }}>
            <button type="submit" name="method" value="magic_link" style={submitStyle}>
              {COPY.login.continueEmail}
            </button>
          </div>
          <div style={{ textAlign: "center", color: "var(--shell-fg-faint)", fontSize: "12px", margin: "12px 0" }}>
            {COPY.login.orDivider}
          </div>
          <div>
            <button type="submit" name="method" value="google" style={{ ...submitStyle, background: "var(--shell-raised)", color: "var(--shell-fg)", border: "1px solid var(--shell-border)" }}>
              {COPY.login.continueGoogle}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}

/** Auth-gated: the project list, each row's pill + action derived from the §6.3 state function. */
export function ProjectsPage(): ReactNode {
  const { projects = [] } = usePageData();
  return (
    <Shell
      brand={COPY.brand}
      nav={
        <form method="post" action="/logout" style={{ margin: 0 }}>
          <button type="submit" style={{ background: "none", border: "none", color: "var(--shell-fg-muted)", cursor: "pointer", fontSize: "13px" }}>
            {COPY.projects.signOut}
          </button>
        </form>
      }
      footer={footer()}
    >
      <SectionTitle>{COPY.projects.heading}</SectionTitle>
      <ProjectList rows={projects} emptyLabel={COPY.projects.empty} />
    </Shell>
  );
}

/** Auth-gated: the flat project view (the studio editing surface is P1.01) + the Needs-you gate cards
 *  and the Decisions list (PRB.05 — the beta Inbox stand-in, §5.7/§6.4). */
export function ProjectPage(): ReactNode {
  const { project, gates = [], decisions = [], approvalOverrides = {}, compact, triage } = usePageData();
  const slug = project?.slug ?? "";
  const triageOptedIn = typeof approvalOverrides.approve_triage === "number";
  return (
    <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
      <SectionTitle>{project?.title ?? ""}</SectionTitle>
      {project ? <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{project.pill}</p> : null}
      <p style={{ color: "var(--shell-fg-faint)", fontSize: "13px", maxWidth: "68ch" }}>{COPY.project.betaNote}</p>
      {project ? (
        <p style={{ display: "flex", gap: "16px" }}>
          <a href={`/p/${slug}/import`}>{COPY.project.importCta}</a>
          <a href={`/p/${slug}/run`}>{COPY.runSheet.runReview}</a>
          {project.headDraftId ? (
            <a data-edit-source="true" href={`/p/${slug}/edit/${project.headDraftId}`}>
              {COPY.project.editCta}
            </a>
          ) : null}
        </p>
      ) : null}
      {gates.length > 0 ? (
        <section data-needs-you="true" style={{ marginTop: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 10px" }}>
            {COPY.gates.heading}
          </h2>
          {gates.map((g) => gateCardFor(g, slug, compact ?? false, triage?.dispositionError))}
        </section>
      ) : null}
      {/* §6.4 R3 — the per-project approve_triage 24-h opt-in (waits by default). */}
      {project ? (
        <form
          method="post"
          action={`/p/${slug}/approval-overrides`}
          data-approval-opt-in="true"
          style={{ marginTop: "20px", padding: "10px 14px", border: "1px solid var(--shell-border)", borderRadius: "8px", maxWidth: "68ch" }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 6px" }}>
            {COPY.gates.optInHeading}
          </h2>
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--shell-fg-muted)" }}>
            <input type="checkbox" name="approve_triage_24h" defaultChecked={triageOptedIn} />
            {COPY.gates.optInLabel}
          </label>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 8px" }}>{COPY.gates.optInNote}</p>
          <button type="submit" style={{ fontSize: "12px" }}>{COPY.gates.optInSave}</button>
        </form>
      ) : null}
      <div style={{ marginTop: "20px" }}>
        <DecisionsList
          items={decisions.map((d) => ({
            id: d.id,
            projectId: d.projectId,
            obligationId: d.obligationId,
            text: d.text,
            options: d.options,
            createdAt: d.createdAt,
          }))}
          formActionFor={(id) => `/p/${slug}/decisions/${id}`}
          labels={decisionsLabels}
        />
      </div>
    </Shell>
  );
}

const textAreaStyle = {
  display: "block",
  width: "100%",
  minHeight: "160px",
  marginTop: "4px",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
  fontSize: "13px",
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  boxSizing: "border-box" as const,
};

/** Auth-gated: the §5.3 upload → conversion-preview → create flow (step 1 of the beta loop). */
export function ImportPage(): ReactNode {
  const { project } = usePageData();
  const slug = project?.slug ?? "";
  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{COPY.project.backToList}</a>} footer={footer()}>
      <SectionTitle>{COPY.import.heading}</SectionTitle>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", maxWidth: "68ch" }}>{COPY.import.lede}</p>
      <form method="post" action={`/p/${slug}/import/preview`} encType="multipart/form-data">
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block" }}>
          {COPY.import.fileLabel}
          <input type="file" name="file" accept=".md,.txt,.html,.docx,.pdf" style={{ display: "block", marginTop: "4px", color: "var(--shell-fg)" }} />
        </label>
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "16px" }}>
          {COPY.import.pasteLabel}
          <textarea name="paste" style={textAreaStyle} />
        </label>
        <div style={{ marginTop: "16px" }}>
          <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
            {COPY.import.convertCta}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/** Auth-gated: the conversion preview (source beside converted, count line, warnings, two actions). */
export function ImportPreviewPage(): ReactNode {
  const { conversion } = usePageData();
  const slug = conversion?.projectSlug ?? "";
  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{COPY.project.backToList}</a>} footer={footer()}>
      <SectionTitle>{COPY.import.previewHeading}</SectionTitle>
      {conversion?.created ? (
        <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>
          {COPY.import.created}
        </p>
      ) : null}
      {conversion ? (
        <ConversionPreview
          sourceLabel={conversion.sourceLabel}
          sourceText={conversion.sourceText}
          convertedMarkdown={conversion.convertedMarkdown}
          countLine={conversion.countLine}
          warnings={conversion.warnings}
          actions={{
            formAction: `/p/${slug}/import/create`,
            createLabel: COPY.import.createLabel,
            fixNowLabel: COPY.import.fixNowLabel,
          }}
          labels={{
            sourceHeading: COPY.import.sourceHeading,
            convertedHeading: COPY.import.convertedHeading,
            warningsHeading: COPY.import.warningsHeading,
            noWarnings: COPY.import.noWarnings,
            fixNowNote: COPY.import.fixNowNote,
          }}
        />
      ) : null}
    </Shell>
  );
}

const runLabelFor: Record<string, string> = {
  review: COPY.runSheet.runReview,
  revise: COPY.runSheet.runRevise,
  fact_check: COPY.runSheet.runFactCheck,
};

const runSheetLabels: RunSheetLabels = {
  rigorLegend: COPY.runSheet.rigorLegend,
  runLabel: COPY.runSheet.runReview,
  confirmLabel: COPY.runSheet.confirm,
  askLabel: COPY.runSheet.ask,
  changeLabel: COPY.runSheet.change,
  whyPrefix: COPY.runSheet.why,
  advancedLegend: COPY.runSheet.advanced,
  toggleLabels: {
    fact_check: COPY.runSheet.factCheckToggle,
    discourse: COPY.runSheet.discourseToggle,
    second_read: COPY.runSheet.secondReadToggle,
    repair_research: COPY.runSheet.repairResearchToggle,
    gap_check: COPY.runSheet.gapCheckToggle,
  },
  buyCreditsLabel: COPY.runSheet.buyCredits,
  suspendedNotice: COPY.runSheet.suspended,
  planOffer: { text: COPY.runSheet.planOffer, linkLabel: COPY.runSheet.planOfferLink },
};

/** Auth-gated: the run sheet — the launcher for Review / Revise / Fact-check and the ONLY paywall (§5.6). */
export function RunSheetPage(): ReactNode {
  const { runSheet, pretriage } = usePageData();
  const slug = runSheet?.slug ?? "";
  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{COPY.runSheet.backToProject}</a>} footer={footer()}>
      <SectionTitle>{COPY.runSheet.heading}</SectionTitle>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", maxWidth: "68ch" }}>{COPY.runSheet.lede}</p>
      {pretriage && runSheet?.view.workflow === "revise" ? (
        <p data-pretriage-line="true" style={{ color: "var(--shell-fg-muted)", fontSize: "13px", marginTop: "8px" }}>
          {fmt(COPY.triage.pretriageFmt, { n: pretriage.triaged, m: pretriage.total })}
        </p>
      ) : null}
      {runSheet?.started ? (
        <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>
          {COPY.runSheet.started}
        </p>
      ) : null}
      {runSheet?.notice ? (
        <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>
          {runSheet.notice}
        </p>
      ) : null}
      {runSheet ? (
        <RunSheet
          view={runSheet.view}
          labels={{ ...runSheetLabels, runLabel: runLabelFor[runSheet.view.workflow] ?? COPY.runSheet.runReview }}
          runAction={`/p/${slug}/run`}
          exhaustedAction={`/p/${slug}/exhausted`}
        />
      ) : null}
    </Shell>
  );
}

// ---- the delivered-review dossier reading surface (PRB.04, §5.5/§5.7/§6.6) ----

const R = COPY.review;

const runCardLabels: RunCardLabels = {
  phaseLabel: (k) => R.phaseLabel[k] ?? k,
  stateLabel: (s) => R.runStateLabel[s] ?? s,
  creditsLabel: (spent, cap) => `${spent.toLocaleString("en-US")} / ${cap.toLocaleString("en-US")} cr`,
  etaLabel: (lo, hi) => `~${lo}–${hi} min`,
  offLabel: R.offLabel,
  counterLabel: (_key, value, of) => (of != null ? `${value} / ${of}` : String(value)),
  refundLabel: (credits) => fmt(R.refundFmt, { n: credits }),
};

const letterLabels: LetterViewLabels = {
  tocHeading: R.letterTocHeading,
  attestationHeading: R.attestationHeading,
};

const trustLabels: TrustChipLabels = {
  boundary: R.trust.boundary,
  fetched: R.trust.fetchedFmt,
  secondRead: R.trust.secondRead,
  blockedOne: R.trust.blockedOne,
  blockedMany: R.trust.blockedMany,
};

const claimsLabels: ClaimsTableLabels = {
  heading: R.claimsHeading,
  tierLabel: (t) => `Tier ${t}`,
  fetchedLabel: R.fetchedLabel,
  stanceLabel: (s) => R.stanceLabel[s] ?? s,
  notCheckableLabel: (k) => (k ? fmt(R.notCheckableFmt, { kind: R.kindNounLabel[k] ?? k }) : ""),
  accessedLabel: (a) => a.slice(0, 10),
  contradictedTierOneLabel: R.contradictedTierOneLabel,
};

const rubricLabels: RubricLabels = {
  heading: R.rubricHeading,
  dimensionLabel: (d) => R.dimensionLabel[d] ?? d,
  capLabel: (c) => fmt(R.capFmt, { at: c.at, reason: c.reason }),
};

const secondReadLabels: SecondReadLabels = {
  heading: R.secondReadHeading,
  corroboratedLabel: (n) => fmt(R.corroboratedFmt, { n }),
  secondReadOnlyLabel: (n) => fmt(R.secondReadOnlyFmt, { n }),
  rejectedHeading: R.rejectedHeading,
  promoteLabel: R.promoteLabel,
  emptyRejectedLabel: R.emptyRejected,
};

const findingsLabels: FindingsListLabels = {
  kindLabel: (k) => R.findingKindLabel[k] ?? k,
  severityLabel: (s) => R.severityLabel[s] ?? s,
  provisionalLabel: R.provisionalLabel,
  dispositionLabel: (kind, applied) =>
    applied ? R.appliedLabel : fmt(R.disposedFmt, { verb: R.dispositionPast[kind] ?? kind }),
  conflictLine: (kind) => fmt(R.conflictLineFmt, { verb: R.dispositionPast[kind] ?? kind }),
  conflictsHeading: R.conflictsHeading,
  rejectedHeading: R.rejectedHeading,
  promoteLabel: R.promoteLabel,
};

function checkable(kind: string | undefined): boolean {
  return kind == null || CHECKABLE_CLAIM_KINDS.includes(kind as ClaimKind);
}

// ---- PRB.05 — the triage write surfaces (§5.7/§6.4/§10.1) ----

const T = COPY.triage;
const G = COPY.gates;

const dispositionLabels: DispositionControlsLabels = {
  verbLabel: (verb) => T.verbLabel[verb] ?? verb,
  noteLabel: T.noteLabel,
  notePlaceholder: T.notePlaceholder,
  reasonLegend: T.reasonLegend,
  reasonLabel: (code) => T.reasonLabel[code] ?? code,
  adaptLabel: T.adaptLabel,
  appliedNote: T.appliedNote,
};

const gateCardLabels: GateCardLabels = {
  kindLabel: (kind) => G.kindLabel[kind] ?? kind,
  approveLabel: (kind) => (kind === "approve_triage" ? G.approveLabel.approve_triage : G.approveLabel.default),
  approveAutonomousLabel: G.approveAutonomousLabel,
  keepPlanningLabel: G.keepPlanningLabel,
  waitLabel: G.waitLabel,
  stopLabel: G.stopLabel,
  waitingLine: G.waitingLine,
  deadlineLine: (absolute, remaining) => fmt(G.deadlineFmt, { absolute, remaining }),
  expiredLine: G.expiredLine,
  doNothingLine: (outcome: DoNothingOutcome) => G.doNothingLine[outcome],
  spendLine: (spent, cap, remaining) =>
    fmt(G.spendFmt, {
      spent: spent.toLocaleString("en-US"),
      cap: cap.toLocaleString("en-US"),
      remaining: remaining != null ? fmt(G.remainingFmt, { n: remaining.toLocaleString("en-US") }) : "",
    }),
  presenceLine: (countdown) => fmt(G.presenceFmt, { countdown }),
  pausedNote: G.pausedNote,
  heldLine: G.heldLine,
  guidanceLabel: G.guidanceLabel,
  standingLabel: G.standingLabel,
  informationalNote: G.informationalNote,
  escalationNote: G.escalationNote,
};

const triageLedgerLabels: TriageLedgerLabels = {
  dispositionLabel: (kind) => (kind ? T.verbLabel[kind] ?? kind : G.undecidedLabel),
  userActorLabel: G.userActorLabel,
  severityLabel: (s) => R.severityLabel[s] ?? s,
};

const decisionsLabels: DecisionsListLabels = {
  heading: COPY.decisions.heading,
  emptyLabel: COPY.decisions.empty,
  optionLabel: (option) => COPY.decisions.optionLabel[option] ?? option,
};

/** The per-finding disposition control (§5.7) — the same component desktop + phone (REQ-SPEC-20). */
function dispositionControlsFor(
  view: { id: string; provisional: boolean; suggestion?: { replacement: string } | null; disposition?: { kind: string; rationale?: string; adaptedText?: string; reasonCode?: string } | null },
  slug: string,
  runId: string,
  compact: boolean,
  error: { findingId: string; message: string } | undefined,
): ReactNode {
  return (
    <DispositionControls
      formAction={`/p/${slug}/review/${runId}/findings/${view.id}/disposition`}
      compact={compact}
      labels={dispositionLabels}
      suggestion={view.suggestion?.replacement ?? null}
      {...(view.disposition
        ? {
            current: {
              kind: view.disposition.kind as "accept" | "adapt" | "rebut" | "defer" | "escalate",
              ...(view.disposition.rationale != null ? { rationale: view.disposition.rationale } : {}),
              ...(view.disposition.adaptedText != null ? { adaptedText: view.disposition.adaptedText } : {}),
              ...(view.disposition.reasonCode != null
                ? { reasonCode: view.disposition.reasonCode as "wrong" }
                : {}),
            },
          }
        : {})}
      {...(error && error.findingId === view.id ? { error: error.message } : {})}
    />
  );
}

/** A gate card model for the Needs-you surface (§6.4) — built from the api's GateCardDto. */
function gateCardFor(
  gate: GateCardDto,
  slug: string,
  compact: boolean,
  error?: { findingId: string; message: string },
): ReactNode {
  const model = buildGateCard(
    {
      kind: gate.kind as Parameters<typeof buildGateCard>[0]["kind"],
      onExpiry: gate.onExpiry as Parameters<typeof buildGateCard>[0]["onExpiry"],
      blocking: gate.blocking,
      held: gate.held,
      openedAt: gate.openedAt,
      deadlineAt: gate.deadlineAt ?? null,
      presenceDeadlineAt: gate.presenceDeadlineAt ?? null,
      pausedWhileReading: gate.pausedWhileReading,
      spentCredits: gate.spentCredits,
      capCredits: gate.capCredits,
      remainingEstimateCredits: gate.remainingEstimateCredits ?? null,
    },
    new Date(),
    compact ? "phone" : "full",
  );
  const rows: TriageLedgerRow[] | undefined = gate.triage?.rows.map((r) => ({
    findingId: r.findingId,
    ordinal: r.ordinal,
    title: r.title,
    severity: r.severity,
    ...(r.disposition != null
      ? {
          disposition: {
            kind: r.disposition.kind,
            ...(r.disposition.rationale != null ? { rationale: r.disposition.rationale } : {}),
            ...(r.disposition.actor != null ? { actor: r.disposition.actor } : {}),
          },
        }
      : {}),
  }));
  const hasEscalations = rows?.some((r) => r.disposition?.kind === "escalate") ?? false;
  return (
    <GateCard
      key={gate.id}
      model={model}
      compact={compact}
      formAction={`/p/${slug}/gates/${gate.id}`}
      activityUrl={`/p/${slug}/gates/${gate.id}/activity`}
      labels={gateCardLabels}
      {...(gate.artifactTitle != null ? { artifact: { title: gate.artifactTitle } } : {})}
      hasEscalations={hasEscalations}
    >
      {rows != null ? (
        <TriageLedger
          rows={rows}
          labels={triageLedgerLabels}
          children={(row) => (
            // the per-row override — the same disposition control the dossier uses (REQ-SPEC-20).
            <DispositionControls
              formAction={`/p/${slug}/findings/${row.findingId}/disposition`}
              next={`/p/${slug}`}
              compact
              labels={dispositionLabels}
              {...(error && error.findingId === row.findingId ? { error: error.message } : {})}
              {...(row.disposition
                ? {
                    current: {
                      kind: row.disposition.kind as "accept" | "adapt" | "rebut" | "defer" | "escalate",
                      ...(row.disposition.rationale != null ? { rationale: row.disposition.rationale } : {}),
                    },
                  }
                : {})}
            />
          )}
        />
      ) : undefined}
    </GateCard>
  );
}

/** Auth-gated: the delivered-review dossier (run card, letter, claims, second read, rubric, findings)
 *  with the §5.7 disposition controls on every finalized finding (PRB.05). */
export function DossierPage(): ReactNode {
  const { dossier, triage, compact } = usePageData();
  if (!dossier) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <SectionTitle>{R.heading}</SectionTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{R.notReviewed}</p>
      </Shell>
    );
  }

  const fetchLog = fetchLogFromRows(dossier.fetchLog.map((normalizedUrl) => ({ normalizedUrl })));
  const claimRows: ClaimTableRow[] = dossier.claims.map((c) => ({
    ordinal: c.ordinal,
    text: c.text,
    tier: c.tier,
    verdict: c.verdict,
    verdictLabel: R.verdictLabel[c.verdict] ?? c.verdict,
    ...(c.kind ? { kind: c.kind } : {}),
    checkable: checkable(c.kind),
    ...(c.note ? { note: c.note } : {}),
    urls: claimUrlViews(c, fetchLog),
  }));

  const trustChip = buildTrustChip(dossier.accessReport, trustLabels);
  const groups = groupFindingsForList([...dossier.findings]);
  const conflicts = detectReconciliationConflicts([...dossier.findings]);
  const rejected = collapsedRejected([...dossier.findings]);
  const reconciliation = summarizeReconciliation([...dossier.findings]);

  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${dossier.slug}`}>{R.backToProject}</a>} footer={footer()}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <SectionTitle>{dossier.projectTitle}</SectionTitle>
        <span style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{dossier.versionLabel}</span>
        <VersionObligationChip
          open={dossier.openObligations}
          addressed={dossier.addressedObligations}
          label={fmt(R.obligationSummaryFmt, { open: dossier.openObligations, addressed: dossier.addressedObligations })}
        />
      </div>

      <div style={{ margin: "16px 0" }}>
        <RunCard view={buildRunCardView(dossier.runCard)} labels={runCardLabels} />
      </div>

      <div style={{ margin: "16px 0" }}>
        <LetterView title={dossier.letterTitle} sections={dossier.letterSections} trustChip={trustChip} labels={letterLabels} />
      </div>

      <div style={{ margin: "16px 0" }}>
        <ClaimsTable rows={claimRows} labels={claimsLabels} />
      </div>

      <div style={{ margin: "16px 0" }}>
        <SecondReadView summary={reconciliation} rejected={rejected} labels={secondReadLabels} />
      </div>

      <div style={{ margin: "16px 0" }}>
        <RubricView view={buildRubricView([...dossier.rubric])} labels={rubricLabels} />
        {/* PRB.06 — a re-review dossier carries the prior round's rubric: the round-summary delta renders
            per-dimension before/after, never an aggregate (REQ-IDE-30). */}
        {dossier.priorRubric ? (
          <div style={{ marginTop: "12px" }}>
            <RubricDelta
              view={buildRubricDelta([...dossier.priorRubric], [...dossier.rubric])}
              labels={{
                heading: COPY.revision.rubricDeltaHeading,
                dimensionLabel: (d) => COPY.review.dimensionLabel[d] ?? d,
                beforeLabel: COPY.revision.rubricBeforeLabel,
                afterLabel: COPY.revision.rubricAfterLabel,
              }}
            />
          </div>
        ) : null}
      </div>

      <div style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600 }}>{R.findingsHeading}</h2>
        {/* pre-triage line (REQ-IDE-28) + the >30-findings triage promo (§5.7). */}
        {(() => {
          const summary = pretriageSummary([...dossier.findings]);
          const queue = buildTriageQueue([...dossier.findings]);
          return (
            <>
              {summary.triaged > 0 ? (
                <p data-pretriage-line="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "4px 0 10px" }}>
                  {fmt(COPY.triage.pretriageFmt, { n: summary.triaged, m: summary.total })}
                </p>
              ) : null}
              {queue.promoteAgentTriage ? (
                <p data-triage-promo="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 10px" }}>
                  {fmt(COPY.triage.promoFmt, { n: 30 })}
                </p>
              ) : null}
            </>
          );
        })()}
        <FindingsList
          groups={groups}
          conflicts={conflicts}
          collapsedRejected={rejected}
          labels={findingsLabels}
          controlsFor={(view) =>
            dispositionControlsFor(view, dossier.slug, dossier.runId, compact ?? false, triage?.dispositionError)
          }
        />
        {triage?.savedFindingId ? (
          <p data-disposition-saved="true" style={{ fontSize: "12px", color: "var(--state-ready)", marginTop: "6px" }}>
            {COPY.triage.savedLabel}
          </p>
        ) : null}
      </div>
    </Shell>
  );
}

export function NotFoundPage(): ReactNode {
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <SectionTitle>{COPY.notFound.heading}</SectionTitle>
      <p style={{ color: "var(--shell-fg-muted)" }}>{COPY.notFound.body}</p>
      <p>
        <a href="/">{COPY.notFound.home}</a>
      </p>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// PRB.06 — the What-changed page (§5.8). Server-rendered, read-only apart from the hunk comment forms
// (each POSTs to /p/:slug/revisions/:cid/hunks/:hunkId/comments → a Guidance row for the next Revise).
// ---------------------------------------------------------------------------------------------------------------------

const V = COPY.revision;

const whatChangedLabels: WhatChangedLabels = {
  heading: V.heading,
  versionLabel: (beforeN, afterN) =>
    fmt(V.versionFmt, { before: beforeN, after: afterN ?? beforeN + 1 }),
  stripLabel: (s) =>
    `${fmt(V.stripFmt, { addressed: s.addressed, rebutted: s.rebutted, stillOpen: s.stillOpen })} · ${fmt(V.movesFmt, { moves: s.moves, hunks: s.hunks })}`,
  moveHeading: (m) => fmt(V.moveHeadingFmt, { ordinal: m.moveOrdinal, title: m.title }),
  findingLine: (f) =>
    fmt(V.findingLineFmt, { ordinal: String(f.findingOrdinal).padStart(2, "0"), kind: f.kind }),
  dischargeLine: (l) =>
    l.verifiedBy
      ? fmt(V.dischargeVerifiedFmt, { label: l.label, lineage: l.lineage ?? "", by: V.verifiedByLabel[l.verifiedBy] ?? l.verifiedBy })
      : fmt(V.dischargePlainFmt, { label: l.label, lineage: l.lineage ?? "", state: l.state }),
  hunkKindLabel: (kind) => V.hunkKindLabel[kind] ?? kind,
  unlinkedHeading: V.unlinkedHeading,
  rebuttedHeading: V.rebuttedHeading,
  rebutLabel: V.rebutLabel,
  commentLabel: V.commentLabel,
  commentPlaceholder: V.commentPlaceholder,
  commentSubmit: V.commentSubmit,
};

/** Auth-gated: the What-changed page for a delivered response (`/p/:slug/revisions/:cid`). */
export function RevisionPage(): ReactNode {
  const { revision } = usePageData();
  if (!revision) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <SectionTitle>{V.heading}</SectionTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{V.notFound}</p>
      </Shell>
    );
  }
  const { slug, data } = revision;
  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{COPY.review.backToProject}</a>} footer={footer()}>
      <WhatChangedView
        // the wire shape is the findings-core view model modulo `unlinked.entries` being unknown[].
        view={data.view as unknown as Parameters<typeof WhatChangedView>[0]["view"]}
        beforeN={data.beforeN}
        afterN={data.afterN}
        commentFormAction={(hunkId) => `/p/${slug}/revisions/${data.responseId}/hunks/${hunkId}/comments`}
        labels={whatChangedLabels}
      />
      {revision.commentedHunkId ? (
        <p data-comment-saved="true" style={{ fontSize: "12px", color: "var(--state-ready)" }}>
          {V.commentSavedLabel}
        </p>
      ) : null}
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// PRB.07 — the source editor (§5.4/§6.3; REQ-BETA-21 stopgap #1 → 1.x Source mode). SSRs the CodeMirror host
// + the §6.3 lock banner + the projected findings rail; the client bundle upgrades the textarea and runs the
// debounced autosave. There is no Save button and no unsaved-changes dialog anywhere on this page.
// ---------------------------------------------------------------------------------------------------------------------

const E = COPY.editor;

const editorLabels: SourceEditorLabels = {
  versionLabel: (n, baseN) =>
    baseN != null ? fmt(E.versionForkFmt, { n, base: baseN }) : fmt(E.versionFmt, { n }),
  writerLockText: (workflow) => fmt(E.writerLockFmt, { workflow }),
  readerLockText: (workflow) => fmt(E.readerLockFmt, { workflow }),
  cancelRun: E.cancelRun,
  sync: { synced: E.sync.synced, syncing: E.sync.syncing, queued: E.sync.queued, locked: E.sync.locked },
  findingsHeading: E.findingsHeading,
  wholePiece: E.wholePiece,
  lostNote: E.lostNote,
  noteLabel: E.noteLabel,
  notePlaceholder: E.notePlaceholder,
  noteSubmit: E.noteSubmit,
  noteSaved: E.noteSaved,
  revise: E.revise,
};

export function EditorPage(): ReactNode {
  const { editor } = usePageData();
  if (!editor) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <SectionTitle>{E.notFound}</SectionTitle>
      </Shell>
    );
  }
  const { slug, doc } = editor;
  const base = `/p/${slug}/edit/${doc.draftId}`;
  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{COPY.review.backToProject}</a>} footer={footer()}>
      <SourceEditor
        markdown={doc.markdown}
        draftId={doc.draftId}
        draftN={doc.draftN}
        baseDraftN={doc.baseDraftN}
        origin={doc.origin}
        lock={doc.lock}
        findings={doc.findings.map((f) => ({
          findingId: f.findingId,
          title: f.title,
          severity: f.severity,
          sourceLabel: f.sourceLabel,
          quote: anchorQuote(f),
          lost: f.lost,
        }))}
        saveUrl={`${base}/save`}
        docUrl={`${base}/doc`}
        noteUrl={`${base}/note`}
        cancelUrl={`${base}/cancel-run`}
        reviseUrl={`${base}/revise`}
        noteSaved={editor.noteSaved}
        labels={editorLabels}
      />
    </Shell>
  );
}

/** The projected finding's display quote — null when the anchor is unanchored (Whole piece) or lost. */
function anchorQuote(f: EditorDocDto["findings"][number]): string | null {
  const a = f.anchor as { quote?: string; unanchored?: true } | null | undefined;
  if (!a || a.unanchored || !a.quote) return null;
  return a.quote;
}
