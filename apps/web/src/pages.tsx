import { Fragment, type ReactNode } from "react";
import {
  Shell,
  PageTitle,
  Chip,
  ProjectRow,
  ProjectGroupList,
  VoiceGroupList,
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
  ApprovalRow,
  TriageLedger,
  DecisionsList,
  WhatChangedView,
  RubricDelta,
  SourceEditor,
  PageEditor,
  IdeShell,
  EmptyProject,
  RunReport,
  MarginSurface,
  FindingsDesk,
  VersionRail,
  CompareView,
  FilesPane,
  OutlineSections,
  ChatDesk,
  type ChatDeskLabels,
  type VersionRailLabels,
  type CompareLabels,
  type FilesPaneLabels,
  type MarginLabels,
  type FindingsDeskLabels,
  type WhatChangedLabels,
  type SourceEditorLabels,
  type PageEditorLabels,
  type DispositionControlsLabels,
  type GateCardLabels,
  type ApprovalRowLabels,
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
  type LiveFeedLabels,
  type TimelineLabels,
  type TimelineHrefs,
  type RunReportLabels,
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
  evidenceUrlViews,
  fetchLogFromRows,
  normalizeEvidence,
  buildRubricDelta,
  // P1.07 — the findings-surface derivations (§5.7): margin clustering, the shared filters, the
  // sectioned triage queue, the Quick severity budget, and the Apply gate.
  marginItems,
  filterFindings,
  parseFindingFilters,
  sectionedTriageQueue,
  severityBudget,
  applySeverityBudget,
  applyGate,
  LIVE_OBLIGATION_STATES,
  type TrustChipLabels,
  type DoNothingOutcome,
  // P1.09 — the §6.4 surface helpers: the Needs-you ordering + the decision-record view.
  needsYouOrder,
  type GateDecisionView,
  type GateCardModel,
} from "@rhema/findings-core";
import type {
  EditorDocDto,
  GateCardDto,
  ApprovalSettingsDto,
  VoiceStatusDto,
  VoiceListRowDto,
  VoiceDetailDto,
  ChatPanelDto,
  VoiceConnectionDto,
  VoiceConnectionsDto,
  VoiceSampleDto,
  VoiceSampleDetailDto,
} from "@rhema/api-client";
import {
  CHECKABLE_CLAIM_KINDS,
  GATE_DEFAULTS,
  MODEL_TIERS,
  MODEL_TIER_DISPLAY,
  RIGORS,
  RIGOR_DISPLAY,
  APPROVAL_POLICIES,
  USER_LAUNCHED_WORKFLOW_KEYS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_MATRIX,
  ACCOUNT_DELETION_CONFIRMATION,
  emailEnabled,
  isNonConfigurableEvent,
  type ClaimKind,
  type FindingView,
  type GateKind,
} from "@rhema/contracts";
import { COPY } from "./copy.js";
import { SAMPLE_DOSSIER } from "./sample-dossier.js";
import { feedLabelMapsJson } from "./feed-labels.js";
import { usePageData } from "./page-data.js";

/** Replace `{key}` placeholders in a copy template with string/number values. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** ONB.1 (invariant #14) — the converting-state copy, honest about the wait the label implies:
 *  a known text extension → seconds on the warm service; `.pdf` → the batch Job's minutes; an
 *  unlabeled key-only poll → both bounds, never a promised fast wait. */
function convertingCopy(sourceLabel: string | undefined): string {
  if (sourceLabel && /\.(md|markdown|txt|html?|docx)$/i.test(sourceLabel)) return COPY.import.convertingFmt;
  if (sourceLabel && /\.pdf$/i.test(sourceLabel)) return COPY.import.convertingSlowFmt;
  return COPY.import.convertingUnknownFmt;
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

/** P1.19 — §10.1's ✗ column (REQ-SPEC-20; REQ-MOBILE-3 amended): on phone width a suppressed surface
 *  renders this note instead of its controls (run-start, ingestion, export, new project, diffs,
 *  billing actions, voice building, approval-field editing). */
export function PhoneBlockedNote(): ReactNode {
  return (
    <p data-phone-blocked="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
      {COPY.phoneBlocked.note}
    </p>
  );
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
      {...(ide.timelineView
        ? {
            timelineView: ide.timelineView,
            timelineLabels,
            timelineCardLabels: runCardLabels,
            timelineHrefs: timelineHrefs(slug),
            // P1.09 — the waiting run mounts the IDENTICAL §6.4 card the Needs-you row expands to
            // (same DTO, same render path; its decision lines ride the run card itself).
            renderGateCard: (run) =>
              run.gate
                ? gateCardFor(run.gate as GateCardDto, slug, data.compact ?? false, undefined, {
                    decisions: (run.card as { decisions?: readonly GateDecisionView[] }).decisions,
                  })
                : undefined,
          }
        : {})}
      {...(ide.feed
        ? {
            feed: {
              runId: ide.feed.runId,
              eventsUrl: ide.feed.eventsUrl,
              density: ide.feed.density,
              rows: ide.feed.rows,
              ...(ide.feed.lastSeq != null ? { lastSeq: ide.feed.lastSeq } : {}),
              labels: feedLabels,
              labelMaps: feedLabelMapsJson(),
            },
          }
        : {})}
      {...(ide.runNextHref ? { runNextHref: ide.runNextHref } : {})}
      {...(ide.palette ? { palette: ide.palette } : {})}
      {...(ide.paletteSearchUrl ? { paletteSearchUrl: ide.paletteSearchUrl } : {})}
      {...(ide.activeRun ? { activeRun: ide.activeRun } : {})}
      {...(ide.inboxCount != null ? { inboxCount: ide.inboxCount } : {})}
      {...(ide.status ? { status: ide.status } : {})}
      {...(ide.themeUrl ? { themeUrl: ide.themeUrl } : {})}
      {...(ide.paperThemeUrl ? { paperThemeUrl: ide.paperThemeUrl } : {})}
      {...(ide.files
        ? {
            filesBody: (
              <FilesPane
                sections={ide.files.sections}
                hrefs={{
                  artifact: (id) => `/p/${slug}/a/${id}`,
                  draft: (n) => `/p/${slug}/v/${n}`,
                  run: (id) => `/p/${slug}/r/${id}`,
                }}
                labels={filesLabels}
              />
            ),
          }
        : {})}
      {...(ide.chat ? { chatBody: chatPanel(ide.chat, slug, ide, data.compact === true) } : {})}
      {...dossierSurfaces(data)}
      labels={{
        ...COPY.ide,
        viewMenu: { ...COPY.ide.viewMenu, advanced: COPY.runSheet.advanced },
      }}
    >
      {children}
      {/* ONB.1 — the held-draft consumed handshake: `/app/new/create` echoes the hold's token as
          `?hc=` on the success landing; this marker + landing.js let the island delete the hold
          only when the echoed token matches its IndexedDB record (server-confirmed consumption). */}
      {data.project?.heldConsumed ? (
        <>
          <span data-held-consumed={data.project.heldConsumed} hidden />
          <script src="/assets/landing.js" defer />
        </>
      ) : null}
      {/* P1.19 — §10.1: below ~768 px the Desk is display:none, so the chat surface mounts INSIDE
          the Page — text only (the compact ChatDesk drops the plan card's run-start/edit actions,
          the anchored suggestion, and the tier pick; the estimate line still shows). */}
      {data.compact === true && ide.chat ? (
        <section
          className="ide-phone-only"
          data-phone-chat="true"
          aria-label={COPY.ide.desk.heading}
          style={{ marginTop: "24px", borderTop: "1px solid var(--paper-rule)", paddingTop: "12px" }}
        >
          {chatPanel(ide.chat, slug, ide, true)}
        </section>
      ) : null}
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
      <PageTitle>{open ? COPY.invite.headingOpen : COPY.invite.heading}</PageTitle>
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
 *  SEC.2 (PR-U1 form half): under `open` the EMAIL field leads (the self-serve path) and the
 *  invitation code sits behind a "Have an invitation code?" disclosure — never the first focusable
 *  field. `invite` mode keeps the code first + required. No pricing page, no plan ladder either way. */
export function LoginPage(): ReactNode {
  const { login } = usePageData();
  const open = login?.signupOpen === true;
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <div style={{ maxWidth: "380px", margin: "0 auto" }}>
        <PageTitle>{COPY.login.heading}</PageTitle>
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
          {open ? (
            <>
              <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
                {COPY.login.emailLabel}
                <input name="email" type="email" defaultValue={login?.email ?? ""} placeholder={COPY.login.emailPlaceholder} style={fieldStyle} />
              </label>
              {/* a re-rendered code (an error retry) opens the disclosure so the typed value stays
                  visible — closed otherwise, the self-serve default. */}
              <details open={!!login?.code} style={{ marginTop: "12px" }}>
                <summary style={{ fontSize: "13px", color: "var(--shell-fg-muted)", cursor: "pointer" }}>
                  {COPY.login.codeToggle}
                </summary>
                <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "8px", display: "block" }}>
                  {COPY.login.codeLabelOptional}
                  <input name="code" defaultValue={login?.code ?? ""} placeholder={COPY.login.codePlaceholder} style={fieldStyle} />
                </label>
              </details>
            </>
          ) : (
            <>
              <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
                {COPY.login.codeLabel}
                <input name="code" required defaultValue={login?.code ?? ""} placeholder={COPY.login.codePlaceholder} style={fieldStyle} />
              </label>
              <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "12px", display: "block" }}>
                {COPY.login.emailLabel}
                <input name="email" type="email" defaultValue={login?.email ?? ""} placeholder={COPY.login.emailPlaceholder} style={fieldStyle} />
              </label>
            </>
          )}
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

/** Auth-gated: the §5.2 workspace home (P1.04) — the attention-grouped list, the Voice filter chips,
 *  the Group-by select (persisted per user), the Archived affordance, and the search field. Every
 *  row's state arrives already derived (the api runs projectState over the row sets). */
