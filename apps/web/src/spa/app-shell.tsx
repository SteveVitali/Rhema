// R7SHELL.1a (REQ-SHELL-1/2/6; ADR-128's REQ-IDE-2 item; UXC-3/9/10/29/35, F4, D6/D7) — the ONE
// app shell. The `/_authenticated` layout route renders `<AppShell>` around `<Outlet>`, so every
// signed-in leaf — the IDE included — lives inside the one persistent chrome: navigation between
// workspace pages and into a project no longer unmounts the chrome, and the pending/error/404
// states render inside it (the layout's errorComponent/notFoundComponent wrap the same shell).
//
// The sidebar (REQ-SHELL-2) carries the ADR-128 item set: wordmark → `/app` (an SPA link — UXC-3's
// `href="/"` double-load is gone), New project, Search (only when a palette provider is
// registered — the IDE palette in project scope today, never a dead control), ≤8 recent projects
// with status dots + "All projects", Inbox with the REQ-IDE-2 badge, Voices/Usage/Settings, and
// the account menu (initials, credits balance from the `/bff/app` entitlement read, Billing,
// Pricing as a document link until 249a, Theme through the existing `/ide/theme` write, Sign out
// as a document navigation). The sidebar "Demo" entry stays 248's (REQ-TOUR-4).
//
// Collapse is remembered per user — `rhema:sidebar:v1:<userId>` (the ledgered decision: the same
// per-user localStorage precedent as `rhema:panes:v1:<u>:<p>`; two users on one browser never
// share it). `[` toggles it and `]` toggles the right-side pane, generated from the keymap.
//
// The demo-boot variant (P4-3; REQ-DWEB-7/REQ-DACC-3 re-asserted): wordmark as a `data-spa-native`
// document link out of the demo, the demo top bar hosting the R7a banner verbatim, and the static
// sidebar frame — no workspace item renders and no session/workspace/credits/account read issues.

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Download,
  FilePlus2,
  FileText,
  History,
  Image as ImageIcon,
  Inbox as InboxIcon,
  ListTree,
  Menu,
  Mic,
  Gauge,
  Search,
  Settings,
  Settings2,
} from "lucide-react";
import { SPA_IDE_FRAMED_ROUTES, spaRouteFor } from "@rhema/contracts";
import { dispatchIdeKey, parseAppTheme, shortcutFor, THEME_STORAGE_KEY } from "@rhema/ide";
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, FilesPane, Tooltip, TooltipProvider } from "@rhema/ui";
import { COPY } from "../copy.js";
import { filesLabels } from "../files-labels.js";
import { getSpaBoot, isSpaEnabled } from "./boot.js";
import { demoBootNow, useDemoMode } from "./demo.js";
import { DemoBanner } from "./demo-banner.js";
import { navigateDocument } from "./dom.js";
import { readOnlyReasonText } from "./read-only.js";
import { inboxQuery, projectHomeQuery, projectTreeQuery, sessionQuery } from "./queries.js";

const FRAMED: ReadonlySet<string> = new Set(SPA_IDE_FRAMED_ROUTES);

// R7SHELL.1c (REQ-SHELL-7) — the global palette is a LAZY chunk: the entry graph carries only
// this binding (`check:spa-entry-graph` denies cmdk + the palette module in entry chunks).
const GlobalPalette = lazy(() =>
  import("./palette.js").then((m) => ({ default: m.GlobalPalette })),
);

/**
 * "Inside the shell already" — states.tsx's boundary components (404/error) consult this so a
 * boundary rendering at LEAF position stays bare (the layout's own shell wraps it) while a
 * boundary rendering at a position with no mounted shell wraps itself in AppShell.
 */
const InShellContext = createContext(false);
export function useInAppShell(): boolean {
  return useContext(InShellContext);
}

/** The per-user collapse key — same precedent as `rhema:panes:v1:<user>:<project>`. */
export function sidebarStorageKey(userId: string): string {
  return `rhema:sidebar:v1:${userId}`;
}

