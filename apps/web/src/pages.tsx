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
  BalanceChip,
  DispositionControls,
  GateCard,
  TriageLedger,
  DecisionsList,
  WhatChangedView,
  RubricDelta,
  SourceEditor,
  PageEditor,
  IdeShell,
  EmptyProject,
  type WhatChangedLabels,
  type SourceEditorLabels,
  type PageEditorLabels,
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
import type { EditorDocDto, GateCardDto, VoiceStatusDto } from "@rhema/api-client";
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

/**
 * P1.01 — the §5.1 IDE frame every `/p/:project…` route renders inside (REQ-IDE-8): Rail / Files / Page /
 * Margin / Timeline / Desk / Status bar. The frame is SSR-static + attribute-driven; the ide.js island
 * adds the pane toggles, drag handles, View/theme menus, and ⌘ shortcuts on top. `data.ide` in PageData
 * marks the document (renderDocument emits the pane stylesheet + the deferred island script). The Page
 * content sits on the `.paper` sheet, which remaps --shell-* to the paper palette so existing components
 * theme correctly inside a pinned-light or pinned-dark sheet.
 */
export function IdeFrame({ children }: { children: ReactNode }): ReactNode {
  const data = usePageData();
  const ide = data.ide ?? {};
  const slug = data.project?.slug ?? "";
  return (
    <IdeShell
      project={{ slug, title: data.project?.title ?? "", ...(data.project?.pill ? { pill: data.project.pill } : {}) }}
      {...(ide.userId ? { userId: ide.userId } : {})}
      {...(ide.projectId ? { projectId: ide.projectId } : {})}
      {...(data.paperTheme ? { paperTheme: data.paperTheme } : {})}
      {...(data.theme?.pref ? { appTheme: data.theme.pref } : {})}
      {...(ide.initialView ? { initialView: ide.initialView } : {})}
      {...(ide.sourceHref ? { sourceHref: ide.sourceHref } : {})}
      {...(ide.findings ? { findings: ide.findings, hasFindings: true } : {})}
      {...(ide.timeline ? { timeline: ide.timeline } : {})}
      {...(ide.activeRun ? { activeRun: ide.activeRun } : {})}
      {...(ide.inboxCount != null ? { inboxCount: ide.inboxCount } : {})}
      {...(ide.status ? { status: ide.status } : {})}
      {...(ide.themeUrl ? { themeUrl: ide.themeUrl } : {})}
      {...(ide.paperThemeUrl ? { paperThemeUrl: ide.paperThemeUrl } : {})}
      labels={{
        ...COPY.ide,
        viewMenu: { ...COPY.ide.viewMenu, advanced: COPY.runSheet.advanced },
      }}
    >
      {children}
    </IdeShell>
  );
}

/** Public: the landing page + the read-only sample dossier. Invite-only in `invite` mode, self-serve in
 *  `open` (PRB.13, REQ-BETA-19 amended) — still not a marketing page either way: no pricing, no plans. */
