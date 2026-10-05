// The §5.1 IDE shell (REQ-IDE-8): the seven-region pane layout — Rail, Files, Page, Margin, Timeline,
// Desk, Status bar — rendered SSR-static; the ide.js island (apps/web/src/client/ide.ts) enhances it:
// pane toggles + drags persist to localStorage (never the URL), the View menu + theme/paper controls are
// attribute-driven, and every breakpoint rule lives in @rhema/tokens' ideCss so SSR markup is correct at
// any viewport before any script runs. Text-agnostic: every string is a prop from apps/web's COPY table.

import type { ReactNode } from "react";
import type { DeskTab, ViewMode } from "@rhema/ide";
import { viewMenuModel, VIEW_MODES, CHEAT_SHEET } from "@rhema/ide";
import { EmptyFindings } from "./ide-states.js";
import { LiveFeed, type FeedRow, type LiveFeedLabels, type RunCardLabels } from "./run-card.js";
import { TimelinePane, type TimelineViewWire, type TimelineLabels, type TimelineHrefs } from "./timeline.js";
import type { TimelineRun } from "@rhema/findings-core";

export interface IdeLabels {
  rail: { home: string; inbox: string; settings: string; project: string };
  files: { heading: string; empty: string; close: string; open: string; sourceFile: string };
  margin: { heading: string; ticksLabel: string };
  timeline: { heading: string; empty: string; close: string };
  desk: {
    heading: string;
    tabs: Record<DeskTab, string>;
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
    synced: string;
    syncing: string;
    offline: string;
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
  };
  themes: { dark: string; light: string; auto: string; paperLight: string; paperFollow: string; paperDark: string };
  /** P1.06 (§5.12) — the ⌘K palette's + the `?` cheat sheet's chrome labels (COPY-owned). */
  palette: { dialogLabel: string; placeholder: string; emptyLabel: string; sectionLabels: Record<string, string> };
  cheatsheet: { heading: string; closeLabel: string };
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
  /** the source editor's file link (the Advanced-tier Files row — §5.1 progressive disclosure). */
  readonly sourceHref?: string;
  /**
   * P1.08 — the §5.13 Files pane (typed sections, provenance badges, lock icons, freshness notes,
   * sealed counts). Supersedes the strip list when set; absent ⇒ the strip renders exactly as before.
   */
  readonly filesBody?: ReactNode;
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
   * free-text hits. The palette NEVER launches a run — every cost-bearing row is a sheet GET.
   */
  readonly palette?: string;
  readonly paletteSearchUrl?: string;
  readonly inboxCount?: number;
  readonly status?: {
    readonly version?: string;
    readonly words?: number;
    readonly readMin?: number;
    readonly venueCap?: string;
    readonly credits?: number;
    readonly sync?: "synced" | "syncing" | "offline";
  };
  /** same-origin write endpoints the island posts to (web routes forward to the api). */
  readonly themeUrl?: string;
  readonly paperThemeUrl?: string;
  readonly labels: IdeLabels;
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
  const marginMode = !hasFindings ? "hidden" : "auto"; // findingCards toggle flips auto↔ticks client-side
  const deskOpen = props.activeRun != null; // a live run auto-opens the Desk on the Feed tab (§5.1)
  const sync = props.status?.sync ?? "synced";
  const syncLabel =
    sync === "offline" ? L.statusBar.offline : sync === "syncing" ? L.statusBar.syncing : L.statusBar.synced;