function readCollapsed(userId: string): boolean {
  try {
    return localStorage.getItem(sidebarStorageKey(userId)) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(userId: string, collapsed: boolean): void {
  try {
    localStorage.setItem(sidebarStorageKey(userId), collapsed ? "collapsed" : "expanded");
  } catch {
    /* private mode — the pref degrades to session-only */
  }
}

/** The custom event the IDE controller's `sidebar` action emits (the `[` chord inside `.ide`). */
export const SIDEBAR_TOGGLE_EVENT = "rhema:sidebar-toggle";

function initialsFor(userId: string): string {
  const chars = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
  return chars === "" ? "?" : chars;
}

/** Focus-zone check for the shell's own keydown arm (typing stays inert — §5.12). */
function shellZone(): "input" | "none" {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el.closest("input, textarea, select, [contenteditable='true']")) {
    return "input";
  }
  return "none";
}

/**
 * The demo-boot AppShell (P4-3). Renders: the wordmark (a `data-spa-native` document link out of
 * the demo), the demo top bar hosting the R7a banner verbatim, and the static sidebar frame.
 * Never rendered/fetched: New project, recents, Inbox, Voices, Usage, Settings, the account menu
 * — no session, workspace, credits or account read issues in a demo boot.
 */
/**
 * The ARIA-treeview keyboard walk over the Files tree (REQ-SHELL-4): roving tabindex is in the
 * markup; Up/Down move, Home/End jump, Left/Right collapse/expand the row's details group.
 */
function onProjectTreeKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End" && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[role='treeitem']"));
  if (items.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const ix = items.findIndex((el) => el === active || el.contains(active));
  if (ix < 0) return;
  e.preventDefault();
  if (e.key === "ArrowDown") items[Math.min(items.length - 1, ix + 1)]?.focus();
  else if (e.key === "ArrowUp") items[Math.max(0, ix - 1)]?.focus();
  else if (e.key === "Home") items[0]?.focus();
  else if (e.key === "End") items[items.length - 1]?.focus();
  else {
    const det = items[ix]?.closest("details");
    if (det instanceof HTMLDetailsElement) det.open = e.key === "ArrowRight";
  }
}

function DemoAppShell({ children }: { children?: ReactNode }): ReactNode {
  const demo = demoBootNow();
  const pathname = useLocation({ select: (l) => l.pathname });
  if (demo == null) return <>{children}</>;
  return (
    <div className="app-shell" data-app-shell data-demo="1" data-sidebar="static">
      <aside className="app-shell-sidebar" data-app-sidebar aria-label={COPY.appShell.frameLabel}>
        {/* The demo exit is a DOCUMENT navigation (S-14): data-spa-native + the demo-exit hook. */}
        <a className="app-shell-wordmark" href="/" data-spa-native data-demo-exit="wordmark" data-shell-wordmark>
          {COPY.brand}
        </a>
        {/* R7SHELL.2 — the demo project section renders ONLY from the demo twins
            (`/bff/p/demo~<essay>?view=tree`): no workspace read ever issues (P4-3). */}
        <ProjectSection slug={demo.slug} collapsed={false} pathname={pathname} demo />
      </aside>
      <div className="app-shell-main">
        {/* The demo top bar — hosts the R7a banner with its H15-signed copy unchanged ("Back to
            your projects" rides it, signed-in only). */}
        <div className="app-shell-demo-bar" data-shell-topbar>
          <DemoBanner demo={demo} />
        </div>
        <div className="app-shell-content">{children}</div>
      </div>
    </div>
  );
}

/**
 * R7SHELL.2 (REQ-SHELL-4; ADR-128) — the sidebar's project scope. The current project's entry
 * expands into the seven item links (Page · Outline · Figures · Versions · Reviews · Export ·
 * Project settings), each an SPA link with an `aria-current` state; the Files pane's content
 * (the `getFiles` sections) renders as the expanded tree under it. Write-only items (Export,
 * Project settings) honour ReadOnlyProject: disabled with the reason as their tooltip.
 * The `/bff/p/:slug?view=tree` twin feeds it — in a demo boot the demo-namespaced twin serves
 * (no workspace read). Collapsed ⇒ icons + tooltips only (the tree needs the expanded column).
 */
