// The §5.1 IDE shell (REQ-IDE-8): the seven-region pane layout — Rail, Files, Page, Margin, Timeline,
// Desk, Status bar — rendered SSR-static; the ide.js island (apps/web/src/client/ide.ts) enhances it:
// pane toggles + drags persist to localStorage (never the URL), the View menu + theme/paper controls are
// attribute-driven, and every breakpoint rule lives in @rhema/tokens' ideCss so SSR markup is correct at
// any viewport before any script runs. Text-agnostic: every string is a prop from apps/web's COPY table.

import type { CSSProperties, ReactNode } from "react";
import type { PanelTab, ViewMode } from "@rhema/ide";
import { viewMenuModel, VIEW_MODES, CHEAT_SHEET, PANEL_TABS, shortcutFor } from "@rhema/ide";
import { Button, IconButton } from "./primitives/button.js";
import { EmptyFindings } from "./ide-states.js";
import { LiveFeed, type FeedRow, type LiveFeedLabels, type RunCardLabels } from "./run-card.js";
import { TimelinePane, type TimelineViewWire, type TimelineLabels, type TimelineHrefs } from "./timeline.js";
import type { TimelineRun } from "@rhema/findings-core";

export interface IdeLabels {
  rail: { home: string; inbox: string; settings: string; project: string };
  margin: { heading: string; ticksLabel: string };
  timeline: { heading: string; empty: string; close: string };
  panel: {
    heading: string;
    tabs: Record<PanelTab, string>;
    resize: string;
    emptyChat: string;
    emptyFeed: string;
    emptyFindings: string;
    emptyClaims: string;
    findingsTable: { finding: string; severity: string; kind: string; status: string };
    close: string;
  };
  statusBar: {
    view: string;
    theme: string;
    paper: string;
    creditsFmt: string; // "{n} credits"
    versionPrefix: string;
    wordsFmt: string; // "{n} words"
    readMinFmt: string; // "{n} min"
  };
  viewMenu: {
    heading: string;
    views: Record<ViewMode, string>;
    findingCards: string;
    suggestionsInline: string;
    /** P1.02 — the Page's per-block authorship overlay toggle (read-only decorations). */
    authorship: string;
    advanced: string;
    fontSerif: string;
    fontSans: string;
    readerBigger: string;
    readerSmaller: string;
    /** R7PANE.1 (REQ-PANE-1/2) — the right panel's on-demand open row in the View menu. */
    panel: string;
  };
  themes: { dark: string; light: string; auto: string; paperLight: string; paperFollow: string; paperDark: string };
  /** P1.06 (§5.12) — the ⌘K palette's + the `?` cheat sheet's chrome labels (COPY-owned). */
  palette: { dialogLabel: string; placeholder: string; emptyLabel: string; sectionLabels: Record<string, string> };
  cheatsheet: { heading: string; closeLabel: string };
  /** R7FIX.1 (REQ-WRITE-4) — the focus-view exit pill's copy ("Exit focus · Esc"). */
  focusExit: string;
}