export function ProjectsPage(): ReactNode {
  const { home, balance, compact } = usePageData();
  const groupBy = home?.groupBy ?? "attention";
  const voiceFilter = home?.voiceFilter ?? null;
  const protocolFilter = home?.protocolFilter ?? null;
  const sort = home?.sort ?? "recent";
  const voices = home?.voices ?? [];
  const protocols = home?.protocols ?? [];
  const search = home?.search;
  /** the controls' hrefs keep the live query while swapping one facet. */
  const homeHref = (opts: {
    voice?: string | null;
    protocol?: string | null;
    sort?: "recent" | "title";
    archived?: boolean;
    deleted?: boolean;
    q?: string | null;
  }) => {
    const p = new URLSearchParams();
    const q = opts.q === undefined ? search?.q : opts.q;
    const voice = opts.voice === undefined ? voiceFilter : opts.voice;
    const protocol = opts.protocol === undefined ? protocolFilter : opts.protocol;
    const s2 = opts.sort === undefined ? sort : opts.sort;
    const archived = opts.archived === undefined ? home?.showArchived : opts.archived;
    const deleted = opts.deleted === undefined ? home?.showDeleted : opts.deleted;
    if (q) p.set("q", q);
    if (voice) p.set("voice", voice);
    if (protocol) p.set("protocol", protocol);
    if (s2 === "title") p.set("sort", "title");
    if (archived) p.set("archived", "1");
    if (deleted) p.set("deleted", "1");
    const s = p.toString();
    return s ? `/app?${s}` : "/app";
  };
  const filterHref = (voice: string | null) => homeHref({ voice });
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
          <a href="/app/settings/account" style={{ fontSize: "13px" }}>{COPY.settings.nav}</a>
          <form method="post" action="/logout" style={{ margin: 0 }}>
            <button type="submit" style={{ background: "none", border: "none", color: "var(--shell-fg-muted)", cursor: "pointer", fontSize: "13px" }}>
              {COPY.projects.signOut}
            </button>
          </form>
        </span>
      }
      footer={footer()}
    >
      <PageTitle>{COPY.projects.heading}</PageTitle>
      {/* the controls bar: search, Group-by (persisted), the Voice filter chips, the Archived
          affordance — every control is a plain link or form (no client JS). */}
      <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
        {/* P1.19 — §10.1 ✗: new project is never offered on phone width. */}
        {compact === true ? null : (
        <a
          href="/app/new"
          data-new-project="true"
          style={{ padding: "6px 14px", borderRadius: "8px", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}
        >
          {COPY.projectHome.newProject}
        </a>
        )}
        <form method="get" action="/app" style={{ display: "flex", gap: "6px", alignItems: "center", margin: 0 }}>
          {voiceFilter ? <input type="hidden" name="voice" value={voiceFilter} /> : null}
          {protocolFilter ? <input type="hidden" name="protocol" value={protocolFilter} /> : null}
          {sort === "title" ? <input type="hidden" name="sort" value="title" /> : null}
          {home?.showArchived ? <input type="hidden" name="archived" value="1" /> : null}
          {home?.showDeleted ? <input type="hidden" name="deleted" value="1" /> : null}
          <input
            type="search"
            name="q"
            defaultValue={search?.q ?? ""}
            placeholder={COPY.projectHome.searchPlaceholder}
            aria-label={COPY.projectHome.searchPlaceholder}
            style={{ padding: "5px 10px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-surface)", color: "var(--shell-fg)", fontSize: "13px", minWidth: "220px" }}
          />
          <button type="submit" style={{ fontSize: "13px" }}>{COPY.projectHome.searchSubmit}</button>
        </form>
        <form method="post" action="/app/grouping" style={{ display: "flex", gap: "6px", alignItems: "center", margin: 0 }} data-group-by="true">
          <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>{COPY.projectHome.groupByLabel}</label>
          <select name="groupBy" defaultValue={groupBy} aria-label={COPY.projectHome.groupByLabel} style={{ fontSize: "12px" }}>
            <option value="attention">{COPY.projectHome.groupAttention}</option>
            <option value="voice">{COPY.projectHome.groupVoice}</option>
          </select>
          <button type="submit" style={{ fontSize: "12px" }}>{COPY.projectHome.applyLabel}</button>
        </form>
        {/* the Protocol filter + Sort dropdowns (§5.2's bar) — a GET keeps every other live param. */}
        <form method="get" action="/app" style={{ display: "flex", gap: "6px", alignItems: "center", margin: 0 }} data-filter-form="true">
          {search?.q ? <input type="hidden" name="q" value={search.q} /> : null}
          {voiceFilter ? <input type="hidden" name="voice" value={voiceFilter} /> : null}
          {home?.showArchived ? <input type="hidden" name="archived" value="1" /> : null}
          {home?.showDeleted ? <input type="hidden" name="deleted" value="1" /> : null}
          <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>{COPY.projectHome.protocolFilterLabel}</label>
          <select name="protocol" defaultValue={protocolFilter ?? ""} aria-label={COPY.projectHome.protocolFilterLabel} style={{ fontSize: "12px" }}>
            <option value="">{COPY.projectHome.protocolAll}</option>
            {protocols.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>{COPY.projectHome.sortLabel}</label>
          <select name="sort" defaultValue={sort} aria-label={COPY.projectHome.sortLabel} style={{ fontSize: "12px" }}>
            <option value="recent">{COPY.projectHome.sortRecent}</option>
            <option value="title">{COPY.projectHome.sortTitle}</option>
          </select>
          <button type="submit" style={{ fontSize: "12px" }}>{COPY.projectHome.applyLabel}</button>
        </form>
        {/* the Archived + Recently-deleted affordances — links keep the other live params. */}
        <a href={homeHref({ archived: !(home?.showArchived ?? false) })}
           data-archived-toggle="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {home?.showArchived ? COPY.projectHome.archivedHide : COPY.projectHome.archivedShow}
        </a>
        <a href={homeHref({ deleted: !(home?.showDeleted ?? false) })}
           data-deleted-toggle="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
          {home?.showDeleted ? COPY.projectHome.deletedHide : COPY.projectHome.deletedShow}
        </a>
      </div>
      {/* the Voice filter chips — All, each voice, then Unfiled. */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }} data-voice-filters="true">
        <Chip label={COPY.projectHome.filterAll} href={filterHref(null)} />
        {voices.map((v) => (
          <Chip
            key={v.personaId}
            label={`${v.name ?? v.personaId}${voiceFilter === v.personaId ? " ✓" : ""}`}
            href={filterHref(v.personaId)}
          />
        ))}
        <Chip
          label={`${COPY.projectHome.unfiled}${voiceFilter === "unfiled" ? " ✓" : ""}`}
          href={filterHref("unfiled")}
        />
      </div>
      {search ? (
        // the server-side hits replace the groups while `?q=` is live (§5.2's interim search).
        <section data-search-results="true">
          <h2 style={{ fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>
            {COPY.projectHome.searchResults} · {search.results.length}
          </h2>
          {search.results.length === 0 ? (
            <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{COPY.projects.empty}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid var(--shell-border)", borderRadius: "12px", overflow: "hidden", background: "var(--shell-surface)" }}>
              {search.results.map((h) => (
                <li key={`${h.kind}:${h.projectId}`} style={{ padding: "10px 16px", borderBottom: "1px solid var(--shell-border)" }}>
                  <a href={`/p/${h.slug}`} style={{ color: "var(--shell-fg)", fontWeight: 500, fontSize: "14px", textDecoration: "none" }}>
                    {h.title}
                  </a>
                  <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px", marginLeft: "8px" }}>{h.kind}</span>
                  <div style={{ color: "var(--shell-fg-muted)", fontSize: "12px", marginTop: "2px" }}>{h.snippet}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : groupBy === "voice" ? (
        <VoiceGroupList groups={home?.voiceGroups ?? []} emptyLabel={COPY.projects.empty} />
      ) : (
        <ProjectGroupList groups={home?.attentionGroups ?? []} emptyLabel={COPY.projects.empty} />
      )}
      {home?.showArchived && home.archivedRows.length > 0 ? (
        <details data-archived-section="true" style={{ marginTop: "18px" }} open>
          <summary style={{ fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--shell-fg-muted)", cursor: "pointer", listStyle: "none" }}>
            {COPY.projectHome.archivedHeading} · {home.archivedRows.length}
          </summary>
          <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, border: "1px solid var(--shell-border)", borderRadius: "12px", overflow: "hidden", background: "var(--shell-surface)" }}>
            {home.archivedRows.map((row) => (
              <ProjectRow key={row.id} row={row} />
            ))}
          </ul>
        </details>
      ) : null}
      {/* the 30-day restore window (§5.2's soft delete) — the ONLY surface that reads deleted rows. */}
      {home?.showDeleted ? (
        <section data-deleted-section="true" style={{ marginTop: "18px" }}>
          <h2 style={{ fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>
            {COPY.projectHome.deletedHeading} · {home.deletedRows.length}
          </h2>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 6px" }}>{COPY.projectHome.deletedNote}</p>
          {home.deletedRows.length > 0 ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid var(--shell-border)", borderRadius: "12px", overflow: "hidden", background: "var(--shell-surface)" }}>
              {home.deletedRows.map((row) => (
                <li
                  key={row.id}
                  data-deleted-row={row.id}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", borderBottom: "1px solid var(--shell-border)" }}
                >
                  <span style={{ flex: "1 1 auto", color: "var(--shell-fg)", fontSize: "14px" }}>{row.title}</span>
                  <form method="post" action={`${row.href}/restore`} data-restore-form="true" style={{ margin: 0 }}>
                    <button type="submit" style={{ fontSize: "12px" }}>{COPY.projectHome.actionRestore}</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </Shell>
  );
}

/** Auth-gated: the flat project view (the studio editing surface is P1.01) + the Needs-you gate cards
 *  and the Decisions list (PRB.05 — the beta Inbox stand-in, §5.7/§6.4). */
export function ProjectPage(): ReactNode {
  const {
    project,
    gates = [],
    decisions = [],
    approvalOverrides = {},
    approvalSettings,
    explainersDismissed,
    ide,
    compact,
    triage,
    projectVoice,
    page,
  } = usePageData();
  const slug = project?.slug ?? "";
  const triageOptedIn = typeof approvalOverrides.approve_triage === "number";
  // P1.09 — the §5.11 ordering: blocked-on-you first by soonest deadline, waiting next, informational last.
  const orderedGates = needsYouOrder(gates);
  // the run's permanent decision records ride the Timeline read (server-projected) — the Needs-you
  // card renders the same lines its run card does (§6.4 item 8).
  const decisionsByRun = new Map<string, readonly GateDecisionView[]>();
  for (const r of [
    ...(ide?.timelineView?.rounds ?? []).flatMap((round) => round.runs),
    ...(ide?.timelineView?.ungrouped ?? []),
  ]) {
    const ds = (r.card as { decisions?: readonly GateDecisionView[] }).decisions;
    if (ds && ds.length > 0) decisionsByRun.set(r.runId, ds);
  }
  // the one-time explainer (§5.11) mounts on the first Approval card until dismissed.
  const showExplainer = !(explainersDismissed ?? []).includes("approvals");
  return (
    <IdeFrame>
      {/* P1.01 — the project overview IS the IDE's Page surface. An empty project (no draft head) renders
          the §5.9 empty-project state: three entry cards + the quiet serif title field. P1.02 item 12 —
          a project WITH a working head opens the Page on it; the overview affordances stay below. */}
      {project && !project.headDraftId ? (
        compact === true ? (
          /* P1.19 — §10.1 ✗: the empty-project's entries are import/run — both suppressed on
             phone width; the honest note replaces them. */
          <PhoneBlockedNote />
        ) : (
        <EmptyProject
          labels={{
            titlePlaceholder: COPY.ide.emptyProject.titlePlaceholder,
            cards: COPY.ide.emptyProject.cards,
          }}
          paths={[`/p/${slug}/import`, `/p/${slug}/import`, `/p/${slug}/run`]}
        />
        )
      ) : null}
      <PageTitle>{project?.title ?? ""}</PageTitle>
      {project?.rename && compact !== true ? (
        // P1.04 — the row action's Rename: an inline title form posting to /p/:slug/rename.
        // P1.19 — §10.1 ✗: a configuration control — suppressed on phone width.
        <form method="post" action={`/p/${slug}/rename`} data-rename-form="true" style={{ display: "flex", gap: "8px", alignItems: "center", margin: "8px 0" }}>
          <input
            type="text"
            name="title"
            required
            defaultValue={project.title}
            placeholder={COPY.projectHome.renamePlaceholder}
            style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "14px", minWidth: "280px" }}
          />
          <button type="submit" style={{ fontSize: "13px" }}>{COPY.projectHome.renameSave}</button>
        </form>
      ) : null}
      {project ? <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{project.pill}</p> : null}
      {project?.created ? (
        // P1.04 — the §5.3 per-entry landing: the next-step card at the head. Scratch points at the
        // Desk's Chat (the Assistant surface is P1.11's); outline lands Draft v1; draft lands the
        // Review — its estimate lives on the run sheet the card links to.
        <section data-next-step-card={project.created.entry} style={{ margin: "12px 0", padding: "12px 14px", border: "1px solid var(--shell-border)", borderRadius: "10px", background: "var(--shell-surface)", maxWidth: "68ch" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>
            {COPY.newProject.nextStepHeading}
          </h2>
          <p style={{ fontSize: "14px", color: "var(--shell-fg)", margin: 0 }}>
            {project.created.entry === "scratch"
              ? COPY.newProject.nextStepScratch
              : project.created.entry === "outline"
                ? fmt(COPY.newProject.nextStepOutlineFmt, { v: "v1" })
                : fmt(COPY.newProject.nextStepDraftFmt, { v: `v${project.created.draftN ?? 1}` })}
          </p>
          {project.created.entry === "draft" && compact !== true ? (
            // P1.19 — §10.1 ✗: run start is never offered on phone width.
            <p style={{ margin: "8px 0 0" }}>
              <a href={`/p/${slug}/run`} style={{ fontSize: "13px" }}>{COPY.runSheet.runReview}</a>
            </p>
          ) : null}
          {project.created.notes && (project.created.notes.warnings > 0 || project.created.notes.unconverted > 0) ? (
            <p data-conversion-notes="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "8px 0 0" }}>
              {`${COPY.newProject.conversionNotes}: ${project.created.notes.warnings} · ${COPY.newProject.unconvertedNote}`}
            </p>
          ) : null}
        </section>
      ) : null}
      {project ? (
        // UX.2 (ADR-067) — `.ide-actions`: ≥24-px targets everywhere; at phone width the surviving
        // §10.1 navigations render as bordered ≥ 44-px controls (button-styled links — they are
        // navigations, so `<a>` stays the correct element).
        <p className="ide-actions" style={{ display: "flex", gap: "16px" }}>
          {/* P1.19 — §10.1 ✗: import / run start / export are never offered on phone width; the
              reader link stays (the Page mounts read-only at that width). */}
          {compact === true ? null : (
            <>
              <a href={`/p/${slug}/import`}>{COPY.project.importCta}</a>
              <a href={`/p/${slug}/run`}>{COPY.runSheet.runReview}</a>
              <a href={`/p/${slug}/export`}>{COPY.project.exportCta}</a>
            </>
          )}
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
      {orderedGates.length > 0 ? (
        <section data-needs-you="true" style={{ marginTop: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 10px" }}>
            {COPY.gates.heading}
          </h2>
          {/* P1.09 — the §5.11 approval rows: kind + artifact + deadline/waiting + do-nothing on the
              row; expanding mounts the IDENTICAL §6.4 card (read before approving). */}
          {orderedGates.map((g, i) => {
            const model = gateCardModel(g, compact ?? false);
            return (
              <ApprovalRow
                key={g.id}
                gateId={g.id}
                model={model}
                {...(g.artifactTitle != null
                  ? {
                      artifact: {
                        title: g.artifactTitle,
                        ...(g.artifactId != null ? { href: `/p/${slug}/a/${g.artifactId}` } : {}),
                      },
                    }
                  : {})}
                labels={approvalRowLabels}
                card={gateCardFor(g, slug, compact ?? false, triage?.dispositionError, {
                  ...(decisionsByRun.has(g.runId) ? { decisions: decisionsByRun.get(g.runId) } : {}),
                  explainer: i === 0 && showExplainer,
                })}
              />
            );
          })}
        </section>
      ) : null}
      {/* P1.09 — the §6.4 item 3 approval settings: the policy pick + the per-kind deadline grid +
          the standing-guidance manager (§6.5; REQ-GATE-10). Falls back to the PRB.05 opt-in when the
          settings read is absent. */}
      {/* P1.19 — §10.1 ✗: approval policy is a configuration control — suppressed on phone width. */}
      {project && compact !== true ? (
        approvalSettings ? (
        <ApprovalSettingsSection slug={slug} settings={approvalSettings} />
        ) : (
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
        )
      ) : null}
      {/* PRB.10 — the project voice picker (§9.6; REQ-DATA-32): the linked persona + "No voice"
          (the ad-hoc default, REQ-PERSONA-20). Selecting a persona pins its current profile snapshot
          server-side; the shared pill renders beside the name.
          P1.19 — §10.1 ✗: voice configuration is suppressed on phone width. */}
      {project && projectVoice && compact !== true ? (
        <div
          data-voice-picker="true"
          style={{ marginTop: "20px", padding: "10px 14px", border: "1px solid var(--shell-border)", borderRadius: "8px", maxWidth: "68ch" }}
        >
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 6px" }}>
            {COPY.voice.picker.heading}
          </h2>
          <form method="post" action={`/p/${slug}/voice`}>
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--shell-fg-muted)", flexWrap: "wrap" }}>
              <select name="personaId" defaultValue={projectVoice.current.personaId ?? ""} style={{ fontSize: "13px" }}>
                <option value="">{COPY.voice.picker.noVoice}</option>
                {projectVoice.options.map((o) => (
                  <option key={o.personaId} value={o.personaId}>
                    {o.name ?? o.personaId}
                  </option>
                ))}
              </select>
              {/* P1.14 — ONE register pick on a multi-register voice (§9.6): a run input, never a pin. */}
              {(() => {
                const cur = projectVoice.options.find((o) => o.personaId === projectVoice.current.personaId);
                const regs = cur?.registers ?? [];
                return regs.length > 1 ? (
                  <select name="register" data-register-pick="true" defaultValue="" style={{ fontSize: "13px" }}>
                    <option value="">{COPY.voice.picker.registerDefault}</option>
                    {regs.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : null;
              })()}
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
          {/* P1.14 — the §9.6 hatches: the pin trails a refreshed profile (or a direct change just
              hit the soft lock) ⇒ Adopt (+ reseed preview) / Fork, never a silent override. */}
          {projectVoice.locked ? (
            <p data-voice-locked="true" role="alert" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "8px 0 0" }}>
              {VC.detail.voiceLockedNotice}
            </p>
          ) : null}
          {projectVoice.current.pinnedStale ? (
            <div data-pinned-stale="true" style={{ marginTop: "8px", fontSize: "12px" }}>
              <p style={{ color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{VC.detail.pinnedStaleNotice}</p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <form method="post" action={`/p/${slug}/voice/adopt`} style={{ margin: 0 }}>
                  <button type="submit" data-adopt-voice="true" style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}>
                    {VC.detail.adoptCta}
                  </button>
                </form>
                <a href={`/p/${slug}/voice/reseed`} style={{ fontSize: "12px", color: "var(--accent)" }}>
                  {VC.detail.reseedPreviewCta}
                </a>
                <form method="post" action={`/p/${slug}/voice/fork`} style={{ margin: 0 }}>
                  <input type="hidden" name="personaId" value={projectVoice.current.personaId ?? ""} />
                  <button type="submit" data-fork-project="true" style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}>
                    {VC.detail.forkProjectCta}
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </div>
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
  const { project, compact } = usePageData();
  const slug = project?.slug ?? "";
  return (
    <IdeFrame>
      <PageTitle>{COPY.import.heading}</PageTitle>
      {/* P1.19 — §10.1 ✗: ingestion never renders on phone width. */}
      {compact === true ? <PhoneBlockedNote /> : null}
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", maxWidth: "68ch" }}>{COPY.import.lede}</p>
      {compact === true ? null : (
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
      )}
    </IdeFrame>
  );
}

/** Auth-gated: the conversion preview (source beside converted, count line, warnings, two actions). */
export function ImportPreviewPage(): ReactNode {
  const { conversion, compact } = usePageData();
  const slug = conversion?.projectSlug ?? "";
  return (
    <IdeFrame>
      <PageTitle>{COPY.import.previewHeading}</PageTitle>
      {/* P1.19 — §10.1 ✗: ingestion never renders on phone width. */}
      {compact === true ? <PhoneBlockedNote /> : null}
      {conversion?.created ? (
        <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>
          {COPY.import.created}
        </p>
      ) : null}
      {conversion?.pending === true ? (
        // PRB.21 + ONB.1 — the converting state: text formats ride the warm convert-svc (seconds);
        // a PDF still pays the Job's cold start (minutes) — the copy says which by source label.
        // The page's meta-refresh re-polls the preview GET on the quarantine key until the
        // converted object lands — never a spinner masquerading as a hung request.
        <section style={{ maxWidth: "68ch" }}>
          <p role="status" style={{ color: "var(--shell-fg)", fontSize: "15px", lineHeight: 1.6 }}>
            {fmt(convertingCopy(conversion.sourceLabel), { name: conversion.sourceLabel })}
          </p>
          <p style={{ color: "var(--shell-fg-faint)", fontSize: "13px" }}>{COPY.import.convertingNote}</p>
        </section>
      ) : null}
      {conversion && conversion.pending !== true && compact !== true ? (
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

/** P1.04 — the §5.3 new-project sheet. Exactly three entries (Scratch / Upload an outline / Upload a
 *  draft — no fourth); Title + Protocol cards + Venue + Voice picks; the upload entries run the §5.3
 *  conversion preview (source beside converted, count line, anchored warnings, Create-and-fix-later /
 *  Fix-now) on the live PRB.20 quarantine path before anything is created. */
export function NewProjectPage(): ReactNode {
  const { newProject: np, compact } = usePageData();
  // UX.2 (ADR-065) — the workspace Shell, not the project IdeFrame: §5.1's seven regions are
  // per-project surfaces (the round log, the project's Files, the Margin's findings) and no project
  // exists yet. Until this fix the page rendered IdeFrame markup without `PageData.ide`, so the
  // document shipped no IDE stylesheet — the stacked, unstyled shell.
  const sheetShell = (children: ReactNode): ReactNode => (
    <Shell
      brand={COPY.brand}
      tagline={COPY.tagline}
      nav={<a href="/app" style={{ fontSize: "13px" }}>{COPY.newProject.backToApp}</a>}
      footer={footer()}
    >
      {children}
    </Shell>
  );
  // P1.19 — §10.1 ✗: new project never renders its controls on phone width (REQ-SPEC-20).
  if (compact === true) {
    return sheetShell(
      <>
        <PageTitle>{COPY.newProject.heading}</PageTitle>
        <PhoneBlockedNote />
      </>,
    );
  }
  const entry = np?.entry ?? "scratch";
  const form = np?.form ?? { title: "", protocolId: null, venue: null, personaId: null, startVersion: null, heldToken: null };
  const protocols = np?.protocols ?? [];
  const voices = np?.voices ?? [];
  const pickedCard = protocols.find((p) => p.id === form.protocolId) ?? null;
  const venueRows = pickedCard?.venueBar.table ?? protocols.flatMap((p) => p.venueBar.table);
  const cards = [
    { key: "scratch" as const, title: COPY.newProject.entryScratch, body: COPY.newProject.entryScratchNote },
    { key: "outline" as const, title: COPY.newProject.entryOutline, body: COPY.newProject.entryOutlineNote },
    { key: "draft" as const, title: COPY.newProject.entryDraft, body: COPY.newProject.entryDraftNote },
  ];
  return sheetShell(
    <>
      <PageTitle>{COPY.newProject.heading}</PageTitle>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", maxWidth: "68ch" }}>{COPY.newProject.lede}</p>
      {/* exactly three entry cards — each selects the sheet's entry (§5.3; no fourth exists). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", margin: "16px 0" }}>
        {cards.map((card) => (
          <a
            key={card.key}
            href={`/app/new?entry=${card.key}`}
            data-entry={card.key}
            style={{
              display: "block",
              padding: "12px 14px",
              borderRadius: "10px",
              border: `1px solid ${entry === card.key ? "var(--accent)" : "var(--shell-border)"}`,
              background: "var(--shell-surface)",
              textDecoration: "none",
              color: "var(--shell-fg)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "14px" }}>{card.title}</div>
            <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "4px" }}>{card.body}</div>
          </a>
        ))}
      </div>
      {np?.error ? (
        <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>{np.error}</p>
      ) : null}
      {np?.pending ? (
        // the converting state (PRB.21 cadence): the page's meta-refresh re-polls the preview GET.
        // ONB.1 — the wait copy is honest about the format (text = seconds on the warm service;
        // PDF = the batch Job, still minutes cold).
        <section style={{ maxWidth: "68ch" }} data-conversion-pending="true">
          <p role="status" style={{ color: "var(--shell-fg)", fontSize: "15px", lineHeight: 1.6 }}>
            {fmt(convertingCopy(np.pending.sourceLabel), { name: np.pending.sourceLabel })}
          </p>
          <p style={{ color: "var(--shell-fg-faint)", fontSize: "13px" }}>{COPY.import.convertingNote}</p>
        </section>
      ) : null}
      {np?.preview ? (
        <ConversionPreview
          sourceLabel={np.preview.sourceLabel}
          sourceText={np.preview.sourceText}
          convertedMarkdown={np.preview.convertedMarkdown}
          countLine={np.preview.countLine}
          warnings={np.preview.warnings}
          actions={{
            formAction: "/app/new/create",
            createLabel: COPY.import.createLabel,
            fixNowLabel: COPY.import.fixNowLabel,
            // replay the minted quarantine key + every pick — Create never re-uploads the bytes.
            hiddenFields: {
              entry,
              title: form.title,
              ...(form.protocolId ? { protocolId: form.protocolId } : {}),
              ...(form.venue ? { venue: form.venue } : {}),
              ...(form.personaId ? { personaId: form.personaId } : {}),
              ...(form.startVersion != null ? { startVersion: String(form.startVersion) } : {}),
              ...(form.heldToken ? { heldToken: form.heldToken } : {}),
              qk: np.preview.quarantineKey,
            },
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
      {/* ONB.1 — the held draft persists until consumed: `data-held` + the notice are rendered on
          EVERY /app/new load (not just `?held=1`) so landing.js re-hydrates the file input each
          visit; the island fills the notice and the Discard control when a hold actually exists. */}
      {np && !np.pending && !np.preview ? (
        <p data-held-notice role="status" style={{ fontSize: "13px", color: "var(--state-ready)" }} />
      ) : null}
      {np && !np.pending && !np.preview ? (
        <form method="post" action="/app/new" encType="multipart/form-data" data-held="1" data-new-project-form="true" style={{ maxWidth: "68ch" }}>
          <input type="hidden" name="entry" value={entry} />
          {/* ONB.1 — the island stamps the hold's token here; the create redirect echoes it as
              `?hc=` so the hold is deleted only after a server-confirmed consumption. */}
          <input type="hidden" name="heldToken" data-held-token value={form.heldToken ?? ""} />
          <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)" }}>
            {COPY.newProject.titleLabel}
            <input
              type="text"
              name="title"
              required={entry === "scratch"}
              defaultValue={form.title}
              placeholder={COPY.newProject.titlePlaceholder}
              style={{ display: "block", marginTop: "4px", width: "100%", maxWidth: "420px", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "14px", boxSizing: "border-box" }}
            />
          </label>
          {/* the protocol cards (REQ-GENRE-4): tagline + hold-you-to + the estimator's cost band. */}
          <fieldset style={{ border: "none", padding: 0, margin: "16px 0 0" }}>
            <legend style={{ fontSize: "13px", color: "var(--shell-fg-muted)", padding: 0 }}>{COPY.newProject.protocolLegend}</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginTop: "6px" }}>
              {protocols.map((p) => (
                <label
                  key={p.id}
                  data-protocol-card={p.id}
                  style={{
                    display: "block",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: `1px solid ${form.protocolId === p.id ? "var(--accent)" : "var(--shell-border)"}`,
                    background: "var(--shell-surface)",
                    cursor: "pointer",
                  }}
                >
                  <input type="radio" name="protocolId" value={p.id} defaultChecked={form.protocolId === p.id} style={{ marginRight: "6px" }} />
                  <span style={{ fontWeight: 600, fontSize: "13px" }}>{p.name}</span>
                  <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "4px" }}>{p.tagline}</div>
                  <div style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "4px" }}>{p.holdYouTo}</div>
                  {p.typicalReviewCredits != null ? (
                    <div
                      className="tnum"
                      data-typical-words={p.typicalWords}
                      style={{ fontSize: "11px", color: "var(--shell-fg-faint)", marginTop: "4px" }}
                    >
                      {`Review ≈ ${p.typicalReviewCredits} credits`}
                      {p.typicalReviewDuration != null
                        ? ` · ~${p.typicalReviewDuration.lowMinutes}–${p.typicalReviewDuration.highMinutes} min`
                        : ""}
                    </div>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>
          <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "16px" }}>
            {COPY.newProject.venueLabel}
            <input
              type="text"
              name="venue"
              list="np-venues"
              defaultValue={form.venue ?? ""}
              placeholder={COPY.newProject.venuePlaceholder}
              style={{ display: "block", marginTop: "4px", width: "100%", maxWidth: "420px", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "14px", boxSizing: "border-box" }}
            />
            {/* the typeahead source — the picked protocol's venue table (all tables when unpicked);
                free text always allowed (REQ-GENRE-4). */}
            <datalist id="np-venues">
              {venueRows.map((v) => (
                <option key={v.venue} value={v.venue} />
              ))}
            </datalist>
            {/* §16.4 — a stale venue row shows its authored date, never a fabricated verification. */}
            {(() => {
              const staleDates = [
                ...new Set(
                  venueRows
                    .filter((v) => v.verified_at == null && v.as_of != null)
                    .map((v) => v.as_of as string),
                ),
              ].sort();
              return staleDates.length > 0 ? (
                <span data-venue-stale style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "4px" }}>
                  {fmt(COPY.newProject.venueStaleFmt, { dates: staleDates.join(", ") })}
                </span>
              ) : null;
            })()}
          </label>
          {pickedCard?.lengthNorms.default != null ? (
            <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }} className="tnum">
              {`${COPY.newProject.lengthLabel}: ${pickedCard.lengthNorms.default} ${pickedCard.lengthNorms.unit}`}
            </p>
          ) : null}
          {/* the Voice picker (§9.6 / REQ-PERSONA-20): No voice (the ad-hoc default) + every persona
              with its shared pill; never-built voices are allowed with the honest hint. */}
          <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "16px" }}>
            {COPY.newProject.voiceLegend}
            <select name="personaId" defaultValue={form.personaId ?? ""} style={{ display: "block", marginTop: "4px", fontSize: "13px" }}>
              <option value="">{COPY.voice.picker.noVoice}</option>
              {/* REQ-PERSONA-20 — the picker groups Your voices then House styles (mode='house'). */}
              {voices.filter((v) => v.mode !== "house").length > 0 ? (
                <optgroup label={COPY.newProject.voiceGroupYours}>
                  {voices
                    .filter((v) => v.mode !== "house")
                    .map((v) => (
                      <option key={v.personaId} value={v.personaId}>
                        {`${v.name ?? v.personaId} — ${v.status.pill.label}`}
                      </option>
                    ))}
                </optgroup>
              ) : null}
              {voices.filter((v) => v.mode === "house").length > 0 ? (
                <optgroup label={COPY.newProject.voiceGroupHouse}>
                  {voices
                    .filter((v) => v.mode === "house")
                    .map((v) => (
                      <option key={v.personaId} value={v.personaId}>
                        {`${v.name ?? v.personaId} — ${v.status.pill.label}`}
                      </option>
                    ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>
            {COPY.newProject.voiceHintNeverBuilt}{" "}
            <a href="/voices/new" style={{ fontSize: "12px" }}>{COPY.voice.newCta}</a>
          </p>
          {entry === "draft" ? (
            <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "16px" }}>
              {COPY.newProject.startVersionLabel}
              <input
                type="number"
                name="startVersion"
                min={1}
                defaultValue={form.startVersion != null ? String(form.startVersion) : ""}
                style={{ display: "block", marginTop: "4px", width: "90px", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }}
              />
            </label>
          ) : null}
          {entry !== "scratch" ? (
            <>
              <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "16px" }}>
                {COPY.newProject.fileLabel}
                <input type="file" name="file" accept=".md,.txt,.html,.docx,.pdf" style={{ display: "block", marginTop: "4px", color: "var(--shell-fg)" }} />
              </label>
              <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "12px" }}>
                {COPY.newProject.pasteLabel}
                <textarea name="paste" style={textAreaStyle} />
              </label>
            </>
          ) : null}
          <div style={{ marginTop: "18px" }}>
            <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
              {entry === "scratch" ? COPY.newProject.createCta : COPY.newProject.continueCta}
            </button>
          </div>
        </form>
      ) : null}
      {/* ONB.1 — the drop-zone hold island runs on EVERY /app/new load (not just `?held=1`): a hold
          persists until consumed, so every visit re-hydrates the file input + the Discard control. */}
      {np ? <script src="/assets/landing.js" defer /> : null}
    </>,
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
  purchasePausedLabel: COPY.runSheet.purchasePaused,
  planOffer: { text: COPY.runSheet.planOffer, linkLabel: COPY.runSheet.planOfferLink },
  // P1.06 — the §5.6 collapsed-row fields + the §14.3 trial badge + the §7.2 scope comparison line.
  approvalsLabel: COPY.runSheet.approvals,
  approvalsDisplay: COPY.runSheet.approvalDisplay,
  autoRunLabel: COPY.runSheet.autoRunLabel,
  capLabel: COPY.runSheet.capLabel,
  dontAskLabel: COPY.runSheet.dontAskLabel,
  guidanceLabel: COPY.runSheet.guidanceLabel,
  guidancePlaceholder: COPY.runSheet.guidancePlaceholder,
  standingNotesFmt: COPY.runSheet.standingNotesFmt,
  protocolLabel: COPY.runSheet.protocolLabel,
  venueLabel: COPY.runSheet.venueLabel,
  stageLabel: COPY.runSheet.stageLabel,
  wholeDraftPrefix: COPY.runSheet.wholeDraftPrefix,
  includedLabel: COPY.runSheet.includedLabel,
  // EST.1 — the model-tier select, clamp notice, unmeasured-inputs state, resolution links.
  modelTierLabel: COPY.runSheet.modelTierLabel,
  tierLockedSuffix: COPY.runSheet.tierLockedSuffix,
  tierClampedFmt: COPY.runSheet.tierClampedFmt,
  estimatingLabel: COPY.runSheet.estimatingLabel,
  resolutionLabels: COPY.runSheet.resolutionLabels,
};

/** Auth-gated: the run sheet — the launcher for Review / Revise / Fact-check and the ONLY paywall (§5.6). */
export function RunSheetPage(): ReactNode {
  const { runSheet, pretriage, compact } = usePageData();
  const slug = runSheet?.slug ?? "";
  return (
    <IdeFrame>
      <PageTitle>{COPY.runSheet.heading}</PageTitle>
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
      {/* P1.19 — §10.1 ✗: run-start + run configuration never render at phone width — the compact
          read keeps the in-progress note and drops the sheet. */}
      {compact === true && runSheet && !runSheet.activeRun ? (
        <PhoneBlockedNote />
      ) : runSheet && !runSheet.activeRun ? (
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
          selfHref={`/p/${slug}/run`}
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
  // RPT.1 (REQ-SPEC-32(a)) — a provisional mid-phase metered reading renders the ≈ marker; the SSE
  // patch in ide.ts re-renders the SAME `card.meter`/`card.meterProvisional` templates (copy.ts) so
  // SSR and live rows never diverge.
  creditsLabel: (spent, cap, provisional) =>
    fmt(COPY.feed.templates[provisional === true ? "card.meterProvisional" : "card.meter"]!, {
      spentCredits: spent.toLocaleString("en-US"),
      capCredits: cap.toLocaleString("en-US"),
    }),
  etaLabel: (lo, hi) => `~${lo}–${hi} min`,
  offLabel: R.offLabel,
  counterLabel: (_key, value, of) => (of != null ? `${value} / ${of}` : String(value)),
  refundLabel: (credits) => fmt(R.refundFmt, { n: credits }),
  // RES.2 — the run-level delivery-label line above the card's state/verdict (machine value → copy).
  deliveryLabel: () => fmt(R.deliveryBannerFmt, { label: R.deliveryLabel }),
  // ---- P1.05 — the §5.5 state chrome + §6.5 steering ----
  queueLabel: (pos) => fmt(COPY.steer.queueFmt, { n: pos }),
  estimateLabel: (actual, est) =>
    fmt(COPY.steer.estimateLineFmt, { actual: actual.toLocaleString("en-US"), est: est.toLocaleString("en-US") }),
  pausedLabel: (done, total) => fmt(COPY.steer.pausedFmt, { done, total }),
  partialLabel: (done, total) => fmt(COPY.steer.partialFmt, { done, total }),
  waitingGateLabel: (kind, deadlineAt) =>
    fmt(COPY.steer.waitingGateFmt, { kind: G.kindLabel[kind] ?? kind }) + (deadlineAt != null ? ` · ${deadlineAt.slice(0, 10)}` : ""),
  queuedNotesLabel: (n) => fmt(COPY.steer.queuedNotesFmt, { n }),
  deliverableLabel: (key, count) =>
    count != null ? fmt(COPY.steer.deliverableLabel[key] ?? key, { n: count }) : (COPY.steer.deliverableLabel[key] ?? key),
  actionLabel: (action) =>
    action === "pause" ? COPY.steer.pause
    : action === "stop" ? COPY.steer.stop
    : action === "cancel" ? COPY.steer.cancel
    : action === "resume" ? COPY.steer.resume
    : action === "note" ? COPY.steer.note
    : action === "report" ? COPY.steer.report
    : action === "open_deliverable" ? COPY.steer.openDeliverable
    : action === "live_feed" ? COPY.steer.liveFeed
    : COPY.steer.retryWalkthrough,
  notePlaceholder: COPY.steer.notePlaceholder,
  walkthroughHeading: COPY.steer.walkthroughHeading,
  walkthroughPendingLabel: COPY.steer.walkthroughPending,
  walkthroughFailedLabel: COPY.steer.walkthroughFailed,
  reportLabel: COPY.steer.report,
  // P1.09 (§6.4 item 8; REQ-RUN-5/6) — the permanent approval-decision lines under the run card.
  decisionLabel: (d) => decisionLine(d),
};

// ---- P1.05 — the Timeline pane + the run report (§5.5/§14.5) ----

const TL = COPY.timeline;
const RP = COPY.report;

const timelineLabels: TimelineLabels = {
  nextStepLabel: (verb, headDraftN) =>
    fmt(TL.nextStep[verb] ?? verb, { n: headDraftN ?? "" }).replace(/\s+/g, " ").trim(),
  estimateLabel: (credits) => fmt(TL.estimateFmt, { n: credits.toLocaleString("en-US") }),
  versionLabel: (n) => fmt(TL.versionFmt, { n }),
  workflowLabel: (workflow, count) =>
    (TL.workflowLabel[workflow] ?? workflow) + (count != null ? ` ${fmt(TL.countFmt, { n: count })}` : ""),
  arrow: TL.arrow,
  originChipLabel: (kind) => TL.originChip[kind],
  runLineLabel: (workflow, createdAt) =>
    `${TL.workflowLabel[workflow] ?? workflow} · ${createdAt.slice(0, 10)}`,
  emptyText: COPY.ide.timeline.empty,
  verbLabel: (verb) => TL.verbs[verb] ?? verb,
};

/** The card action targets inside a project's pages — steering POSTs + the dossier/report links. */
function timelineHrefs(slug: string): TimelineHrefs {
  return {
    nextStep: `/p/${slug}/run`,
    reportHref: (runId) => `/p/${slug}/r/${runId}#report`,
    deliverableHref: (runId) => `/p/${slug}/review/${runId}`,
    steeringHref: (runId, action) => `/p/${slug}/r/${runId}/${action}`,
    gateHref: () => `/p/${slug}`,
    versionHref: (n) => `/p/${slug}/v/${n}`,
    verbHref: (verb) => `/p/${slug}/run?workflow=${verb}`,
  };
}

const feedLabels: LiveFeedLabels = {
  densityLabel: (d) => COPY.review.densityLabel[d] ?? d,
  heading: COPY.review.feedHeading,
};

const reportLabels: RunReportLabels = {
  heading: RP.heading,
  estimateLine: (actual, estimate, ratio) =>
    estimate != null
      ? fmt(RP.estimateFmt, { spent: actual.toLocaleString("en-US"), est: estimate.toLocaleString("en-US") }) +
        (ratio != null ? ` (${ratio}×)` : "")
      : fmt(RP.noEstimate, { spent: actual.toLocaleString("en-US") }),
  refundLine: (credits) => fmt(RP.refundFmt, { n: credits.toLocaleString("en-US") }),
  phaseHeading: RP.phaseHeading,
  phaseLabel: (k) => R.phaseLabel[k] ?? k,
  seatLabel: (seat) => (seat != null ? (RP.seatLabel[seat] ?? seat) : "—"),
  offLabel: R.offLabel,
  phaseDetail: (credits, durationMs, searches, fetches) => {
    // RPT.1 — truthful durations: a real sub-minute phase renders seconds (never "0 min"); a legacy
    // row whose commit wrote started_at = ended_at (duration 0) renders the "—" the AC words — it has
    // no duration to claim, and it must not borrow one.
    const base =
      durationMs != null
        ? durationMs === 0
          ? fmt(RP.phaseDetailDurationUnknownFmt, { credits: credits.toLocaleString("en-US") })
          : durationMs < 60_000
            ? fmt(RP.phaseDetailDurationSecFmt, {
                credits: credits.toLocaleString("en-US"),
                n: Math.max(1, Math.round(durationMs / 1000)),
              })
            : fmt(RP.phaseDetailDurationFmt, { credits: credits.toLocaleString("en-US"), n: Math.round(durationMs / 60000) })
        : fmt(RP.phaseDetailFmt, { credits: credits.toLocaleString("en-US") });
    const tail = searches > 0 || fetches > 0 ? ` · ${searches + fetches}` : "";
    return base + tail;
  },
  seatsHeading: RP.seatsHeading,
  seatSplitLine: (seat, credits, share) =>
    fmt(RP.seatSplitFmt, { seat: RP.seatLabel[seat] ?? seat, credits: credits.toLocaleString("en-US"), pct: Math.round(share * 100) }),
  flagsHeading: RP.flagsHeading,
  // RPT.1 — flags render the server-computed figures through their templated sentences (§14.5).
  flagLabel: (flag) => {
    const key =
      flag.key === "fact_check_dominated" && flag.count == null ? "fact_check_dominated_noClaims" : flag.key;
    return fmt(RP.flagLabel[key] ?? flag.key, {
      pct: flag.sharePct ?? "",
      // retries may carry a comma-joined phase list — translate each controlled key.
      phase: flag.phase != null ? flag.phase.split(",").map((k) => R.phaseLabel[k] ?? k).join(", ") : "",
      n: flag.count ?? "",
      ratio: flag.ratio ?? "",
    }).replace(/\s+\)/g, ")").trim();
  },
  meteredLine: (metered, charged) =>
    fmt(RP.meteredFmt, { metered: metered.toLocaleString("en-US"), charged: charged.toLocaleString("en-US") }),
  differenceLabel: (d) => {
    if (d.key === "refund") {
      const reason = d.reason != null ? (RP.refundReasonLabel[d.reason] ?? null) : null;
      return reason != null
        ? fmt(RP.differenceFmt["refund"] ?? "{n} cr", { n: d.credits.toLocaleString("en-US"), reason })
        : fmt(RP.differenceFmt["refundNoReason"] ?? "{n} cr", { n: d.credits.toLocaleString("en-US") });
    }
    return fmt(RP.differenceFmt[d.key] ?? "{n} cr", { n: d.credits.toLocaleString("en-US") });
  },
  workedExampleLabel: RP.workedExample,
  claimsLine: (checked, verified, perVerified) =>
    perVerified != null
      ? fmt(RP.claimsFmt, { checked, verified, per: perVerified.toLocaleString("en-US") })
      : fmt(RP.claimsNoVerifyFmt, { checked, verified }),
  driversHeading: RP.driversHeading,
  driverLabel: (key, phase, share) =>
    key === "phase_share" && phase != null && share != null
      ? fmt(RP.driverPhaseShareFmt, { phase: R.phaseLabel[phase] ?? phase, pct: Math.round(share * 100) })
      : key === "within_estimate"
        ? RP.driverWithinEstimate
        : (RP.flagLabel[key] ?? key),
  guidanceHeading: RP.guidanceHeading,
  guidanceLabel: (key) => RP.guidanceLabel[key] ?? key,
  advancedHeading: RP.advancedHeading,
  advancedColumns: RP.advancedColumns,
  notAvailable: RP.notAvailable,
  loadAdvanced: RP.loadAdvanced,
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
  searchResultLabel: R.searchResultLabel,
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
  // P1.07 — the evidence block's labels (claim findings show the verdict chip + fetched ✓, REQ-IDE-25).
  // CITE.1 — a search-hit-only url renders the "Search result" chip instead (ADR-084).
  fetchedLabel: `${R.fetchedLabel} ✓`,
  searchResultLabel: R.searchResultLabel,
  accessedLabel: (a) => a.slice(0, 10),
};

// ---- P1.07 — the §5.7 findings surfaces: Margin cards/chips + the Desk's findings table, powered by
// the SAME FindingView[] as the dossier list (one model, three surfaces). ----

const marginLabels: MarginLabels = {
  kindLabel: findingsLabels.kindLabel,
  severityLabel: findingsLabels.severityLabel,
  provisionalLabel: findingsLabels.provisionalLabel,
  dispositionLabel: findingsLabels.dispositionLabel,
  fetchedLabel: findingsLabels.fetchedLabel,
  searchResultLabel: findingsLabels.searchResultLabel,
  accessedLabel: findingsLabels.accessedLabel,
  chipLabel: (count, topSeverityLabel, topCount) =>
    fmt(R.marginChipFmt, { count, top: topCount, severity: topSeverityLabel }),
  chipAria: (count) => fmt(R.marginChipAriaFmt, { count }),
};

const deskFindingsLabels: FindingsDeskLabels = {
  table: {
    finding: R.deskTable.finding,
    severity: R.deskTable.severity,
    kind: R.deskTable.kind,
    status: R.deskTable.status,
    actions: "",
  },
  empty: R.findingsEmpty,
  filters: {
    severity: R.filters.severity,
    kind: R.filters.kind,
    status: R.filters.status,
    apply: R.filters.apply,
    clear: R.filters.clear,
    allLabel: R.filters.all,
  },
  severityLabel: (s) => R.severityLabel[s] ?? s,
  kindLabel: (k) => R.findingKindLabel[k] ?? k,
  statusLabel: (v) =>
    v.disposition ? (R.dispositionPast[v.disposition.kind] ?? v.disposition.kind) : R.filters.undecided,
  progressFmt: (decided, total) => fmt(R.triageProgressFmt, { decided, total }),
  triageExit: R.triageExit,
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

/** P1.12 — the shared spine-and-sections labels: the Approve-outline card AND the unlocked outline
 *  editor render the same component with the same copy (one table, both surfaces). */
export const outlineLabels = {
  thesisLabel: G.outline.thesisLabel,
  venueLabel: G.outline.venueLabel,
  targetLengthLabel: G.outline.targetLengthLabel,
  protocolLabel: G.outline.protocolLabel,
  voiceLabel: G.outline.voiceLabel,
  spineHeading: G.outline.spineHeading,
  sectionsHeading: G.outline.sectionsHeading,
  alternativesHeading: G.outline.alternativesHeading,
  gapsHeading: G.outline.gapsHeading,
  sourcesHeading: G.outline.sourcesHeading,
  orderLabel: G.outline.orderLabel,
  strikeLabel: G.outline.strikeLabel,
  notePlaceholder: G.outline.notePlaceholder,
  addClaimLabel: G.outline.addClaimLabel,
  addClaimPlaceholder: G.outline.addClaimPlaceholder,
  addNotePlaceholder: G.outline.addNotePlaceholder,
  addClaimSectionLabel: G.outline.addClaimSectionLabel,
  targetWordsLabel: G.outline.targetWordsLabel,
  functionLabel: G.outline.functionLabel,
  entryLabel: G.outline.entryLabel,
  exitLabel: G.outline.exitLabel,
  moveLabel: G.outline.moveLabel,
  unverifiedBadge: G.outline.unverifiedBadge,
  provenanceBadge: (kind: "thread" | "source" | "user_typed" | "generated") =>
    G.outline.provenanceBadge[kind] ?? kind,
  answerLabel: G.outline.answerLabel,
  answerPlaceholder: G.outline.answerPlaceholder,
} as const;

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
  // ---- P1.09 — the structured bodies, decision record, per-run override (§6.4 items 3/4/8) ----
  factsHeading: G.factsHeading,
  factLine: (key, value) =>
    `${G.factLabel[key] ?? key}: ${typeof value === "number" ? value.toLocaleString("en-US") : String(value ?? "—")}`,
  exceedsCapLine: G.exceedsCapLine,
  scopeFieldsHeading: G.scopeFieldsHeading,
  scopeFieldLabel: (field) => G.scopeFieldLabel[field] ?? field,
  plan: {
    spineHeading: G.plan.spineHeading,
    sectionsHeading: G.plan.sectionsHeading,
    alternativesHeading: G.plan.alternativesHeading,
    gapsHeading: G.plan.gapsHeading,
    orderLabel: G.plan.orderLabel,
    strikeLabel: G.plan.strikeLabel,
    notePlaceholder: G.plan.notePlaceholder,
    addClaimLabel: G.plan.addClaimLabel,
    addClaimPlaceholder: G.plan.addClaimPlaceholder,
    addNotePlaceholder: G.plan.addNotePlaceholder,
    targetWordsLabel: G.plan.targetWordsLabel,
    purposeLabel: G.plan.purposeLabel,
    apparatusLabel: G.plan.apparatusLabel,
  },
  thesisLabel: G.thesisLabel,
  // P1.12 — the Approve-outline spine-and-sections labels (the standalone outline editor reuses the
  // same COPY.gates.outline table via `outlineLabels` below).
  outline: outlineLabels,
  cutList: {
    heading: G.cutList.heading,
    targetLine: (targetWords) => fmt(G.cutList.targetFmt, { n: targetWords.toLocaleString("en-US") }),
    protectLabel: G.cutList.protectLabel,
    wordsLabel: (words) => fmt(G.cutList.wordsFmt, { n: words.toLocaleString("en-US") }),
  },
  decisionsHeading: G.decisionsHeading,
  decisionLabel: (decision) => decisionLine(decision),
};

/** The permanent decision line (§6.4 item 8): "approved by you at 14:02 · with 3 changes". Shared by the
 *  gate card's record list and the run card's decision lines — one wording, both surfaces. */
function decisionLine(d: GateDecisionView): string {
  return fmt(G.decisionLineFmt, {
    action: G.decisionActionLabel[d.action] ?? d.action,
    actor: G.decisionActorLabel[d.byActor] ?? d.byActor,
    time: d.at.slice(11, 16),
    changes: d.changes != null && d.changes > 0 ? fmt(G.decisionChangesFmt, { n: d.changes }) : "",
  });
}

const approvalRowLabels: ApprovalRowLabels = {
  kindLabel: (kind) => G.kindLabel[kind] ?? kind,
  deadlineLine: (absolute, remaining) => fmt(G.deadlineFmt, { absolute, remaining }),
  waitingLine: G.waitingLine,
  doNothingLine: (outcome: DoNothingOutcome) => G.doNothingLine[outcome],
  openLabel: `${G.rowOpenLabel} ▸`,
  artifactLabel: G.rowArtifactLabel,
};

/**
 * The card's "This run only" deadline select (§6.4; REQ-SPEC-1): options legal for the kind only —
 * spend/refusal kinds get no control; wait-default kinds may ADD a ≥2 h deadline; defaulted kinds may
 * remove (→ wait) or lengthen. `ed.runOverride` posts `"" | "wait" | <ms>`.
 */
function runOverrideFor(kind: GateKind): { label: string; options: { value: string; label: string }[] } | undefined {
  const def = GATE_DEFAULTS[kind];
  if (def.neverAutoProceed) return undefined;
  const options: { value: string; label: string }[] = [{ value: "", label: G.thisRunDefault }];
  if (def.deadlineMs == null) {
    options.push(
      { value: String(2 * 60 * 60 * 1000), label: fmt(COPY.approvals.overrideHoursFmt, { n: 2 }) },
      { value: String(24 * 60 * 60 * 1000), label: G.thisRun24h },
      { value: String(72 * 60 * 60 * 1000), label: G.thisRun72h },
    );
  } else {
    options.push({ value: "wait", label: G.thisRunWait });
    options.push({
      value: String(def.deadlineMs * 2),
      label: fmt(COPY.approvals.overrideHoursFmt, { n: Math.round((def.deadlineMs * 2) / 3600000) }),
    });
  }
  return { label: G.thisRunLabel, options };
}

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

// ---- P1.07 — the findings surface's per-card actions (§5.7): Apply (the free verb — the primary
// button whenever the card carries an applyable suggestion), the five disposition verbs, and
// "Add to obligations". Every control is a plain form POST — no client JS required. ----

/** The shared filters applied server-side: budget first (Quick's 40-cap), then the GET-param filters. */
function visibleDossierFindings(
  dossier: { findings: readonly FindingView[]; rigor?: string; findingObligations?: Readonly<Record<string, string>> },
  filters: Record<string, string | undefined> | undefined,
): FindingView[] {
  const parsed = parseFindingFilters(filters ?? {});
  const openObligationIds = new Set(
    Object.entries(dossier.findingObligations ?? {})
      .filter(([, s]) => LIVE_OBLIGATION_STATES.includes(s))
      .map(([id]) => id),
  );
  return filterFindings(applySeverityBudget([...dossier.findings], dossier.rigor), parsed, { openObligationIds });
}

/** A finding card's full control set — Apply (when applyGate allows) + the verbs + Add-to-obligations. */
function findingControlsFor(
  view: FindingView,
  slug: string,
  runId: string,
  compact: boolean,
  error: { findingId: string; message: string } | undefined,
  opts: { readonly hasObligation: boolean },
): ReactNode {
  const gate = applyGate(view);
  return (
    <>
      {view.suggestion != null && gate.ok ? (
        <form method="post" action={`/p/${slug}/review/${runId}/findings/${view.id}/apply`} data-apply-form={view.id} style={{ display: "inline" }}>
          <button
            type="submit"
            data-apply="true"
            title={R.applyTitle}
            style={{ fontSize: "12px", fontWeight: 600, padding: "4px 10px", borderRadius: "4px", border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--shell-bg)", cursor: "pointer" }}
          >
            {R.applyLabel}
          </button>
        </form>
      ) : null}
      {dispositionControlsFor(view, slug, runId, compact, error)}
      {/* P1.13 — the craft finding's Visualize action (§7.5's fifth entry point): opens the SAME
          visualize sheet (entry=craft_finding) with the finding's text as the request seed. */}
      {view.kind === "craft" ? (
        <a
          href={`/p/${slug}/visualize?entry=craft_finding&request=${encodeURIComponent(`${view.title} — ${view.body}`.slice(0, 300))}`}
          data-visualize-finding={view.id}
          style={{ fontSize: "12px", color: "var(--accent)" }}
        >
          {R.visualizeLabel}
        </a>
      ) : null}
      {!opts.hasObligation && !view.provisional ? (
        <form method="post" action={`/p/${slug}/findings/${view.id}/obligations`} style={{ display: "inline" }}>
          <input type="hidden" name="next" value={`/p/${slug}/review/${runId}`} />
          <button
            type="submit"
            data-add-obligation="true"
            style={{ fontSize: "12px", background: "none", border: "none", color: "var(--shell-fg-muted)", cursor: "pointer", textDecoration: "underline", padding: 0 }}
          >
            {R.addObligationLabel}
          </button>
        </form>
      ) : null}
    </>
  );
}

/** The Desk's bulk affordances (§5.7): each posts to the ONE consolidated preview — nothing blind. */
function dossierBulkActions(slug: string, runId: string, visible: readonly FindingView[]): ReactNode {
  const btn = { fontSize: "12px", padding: "4px 10px", borderRadius: "4px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", cursor: "pointer" } as const;
  const sections = [...new Set(visible.map((v) => v.letterSection).filter((s): s is NonNullable<typeof s> => s != null))];
  const action = `/p/${slug}/review/${runId}/findings/bulk-preview`;
  return (
    <div data-bulk-controls="true" style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      <form method="post" action={action} style={{ display: "inline" }}>
        <input type="hidden" name="action" value="apply_notes" />
        <button type="submit" style={btn}>{R.bulk.applyNotes}</button>
      </form>
      <form method="post" action={action} style={{ display: "inline" }}>
        <input type="hidden" name="action" value="defer_minor" />
        <button type="submit" style={btn}>{R.bulk.deferMinor}</button>
      </form>
      {sections.length > 0 ? (
        <form method="post" action={action} style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
          <input type="hidden" name="action" value="accept_section" />
          <select name="section" defaultValue={sections[0] ?? ""} style={{ fontSize: "12px" }}>
            {sections.map((s) => (
              <option key={s} value={s}>{fmt(R.sectionLabelFmt, { key: s })}</option>
            ))}
          </select>
          <button type="submit" style={btn}>{R.bulk.acceptSection}</button>
        </form>
      ) : null}
    </div>
  );
}

/**
 * P1.07 — the dossier's Margin + Desk bodies (§5.7 "three surfaces, one list"): MarginSurface renders
 * `marginItems` (cards beside passages, stacked chips for crowds), FindingsDesk renders the grouped
 * screen-reader table + the shared filter bar + the sectioned queue when `?triage=1` + the bulk
 * affordances. Everything derives from `visibleDossierFindings` — the same list the body list shows.
 */
function dossierSurfaces(data: ReturnType<typeof usePageData>): { marginBody: ReactNode; deskFindingsBody: ReactNode } | Record<string, never> {
  const dossier = data.dossier;
  if (!dossier) return {};
  const dv = data.dossierView;
  const visible = visibleDossierFindings(dossier, dv?.filters);
  const err = data.triage?.dispositionError;
  const compact = data.compact ?? false;
  const fetchLog = fetchLogFromRows(dossier.fetchLog.map((normalizedUrl) => ({ normalizedUrl })));
  const searchOnly = fetchLogFromRows((dossier.searchResultLog ?? []).map((normalizedUrl) => ({ normalizedUrl })));
  const obligationFor = (view: FindingView) => {
    const state = dossier.findingObligations?.[view.id];
    return state ? { state, label: R.obligationStateLabel[state] ?? state } : undefined;
  };
  const evidenceFor = (view: FindingView) => {
    // HOT.1 — normalize at the render seam: a view assembled without the api's row normalization (a
    // bypass regression) still renders instead of 500ing on `.urls` (ADR-019).
    const evidence = normalizeEvidence(view.evidence);
    return evidence != null
      ? {
          ...(evidence.verdict != null ? { verdictLabel: R.verdictLabel[evidence.verdict] ?? evidence.verdict } : {}),
          urls: evidenceUrlViews(evidence, fetchLog, searchOnly),
        }
      : undefined;
  };
  const controlsFor = (view: FindingView) =>
    findingControlsFor(view, dossier.slug, dossier.runId, compact, err, {
      hasObligation: dossier.findingObligations?.[view.id] != null,
    });
  const filterAction = `/p/${dossier.slug}/review/${dossier.runId}`;
  return {
    marginBody: (
      <MarginSurface
        items={marginItems(visible)}
        labels={marginLabels}
        obligationFor={obligationFor}
        controlsFor={controlsFor}
        evidenceFor={evidenceFor}
      />
    ),
    // §10.1 — the phone-width input set is "the same five verbs + a note; never a bulk action":
    // compact renders omit the bulk affordances entirely.
    deskFindingsBody: (
      <FindingsDesk
        groups={groupFindingsForList(visible)}
        labels={deskFindingsLabels}
        filterAction={filterAction}
        filters={{
          ...(dv?.filters?.sev != null ? { severity: dv.filters.sev } : {}),
          ...(dv?.filters?.kind != null ? { kind: dv.filters.kind } : {}),
          ...(dv?.filters?.disp != null ? { status: dv.filters.disp } : {}),
        }}
        severityOptions={Object.entries(R.severityLabel).map(([value, label]) => ({ value, label }))}
        kindOptions={Object.entries(R.findingKindLabel).map(([value, label]) => ({ value, label }))}
        statusOptions={[
          { value: "undecided", label: R.filters.undecided },
          ...Object.entries(R.dispositionPast).map(([value, label]) => ({ value, label })),
        ]}
        obligationFor={obligationFor}
        actionsFor={controlsFor}
        {...(dv?.triage === true ? { triage: sectionedTriageQueue(visible, { wholePiece: R.wholePieceLabel }) } : {})}
        {...(compact ? {} : { bulkActions: dossierBulkActions(dossier.slug, dossier.runId, visible) })}
      />
    ),
  };
}

// ---- P1.11 — the Desk Chat panel (§7.1/§7.4/§7.6) ------------------------------------------------

const chatDeskLabels: ChatDeskLabels = COPY.ide.chatDesk;

/**
 * The ChatDesk body from the api's `GET /projects/:id/chat` DTO. Every write endpoint is same-origin
 * (the web routes forward to the api); the §7.4 anchored composer prefills when the Page offered
 * "Ask about this draft" (`ide.chatAskAbout`).
 */
function chatPanel(
  chat: ChatPanelDto,
  slug: string,
  ide: NonNullable<ReturnType<typeof usePageData>["ide"]>,
  compact: boolean,
): ReactNode {
  return (
    <ChatDesk compact={compact}
      model={{
        threads: chat.threads.map((t) => ({
          id: t.id,
          name: t.name,
          isDefault: t.isDefault,
          archived: t.archived ?? false,
        })),
        activeThreadId: chat.activeThreadId,
        turns: chat.turns.map((t) => ({
          id: t.id,
          state: t.state,
          createdAt: t.created_at,
          spentCredits: t.spent_credits,
          capCredits: t.cap_credits,
          modelTier: t.model_tier,
        })),
        messages: chat.messages.map((msg) => ({ path: msg.mirror_path, wordCount: msg.word_count })),
        pins: chat.pins,
        sources: chat.sources,
        liveRun: chat.liveRun,
        emptyState: chat.emptyState,
        budgets: chat.budgets,
        tier: chat.defaultTier,
        ...(ide.chatAskAbout ? { askAbout: ide.chatAskAbout } : {}),
      }}
      endpoints={{
        turn: `/p/${slug}/chat/turns`,
        planDecision: `/p/${slug}/chat/plan-decision`,
        pin: `/p/${slug}/chat/pins`,
        pinRemove: (pinId) => `/p/${slug}/chat/pins/${encodeURIComponent(pinId)}/remove`,
        correction: `/p/${slug}/chat/corrections`,
        suggestion: `/p/${slug}/chat/suggestions`,
        notes: `/p/${slug}/chat/notes`,
        threadHref: (threadId) => `/p/${slug}?thread=${encodeURIComponent(threadId)}#chat`,
      }}
      labels={chatDeskLabels}
    />
  );
}

/** The §6.4 card model from a GateCardDto — shared by the Needs-you row and the Timeline card. */
function gateCardModel(gate: GateCardDto, compact: boolean): GateCardModel {
  return buildGateCard(
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
}

const AP = COPY.approvals;

const HOUR_MS = 60 * 60 * 1000;

/** The override options one kind's select offers — only legal values (REQ-SPEC-1, mirrored from the
 *  api's `defaults` rows; the server re-validates everything the form posts). */
function overrideOptions(def: { deadlineMs: number | null; overridable: boolean }): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [
    { value: "", label: AP.overrideDefaultOpt },
    { value: "wait", label: AP.overrideWaitOpt },
  ];
  if (def.deadlineMs == null) {
    // a wait-default kind may ADD a ≥ 2 h deadline.
    for (const h of [2, 24, 72]) opts.push({ value: String(h * HOUR_MS), label: fmt(AP.overrideHoursFmt, { n: h }) });
  } else {
    opts.push({ value: String(def.deadlineMs * 2), label: fmt(AP.overrideHoursFmt, { n: Math.round((def.deadlineMs * 2) / HOUR_MS) }) });
  }
  return opts;
}

/**
 * P1.09 — the Approvals settings section (§6.4 item 3 + §6.5): the three policy values verbatim with
 * their consequences, the per-kind deadline-override grid bound to REQ-SPEC-1's rules (spend/refusal
 * kinds show "always waits for you" — no control), and standing-guidance management (list / retire /
 * replace / add — retired never deleted).
 */
function ApprovalSettingsSection({
  slug,
  settings,
  returnTo,
  editable,
}: {
  slug: string;
  settings: ApprovalSettingsDto;
  /** P1.20 — set ⇒ POSTs land back on the given path (the /p/:slug/settings page) instead of /p/:slug. */
  returnTo?: string;
  /** P1.20 (REQ-GATE-10's management half) — an inline edit form per active guidance row. */
  editable?: boolean;
}): ReactNode {
  const kindLabel = (kind: string) => G.kindLabel[kind] ?? kind;
  const defaultText = (deadlineMs: number | null): string =>
    deadlineMs == null ? AP.overrideWaitOpt : `${fmt(AP.overrideHoursFmt, { n: Math.round(deadlineMs / HOUR_MS) })}`;
  const returnField = returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null;
  return (
    <section data-approval-settings="true" style={{ marginTop: "20px", maxWidth: "68ch" }}>
      <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 10px" }}>
        {AP.heading}
      </h2>
      <form method="post" action={`/p/${slug}/settings/approvals`} style={{ padding: "10px 14px", border: "1px solid var(--shell-border)", borderRadius: "8px" }}>
        {returnField}
        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)" }}>{AP.policyLegend}</legend>
          {(["named", "wait_each", "run_to_completion"] as const).map((p) => (
            <label key={p} data-policy={p} style={{ display: "block", fontSize: "13px", color: "var(--shell-fg)", marginTop: "6px" }}>
              <input type="radio" name="policy" value={p} defaultChecked={settings.policy === p} />{" "}
              {AP.policyLabel[p]}
              <span style={{ display: "block", marginLeft: "20px", fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                {AP.policyNote[p]}
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset style={{ border: "none", margin: "12px 0 0", padding: 0 }}>
          <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)" }}>{AP.overridesHeading}</legend>
          <table data-override-grid="true" style={{ marginTop: "6px", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "2px 12px 2px 0", color: "var(--shell-fg-faint)" }}>{AP.overrideKindColumn}</th>
                <th style={{ textAlign: "left", padding: "2px 12px 2px 0", color: "var(--shell-fg-faint)" }}>{AP.overrideDefaultColumn}</th>
                <th style={{ textAlign: "left", padding: "2px 0", color: "var(--shell-fg-faint)" }}>{AP.overrideColumn}</th>
              </tr>
            </thead>
            <tbody>
              {settings.defaults.map((d) => {
                const current = settings.overrides[d.kind];
                const value = current === undefined ? "" : current === null ? "wait" : String(current);
                return (
                  <tr key={d.kind} data-override-row={d.kind}>
                    <td style={{ padding: "3px 12px 3px 0", color: "var(--shell-fg)" }}>{kindLabel(d.kind)}</td>
                    <td style={{ padding: "3px 12px 3px 0", color: "var(--shell-fg-muted)" }}>{defaultText(d.deadlineMs)}</td>
                    <td style={{ padding: "3px 0" }}>
                      {d.overridable ? (
                        // UX.2 (REQ-IDE-42) — select-name: the row's kind cell is the label's text
                        // but the control still needs a programmatic name (axe select-name ×8).
                        <select name={`ov_${d.kind}`} defaultValue={value} aria-label={`${kindLabel(d.kind)} — ${AP.overrideColumn}`} style={{ fontSize: "12px" }}>
                          {overrideOptions(d).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span data-never-override="true" style={{ color: "var(--shell-fg-faint)" }}>{AP.overrideNeverLabel}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </fieldset>
        <button type="submit" style={{ marginTop: "10px", fontSize: "12px" }}>{AP.saveLabel}</button>
      </form>

      {/* §6.5 standing guidance — listed with its narrowing + created date; Retire flips active=false
          (never deleted); "replace" posts a retire + a new rule (the edit path). */}
      <div data-standing-guidance="true" style={{ marginTop: "14px", padding: "10px 14px", border: "1px solid var(--shell-border)", borderRadius: "8px" }}>
        <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{AP.standingHeading}</h3>
        {settings.standing.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0" }}>{AP.standingEmpty}</p>
        ) : (
          <ul style={{ margin: "4px 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {settings.standing.map((g) => (
              <li key={g.id} data-guidance={g.id} style={{ fontSize: "13px", color: "var(--shell-fg)" }}>
                {g.body}
                <span style={{ fontSize: "11px", color: "var(--shell-fg-faint)", marginLeft: "8px" }}>
                  {g.workflows.length > 0 ? g.workflows.join(", ") : AP.standingAllWorkflows} · {g.createdAt.slice(0, 10)}
                </span>
                <form method="post" action={`/p/${slug}/guidance/${g.id}/retire`} style={{ display: "inline", marginLeft: "8px" }}>
                  {returnField}
                  <button type="submit" data-retire="true" style={{ fontSize: "11px" }}>{AP.standingRetireLabel}</button>
                </form>
                {editable ? (
                  <details data-guidance-edit="true" style={{ marginTop: "4px" }}>
                    <summary style={{ fontSize: "11px", color: "var(--accent)", cursor: "pointer", display: "inline" }}>Edit</summary>
                    <form method="post" action={`/p/${slug}/settings/guidance/${g.id}`} style={{ marginTop: "6px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "baseline" }}>
                      {returnField}
                      <input type="text" name="body" required defaultValue={g.body} style={{ flex: "1 1 240px", fontSize: "13px", padding: "6px 10px", borderRadius: "7px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }} />
                      <input type="text" name="workflows" aria-label={AP.standingWorkflowsLabel} defaultValue={g.workflows.join(", ")} placeholder={AP.standingAllWorkflows} style={{ fontSize: "12px", padding: "5px 8px", borderRadius: "7px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", width: "140px" }} />
                      <button type="submit" data-guidance-save="true" style={{ fontSize: "12px" }}>{AP.saveLabel}</button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form method="post" action={`/p/${slug}/guidance`} style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
          {returnField}
          <input type="text" name="body" required placeholder={AP.standingAddPlaceholder} style={{ flex: "1 1 240px", fontSize: "13px", padding: "6px 10px", borderRadius: "7px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }} />
          <input type="text" name="workflows" aria-label={AP.standingWorkflowsLabel} placeholder={AP.standingAllWorkflows} style={{ fontSize: "12px", padding: "5px 8px", borderRadius: "7px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", width: "140px" }} />
          <button type="submit" style={{ fontSize: "12px" }}>{AP.standingAddLabel}</button>
        </form>
        {settings.retired.length > 0 ? (
          <details data-retired-guidance="true" style={{ marginTop: "10px" }}>
            <summary style={{ fontSize: "12px", color: "var(--shell-fg-faint)", cursor: "pointer" }}>{AP.retiredHeading} ({settings.retired.length})</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {settings.retired.map((g) => (
                <li key={g.id} data-guidance={g.id} style={{ fontSize: "12px", color: "var(--shell-fg-faint)", textDecoration: "line-through" }}>
                  {g.body}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

/**
 * P1.09 — THE gate card (§6.4): one render path for the Needs-you ApprovalRow sheet AND the Timeline's
 * run-card mount — the "identical card" contract. Structured fields post `ed.*` through the decision
 * form; `decisions` render the permanent record; `explainer` mounts the one-time inline explainer.
 */
function gateCardFor(
  gate: GateCardDto,
  slug: string,
  compact: boolean,
  error?: { findingId: string; message: string },
  opts?: {
    readonly decisions?: readonly GateDecisionView[];
    /** true ⇒ the one-time inline explainer mounts on this card (the first undismissed approval). */
    readonly explainer?: boolean;
  },
): ReactNode {
  const model = gateCardModel(gate, compact);
  const labels: GateCardLabels = opts?.explainer
    ? { ...gateCardLabels, explainer: G.explainer }
    : gateCardLabels;
  const runOverride = compact ? undefined : runOverrideFor(gate.kind as GateKind);
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
      labels={labels}
      {...(gate.artifactTitle != null
        ? {
            artifact: {
              title: gate.artifactTitle,
              // the read-before-approve sheet links the artifact's Page (P1.02's read-only read).
              ...(gate.artifactId != null ? { href: `/p/${slug}/a/${gate.artifactId}` } : {}),
            },
          }
        : {})}
      hasEscalations={hasEscalations}
      {...(gate.structured != null ? { structured: gate.structured } : {})}
      {...(opts?.decisions != null ? { decisions: opts.decisions } : {})}
      {...(opts?.explainer ? { explainerDismissAction: `/p/${slug}/explainers/approvals/dismiss` } : {})}
      {...(runOverride ? { runOverride } : {})}
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
  const { dossier, triage, compact, dossierView } = usePageData();
  if (!dossier) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{R.heading}</PageTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{R.notReviewed}</p>
      </Shell>
    );
  }

  const fetchLog = fetchLogFromRows(dossier.fetchLog.map((normalizedUrl) => ({ normalizedUrl })));
  const searchOnly = fetchLogFromRows((dossier.searchResultLog ?? []).map((normalizedUrl) => ({ normalizedUrl })));
  const claimRows: ClaimTableRow[] = dossier.claims.map((c) => ({
    ordinal: c.ordinal,
    text: c.text,
    tier: c.tier,
    verdict: c.verdict,
    verdictLabel: R.verdictLabel[c.verdict] ?? c.verdict,
    ...(c.kind ? { kind: c.kind } : {}),
    checkable: checkable(c.kind),
    ...(c.note ? { note: c.note } : {}),
    urls: claimUrlViews(c, fetchLog, searchOnly),
    // P1.13 — a figure-linked Tier-1 claim (§7.5; REQ-VIZ-13) carries the card link, so the
    // claims table shows WHICH figure each row verifies (a `none`-provenance figure's claims land
    // here too — their Unsupported verdict is the ledger row's own field).
    ...(c.figureId
      ? { figureHref: `/p/${dossier.slug}/figures/${c.figureId}`, figureLabel: R.figureClaimLabel }
      : {}),
  }));

  const trustChip = buildTrustChip(dossier.accessReport, trustLabels);
  // P1.07 — ONE list powers the body, the Margin, and the Desk: the Quick severity budget caps the
  // rendered set first, then the shared GET-param filters narrow every surface together (§5.7).
  const visible = visibleDossierFindings(dossier, dossierView?.filters);
  const budget = severityBudget([...dossier.findings], dossier.rigor);
  const groups = groupFindingsForList(visible);
  const conflicts = detectReconciliationConflicts([...dossier.findings]);
  const rejected = collapsedRejected([...dossier.findings]);
  const reconciliation = summarizeReconciliation([...dossier.findings]);

  return (
    <IdeFrame>
      {/* P1.17 (§15.4) — the Showcase banner: the workspace's read-only worked example names itself
          and offers the ONE write affordance it has (Duplicate → a normal project). */}
      {dossier.showcase ? (
        <div
          role="note"
          data-showcase-banner
          style={{
            border: "1px solid var(--shell-border)",
            borderRadius: "10px",
            padding: "12px 16px",
            margin: "0 0 16px",
            background: "var(--shell-raised)",
            fontSize: "13px",
          }}
        >
          <strong>{COPY.showcase.bannerTitle}</strong>
          <span style={{ color: "var(--shell-fg-muted)" }}> — {COPY.showcase.bannerBody} </span>
          <form method="post" action={`/p/${dossier.slug}/duplicate`} data-duplicate-form="true" style={{ display: "inline" }}>
            <button type="submit" style={{ fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              {COPY.showcase.duplicateCta}
            </button>
          </form>
        </div>
      ) : null}
      {/* P1.17 (§3.5) — `showcase.finding_anchor_viewed`: only the client observes the scroll onto the
          first finding's card — an IntersectionObserver posts the beacon once (the <60 s funnel leg). */}
      {dossier.showcase && dossier.firstFindingId ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var el=document.querySelector('[data-finding="${dossier.firstFindingId}"]');if(!el)return;var sent=false;function fire(){if(sent)return;sent=true;var b=JSON.stringify({event:"showcase.finding_anchor_viewed",props:{}});try{if(navigator.sendBeacon){navigator.sendBeacon("/a/acq",new Blob([b],{type:"application/json"}));return;}}catch(e){}fetch("/a/acq",{method:"POST",headers:{"content-type":"application/json"},body:b,keepalive:true}).catch(function(){});}var io=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++){if(es[i].isIntersecting){fire();io.disconnect();}}},{threshold:0.4});io.observe(el);setTimeout(function(){var r=el.getBoundingClientRect();if(r.top<window.innerHeight&&r.bottom>0)fire();},1200);})();`,
          }}
        />
      ) : null}
      {/* RES.2 — the persisted run-level label leads the dossier, above the verdict row
          (the same slot the card + email carry); the claim verdict stays `unverifiable`. */}
      {dossier.deliveryLabel ? (
        <div
          data-delivery-label={dossier.deliveryLabel}
          style={{
            margin: "0 0 12px",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--shell-border)",
            background: "var(--shell-raised)",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--shell-fg)",
          }}
        >
          {fmt(R.deliveryBannerFmt, { label: R.deliveryLabel })}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <PageTitle>{dossier.projectTitle}</PageTitle>
        <span style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{dossier.versionLabel}</span>
        {/* P1.06 — a scoped run's dossier carries its scope pills (the same chips the sheet showed). */}
        {(dossier.scopeLabels ?? []).map((s) => (
          <span key={s} className="ide-pill" data-scope-pill>
            {s}
          </span>
        ))}
        <VersionObligationChip
          open={dossier.openObligations}
          addressed={dossier.addressedObligations}
          label={fmt(R.obligationSummaryFmt, { open: dossier.openObligations, addressed: dossier.addressedObligations })}
        />
      </div>

      {/* P1.19 — `?gate=<id>` (the Inbox row's deep link) mounts the gate's real card at the head of
          the artifact: the approve flow reads the artifact first — and on phone width (Timeline
          hidden) this is the row's approve surface. */}
      {dossierView?.focusedGate ? (
        <section data-focused-gate={dossierView.focusedGate.id} style={{ margin: "16px 0" }}>
          {gateCardFor(dossierView.focusedGate, dossier.slug, compact ?? false, triage?.dispositionError)}
        </section>
      ) : null}

      <div style={{ margin: "16px 0" }}>
        {/* P1.05 — the dossier card carries the same actions the Timeline's card does (report link,
            walkthrough block, retry) — same view model, same labels (re-skin, never a fork). */}
        <RunCard
          view={buildRunCardView(dossier.runCard)}
          labels={runCardLabels}
          hrefs={{
            report: `/p/${dossier.slug}/r/${dossier.runId}#report`,
            deliverable: `/p/${dossier.slug}/review/${dossier.runId}`,
            retryWalkthrough: `/p/${dossier.slug}/r/${dossier.runId}/walkthrough`,
          }}
        />
      </div>

      <div style={{ margin: "16px 0" }}>
        {/* P1.07 — the letter's passage links resolve to the finding cards/rows (§5.7): each
            section lists the findings filed under its `letterSection` key. */}
        <LetterView
          title={dossier.letterTitle}
          sections={dossier.letterSections.map((s) => {
            const refs = dossier.findings
              .filter((f) => f.letterSection === s.id)
              .map((f) => ({ findingId: f.id, label: f.title }));
            return refs.length > 0 ? { ...s, findingRefs: refs } : s;
          })}
          trustChip={trustChip}
          labels={letterLabels}
        />
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
        {/* P1.07 — the one-preview bulk render (§5.7; REQ-IDE-29 amended): `?bulk=<action>` lands the
            consolidated checklist here — checked rows ride `only[]` to the dispatch POST; the skipped
            rows list their reasons. No blind accept-all exists. */}
        {/* P1.19 — §10.1 ✗ ("bulk accept/apply"): a crafted ?bulk= URL renders no confirm form at
            phone width — the preview affordance is desktop-only, like the controls that open it. */}
        {dossierView?.bulk && compact !== true ? (
          <section
            data-bulk-preview="true"
            style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "12px 14px", margin: "0 0 14px", background: "var(--shell-surface)" }}
          >
            <h3 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 8px" }}>{R.bulk.previewHeading}</h3>
            {dossierView.bulk.preview.rows.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{R.bulk.emptyPreview}</p>
            ) : (
              <form method="post" action={`/p/${dossier.slug}/review/${dossier.runId}/findings/bulk`}>
                <input type="hidden" name="action" value={dossierView.bulk.action} />
                {dossierView.bulk.section != null ? (
                  <input type="hidden" name="section" value={dossierView.bulk.section} />
                ) : null}
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px" }}>
                  {dossierView.bulk.preview.rows.map((row) => (
                    <li key={row.findingId} style={{ fontSize: "13px", padding: "4px 0" }}>
                      <label style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                        <input type="checkbox" name="only" value={row.findingId} defaultChecked />
                        <span>
                          {row.title}{" "}
                          <span style={{ color: "var(--shell-fg-muted)" }}>
                            — {R.severityLabel[row.severity] ?? row.severity} · {R.dispositionPast[row.disposition] ?? row.disposition}
                          </span>
                          {row.appliedMarkdown != null ? (
                            <code style={{ display: "block", fontSize: "11px", color: "var(--shell-fg-muted)", marginTop: "2px", whiteSpace: "pre-wrap" }}>
                              {row.appliedMarkdown.slice(0, 200)}
                            </code>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {dossierView.bulk.preview.skipped.length > 0 ? (
                  <div data-bulk-skipped="true" style={{ margin: "4px 0 8px" }}>
                    <h4 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)", margin: "0 0 4px" }}>
                      {R.bulk.skippedHeading}
                    </h4>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "12px", color: "var(--shell-fg-muted)" }}>
                      {dossierView.bulk.preview.skipped.map((s) => (
                        <li key={s.findingId}>{s.title} — {s.reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button type="submit" data-bulk-confirm="true" style={{ fontSize: "13px", fontWeight: 600, padding: "6px 14px", borderRadius: "4px", border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--shell-bg)", cursor: "pointer" }}>
                  {R.bulk.confirm}
                </button>{" "}
                <a href={`/p/${dossier.slug}/review/${dossier.runId}`} style={{ fontSize: "13px" }}>{R.bulk.cancel}</a>
              </form>
            )}
          </section>
        ) : null}
        {dossierView?.bulkDone ? (
          <p data-bulk-done="true" role="status" style={{ fontSize: "13px", color: "var(--state-ready)", margin: "0 0 10px" }}>
            {fmt(R.bulk.doneFmt, { n: dossierView.bulkDone.count })}
          </p>
        ) : null}
        {dossierView?.notice ? (
          <p
            data-finding-notice={dossierView.notice.kind}
            role={dossierView.notice.kind === "error" ? "alert" : "status"}
            style={{ fontSize: "12px", color: dossierView.notice.kind === "error" ? "var(--sev-major)" : "var(--state-ready)", margin: "0 0 10px" }}
          >
            {dossierView.notice.message ??
              (dossierView.notice.kind === "applied"
                ? R.appliedToast
                : dossierView.notice.kind === "promoted"
                  ? R.promotedToast
                  : R.obligatedToast)}
          </p>
        ) : null}
        {/* the severity-budget line (§5.7): Quick's rendered cap is honest — the folded count names
            what the roadmap absorbed. */}
        {budget.folded > 0 ? (
          <p data-severity-budget="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "4px 0 10px" }}>
            {fmt(R.severityBudgetFmt, { n: budget.folded })}
          </p>
        ) : null}
        {/* the once-per-surface evidence explainer (§5.7) — shown when any finding carries URLs. */}
        {visible.some((f) => (normalizeEvidence(f.evidence)?.urls.length ?? 0) > 0) ? (
          <p data-evidence-explainer="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 10px" }}>
            {R.evidenceExplainer}
          </p>
        ) : null}
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
            findingControlsFor(view, dossier.slug, dossier.runId, compact ?? false, triage?.dispositionError, {
              hasObligation: dossier.findingObligations?.[view.id] != null,
            })
          }
          promoteActionFor={(view) => `/p/${dossier.slug}/findings/${view.id}/promote`}
          evidenceFor={(view) => {
            const evidence = normalizeEvidence(view.evidence);
            return evidence != null
              ? {
                  ...(evidence.verdict != null
                    ? { verdictLabel: R.verdictLabel[evidence.verdict] ?? evidence.verdict }
                    : {}),
                  urls: evidenceUrlViews(evidence, fetchLog, searchOnly),
                }
              : undefined;
          }}
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

/** P1.05 — the run report page (`/p/:project/r/:run#report`; §14.5 Level 3 + the Advanced Level-4
 *  disclosure). Renders inside the IDE frame so the Timeline keeps its context. */
export function RunReportPage(): ReactNode {
  const { runReport } = usePageData();
  if (!runReport) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{RP.heading}</PageTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{RP.emptyRun}</p>
      </Shell>
    );
  }
  return (
    <IdeFrame>
      <PageTitle>{RP.heading}</PageTitle>
      <div style={{ margin: "16px 0" }}>
        <RunReport
          view={runReport.report.report}
          {...(runReport.report.advancedView ? { advanced: runReport.report.advancedView } : {})}
          labels={reportLabels}
          advancedHref={`/p/${runReport.slug}/r/${runReport.runId}?advanced=1`}
        />
      </div>
      {/* DEF.4 — the §14.4 refund-window affordance (REQ-SPEC-24(6)): rendered ONLY while the api's
          `refundWindow` block is present on the report — the flag admitting nothing ⇒ no control at
          all. A plain form POST (no-JS) to the web route that forwards `requestRefund`. */}
      {runReport.report.refundWindow?.state === "eligible" ? (
        <form method="post" action={`/p/${runReport.slug}/r/${runReport.runId}/refund`} data-refund-form="true" style={{ margin: "0 0 12px" }}>
          <button
            type="submit"
            data-refund-cta="true"
            style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "4px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", cursor: "pointer" }}
          >
            {fmt(RP.refundCtaFmt, { n: runReport.report.refundWindow.credits.toLocaleString("en-US") })}
          </button>
          <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginLeft: "8px" }}>{RP.refundNote}</span>
        </form>
      ) : null}
      {runReport.report.refundWindow?.state === "refunded" ? (
        <p data-refund-state="refunded" style={{ fontSize: "12px", color: "var(--state-ready)", margin: "0 0 12px" }}>
          {fmt(RP.refundedFmt, { n: runReport.report.refundWindow.credits.toLocaleString("en-US") })}
        </p>
      ) : null}
      {runReport.report.refundWindow?.state === "pending_review" ? (
        <p data-refund-state="pending_review" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 12px" }}>
          {fmt(RP.refundReviewFmt, { n: runReport.report.refundWindow.credits.toLocaleString("en-US") })}
        </p>
      ) : null}
      {runReport.report.refundWindow?.state === "denied" ? (
        <p data-refund-state="denied" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 12px" }}>
          {RP.refundDenied}
        </p>
      ) : null}
      {/* REQ-BILL-19 (P1.16) — the report links its frozen rate-table version to the published tables. */}
      {runReport.report.report.rateTableVersion != null ? (
        <p data-rate-table-link="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 12px" }}>
          {fmt(RP.rateTableFmt, { v: String(runReport.report.report.rateTableVersion) })}{" "}
          <a href="/pricing/rates">{RP.rateTableLink}</a>
        </p>
      ) : null}
    </IdeFrame>
  );
}

export function NotFoundPage(): ReactNode {
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <PageTitle>{COPY.notFound.heading}</PageTitle>
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
        <PageTitle>{V.heading}</PageTitle>
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
// P1.08 — the version rail (§5.8; REQ-IDE-32/34) + the generalized compare page (REQ-IDE-33) + the
// §5.13 Files pane (REQ-IDE-35/36/37). All server-rendered; the only writes are the hunk-comment POSTs
// (→ Guidance) and the restore-point apply (undoable — a pre-restore point is written first).
// ---------------------------------------------------------------------------------------------------------------------

const VR = COPY.versions;
const CP = COPY.compare;
const FP = COPY.files;

const railLabels: VersionRailLabels = {
  outline: VR.outline,
  originLabel: (origin) => VR.originLabel[origin] ?? origin,
  workingLabel: VR.workingLabel,
  frozenTitle: VR.frozenTitle,
  reviewedFlag: VR.reviewedFlag,
  answeredFlag: VR.answeredFlag,
  claimsPending: VR.claimsPending,
  obligationsFmt: (open, addressed) => fmt(VR.obligationsFmt, { open, addressed }),
  wordsFmt: (n) => fmt(VR.wordsFmt, { n }),
  dateFmt: (iso) => iso.slice(0, 10),
  compare: VR.compare,
  comparePrevious: VR.comparePrevious,
  restorePoints: VR.restorePoints,
  restoreEmpty: VR.restoreEmpty,
  restoreGroupLabel: (group, beforeReviewN) =>
    group === "before_review" && beforeReviewN != null
      ? fmt(VR.restoreGroup[group] ?? group, { n: beforeReviewN })
      : (VR.restoreGroup[group] ?? group),
  restorePointLabel: (p) => p.label ?? fmt(VR.restoreTimeFmt, { time: p.createdAt.slice(0, 16).replace("T", " "), cause: p.cause }),
  restorePreviewHeading: VR.restorePreviewHeading,
  restoreApply: VR.restoreApply,
  restoreUndoHint: VR.restoreUndoHint,
  restoredNotice: (draftN) => fmt(VR.restoredFmt, { n: draftN }),
  compareWhatChanged: whatChangedLabels,
};

const compareLabels: CompareLabels = {
  heading: CP.heading,
  versionLabel: (beforeN, afterN) => fmt(CP.versionFmt, { before: beforeN, after: afterN ?? "…" }),
  layouts: CP.layouts as CompareLabels["layouts"],
  beforeCol: CP.beforeCol,
  afterCol: CP.afterCol,
  unchangedFmt: (n) => fmt(CP.unchangedFmt, { n }),
  hunkKindLabel: (kind) => V.hunkKindLabel[kind] ?? kind,
  unlinkedNote: CP.unlinkedNote,
  noChanges: CP.noChanges,
  commentLabel: V.commentLabel,
  commentPlaceholder: V.commentPlaceholder,
  commentSubmit: V.commentSubmit,
  moves: whatChangedLabels,
};

const filesLabels: FilesPaneLabels = {
  sectionLabel: (key) => FP.sectionLabel[key] ?? key,
  provenanceLabel: (p) =>
    p.actor === "you"
      ? FP.provenanceYou
      : p.runId
        ? fmt(FP.provenanceRunFmt, {
            seat: p.seat ?? FP.provenanceSystem,
            workflow: p.workflow ?? "",
            phase: p.phase ?? "",
          })
        : FP.provenanceSystem,
  lockTitle: (lock) => FP.lockTitle[lock] ?? lock,
  lockIcon: (lock) => FP.lockIcon[lock] ?? "🔒",
  freshnessLabel: (n, stale) => fmt(stale ? FP.freshnessStaleFmt : FP.freshnessFmt, { n }),
  sealedFmt: (n) => fmt(FP.sealedFmt, { n }),
  advancedDisclosure: FP.advanced,
  empty: FP.empty,
  wordsFmt: (n) => fmt(FP.wordsFmt, { n }),
  readOnlyNote: FP.readOnlyNote,
};

/** Auth-gated: the §5.8 compare page (`/p/:slug/v/:n/diff/:m`) — three read-only layouts over the ONE
 *  server projection; the hunk comment form is the only interactive element (→ Guidance). */
export function ComparePage(): ReactNode {
  const { compare, compact } = usePageData();
  // P1.19 — §10.1 ✗: diffs never render on phone width (reader-only Page).
  if (compact === true) {
    return (
      <IdeFrame>
        <PageTitle>{CP.heading}</PageTitle>
        <PhoneBlockedNote />
      </IdeFrame>
    );
  }
  if (!compare) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{CP.heading}</PageTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{CP.notFound}</p>
      </Shell>
    );
  }
  const { slug, n, m, layout, data } = compare;
  return (
    <IdeFrame>
      <CompareView
        beforeN={data.before.n}
        afterN={data.after.n}
        layout={layout}
        diff={data.diff}
        // the wire shape is the findings-core view model modulo `unlinked.entries` being unknown[].
        view={data.view as unknown as Parameters<typeof CompareView>[0]["view"]}
        linked={data.responseId != null}
        layoutHref={(l) => `/p/${slug}/v/${n}/diff/${m}?layout=${l}`}
        commentFormAction={(hunkId) => `/p/${slug}/v/${n}/diff/${m}/hunks/${hunkId}/comments`}
        labels={compareLabels}
      />
      {compare.commentedHunkId ? (
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
  const { editor, compact } = usePageData();
  // P1.19 — §10.1 ✗: the source editor never renders on phone width (reader-only Page).
  if (compact === true) {
    return (
      <IdeFrame>
        <PageTitle>{E.notFound}</PageTitle>
        <PhoneBlockedNote />
      </IdeFrame>
    );
  }
  if (!editor) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{E.notFound}</PageTitle>
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
          kind: f.kind,
          suggestion: f.suggestion,
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
  const { page, compact } = usePageData();
  if (!page) return null;
  const { slug, doc } = page;
  const base = `/p/${slug}/edit/${doc.draftId}`;
  const rail = page.rail;
  return (
    <>
    {rail ? (
      // P1.08 — the §5.8 chip strip over the Page (the compare-previous link + the restore-points
      // dropdown live here; ⌘⇧C in the island follows the same link). P1.19 — §10.1 ✗: at phone
      // width the rail keeps only the version chips (diffs + restore are desktop surfaces).
      <VersionRail
        compact={compact === true}
        versions={rail.data.drafts}
        outline={rail.data.outline}
        chip={rail.data.chip}
        currentN={rail.currentN}
        hrefs={{
          version: (n) => `/p/${slug}/v/${n}`,
          artifact: (id) => `/p/${slug}/a/${id}`,
          diff: (b, a) => `/p/${slug}/v/${b}/diff/${a}`,
          restorePreview: (pid) => `/p/${slug}/v/${rail.currentN}?restore=${pid}`,
        }}
        restore={{
          points: rail.points,
          restoreAction: (pid) => `/p/${slug}/v/${rail.currentN}/restore/${pid}`,
          ...(rail.preview
            ? {
                preview: {
                  point: rail.preview.point,
                  // the wire shape is the findings-core view model modulo `unlinked.entries`.
                  view: rail.preview.view as unknown as Parameters<typeof WhatChangedView>[0]["view"],
                },
              }
            : {}),
        }}
        {...(rail.restoredN != null ? { restoredN: rail.restoredN } : {})}
        labels={railLabels}
      />
    ) : null}
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
          kind: f.kind,
          suggestion: f.suggestion,
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
        // P1.19 — §10.1: the Page is reader-only at phone width (editing is the ✗ column) — the
        // island mounts read-only too (readOnly flows to the editor island verbatim).
        readOnly={page.readOnly === true || compact === true}
        {...(page.collabWsUrl ? { collabWsUrl: page.collabWsUrl } : {})}
        saveUrl={`${base}/save`}
        docUrl={`${base}/doc`}
        noteUrl={`${base}/note`}
        cancelUrl={`${base}/cancel-run`}
        reviseUrl={`${base}/revise`}
        noteSaved={page.noteSaved}
        {...(page.focusFindingId ? { focusFindingId: page.focusFindingId } : {})}
        figureHrefFor={(figureId) => `/p/${slug}/figures/${figureId}`}
        editFigureLabel={COPY.figureCard.editFigureLabel}
        labels={pageLabels}
      />
    </>
  );
}

export function PagePage(): ReactNode {
  const { page } = usePageData();
  if (!page) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{E.notFound}</PageTitle>
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

/** One library card (§9.1): name + byline, the shared pill, samples/sources/projects, the tier
 *  badge, "Composed from …" for composites, and the read-only note + Fork for house/shared cards. */
function VoiceCard({ v }: { v: VoiceListRowDto }): ReactNode {
  return (
    <li key={v.personaId} data-voice-card={v.personaId} data-voice-group={v.group} style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px 14px" }}>
      <a href={`/v/${v.personaId}`} style={{ fontWeight: 600, fontSize: "14px" }}>
        {v.name ?? v.personaId}
      </a>
      {v.byline ? <span style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}> · {v.byline}</span> : null}
      {v.readOnly ? (
        <span data-read-only="true" style={{ color: "var(--shell-fg-faint)", fontSize: "11px", marginLeft: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {VC.card.readOnlyNote}
        </span>
      ) : null}
      {v.tier ? (
        <span data-voice-tier={v.tier} style={{ color: "var(--shell-fg-faint)", fontSize: "11px", marginLeft: "8px" }}>
          {VC.card.tierLabel[v.tier] ?? v.tier}
        </span>
      ) : null}
      {v.members.length > 0 ? (
        <div data-composed-from="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "2px" }}>
          {fmt(VC.card.composedFmt, { names: v.members.map((m) => m.name ?? m.personaId).join(", ") })}
        </div>
      ) : null}
      <div style={{ marginTop: "4px", display: "flex", gap: "12px", alignItems: "center", fontSize: "12px", color: "var(--shell-fg-faint)", flexWrap: "wrap" }}>
        {voicePillSpan(v.status)}
        <span>{fmt(VC.sampleCountFmt, { n: v.sampleCount })}</span>
        {v.sources.length > 0 ? <span data-voice-sources="true">{v.sources.join(" · ")}</span> : null}
        {v.projectCount > 0 ? <span>{fmt(VC.card.projectsFmt, { n: v.projectCount })}</span> : null}
        {v.lastBuiltAt ? (
          <span>{fmt(VC.card.lastBuiltFmt, { d: new Date(v.lastBuiltAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) })}</span>
        ) : null}
        {v.readOnly ? (
          <form method="post" action={`/v/${v.personaId}/fork`} style={{ margin: 0 }}>
            <button type="submit" data-fork-voice={v.personaId} style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}>
              {VC.card.forkCta}
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

/** Auth-gated: the /app/voices destination (§9.1) — three groups: Your voices (editable), House
 *  styles (read-only, forkable), Shared with you (read-only, forkable). Every card carries the
 *  shared pill; the server splits the groups — the page renders them verbatim. */
export function VoicesPage(): ReactNode {
  const { voices, compact } = usePageData();
  const groups = voices?.groups;
  const sections: { key: "your_voices" | "house_styles" | "shared_with_you"; heading: string; empty: string }[] = [
    { key: "your_voices", heading: VC.groups.yours, empty: VC.groups.yoursEmpty },
    { key: "house_styles", heading: VC.groups.house, empty: VC.groups.houseEmpty },
    { key: "shared_with_you", heading: VC.groups.shared, empty: VC.groups.sharedEmpty },
  ];
  const total = (voices?.voices ?? []).length;
  return (
    <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
      <PageTitle>{VC.listHeading}</PageTitle>
      {/* P1.19 — §10.1 ✗: new voice is a building surface — never offered on phone width. */}
      {compact === true ? null : (
      <p>
        <a href="/voices/new" data-new-voice="true">{VC.newCta}</a>
      </p>
      )}
      {total === 0 ? (
        <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{VC.listEmpty}</p>
      ) : (
        sections.map((s) => {
          const rows = groups?.[s.key] ?? [];
          return (
            <section key={s.key} data-voice-group-section={s.key} style={{ marginTop: "16px" }}>
              <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                {s.heading}
              </h2>
              {rows.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--shell-fg-faint)", margin: "4px 0" }}>{s.empty}</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                  {rows.map((v) => (
                    <VoiceCard key={v.personaId} v={v} />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </Shell>
  );
}

/** Auth-gated: the §9.2 creation sheet — name required; description, byline, one pasted sample, Mode
 *  (metadata only, Q-11) and the tier radio optional; the AUP one-liner sits above the actions. */
export function VoiceNewPage(): ReactNode {
  const { voiceNew, compact } = usePageData();
  // P1.19 — §10.1 ✗: voice building never renders its form on phone width (REQ-SPEC-20).
  if (compact === true) {
    return (
      <Shell brand={COPY.brand} nav={<a href="/voices">{VC.detail.backToList}</a>} footer={footer()}>
        <PageTitle>{VC.new.heading}</PageTitle>
        <PhoneBlockedNote />
      </Shell>
    );
  }
  return (
    <Shell brand={COPY.brand} nav={<a href="/voices">{VC.detail.backToList}</a>} footer={footer()}>
      <PageTitle>{VC.new.heading}</PageTitle>
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
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "8px" }}>
          {VC.new.sampleUrlLabel}
          <input name="sample_url" type="url" placeholder="https://…" style={fieldStyle} />
        </label>
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.new.sampleUrlHint}</p>
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.new.sampleHint}</p>
        <fieldset style={{ border: "none", padding: 0, margin: "16px 0 0" }}>
          <legend style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.new.tierLabel}</legend>
          <label style={{ display: "block", fontSize: "14px", marginTop: "6px" }}>
            <input type="radio" name="tier" value="quick" defaultChecked /> {VC.new.quickOption}
            <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}> · {VC.new.quickHint}</span>
          </label>
          <label style={{ display: "block", fontSize: "14px", marginTop: "6px" }}>
            <input type="radio" name="tier" value="full" data-tier-full="true" /> {VC.new.fullOption}
            <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}> · {VC.new.fullHint}</span>
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

/** P1.07 — the palette's free-form obligation form (REQ-OBJ-10): a plain POST that files a
 *  `source: 'user'` standing obligation on the project's head draft. The palette row navigates here;
 *  Cancel/`next` return to wherever the request came from. */
export function ObligationNewPage(): ReactNode {
  const { obligationNew } = usePageData();
  const slug = obligationNew?.slug ?? "";
  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{obligationNew?.projectTitle ?? "Project"}</a>} footer={footer()}>
      <PageTitle>{COPY.obligation.heading}</PageTitle>
      <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>{COPY.obligation.lede}</p>
      {obligationNew?.error ? (
        <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>{obligationNew.error}</p>
      ) : null}
      <form method="post" action={`/p/${slug}/obligations`} data-obligation-form="true" style={{ maxWidth: "68ch" }}>
        <input type="hidden" name="next" value={obligationNew?.back ?? `/p/${slug}`} />
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block" }}>
          {COPY.obligation.titleLabel}
          <input name="title" required placeholder={COPY.obligation.titlePlaceholder} style={fieldStyle} />
        </label>
        <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "12px" }}>
          {COPY.obligation.severityLabel}{" "}
          <select name="severity" defaultValue="minor" style={{ fontSize: "13px" }}>
            <option value="blocking">blocking</option>
            <option value="major">major</option>
            <option value="minor">minor</option>
            <option value="note">note</option>
          </select>
        </label>
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{COPY.obligation.severityHint}</p>
        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
            {COPY.obligation.createCta}
          </button>
          <a href={obligationNew?.back ?? `/p/${slug}`} style={{ padding: "8px 16px", fontSize: "14px", color: "var(--shell-fg-muted)" }}>
            {COPY.obligation.cancel}
          </a>
        </div>
      </form>
    </Shell>
  );
}

const VOICE_TABS = ["overview", "description", "samples", "profile", "runs"] as const;

/** The tab bar — server-rendered links (`?tab=`); no client JS. */
function voiceTabBar(pid: string, active: string): ReactNode {
  return (
    <nav data-voice-tabs="true" style={{ display: "flex", gap: "14px", borderBottom: "1px solid var(--shell-border)", margin: "12px 0 16px", fontSize: "13px" }}>
      {VOICE_TABS.map((t) => (
        <a
          key={t}
          href={t === "overview" ? `/v/${pid}` : `/v/${pid}?tab=${t}`}
          data-voice-tab={t}
          aria-current={active === t ? "page" : undefined}
          style={{
            padding: "6px 2px",
            color: active === t ? "var(--shell-fg)" : "var(--shell-fg-muted)",
            fontWeight: active === t ? 600 : 400,
            borderBottom: active === t ? "2px solid var(--accent)" : "2px solid transparent",
            textDecoration: "none",
          }}
        >
          {VC.detail.tabs[t]}
        </a>
      ))}
    </nav>
  );
}

/** The §9.3 diff-of-inputs panel — four facts in plain words (never hashes), plus the ONE verb's
 *  routed sentence. Every row renders the server's `changed` flag; the panel never re-derives. */
function VoiceFactsPanelView({ detail, plan }: { detail: VoiceDetailDto; plan?: { route: { sentence: string } } }): ReactNode {
  const panel = detail.factsPanel;
  if (!panel) return null;
  return (
    <section data-facts-panel="true" style={{ marginTop: "14px", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px 14px", maxWidth: "68ch" }}>
      <h2 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 6px", color: "var(--shell-fg-muted)" }}>{VC.detail.factsHeading}</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
        {panel.facts.map((f) => (
          <li key={f.key} data-fact={f.key} data-changed={f.changed ? "true" : "false"} style={{ color: f.changed ? "var(--shell-fg)" : "var(--shell-fg-muted)" }}>
            <span style={{ fontWeight: f.changed ? 600 : 400 }}>{f.label}</span>
            {" — "}
            {f.line}
          </li>
        ))}
      </ul>
      {panel.corpusWords.built != null ? (
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0 0" }}>
          {fmt(VC.detail.corpusLineFmt, {
            built: panel.corpusWords.built.toLocaleString("en-US"),
            current: panel.corpusWords.current.toLocaleString("en-US"),
          })}
          {panel.ageDays != null ? ` · ${fmt(VC.detail.ageFmt, { n: panel.ageDays })}` : ""}
        </p>
      ) : null}
      {plan?.route.sentence ? (
        <p data-update-route="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }}>
          {plan.route.sentence}
        </p>
      ) : null}
    </section>
  );
}

/** The §9.2 approve_sample gate card — census counts, exclusions with reasons, the hold-out line
 *  (identity never named), estimate/cap, and the three actions. */
function VoiceGateCardView({ pid, gate }: { pid: string; gate: NonNullable<VoiceDetailDto["gate"]> }): ReactNode {
  const card = gate.card;
  return (
    <section data-gate-card="true" style={{ marginTop: "14px", border: "1px solid var(--accent)", borderRadius: "8px", padding: "12px 14px", maxWidth: "68ch" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.gateHeading}</h2>
      <p style={{ fontSize: "13px", margin: "0 0 4px" }}>{card.includedLine}</p>
      {card.exclusions.length > 0 ? (
        <>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "6px 0 2px" }}>{VC.detail.gateExclusionsHeading}</p>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {card.exclusions.map((e) => (
              <li key={e.title}>
                {e.title} — {e.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {card.holdoutLine ? (
        <p data-holdout-line="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "6px 0 0" }}>{card.holdoutLine}</p>
      ) : null}
      {card.calibrationWarning ? (
        <p data-calibration-warning="true" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "6px 0 0" }}>{card.calibrationWarning}</p>
      ) : null}
      {card.estimate.credits != null ? (
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0 0" }}>
          {fmt(VC.detail.gateEstimateFmt, { n: card.estimate.credits, cap: card.estimate.capCredits ?? "—" })}
        </p>
      ) : null}
      {card.waitingUntil ? (
        <p data-gate-waiting="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "6px 0 0" }}>
          Available after {new Date(card.waitingUntil).toLocaleString("en-US", { timeZone: "UTC" })}
        </p>
      ) : null}
      <form method="post" action={`/v/${pid}/gates/${gate.gateId}`} style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        <input type="hidden" name="runId" value={gate.runId} />
        <button type="submit" name="action" value="approve" data-gate-approve="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          {VC.detail.gateApprove}
        </button>
        <button type="submit" name="action" value="wait" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
          {VC.detail.gateWait}
        </button>
        <button type="submit" name="action" value="stop" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "none", color: "var(--sev-major)", fontSize: "13px", cursor: "pointer" }}>
          {VC.detail.gateStop}
        </button>
      </form>
    </section>
  );
}

/** The §9.4 calibration table — target vs prediction vs the revealed hold-out, one band wide. */
function VoiceCalibrationTable({ calibration }: { calibration: NonNullable<VoiceDetailDto["calibration"]> }): ReactNode {
  const t = VC.detail.calibrationTable;
  return (
    <section data-calibration="true" style={{ marginTop: "16px", maxWidth: "68ch" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 4px" }}>{VC.detail.calibrationHeading}</h2>
      {calibration.verdict ? (
        <p data-calibration-verdict={String(calibration.verdict)} style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>
          {VC.detail.calibrationVerdict[String(calibration.verdict)] ?? String(calibration.verdict)}
          {" · "}
          {fmt(VC.detail.calibrationWithinFmt, { n: calibration.withinCount, total: calibration.totalCount })}
        </p>
      ) : null}
      <table style={{ fontSize: "12px", borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
            <th style={{ padding: "3px 8px 3px 0", fontWeight: 500 }}>{t.feature}</th>
            <th style={{ padding: "3px 8px", fontWeight: 500 }}>{t.target}</th>
            <th style={{ padding: "3px 8px", fontWeight: 500 }}>{t.prediction}</th>
            <th style={{ padding: "3px 8px", fontWeight: 500 }}>{t.real}</th>
            <th style={{ padding: "3px 0", fontWeight: 500 }}>{t.band}</th>
          </tr>
        </thead>
        <tbody>
          {calibration.rows.map((r) => (
            <tr key={r.feature} data-calibration-row={r.feature} data-within-band={r.withinBand ? "true" : "false"}>
              <td style={{ padding: "3px 8px 3px 0" }}>{r.feature}</td>
              <td style={{ padding: "3px 8px" }}>{r.target}</td>
              <td style={{ padding: "3px 8px" }}>{r.prediction ?? "—"}</td>
              <td style={{ padding: "3px 8px" }}>{r.actual}</td>
              <td style={{ padding: "3px 0", color: r.withinBand ? "var(--state-ready)" : "var(--sev-major)" }}>
                {r.withinBand ? "✓" : "✗"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------
// P1.15 — the Samples tab's ingestion surface (§9.5): the Sources pane (link/discover/confirm/
// re-sync/settings/remove), the items list's state + quality badges, the sample drawer (preview +
// version history + the priced reconstruction CTAs), and the voice delete.
// ---------------------------------------------------------------------------------------------------------

/** One linked source card: provider + handle, counts, the verbatim error line, and the source's
 *  actions. Items awaiting the confirm step (state 'new') render as a checkbox review form —
 *  unchecked items stay omitted and are NEVER fetched (REQ-INGEST-4/5). */
function VoiceSourceCard({ pid, conn, samples }: { pid: string; conn: VoiceConnectionDto; samples: readonly VoiceSampleDto[] }): ReactNode {
  const pending = samples.filter((s) => s.connection_id === conn.id && s.state === "new" && s.external_id);
  return (
    <li data-source={conn.id} data-provider={conn.provider} style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "8px 12px", fontSize: "13px" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" }}>
        <strong>{conn.provider === "substack" ? "Substack" : conn.provider === "substack_export" ? "Substack export" : conn.provider === "url" ? "URL" : conn.provider}</strong>
        <span style={{ color: "var(--shell-fg-muted)", fontSize: "12px" }}>{conn.handle ?? ""}</span>
        <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>
          {fmt(VC.detail.sourceItemsFmt, { included: String(conn.included), items: String(conn.items) })}
          {" · "}
          {conn.last_sync_at
            ? fmt(VC.detail.lastSyncFmt, { at: new Date(conn.last_sync_at).toLocaleString("en-US", { timeZone: "UTC" }) })
            : VC.detail.neverSynced}
        </span>
      </div>
      {conn.error ? (
        <p data-source-error="true" style={{ color: "var(--sev-major)", fontSize: "12px", margin: "6px 0 0" }}>{conn.error}</p>
      ) : null}
      <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
        {conn.provider !== "upload" && conn.provider !== "paste" ? (
          <form method="post" action={`/v/${pid}/connections/${conn.id}/discover`} style={{ margin: 0 }}>
            <button type="submit" data-discover="true" style={{ fontSize: "12px", background: "none", border: "1px solid var(--shell-border)", borderRadius: "6px", color: "var(--shell-fg)", padding: "3px 10px", cursor: "pointer" }}>
              {VC.detail.discoverCta}
            </button>
          </form>
        ) : null}
        <form method="post" action={`/v/${pid}/connections/${conn.id}/sync`} style={{ margin: 0 }}>
          <button type="submit" data-resync="true" style={{ fontSize: "12px", background: "none", border: "1px solid var(--shell-border)", borderRadius: "6px", color: "var(--shell-fg)", padding: "3px 10px", cursor: "pointer" }}>
            {VC.detail.resyncCta}
          </button>
        </form>
        <form method="post" action={`/v/${pid}/connections/${conn.id}/remove`} style={{ margin: 0 }}>
          <button type="submit" data-remove-source="true" style={{ fontSize: "12px", background: "none", border: "1px solid var(--shell-border)", borderRadius: "6px", color: "var(--sev-major)", padding: "3px 10px", cursor: "pointer" }}>
            {VC.detail.removeSourceCta}
          </button>
        </form>
      </div>
      {/* the per-source settings (§9.5 Settings): auto-include + daily auto-sync. */}
      <form method="post" action={`/v/${pid}/connections/${conn.id}/settings`} data-source-settings-form="true" style={{ margin: "6px 0 0", display: "flex", gap: "12px", alignItems: "center", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
        <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <input type="checkbox" name="autoIncludeNew" defaultChecked={conn.auto_include_new !== false} />
          {VC.detail.autoIncludeLabel}
        </label>
        <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <input type="checkbox" name="dailySync" defaultChecked={conn.schedule === "daily"} />
          {VC.detail.dailySyncLabel}
        </label>
        <button type="submit" style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }}>{VC.detail.saveSettingsCta}</button>
      </form>
      {/* the review step: 'new' items wait for the confirm click — a checked box includes, an
          unchecked one omits, and nothing fetches before this posts (REQ-INGEST-4). */}
      {pending.length > 0 ? (
        <form method="post" action={`/v/${pid}/connections/${conn.id}/confirm`} data-confirm="true" style={{ marginTop: "8px", borderTop: "1px solid var(--shell-border)", paddingTop: "8px" }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "4px" }}>
            {pending.map((s) => (
              <li key={s.id} data-review-item={s.external_id ?? s.id} style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "12px" }}>
                <input type="hidden" name="known" value={s.external_id ?? ""} />
                <input type="checkbox" name="include" value={s.external_id ?? ""} defaultChecked={s.access === "free"} />
                <span style={{ flex: 1 }}>{s.title ?? s.external_id ?? s.id}</span>
                {s.access === "paywalled" ? (
                  <span style={{ color: "var(--sev-major)" }}>{VC.detail.paywallBadge}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: "11px", color: "var(--shell-fg-faint)", margin: "6px 0 4px" }}>{VC.detail.confirmNote}</p>
          <button type="submit" data-confirm-cta="true" style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontWeight: 600, cursor: "pointer" }}>
            {VC.detail.confirmCta}
          </button>
        </form>
      ) : null}
    </li>
  );
}

/** The Sources pane — linked providers + the three link flows + "Re-sync all". */
function VoiceSourcesPane({ pid, connections, samples }: { pid: string; connections?: VoiceConnectionsDto; samples: readonly VoiceSampleDto[] }): ReactNode {
  const conns = connections?.connections ?? [];
  return (
    <section data-sources="true" style={{ marginBottom: "16px" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.sourcesHeading}</h2>
      {conns.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.sourcesEmpty}</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "8px" }}>
            {conns.map((cn) => (
              <VoiceSourceCard key={cn.id} pid={pid} conn={cn} samples={samples} />
            ))}
          </ul>
          <form method="post" action={`/v/${pid}/sync`} style={{ margin: "8px 0 0" }}>
            <button type="submit" data-resync-all="true" style={{ fontSize: "12px", background: "none", border: "1px solid var(--shell-border)", borderRadius: "6px", color: "var(--shell-fg)", padding: "4px 12px", cursor: "pointer" }}>
              {VC.detail.resyncAllCta}
            </button>
          </form>
        </>
      )}
      {/* the three link flows — no credential field exists anywhere (never-cookies, AC-I-B). */}
      <div style={{ display: "grid", gap: "8px", marginTop: "10px", fontSize: "12px" }}>
        <form method="post" action={`/v/${pid}/connections`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input type="hidden" name="provider" value="substack" />
          <label style={{ flex: 1, color: "var(--shell-fg-muted)" }}>
            {VC.detail.linkSubstackLabel}
            <input name="handle" placeholder={VC.detail.linkSubstackPlaceholder} style={{ ...fieldStyle, marginTop: "2px" }} />
          </label>
          <button type="submit" data-link-substack="true" style={{ ...submitStyle, width: "auto", padding: "5px 12px", fontSize: "12px" }}>{VC.detail.linkSubstackCta}</button>
        </form>
        <form method="post" action={`/v/${pid}/connections`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input type="hidden" name="provider" value="url" />
          <label style={{ flex: 1, color: "var(--shell-fg-muted)" }}>
            {VC.detail.linkUrlLabel}
            <input name="url" type="url" placeholder="https://…" style={{ ...fieldStyle, marginTop: "2px" }} />
          </label>
          <button type="submit" data-link-url="true" style={{ ...submitStyle, width: "auto", padding: "5px 12px", fontSize: "12px" }}>{VC.detail.linkUrlCta}</button>
        </form>
        <form method="post" action={`/v/${pid}/connections`} encType="multipart/form-data" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input type="hidden" name="provider" value="substack_export" />
          <label style={{ flex: 1, color: "var(--shell-fg-muted)" }}>
            {VC.detail.linkExportLabel}
            <input type="file" name="file" accept=".zip" style={{ display: "block", marginTop: "2px", color: "var(--shell-fg)" }} />
          </label>
          <button type="submit" data-link-export="true" style={{ ...submitStyle, width: "auto", padding: "5px 12px", fontSize: "12px" }}>{VC.detail.linkExportCta}</button>
        </form>
      </div>
    </section>
  );
}

/** The sample drawer (§9.5): state/access + quality verdict with its notes, the canonical preview,
 *  the version history, and the priced reconstruction CTAs — the estimate rides the button label,
 *  and the visual tier only appears when the notes flag a scanned/no-text-layer source. */
function VoiceSampleDrawer({ pid, detail, compact = false }: { pid: string; detail: VoiceSampleDetailDto; compact?: boolean }): ReactNode {
  const head = detail.versions[0];
  const quality = head?.quality ?? null;
  const notes = [...(head?.quality_notes ?? [])];
  const visualOffered =
    quality === "unreadable" || notes.some((n) => /visual tier|scanned/i.test(n));
  return (
    <section data-sample-drawer="true" style={{ border: "1px solid var(--accent)", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 2px" }}>
        {detail.item.title ?? VC.detail.drawerHeading}
      </h2>
      <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>
        {VC.detail.stateBadge[detail.item.state] ?? detail.item.state}
        {detail.item.access === "paywalled" ? ` · ${VC.detail.paywallBadge}` : ""}
        {quality ? ` · ${VC.detail.qualityBadge[quality] ?? quality}` : ""}
        {detail.item.url ? <> · <a href={detail.item.url} style={{ color: "var(--accent)" }}>{detail.item.url}</a></> : null}
      </p>
      {notes.length > 0 ? (
        <div data-quality-notes="true" style={{ margin: "6px 0" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "0 0 2px" }}>{VC.detail.qualityNotesHeading}</h3>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* the priced reconstruction — text tier always for non-clean; visual only when the notes
          flag a scanned/no-text-layer source (the opt-in ~180-credit pass).
          P1.19 — §10.1 ✗: a building control — suppressed on phone width. */}
      {!compact && quality && quality !== "clean" && quality !== "reconstructed" ? (
        <div style={{ display: "flex", gap: "8px", margin: "8px 0", flexWrap: "wrap" }}>
          <form method="post" action={`/v/${pid}/samples/${detail.item.id}/reconstruct`} style={{ margin: 0 }}>
            <input type="hidden" name="tier" value="text" />
            <button type="submit" data-reconstruct-text="true" style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", cursor: "pointer" }}>
              {VC.detail.reconstructTextCta}
            </button>
          </form>
          {visualOffered ? (
            <form method="post" action={`/v/${pid}/samples/${detail.item.id}/reconstruct`} style={{ margin: 0 }}>
              <input type="hidden" name="tier" value="visual" />
              <button type="submit" data-reconstruct-visual="true" style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", cursor: "pointer" }}>
                {VC.detail.reconstructVisualCta}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
      <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "8px 0 2px" }}>{VC.detail.previewHeading}</h3>
      {detail.document ? (
        <pre data-sample-preview="true" style={{ fontSize: "12px", whiteSpace: "pre-wrap", maxHeight: "320px", overflow: "auto", border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "8px", margin: 0 }}>
          {detail.document}
        </pre>
      ) : (
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>{VC.detail.noDocument}</p>
      )}
      {detail.versions.length > 0 ? (
        <>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "8px 0 2px" }}>{VC.detail.versionsHeading}</h3>
          <ul data-sample-versions="true" style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {detail.versions.map((v) => (
              <li key={v.id} data-version={v.n}>
                {fmt(VC.detail.versionFmt, { n: String(v.n), quality: v.quality ?? "—" })}
                {v.word_count != null ? ` · ${v.word_count.toLocaleString("en-US")} w` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** Auth-gated: the voice detail page (§9.5) — five tabs: Overview (pill + diff-of-inputs + the one
 *  verb + gate card + hub), Description (seed editor + corrections ledger + build notes), Samples
 *  (include/omit + the hold-out badge + paste/URL/file), Profile (fixed §9.4 order + calibration
 *  table + measures), Runs (build history). */
export function VoiceDetailPage(): ReactNode {
  const { voice, compact } = usePageData();
  const d = voice?.detail;
  const pid = d?.persona.id ?? "";
  const tab = VOICE_TABS.includes(voice?.tab as (typeof VOICE_TABS)[number]) ? (voice?.tab as (typeof VOICE_TABS)[number]) : "overview";
  const holdout = d?.holdout;
  return (
    <Shell brand={COPY.brand} nav={<a href="/voices">{VC.detail.backToList}</a>} footer={footer()}>
      <PageTitle>{d?.persona.display_name ?? ""}</PageTitle>
      {d?.persona.byline ? <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px", marginTop: "-6px" }}>{d.persona.byline}</p> : null}
      {d && d.members && d.members.length > 0 ? (
        <p data-composed-from="true" style={{ color: "var(--shell-fg-muted)", fontSize: "12px", marginTop: "2px" }}>
          {fmt(VC.card.composedFmt, { names: d.members.map((m) => m.display_name ?? m.id).join(", ") })}
        </p>
      ) : null}
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
          {voiceTabBar(pid, tab)}

          {tab === "overview" ? (
            <>
              {/* Build / update / cancel — the pill's ONE verb (§9.3; scope routes server-side).
                  P1.19 — §10.1 ✗: voice-building controls never render on phone width. */}
              {compact === true ? <PhoneBlockedNote /> : (
              <div style={{ display: "flex", gap: "10px", margin: "10px 0" }}>
                {d.status.action === "build" ? (
                  <form method="post" action={`/v/${pid}/build`} style={{ margin: 0 }}>
                    <button type="submit" data-build-voice="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                      {VC.detail.buildCta}
                    </button>
                  </form>
                ) : null}
                {d.status.action === "update_voice" || d.status.action === "test" ? (
                  <form method="post" action={`/v/${pid}/update`} style={{ margin: 0 }}>
                    <button type="submit" data-update-voice="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                      {d.status.action === "test" ? VC.detail.testCta : VC.detail.updateCta}
                    </button>
                  </form>
                ) : null}
                {d.upgradeRoute ? (
                  <form method="post" action={`/v/${pid}/update`} style={{ margin: 0 }}>
                    <input type="hidden" name="scope" value="full_from_quick" />
                    <button type="submit" data-upgrade-voice="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
                      {VC.detail.upgradeCta}
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
              )}

              {d.gate ? <VoiceGateCardView pid={pid} gate={d.gate} /> : null}
              <VoiceFactsPanelView detail={d} plan={voice?.updatePlan} />

              {/* the Overview's hub paragraph — profile/index.md's head text when a build produced it. */}
              {d.hubMarkdown ? (
                <section data-hub="true" style={{ marginTop: "16px", maxWidth: "68ch", fontSize: "14px", whiteSpace: "pre-wrap" }}>
                  {d.hubMarkdown}
                </section>
              ) : null}
              {holdout?.held && !holdout.revealed ? (
                <p data-holdout-hidden="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "12px" }}>
                  {VC.detail.holdoutGeneric}
                </p>
              ) : null}
              {d.projects.length > 0 ? (
                <section data-projects="true" style={{ marginTop: "16px", maxWidth: "68ch" }}>
                  <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{VC.detail.projectsHeading}</h2>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
                    {d.projects.map((p) => (
                      <li key={p.id}>
                        <a href={`/p/${p.slug}`}>{p.title}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {/* P1.15 — the §9.5 delete: purge-eligible personas schedule voice.purge (the
                  30-day window); the typed "delete" confirm guards the destructive POST.
                  P1.19 — §10.1 ✗: never rendered on phone width. */}
              {compact === true ? null : (
              <section data-voice-delete="true" style={{ marginTop: "24px", maxWidth: "68ch", borderTop: "1px solid var(--shell-border)", paddingTop: "12px" }}>
                <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--sev-major)", margin: "0 0 4px" }}>{VC.detail.deleteVoiceHeading}</h2>
                <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{VC.detail.deleteVoiceNote}</p>
                <form method="post" action={`/v/${pid}/delete`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input name="confirm" placeholder="delete" style={{ ...fieldStyle, maxWidth: "14ch" }} />
                  <button type="submit" data-delete-voice="true" style={{ padding: "6px 14px", borderRadius: "8px", border: "1px solid var(--sev-major)", background: "none", color: "var(--sev-major)", fontSize: "13px", cursor: "pointer" }}>
                    {VC.detail.deleteVoiceCta}
                  </button>
                </form>
              </section>
              )}
            </>
          ) : null}

          {tab === "description" ? (
            <>
              {/* the seed editor — plain markdown; on save the J9 hash recomputes and the pill flips live. */}
              <section data-seed-editor="true" style={{ maxWidth: "68ch" }}>
                {d.persona.seed_authored_by === "persona_builder" ? (
                  <p data-agent-drafted="true" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "0 0 6px" }}>
                    {VC.detail.agentDraftedMark}
                  </p>
                ) : null}
                {/* P1.19 — §10.1 ✗: seed edits are a voice-building control — suppressed on phone width. */}
                {compact === true ? <PhoneBlockedNote /> : (
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
                )}
              </section>

              {/* the corrections ledger (§9.4): a correction lands as a blockquote on the seed + a
                  consume-once row the next build picks up. */}
              <section data-corrections="true" style={{ marginTop: "18px", maxWidth: "68ch" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.correctionsHeading}</h2>
                {(d.corrections ?? []).length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.correctionsEmpty}</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", fontSize: "13px", display: "grid", gap: "6px" }}>
                    {(d.corrections ?? []).map((cr) => (
                      <li key={cr.id} data-correction={cr.id} data-consumed={cr.consumed_by_profile_id ? "true" : "false"} style={{ border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "6px 10px" }}>
                        <span>{cr.text}</span>
                        <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px", marginLeft: "8px" }}>
                          {cr.consumed_by_profile_id ? VC.detail.correctionConsumed : VC.detail.correctionPending}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {compact === true ? null : (
                <form method="post" action={`/v/${pid}/corrections`}>
                  <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block" }}>
                    {VC.detail.correctionLabel}
                    <textarea name="text" required placeholder={VC.detail.correctionPlaceholder} style={{ ...textAreaStyle, minHeight: "60px", marginTop: "4px" }} />
                  </label>
                  <button type="submit" style={{ ...submitStyle, width: "auto", marginTop: "8px", padding: "7px 14px", fontSize: "13px" }}>
                    {VC.detail.correctionCta}
                  </button>
                </form>
                )}
              </section>

              {/* build notes — the last build's own notes (§9.4). */}
              {(d.buildNotes ?? []).length > 0 ? (
                <section data-build-notes="true" style={{ marginTop: "18px", maxWidth: "68ch" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.buildNotesHeading}</h2>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "6px" }}>
                    {(d.buildNotes ?? []).map((n) => (
                      <li key={n.id} data-build-note={n.id} style={{ border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "6px 10px", whiteSpace: "pre-wrap" }}>
                        {typeof n.body === "string" ? n.body : JSON.stringify(n.body)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {tab === "samples" ? (
            <section data-samples="true" style={{ maxWidth: "68ch" }}>
              {/* P1.15 — the Sources pane: linked providers + the review-confirm step + the three
                  link flows + Re-sync all. P1.19 — §10.1 ✗: a building surface — hidden on phone. */}
              {compact === true ? null : (
                <VoiceSourcesPane pid={pid} connections={voice?.connections} samples={d.samples} />
              )}
              {/* the open drawer — `?tab=samples&sample=<itemId>` (§9.5 preview/versions). */}
              {voice?.sampleDetail ? <VoiceSampleDrawer pid={pid} detail={voice.sampleDetail} compact={compact === true} /> : null}
              {d.samples.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.samplesEmpty}</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "6px" }}>
                  {d.samples.map((s) => (
                    <li key={s.id} data-sample={s.id} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "13px", border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "6px 10px" }}>
                      <a href={`/v/${pid}?tab=samples&sample=${encodeURIComponent(s.id)}`} data-sample-open={s.id} style={{ flex: 1, color: "var(--shell-fg)", textDecoration: "none" }}>
                        {s.title ?? s.id}
                      </a>
                      {/* the hold-out badge shows ONLY post-reveal (§9.4) — pre-calibration the
                          identity stays server-side; the generic line is on Overview. */}
                      {holdout?.revealed && holdout.itemId === s.id ? (
                        <span data-holdout-badge="true" style={{ color: "var(--accent)", fontSize: "12px" }}>
                          {fmt(VC.detail.holdoutRevealedFmt, { title: s.title ?? s.id })}
                        </span>
                      ) : null}
                      {/* P1.15 — the item's ingest state + paywall + quality verdicts ride the row. */}
                      {s.state !== "included" ? (
                        <span data-sample-state={s.state} style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>
                          {VC.detail.stateBadge[s.state] ?? s.state}
                        </span>
                      ) : null}
                      {s.access === "paywalled" ? (
                        <span data-sample-paywalled="true" style={{ color: "var(--sev-major)", fontSize: "12px" }}>{VC.detail.paywallBadge}</span>
                      ) : null}
                      {s.quality && s.quality !== "clean" ? (
                        <span data-sample-quality={s.quality} style={{ color: "var(--sev-major)", fontSize: "12px" }}>
                          {VC.detail.qualityBadge[s.quality] ?? s.quality}
                        </span>
                      ) : null}
                      <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>
                        {s.word_count != null ? `${s.word_count.toLocaleString("en-US")} w` : ""}
                      </span>
                      <a href={`/v/${pid}?tab=samples&sample=${encodeURIComponent(s.id)}`} style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none" }}>
                        {VC.detail.viewLabel}
                      </a>
                      {compact === true ? null : (
                      <form method="post" action={`/v/${pid}/samples/${s.id}`} style={{ margin: 0 }}>
                        <button type="submit" name="included" value={s.state === "included" ? "false" : "true"} style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }}>
                          {s.state === "included" ? VC.detail.omitLabel : VC.detail.includeLabel}
                        </button>
                      </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {compact === true ? null : (
              <form method="post" action={`/v/${pid}/samples`} encType="multipart/form-data" data-samples-form="true" style={{ marginTop: "10px" }}>
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
              )}
              {/* the fetcher-only URL path (REQ-INGEST-13) — the URL is fetched once, server-side. */}
              {compact === true ? null : (
              <form method="post" action={`/v/${pid}/samples/url`} style={{ marginTop: "10px" }}>
                <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block" }}>
                  {VC.detail.addSampleUrlLabel}
                  <input name="url" type="url" placeholder="https://…" style={fieldStyle} />
                </label>
                <button type="submit" data-add-url="true" style={{ ...submitStyle, width: "auto", marginTop: "8px", padding: "7px 14px", fontSize: "13px" }}>
                  {VC.detail.addUrlCta}
                </button>
              </form>
              )}
            </section>
          ) : null}

          {tab === "profile" ? (
            <>
              {d.snapshot ? (
                <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 8px" }}>
                  {VC.card.tierLabel[d.snapshot.tier ?? ""] ?? d.snapshot.tier ?? ""} · {fmt(VC.detail.calibrationVerdict[d.snapshot.calibrationStatus ?? ""] ?? d.snapshot.calibrationStatus ?? "untested", {})}
                </p>
              ) : (
                <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.profileEmpty}</p>
              )}
              {d.upgradeRoute && compact !== true ? (
                <form method="post" action={`/v/${pid}/update`} style={{ margin: "0 0 12px" }}>
                  <input type="hidden" name="scope" value="full_from_quick" />
                  <button type="submit" data-upgrade-voice="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
                    {VC.detail.upgradeCta}
                  </button>
                </form>
              ) : null}
              {d.calibration ? <VoiceCalibrationTable calibration={d.calibration} /> : null}
              {/* the Profile tab's fixed §9.4 order — calibration report first, collapsed sections
                  folded, the (Advanced) measures last-but-lexicon. */}
              <section data-profile-sections="true" style={{ marginTop: "14px", maxWidth: "68ch" }}>
                {(d.profileSections ?? []).map((sec) => {
                  const art = sec.path ? d.artifacts.find((a) => a.mirror_path === sec.path) : null;
                  const body = (
                    <>
                      <h3 style={{ fontSize: "13px", fontWeight: 600, margin: "0", display: "inline" }}>
                        {sec.key}
                        {sec.advanced ? <span style={{ color: "var(--shell-fg-faint)", fontWeight: 400 }}> (Advanced)</span> : null}
                      </h3>
                      {sec.key === "voice-measures" ? (
                        d.measures ? (
                          <pre data-voice-measures="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(d.measures.corpus, null, 0)}
                          </pre>
                        ) : (
                          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.detail.sectionEmpty}</p>
                        )
                      ) : art ? (
                        <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "4px 0 0" }}>{art.mirror_path}</p>
                      ) : (
                        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.detail.sectionEmpty}</p>
                      )}
                    </>
                  );
                  return sec.collapsed ? (
                    <details key={sec.key} data-profile-section={sec.key} style={{ marginBottom: "10px" }}>
                      <summary style={{ cursor: "pointer" }}>{body}</summary>
                    </details>
                  ) : (
                    <section key={sec.key} data-profile-section={sec.key} style={{ marginBottom: "10px" }}>
                      {body}
                    </section>
                  );
                })}
              </section>
              {/* derived profile artifacts — read-only by policy (§9.5 row 36; a write attempt 405s). */}
              <section data-artifacts="true" style={{ marginTop: "14px", maxWidth: "68ch" }}>
                <h2 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 6px", color: "var(--shell-fg-muted)" }}>{VC.detail.artifactsHeading}</h2>
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

          {tab === "runs" ? (
            <section data-runs="true" style={{ maxWidth: "68ch" }}>
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
              {d.profiles.length > 0 ? (
                <>
                  <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "14px 0 6px" }}>{VC.detail.snapshotsHeading}</h2>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
                    {d.profiles.map((p) => (
                      <li key={p.id} data-profile={p.id}>
                        {new Date(p.built_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} ·{" "}
                        {VC.card.tierLabel[p.tier ?? ""] ?? p.tier ?? ""} ·{" "}
                        {VC.detail.calibrationVerdict[p.calibration_status ?? ""] ?? p.calibration_status ?? ""}
                        {p.corpus_size_at_build != null ? ` · ${p.corpus_size_at_build.toLocaleString("en-US")} w` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </Shell>
  );
}

/** P1.14 — the adopt dialog's charter-diff preview (§9.6 "shows the diff before commit"): the
 *  reseeded lines the adopt would write, guidance carried verbatim (never in the diff). The
 *  confirm button posts the adopt with `reseed` set. */
export function VoiceReseedPage(): ReactNode {
  const { voiceReseed, compact } = usePageData();
  const slug = voiceReseed?.slug ?? "";
  const preview = voiceReseed?.preview;
  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{VC.detail.backToList}</a>} footer={footer()}>
      <PageTitle>{VC.detail.reseedPreviewCta}</PageTitle>
      {/* P1.19 — §10.1 ✗: diffs + voice-building actions never render on phone width. */}
      {compact === true ? <PhoneBlockedNote /> : null}
      {voiceReseed?.error ? (
        <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>{voiceReseed.error}</p>
      ) : null}
      {preview && compact !== true ? (
        <>
          {!preview.charterFound ? (
            <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>No charter yet — the reseed writes one.</p>
          ) : (
            <pre data-reseed-diff="true" style={{ fontSize: "12px", maxWidth: "88ch", whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px 14px" }}>
              {preview.diff.map((l, i) => (
                <div key={i} data-diff-kind={l.kind} style={{ color: l.kind === "added" ? "var(--state-ready)" : l.kind === "removed" ? "var(--sev-major)" : "var(--shell-fg-muted)" }}>
                  {l.kind === "added" ? "+ " : l.kind === "removed" ? "- " : "  "}
                  {l.line}
                </div>
              ))}
            </pre>
          )}
          <p data-guidance-preserved={preview.guidancePreserved ? "true" : "false"} style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "8px" }}>
            {preview.guidancePreserved
              ? "Your guidance lines carry over verbatim — the diff above never touches them."
              : "Guidance would be lost — the adopt will NOT reseed."}
          </p>
          <form method="post" action={`/p/${slug}/voice/adopt`} style={{ marginTop: "12px", display: "flex", gap: "10px" }}>
            <button type="submit" name="reseed" value="true" data-adopt-reseed="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              {VC.detail.adoptCta} + reseed
            </button>
            <button type="submit" name="reseed" value="false" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
              {VC.detail.adoptCta}
            </button>
          </form>
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
  const { export: ex, compact } = usePageData();
  const slug = ex?.slug ?? "";
  const dialog = ex?.dialog;
  const statement = dialog?.statement;
  return (
    <IdeFrame>
      <PageTitle>{COPY.export.heading}</PageTitle>
      <p style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
        {COPY.export.lede}
      </p>
      {/* P1.19 — §10.1 ✗: export never renders its form on phone width. */}
      {compact === true ? <PhoneBlockedNote /> : null}
      {ex?.error ? (
        <p data-export-error="true" style={{ color: "var(--shell-fg)", fontSize: "13px" }}>{ex.error}</p>
      ) : null}
      {dialog && compact !== true ? (
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
                  <label key={f.id} title={f.blurb} style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "13px", color: "var(--shell-fg-muted)" }}>
                    <input type="radio" name="format" value={f.id} defaultChecked={i === 0} />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {/* P1.18 — the .md-only profile (Substack). The web POST drops it for any other format,
                and the api enforces the same rule — a profile is never an eighth format. */}
            {dialog.mdProfiles.length > 0 ? (
              <label style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "12px", fontSize: "13px", color: "var(--shell-fg)" }}>
                {COPY.export.profileLegend}:{" "}
                <select name="profile" data-md-profile="true" style={{ fontSize: "13px" }}>
                  <option value="">{COPY.export.profileCanonical}</option>
                  {dialog.mdProfiles.map((p) => (
                    <option key={p.id} value={p.id} title={p.blurb}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>{COPY.export.profileNote}</span>
              </label>
            ) : null}
            {/* the citation-style select only exists while a bibliography artifact exports. */}
            {dialog.citations.hasBibliography ? (
              <label style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "12px", fontSize: "13px", color: "var(--shell-fg)" }}>
                {COPY.export.citationLegend}:{" "}
                <select name="cslStyle" data-csl-style="true" style={{ fontSize: "13px" }}>
                  {dialog.citations.styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>{COPY.export.citationNote}</span>
              </label>
            ) : null}
            <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginTop: "12px", fontSize: "13px", color: "var(--shell-fg)" }}>
              <input type="checkbox" name="attachAiUse" defaultChecked style={{ marginTop: "2px" }} />
              <span>
                {COPY.export.attachLabel}
                <span style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-faint)" }}>{COPY.export.attachNote}</span>
                {/* §6.7 — the Academic surface: the disclosure toggle copy (the ICMJE template
                    registers at P1.21; until then the general statement ships). */}
                {dialog.surfaces.disclosure ? (
                  <span data-disclosure-note="true" style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                    {COPY.export.disclosureNote}
                  </span>
                ) : null}
              </span>
            </label>
            {/* §8.4 — the block-level provenance appendix (off by default; greyed without a map). */}
            <label
              data-provenance-toggle={dialog.provenance.available ? "available" : "unavailable"}
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                marginTop: "12px",
                fontSize: "13px",
                color: dialog.provenance.available ? "var(--shell-fg)" : "var(--shell-fg-faint)",
              }}
            >
              <input
                type="checkbox"
                name="attachProvenance"
                disabled={!dialog.provenance.available}
                defaultChecked={dialog.provenance.defaultOn && dialog.provenance.available}
                style={{ marginTop: "2px" }}
              />
              <span>
                {COPY.export.provenanceLabel}
                <span style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-faint)" }}>
                  {dialog.provenance.available ? dialog.provenance.label : COPY.export.provenanceUnavailable}
                </span>
              </span>
            </label>
            {/* §6.7 — the op-ed exclusivity reminder: a reminder line, never a gate. */}
            {dialog.surfaces.exclusivityReminder ? (
              <p data-exclusivity-reminder="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "12px" }}>
                {dialog.surfaces.exclusivityReminder}
              </p>
            ) : null}
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

// ---------------------------------------------------------------------------------------------------------------------
// P1.20 — the §14.7 settings tree: Account · Preferences · Notifications · Integrations · Billing · Data
// (Team hidden until roles ship). Full-page, single 640-px column, ⌘, lands here. The beta's REQ-PROD-15
// toggle migrates into Data — there is no second settings home.
// ---------------------------------------------------------------------------------------------------------------------

/** The §14.7 section strip — Team stays hidden until roles ship. */
function SettingsNav({ active }: { active: string }): ReactNode {
  const S = COPY.settings;
  return (
    <nav
      aria-label={S.sectionsAria}
      data-settings-nav="true"
      style={{ display: "flex", gap: "14px", flexWrap: "wrap", margin: "10px 0 20px", fontSize: "13px" }}
    >
      {(["account", "preferences", "notifications", "integrations", "billing", "data"] as const).map((s) => (
        <a
          key={s}
          href={`/app/settings/${s}`}
          data-section={s}
          aria-current={active === s ? "page" : undefined}
          style={{
            color: active === s ? "var(--shell-fg)" : "var(--shell-fg-muted)",
            fontWeight: active === s ? 600 : 400,
          }}
        >
          {S.sectionLabels[s]}
        </a>
      ))}
    </nav>
  );
}

/** Shared micro-styles for the settings forms (plain SSR — no client JS required). */
const settingsRowStyle = { display: "flex", gap: "8px", alignItems: "baseline", fontSize: "13px", color: "var(--shell-fg)", margin: "8px 0" } as const;
const settingsNoteStyle = { fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 8px" } as const;
const settingsInputStyle = {
  fontSize: "13px",
  padding: "6px 10px",
  borderRadius: "7px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
} as const;
const settingsSectionStyle = { marginTop: "22px" } as const;
const settingsH3 = { fontSize: "14px", margin: "0 0 8px" } as const;
const settingsCardStyle = {
  padding: "10px 14px",
  border: "1px solid var(--shell-border)",
  borderRadius: "8px",
  margin: "8px 0",
} as const;

function humanizeKey(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** P1.20 — the §14.7 page: one shell, the section strip, then the active section. Billing is its own
 *  page (P1.16 owns the content) and renders the same strip. */
export function SettingsPage(): ReactNode {
  const { settings } = usePageData();
  const S = COPY.settings;
  const section = settings?.section ?? "account";
  return (
    <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
      <PageTitle>{S.heading}</PageTitle>
      <SettingsNav active={section} />
      <div style={{ maxWidth: "640px" }}>
        {settings?.saved ? (
          <p data-settings-saved="true" style={{ fontSize: "13px", color: "var(--state-ready)", margin: "4px 0 10px" }}>{S.saved}</p>
        ) : null}
        {section === "account" ? <AccountSection /> : null}
        {section === "preferences" ? <PreferencesSection /> : null}
        {section === "notifications" ? <NotificationsSection /> : null}
        {section === "integrations" ? <IntegrationsSection /> : null}
        {section === "data" ? <DataSection /> : null}
      </div>
    </Shell>
  );
}

/** §14.7 Account — name/byline/avatar, the magic-link email change, sign-in methods, sessions with
 *  revoke, and the delete-account pointer (the control itself lives in Data). */
function AccountSection(): ReactNode {
  const { settings } = usePageData();
  const S = COPY.settings;
  const acct = settings?.account;
  if (!acct) {
    return <p data-settings-unavailable="account" style={settingsNoteStyle}>{COPY.billing.stripeDownNote}</p>;
  }
  return (
    <>
      {/* the deletion grace banner — the 14-day clock shows on every section's top surface. */}
      {acct.deletion ? <DeletionBanner deletion={acct.deletion} /> : null}
      <section aria-label={S.profileHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.profileHeading}</h3>
        <form method="post" action="/app/settings/account">
          <label style={settingsRowStyle}>
            {S.nameLabel}:{" "}
            <input type="text" name="name" defaultValue={acct.user.name ?? ""} required style={settingsInputStyle} />
          </label>
          <label style={settingsRowStyle}>
            {S.bylineLabel}:{" "}
            <input type="text" name="byline" defaultValue={acct.user.byline ?? ""} style={settingsInputStyle} />
          </label>
          <p style={settingsNoteStyle}>{S.bylineNote}</p>
          <label style={settingsRowStyle}>
            {S.avatarLabel}:{" "}
            <input type="url" name="image" defaultValue={acct.user.image ?? ""} style={settingsInputStyle} />
          </label>
          <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
        </form>
      </section>
      <section aria-label={S.emailLabel} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.emailLabel}</h3>
        <p style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0" }}>
          {acct.user.email}{" "}
          <span style={{ fontSize: "11px", color: acct.user.emailVerified ? "var(--state-ready)" : "var(--shell-fg-faint)" }}>
            {acct.user.emailVerified ? S.emailVerified : S.emailUnverified}
          </span>
        </p>
        {acct.user.pendingEmail ? (
          <p data-email-pending="true" style={settingsNoteStyle}>
            {fmt(S.emailPendingFmt, { email: acct.user.pendingEmail })}
          </p>
        ) : null}
        <form method="post" action="/app/settings/account/email">
          <label style={settingsRowStyle}>
            {S.emailChangeLabel}:{" "}
            <input type="email" name="email" required style={settingsInputStyle} />
          </label>
          <p style={settingsNoteStyle}>{S.emailChangeNote}</p>
          <button type="submit" style={{ fontSize: "13px" }}>{S.emailChangeCta}</button>
        </form>
      </section>
      <section aria-label={S.signInHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.signInHeading}</h3>
        <ul style={{ margin: "4px 0", paddingLeft: "18px", fontSize: "13px", color: "var(--shell-fg)" }}>
          {acct.signInMethods.map((m) => (
            <li key={m.kind} data-signin-method={m.kind}>
              {m.label}
              {m.detail ? <span style={{ color: "var(--shell-fg-faint)" }}> — {m.detail}</span> : null}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label={S.sessionsHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.sessionsHeading}</h3>
        <p style={settingsNoteStyle}>{S.sessionsNote}</p>
        <ul style={{ margin: "4px 0", paddingLeft: "18px", fontSize: "13px", color: "var(--shell-fg)", display: "flex", flexDirection: "column", gap: "6px" }}>
          {acct.sessions.map((s) => (
            <li key={s.id} data-session={s.id}>
              {s.userAgent ?? s.ipAddress ?? s.id}
              {s.current ? (
                <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--state-ready)" }}>{S.sessionThisDevice}</span>
              ) : null}
              <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--shell-fg-faint)" }}>
                {fmt(S.sessionExpiresFmt, { at: s.expiresAt.slice(0, 10) })}
              </span>
              {!s.current ? (
                <form method="post" action="/app/settings/sessions/revoke" style={{ display: "inline", marginLeft: "8px" }}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <button type="submit" data-revoke-session="true" style={{ fontSize: "11px" }}>{S.sessionRevokeCta}</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {/* §14.7 lists "delete account" under Account; the typed-confirmation control lives in Data —
          the link keeps the section's contents honest without two destructive forms. */}
      <section aria-label={S.deletionHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.deletionHeading}</h3>
        <p style={{ fontSize: "13px", margin: "4px 0" }}>
          <a href="/app/settings/data#delete" style={{ color: "var(--sev-major)" }}>{S.deletionHeading} →</a>
        </p>
      </section>
    </>
  );
}

/** §14.7 Preferences — account defaults (a project's own settings always win); no raw model names. */
function PreferencesSection(): ReactNode {
  const { settings } = usePageData();
  const S = COPY.settings;
  const prefs = settings?.preferences;
  if (!prefs) {
    return <p data-settings-unavailable="preferences" style={settingsNoteStyle}>{COPY.billing.stripeDownNote}</p>;
  }
  const p = prefs.prefs;
  return (
    <form method="post" action="/app/settings/preferences" style={{ marginTop: "8px" }}>
      <section aria-label={S.tierHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.tierHeading}</h3>
        <label style={settingsRowStyle}>
          <input type="radio" name="defaultModelTier" value="" defaultChecked={p.defaultModelTier == null} />{" "}
          {S.tierAutoLabel}
        </label>
        <p style={settingsNoteStyle}>{S.tierAutoNote}</p>
        {MODEL_TIERS.map((t) => (
          <label key={t} style={settingsRowStyle} data-tier={t}>
            <input type="radio" name="defaultModelTier" value={t} defaultChecked={p.defaultModelTier === t} />{" "}
            {S.tierWhen[t] ?? MODEL_TIER_DISPLAY[t]}
          </label>
        ))}
      </section>
      <section aria-label={S.rigorHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.rigorHeading}</h3>
        <label style={settingsRowStyle}>
          <select name="defaultRigor" defaultValue={p.defaultRigor ?? ""} style={{ fontSize: "13px" }}>
            <option value="">{RIGOR_DISPLAY.standard} ({S.rigorDefaultOpt.toLowerCase()})</option>
            {RIGORS.map((r) => (
              <option key={r} value={r}>{RIGOR_DISPLAY[r]}</option>
            ))}
          </select>
        </label>
        <p style={settingsNoteStyle}>{S.rigorNote}</p>
        <fieldset style={{ border: "none", margin: "10px 0 0", padding: 0 }}>
          <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)" }}>{S.rigorByWorkflowHeading}</legend>
          <p style={settingsNoteStyle}>{S.rigorByWorkflowNote}</p>
          <div data-rigor-by-workflow="true" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {USER_LAUNCHED_WORKFLOW_KEYS.map((w) => (
              <label key={w} style={{ ...settingsRowStyle, justifyContent: "space-between" }}>
                <span>{humanizeKey(w)}</span>
                <select name={`rigor_${w}`} defaultValue={p.rigorByWorkflow?.[w] ?? ""} style={{ fontSize: "12px" }}>
                  <option value="">{S.rigorDefaultOpt}</option>
                  {RIGORS.map((r) => (
                    <option key={r} value={r}>{RIGOR_DISPLAY[r]}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <section aria-label={S.approvalHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.approvalHeading}</h3>
        <p style={settingsNoteStyle}>{S.approvalNote}</p>
        {/* an absent account pref means Named approvals (§5.6's default) — picking it stores the
            explicit value, which is equivalent. */}
        {APPROVAL_POLICIES.map((a) => (
          <label key={a} style={settingsRowStyle} data-approval-policy={a}>
            <input type="radio" name="approvalPolicy" value={a} defaultChecked={(p.approvalPolicy ?? "named") === a} />{" "}
            {S.approvalPolicies[a]}
          </label>
        ))}
      </section>
      <section aria-label={S.consentHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.consentHeading}</h3>
        <label style={settingsRowStyle}>
          {S.consentLabel}:{" "}
          <input
            type="number"
            name="consentUnder"
            min={0}
            max={1000}
            defaultValue={prefs.consentDontAskUnder}
            style={{ ...settingsInputStyle, width: "110px" }}
          />
        </label>
        <p style={settingsNoteStyle}>{S.consentNote}</p>
      </section>
      <section aria-label={S.editorHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.editorHeading}</h3>
        <label style={settingsRowStyle}>
          {S.paperThemeLabel}:{" "}
          <select name="paperTheme" defaultValue={p.editor?.paperTheme ?? ""} style={{ fontSize: "13px" }}>
            <option value="">{S.rigorDefaultOpt}</option>
            <option value="light">{S.paperThemeLight}</option>
            <option value="dark">{S.paperThemeDark}</option>
            <option value="follow">{S.paperThemeFollow}</option>
          </select>
        </label>
        <label style={settingsRowStyle}>
          {S.fontPresetLabel}:{" "}
          <select name="fontPreset" defaultValue={p.editor?.fontPreset ?? ""} style={{ fontSize: "13px" }}>
            <option value="">{S.rigorDefaultOpt}</option>
            <option value="serif">{S.fontSerif}</option>
            <option value="sans">{S.fontSans}</option>
            <option value="mono">{S.fontMono}</option>
          </select>
        </label>
        <label style={settingsRowStyle}>
          {S.fontSizeLabel}:{" "}
          <select name="fontSizeStep" defaultValue={p.editor?.fontSizeStep != null ? String(p.editor.fontSizeStep) : ""} style={{ fontSize: "13px" }}>
            <option value="">{S.rigorDefaultOpt}</option>
            {[-2, -1, 0, 1, 2].map((n) => (
              <option key={n} value={String(n)}>{n > 0 ? `+${n}` : String(n)}</option>
            ))}
          </select>
        </label>
        <p style={settingsNoteStyle}>{S.fontSizeNote}</p>
        <label style={settingsRowStyle}>
          {S.themeHeading}:{" "}
          <select name="appTheme" defaultValue={prefs.appTheme} style={{ fontSize: "13px" }}>
            <option value="dark">{S.themeDark}</option>
            <option value="light">{S.themeLight}</option>
            <option value="auto">{S.themeAuto}</option>
          </select>
        </label>
        <p style={settingsNoteStyle}>{S.themeNote}</p>
      </section>
      <p style={settingsNoteStyle}>{S.perProjectNote}</p>
      <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
    </form>
  );
}

/** §14.7 Notifications — the §5.11 matrix against P1.19's server-side store; the two
 *  non-configurable rows render locked (the api rejects writes to them too — REQ-ACCT-1). */
function NotificationsSection(): ReactNode {
  const { settings } = usePageData();
  const S = COPY.settings;
  const data = settings?.notifications;
  if (!data) {
    return <p data-settings-unavailable="notifications" style={settingsNoteStyle}>{COPY.billing.stripeDownNote}</p>;
  }
  const prefs = data.prefs;
  const qh = data.quietHours;
  const toHHMM = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return (
    <form method="post" action="/app/settings/notifications" data-notifications-form="true" style={{ marginTop: "8px" }}>
      <table data-notification-matrix="true" style={{ borderCollapse: "collapse", fontSize: "13px", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 14px 4px 0", color: "var(--shell-fg-faint)", fontWeight: 500 }}>{S.matrixEventCol}</th>
            <th style={{ textAlign: "left", padding: "4px 14px 4px 0", color: "var(--shell-fg-faint)", fontWeight: 500 }}>{S.matrixEmailCol}</th>
            <th style={{ textAlign: "left", padding: "4px 0", color: "var(--shell-fg-faint)", fontWeight: 500 }}>{S.matrixInAppCol}</th>
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_EVENT_TYPES.map((t) => {
            const row = NOTIFICATION_MATRIX[t];
            const locked = isNonConfigurableEvent(t);
            const emailArm = row.email as string;
            const inAppArm = row.inApp as string;
            return (
              <tr key={t} data-notification-row={t}>
                <td style={{ padding: "5px 14px 5px 0", color: "var(--shell-fg)" }}>
                  {S.notificationEvents[t] ?? humanizeKey(t)}
                  {locked ? (
                    <span style={{ display: "block", fontSize: "11px", color: "var(--shell-fg-faint)" }}>{S.lockedNote}</span>
                  ) : null}
                </td>
                <td style={{ padding: "5px 14px 5px 0" }}>
                  {emailArm === "none" ? (
                    <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>{S.emailNoneNote}</span>
                  ) : locked ? (
                    <span data-locked="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>On</span>
                  ) : (
                    <select name={`email_${t}`} defaultValue={emailEnabled(prefs, t) ? "on" : "off"} style={{ fontSize: "12px" }}>
                      <option value="on">On</option>
                      <option value="off">Off</option>
                      {emailArm === "digest" ? <option value="digest">Digest</option> : null}
                    </select>
                  )}
                </td>
                <td style={{ padding: "5px 0" }}>
                  {inAppArm === "none" ? (
                    <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>{S.emailNoneNote}</span>
                  ) : locked ? (
                    <span data-locked="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>On</span>
                  ) : t === "run_progress" ? (
                    <span data-per-project="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
                      {S.runProgressNote}
                    </span>
                  ) : (
                    <select name={`inapp_${t}`} defaultValue={(prefs.inApp?.[t] ?? row.defaultOn) ? "on" : "off"} style={{ fontSize: "12px" }}>
                      <option value="on">On</option>
                      <option value="off">Off</option>
                    </select>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <section aria-label={S.digestHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.digestHeading}</h3>
        <label style={settingsRowStyle}>
          <select name="digest_run_finished" defaultValue={prefs.digest?.run_finished === "hourly" ? "hourly" : "off"} style={{ fontSize: "13px" }}>
            <option value="off">Off</option>
            <option value="hourly">Hourly</option>
          </select>{" "}
          {S.digestRunFinishedLabel}
        </label>
      </section>
      <section aria-label={S.quietHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.quietHeading}</h3>
        <p style={settingsNoteStyle}>{S.quietNote}</p>
        <label style={settingsRowStyle}>
          <select name="qh_enabled" defaultValue={qh ? "on" : "off"} style={{ fontSize: "13px" }}>
            <option value="off">Off</option>
            <option value="on">{S.quietEnable}</option>
          </select>
        </label>
        <label style={settingsRowStyle}>
          {S.quietStartLabel}:{" "}
          <input type="time" name="qh_start" defaultValue={qh ? toHHMM(qh.startMinutesUtc) : "21:00"} style={settingsInputStyle} />
          {S.quietEndLabel}:{" "}
          <input type="time" name="qh_end" defaultValue={qh ? toHHMM(qh.endMinutesUtc) : "07:00"} style={settingsInputStyle} />
        </label>
      </section>
      {data.projects && data.projects.length > 0 ? (
        <section aria-label={S.runProgressHeading} style={settingsSectionStyle}>
          <h3 style={settingsH3}>{S.runProgressHeading}</h3>
          <p style={settingsNoteStyle}>{S.runProgressNote}</p>
          {data.projects.map((proj) => (
            <label key={proj.id} style={{ ...settingsRowStyle, justifyContent: "space-between" }}>
              <span>{fmt(S.runProgressProjectFmt, { title: proj.title })}</span>
              <select
                name={`rp_${proj.id}`}
                defaultValue={prefs.project?.[proj.id]?.run_progress === true ? "on" : "off"}
                style={{ fontSize: "12px" }}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </label>
          ))}
        </section>
      ) : null}
      <button type="submit" style={{ marginTop: "14px", fontSize: "13px" }}>{S.saveCta}</button>
    </form>
  );
}

/** §14.7 Integrations (REQ-ACCT-2) — one card component per provider: connect / status / items /
 *  disconnect; disconnect removes the credential now and keeps samples. Each card carries its
 *  "what we read" + "never does" lines verbatim. */
function IntegrationsSection(): ReactNode {
  const { settings } = usePageData();
  const S = COPY.settings;
  const data = settings?.integrations;
  if (!data) {
    return <p data-settings-unavailable="integrations" style={settingsNoteStyle}>{COPY.billing.stripeDownNote}</p>;
  }
  const providers = ["substack", "medium", "gdrive"] as const;
  return (
    <>
      <p style={{ ...settingsNoteStyle, marginTop: "8px" }}>{S.integrationsNote}</p>
      {providers.map((provider) => {
        const prov = S.integrationProviders[provider] ?? { title: provider, reads: "", never: "" };
        const conns = data.connections.filter((conn) => conn.provider === provider);
        return (
          <div key={provider} data-integration-card={provider} style={settingsCardStyle}>
            <h3 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 4px", color: "var(--shell-fg)" }}>{prov.title}</h3>
            <p style={settingsNoteStyle}>{prov.reads}</p>
            <p data-integration-never="true" style={{ ...settingsNoteStyle, color: "var(--shell-fg-muted)" }}>{prov.never}</p>
            {conns.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0" }}>
                {data.voices.length > 0 ? (
                  <a href={`/v/${data.voices[0]!.slug ?? data.voices[0]!.id}?tab=samples`} style={{ color: "var(--accent)" }}>
                    {S.integrationConnectCta}
                  </a>
                ) : (
                  S.integrationsEmpty
                )}
              </p>
            ) : (
              <ul style={{ margin: "6px 0", paddingLeft: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                {conns.map((conn) => (
                  <li key={conn.id} data-connection={conn.id} style={{ fontSize: "12px", color: "var(--shell-fg)" }}>
                    <span data-conn-status={conn.status} style={{ fontWeight: 600 }}>
                      {S.integrationStatusLabels[conn.status] ?? conn.status}
                    </span>
                    {conn.handle ? <span style={{ color: "var(--shell-fg-muted)" }}> · {conn.handle}</span> : null}
                    {conn.persona.name ? (
                      <span style={{ color: "var(--shell-fg-faint)" }}>
                        {" "}· {fmt(S.integrationPersonaFmt, { name: conn.persona.name })}
                      </span>
                    ) : null}
                    <span style={{ color: "var(--shell-fg-faint)" }}>
                      {" "}· {fmt(S.integrationItemsFmt, { items: conn.items, included: conn.includedItems })}
                    </span>
                    {conn.lastSyncAt ? (
                      <span style={{ color: "var(--shell-fg-faint)" }}>
                        {" "}· {fmt(S.integrationLastSyncFmt, { at: conn.lastSyncAt.slice(0, 10) })}
                      </span>
                    ) : null}
                    {conn.error ? (
                      <span data-conn-error="true" style={{ color: "var(--sev-major)" }}> · {conn.error}</span>
                    ) : null}
                    <form method="post" action={`/app/settings/integrations/${conn.id}/disconnect`} style={{ display: "inline", marginLeft: "10px" }}>
                      <button type="submit" data-disconnect="true" style={{ fontSize: "11px" }}>{S.integrationDisconnectCta}</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

/** REQ-ACCT-4 — the grace banner + the cancel form; shared by Account's pointer state and Data's
 *  control. The typed-confirmation request form lives in Data only. */
function DeletionBanner({ deletion }: { deletion: { requestedAt: string; graceEndsAt: string } }): ReactNode {
  const S = COPY.settings;
  return (
    <div data-deletion-banner="true" style={{ ...settingsCardStyle, borderColor: "var(--sev-major)" }}>
      <p style={{ fontSize: "13px", color: "var(--sev-major)", margin: "0 0 8px" }}>
        {fmt(S.deletionScheduledFmt, { date: deletion.graceEndsAt.slice(0, 10) })}
      </p>
      <form method="post" action="/app/settings/account/delete/cancel">
        <button type="submit" data-deletion-cancel="true" style={{ fontSize: "12px" }}>{S.deletionCancelCta}</button>
      </form>
    </div>
  );
}

/** §14.7 Data (Q-12, minimal): the privacy toggles, the support-access grant + visible log, the
 *  training-posture + residual-risk static text (verbatim), the Q-26 preference-learning toggle
 *  (verbatim copy), "Export everything", and the delete-account control. */
function DataSection(): ReactNode {
  const { settings, privacy, accountExport } = usePageData();
  const S = COPY.settings;
  const data = settings?.data;
  const acct = accountExport?.export ?? null;
  return (
    <>
      {data?.deletion ? <DeletionBanner deletion={data.deletion} /> : null}
      <section aria-label={S.privacyHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.privacyHeading}</h3>
        <form method="post" action="/app/settings/data/privacy" data-privacy-form="true">
          <label style={settingsRowStyle}>
            <input
              type="checkbox"
              name="analyticsOptOut"
              defaultChecked={privacy?.analyticsOptOut ?? data?.analyticsOptOut ?? false}
              data-analytics-toggle="true"
            />
            {S.analyticsLabel}
          </label>
          <p style={settingsNoteStyle}>{S.analyticsNote}</p>
          <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
          {privacy?.saved ? (
            <span data-privacy-saved="true" style={{ marginLeft: "10px", fontSize: "12px", color: "var(--state-ready)" }}>{S.saved}</span>
          ) : null}
        </form>
        {data ? (
          <form method="post" action="/app/settings/data/support-access" data-support-access-form="true" style={{ marginTop: "14px" }}>
            <label style={settingsRowStyle}>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={data.supportAccess.active}
                data-support-access-toggle="true"
              />
              {S.supportAccessLabel}
            </label>
            <p style={settingsNoteStyle}>{S.supportAccessNote}</p>
            {data.supportAccess.active && data.supportAccess.grant ? (
              <p data-support-active="true" style={{ fontSize: "12px", color: "var(--state-ready)", margin: "4px 0" }}>
                {fmt(S.supportAccessActiveFmt, { at: data.supportAccess.grant.expiresAt.replace("T", " ").slice(0, 16) })}
              </p>
            ) : null}
            <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
          </form>
        ) : null}
        {data ? (
          <div data-support-log="true" style={{ marginTop: "12px" }}>
            <h4 style={{ fontSize: "13px", margin: "0 0 6px", color: "var(--shell-fg-muted)" }}>{S.supportAccessLogHeading}</h4>
            {data.supportAccess.log.length === 0 ? (
              <p style={settingsNoteStyle}>{S.supportAccessLogEmpty}</p>
            ) : (
              <ul style={{ margin: "4px 0", paddingLeft: "18px", fontSize: "12px", color: "var(--shell-fg-muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
                {data.supportAccess.log.map((l) => (
                  <li key={l.id} data-support-log-row={l.action}>
                    {l.at.slice(0, 16).replace("T", " ")} UTC — {S.supportAccessActions[l.action] ?? l.action}
                    {l.detail ? <span style={{ color: "var(--shell-fg-faint)" }}> · {l.detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>
      <section aria-label={S.postureHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.postureHeading}</h3>
        <p data-training-posture="true" style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0 8px", maxWidth: "68ch" }}>
          {S.trainingPosture}
        </p>
        <p style={settingsNoteStyle}>{S.dpaLine}</p>
      </section>
      <section aria-label={S.preferenceHeading} style={settingsSectionStyle}>
        <h3 style={settingsH3}>{S.preferenceHeading}</h3>
        {/* §11.7's Q-26 copy verbatim — capture-only at MVP; the Editor never sees it. */}
        <p data-preference-copy="true" style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0 8px", maxWidth: "68ch" }}>
          {S.preferenceCopy}
        </p>
        <form method="post" action="/app/settings/data/preference-learning" data-preference-form="true">
          <label style={settingsRowStyle}>
            <input
              type="checkbox"
              name="learning"
              defaultChecked={!(data?.preferenceOptOut ?? false)}
              data-preference-toggle="true"
            />
            {S.preferenceToggleLabel}
          </label>
          <p style={settingsNoteStyle}>{S.preferenceOffNote}</p>
          <button type="submit" style={{ fontSize: "13px" }}>{S.saveCta}</button>
        </form>
      </section>
      {/* P1.18 — the whole-account zip (REQ-ACCT-3): "Export everything" queues the build and the
          download link arrives by email (7-day expiry); the restore half replays an export zip
          into this account — a re-import is a no-op. */}
      <section aria-label={S.exportHeading} style={settingsSectionStyle} data-account-export="true">
        <h3 style={settingsH3}>{COPY.accountExport.heading}</h3>
        <p style={settingsNoteStyle}>{COPY.accountExport.lede}</p>
        {acct?.status === "building" ? (
          <p data-export-status="building" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>{COPY.accountExport.building}</p>
        ) : null}
        {acct?.status === "ready" && !acct.expired ? (
          <p data-export-status="ready" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>
            {COPY.accountExport.readyFmt.replace("{date}", (acct.expiresAt ?? "").slice(0, 10))}{" "}
            <a href={`/app/settings/data/export/download?id=${acct.id}`} data-export-download="true">{COPY.accountExport.downloadCta}</a>
          </p>
        ) : null}
        {acct?.status === "ready" && acct.expired ? (
          <p data-export-status="expired" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>{COPY.accountExport.expired}</p>
        ) : null}
        {acct?.status === "failed" ? (
          <p data-export-status="failed" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>
            {COPY.accountExport.failedFmt.replace("{error}", acct.error ?? "unknown")}
          </p>
        ) : null}
        {accountExport?.notice === "requested" ? (
          <p data-export-notice="true" style={{ fontSize: "12px", color: "var(--state-ready)", margin: "0 0 8px" }}>{COPY.accountExport.building}</p>
        ) : null}
        <form method="post" action="/app/settings/data/export" data-export-request-form="true">
          <button type="submit" style={{ fontSize: "13px" }}>{COPY.accountExport.cta}</button>
        </form>
        <h4 style={{ fontSize: "13px", margin: "16px 0 6px" }}>{COPY.accountExport.importHeading}</h4>
        <p style={settingsNoteStyle}>{COPY.accountExport.importNote}</p>
        <form method="post" action="/app/settings/data/import" encType="multipart/form-data" data-account-import="true">
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "var(--shell-fg)" }}>
            {COPY.accountExport.importLabel}:{" "}
            <input type="file" name="archive" accept=".zip,application/zip" required style={{ fontSize: "12px" }} />
          </label>
          <button type="submit" style={{ marginTop: "8px", fontSize: "13px" }}>{COPY.accountExport.importCta}</button>
        </form>
        {accountExport?.notice === "imported" && accountExport.imported ? (
          <p data-import-notice="imported" style={{ fontSize: "12px", color: "var(--state-ready)", marginTop: "8px" }}>
            {COPY.accountExport.importDoneFmt
              .replace("{projects}", String(accountExport.imported.projects))
              .replace("{voices}", String(accountExport.imported.voices))
              .replace("{files}", String(accountExport.imported.files))}
          </p>
        ) : null}
        {accountExport?.notice === "deduped" ? (
          <p data-import-notice="deduped" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "8px" }}>{COPY.accountExport.importDeduped}</p>
        ) : null}
        {accountExport?.notice === "importFailed" ? (
          <p data-import-notice="failed" style={{ fontSize: "12px", color: "var(--shell-fg)", marginTop: "8px" }}>{COPY.accountExport.importFailed}</p>
        ) : null}
      </section>
      {/* REQ-ACCT-4 — typed confirmation → the 14-day grace → the worker's hard-delete; cancel inside
          the window. The banner at the section top mirrors the status while the grace runs. */}
      <section aria-label={S.deletionHeading} style={settingsSectionStyle} id="delete">
        <h3 style={settingsH3}>{S.deletionHeading}</h3>
        <p style={{ ...settingsNoteStyle, maxWidth: "68ch" }}>{S.deletionLede}</p>
        {data?.deletion ? null : (
          <form method="post" action="/app/settings/account/delete" data-delete-account-form="true">
            <label style={settingsRowStyle}>
              {S.deletionConfirmLabel}:{" "}
              <input
                type="text"
                name="confirmation"
                required
                pattern={ACCOUNT_DELETION_CONFIRMATION}
                autoComplete="off"
                style={settingsInputStyle}
              />
            </label>
            <button type="submit" style={{ fontSize: "13px", color: "var(--sev-major)" }}>{S.deletionCta}</button>
          </form>
        )}
      </section>
    </>
  );
}

/** P1.20 — `/p/:project/settings` (§4.2): the REQ-GENRE-2 safe protocol fields + venue + defaults
 *  (per-project wins over the account defaults), the P1.09 approval-policy surface (REQ-GATE-3), and
 *  the standing-guidance management half (REQ-GATE-10 — list/edit/retire). */
export function ProjectSettingsPage(): ReactNode {
  const { projectSettings: ps } = usePageData();
  const S = COPY.settings.projectSettings;
  if (!ps) {
    return (
      <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
        <PageTitle>{S.heading}</PageTitle>
        <p style={settingsNoteStyle}>{COPY.billing.stripeDownNote}</p>
      </Shell>
    );
  }
  const p = ps.settings.project;
  const slug = ps.slug;
  const ov = p.protocolOverrides ?? {};
  return (
    <Shell
      brand={COPY.brand}
      nav={
        <>
          <a href={`/p/${slug}`}>{COPY.project.backToProject}</a>
          <a href="/app/settings/account" style={{ fontSize: "13px", marginLeft: "12px" }}>{COPY.settings.nav}</a>
        </>
      }
      footer={footer()}
    >
      <PageTitle>{p.title} — {S.heading}</PageTitle>
      {p.protocolChangedAt ? (
        <p data-protocol-changed="true" style={{ fontSize: "13px", color: "var(--sev-major)", margin: "8px 0" }}>
          {S.changedNote}
        </p>
      ) : null}
      {ps.saved ? (
        <p data-settings-saved="true" style={{ fontSize: "13px", color: "var(--state-ready)", margin: "4px 0" }}>{S.saved}</p>
      ) : null}
      {ps.notice ? (
        <p data-settings-notice="true" style={{ fontSize: "13px", color: "var(--sev-major)", margin: "4px 0" }}>{ps.notice}</p>
      ) : null}
      <div style={{ maxWidth: "640px" }}>
        <section aria-label={S.voiceHeading} style={settingsSectionStyle}>
          <h3 style={settingsH3}>{S.voiceHeading}</h3>
          <p style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0" }}>
            {p.persona ? (
              <a href={`/v/${p.persona.slug ?? p.persona.id}`} style={{ color: "var(--accent)" }}>{p.persona.name ?? p.persona.id}</a>
            ) : (
              <span style={{ color: "var(--shell-fg-faint)" }}>{S.voiceNone}</span>
            )}
          </p>
        </section>
        <form method="post" action={`/p/${slug}/settings`} style={{ marginTop: "8px" }}>
          <section aria-label={S.protocolHeading} style={settingsSectionStyle}>
            <h3 style={settingsH3}>{S.protocolHeading}</h3>
            <label style={settingsRowStyle}>
              {S.venueLabel}:{" "}
              <input type="text" name="venue" defaultValue={p.venue ?? ""} style={settingsInputStyle} />
            </label>
            {ps.settings.protocols.length > 0 ? (
              <label style={settingsRowStyle}>
                {S.protocolLabel}:{" "}
                <select name="protocolId" defaultValue={p.protocolId ?? ""} style={{ fontSize: "13px" }}>
                  {ps.settings.protocols.map((proto) => (
                    <option key={proto.id} value={proto.id}>{proto.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label style={settingsRowStyle}>
              {S.rigorLabel}:{" "}
              <select name="rigorDefault" defaultValue={p.rigorDefault ?? ""} style={{ fontSize: "13px" }}>
                <option value="">{S.rigorInherit}</option>
                {RIGORS.map((r) => (
                  <option key={r} value={r}>{RIGOR_DISPLAY[r]}</option>
                ))}
              </select>
            </label>
            <label style={settingsRowStyle}>
              {S.tierLabel}:{" "}
              <select name="modelTierDefault" defaultValue={p.modelTierDefault ?? ""} style={{ fontSize: "13px" }}>
                <option value="">{S.rigorInherit}</option>
                {MODEL_TIERS.map((t) => (
                  <option key={t} value={t}>{MODEL_TIER_DISPLAY[t]}</option>
                ))}
              </select>
            </label>
            <label style={settingsRowStyle}>
              {S.paperThemeLabel}:{" "}
              <select name="paperTheme" defaultValue={p.paperTheme} style={{ fontSize: "13px" }}>
                <option value="follow">{COPY.settings.paperThemeFollow}</option>
                <option value="light">{COPY.settings.paperThemeLight}</option>
                <option value="dark">{COPY.settings.paperThemeDark}</option>
              </select>
            </label>
            <label style={settingsRowStyle}>
              {S.stageLabel}:{" "}
              <select name="stage" defaultValue={ov.stage ?? ""} style={{ fontSize: "13px" }}>
                <option value="">{S.stages.infer}</option>
                <option value="early">{S.stages.early}</option>
                <option value="near_final">{S.stages.near_final}</option>
              </select>
            </label>
            <p style={settingsNoteStyle}>{S.stageNote}</p>
            <label style={settingsRowStyle}>
              {S.lengthLabel}:{" "}
              <input type="number" name="ov_length" min={1} defaultValue={ov.length ?? undefined} style={{ ...settingsInputStyle, width: "110px" }} />
            </label>
            <p style={settingsNoteStyle}>{S.lengthNote}</p>
            <fieldset style={{ border: "none", margin: "10px 0 0", padding: 0 }}>
              <legend style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)" }}>{S.phaseDefaultsHeading}</legend>
              {(Object.keys(S.phaseDefaults) as Array<keyof typeof S.phaseDefaults>).map((phase) => {
                const phaseDefault = (ov.phaseDefaults as Record<string, boolean | undefined> | undefined)?.[phase];
                return (
                <label key={phase} style={{ ...settingsRowStyle, justifyContent: "space-between" }}>
                  <span>{S.phaseDefaults[phase]}</span>
                  <select
                    name={`pd_${phase}`}
                    defaultValue={
                      phaseDefault === true ? "on" : phaseDefault === false ? "off" : ""
                    }
                    style={{ fontSize: "12px" }}
                  >
                    <option value="">{S.phaseOptDefault}</option>
                    <option value="on">{S.phaseOptOn}</option>
                    <option value="off">{S.phaseOptOff}</option>
                  </select>
                </label>
                );
              })}
            </fieldset>
          </section>
          <button type="submit" style={{ marginTop: "14px", fontSize: "13px" }}>{S.saveCta}</button>
        </form>
        {/* REQ-GATE-3/10 — P1.09's approval-policy + standing-guidance surface. Changing the policy
            never alters an open card; guidance edits route through the settings POSTs. */}
        {ps.approvalSettings ? (
          <ApprovalSettingsSection slug={slug} settings={ps.approvalSettings} returnTo={`/p/${slug}/settings`} editable />
        ) : null}
        <section aria-label={S.tagsHeading} style={settingsSectionStyle}>
          <h3 style={settingsH3}>{S.tagsHeading}</h3>
          {p.tags.length > 0 ? (
            <p style={{ fontSize: "13px", color: "var(--shell-fg)", margin: "4px 0" }}>{p.tags.join(", ")}</p>
          ) : (
            <p style={settingsNoteStyle}>{S.tagsPlaceholder}</p>
          )}
        </section>
      </div>
    </Shell>
  );
}

/** PRB.12 — the §14.5 level-1 usage glance: the balance (spendable + held) and the account's recent runs'
 *  credit spend (P0.11 data). Per-run cost on run rows — the whole contract.
 *  P1.16 — the level-1 dashboard proper (§14.5; REQ-BILL-8/9/11): the plan/period line, the bucket bars,
 *  the server-computed warnings, the next-expiry line and the CSV export. `usageAccount` is the
 *  authoritative model; `usage` keeps the recent-runs table. */
export function UsagePage(): ReactNode {
  const { usage, usageAccount } = usePageData();
  const credits = (n: number) => `${n.toLocaleString()} ${COPY.usage.creditsSuffix}`;
  return (
    <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
      <PageTitle>{COPY.usage.heading}</PageTitle>
      {usageAccount ? (
        <section data-usage-account="true">
          <p style={{ fontSize: "14px", margin: "12px 0" }} data-usage-plan="true">
            {COPY.usage.planLabel}: <strong>{usageAccount.level0.plan}</strong>
            {usageAccount.level0.trialDaysLeft != null ? (
              <>{" · "}{COPY.usage.trialFmt.replace("{n}", String(usageAccount.level0.trialDaysLeft))}</>
            ) : null}
            {usageAccount.periodStart && usageAccount.periodEnd ? (
              <>{" · "}{COPY.usage.periodFmt
                .replace("{start}", usageAccount.periodStart.slice(0, 10))
                .replace("{end}", usageAccount.periodEnd.slice(0, 10))}</>
            ) : null}
          </p>
          <p style={{ fontSize: "14px", margin: "4px 0" }} data-usage-mtd="true">
            {COPY.usage.monthToDateFmt.replace("{n}", usageAccount.monthToDateCredits.toLocaleString())}
            {usageAccount.includedMonthly > 0 ? (
              <>{" · "}{COPY.usage.includedFmt
                .replace("{remaining}", usageAccount.includedRemaining.toLocaleString())
                .replace("{monthly}", usageAccount.includedMonthly.toLocaleString())}</>
            ) : null}
          </p>
          <h3 style={{ fontSize: "14px", margin: "16px 0 8px" }}>{COPY.usage.bucketsHeading}</h3>
          <table style={{ fontSize: "13px", borderCollapse: "collapse", width: "100%" }} data-usage-buckets="true">
            <tbody>
              {usageAccount.buckets.map((b) => (
                <tr key={b.bucket} data-usage-bucket={b.bucket}>
                  <td style={{ padding: "4px 8px 4px 0" }}>{COPY.usage.bucketLabels[b.bucket] ?? b.bucket}</td>
                  <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {credits(b.available)}
                  </td>
                  <td style={{ padding: "4px 8px", color: "var(--shell-fg-muted)" }}>
                    {b.held > 0 ? `${COPY.usage.heldLabel}: ${credits(b.held)}` : ""}
                  </td>
                  <td style={{ padding: "4px 0 4px 8px", color: "var(--shell-fg-muted)" }}>
                    {b.expiresAt ? COPY.usage.expiresFmt.replace("{at}", b.expiresAt.slice(0, 10)) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {usageAccount.warnings.length > 0 ? (
            <section data-usage-warnings="true" style={{ margin: "16px 0" }}>
              <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>{COPY.usage.warningsHeading}</h3>
              <ul style={{ fontSize: "13px", margin: 0, paddingLeft: "18px" }}>
                {usageAccount.warnings.map((w, i) => (
                  <li key={i} data-usage-warning="true">{w}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {usageAccount.nextExpiry ? (
            <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }} data-usage-next-expiry="true">
              {COPY.usage.nextExpiryFmt
                .replace("{n}", usageAccount.nextExpiry.credits.toLocaleString())
                .replace("{bucket}", COPY.usage.bucketLabels[usageAccount.nextExpiry.bucket] ?? usageAccount.nextExpiry.bucket)
                .replace("{at}", usageAccount.nextExpiry.at.slice(0, 10))}
            </p>
          ) : null}
          <p style={{ fontSize: "13px", margin: "12px 0" }}>
            {/* REQ-BILL-11 — the level-1 CSV export (the web proxies the api's download). */}
            <a href="/usage.csv" data-usage-csv="true">{COPY.usage.csvCta}</a>
          </p>
        </section>
      ) : null}
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

/**
 * P1.12 — the unlocked outline editor (`/p/:slug/outline`; §7.3): the SAME spine-and-sections rows the
 * Approve-outline card renders, wrapped in the autosave form (the island debounces `ed.*` submits to
 * the save action; the Save button is the no-JS path). Phone-width (`editable:false`) is read-only.
 * Provenance + `[unverified]` badges are DATA — the page never offers a control that strips them.
 */
export function OutlinePage(): ReactNode {
  const { outline, compact } = usePageData();
  const O = COPY.outlinePage;
  if (!outline) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{O.heading}</PageTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{O.notFound}</p>
      </Shell>
    );
  }
  const editable = outline.editable && compact !== true;
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <PageTitle>{O.heading}</PageTitle>
      <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
        <a href={`/p/${outline.slug}`} style={{ color: "var(--accent)" }}>{O.backToProject}</a>
        {outline.draftEstimateCredits != null ? (
          <span data-draft-estimate="true" style={{ marginLeft: "12px" }}>
            {fmt(O.draftEstimateFmt, { n: outline.draftEstimateCredits.toLocaleString("en-US") })}
          </span>
        ) : null}
        {outline.saved ? (
          <span data-saved-note="true" style={{ marginLeft: "12px", color: "var(--sev-ok, var(--shell-fg-muted))" }}>{O.savedNote}</span>
        ) : null}
        {outline.notice ? (
          <span data-notice="true" style={{ marginLeft: "12px", color: "var(--sev-major)" }}>{outline.notice}</span>
        ) : null}
      </p>
      <form
        method="post"
        action={outline.saveAction}
        data-outline-editor="true"
        data-autosave="true"
        data-label-saving={O.savingNote}
        data-label-saved={O.savedNote}
        data-label-failed={O.saveFailedNote}
      >
        <OutlineSections outline={outline.outline} editable={editable} labels={outlineLabels} />
        {editable ? (
          <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
            <button type="submit" style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 500 }}>
              {O.saveLabel}
            </button>
          </div>
        ) : null}
      </form>
      {editable && !outline.cited ? (
        <form method="post" action={outline.deleteAction} style={{ marginTop: "16px" }}>
          <button type="submit" data-outline-delete="true" style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--sev-major)", background: "transparent", color: "var(--sev-major)", fontSize: "12px" }}>
            {O.deleteLabel}
          </button>
        </form>
      ) : null}
      {outline.cited ? (
        <p data-cited-note="true" style={{ marginTop: "16px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{O.citedNote}</p>
      ) : null}
      {editable ? <script defer src="/assets/outline.js"></script> : null}
    </Shell>
  );
}

/**
 * P1.12 — the promotion sheet (`/p/:slug/outline/promote`; §7.3): the api's verbatim facts — the
 * scope, the source notes that will copy, the URLs the run re-fetches, the estimate + cap — and the
 * Promote click that creates the `outline` run (the sheet IS the consent).
 */
export function OutlinePromotePage(): ReactNode {
  const { outlinePromotion } = usePageData();
  const P = COPY.promote;
  if (!outlinePromotion) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{P.heading}</PageTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{P.notFound}</p>
      </Shell>
    );
  }
  const { promotion: f } = outlinePromotion;
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <PageTitle>{P.heading}</PageTitle>
      <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
        <a href={`/p/${outlinePromotion.slug}`} style={{ color: "var(--accent)" }}>{P.backToProject}</a>
      </p>
      {outlinePromotion.started ? (
        <p data-started="true" style={{ fontSize: "13px", color: "var(--shell-fg)" }}>{P.startedFmt}</p>
      ) : (
        <form method="post" action={`/p/${outlinePromotion.slug}/outline/promote`} style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "520px" }}>
          <input type="hidden" name="scope" value={outlinePromotion.scope} />
          {outlinePromotion.threadId ? <input type="hidden" name="threadId" value={outlinePromotion.threadId} /> : null}
          {outlinePromotion.turnId ? <input type="hidden" name="turnId" value={outlinePromotion.turnId} /> : null}
          <p style={{ margin: 0, fontSize: "13px", color: "var(--shell-fg)" }}>
            {P.scopeLabel[outlinePromotion.scope] ?? outlinePromotion.scope}
          </p>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--shell-fg-muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
            <li data-promotion-sources="true">{fmt(P.sourcesFmt, { n: String(f.sources) })}</li>
            <li data-promotion-urls="true">{fmt(P.urlsFmt, { n: String(f.urls.length) })}</li>
            <li data-promotion-estimate="true">{fmt(P.estimateFmt, { estimate: f.estimateCredits.toLocaleString("en-US"), cap: f.capCredits.toLocaleString("en-US") })}</li>
          </ul>
          {f.existing ? <p data-existing="true" style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-faint)" }}>{P.existingNote}</p> : null}
          <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {P.slugLabel}
            <input type="text" name="slug" defaultValue={f.slug} pattern="[a-z0-9][a-z0-9-]{0,47}" title={P.slugHint} style={{ display: "block", marginTop: "3px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }} />
          </label>
          {outlinePromotion.notice ? (
            <p data-notice="true" style={{ margin: 0, fontSize: "12px", color: "var(--sev-major)" }}>{outlinePromotion.notice}</p>
          ) : null}
          <div>
            <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600 }}>
              {P.promoteLabel}
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}

// -----------------------------------------------------------------------------------------------------------------
// P1.13 — the Figures pane, the figure card, and the /visualize sheet (§7.5; REQ-VIZ-1…16).
// -----------------------------------------------------------------------------------------------------------------

const FIGURE_CHIP_STYLE = {
  padding: "6px 12px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-surface)",
  color: "var(--shell-fg)",
  fontSize: "12px",
  cursor: "pointer",
} as const;

/** The shared row-shell for a figure card field label + input. */
function figureField(label: string, name: string, value: string, hint?: string): ReactNode {
  return (
    <label style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
      {label}
      <input
        type="text"
        name={name}
        defaultValue={value}
        title={hint}
        style={{ display: "block", marginTop: "3px", width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }}
      />
    </label>
  );
}

/** P1.13 — the Figures pane (`/p/:slug/figures`; §7.5): every figure card with its honesty badge,
 *  version, render state, and insert state. */
export function FiguresPanePage(): ReactNode {
  const { figures } = usePageData();
  const F = COPY.figuresPage;
  if (!figures) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{F.heading}</PageTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{F.empty}</p>
      </Shell>
    );
  }
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <PageTitle>{F.heading}</PageTitle>
      <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
        <a href={`/p/${figures.slug}`} style={{ color: "var(--accent)" }}>{F.backToProject}</a>
        <a href={`/p/${figures.slug}/visualize`} data-new-figure="true" style={{ color: "var(--accent)", marginLeft: "12px" }}>{F.newLabel}</a>
      </p>
      {figures.items.length === 0 ? (
        <p data-figures-empty="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{F.empty}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {figures.items.map((f) => (
            <li key={f.id} data-figure-row={f.id} style={{ border: "1px solid var(--shell-border)", borderRadius: "10px", padding: "12px 14px", background: "var(--shell-surface)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <a href={`/p/${figures.slug}/figures/${f.id}`} style={{ color: "var(--shell-fg)", fontSize: "14px", fontWeight: 600, textDecoration: "none" }}>
                  {f.title || f.caption || f.id}
                </a>
                <Chip label={f.kind} />
                {f.badgeText ? <Chip label={f.badgeText} color="var(--sev-major)" /> : null}
                <Chip label={fmt(F.versionFmt, { n: f.n })} />
                {f.insertedInDraftId ? <Chip label={F.insertedChip} color="var(--sev-ok, var(--shell-fg-muted))" /> : null}
                {f.pendingProposal ? <Chip label={F.proposalChip} /> : null}
                {!f.hasRender && f.specKind !== "table" ? <Chip label={F.renderingChip} /> : null}
              </div>
              {f.caption ? <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{f.caption}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

/** P1.13 — the figure card (`/p/:slug/figures/:figureId`; §7.5): the persisted render preview, the
 *  type chips (0-cr spec edits), the caption/alt/source fields, the Data/Spec/Versions disclosures,
 *  the provenance panel, and the insert-as-proposal surface (propose → Accept/Reject). */
export function FigureCardPage(): ReactNode {
  const { figure } = usePageData();
  const F = COPY.figureCard;
  if (!figure) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{COPY.figuresPage.heading}</PageTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{COPY.visualize.notFound}</p>
      </Shell>
    );
  }
  const { card, slug } = figure;
  const cardBase = `/p/${slug}/figures/${card.id}`;
  const missing = card.readiness.missing.map((m) => (m === "alt" ? F.missingAlt : F.missingSource));
  const declined = card.versions.find((v) => v.renderStatus === "declined");
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <PageTitle>{card.title || F.untitled}</PageTitle>
      <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
        <a href={`/p/${slug}/figures`} style={{ color: "var(--accent)" }}>{F.backToFigures}</a>
        {figure.saved ? <span data-saved-note="true" style={{ marginLeft: "12px" }}>{COPY.outlinePage.savedNote}</span> : null}
        {figure.notice ? <span data-notice="true" style={{ marginLeft: "12px", color: "var(--sev-major)" }}>{figure.notice}</span> : null}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", margin: "4px 0 12px" }}>
        <Chip label={card.kind} />
        {card.badgeText ? <Chip label={card.badgeText} color="var(--sev-major)" /> : null}
        {card.insertedInDraftId ? <Chip label={F.insertedNote} color="var(--sev-ok, var(--shell-fg-muted))" /> : null}
      </div>

      {/* the preview — the persisted server-side render (never browser-produced); a table shows
          its markdown source. */}
      {card.files.svgLight ? (
        <div data-figure-preview="true" style={{ border: "1px solid var(--shell-border)", borderRadius: "10px", padding: "12px", background: "var(--paper-bg, var(--shell-surface))", overflowX: "auto" }}
          dangerouslySetInnerHTML={{ __html: card.files.svgLight }} />
      ) : card.files.tableSource ? (
        <pre data-figure-preview="true" style={{ border: "1px solid var(--shell-border)", borderRadius: "10px", padding: "12px", background: "var(--shell-surface)", fontSize: "12px", whiteSpace: "pre-wrap" }}>{card.files.tableSource}</pre>
      ) : (
        <p data-figure-preview-pending="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{COPY.figuresPage.renderingChip}</p>
      )}
      {declined ? (
        <p data-declined-note="true" style={{ fontSize: "12px", color: "var(--sev-major)" }}>{fmt(F.declinedFmt, { suggestion: declined.renderError ?? "" })}</p>
      ) : null}

      {/* the type chips — a vega_lite mark edit is a 0-cr local spec edit (no run, no model call). */}
      {card.specKind === "vega_lite" ? (
        <section data-type-chips="true" style={{ marginTop: "14px" }}>
          <p style={{ margin: "0 0 6px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{F.chipsHeading} <span style={{ color: "var(--shell-fg-faint)" }}>— {F.chipsNote}</span></p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {(["bar", "line", "point", "area"] as const).map((mark) => (
              <form key={mark} method="post" action={`${cardBase}/spec-edit`} style={{ display: "inline" }}>
                <input type="hidden" name="mark" value={mark} />
                <button type="submit" data-chip={mark} style={FIGURE_CHIP_STYLE}>{mark}</button>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {/* the card fields — user-authored caption/alt/source line (alt + source gate the insert). */}
      <form method="post" action={cardBase} data-figure-fields="true" style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px", maxWidth: "520px" }}>
        {figureField(F.captionLabel, "caption", card.caption)}
        {figureField(F.altLabel, "alt", card.alt)}
        {figureField(F.sourceLabel, "sourceLine", card.sourceLine)}
        <div>
          <button type="submit" style={{ padding: "6px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "12px" }}>
            {COPY.outlinePage.saveLabel}
          </button>
        </div>
      </form>

      {/* provenance — the structured honesty record, never a caption convention. */}
      <details data-provenance="true" style={{ marginTop: "16px" }}>
        <summary style={{ fontSize: "13px", color: "var(--shell-fg)", cursor: "pointer" }}>{F.provenanceHeading}</summary>
        <dl style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--shell-fg-muted)", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
          <dt>kind</dt><dd data-prov-kind="true" style={{ margin: 0 }}>{card.provenance.kind}</dd>
          <dt>verification</dt><dd data-prov-verification="true" style={{ margin: 0 }}>{card.provenance.verification}</dd>
          <dt>computedBy</dt><dd style={{ margin: 0 }}>{card.provenance.computedBy}</dd>
          {card.provenance.refs.map((r, i) => (
            <Fragment key={i}>
              <dt>ref</dt>
              <dd style={{ margin: 0 }}>{r.url ?? r.claimId ?? r.assetId ?? r.transform ?? F.emptyField}</dd>
            </Fragment>
          ))}
        </dl>
      </details>

      {card.files.dataCsv ? (
        <details data-figure-data="true" style={{ marginTop: "10px" }}>
          <summary style={{ fontSize: "13px", color: "var(--shell-fg)", cursor: "pointer" }}>{F.dataHeading}</summary>
          <pre style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--shell-fg-muted)", whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px" }}>{card.files.dataCsv}</pre>
        </details>
      ) : null}
      {card.files.spec ? (
        <details data-figure-spec="true" style={{ marginTop: "10px" }}>
          <summary style={{ fontSize: "13px", color: "var(--shell-fg)", cursor: "pointer" }}>{F.specHeading}</summary>
          <pre style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--shell-fg-muted)", whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px" }}>{card.files.spec}</pre>
        </details>
      ) : null}

      {/* the Versions strip — each iterate's request text + render state + one-click restore. */}
      <details data-figure-versions="true" style={{ marginTop: "10px" }} open={card.versions.length > 1}>
        <summary style={{ fontSize: "13px", color: "var(--shell-fg)", cursor: "pointer" }}>{F.versionsHeading}</summary>
        <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          {card.versions.map((v) => (
            <li key={v.n} data-version={v.n} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--shell-fg-muted)", flexWrap: "wrap" }}>
              <Chip label={`v${v.n}`} />
              <span>{v.request ?? F.emptyField}</span>
              <span style={{ color: "var(--shell-fg-faint)" }}>{v.renderStatus}</span>
              {v.n !== card.versions.at(-1)?.n ? (
                <form method="post" action={`${cardBase}/versions/${v.n}/restore`} style={{ display: "inline" }}>
                  <button type="submit" data-restore={v.n} style={{ padding: "2px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "transparent", color: "var(--accent)", fontSize: "12px" }}>
                    {F.restoreLabel}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </details>

      {/* the insert surface — a proposal card, never a direct draft write. Accept splices the
          block in ONE tx (frozen ⇒ fork); Reject keeps the asset. */}
      <section data-insert="true" style={{ marginTop: "18px", borderTop: "1px solid var(--shell-border)", paddingTop: "12px" }}>
        <p style={{ margin: "0 0 4px", fontSize: "13px", color: "var(--shell-fg)", fontWeight: 600 }}>{F.insertHeading}</p>
        <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{F.insertNote}</p>
        {card.pendingProposal ? (
          <div data-pending-proposal="true">
            <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{F.pendingNote}</p>
            <pre data-proposal-block="true" style={{ margin: "0 0 10px", fontSize: "11px", color: "var(--shell-fg-muted)", whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px" }}>{card.pendingProposal.markdown}</pre>
            <div style={{ display: "flex", gap: "8px" }}>
              <form method="post" action={`${cardBase}/proposals/accept`} style={{ display: "inline" }}>
                <button type="submit" data-accept="true" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600 }}>
                  {F.acceptLabel}
                </button>
              </form>
              <form method="post" action={`${cardBase}/proposals/reject`} style={{ display: "inline" }}>
                <button type="submit" data-reject="true" style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "transparent", color: "var(--shell-fg)", fontSize: "13px" }}>
                  {F.rejectLabel}
                </button>
              </form>
            </div>
          </div>
        ) : card.insertedInDraftId ? (
          <p data-inserted-note="true" style={{ margin: 0, fontSize: "12px", color: "var(--sev-ok, var(--shell-fg-muted))" }}>{F.insertedNote}</p>
        ) : card.readiness.ok && figure.headDraftId ? (
          <form method="post" action={`${cardBase}/propose`} data-propose-form="true" style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "520px" }}>
            <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
              {F.anchorLabel}
              <input type="text" name="afterBlockId" style={{ display: "block", marginTop: "3px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }} />
            </label>
            <div>
              <button type="submit" data-propose="true" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600 }}>
                {F.proposeLabel}
              </button>
            </div>
          </form>
        ) : (
          <p data-not-ready="true" style={{ margin: 0, fontSize: "12px", color: "var(--sev-major)" }}>
            {fmt(F.notReadyFmt, { missing: missing.join(" + ") })}
          </p>
        )}
      </section>
    </Shell>
  );
}

/** P1.13 — the `/visualize` sheet (`/p/:slug/visualize`; §7.5 entry points): the verbatim request,
 *  the spec-kind pick, the honesty note (unsourced numbers are refused — the insist path carries
 *  the persistent badge), and the estimator figure. The Visualize click creates the `figure` run —
 *  the sheet IS the consent (REQ-CHAT-25's rule, same as the run/promotion sheets). */
export function VisualizePage(): ReactNode {
  const { visualize } = usePageData();
  const V = COPY.visualize;
  if (!visualize) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{V.heading}</PageTitle>
        <p style={{ color: "var(--shell-fg-muted)" }}>{V.notFound}</p>
      </Shell>
    );
  }
  return (
    <Shell brand={COPY.brand} footer={footer()}>
      <PageTitle>{V.heading}</PageTitle>
      <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
        <a href={`/p/${visualize.slug}`} style={{ color: "var(--accent)" }}>{V.backToProject}</a>
      </p>
      {visualize.started ? (
        <p data-started="true" style={{ fontSize: "13px", color: "var(--shell-fg)" }}>{V.startedFmt}</p>
      ) : (
        <form method="post" action={`/p/${visualize.slug}/visualize`} data-visualize-form="true" style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "560px" }}>
          {visualize.figureId ? <input type="hidden" name="figureId" value={visualize.figureId} /> : null}
          {visualize.priorVersion != null ? <input type="hidden" name="priorVersion" value={String(visualize.priorVersion)} /> : null}
          {visualize.entryPoint ? <input type="hidden" name="entryPoint" value={visualize.entryPoint} /> : null}
          {visualize.figureId ? (
            <p data-iterate-note="true" style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-muted)" }}>
              {V.iterateLabel} <code>{visualize.figureId}</code>
            </p>
          ) : null}
          <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {V.requestLabel}
            <textarea name="request" required defaultValue={visualize.request} rows={4}
              style={{ display: "block", marginTop: "3px", width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px", fontFamily: "inherit" }} />
          </label>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-faint)" }}>{V.requestHint}</p>
          <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {V.kindLabel}
            <select name="specKind" defaultValue={visualize.specKind}
              style={{ display: "block", marginTop: "3px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }}>
              <option value="">{V.kindAuto}</option>
              <option value="vega_lite">vega_lite</option>
              <option value="mermaid">mermaid</option>
              <option value="table">table</option>
            </select>
          </label>
          <label data-insist="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "flex", gap: "6px", alignItems: "flex-start" }}>
            <input type="checkbox" name="insist" value="1" style={{ marginTop: "2px" }} />
            <span>{V.insistLabel}</span>
          </label>
          <p data-estimate="true" style={{ margin: 0, fontSize: "13px", color: "var(--shell-fg)" }}>
            {fmt(V.estimateFmt, { estimate: visualize.estimateCredits.toLocaleString("en-US"), cap: visualize.capCredits.toLocaleString("en-US") })}
          </p>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-faint)" }}>{V.chipNote}</p>
          {visualize.notice ? (
            <p data-notice="true" style={{ margin: 0, fontSize: "12px", color: "var(--sev-major)" }}>{visualize.notice}</p>
          ) : null}
          <div>
            <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600 }}>
              {V.startLabel}
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// P1.16 — billing, full (§14.2/14.3/14.5/14.6). The /settings/billing plan card (ladder, subscribe via
// Checkout, change/cancel, auto-reload, portal link, Team waitlist), the /billing/return poll
// (REQ-BILL-14 — the webhook-lag window), and the §14.5 level-2 project usage page.
// ---------------------------------------------------------------------------------------------------------------------

/** The billing settings page (`/settings/billing`): the current plan, the ladder's upgrade/downgrade
 *  forms (POST → Checkout or a scheduled change), the opt-in auto-reload control, the portal link and
 *  the Team waitlist. Every price + "What it covers" line renders `pricing.json` verbatim — the page
 *  never hand-figures. */
export function BillingPage(): ReactNode {
  const { billing, compact } = usePageData();
  const B = COPY.billing;
  if (!billing) {
    return (
      <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
        <PageTitle>{B.heading}</PageTitle>
        <SettingsNav active="billing" />
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }} data-billing-down="true">{B.stripeDownNote}</p>
      </Shell>
    );
  }
  const { subscription: sub, plans } = billing;
  // BILL.3 — fail closed when an older api omits `purchase`; only the literal `open` unlocks the
  // Checkout/Portal forms.
  const purchaseOpen = sub.purchase === "open";
  const planEntries = Object.entries(plans.plans);
  const current = sub.tier;
  return (
    <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
      <PageTitle>{B.heading}</PageTitle>
      <SettingsNav active="billing" />
      <div style={{ maxWidth: "640px" }}>

      {sub.subscription?.pastDue ? (
        <p data-past-due="true" style={{ fontSize: "13px", color: "var(--sev-major)", margin: "8px 0" }}>
          {B.pastDueBanner}
        </p>
      ) : null}
      {billing.notice ? (
        <p data-notice="true" style={{ fontSize: "13px", color: "var(--sev-major)", margin: "8px 0" }}>{billing.notice}</p>
      ) : null}
      {/* BILL.3 — the purchase switch rendered truthfully: while the api reports `closed` the page
          shows the paused note and the subscribe/top-up/portal forms never mount (the POSTs would
          403 anyway — this is the honest surface, not a trap door). */}
      {!purchaseOpen ? (
        <p data-purchase-paused="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
          {B.purchasePausedNote}
        </p>
      ) : null}
      {billing.saved ? (
        <p data-saved="true" style={{ fontSize: "13px", color: "var(--state-ready)", margin: "8px 0" }}>{B.saved}</p>
      ) : null}

      <section data-plan-card="true" style={{ margin: "12px 0 20px" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>{B.planHeading}</h3>
        {sub.trial.state === "trial_active" || sub.trial.state === "trial_pending" ? (
          <p data-trial-state={sub.trial.state === "trial_pending" ? "pending" : "active"} style={{ fontSize: "13px", margin: "4px 0" }}>
            {/* HOT.1/ACT.1 — the api nulls `includedNote` while the claim is gated off for this
                audience; the badge + claim render together, else the factual window note. Pending
                adds the eligibility line: the entitlement is `locked` until the first run claims it
                through the device check (§14.3 identity-before-spend). */}
            {plans.trial.includedNote != null ? (
              <>
                <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "999px", border: "1px solid var(--accent)", color: "var(--accent)" }}>{B.includedBadge}</span>
                {" "}{plans.trial.includedNote}
                {sub.trial.state === "trial_pending" ? <>{" "}{plans.trial.eligibilityLine}</> : null}
              </>
            ) : B.trialWindowFmt.replace("{days}", String(plans.trial.windowDays))}
          </p>
        ) : sub.trial.state === "trial_denied" ? (
          <p data-trial-state="denied" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "4px 0" }}>{B.trialDeniedNote}</p>
        ) : sub.trial.state === "trial_used" ? (
          <p data-trial-state="used" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "4px 0" }}>{B.trialUsedNote}</p>
        ) : null}
        {current === "free" ? (
          <p data-current-plan="free" style={{ fontSize: "13px", margin: "4px 0" }}>{B.freeNote}</p>
        ) : (
          <p data-current-plan={current} style={{ fontSize: "13px", margin: "4px 0" }}>
            <strong>{plans.plans[current]?.display ?? current}</strong>
            {sub.subscription ? (
              <>
                {" · "}
                {sub.subscription.cancelAtPeriodEnd
                  ? B.cancelScheduledFmt.replace("{at}", sub.subscription.periodEnd.slice(0, 10))
                  : sub.subscription.scheduledTier
                    ? B.scheduledDowngradeFmt
                        .replace("{tier}", plans.plans[sub.subscription.scheduledTier]?.display ?? sub.subscription.scheduledTier)
                        .replace("{at}", sub.subscription.periodEnd.slice(0, 10))
                    : B.periodEndFmt.replace("{at}", sub.subscription.periodEnd.slice(0, 10))}
              </>
            ) : null}
          </p>
        )}
      </section>

      {/* P1.19 — §10.1 ✗: billing/configuration controls (plan ladder forms, top-ups, auto-reload,
          portal) never render on phone width; the read-only plan card above stays. */}
      {compact === true ? <PhoneBlockedNote /> : (
      <>
      <section data-plan-ladder="true" style={{ margin: "0 0 20px" }}>
        {planEntries.map(([tier, plan]) => {
          const isCurrent = tier === current;
          return (
            <div key={tier} data-plan={tier} style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "12px 14px", margin: "0 0 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                <strong style={{ fontSize: "14px" }}>{plan.display}</strong>
                <span style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
                  {/* PR-U6/ACT.1 — Team is per-seat (`$40/seat/mo`); the annual figure reads
                      "billed annually", never the "$/mo Annual" concat; null ⇒ no annual offer. */}
                  ${plan.monthlyUsd}{plan.perSeat ? "/seat/mo" : "/mo"}
                  {plan.annualMonthlyUsd != null && plan.annualMonthlyUsd < plan.monthlyUsd ? (
                    <span style={{ color: "var(--shell-fg-muted)" }}> · ${plan.annualMonthlyUsd}/mo {B.annualBillingLabel}</span>
                  ) : null}
                </span>
              </div>
              {/* HOT.1 — null while the plan's coverage line is a hidden claim (DTO-redacted). */}
              {plan.whatItCovers != null ? (
                <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "4px 0 8px" }}>{plan.whatItCovers}</p>
              ) : null}
              {plan.waitlist ? (
                <form method="post" action="/app/settings/billing/waitlist" data-waitlist-form="true" style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  <input type="email" name="email" required placeholder={B.teamEmailLabel}
                    style={{ padding: "5px 8px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }} />
                  <input type="number" name="seats" min={1} placeholder={B.teamSeatsLabel}
                    style={{ width: "70px", padding: "5px 8px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }} />
                  <button type="submit" style={{ fontSize: "12px" }}>{B.teamCta}</button>
                  <span style={{ fontSize: "11px", color: "var(--shell-fg-faint)" }}>{B.waitlistBadge}</span>
                </form>
              ) : isCurrent ? (
                sub.subscription && !sub.subscription.cancelAtPeriodEnd ? (
                  <form method="post" action="/app/settings/billing/cancel" data-cancel-form="true">
                    <button type="submit" style={{ fontSize: "12px" }}>{B.cancelCta}</button>
                    <span style={{ fontSize: "11px", color: "var(--shell-fg-faint)", marginLeft: "8px" }}>{B.cancelNote}</span>
                  </form>
                ) : null
              ) : !purchaseOpen ? null : ( // BILL.3 — no subscribe form while purchase is closed
                <form method="post" action="/app/settings/billing/subscribe" data-subscribe-form={tier} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input type="hidden" name="tier" value={tier} />
                  <select name="cycle" style={{ fontSize: "12px", padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)" }}>
                    <option value="monthly">{B.monthlyLabel}</option>
                    <option value="annual">{B.annualLabel}</option>
                  </select>
                  <button type="submit" style={{ fontSize: "12px" }}>{B.subscribeCta.replace("{tier}", plan.display)}</button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      <section data-topups="true" style={{ margin: "0 0 20px" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>{B.topupHeading}</h3>
        {/* BILL.3 — §14.2: Free never sees a Checkout top-up (the api would 402 `topups_require_plan`);
            the honest note renders in place of the pack buttons. Purchase-closed hides them too. */}
        {!purchaseOpen ? null : sub.tier === "free" ? (
          <p data-topup-gated="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>
            {B.topupRequiresPlanNote}
          </p>
        ) : plans.topUpPacks.map((p) => (
          <form key={p.id} method="post" action="/app/settings/billing/topup" data-topup-form={p.id} style={{ display: "inline-block", margin: "0 8px 8px 0" }}>
            <input type="hidden" name="packId" value={p.id} />
            <button type="submit" style={{ fontSize: "12px" }}>
              {B.topupCta.replace("{n}", p.credits.toLocaleString("en-US")).replace("{usd}", String(p.usd))}
            </button>
          </form>
        ))}
      </section>

      <section data-auto-reload="true" style={{ margin: "0 0 20px" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>{B.autoReloadHeading}</h3>
        <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>{B.autoReloadNote}</p>
        <form method="post" action="/app/settings/billing/auto-reload" data-auto-reload-form="true" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", fontSize: "12px" }}>
          <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input type="checkbox" name="enabled" value="1" defaultChecked={sub.autoReload.enabled} />
            {B.autoReloadEnable}
          </label>
          <label>
            {B.autoReloadThresholdLabel}{" "}
            <input type="number" name="thresholdCredits" min={1} defaultValue={sub.autoReload.thresholdCredits ?? 500}
              style={{ width: "90px", padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "12px" }} />
          </label>
          <label>
            {B.autoReloadPackLabel}{" "}
            <select name="packId" defaultValue={sub.autoReload.packId ?? plans.topUpPacks[0]?.id}
              style={{ padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "12px" }}>
              {plans.topUpPacks.map((p) => (
                <option key={p.id} value={p.id}>${p.usd} — {p.credits.toLocaleString("en-US")} cr</option>
              ))}
            </select>
          </label>
          <label>
            {B.autoReloadCapLabel}{" "}
            <input type="number" name="monthlyCapUsd" min={1} defaultValue={sub.autoReload.monthlyCapUsd ?? 50}
              style={{ width: "70px", padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "12px" }} />
          </label>
          <button type="submit" style={{ fontSize: "12px" }}>{B.autoReloadSave}</button>
        </form>
      </section>

      {/* BILL.3 — the Portal is a purchase entry point too: while the switch is closed the form never
          mounts (the api would 403 before the Stripe call anyway). */}
      {sub.hasStripeCustomer && purchaseOpen ? (
        <form method="post" action="/app/settings/billing/portal" data-portal-form="true" style={{ margin: "0 0 20px" }}>
          <button type="submit" style={{ fontSize: "12px" }}>{B.manageCta}</button>
          <span style={{ fontSize: "11px", color: "var(--shell-fg-faint)", marginLeft: "8px" }}>{B.manageNote}</span>
        </form>
      ) : null}
      {/* BILL.3 — no stripe_customer yet ⇒ name the reason instead of hiding the affordance silently
          only when purchase is open (while closed the paused note already explains). */}
      {!sub.hasStripeCustomer && purchaseOpen ? (
        <p data-no-customer="true" style={{ fontSize: "11px", color: "var(--shell-fg-faint)", margin: "0 0 20px" }}>
          {B.noStripeCustomerNote}
        </p>
      ) : null}
      </>
      )}
      </div>
    </Shell>
  );
}

/** The Checkout return page (`/billing/return?session_id=`): the webhook-lag window (§14.6 — poll
 *  ≤30 s, then the email fallback). `open` ⇒ renderDocument's autoRefresh re-polls; `completed`
 *  ⇒ the continue link returns to where the user started (REQ-BILL-14). */
export function BillingReturnPage(): ReactNode {
  const { checkoutReturn, checkoutCancelled } = usePageData();
  const B = COPY.billing;
  const state = checkoutCancelled ? "cancelled" : (checkoutReturn?.state ?? "open");
  const back = checkoutReturn?.returnTo ?? "/app/settings/billing";
  return (
    <Shell brand={COPY.brand} nav={<a href="/app/settings/billing">{B.nav}</a>} footer={footer()}>
      <PageTitle>{B.returnHeading}</PageTitle>
      <p data-checkout-state={state} style={{ fontSize: "14px", margin: "12px 0" }}>
        {state === "completed"
          ? B.returnDone
          : state === "cancelled"
            ? B.returnCancelled
            : state === "expired"
              ? B.returnExpired
              : B.returnPending}
      </p>
      <p style={{ fontSize: "13px" }}>
        <a href={back} data-checkout-continue="true">
          {state === "completed" ? B.returnContinue : B.returnBack}
        </a>
      </p>
    </Shell>
  );
}

/** §14.5 level 2 — `/p/:project/usage`: the project's runs with cost/duration/status and the
 *  per-project total. Rows link to the run report (levels 3–4 mount there). */
export function ProjectUsagePage(): ReactNode {
  const { usageProject } = usePageData();
  const P = COPY.projectUsage;
  if (!usageProject) {
    return (
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{P.heading}</PageTitle>
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{COPY.notFound.body}</p>
      </Shell>
    );
  }
  return (
    <Shell brand={COPY.brand} nav={<a href={`/p/${encodeURIComponent(usageProject.slug)}`}>{P.backToProject}</a>} footer={footer()}>
      <PageTitle>{P.heading} — {usageProject.projectName}</PageTitle>
      <p style={{ fontSize: "14px", margin: "12px 0" }} data-project-usage-total="true">
        {P.totalFmt
          .replace("{n}", usageProject.totalCredits.toLocaleString())
          .replace("{runs}", String(usageProject.runs.length))}
      </p>
      {usageProject.runs.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{P.runEmpty}</p>
      ) : (
        <table style={{ fontSize: "13px", borderCollapse: "collapse", width: "100%" }} data-project-usage-runs="true">
          <thead>
            <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
              <th style={{ padding: "4px 8px 4px 0" }}>Run</th>
              <th style={{ padding: "4px 8px" }}>Workflow</th>
              <th style={{ padding: "4px 8px" }}>State</th>
              <th style={{ padding: "4px 8px" }}></th>
              <th style={{ padding: "4px 0 4px 8px", textAlign: "right" }}>Spent</th>
            </tr>
          </thead>
          <tbody>
            {usageProject.runs.map((r) => (
              <tr key={r.runId} data-project-usage-run={r.runId}>
                <td style={{ padding: "4px 8px 4px 0", fontVariantNumeric: "tabular-nums" }}>{r.at.slice(0, 10)}</td>
                <td style={{ padding: "4px 8px" }}>{r.workflow}</td>
                <td style={{ padding: "4px 8px" }}>{r.state}</td>
                <td style={{ padding: "4px 8px" }}>
                  <a href={`/app/usage/r/${encodeURIComponent(r.runId)}`}>{P.runReportCta}</a>
                </td>
                <td style={{ padding: "4px 0 4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.credits.toLocaleString()} cr
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}

// --------------------------------------------------------------------------------------------------
// P1.19 — the §5.11 Inbox (`/app/inbox`; REQ-IDE-2 amended, REQ-IDE-47/48, REQ-MOBILE-19).
// The api owns the ordering — this page renders the SAME order in named sections:
//   Needs you  — the badge-counted rows (open approvals + open decisions). A gate row's `<details>`
//                is the MVP side sheet: it shows the card's facts and links to the focused surface —
//                Approve itself happens on the card (no remote one-click approve anywhere, REQ-MOBILE-10).
//   New/Earlier — the §5.11 event rows (unread newest-first, then read). Deep links land on the §4.2
//                focused surface; a run_finished row's href IS the walkthrough landing.
//   Voices     — stale-voice rows (§9.3 attention states; read-time derived).
// --------------------------------------------------------------------------------------------------
export function InboxPage(): ReactNode {
  const { inbox, compact } = usePageData();
  const items = inbox?.items ?? [];
  const blocked = items.filter((i) => i.kind === "blocked");
  const unread = items.filter((i) => i.kind === "event" && i.unread);
  const read = items.filter((i) => i.kind === "event" && !i.unread);
  const voices = items.filter((i) => i.kind === "voice");
  const slugOf = (href: string): string | null => {
    const m = /^\/p\/([^/#?]+)/.exec(href);
    return m?.[1] ?? null;
  };
  const rowStyle = {
    padding: "10px 14px",
    border: "1px solid var(--shell-border)",
    borderRadius: "10px",
    background: "var(--shell-surface)",
    marginBottom: "8px",
  } as const;
  const metaStyle = { fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" } as const;
  // UX.1 — every row names its project (the read model joins `projectTitle`; account-level rows
  // legitimately carry none — a missing title renders no meta line rather than a fabricated one).
  const projectMeta = (it: { projectTitle?: string | null }): ReactNode =>
    it.projectTitle ? (
      <p style={metaStyle} data-inbox-project="true">
        {it.projectTitle}
      </p>
    ) : null;
  return (
    <Shell
      brand={COPY.brand}
      nav={
        <>
          <a href="/app">{COPY.project.backToList}</a>
          <a href="/app/settings/billing" style={{ fontSize: "13px", marginLeft: "12px" }}>{COPY.billing.nav}</a>
        </>
      }
      footer={footer()}
    >
      <PageTitle>{COPY.inbox.heading}</PageTitle>
      {/* UX.1 — the count IS the rendered waiting rows (the Needs-you list below). The api's badge
          count stays the nav badge's semantics (open approvals + decisions); it can never disagree
          with this line because this line IS `blocked.length`. */}
      <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0 16px" }} data-inbox-badge="true">
        {fmt(COPY.inbox.badgeLine, { n: blocked.length })}
      </p>
      {items.length === 0 ? (
        <p data-inbox-empty="true" style={{ fontSize: "14px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
          {COPY.inbox.empty}
        </p>
      ) : null}
      {unread.length > 0 || read.length > 0 ? (
        <form method="post" action="/app/inbox/read-all" style={{ margin: "0 0 16px" }}>
          <button type="submit" data-inbox-read-all="true" style={{ fontSize: "12px" }}>
            {COPY.inbox.markAllRead}
          </button>
        </form>
      ) : null}

      {blocked.length > 0 ? (
        <section data-inbox-section="blocked" style={{ marginBottom: "20px", maxWidth: "72ch" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 8px" }}>{COPY.inbox.needsYouHeading}</h2>
          {blocked.map((it) => {
            const slug = slugOf(it.href);
            if (it.gate) {
              // §5.11 — the expand IS the side-sheet: when the page joined the gate's real card the
              // row mounts it (artifact read precedes the Approve); otherwise the row degrades to
              // its deep link, which lands the card on the artifact page itself (?gate=<id>).
              const card = inbox?.gateCards?.[it.id];
              return (
                <details key={it.id} data-inbox-row={it.id} data-inbox-kind="gate" style={rowStyle}>
                  <summary style={{ fontSize: "14px", color: "var(--shell-fg)", cursor: "pointer" }}>
                    {it.title}
                  </summary>
                  {projectMeta(it)}
                  <div style={{ marginTop: "8px" }}>
                    {it.body ? <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{it.body}</p> : null}
                    <p style={metaStyle}>
                      {it.gate.kind.replace(/_/g, " ")} · {it.gate.workflow.replace(/_/g, " ")}
                      {it.gate.deadlineAt ? ` · ${COPY.inbox.detailsCta} ${it.gate.deadlineAt.slice(0, 16).replace("T", " ")} UTC` : ""}
                    </p>
                    {card && slug ? (
                      <div data-inbox-gate-card={it.gate.gateId} style={{ margin: "10px 0" }}>
                        {gateCardFor(card, slug, compact ?? false)}
                      </div>
                    ) : (
                      <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0" }}>{COPY.inbox.decideNote}</p>
                    )}
                    <a href={it.href} data-inbox-open="true" style={{ fontSize: "13px" }}>{COPY.inbox.openCta}</a>
                  </div>
                </details>
              );
            }
            if (it.decision && slug) {
              return (
                <div key={it.id} data-inbox-row={it.id} data-inbox-kind="decision" style={rowStyle}>
                  <p style={{ fontSize: "14px", color: "var(--shell-fg)", margin: "0 0 6px" }}>{it.title}</p>
                  {projectMeta(it)}
                  <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 8px" }}>{it.decision.text}</p>
                  <DecisionsList
                    items={[
                      {
                        id: it.decision.decisionId,
                        projectId: it.projectId ?? null,
                        obligationId: it.decision.obligationId,
                        text: it.decision.text,
                        options: [...it.decision.options],
                        createdAt: it.createdAt,
                      },
                    ]}
                    formActionFor={(id) => `/p/${slug}/decisions/${id}`}
                    labels={decisionsLabels}
                  />
                </div>
              );
            }
            return (
              <div key={it.id} data-inbox-row={it.id} style={rowStyle}>
                <p style={{ fontSize: "14px", color: "var(--shell-fg)", margin: 0 }}>{it.title}</p>
                {projectMeta(it)}
                <a href={it.href} style={{ fontSize: "13px" }}>{COPY.inbox.openCta}</a>
              </div>
            );
          })}
        </section>
      ) : null}

      {unread.length > 0 ? (
        <section data-inbox-section="unread" style={{ marginBottom: "20px", maxWidth: "72ch" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 8px" }}>{COPY.inbox.unreadHeading}</h2>
          {unread.map((it) => (
            <div key={it.id} data-inbox-row={it.id} data-inbox-type={it.type} style={{ ...rowStyle, borderLeft: "3px solid var(--accent)" }}>
              <p style={{ fontSize: "14px", color: "var(--shell-fg)", margin: "0 0 4px" }}>{it.title}</p>
              {projectMeta(it)}
              {it.body ? <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{it.body}</p> : null}
              <p style={{ display: "flex", gap: "14px", margin: 0 }}>
                <a href={it.href} data-inbox-open="true" style={{ fontSize: "13px" }}>{COPY.inbox.openCta}</a>
                <form method="post" action="/app/inbox/read" style={{ margin: 0 }}>
                  <input type="hidden" name="item" value={it.id} />
                  <button type="submit" data-inbox-mark-read="true" style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}>
                    {COPY.inbox.markReadCta}
                  </button>
                </form>
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {read.length > 0 ? (
        <section data-inbox-section="read" style={{ marginBottom: "20px", maxWidth: "72ch" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 8px" }}>{COPY.inbox.readHeading}</h2>
          {read.map((it) => (
            <div key={it.id} data-inbox-row={it.id} data-inbox-type={it.type} style={{ ...rowStyle, opacity: 0.8 }}>
              <p style={{ fontSize: "14px", color: "var(--shell-fg-muted)", margin: "0 0 4px" }}>{it.title}</p>
              {projectMeta(it)}
              {it.body ? <p style={{ fontSize: "13px", color: "var(--shell-fg-faint)", margin: "0 0 6px" }}>{it.body}</p> : null}
              <a href={it.href} data-inbox-open="true" style={{ fontSize: "13px" }}>{COPY.inbox.openCta}</a>
            </div>
          ))}
        </section>
      ) : null}

      {voices.length > 0 ? (
        <section data-inbox-section="voices" style={{ marginBottom: "20px", maxWidth: "72ch" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 8px" }}>{COPY.inbox.voicesHeading}</h2>
          {voices.map((it) => (
            <div key={it.id} data-inbox-row={it.id} data-inbox-type="voice_stale" style={rowStyle}>
              <p style={{ fontSize: "14px", color: "var(--shell-fg)", margin: "0 0 4px" }}>{it.title}</p>
              {projectMeta(it)}
              {it.body ? <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{it.body}</p> : null}
              <a href={it.href} style={{ fontSize: "13px" }}>{COPY.inbox.openCta}</a>
            </div>
          ))}
        </section>
      ) : null}
    </Shell>
  );
}