function ProjectSection(props: {
  readonly slug: string;
  readonly collapsed: boolean;
  readonly pathname: string;
  /** the twin read: demo ⇒ always (demo twins only); workspace ⇒ only on an SPA-verdict leaf —
   *  an unflipped leaf's SsrHandoff must not issue a BFF read from the sidebar. */
  readonly enabled?: boolean;
  readonly demo?: boolean;
}): ReactNode {
  const { slug, collapsed, pathname } = props;
  const demo = props.demo === true;
  const enabled = props.enabled !== false;
  const tree = useQuery({ ...projectTreeQuery(slug), enabled });
  const data = tree.data ?? null;
  // `data?.project?.title` — a degraded/erroneous body must never throw in the sidebar.
  const title = data?.project?.title ?? slug;
  const readOnly = data?.project?.readOnlyProject ?? (demo ? { reason: "demo" as const } : null);
  // The latest review's run id (the rounds rows carry provenance.runId + workflow); the
  // Reviews item targets its dossier, else the project overview (the dossier cards' home).
  const latestReviewRunId = useMemo(() => {
    for (const s of data?.files?.sections ?? []) {
      for (const r of s.rows ?? []) {
        if (r.provenance.runId != null && /review/i.test(r.provenance.workflow ?? "")) {
          return r.provenance.runId;
        }
      }
    }
    for (const s of data?.files?.sections ?? []) {
      const hit = (s.rows ?? []).find((r) => r.provenance.runId != null);
      if (hit?.provenance.runId != null) return hit.provenance.runId;
    }
    return null;
  }, [data]);
  const items: readonly {
    key: string;
    label: string;
    href: string;
    icon: ReactNode;
    active: boolean;
    writeOnly?: boolean;
    demoAllowed?: boolean;
  }[] = [
    {
      key: "page",
      label: COPY.appShell.project.page,
      href: `/p/${slug}`,
      icon: <FileText size={16} aria-hidden />,
      active: pathname === `/p/${slug}` || pathname.startsWith(`/p/${slug}/a/`) || pathname.startsWith(`/p/${slug}/edit/`),
      demoAllowed: true,
    },
    {
      key: "outline",
      label: COPY.appShell.project.outline,
      href: `/p/${slug}/outline`,
      icon: <ListTree size={16} aria-hidden />,
      active: pathname.startsWith(`/p/${slug}/outline`),
    },
    {
      key: "figures",
      label: COPY.appShell.project.figures,
      href: `/p/${slug}/figures`,
      icon: <ImageIcon size={16} aria-hidden />,
      active: pathname.startsWith(`/p/${slug}/figures`) || pathname.startsWith(`/p/${slug}/f/`) || pathname.startsWith(`/p/${slug}/visualize`),
      demoAllowed: true,
    },
    {
      key: "versions",
      label: COPY.appShell.project.versions,
      href: `/p/${slug}/v/working`,
      icon: <History size={16} aria-hidden />,
      active: pathname.startsWith(`/p/${slug}/v/`) || pathname.startsWith(`/p/${slug}/revisions/`),
      demoAllowed: true,
    },
    {
      key: "reviews",
      label: COPY.appShell.project.reviews,
      href: latestReviewRunId != null ? `/p/${slug}/review/${latestReviewRunId}` : `/p/${slug}`,
      icon: <ClipboardCheck size={16} aria-hidden />,
      active: pathname.startsWith(`/p/${slug}/review/`) || pathname.startsWith(`/p/${slug}/r/`),
      demoAllowed: true,
    },
    {
      key: "export",
      label: COPY.appShell.project.export,
      href: `/p/${slug}/export`,
      icon: <Download size={16} aria-hidden />,
      active: pathname.startsWith(`/p/${slug}/export`),
      writeOnly: true,
    },
    {
      key: "settings",
      label: COPY.appShell.project.settings,
      href: `/p/${slug}/settings`,
      icon: <Settings2 size={16} aria-hidden />,
      active: pathname.startsWith(`/p/${slug}/settings`) || pathname.startsWith(`/p/${slug}/voice/`),
      writeOnly: true,
    },
  ];
  const files = data?.files ?? null;
  return (
    <div className="app-shell-project" data-shell-project={slug}>
      <ShellItem
        hook="data-shell-current-project"
        href={`/p/${slug}`}
        icon={<FileText size={18} aria-hidden />}
        label={title}
        collapsed={collapsed}
        current={pathname === `/p/${slug}`}
      />
      <div className="app-shell-project-items" role="group" aria-label={title}>
        {items.map((it) => {
          const blocked =
            readOnly != null && (it.writeOnly === true || (demo && it.demoAllowed !== true));
          if (blocked) {
            const reason = readOnlyReasonText(readOnly!.reason);
            return (
              <span key={it.key} className="app-shell-item" data-project-item={it.key} data-disabled="1" aria-disabled="true">
                {collapsed ? (
                  <Tooltip content={`${it.label} — ${reason}`} side="right">
                    <span>{it.icon}</span>
                  </Tooltip>
                ) : (
                  <>
                    {it.icon}
                    <span className="app-shell-label">
                      {it.label}
                      <span className="app-shell-label" style={{ marginLeft: "6px", color: "var(--shell-fg-faint)", fontSize: 11 }}>
                        {reason}
                      </span>
                    </span>
                  </>
                )}
              </span>
            );
          }
          return (
            <ShellItem
              key={it.key}
              hook="data-project-item"
              hookValue={it.key}
              href={it.href}
              icon={it.icon}
              label={it.label}
              tip={it.label}
              collapsed={collapsed}
              current={it.active}
            />
          );
        })}
      </div>
      {!collapsed && files != null ? (
        <div className="app-shell-project-tree" onKeyDown={onProjectTreeKeyDown}>
          <FilesPane
            sections={files.sections}
            hrefs={{
              artifact: (id) => `/p/${slug}/a/${id}`,
              draft: (n) => `/p/${slug}/v/${n}`,
              run: (id) => `/p/${slug}/r/${id}`,
              figure: (id) => `/p/${slug}/figures/${id}`,
            }}
            labels={filesLabels}
          />
        </div>
      ) : null}
    </div>
  );
}