export function InvitePage(): ReactNode {
  const { invite } = usePageData();
  const open = invite?.signupOpen === true;
  return (
    <Shell brand={COPY.brand} tagline={COPY.tagline} nav={<a href="/login">{open ? COPY.invite.signInCtaOpen : COPY.invite.signInCta}</a>} footer={footer()}>
      <SectionTitle>{COPY.invite.heading}</SectionTitle>
      <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--shell-fg)", maxWidth: "68ch" }}>{COPY.invite.lede}</p>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{open ? COPY.invite.accessNoteOpen : COPY.invite.accessNote}</p>

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

/** The ONLY signup path: the invitation code is required in `invite` mode and optional in `open`
 *  (PRB.13, REQ-BETA-19 amended — enforced server-side at POST /login, never by the form alone).
 *  No pricing page, no plan ladder either way. */
export function LoginPage(): ReactNode {
  const { login } = usePageData();
  const open = login?.signupOpen === true;
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <div style={{ maxWidth: "380px", margin: "0 auto" }}>
        <SectionTitle>{COPY.login.heading}</SectionTitle>
        <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{open ? COPY.login.noteOpen : COPY.login.note}</p>

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
            {open ? COPY.login.codeLabelOptional : COPY.login.codeLabel}
            <input name="code" required={!open} defaultValue={login?.code ?? ""} placeholder={COPY.login.codePlaceholder} style={fieldStyle} />
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
  const { projects = [], balance } = usePageData();
  return (
    <Shell
      brand={COPY.brand}
      nav={
        <span style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          {/* PRB.12 — the §14.5 level-0 balance chip (held rides the tooltip). */}
          {balance ? (
            <BalanceChip
              spendableCredits={balance.spendableCredits}
              heldCredits={balance.heldCredits}
              label={fmt(COPY.balance.labelFmt, { n: balance.spendableCredits.toLocaleString() })}
              heldTitle={fmt(COPY.balance.heldTitleFmt, { n: balance.heldCredits.toLocaleString() })}
            />
          ) : null}
          <a href="/voices" style={{ fontSize: "13px" }}>{COPY.voice.nav}</a>
          <a href="/settings" style={{ fontSize: "13px" }}>{COPY.settings.nav}</a>
          <form method="post" action="/logout" style={{ margin: 0 }}>
            <button type="submit" style={{ background: "none", border: "none", color: "var(--shell-fg-muted)", cursor: "pointer", fontSize: "13px" }}>
              {COPY.projects.signOut}
            </button>
          </form>
        </span>
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
  const { project, gates = [], decisions = [], approvalOverrides = {}, compact, triage, projectVoice, page } = usePageData();
  const slug = project?.slug ?? "";
  const triageOptedIn = typeof approvalOverrides.approve_triage === "number";
  return (
    <IdeFrame>
      {/* P1.01 — the project overview IS the IDE's Page surface. An empty project (no draft head) renders
          the §5.9 empty-project state: three entry cards + the quiet serif title field. P1.02 item 12 —
          a project WITH a working head opens the Page on it; the overview affordances stay below. */}
      {project && !project.headDraftId ? (
        <EmptyProject
          labels={{
            titlePlaceholder: COPY.ide.emptyProject.titlePlaceholder,
            cards: COPY.ide.emptyProject.cards,
          }}
          paths={[`/p/${slug}/import`, `/p/${slug}/import`, `/p/${slug}/run`]}
        />
      ) : null}
      <SectionTitle>{project?.title ?? ""}</SectionTitle>
      {project ? <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{project.pill}</p> : null}
      {project ? (
        <p style={{ display: "flex", gap: "16px" }}>
          <a href={`/p/${slug}/import`}>{COPY.project.importCta}</a>
          <a href={`/p/${slug}/run`}>{COPY.runSheet.runReview}</a>
          <a href={`/p/${slug}/export`}>{COPY.project.exportCta}</a>
          {project.headDraftId ? (
            <a data-edit-source="true" href={`/p/${slug}/v/working`}>
              {COPY.project.editCta}
            </a>
          ) : null}
        </p>
      ) : null}
      {page ? (
        <div data-page-mount="working" style={{ marginTop: "12px" }}>
          <PageSurface />
        </div>
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
      {/* PRB.10 — the project voice picker (§9.6; REQ-DATA-32): the linked persona + "No voice"
          (the ad-hoc default, REQ-PERSONA-20). Selecting a persona pins its current profile snapshot
          server-side; the shared pill renders beside the name. */}
      {project && projectVoice ? (
        <form
          method="post"
          action={`/p/${slug}/voice`}
          data-voice-picker="true"
          style={{ marginTop: "20px", padding: "10px 14px", border: "1px solid var(--shell-border)", borderRadius: "8px", maxWidth: "68ch" }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 6px" }}>
            {COPY.voice.picker.heading}
          </h2>
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--shell-fg-muted)" }}>
            <select name="personaId" defaultValue={projectVoice.current.personaId ?? ""} style={{ fontSize: "13px" }}>
              <option value="">{COPY.voice.picker.noVoice}</option>
              {projectVoice.options.map((o) => (
                <option key={o.personaId} value={o.personaId}>
                  {o.name ?? o.personaId}
                </option>
              ))}
            </select>
            {projectVoice.current.voiceMode === "linked" && projectVoice.current.status ? (
              <span data-voice-pill={projectVoice.current.status.pill.tone} style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                {projectVoice.current.status.pill.label}
              </span>
            ) : (
              <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>{COPY.voice.picker.noVoiceNote}</span>
            )}
          </label>
          <button type="submit" style={{ fontSize: "12px", marginTop: "6px" }}>{COPY.voice.picker.save}</button>
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
    </IdeFrame>
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
    <IdeFrame>
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
    </IdeFrame>
  );
}

/** Auth-gated: the conversion preview (source beside converted, count line, warnings, two actions). */
export function ImportPreviewPage(): ReactNode {
  const { conversion } = usePageData();
  const slug = conversion?.projectSlug ?? "";
  return (
    <IdeFrame>
      <SectionTitle>{COPY.import.previewHeading}</SectionTitle>
      {conversion?.created ? (
        <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>
          {COPY.import.created}
        </p>
      ) : null}
      {conversion?.pending === true ? (
        // PRB.21 — the converting state: a cold convert Job can run ~2.5–4 min; the page's meta-refresh
        // re-polls the preview GET on the quarantine key until the converted object lands. Honest copy —
        // never a spinner masquerading as a hung request.
        <section style={{ maxWidth: "68ch" }}>
          <p role="status" style={{ color: "var(--shell-fg)", fontSize: "15px", lineHeight: 1.6 }}>
            {fmt(COPY.import.convertingFmt, { name: conversion.sourceLabel })}
          </p>
          <p style={{ color: "var(--shell-fg-faint)", fontSize: "13px" }}>{COPY.import.convertingNote}</p>
        </section>
      ) : null}
      {conversion && conversion.pending !== true ? (
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
            // PRB.20 — replay the minted quarantine key; Create never re-uploads the bytes.
            ...(conversion.quarantineKey ? { hiddenFields: { qk: conversion.quarantineKey } } : {}),
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
    </IdeFrame>
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
    <IdeFrame>
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
      {runSheet?.activeRun ? (
        // PRB.21 / D-PRB.20-1 — a non-terminal run exists ⇒ the in-progress state REPLACES the Run
        // affordance (the api 409s a second create; this is the honest first screen + its link).
        <section style={{ maxWidth: "68ch" }}>
          <p role="status" style={{ color: "var(--shell-fg)", fontSize: "15px", lineHeight: 1.6 }}>
            {COPY.runSheet.inProgress}
          </p>
          {runSheet.activeRun.runId !== "" ? (
            <p style={{ marginTop: "12px" }}>
              <a href={`/p/${slug}/review/${runSheet.activeRun.runId}`}>{COPY.runSheet.openRun}</a>
            </p>
          ) : null}
        </section>
      ) : null}
      {runSheet && !runSheet.activeRun ? (
        <RunSheet
          view={runSheet.view}
          labels={{
            ...runSheetLabels,
            runLabel: runLabelFor[runSheet.view.workflow] ?? COPY.runSheet.runReview,
            voiceLabels: {
              lineLabel: COPY.voice.sheet.lineLabel,
              adHocLabel: COPY.voice.sheet.adHoc,
              updateFirstFmt: COPY.voice.sheet.updateFirstFmt,
            },
          }}
          runAction={`/p/${slug}/run`}
          exhaustedAction={`/p/${slug}/exhausted`}
        />
      ) : null}
    </IdeFrame>
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
    <IdeFrame>
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
        {/* PRB.16 — the per-finding obligation-state chip (REQ-OBJ-6): the dossier payload carries
            finding id → obligation state, joined from the delivered revision_obligations rows. */}
        <FindingsList
          groups={groups}
          conflicts={conflicts}
          collapsedRejected={rejected}
          labels={findingsLabels}
          obligationFor={(view) => {
            const state = dossier.findingObligations?.[view.id];
            return state
              ? { state, label: COPY.review.obligationStateLabel[state] ?? state }
              : undefined;
          }}
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
    </IdeFrame>
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
    <IdeFrame>
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
    </IdeFrame>
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
    <IdeFrame>
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
    </IdeFrame>
  );
}

/** The projected finding's display quote — null when the anchor is unanchored (Whole piece) or lost. */
function anchorQuote(f: EditorDocDto["findings"][number]): string | null {
  const a = f.anchor as { quote?: string; unanchored?: true } | null | undefined;
  if (!a || a.unanchored || !a.quote) return null;
  return a.quote;
}

// =========================================================================================================
// P1.02 — the Page (schema-first ProseMirror/Tiptap surface; §5.4; REQ-DATA-28/29 amended). The SSR render
// carries the full chrome + a static typeset preview + the embedded doc/provenance/findings JSON; the
// page.js island mounts the live PM view over them. The transport URLs point at the SAME `/edit/:draftId/*`
// same-origin endpoints the beta editor used (the transport seam, not a fork — P1.03 swaps it).
// =========================================================================================================

const pageLabels: PageEditorLabels = {
  versionLabel: (n, baseN) =>
    baseN != null ? fmt(E.versionForkFmt, { n, base: baseN }) : fmt(E.versionFmt, { n }),
  frozenBanner: (n) => fmt(E.frozenBannerFmt, { n }),
  writerLockText: (workflow) => fmt(E.writerLockFmt, { workflow }),
  readerLockText: (workflow) => fmt(E.readerLockFmt, { workflow }),
  cancelRun: E.cancelRun,
  findingsHeading: E.findingsHeading,
  wholePiece: E.wholePiece,
  lostNote: E.lostNote,
  proposalsHeading: E.proposalsHeading,
  accept: E.accept,
  reject: E.reject,
  noteLabel: E.noteLabel,
  notePlaceholder: E.notePlaceholder,
  noteSubmit: E.noteSubmit,
  noteSaved: E.noteSaved,
  revise: E.revise,
  readOnlyNote: E.readOnlyNote,
  danglingCiteNote: E.danglingCiteNote,
  authorshipHint: E.authorshipHint,
  forkFmt: E.forkFmt,
  sync: {
    synced: E.sync.synced,
    syncing: E.sync.syncing,
    queued: E.sync.queued,
    locked: E.sync.locked,
    offline: E.sync.offline,
    readOnly: E.sync.readOnly,
  },
};

/** The cite keys in the doc that resolve to no bibliography item — rendered visibly (never dropped). */
function danglingCites(doc: EditorDocDto): string[] {
  const keys = citeKeysInMarkdown(doc.markdown);
  const have = new Set((doc.bibliography ?? []).map((b) => b.citeKey));
  return [...keys].filter((k) => !have.has(k));
}

/** Scan the canonical markdown for `[@key]` / `[@a; @b]` cite refs (server-side parity with cite.ts). */
function citeKeysInMarkdown(markdown: string): Set<string> {
  const out = new Set<string>();
  const re = /\[@([^\]]+)\]/g;
  for (const m of markdown.matchAll(re)) {
    for (const part of (m[1] ?? "").split(";")) {
      const key = part.trim().replace(/^@/, "").split(/\s/)[0];
      if (key) out.add(key);
    }
  }
  return out;
}

/** The PageEditor element for `data.page` — shared by the /v/:v routes and the project overview's
 *  working-head mount (P1.02 item 12: `/p/:project` opens the Page on the working head). */
function PageSurface(): ReactNode {
  const { page } = usePageData();
  if (!page) return null;
  const { slug, doc } = page;
  const base = `/p/${slug}/edit/${doc.draftId}`;
  return (
    <PageEditor
        docJson={page.docJson}
        draftId={doc.draftId}
        draftN={doc.draftN}
        baseDraftN={doc.baseDraftN}
        origin={doc.origin}
        state={doc.state}
        lock={doc.lock}
        findings={doc.findings.map((f) => ({
          findingId: f.findingId,
          title: f.title,
          severity: f.severity,
          sourceLabel: f.sourceLabel,
          quote: anchorQuote(f),
          lost: f.lost,
          anchor: f.anchor,
        }))}
        proposals={(doc.proposals ?? []).map((p) => ({
          id: p.id,
          label: p.label ?? p.id,
          markdown: p.markdown,
          kind: p.kind,
          from: p.from,
          to: p.to,
          origin: p.origin,
        }))}
        provenance={doc.provenance ?? null}
        danglingCites={danglingCites(doc)}
        readOnly={page.readOnly === true}
        {...(page.collabWsUrl ? { collabWsUrl: page.collabWsUrl } : {})}
        saveUrl={`${base}/save`}
        docUrl={`${base}/doc`}
        noteUrl={`${base}/note`}
        cancelUrl={`${base}/cancel-run`}
        reviseUrl={`${base}/revise`}
        noteSaved={page.noteSaved}
        {...(page.focusFindingId ? { focusFindingId: page.focusFindingId } : {})}
        labels={pageLabels}
      />
  );
}

export function PagePage(): ReactNode {
  const { page } = usePageData();
  if (!page) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <SectionTitle>{E.notFound}</SectionTitle>
      </Shell>
    );
  }
  return (
    <IdeFrame>
      <PageSurface />
    </IdeFrame>
  );
}

// =========================================================================================================
// PRB.10 — Quick Voice (§9.2–§9.6): the library list, the creation sheet, and the detail page. Every pill
// label/tone comes from the shared `deriveVoiceStatus` projection in the api's DTO — these pages render it
// verbatim, never re-derive (REQ-PERSONA-14). Progressive enhancement: plain form POSTs throughout.
// =========================================================================================================

const VC = COPY.voice;

/** The shared pill rendered from the ONE status projection (§9.3). */
function voicePillSpan(status: VoiceStatusDto | null | undefined): ReactNode {
  if (!status) return null;
  return (
    <span data-voice-pill={status.pill.tone} style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
      {status.pill.label}
    </span>
  );
}

/** Auth-gated: the voice library's "Your voices" group — cards: name, byline, pill, sample count. */
export function VoicesPage(): ReactNode {
  const { voices = [] } = usePageData();
  return (
    <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
      <SectionTitle>{VC.listHeading}</SectionTitle>
      <p>
        <a href="/voices/new" data-new-voice="true">{VC.newCta}</a>
      </p>
      {voices.length === 0 ? (
        <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{VC.listEmpty}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0", display: "grid", gap: "10px" }}>
          {voices.map((v) => (
            <li key={v.personaId} data-voice-card={v.personaId} style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px 14px" }}>
              <a href={`/v/${v.personaId}`} style={{ fontWeight: 600, fontSize: "14px" }}>
                {v.name ?? v.personaId}
              </a>
              {v.byline ? <span style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}> · {v.byline}</span> : null}
              <div style={{ marginTop: "4px", display: "flex", gap: "12px", alignItems: "center", fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                {voicePillSpan(v.status)}
                <span>{fmt(VC.sampleCountFmt, { n: v.sampleCount })}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

/** Auth-gated: the §9.2 creation sheet — name required; description, byline, one pasted sample, Mode
 *  (metadata only, Q-11) and the tier radio optional; the AUP one-liner sits above the actions. */
export function VoiceNewPage(): ReactNode {
  const { voiceNew } = usePageData();
  return (
    <Shell brand={COPY.brand} nav={<a href="/voices">{VC.detail.backToList}</a>} footer={footer()}>
      <SectionTitle>{VC.new.heading}</SectionTitle>
      {voiceNew?.error ? (
        <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>{voiceNew.error}</p>
      ) : null}
      <form method="post" action="/voices/new" encType="multipart/form-data" style={{ maxWidth: "68ch" }}>
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block" }}>
          {VC.new.nameLabel}
          <input name="name" required placeholder={VC.new.namePlaceholder} style={fieldStyle} />
        </label>
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "12px" }}>
          {VC.new.bylineLabel}
          <input name="byline" style={fieldStyle} />
        </label>
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "16px" }}>
          {VC.new.describeLabel}
          <textarea name="description" style={textAreaStyle} />
        </label>
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.new.describeHint}</p>
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "16px" }}>
          {VC.new.sampleTitleLabel}
          <input name="sample_title" style={fieldStyle} />
        </label>
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "8px" }}>
          {VC.new.sampleLabel}
          <textarea name="sample_text" style={textAreaStyle} />
        </label>
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "8px" }}>
          {VC.new.sampleFileLabel}
          <input type="file" name="sample_file" accept=".md,.txt,.html" style={{ display: "block", marginTop: "4px", color: "var(--shell-fg)" }} />
        </label>
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.new.sampleHint}</p>
        <fieldset style={{ border: "none", padding: 0, margin: "16px 0 0" }}>
          <legend style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.new.tierLabel}</legend>
          <label style={{ display: "block", fontSize: "14px", marginTop: "6px" }}>
            <input type="radio" name="tier" value="quick" defaultChecked /> {VC.new.quickOption}
            <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}> · {VC.new.quickHint}</span>
          </label>
        </fieldset>
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "16px" }}>
          {VC.new.modeLabel}{" "}
          <select name="mode" defaultValue="self" style={{ fontSize: "13px" }}>
            <option value="self">{VC.new.modeOption.self}</option>
            <option value="house">{VC.new.modeOption.house}</option>
            <option value="consented">{VC.new.modeOption.consented}</option>
            <option value="study">{VC.new.modeOption.study}</option>
          </select>
        </label>
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "16px", maxWidth: "68ch" }}>
          {VC.new.aup}
        </p>
        <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
          <button type="submit" name="intent" value="build" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
            {VC.new.createBuild}
          </button>
          <button type="submit" name="intent" value="save" style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "14px", cursor: "pointer" }}>
            {VC.new.createOnly}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/** Auth-gated: the voice detail page (§9.5) — the shared pill + the seed editor (J9 hash recompute on save,
 *  the agent-drafted marker until the first user edit), the sample list with include/omit, the build
 *  history, and the read-only profile artifacts. */