export interface IdeShellProps {
  readonly project: { readonly slug: string; readonly title: string; readonly pill?: string };
  /** pane-persistence key parts — per user × project (localStorage, never the URL). */
  readonly userId?: string;
  readonly projectId?: string;
  /** the SSR-known paper pin + app pref (the client also mirrors to localStorage). */
  readonly paperTheme?: "light" | "follow" | "dark";
  readonly appTheme?: "dark" | "light" | "auto";
  /** ?focus=1 (the ONLY shareable pane URL flag — the island applies then strips it). */
  readonly initialView?: ViewMode;
  readonly hasFindings?: boolean;
  /** margin content (the finding rows the cards/ticks summarize) — absent ⇒ Margin hides. */
  readonly findings?: readonly { id: string; severity: string; kind: string; excerpt: string }[];
  /**
   * P1.07 — the Margin's full surface (MarginSurface: cards/chips/suggestions), superseding the flat
   * `findings` excerpt cards when set. The ticks still render from `findings` (the minimized echo).
   */
  readonly marginBody?: ReactNode;
  /**
   * P1.07 — the Desk's Findings tab body (FindingsDesk: the screen-reader table + filters + triage
   * queue), superseding the flat `findings` table when set.
   */
  readonly deskFindingsBody?: ReactNode;
  /**
   * R7TALK.1b (REQ-TALK-4) — the panel's Claims tab body (the latest delivered review's claim
   * ledger). Absent ⇒ the tab keeps its empty state — which is correct ONLY when the project
   * never delivered a review.
   */
  readonly deskClaimsBody?: ReactNode;
  /**
   * P1.11 — the Desk's Chat tab body (ChatDesk: threads, transcript, composer, cost strip, plan
   * card, pins, sources — §7.1). Absent ⇒ the tab keeps its placeholder copy.
   */
  readonly chatBody?: ReactNode;
  /** the Timeline's run rows (the round log; P1.09 owns the full log — this renders what it's given). */
  readonly timeline?: readonly { id: string; label: string; state: string; href?: string }[];
  /**
   * P1.05 — the structured Timeline pane (§5.5): rounds, the next-step card, run cards. Set WITH
   * `timelineLabels`/`timelineCardLabels`; supersedes the flat `timeline` rows when present.
   */
  readonly timelineView?: TimelineViewWire;
  readonly timelineLabels?: TimelineLabels;
  readonly timelineCardLabels?: RunCardLabels;
  readonly timelineHrefs?: TimelineHrefs;
  /**
   * P1.09 (§6.4) — renders the waiting run's identical approve-with-deadline card inside its run card
   * (the app builds it from `run.gate`, the same DTO the Needs-you rows consume). Absent ⇒ the run
   * card keeps its waiting label + link.
   */
  readonly renderGateCard?: (run: TimelineRun) => ReactNode;
  /** a non-terminal run (the Desk auto-opens on Live feed — §5.1). */
  readonly activeRun?: { readonly runId: string; readonly state: string } | null;
  /**
   * P1.05 — the Desk's Live feed tab (§5.5; REQ-IDE-14): SSR renders the replayed rows at `density`;
   * the island tails `eventsUrl` (same-origin SSE) and re-filters on the density tabs. `labelMaps`
   * is the app copy's `FeedLabelMaps` JSON (embedded, so the island's rows stay controlled copy).
   */
  readonly feed?: {
    readonly runId: string;
    readonly eventsUrl: string;
    readonly density: "summary" | "details" | "verbose";
    readonly rows: readonly FeedRow[];
    /** the highest replayed seq — the island's EventSource resumes at `?after=<lastSeq>`. */
    readonly lastSeq?: number;
    readonly labels: LiveFeedLabels;
    readonly labelMaps: string;
  };
  /** the ⌘⇧R "run next step" target — the run sheet for the next-step card's verb (§5.5/§6.3). */
  readonly runNextHref?: string;
  /**
   * P1.06 (§5.12; REQ-CHAT-28) — the ⌘K palette's embedded `PaletteData` JSON (next-step pin, Go-to
   * targets, recent runs, threads, settings) + the same-origin search URL the island calls for
   * hits; R7SHELL.1c moved the embed to `.ide` for the AppShell palette. No POST ever rides it.
   */
  readonly palette?: string;
  readonly inboxCount?: number;
  readonly status?: {
    readonly version?: string;
    readonly words?: number;
    readonly readMin?: number;
    readonly venueCap?: string;
    readonly credits?: number;
  };
  /** same-origin write endpoints the island posts to (web routes forward to the api). */
  readonly themeUrl?: string;
  readonly paperThemeUrl?: string;
  readonly labels: IdeLabels;
  /**
   * R7DEM.4b — an optional top strip inside the `.ide` column (the demo banner). It sits in
   * the flex column BEFORE `.ide-main` so the shell still fills 100dvh — a sibling of `.ide`
   * would push the status bar off-screen.
   */
  readonly banner?: ReactNode;
  /**
   * R7SHELL.1a (REQ-SHELL-1; ADR-128's REQ-IDE-2 item) — stamped when the shell mounts inside the
   * AppShell: the global rail (⌂ ◎ ▤ ⚙) and the phonebar are NOT emitted — the sidebar carries
   * the rail's items and the shell's top bar carries the narrow-desktop chrome. The SSR island
   * documents (the phone reader) pass nothing and keep both.
   */
  readonly hosted?: boolean;
  /**
   * R7PANE.1 (deliverable 8; REQ-DWEB-7 re-asserted) — a demo boot: the Chat tab's trigger is
   * hidden (its body would read workspace data — 232 owns the composer's demo clause) and
   * `data-demo` stamps the gate fact. Findings/Claims/Timeline render from the demo twins;
   * the feed tail can never construct (the island's `isDemo()` gate is the second wall).
   */
  readonly demo?: boolean;
  /**
   * R7WRITE.1a (REQ-WRITE-6) — the page header strip, rendered inside `.ide-page` ABOVE `.paper`
   * (the breadcrumb/version chip/sync pill/ReadOnlyProject notice/actions + the banners and
   * proposal cards that used to typeset inside the card). Absent ⇒ the paper starts at the top.
   */
  readonly pageHeader?: ReactNode;
  /**
   * R7RO.2 (REQ-RELOAD-7; REQ-MOBILE-3 amended; RV-22) — the phone-UA reader verdict. When true
   * the desktop-only subtrees NEVER enter the DOM (frontend-spa-spec §216 — CSS hiding is a
   * contract violation): the right panel, the Margin, the status bar, the drag handle, the
   * scrim, the View/Theme menus, the cheat sheet and the focus-exit pill are all omitted. The
   * reader keeps the phonebar + the Page + `phoneSections` (the §10.1 disclosures the caller
   * mounts inside `.paper`).
   */
  readonly compact?: boolean;
  /**
   * R7RO.2 — the phonebar's §10.1 entry links (Timeline/Findings/Chat/Reading anchors into the
   * document's own phone sections). The caller emits one row per rendered section — a nav link
   * to a section that does not exist is a dead end and is never emitted.
   */
  readonly phoneNav?: readonly { readonly label: string; readonly href: string }[];
  /** the Page region's content — the surface this route owns. */
  readonly children?: ReactNode;
}

