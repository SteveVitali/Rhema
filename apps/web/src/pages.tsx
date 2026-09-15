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
  groupFindingsForList,
  detectReconciliationConflicts,
  collapsedRejected,
  summarizeReconciliation,
  claimUrlViews,
  fetchLogFromRows,
  type TrustChipLabels,
} from "@rhema/findings-core";
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

/** Auth-gated: the flat project view (the studio editing surface is P1.01). */
export function ProjectPage(): ReactNode {
  const { project } = usePageData();
  return (
    <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
      <SectionTitle>{project?.title ?? ""}</SectionTitle>
      {project ? <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{project.pill}</p> : null}
      <p style={{ color: "var(--shell-fg-faint)", fontSize: "13px", maxWidth: "68ch" }}>{COPY.project.betaNote}</p>
      {project ? (
        <p style={{ display: "flex", gap: "16px" }}>
          <a href={`/p/${project.slug}/import`}>{COPY.project.importCta}</a>
          <a href={`/p/${project.slug}/run`}>{COPY.runSheet.runReview}</a>
        </p>
      ) : null}
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
};

/** Auth-gated: the run sheet — the launcher for Review / Revise / Fact-check and the ONLY paywall (§5.6). */
export function RunSheetPage(): ReactNode {
  const { runSheet } = usePageData();
  const slug = runSheet?.slug ?? "";
  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{COPY.runSheet.backToProject}</a>} footer={footer()}>
      <SectionTitle>{COPY.runSheet.heading}</SectionTitle>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", maxWidth: "68ch" }}>{COPY.runSheet.lede}</p>
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

/** Auth-gated: the delivered-review dossier (run card, letter, claims, second read, rubric, findings). */
export function DossierPage(): ReactNode {
  const { dossier } = usePageData();
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
      </div>

      <div style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600 }}>{R.findingsHeading}</h2>
        <FindingsList groups={groups} conflicts={conflicts} collapsedRejected={rejected} labels={findingsLabels} />
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