  return (
    <div
      className="ide"
      data-ide="1"
      data-project={project.slug}
      {...(props.projectId ? { "data-project-id": props.projectId } : {})}
      {...(props.userId ? { "data-user": props.userId } : {})}
      data-view={view}
      data-files="strip"
      data-timeline="open"
      data-desk={deskOpen ? "open" : "closed"}
      data-desk-tab={deskOpen ? "feed" : "chat"}
      data-margin={marginMode}
      data-finding-cards="1"
      data-paper-theme={props.paperTheme ?? "light"}
      data-app-theme-pref={props.appTheme ?? "dark"}
      {...(props.themeUrl ? { "data-theme-url": props.themeUrl } : {})}
      {...(props.paperThemeUrl ? { "data-paper-url": props.paperThemeUrl } : {})}
      {...(props.activeRun ? { "data-run-state": props.activeRun.state } : {})}
      {...(props.runNextHref ? { "data-run-next": props.runNextHref } : {})}
    >
      {/* the phone-width fallback bar (visible <768 only — the reader-only Page layout).
          P1.19 — the Inbox link + badge ride it: the Rail is display:none at this width, and the
          badge is how a phone reader reaches the approvals/decisions the input set centers on. */}
      <div className="ide-phonebar">
        <a href="/app" aria-label={L.rail.home}>← {L.rail.home}</a>
        <strong>{project.title}</strong>
        <a href="/app/inbox" className="ide-badge" data-count={props.inboxCount ?? 0}
           title={L.rail.inbox} aria-label={L.rail.inbox}>◎</a>
      </div>
      <div className="ide-main">
        {/* Rail — the only persistent global chrome (§5.1). */}
        <nav className="ide-rail" aria-label={L.rail.project}>
          <a href="/app" title={L.rail.home} aria-label={L.rail.home}>⌂</a>
          {/* P1.19 — the badge opens the global /app/inbox (REQ-IDE-2 amended); the count is the
              api's approvals+decisions number. */}
          <a href="/app/inbox" className="ide-badge" data-count={props.inboxCount ?? 0}
             title={L.rail.inbox} aria-label={L.rail.inbox}>◎</a>
          <span className="ide-rail-spacer" />
          <button type="button" data-ide-view-menu title={L.statusBar.view} aria-haspopup="menu" aria-expanded="false">▤</button>
          <a href="/settings" title={L.rail.settings} aria-label={L.rail.settings}>⚙</a>
        </nav>

        {/* Files — 36-px strip default; ⌘1 opens the pane (§5.1). Strip/body swap is CSS on
            data-files so SSR is correct at either state with zero script. */}
        <aside className="ide-files" data-pane="files" aria-label={L.files.heading}>
          <div className="ide-files-strip">
            <button type="button" data-ide-files-toggle title={L.files.open} aria-label={L.files.open}>▤</button>
          </div>
          <div className="ide-pane-head">
            <span>{L.files.heading}</span>
            <button type="button" data-ide-files-toggle aria-label={L.files.close} style={{ marginLeft: "auto" }}>×</button>
          </div>
          <div className="ide-files-body">
            {props.filesBody ?? (
              <>
                <ul>
                  <li data-current>{project.title}</li>
                  {/* the Source file row is an Advanced-tier control (§5.1 progressive disclosure —
                      "view.source" is not in the View menu; CSS hides it until data-advanced="1"). */}
                  {props.sourceHref ? (
                    <li data-tier="advanced">
                      <a href={props.sourceHref}>{L.files.sourceFile}</a>
                    </li>
                  ) : null}
                </ul>
                <p style={{ fontSize: 12 }}>{L.files.empty}</p>
              </>
            )}
          </div>
        </aside>
        <button type="button" className="ide-handle" data-ide-handle="files" aria-hidden="true" tabIndex={-1} />

        {/* Page + Margin */}
        <div className="ide-center">
          <main className="ide-page" data-pane="page" aria-label={project.title}>
            <div className="paper" data-paper-surface>
              {props.children}
            </div>
          </main>
          {/* Margin — findings beside the Page; an ARIA landmark (REQ-IDE-42). */}
          <aside className="ide-margin" data-pane="margin" aria-label={L.margin.heading} role="complementary">
            <span className="sr-only">{L.margin.ticksLabel}</span>
            {findings.map((f) => (
              <a key={f.id} className="ide-tick" href={`#finding-${f.id}`} aria-label={f.excerpt}
                 title={f.excerpt} style={{ background: `var(--sev-${f.severity})` }} />
            ))}
            {props.marginBody ??
              findings.map((f) => (
                <div key={`card-${f.id}`} id={`finding-${f.id}`} data-finding-id={f.id} className="ide-fcard" style={{ borderLeftColor: `var(--sev-${f.severity})` }}>
                  {f.excerpt}
                </div>
              ))}
          </aside>
        </div>

        {/* Timeline — the round log (§5.1); overlay/sheet below the breakpoints. */}
        <button type="button" className="ide-handle" data-ide-handle="timeline" aria-hidden="true" tabIndex={-1} />
        <aside className="ide-timeline" data-pane="timeline" data-open aria-label={L.timeline.heading}>
          <div className="ide-pane-head">
            <span>{L.timeline.heading}</span>
            <button type="button" data-ide-timeline-toggle aria-label={L.timeline.close} style={{ marginLeft: "auto" }}>×</button>
          </div>
          <div className="ide-tl-body">
            {props.timelineView && props.timelineLabels && props.timelineCardLabels ? (
              // P1.05 — the round log: next-step card, round cards (vN → runs → v(N+1)), origin chip.
              <TimelinePane
                view={props.timelineView}
                labels={props.timelineLabels}
                cardLabels={props.timelineCardLabels}
                {...(props.timelineHrefs ? { hrefs: props.timelineHrefs } : {})}
                {...(props.renderGateCard ? { renderGateCard: props.renderGateCard } : {})}
              />
            ) : (props.timeline ?? []).length === 0 ? (
              <p style={{ color: "var(--shell-fg-muted)", fontSize: 13 }}>{L.timeline.empty}</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {(props.timeline ?? []).map((r) => (
                  <li key={r.id} style={{ padding: "4px 0", fontSize: 13 }}>
                    {r.href ? <a href={r.href}>{r.label}</a> : r.label}
                    <span style={{ color: "var(--shell-fg-faint)", fontSize: 12 }}> · {r.state}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Desk — the bottom drawer (⌘J): Chat / Live feed / Findings / Claims (§5.1). */}
      <section className="ide-desk" data-pane="desk" aria-label={L.desk.heading}>
        <div className="ide-desk-tabs" role="tablist" aria-label={L.desk.heading}>
          {(["chat", "feed", "findings", "claims"] as const).map((tab) => (
            <button key={tab} type="button" role="tab" data-ide-desk-tab={tab}
                    aria-selected={(deskOpen ? "feed" : "chat") === tab}>
              {L.desk.tabs[tab]}
            </button>
          ))}
          <button type="button" data-ide-desk-toggle aria-label={L.desk.close} style={{ marginLeft: "auto", color: "var(--shell-fg-muted)", background: "none", border: "none", cursor: "pointer" }}>×</button>
        </div>
        <div className="ide-desk-body" role="tabpanel">
          {/* All four tab bodies render; data-desk-tab on .ide picks the visible one in CSS. */}
          <div data-desk-panel="chat">
            {props.chatBody ?? <p>{L.desk.emptyChat}</p>}
          </div>
          <div
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
              <p>{props.activeRun ? props.activeRun.state : L.desk.emptyFeed}</p>
            )}
          </div>
          {/* The Desk findings table IS the screen-reader surface (§5.9 a11y) — a real <table>.
              P1.07: `deskFindingsBody` carries the full FindingsDesk (filters + triage queue + bulk
              actions); the flat table remains the fallback for callers without finding rows. */}
          <div data-desk-panel="findings">
            {props.deskFindingsBody ?? (findings.length === 0 ? (
              <EmptyFindings label={L.desk.emptyFindings} />
            ) : (
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
                    <th scope="col">{L.desk.findingsTable.finding}</th>
                    <th scope="col">{L.desk.findingsTable.severity}</th>
                    <th scope="col">{L.desk.findingsTable.kind}</th>
                    <th scope="col">{L.desk.findingsTable.status}</th>
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
          <div data-desk-panel="claims">
            <p>{L.desk.emptyClaims}</p>
          </div>
        </div>
      </section>

      {/* Status bar — version / sync / words / reading time / venue cap / credits (§5.1). */}
      <footer className="ide-statusbar" aria-label="Status">
        {props.status?.version ? <span>{L.statusBar.versionPrefix}{props.status.version}</span> : null}
        <span className="ide-sync" data-state={sync} role="status" aria-live="polite">{syncLabel}</span>
        {/* data-status-* slots: the page.js island rewrites them live (per-keystroke meters, P1.02). */}
        {typeof props.status?.words === "number" ? <span className="ide-count" data-status-words data-fmt={L.statusBar.wordsFmt}>{fmt(L.statusBar.wordsFmt, props.status.words)}</span> : null}
        {typeof props.status?.readMin === "number" ? <span className="ide-count" data-status-readmin data-fmt={L.statusBar.readMinFmt}>{fmt(L.statusBar.readMinFmt, props.status.readMin)}</span> : null}
        {props.status?.venueCap ? <span data-status-venue>{props.status.venueCap}</span> : null}
        <span style={{ marginLeft: "auto" }} />
        {typeof props.status?.credits === "number" ? <span className="ide-count">{fmt(L.statusBar.creditsFmt, props.status.credits)}</span> : null}
        <button type="button" data-ide-theme-menu aria-haspopup="menu" aria-expanded="false">{L.statusBar.theme}</button>
      </footer>

      {/* The View menu — exact §5.1 contents (Write·Read·Focus; finding cards; inline suggestions;
          Advanced ⌘⇧M; font preset + reader stepper). NO Source entry — it lives in Files. */}
      <div className="ide-menu" data-ide-menu="view" role="menu" aria-label={L.viewMenu.heading} hidden>
        {VIEW_MODES.map((m) => (
          <button key={m.id} type="button" role="menuitemradio" aria-checked={view === m.id}
                  data-ide-view={m.id} className="ide-menu-row">
            {L.viewMenu.views[m.id]}
          </button>
        ))}
        <div className="ide-menu-sep" />
        {viewMenuModel(view).map((t) => (
          <button key={t.id} type="button" role="menuitemcheckbox"
                  aria-checked={t.id === "advanced" || t.id === "authorship" ? "false" : "true"}
                  {...(t.id === "authorship" ? { "data-tier": "advanced" } : {})}
                  data-ide-toggle={t.id} className="ide-menu-row">
            {t.id === "findingCards" ? L.viewMenu.findingCards
              : t.id === "suggestionsInline" ? L.viewMenu.suggestionsInline
              : t.id === "authorship" ? L.viewMenu.authorship
              : L.viewMenu.advanced}
          </button>
        ))}
        <div className="ide-menu-sep" />
        <div className="ide-menu-note">{L.viewMenu.fontSerif} / {L.viewMenu.fontSans}</div>
        <button type="button" className="ide-menu-row" data-ide-font="serif" role="menuitemradio" aria-checked="true">{L.viewMenu.fontSerif}</button>
        <button type="button" className="ide-menu-row" data-ide-font="sans" role="menuitemradio" aria-checked="false">{L.viewMenu.fontSans}</button>
        <div className="ide-menu-sep" />
        <button type="button" className="ide-menu-row" data-ide-reader="down">{L.viewMenu.readerSmaller}</button>
        <button type="button" className="ide-menu-row" data-ide-reader="up">{L.viewMenu.readerBigger}</button>
      </div>

      {/* Theme menu — app theme (dark/light/auto) + the per-project paper pin (⌘⇧L). */}
      <div className="ide-menu" data-ide-menu="theme" role="menu" aria-label={L.statusBar.theme} hidden>
        <div className="ide-menu-note">{L.statusBar.theme}</div>
        {(["dark", "light", "auto"] as const).map((t) => (
          <button key={t} type="button" role="menuitemradio" aria-checked={(props.appTheme ?? "dark") === t}
                  data-ide-theme={t} className="ide-menu-row">
            {L.themes[t]}
          </button>
        ))}
        <div className="ide-menu-sep" />
        <div className="ide-menu-note">{L.statusBar.paper}</div>
        {(["light", "follow", "dark"] as const).map((t) => (
          <button key={t} type="button" role="menuitemradio" aria-checked={(props.paperTheme ?? "light") === t}
                  data-ide-paper={t} className="ide-menu-row">
            {L.themes[t === "follow" ? "paperFollow" : t === "light" ? "paperLight" : "paperDark"]}
          </button>
        ))}
      </div>

      {/* P1.06 (§5.12) — the ⌘K command palette. SSR renders the skeleton + the embedded PaletteData
          JSON; the ide.js island drives open/close, filtering, the /-command structured row, and
          keyboard navigation. Every row NAVIGATES or opens the run sheet's GET — the palette never
          launches a run (no POST ever leaves this element). */}
      <div
        className="ide-palette"
        data-ide-palette
        role="dialog"
        aria-label={L.palette.dialogLabel}
        aria-modal="true"
        hidden
        data-palette-sections={JSON.stringify(L.palette.sectionLabels)}
        {...(props.palette ? { "data-palette": props.palette } : {})}
        {...(props.paletteSearchUrl ? { "data-palette-search": props.paletteSearchUrl } : {})}
      >
        <input
          type="text"
          data-palette-input
          placeholder={L.palette.placeholder}
          aria-label={L.palette.placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <div data-palette-results role="listbox" aria-label={L.palette.emptyLabel} />
        <div data-palette-empty hidden>{L.palette.emptyLabel}</div>
      </div>

      {/* P1.06 (§5.12) — the `?` cheat sheet: the full keymap rendered from the shared CHEAT_SHEET
          table (@rhema/ide) so the card can never drift from the dispatcher. */}
      <div className="ide-cheatsheet" data-ide-cheatsheet role="dialog" aria-label={L.cheatsheet.heading} hidden>
        <div className="ide-cheatsheet-card">
          <div className="ide-pane-head">
            <span>{L.cheatsheet.heading}</span>
            <button type="button" data-ide-cheatsheet-close aria-label={L.cheatsheet.closeLabel}>×</button>
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
    </div>
  );
}
