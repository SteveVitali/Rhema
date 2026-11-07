import { type ReactNode } from "react";
// SPA.28 — the SSR deletion wave + override removal leave this module at eleven consumers: the
// public funnel documents (in ./marketing.js — this file's own surfaces are InvitePage +
// LoginPage), the Page family's forced-SSR documents (ProjectPage / RevisionPage / ComparePage /
// PagePage — REQ-ED-12 phone/showcase read-only only; the `?ssr=1` escape is gone), the not-found
// document, and the shared chrome helpers
// (IdeFrame / PhoneBlockedNote / footer) those pages mount. Every flipped surface's SSR component
// was deleted with its render path — the SPA leaf emits the same tree off the shared modules
// (page-chrome / dossier-view / gate-card / chat-pane) the components here still consume.
import {
  Shell,
  PageTitle,
  DossierView,
  WhatChangedView,
  IdeShell,
  CompareView,
  TimelinePane,
  type DossierLabels,
} from "@rhema/ui";
import {
  // P1.09 — the §6.4 surface helpers (the dossier's findings-surface derivations moved to
  // ./dossier-view.js with the view — SPA.21).
  type GateDecisionView,
  type TimelineRun,
} from "@rhema/findings-core";
import type { GateCardDto } from "@rhema/api-client";
import { COPY } from "./copy.js";
import { gateCardFor } from "./gate-card.js";
import { SAMPLE_DOSSIER } from "./sample-dossier.js";
import { feedLabelMapsJson } from "./feed-labels.js";
// SPA.14 — the FilesPane label bag moved to its own module (gate-card precedent): the SSR pages
// AND the onboarding SPA surface render the same composition.
import { usePageData } from "./page-data.js";
import { publicFooter } from "./legal.js";
// SPA.21 — the dossier's shared view module: the Timeline/Feed/run-report/dossier label bags and
// the §5.7 surfaces helper moved to ./dossier-view.js so the SSR page and the SPA leaf emit the
// same DOM; the chat pane moved to ./chat-pane.js.
import {
  runCardLabels,
  timelineLabels,
  timelineHrefs,
  feedLabels,
  dossierSurfaces,
  reviewPanelBodies,
} from "./dossier-view.js";
import { chatPanel } from "./chat-pane.js";
// SPA.23 — the Page surface + project overview bodies hoisted to ./page-chrome.js so the `editor`
// SPA leaf renders the identical tree (the gate-card.js precedent). The label bags and the
// anchor/cite helpers live there too.
import {
  PageChrome,
  ProjectOverviewBody,
  compareLabels,
  pageStripFor,
  whatChangedLabels,
} from "./page-chrome.js";
import type { ReadOnlyReason } from "@rhema/contracts";

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