export function VoiceDetailPage(): ReactNode {
  const { voice } = usePageData();
  const d = voice?.detail;
  const pid = d?.persona.id ?? "";
  return (
    <Shell brand={COPY.brand} nav={<a href="/voices">{VC.detail.backToList}</a>} footer={footer()}>
      <SectionTitle>{d?.persona.display_name ?? ""}</SectionTitle>
      {d?.persona.byline ? <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px", marginTop: "-6px" }}>{d.persona.byline}</p> : null}
      <p data-voice-status="true" style={{ margin: "4px 0 0" }}>
        {voicePillSpan(d?.status)}
        {voice?.estimate ? (
          <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginLeft: "10px" }}>
            {fmt(VC.detail.estimateFmt, { n: voice.estimate.estimateCredits })}
          </span>
        ) : null}
      </p>
      {voice?.notice ? (
        <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>{voice.notice}</p>
      ) : null}
      {d ? (
        <>
          {/* Build / update / cancel — the pill's one verb, priced (§9.3; never blocks anything). */}
          <div style={{ display: "flex", gap: "10px", margin: "10px 0" }}>
            {d.status.action === "build" || d.status.action === "update_voice" || d.status.action === "test" ? (
              <form method="post" action={`/v/${pid}/build`} style={{ margin: 0 }}>
                <button type="submit" data-build-voice="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  {d.status.action === "build" ? VC.detail.buildCta : VC.detail.updateCta}
                </button>
              </form>
            ) : null}
            {d.persona.active_run_id ? (
              <form method="post" action={`/v/${pid}/cancel`} style={{ margin: 0 }}>
                <input type="hidden" name="runId" value={d.persona.active_run_id} />
                <button type="submit" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
                  {VC.detail.cancelRun}
                </button>
              </form>
            ) : null}
          </div>

          {/* the seed editor — plain markdown; on save the J9 hash recomputes and the pill flips live. */}
          <section data-seed-editor="true" style={{ marginTop: "18px", maxWidth: "68ch" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.seedHeading}</h2>
            {d.persona.seed_authored_by === "persona_builder" ? (
              <p data-agent-drafted="true" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "0 0 6px" }}>
                {VC.detail.agentDraftedMark}
              </p>
            ) : null}
            <form method="post" action={`/v/${pid}/seed`}>
              <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block" }}>
                {VC.detail.bylineLabel}
                <input name="byline" defaultValue={d.persona.byline ?? ""} style={fieldStyle} />
              </label>
              <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block", marginTop: "8px" }}>
                {VC.detail.registersLabel}
                <input name="registers" defaultValue={(d.persona.registers ?? []).join(", ")} style={fieldStyle} />
              </label>
              <textarea name="description" defaultValue={d.seedMarkdown} style={{ ...textAreaStyle, marginTop: "8px" }} />
              <button type="submit" style={{ ...submitStyle, width: "auto", marginTop: "8px", padding: "7px 14px", fontSize: "13px" }}>
                {VC.detail.seedSave}
              </button>
            </form>
          </section>

          {/* the sample list with the per-item include/omit toggle (REQ-INGEST-4) + a paste box. */}
          <section data-samples="true" style={{ marginTop: "18px", maxWidth: "68ch" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.samplesHeading}</h2>
            {d.samples.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.samplesEmpty}</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "6px" }}>
                {d.samples.map((s) => (
                  <li key={s.id} data-sample={s.id} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "13px", border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "6px 10px" }}>
                    <span style={{ flex: 1 }}>{s.title ?? s.id}</span>
                    <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>
                      {s.word_count != null ? `${s.word_count.toLocaleString("en-US")} w` : ""}
                    </span>
                    <form method="post" action={`/v/${pid}/samples/${s.id}`} style={{ margin: 0 }}>
                      <button type="submit" name="included" value={s.state === "included" ? "false" : "true"} style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }}>
                        {s.state === "included" ? VC.detail.omitLabel : VC.detail.includeLabel}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form method="post" action={`/v/${pid}/samples`} encType="multipart/form-data" style={{ marginTop: "10px" }}>
              <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block" }}>
                {VC.detail.addSampleTitleLabel}
                <input name="title" style={fieldStyle} />
              </label>
              <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block", marginTop: "6px" }}>
                {VC.detail.addSampleLabel}
                <textarea name="text" style={{ ...textAreaStyle, minHeight: "100px" }} />
              </label>
              <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block", marginTop: "6px" }}>
                {VC.detail.addSampleFileLabel}
                <input type="file" name="file" accept=".md,.txt,.html" style={{ display: "block", marginTop: "4px", color: "var(--shell-fg)" }} />
              </label>
              <button type="submit" style={{ ...submitStyle, width: "auto", marginTop: "8px", padding: "7px 14px", fontSize: "13px" }}>
                {VC.detail.addSampleCta}
              </button>
            </form>
          </section>

          {/* the run history rows (§9.5's Runs tab — build runs only). */}
          <section data-runs="true" style={{ marginTop: "18px", maxWidth: "68ch" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.runsHeading}</h2>
            {d.runs.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.runsEmpty}</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
                {d.runs.map((r) => (
                  <li key={r.id} data-run={r.id}>
                    {r.workflow} · {VC.detail.runStateLabel[r.state] ?? r.state} · {r.spent_credits} cr ·{" "}
                    {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* derived profile artifacts — read-only by policy (§9.5 row 36; a write attempt 405s). */}
          <section data-artifacts="true" style={{ marginTop: "18px", maxWidth: "68ch" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.artifactsHeading}</h2>
            {d.artifacts.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.artifactsEmpty}</p>
            ) : (
              <>
                <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 6px" }}>{VC.detail.artifactsNote}</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
                  {d.artifacts.map((a) => (
                    <li key={a.version_id} data-artifact-kind={a.kind}>
                      {a.mirror_path} · {a.kind}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      ) : null}
    </Shell>
  );
}

/** PRB.11 — the export dialog (§13.4, §8.4 REQ-VIS-10, §11.7): format radios, the never-blocking
 *  obligation line with links (incl. `pre_export` horizons just returned to open), the AI-use attach
 *  toggle + statement preview, the append-only addition field, and the standalone-statement downloads.
 *  Pure SSR: the export form POSTs and the download links GET — no client JS. */
export function ExportPage(): ReactNode {
  const { export: ex } = usePageData();
  const slug = ex?.slug ?? "";
  const dialog = ex?.dialog;
  const statement = dialog?.statement;
  return (
    <IdeFrame>
      <SectionTitle>{COPY.export.heading}</SectionTitle>
      <p style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
        {COPY.export.lede}
      </p>
      {ex?.error ? (
        <p data-export-error="true" style={{ color: "var(--shell-fg)", fontSize: "13px" }}>{ex.error}</p>
      ) : null}
      {dialog ? (
        <>
          {/* the §11.7 obligation line — informational, with links; export never blocks on it. */}
          <p data-obligation-line="true" style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "12px 0 4px" }}>
            {dialog.obligations.line} — {COPY.export.obligationsNote}
          </p>
          {dialog.obligations.items.length > 0 ? (
            <ul data-obligation-items="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px", paddingLeft: "18px" }}>
              {dialog.obligations.items.map((o) => (
                <li key={o.id} data-obligation-id={o.id} data-returned={dialog.obligations.returnedIds.includes(o.id) || undefined}>
                  {o.reviewRunId ? (
                    <a href={`/p/${slug}/review/${o.reviewRunId}`}>{o.title}</a>
                  ) : (
                    o.title
                  )}{" "}
                  · {o.severity} · {o.state}
                </li>
              ))}
            </ul>
          ) : null}

          <form method="post" action={`/p/${slug}/export`} data-export-form="true" style={{ marginTop: "16px", maxWidth: "68ch" }}>
            <fieldset style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px 14px" }}>
              <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg)" }}>{COPY.export.formatLegend}</legend>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {dialog.formats.map((f, i) => (
                  <label key={f.id} style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "13px", color: "var(--shell-fg-muted)" }}>
                    <input type="radio" name="format" value={f.id} defaultChecked={i === 0} />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginTop: "12px", fontSize: "13px", color: "var(--shell-fg)" }}>
              <input type="checkbox" name="attachAiUse" defaultChecked style={{ marginTop: "2px" }} />
              <span>
                {COPY.export.attachLabel}
                <span style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-faint)" }}>{COPY.export.attachNote}</span>
              </span>
            </label>
            <button type="submit" style={{ marginTop: "12px", fontSize: "13px" }}>{COPY.export.exportCta}</button>
          </form>

          {/* the statement preview — generated sentences (recomputed from run rows) + the author's
              append-only additions. */}
          {statement ? (
            <section data-ai-use="true" style={{ marginTop: "20px", maxWidth: "68ch" }}>
              <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 6px" }}>
                {COPY.export.statementHeading}
              </h2>
              <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 8px" }}>{COPY.export.statementNote}</p>
              <p data-generated="true" style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--shell-fg)" }}>
                {statement.generated.join(" ")}
              </p>
              {statement.additions.map((a) => (
                <p key={a.id} data-addition={a.id} style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--shell-fg-muted)", margin: "6px 0 0" }}>
                  {a.sentence}
                </p>
              ))}
              <form method="post" action={`/p/${slug}/export/addition`} style={{ marginTop: "10px" }}>
                <label htmlFor="ai-use-addition" style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
                  {COPY.export.additionLabel}
                </label>
                <input
                  id="ai-use-addition"
                  type="text"
                  name="sentence"
                  placeholder={COPY.export.additionPlaceholder}
                  style={{ width: "100%", marginTop: "4px", padding: "6px 10px", fontSize: "13px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", boxSizing: "border-box" }}
                />
                <button type="submit" style={{ marginTop: "6px", fontSize: "12px" }}>{COPY.export.additionCta}</button>
              </form>
              <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "10px" }}>
                {COPY.export.standaloneHeading}:{" "}
                <a href={`/p/${slug}/export/ai-use/md`}>.md</a>
                {" · "}
                <a href={`/p/${slug}/export/ai-use/docx`}>.docx</a>
              </p>
            </section>
          ) : null}
        </>
      ) : null}
    </IdeFrame>
  );
}