/** One sidebar row — anchor or button, icon, label, optional badge/tooltip/chord hint. */
function ShellItem(props: {
  readonly hook: string;
  /** emits `[hook]="<value>"` instead of the bare flag (R7SHELL.2 — per-project-item keys). */
  readonly hookValue?: string;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly icon: ReactNode;
  readonly label: string;
  readonly badge?: number | null;
  readonly tip?: string;
  readonly chord?: string | null;
  readonly collapsed: boolean;
  readonly current?: boolean;
  readonly docNav?: boolean;
}): ReactNode {
  const body = (
    <>
      {props.icon}
      <span className="app-shell-label">{props.label}</span>
      {typeof props.badge === "number" && props.badge > 0 ? (
        <span className="app-shell-badge" data-count={props.badge}>{props.badge}</span>
      ) : null}
      {!props.collapsed && props.chord ? (
        <span className="app-shell-label" style={{ marginLeft: "auto", color: "var(--shell-fg-faint)" }}>
          {props.chord}
        </span>
      ) : null}
    </>
  );
  const cls = "app-shell-item";
  const el = props.href != null ? (
    <a
      href={props.href}
      className={cls}
      {...{ [props.hook]: props.hookValue ?? true }}
      {...(props.docNav ? { "data-spa-native": true } : {})}
      {...(props.current ? { "aria-current": "page" } : {})}
    >
      {body}
    </a>
  ) : (
    <button type="button" className={cls} onClick={props.onClick} {...{ [props.hook]: props.hookValue ?? true }}>
      {body}
    </button>
  );
  // REQ-SHELL-2 — collapsed ⇒ the label is gone, so the tooltip carries it (+ the keymap chord).
  return props.collapsed ? (
    <Tooltip content={`${props.tip ?? props.label}${props.chord ? ` · ${props.chord}` : ""}`} side="right">
      {el}
    </Tooltip>
  ) : (
    el
  );
}