// R6LGL.1 (REQ-LCH-1) — every SSR footer is the shared one: brand + the legal/trust link
// group (public funnel pages AND the forced-SSR Page family / not-found document).
function footer(): ReactNode {
  return publicFooter();
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
  const compact = data.compact === true;
  // R7WRITE.1a (REQ-WRITE-6) — the page header strip above `.paper`; the SSR documents feed it
  // the same `page` bag PageChrome renders. `run_lock` keeps no notice here (the lock banner IS
  // the notice verbatim); demo/showcase render the reason's one notice.
  const ro = (data.project as { readOnlyProject?: { reason?: string } | null } | undefined)
    ?.readOnlyProject?.reason;
  const roReason: ReadOnlyReason | null =
    ro === "demo" || ro === "showcase" || ro === "run_lock" ? ro : null;
  const strip =
    data.page != null
      ? pageStripFor(data.page, {
          ...(data.project?.title != null ? { projectTitle: data.project.title } : {}),
          ...(data.compact != null ? { compact: data.compact } : {}),
          readOnlyReason: roReason,
          ...(roReason === "demo" || roReason === "showcase"
            ? {
                notice: (
                  <span data-readonly-notice={roReason} style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
                    {roReason === "demo" ? COPY.readOnly.demoNotice : COPY.readOnly.reason.showcase}
                  </span>
                ),
              }
            : {}),
        })
      : undefined;
  // R7RO.2 (REQ-MOBILE-3 amended; F4; RV-22) — the phone reader's §10.1 entry points. The
  // desktop panel/margin/statusbar/menu subtrees are omitted from the DOM (IdeShell's compact
  // arm); the timeline/findings/chat surfaces mount as server-rendered `<details>` disclosures
  // INSIDE the Page — no-JS-capable native controls (RV-36) — each reachable from the phonebar.
  // A nav link is emitted only for a section that actually renders (never a dead end).
  const gateCard = (run: TimelineRun) =>
    run.gate
      ? gateCardFor(run.gate as GateCardDto, slug, compact, undefined, {
          decisions: (run.card as { decisions?: readonly GateDecisionView[] }).decisions,
        })
      : undefined;
  const L = COPY.ide;
  const phoneNav: { label: string; href: string }[] = [];
  const phoneTimeline = compact && (ide.timelineView != null || (ide.timeline ?? []).length > 0);
  const phoneFindings =
    compact && ((ide.findings ?? []).length > 0 || ide.latestReview != null);
  const phoneChat = compact && ide.chat != null;
  if (phoneTimeline) phoneNav.push({ label: L.panel.tabs.timeline, href: "#phone-timeline" });
  if (phoneFindings) phoneNav.push({ label: L.panel.tabs.findings, href: "#phone-findings" });
  if (phoneChat) phoneNav.push({ label: L.panel.tabs.chat, href: "#phone-chat" });
  if (compact) phoneNav.push({ label: L.statusBar.theme, href: "#phone-reading" });
  return (
    <IdeShell
      {...(compact ? { compact: true, phoneNav } : {})}
      {...(strip != null ? { pageHeader: strip } : {})}
      project={{ slug, title: data.project?.title ?? "", ...(data.project?.pill ? { pill: data.project.pill } : {}) }}
      {...(ide.userId ? { userId: ide.userId } : {})}
      {...(ide.projectId ? { projectId: ide.projectId } : {})}
      {...(data.paperTheme ? { paperTheme: data.paperTheme } : {})}
      {...(data.theme?.pref ? { appTheme: data.theme.pref } : {})}
      {...(ide.initialView ? { initialView: ide.initialView } : {})}
      {...(ide.findings && !compact ? { findings: ide.findings, hasFindings: true } : {})}
      {...(ide.latestReview && !compact
        ? reviewPanelBodies(ide.latestReview, slug)
        : {})}
      {...(ide.timeline && !compact ? { timeline: ide.timeline } : {})}
      {...(ide.timelineView && !compact
        ? {
            timelineView: ide.timelineView,
            timelineLabels,
            timelineCardLabels: runCardLabels,
            timelineHrefs: timelineHrefs(slug),
            // P1.09 — the waiting run mounts the IDENTICAL §6.4 card the Needs-you row expands to
            // (same DTO, same render path; its decision lines ride the run card itself).
            renderGateCard: gateCard,
          }
        : {})}
      {...(ide.feed && !compact
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
      {...(ide.runNextHref && !compact ? { runNextHref: ide.runNextHref } : {})}
      {...(ide.palette && !compact ? { palette: ide.palette } : {})}
      {...(ide.activeRun && !compact ? { activeRun: ide.activeRun } : {})}
      {...(ide.inboxCount != null ? { inboxCount: ide.inboxCount } : {})}
      {...(ide.status && !compact ? { status: ide.status } : {})}
      {...(ide.themeUrl ? { themeUrl: ide.themeUrl } : {})}
      {...(ide.paperThemeUrl ? { paperThemeUrl: ide.paperThemeUrl } : {})}
      {...(ide.chat && !compact ? { chatBody: chatPanel(ide.chat, slug, ide, false) } : {})}
      {...(compact ? {} : dossierSurfaces(data))}
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
      {/* R7RO.2 (REQ-MOBILE-3 amended; F4) — the §10.1 entry points, inside the Page as
          server-rendered disclosures (native <details> — no-JS-capable, KIT-1-styled). The
          meters the hidden status bar carried move to a phone status line; the phonebar links
          above land here. */}
      {compact && ide.status ? (
        <p className="ide-phone-status ide-phone-only" data-phone-status="true">
          {[
            ide.status.version ? `${L.statusBar.versionPrefix}${ide.status.version}` : null,
            typeof ide.status.words === "number"
              ? L.statusBar.wordsFmt.replace("{n}", String(ide.status.words))
              : null,
            typeof ide.status.readMin === "number"
              ? L.statusBar.readMinFmt.replace("{n}", String(ide.status.readMin))
              : null,
            ide.status.venueCap ?? null,
            typeof ide.status.credits === "number"
              ? L.statusBar.creditsFmt.replace("{n}", String(ide.status.credits))
              : null,
          ]
            .filter((s) => s != null)
            .join(" · ")}
        </p>
      ) : null}
      {compact ? (
        <details id="phone-reading" className="ide-phone-section ide-phone-only" data-phone-section="reading">
          <summary>{L.statusBar.theme}</summary>
          <div className="ide-phone-controls">
            <span className="ide-menu-note">{L.viewMenu.fontSerif} / {L.viewMenu.fontSans}</span>
            <button type="button" data-ide-font="serif" aria-checked="true">{L.viewMenu.fontSerif}</button>
            <button type="button" data-ide-font="sans" aria-checked="false">{L.viewMenu.fontSans}</button>
            <button type="button" data-ide-reader="down">{L.viewMenu.readerSmaller}</button>
            <button type="button" data-ide-reader="up">{L.viewMenu.readerBigger}</button>
          </div>
          <div className="ide-phone-controls">
            <span className="ide-menu-note">{L.statusBar.theme}</span>
            {(["dark", "light", "auto"] as const).map((t) => (
              <button key={t} type="button" data-ide-theme={t} aria-checked={(data.theme?.pref ?? "dark") === t}>
                {L.themes[t]}
              </button>
            ))}
          </div>
          <div className="ide-phone-controls">
            <span className="ide-menu-note">{L.statusBar.paper}</span>
            {(["light", "follow", "dark"] as const).map((t) => (
              <button key={t} type="button" data-ide-paper={t} aria-checked={(data.paperTheme ?? "light") === t}>
                {L.themes[t === "follow" ? "paperFollow" : t === "light" ? "paperLight" : "paperDark"]}
              </button>
            ))}
          </div>
        </details>
      ) : null}
      {phoneTimeline ? (
        <details id="phone-timeline" className="ide-phone-section ide-phone-only" data-phone-section="timeline">
          <summary>{L.panel.tabs.timeline}</summary>
          {/* §10.1 — the run sheet's verb chips and the next-step card's launch href stay off
              the reader (run-start is the ✗ column); the round log + run report links + the
              waiting run's compact gate card (Approve / Wait for me / Stop + the triage
              disposition rows) are the admitted inputs. */}
          {ide.timelineView ? (
            <TimelinePane
              view={ide.timelineView}
              labels={timelineLabels}
              cardLabels={runCardLabels}
              hrefs={{ ...timelineHrefs(slug), nextStep: undefined, verbHref: undefined }}
              renderGateCard={gateCard}
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {(ide.timeline ?? []).map((r) => (
                <li key={r.id} style={{ padding: "6px 0" }}>
                  {r.href ? <a href={r.href}>{r.label}</a> : r.label}
                  <span style={{ color: "var(--shell-fg-muted)" }}> · {r.state}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      ) : null}
      {phoneFindings ? (
        <details id="phone-findings" className="ide-phone-section ide-phone-only" data-phone-section="findings">
          <summary>{L.panel.tabs.findings}</summary>
          {/* the §5.7 anchors the Page's finding marks link to — `#finding-<id>` resolves inside
              the reader document (the Margin that owned the ids is a desktop subtree). The ids
              come from the projected list, else the latest delivered review's rows. */}
          {(() => {
            const anchorFindings =
              (ide.findings ?? []).length > 0
                ? (ide.findings ?? [])
                : (ide.latestReview?.findings ?? []);
            return anchorFindings.length > 0 ? (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {anchorFindings.map((f) => (
                  <li key={f.id} id={`finding-${f.id}`} data-finding-id={f.id} data-severity={f.severity}
                      style={{ padding: "6px 0", borderBottom: "1px solid var(--paper-rule)" }}>
                    {f.excerpt}
                    <span style={{ color: "var(--shell-fg-muted)" }}> · {f.severity} · {f.kind}</span>
                  </li>
                ))}
              </ul>
            ) : null;
          })()}
          {/* the latest delivered review's finding list — its disposition writes ride the gate
              card's triage rows above; the dossier links resolve to the SPA's compact dossier. */}
          {ide.latestReview ? reviewPanelBodies(ide.latestReview, slug).deskFindingsBody : null}
        </details>
      ) : null}
      {/* P1.19 — §10.1: the chat surface mounts INSIDE the Page — text only (the compact ChatDesk
          drops the plan card's run-start/edit actions, the anchored suggestion, and the tier
          pick; the estimate line still shows). R7RO.2 — `id` makes it the phonebar's target. */}
      {phoneChat ? (
        <section
          id="phone-chat"
          className="ide-phone-only"
          data-phone-chat="true"
          aria-label={COPY.ide.panel.tabs.chat}
          style={{ marginTop: "24px", borderTop: "1px solid var(--paper-rule)", paddingTop: "12px" }}
        >
          {chatPanel(ide.chat!, slug, ide, true)}
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

/** Auth-gated: the flat project view (the studio editing surface is P1.01) + the Needs-you gate cards
 *  and the Decisions list (PRB.05 — the beta Inbox stand-in, §5.7/§6.4). */
export function ProjectPage(): ReactNode {
  const data = usePageData();
  return (
    <IdeFrame>
      {/* SPA.23 — the body lives in ./page-chrome.js (props-driven) so the `editor` SPA leaf
          renders the identical tree; the SSR wrapper just feeds `usePageData()` fields in. */}
      {/* R7HOME.2b — the overview IS the Page now (REQ-HOME-2): the gates/decisions/approvals/
          voice reads still compose for the ide bag + the settings twin, but the body renders
          none of them below the document. */}
      <ProjectOverviewBody
        {...(data.project ? { project: data.project } : {})}
        compact={data.compact}
        {...(data.page ? { page: data.page } : {})}
      />
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

const CP = COPY.compare;

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
// SPA.24 (REQ-ED-16) — the PRB.07 source editor (`EditorPage` + `SourceEditor` + the editor.js
// island) is RETIRED: `GET /p/:p/edit/:draftId` has 302'd to `/v/:n` since P1.02, so nothing
// rendered it; the `/edit/:draftId/{doc,note,cancel-run,revise}` transport routes stay live (the
// Page's poll + forms). Source mode's return is a designed SPA feature (SPA.25), not a port.
// ---------------------------------------------------------------------------------------------------------------------

const E = COPY.editor;

// =========================================================================================================
// P1.02 — the Page (schema-first ProseMirror/Tiptap surface; §5.4; REQ-DATA-28/29 amended). The SSR render
// carries the full chrome + a static typeset preview + the embedded doc/provenance/findings JSON; the
// page.js island mounts the live PM view over them. The transport URLs point at the SAME `/edit/:draftId/*`
// same-origin endpoints the beta editor used (the transport seam, not a fork — P1.03 swaps it).
// =========================================================================================================

// SPA.23 — `pageLabels`, `anchorQuote`, `danglingCites`, `citeKeysInMarkdown`, `railLabels`,
// `whatChangedLabels`, `compareLabels` moved to ./page-chrome.js (the leaf's shared module).

/** The PageEditor element for `data.page` — shared by the /v/:v routes and the project overview's
 *  working-head mount (P1.02 item 12: `/p/:project` opens the Page on the working head).
 *  SPA.23 — the body is `./page-chrome.js`'s `PageChrome` so the SPA leaf emits the same tree. */
function PageSurface(): ReactNode {
  const { page, compact } = usePageData();
  if (!page) return null;
  return <PageChrome page={page} compact={compact} />;
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