/** PRB.12 — Settings (level-0 minimal): the one control REQ-PROD-15 requires to exist and bind — the
 *  analytics opt-out. A plain form POST; the flag also hides existing events from every read. */
export function SettingsPage(): ReactNode {
  const { privacy, theme } = usePageData();
  const pref = theme?.pref ?? "dark";
  return (
    <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
      <SectionTitle>{COPY.settings.heading}</SectionTitle>
      {/* P1.01 — the app theme (dark/light/auto), a plain form POST: works with no JS; the IDE shell's
          theme menu writes the same user field through /ide/theme. */}
      <section aria-label={COPY.settings.themeHeading} style={{ marginTop: "16px", maxWidth: "68ch" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>{COPY.settings.themeHeading}</h3>
        <form method="post" action="/settings/theme">
          <label style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "13px", color: "var(--shell-fg)" }}>
            <select name="appTheme" defaultValue={pref} style={{ fontSize: "13px" }}>
              <option value="dark">{COPY.settings.themeDark}</option>
              <option value="light">{COPY.settings.themeLight}</option>
              <option value="auto">{COPY.settings.themeAuto}</option>
            </select>
          </label>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0 10px" }}>
            {COPY.settings.themeNote}
          </p>
          <button type="submit" style={{ fontSize: "13px" }}>{COPY.settings.saveCta}</button>
        </form>
      </section>
      <section aria-label={COPY.settings.privacyHeading} style={{ marginTop: "24px", maxWidth: "68ch" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>{COPY.settings.privacyHeading}</h3>
        <form method="post" action="/settings/privacy" data-privacy-form="true">
          <label style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "13px", color: "var(--shell-fg)" }}>
            <input
              type="checkbox"
              name="analytics"
              defaultChecked={!(privacy?.analyticsOptOut ?? false)}
              data-analytics-toggle="true"
            />
            {COPY.settings.analyticsLabel}
          </label>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0 10px" }}>
            {COPY.settings.analyticsNote}
          </p>
          <button type="submit" style={{ fontSize: "13px" }}>{COPY.settings.saveCta}</button>
          {privacy?.saved ? (
            <span data-privacy-saved="true" style={{ marginLeft: "10px", fontSize: "12px", color: "var(--state-ready)" }}>
              {COPY.settings.saved}
            </span>
          ) : null}
        </form>
      </section>
    </Shell>
  );
}