function fmt(template: string, n: number): string {
  return template.replace("{n}", String(n));
}

export function IdeShell(props: IdeShellProps): ReactNode {
  const { labels: L, project } = props;
  const view: ViewMode = props.initialView ?? "write";
  const findings = props.findings ?? [];
  const hasFindings = props.hasFindings ?? findings.length > 0;
  const compact = props.compact === true;
  // R7RO.2 — on the phone reader the Margin/panel are never in the DOM: stamp the honest
  // closed/hidden facts rather than a capability the document does not carry.
  const marginMode = compact || !hasFindings ? "hidden" : "auto"; // findingCards toggle flips auto↔ticks client-side
  const panelOpen = !compact && props.activeRun != null; // a live run auto-opens the panel on Live feed (§5.1)

  return (
    <div
      className="ide"
      data-ide="1"
      data-project={project.slug}
      {...(props.projectId ? { "data-project-id": props.projectId } : {})}
      {...(props.userId ? { "data-user": props.userId } : {})}
      data-view={view}
      // R7PANE.1 (REQ-PANE-1/2) — SSR emits the right panel CLOSED: the controller derives the
      // effective open state from paneLayout(viewport) at bind, so a document can never paint an
      // un-scrimmed overlay (or a sheet) over the draft before script runs. The `data-desk`/
      // `data-desk-tab`/`data-timeline` aliases keep the R7a journey hooks resolvable on this
      // markup (the same change that migrates them through dom-contract.ts).
      data-panel={panelOpen ? "open" : "closed"}
      data-panel-tab={panelOpen ? "feed" : "chat"}
      data-desk={panelOpen ? "open" : "closed"}
      data-desk-tab={panelOpen ? "feed" : "chat"}
      data-timeline={panelOpen ? "open" : "closed"}
      {...(props.demo ? { "data-demo": "1" } : {})}
      data-margin={marginMode}
      data-finding-cards="1"
      data-paper-theme={props.paperTheme ?? "light"}
      data-app-theme-pref={props.appTheme ?? "dark"}
      {...(props.themeUrl ? { "data-theme-url": props.themeUrl } : {})}
      {...(props.paperThemeUrl ? { "data-paper-url": props.paperThemeUrl } : {})}
      {...(props.activeRun ? { "data-run-state": props.activeRun.state } : {})}
      {...(props.palette ? { "data-palette": props.palette } : {})}
      {...(props.runNextHref ? { "data-run-next": props.runNextHref } : {})}
      {...(props.hosted ? { "data-ide-hosted": "1" } : {})}
    >
      {/* R7DEM.4b — the demo banner strip: a column child so `.ide` keeps its 100dvh
          contract (the main region yields the banner's height). */}
      {props.banner}
      {/* the phone-width fallback bar (visible <768 only — the reader-only Page layout).
          P1.19 — the Inbox link + badge ride it: the Rail is display:none at this width, and the
          badge is how a phone reader reaches the approvals/decisions the input set centers on.
          R7SHELL.1a — never emitted while AppShell-hosted (the shell's top bar owns <768). */}
      {!props.hosted ? (
        <div className="ide-phonebar">
          <a href="/app" aria-label={L.rail.home}>← {L.rail.home}</a>
          <strong>{project.title}</strong>
          {/* R7RO.2 (REQ-MOBILE-3) — the §10.1 entry points, one link per rendered phone
              section (never a dead-end href). */}
          {(props.phoneNav ?? []).map((n) => (
            <a key={n.href} href={n.href}>{n.label}</a>
          ))}
          <a href="/app/inbox" className="ide-badge" data-count={props.inboxCount ?? 0}
             title={L.rail.inbox} aria-label={L.rail.inbox}>◎</a>
        </div>
      ) : null}
      <div className="ide-main">
        {/* R7SHELL.2 (REQ-SHELL-4) — the icon rail AND the 36-px Files strip are DELETED, not
            hidden: the AppShell sidebar owns workspace nav and the expanded project tree. */}

        {/* Page + Margin */}
        <div className="ide-center">
          {/* id+tabIndex: the REQ-UX-16 skip link's focus target — programmatic focus only,
              never route-driven (the Page is never auto-focused). */}
          <main id="ide-page" className="ide-page" data-pane="page" aria-label={project.title} tabIndex={-1}>
            {props.pageHeader}
            <div className="paper" data-paper-surface>
              {props.children}
            </div>
          </main>
          {/* Margin — findings beside the Page; an ARIA landmark (REQ-IDE-42).
              R7RO.2 — omitted on the phone reader (never CSS-hidden: not emitted at all). */}
          {compact ? null : (
          <aside className="ide-margin" data-pane="margin" aria-label={L.margin.heading} role="complementary">
            <span className="sr-only">{L.margin.ticksLabel}</span>
            {findings.map((f) => (
              <a key={f.id} className="ide-tick ui-d-sev" href={`#finding-${f.id}`} aria-label={f.excerpt}
                 title={f.excerpt} style={{ "--d-sev": `var(--sev-${f.severity})` } as CSSProperties} />
            ))}
            {props.marginBody ??
              findings.map((f) => (
                <div key={`card-${f.id}`} id={`finding-${f.id}`} data-finding-id={f.id} className="ide-fcard ui-d-fcard" style={{ "--d-sev": `var(--sev-${f.severity})` } as CSSProperties}>
                  {f.excerpt}
                </div>
              ))}
          </aside>
          )}
        </div>

        {/* The right panel's drag handle — a real `separator` with keyboard resize (UXC-26).
            R7RO.2 — omitted on the phone reader (there is no panel to resize). */}
        {compact ? null : (
        <Button type="button" variant="ghost" className="ide-handle" data-ide-handle="panel" role="separator"
                aria-label={L.panel.resize} aria-orientation="vertical"
                aria-valuenow={320} aria-valuemin={160} aria-valuemax={480} />
        )}
        {/* R7FIX.1 (REQ-PANE-0) — the scrim an open overlay/sheet draws over the Page region;
            CSS shows it only while a pane is open in an overlay/sheet mode. */}
        {compact ? null : <div className="ide-scrim" data-ide-scrim aria-hidden="true" />}

        {/* Right panel — the ADR-128 region (REQ-PANE-3): the Desk's four tab bodies and the
            Timeline aside's content moved UNCHANGED into Chat · Findings · Claims · Timeline ·
            Live feed (`]` toggles the pane; the tab strip keeps the Desk's attribute-driven
            tablist so the island's pane-state contract never forks).
            R7RO.2 — omitted on the phone reader: the §10.1 mounts the timeline/findings/chat
            disclosures inside the Page instead (never a hidden second copy). */}
        {compact ? null : (
        <aside className="ide-panel" data-pane="panel" aria-label={L.panel.heading}>
          <div className="ide-panel-head">
            <div className="ide-panel-tabs" role="tablist" aria-label={L.panel.heading}>
              {PANEL_TABS.map((tab) => (
                <Button key={tab} variant="ghost" role="tab" data-ide-panel-tab={tab} data-ide-desk-tab={tab}
                        aria-selected={(panelOpen ? "feed" : "chat") === tab}
                        {...(props.demo && tab === "chat" ? { hidden: true, disabled: true, "data-demo-gated": "1" } : {})}>
                  {L.panel.tabs[tab]}
                </Button>
              ))}
            </div>
            <IconButton variant="ghost" size="sm" data-ide-panel-toggle data-ide-desk-toggle aria-label={L.panel.close} className="ide-panel-close">×</IconButton>
          </div>
          <div className="ide-panel-body" role="tabpanel">
            {/* All five tab bodies render; data-panel-tab on .ide picks the visible one in CSS.
                The `data-desk-panel` aliases keep R7a hooks resolvable (same migration change). */}
            <div data-panel-body="chat" data-desk-panel="chat">
              {props.chatBody ?? <p>{L.panel.emptyChat}</p>}
            </div>
            <div data-panel-body="findings" data-desk-panel="findings">
              {/* The Findings body IS the screen-reader surface (§5.9 a11y) — a real <table>.
                  P1.07: `deskFindingsBody` carries the full FindingsDesk (filters + triage
                  queue + bulk actions); the flat table remains the fallback. */}
              {props.deskFindingsBody ?? (findings.length === 0 ? (
                <EmptyFindings label={L.panel.emptyFindings} />
              ) : (
                <table className="ui-vc-w ui-d-fd" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="ui-d-t" style={{ textAlign: "left" }}>
                      <th scope="col">{L.panel.findingsTable.finding}</th>
                      <th scope="col">{L.panel.findingsTable.severity}</th>
                      <th scope="col">{L.panel.findingsTable.kind}</th>
                      <th scope="col">{L.panel.findingsTable.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((f) => (
                      <tr key={f.id} id={`finding-${f.id}`}>
                        <td>{f.excerpt}</td>
                        <td>{f.severity}</td>
                        <td>{f.kind}</td>
                        <td>open</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
            <div data-panel-body="claims" data-desk-panel="claims">
              {props.deskClaimsBody ?? <p>{L.panel.emptyClaims}</p>}
            </div>
            <div data-panel-body="timeline" data-desk-panel="timeline">
              {/* the Timeline aside's content, moved unchanged (§5.5 the round log). */}
              <div className="ide-tl-body">
                {props.timelineView && props.timelineLabels && props.timelineCardLabels ? (
                  <TimelinePane
                    view={props.timelineView}
                    labels={props.timelineLabels}
                    cardLabels={props.timelineCardLabels}
                    {...(props.timelineHrefs ? { hrefs: props.timelineHrefs } : {})}
                    {...(props.renderGateCard ? { renderGateCard: props.renderGateCard } : {})}
                  />
                ) : (props.timeline ?? []).length === 0 ? (
                  <p className="ui-d-t">{L.timeline.empty}</p>
                ) : (
                  <ul className="ui-c2-m0 ui-d-p0" style={{ listStyle: "none" }}>
                    {(props.timeline ?? []).map((r) => (
                      <li key={r.id} className="ui-d-p2 ui-d-fd">
                        {r.href ? <a href={r.href}>{r.label}</a> : r.label}
                        <span className="ui-d-i"> · {r.state}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div
              data-panel-body="feed"
              data-desk-panel="feed"
              aria-live="polite"
              {...(props.feed
                ? {
                    "data-feed-run": props.feed.runId,
                    "data-feed-events": props.feed.eventsUrl,
                    "data-feed-labels": props.feed.labelMaps,
                    ...(props.feed.lastSeq != null ? { "data-feed-last-seq": String(props.feed.lastSeq) } : {}),
                  }
                : {})}
            >
              {props.feed ? (
                <LiveFeed density={props.feed.density} rows={props.feed.rows} labels={props.feed.labels} />
              ) : (
                <p>{props.activeRun ? props.activeRun.state : L.panel.emptyFeed}</p>
              )}
            </div>
          </div>
        </aside>
        )}
      </div>

      {/* Status bar — version / words / reading time / venue cap / credits (§5.1). The save state
          lives in the Page's [data-sync-pill] only (EDIT.1/ADR-049 — one indicator; this slot used
          to render a second, SSR-pinned "Synced" that nothing ever fed).
          R7RO.2 — omitted on the phone reader; the meters render in the phone status line. */}
      {compact ? null : (
      <footer className="ide-statusbar" aria-label="Status">
        {props.status?.version ? <span>{L.statusBar.versionPrefix}{props.status.version}</span> : null}
        {/* data-status-* slots: the page.js island rewrites them live (per-keystroke meters, P1.02). */}
        {typeof props.status?.words === "number" ? <span className="ide-count" data-status-words data-fmt={L.statusBar.wordsFmt}>{fmt(L.statusBar.wordsFmt, props.status.words)}</span> : null}
        {typeof props.status?.readMin === "number" ? <span className="ide-count" data-status-readmin data-fmt={L.statusBar.readMinFmt}>{fmt(L.statusBar.readMinFmt, props.status.readMin)}</span> : null}
        {props.status?.venueCap ? <span data-status-venue>{props.status.venueCap}</span> : null}
        <span className="ui-d-mla" />
        {typeof props.status?.credits === "number" ? <span className="ide-count">{fmt(L.statusBar.creditsFmt, props.status.credits)}</span> : null}
        {/* R7SHELL.1a (UXC-10) — the View menu's home while the rail is suppressed (`v` chord). */}
        <Button variant="ghost" size="sm" data-ide-view-menu aria-haspopup="menu" aria-expanded="false" title={shortcutFor("view-menu") ?? undefined}>{L.statusBar.view}</Button>
        <Button variant="ghost" size="sm" data-ide-theme-menu aria-haspopup="menu" aria-expanded="false">{L.statusBar.theme}</Button>
      </footer>
      )}

      {/* The View menu — exact §5.1 contents (Write·Read·Focus; finding cards; inline suggestions;
          Advanced ⌘⇧M; font preset + reader stepper). NO Source entry — it lives in Files.
          R7RO.2 — omitted on the phone reader (its typography controls live in the Reading
          disclosure inside the Page). */}
      {compact ? null : (
      <div className="ide-menu" data-ide-menu="view" role="menu" aria-label={L.viewMenu.heading} hidden>
        {VIEW_MODES.map((m) => (
          <Button key={m.id} variant="ghost" role="menuitemradio" aria-checked={view === m.id}
                  data-ide-view={m.id} className="ide-menu-row">
            <span>{L.viewMenu.views[m.id]}</span>
            {m.keys ? <kbd className="ide-menu-key">{m.keys}</kbd> : null}
          </Button>
        ))}
        <div className="ide-menu-sep" />
        {viewMenuModel(view).map((t) => (
          <Button key={t.id} variant="ghost" role="menuitemcheckbox"
                  aria-checked={t.id === "advanced" || t.id === "authorship" || t.id === "timeline" ? "false" : "true"}
                  {...(t.id === "authorship" ? { "data-tier": "advanced" } : {})}
                  // R7PANE.1 (REQ-PANE-1/2) — the panel row rides `data-ide-panel-toggle`
                  // (the island's overlay-aware path) rather than the boolean-pane toggle;
                  // `data-ide-timeline-toggle` stays emitted as the R7a alias.
                  {...(t.id === "panel" ? { "data-ide-panel-toggle": true, "data-ide-timeline-toggle": true } : { "data-ide-toggle": t.id })}
                  className="ide-menu-row">
            <span>{t.id === "panel" ? L.viewMenu.panel
              : t.id === "findingCards" ? L.viewMenu.findingCards
              : t.id === "suggestionsInline" ? L.viewMenu.suggestionsInline
              : t.id === "authorship" ? L.viewMenu.authorship
              : L.viewMenu.advanced}</span>
            {t.keys ? <kbd className="ide-menu-key">{t.keys}</kbd> : null}
          </Button>
        ))}
        <div className="ide-menu-sep" />
        <div className="ide-menu-note">{L.viewMenu.fontSerif} / {L.viewMenu.fontSans}</div>
        <Button variant="ghost" className="ide-menu-row" data-ide-font="serif" role="menuitemradio" aria-checked="true">{L.viewMenu.fontSerif}</Button>
        <Button variant="ghost" className="ide-menu-row" data-ide-font="sans" role="menuitemradio" aria-checked="false">{L.viewMenu.fontSans}</Button>
        <div className="ide-menu-sep" />
        <Button variant="ghost" className="ide-menu-row" data-ide-reader="down">{L.viewMenu.readerSmaller}</Button>
        <Button variant="ghost" className="ide-menu-row" data-ide-reader="up">{L.viewMenu.readerBigger}</Button>
      </div>
      )}

      {/* Theme menu — app theme (dark/light/auto) + the per-project paper pin (⌘⇧L). */}
      {compact ? null : (
      <div className="ide-menu" data-ide-menu="theme" role="menu" aria-label={L.statusBar.theme} hidden>
        <div className="ide-menu-note">{L.statusBar.theme}</div>
        {(["dark", "light", "auto"] as const).map((t) => (
          <Button key={t} variant="ghost" role="menuitemradio" aria-checked={(props.appTheme ?? "dark") === t}
                  data-ide-theme={t} className="ide-menu-row">
            {L.themes[t]}
          </Button>
        ))}
        <div className="ide-menu-sep" />
        <div className="ide-menu-note">{L.statusBar.paper}</div>
        {(["light", "follow", "dark"] as const).map((t) => (
          <Button key={t} variant="ghost" role="menuitemradio" aria-checked={(props.paperTheme ?? "light") === t}
                  data-ide-paper={t} className="ide-menu-row">
            {L.themes[t === "follow" ? "paperFollow" : t === "light" ? "paperLight" : "paperDark"]}
          </Button>
        ))}
      </div>
      )}

      {/* R7FIX.1 (REQ-WRITE-4, B12) — the focus-view exit pill: hover- and keyboard-revealed
          (CSS shows it only under data-view='focus'); Esc always exits too.
          R7RO.2 — omitted on the phone reader (no view modes on the reader). */}
      {compact ? null : (
      <Button variant="secondary" className="ide-focus-exit" data-ide-focus-exit>
        {L.focusExit}
      </Button>
      )}

      {/* P1.06 (§5.12) — the `?` cheat sheet: the full keymap rendered from the shared CHEAT_SHEET
          table (@rhema/ide) so the card can never drift from the dispatcher.
          R7RO.2 — omitted on the phone reader (the keymap is the SPA's; there are no chords). */}
      {compact ? null : (
      <div className="ide-cheatsheet" data-ide-cheatsheet role="dialog" aria-label={L.cheatsheet.heading} hidden>
        <div className="ide-cheatsheet-card">
          <div className="ide-pane-head">
            <span>{L.cheatsheet.heading}</span>
            <IconButton variant="ghost" size="sm" data-ide-cheatsheet-close aria-label={L.cheatsheet.closeLabel}>×</IconButton>
          </div>
          <ul>
            {CHEAT_SHEET.map((row) => (
              <li key={row.keys} className="ide-cheatsheet-row">
                <kbd>{row.keys}</kbd>
                <span>{row.action}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      )}
    </div>
  );
}