function WorkspaceAppShell({ children }: { children?: ReactNode }): ReactNode {
  const boot = getSpaBoot();
  const session = useQuery(sessionQuery);
  const userId = session.data?.userId ?? boot?.principal?.userId ?? "local";
  const [collapsed, setCollapsed] = useState(() => readCollapsed(userId));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const loc = useLocation();
  const { routeId } = spaRouteFor(loc.pathname);
  // An unflipped (ssr-verdict) leaf hands its document back to the server — the shell must not
  // spend the workspace reads it (REQ-SEQ-9's "no BFF read" invariant holds for every leaf).
  const spaNow = isSpaEnabled(boot, routeId);
  const home = useQuery({ ...projectHomeQuery(), enabled: spaNow });
  const inbox = useQuery({ ...inboxQuery, enabled: spaNow });

  // R7SHELL.1c — ⌘K opens the ONE palette on every signed-in page (the IDE controller
  // dispatches the same `rhema:palette-open` event for its `palette` action).
  const [palette, setPalette] = useState<{ open: boolean; initial?: string }>({ open: false });
  useEffect(() => {
    const onPaletteOpen = (e: Event) => {
      const d = (e as CustomEvent<{ toggle?: boolean; initial?: string }>).detail ?? {};
      setPalette((p) =>
        d.toggle === true ? { open: !p.open, initial: d.initial } : { open: true, initial: d.initial },
      );
    };
    window.addEventListener("rhema:palette-open", onPaletteOpen);
    return () => window.removeEventListener("rhema:palette-open", onPaletteOpen);
  }, []);
  const closePalette = useCallback(() => setPalette({ open: false }), []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      writeCollapsed(userId, !c);
      return !c;
    });
  }, [userId]);

  // Re-read the pref if the session's user resolves to a different id (two users, one browser).
  const seenUser = useRef(userId);
  useEffect(() => {
    if (seenUser.current !== userId) {
      seenUser.current = userId;
      setCollapsed(readCollapsed(userId));
    }
  }, [userId]);

  // The `[`/`]` + `g` go-to chords: inside `.ide` the controller dispatches them (sidebar → this
  // event; `]` → the right panel). Outside the IDE the shell dispatches bare keys itself —
  // REQ-KEYS-1 (239): the `g p/i/v/s` go-tos navigate in-router; `g` arms a prefix for 1.2 s.
  useEffect(() => {
    let pending: "g" | "r" | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onToggle = () => toggleSidebar();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (document.querySelector(".ide") != null) return; // the IDE controller owns its chords
      const action = dispatchIdeKey(
        { key: e.key.length === 1 ? e.key.toLowerCase() : e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey },
        shellZone(),
        pending,
      );
      if (action?.kind === "prefix") {
        e.preventDefault();
        pending = action.prefix;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          pending = null;
        }, 1200);
        return;
      }
      pending = null;
      if (action?.kind === "sidebar") {
        e.preventDefault();
        toggleSidebar();
      } else if (action?.kind === "palette") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("rhema:palette-open", {
          detail: { toggle: true, ...(e.key === "/" ? { initial: "/" } : {}) },
        }));
      } else if (action?.kind === "goto-projects") {
        e.preventDefault();
        router.history.push("/app");
      } else if (action?.kind === "inbox") {
        e.preventDefault();
        router.history.push("/app/inbox");
      } else if (action?.kind === "goto-voices") {
        e.preventDefault();
        router.history.push("/voices");
      } else if (action?.kind === "settings") {
        e.preventDefault();
        router.history.push("/app/settings/account");
      }
    };
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
      window.removeEventListener("keydown", onKey);
      if (timer) clearTimeout(timer);
    };
  }, [toggleSidebar, router]);

  // R7SHELL.1c — the palette's theme rows dispatch `rhema:app-theme` here (the same apply +
  // fire-and-forget POST as the account menu — the palette itself issues no write).
  useEffect(() => {
    const onTheme = (e: Event) => {
      const pref = (e as CustomEvent<{ pref?: string }>).detail?.pref;
      if (pref != null) setThemeRef.current?.(pref);
    };
    window.addEventListener("rhema:app-theme", onTheme);
    return () => window.removeEventListener("rhema:app-theme", onTheme);
  }, []);
  const setThemeRef = useRef<((pref: string) => void) | null>(null);
  const setTheme = useCallback((pref: string) => {
    const p = parseAppTheme(pref);
    const doc = document.documentElement;
    doc.setAttribute("data-app-theme", p);
    doc.setAttribute("data-theme", p === "auto" ? (window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark") : p);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* private mode */
    }
    void fetch("/ide/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appTheme: p }),
      credentials: "same-origin",
    }).catch(() => undefined);
  }, []);
  setThemeRef.current = setTheme;

  // R7SHELL.2 (REQ-SHELL-4) — the sidebar's project scope: inside `/p/:slug` the current
  // project's entry expands into its items + the Files tree, and it is NOT repeated in the
  // recents list.
  const projectSlug = useMemo(() => {
    const m = /^\/p\/([^/]+)/.exec(loc.pathname);
    return m ? decodeURIComponent(m[1]!) : null;
  }, [loc.pathname]);
  const recents = useMemo(
    () => (home.data?.rows ?? []).filter((r) => r.archivedAt == null && r.slug !== projectSlug).slice(0, 8),
    [home.data, projectSlug],
  );
  // R7SHELL.1c — the global palette is available on every signed-in page; Search always shows
  // (project scope is decided inside the palette from the location). `paletteHere` now only
  // gates the <768 pane-sheet toggle (an IDE-only control).
  const paletteHere = routeId != null && FRAMED.has(routeId);
  const openPalette = useCallback(() => {
    window.dispatchEvent(new CustomEvent("rhema:palette-open", { detail: {} }));
  }, []);
  const push = useCallback((href: string) => router.history.push(href), [router]);
  const signOutForm = useRef<HTMLFormElement>(null);

  const balance = home.data?.balance ?? null;
  const sidebarChord = shortcutFor("sidebar");
  const paneChord = shortcutFor("pane:panel");
  const creditsFmt = COPY.appShell.creditsFmt;
  const creditsLabel =
    balance != null ? creditsFmt.replace("{n}", balance.spendableCredits.toLocaleString()) : null;

  return (
    <TooltipProvider>
      <div className="app-shell" data-app-shell data-sidebar={collapsed ? "collapsed" : "expanded"} data-drawer={drawerOpen ? "open" : "closed"}>
        <aside className="app-shell-sidebar" data-app-sidebar aria-label={COPY.appShell.frameLabel}>
          <a className="app-shell-wordmark" href="/app" data-shell-wordmark>
            {COPY.brand}
          </a>
          <button
            type="button"
            className="app-shell-item"
            data-shell-toggle
            aria-label={collapsed ? COPY.appShell.expandTip : COPY.appShell.collapseTip}
            title={`${collapsed ? COPY.appShell.expandTip : COPY.appShell.collapseTip} · ${sidebarChord ?? "["}`}
            onClick={toggleSidebar}
          >
            <Menu size={18} aria-hidden />
            <span className="app-shell-label">{collapsed ? COPY.appShell.expandTip : COPY.appShell.collapseTip}</span>
          </button>
          <div className="app-shell-nav" role="group" aria-label={COPY.appShell.frameLabel}>
            <ShellItem hook="data-shell-new-project" href="/app/new" icon={<FilePlus2 size={18} aria-hidden />} label={COPY.appShell.newProject} collapsed={collapsed} />
            <ShellItem hook="data-shell-search" onClick={openPalette} icon={<Search size={18} aria-hidden />} label={COPY.appShell.search} chord={shortcutFor("palette")} collapsed={collapsed} />
            <ShellItem hook="data-shell-inbox" href="/app/inbox" icon={<InboxIcon size={18} aria-hidden />} label={COPY.appShell.inbox} badge={inbox.data?.badge ?? null} collapsed={collapsed} current={loc.pathname === "/app/inbox"} chord={shortcutFor("inbox")} />
            <ShellItem hook="data-shell-voices" href="/voices" icon={<Mic size={18} aria-hidden />} label={COPY.appShell.voices} collapsed={collapsed} current={loc.pathname.startsWith("/v") || loc.pathname.startsWith("/voices")} chord={shortcutFor("goto-voices")} />
            <ShellItem hook="data-shell-usage" href="/usage" icon={<Gauge size={18} aria-hidden />} label={COPY.appShell.usage} collapsed={collapsed} current={loc.pathname === "/usage"} />
            <ShellItem hook="data-shell-settings" href="/app/settings/account" icon={<Settings size={18} aria-hidden />} label={COPY.appShell.settings} collapsed={collapsed} current={loc.pathname.startsWith("/app/settings") || loc.pathname === "/settings"} chord={shortcutFor("settings")} />
          </div>
          {projectSlug != null ? (
            <ProjectSection
              slug={projectSlug}
              collapsed={collapsed}
              pathname={loc.pathname}
              enabled={isSpaEnabled(boot, routeId)}
            />
          ) : null}
          <div className="app-shell-section app-shell-recents">{COPY.appShell.recents}</div>
          <div className="app-shell-nav app-shell-recents" role="group" aria-label={COPY.appShell.recents}>
            {recents.map((r) => (
              <a key={r.slug} href={`/p/${r.slug}`} className="app-shell-item app-shell-recent" data-shell-recent={r.slug}>
                <span
                  className="app-shell-dot"
                  data-tone={r.lastRunFailed === true ? "error" : r.activeRun != null ? "running" : r.group ?? "quiet"}
                  aria-hidden
                />
                <span className="app-shell-label">{r.title}</span>
              </a>
            ))}
            <ShellItem hook="data-shell-all-projects" href="/app" icon={<Menu size={18} aria-hidden />} label={COPY.appShell.allProjects} collapsed={collapsed} chord={shortcutFor("goto-projects")} />
          </div>
          <span className="app-shell-spacer" />
          <DropdownMenu
            side="top"
            align="start"
            trigger={
              <button type="button" className="app-shell-account" data-shell-account aria-label={COPY.appShell.account}>
                <span className="app-shell-avatar">{initialsFor(userId)}</span>
                <span className="app-shell-label app-shell-credits">{creditsLabel ?? COPY.appShell.account}</span>
              </button>
            }
          >
            <DropdownMenuLabel>{creditsLabel ?? COPY.appShell.account}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => push("/app/settings/billing")} data-shell-billing>
              {COPY.appShell.billing}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigateDocument("/pricing")} data-shell-pricing>
              {COPY.appShell.pricing}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setTheme("dark")} data-shell-theme="dark">
              {COPY.appShell.themeLabel} · {COPY.appShellThemes.dark}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("light")} data-shell-theme="light">
              {COPY.appShell.themeLabel} · {COPY.appShellThemes.light}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("auto")} data-shell-theme="auto">
              {COPY.appShell.themeLabel} · {COPY.appShellThemes.auto}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* `/logout` is a native POST (design/22 §1 — never a fetch/GET): the item wraps the
                same no-JS form seam the workspace home uses; keyboard selection requestSubmits it. */}
            <DropdownMenuItem onSelect={() => signOutForm.current?.requestSubmit()} data-shell-signout>
              <form ref={signOutForm} method="post" action="/logout" style={{ margin: 0, width: "100%" }}>
                <button type="submit" className="app-shell-item" style={{ width: "100%" }}>
                  {COPY.appShell.signOut}
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenu>
        </aside>
        <div className="app-shell-main">
          {/* The <768 top bar (desktop UA): the drawer menu button + the pane-sheet toggle. */}
          <div className="app-shell-topbar" data-shell-topbar>
            <button type="button" data-shell-drawer-toggle aria-label={COPY.appShell.menuTip} onClick={() => setDrawerOpen((o) => !o)}>
              <Menu size={18} aria-hidden />
            </button>
            <strong>{COPY.brand}</strong>
            <span style={{ marginLeft: "auto" }} />
            {paletteHere ? (
              <button
                type="button"
                data-shell-pane-toggle
                aria-label={COPY.appShell.paneTip}
                title={`${COPY.appShell.paneTip} · ${paneChord ?? "]"}`}
                onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }))}
              >
                <Search size={18} aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="app-shell-content">{children}</div>
          {palette.open ? (
            <Suspense fallback={null}>
              <GlobalPalette {...(palette.initial != null ? { initial: palette.initial } : {})} onClose={closePalette} />
            </Suspense>
          ) : null}
          {drawerOpen ? (
            <button type="button" className="app-shell-scrim" data-shell-scrim aria-label={COPY.appShell.closeMenu} onClick={() => setDrawerOpen(false)} />
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** The `/_authenticated` layout component — the single mount every authed leaf nests inside. */
export function AppShell({ children }: { children?: ReactNode }): ReactNode {
  const body = useDemoMode() ? <DemoAppShell>{children}</DemoAppShell> : <WorkspaceAppShell>{children}</WorkspaceAppShell>;
  return <InShellContext.Provider value={true}>{body}</InShellContext.Provider>;
}