/** PRB.12 — the §14.5 level-1 usage glance: the balance (spendable + held) and the account's recent runs'
 *  credit spend (P0.11 data). Per-run cost on run rows — the whole contract. */
export function UsagePage(): ReactNode {
  const { usage } = usePageData();
  const credits = (n: number) => `${n.toLocaleString()} ${COPY.usage.creditsSuffix}`;
  return (
    <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
      <SectionTitle>{COPY.usage.heading}</SectionTitle>
      {usage ? (
        <>
          <p style={{ fontSize: "14px", margin: "12px 0" }} data-usage-balance="true">
            {COPY.usage.spendableLabel}: <strong>{credits(usage.spendableCredits)}</strong>
            {" · "}
            <span title={COPY.usage.heldNote}>
              {COPY.usage.heldLabel}: {credits(usage.heldCredits)}
            </span>
          </p>
          <h3 style={{ fontSize: "14px", margin: "16px 0 8px" }}>{COPY.usage.runsHeading}</h3>
          {usage.runs.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{COPY.usage.runEmpty}</p>
          ) : (
            <table style={{ fontSize: "13px", borderCollapse: "collapse", width: "100%" }} data-usage-runs="true">
              <thead>
                <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
                  <th style={{ padding: "4px 8px 4px 0" }}>Run</th>
                  <th style={{ padding: "4px 8px" }}>Workflow</th>
                  <th style={{ padding: "4px 8px" }}>State</th>
                  <th style={{ padding: "4px 0 4px 8px", textAlign: "right" }}>Spent</th>
                </tr>
              </thead>
              <tbody>
                {usage.runs.map((r) => (
                  <tr key={r.runId} data-usage-run={r.runId}>
                    <td style={{ padding: "4px 8px 4px 0", fontVariantNumeric: "tabular-nums" }}>
                      {r.createdAt.slice(0, 10)}
                    </td>
                    <td style={{ padding: "4px 8px" }}>{r.workflow}</td>
                    <td style={{ padding: "4px 8px" }}>{r.state}</td>
                    <td style={{ padding: "4px 0 4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {credits(r.spentCredits)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </Shell>
  );
}
