// R7SHELL.1c (REQ-SHELL-7; REQ-RELOAD-3; REQ-ISL-10 re-asserted) — the ONE global ⌘K palette,
// mounted by the AppShell and lazy-chunked on first ⌘K (never in the entry graph — the
// `check:spa-entry-graph` guard denies `cmdk` + this module there). Sources:
//
//  - workspace commands (always): New project / Inbox / Voices / Usage / Settings / theme —
//    every row navigates or rides the shell's own theme seam; the palette itself issues ZERO
//    non-GET requests;
//  - inside `/p/:slug…`: the project scope — the IDE palette's local-only commands verbatim
//    (the `data-palette` PaletteData embed on `.ide`, the same `paletteModel` view-model the
//    island consumed: verbs resolve to sheet GETs, goto/recent/threads/settings navigate,
//    and the `/` command row) plus a "Search all projects" row that widens to the workspace;
//  - `GET /bff/search?q=` (debounced): grouped hits — projects/drafts/letters/Voices — each
//    carrying a server-mapped `/p/:slug/v/:n`-family deep link. Snippets render as TEXT
//    (React children — a `ts_headline` `<b>` is escaped, never markup).
//
// Open mechanics: the `rhema:palette-open` CustomEvent ({toggle?, initial?}) — dispatched by the
// sidebar Search item, the AppShell keymap arm, and the IDE controller's `palette` action.
// Never mounted in a demo boot (the DemoAppShell has no host) — ⌘K is inert and no request fires.

import { Command } from "cmdk";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { EmptyState, PaletteList, type CommandGroupView, type CommandItemView } from "@rhema/ui";
import { buildPalette, paletteModel, type PaletteData } from "@rhema/ide";
import type { WorkspaceSearchResult, WorkspaceSearchTwinResponse } from "@rhema/contracts";
import { COPY } from "../copy.js";
import { bffFetch } from "./bff.js";

export const PALETTE_OPEN_EVENT = "rhema:palette-open";
export const APP_THEME_EVENT = "rhema:app-theme";

/** The project slug a `/p/<slug>…` location implies — null outside project scope. */
export function projectSlugFor(pathname: string): string | null {
  const m = /^\/p\/([^/]+)(?:\/|$)/.exec(pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** The IDE chrome's embedded `PaletteData` (`.ide[data-palette]` — kept DOM-contract hook). */
function embeddedPalette(): PaletteData | null {
  try {
    const raw = document.querySelector<HTMLElement>("[data-ide]")?.dataset["palette"];
    return raw ? (JSON.parse(raw) as PaletteData) : null;
  } catch {
    return null;
  }
}

const WORKSPACE_ITEMS: readonly { value: string; label: string; path: string }[] = [
  { value: "ws:new-project", label: "New project", path: "/app/new" },
  { value: "ws:inbox", label: "Inbox", path: "/app/inbox" },
  { value: "ws:voices", label: "Voices", path: "/voices" },
  { value: "ws:usage", label: "Usage", path: "/usage" },
  { value: "ws:settings", label: "Settings", path: "/app/settings/account" },
];

function workspaceGroups(): CommandGroupView[] {
  const items: CommandItemView[] = [
    ...WORKSPACE_ITEMS.map((w) => ({
      value: w.value,
      label: w.label,
      keywords: ["workspace", "go to"],
    })),
    { value: "theme:dark", label: `${COPY.appShell.themeLabel} · ${COPY.appShellThemes.dark}`, keywords: ["theme", "dark"] },
    { value: "theme:light", label: `${COPY.appShell.themeLabel} · ${COPY.appShellThemes.light}`, keywords: ["theme", "light"] },
    { value: "theme:auto", label: `${COPY.appShell.themeLabel} · ${COPY.appShellThemes.auto}`, keywords: ["theme", "auto", "system"] },
  ];
  return [{ heading: COPY.palette.groupWorkspace, items }];
}

/** The IDE palette's local command sections, mapped to cmdk groups (navigations only). */
const SECTION_HEADING: Record<string, string> = {
  run: COPY.ide.palette.sectionLabels.run,
  goto: COPY.ide.palette.sectionLabels.goto,
  recent: COPY.ide.palette.sectionLabels.recent,
  threads: COPY.ide.palette.sectionLabels.threads,
  settings: COPY.ide.palette.sectionLabels.settings,
};
function localGroups(data: PaletteData, slug: string): CommandGroupView[] {
  return buildPalette({ ...data, projectSlug: slug }).map((s) => ({
    heading: SECTION_HEADING[s.key] ?? s.label,
    items: s.rows.map((r) => ({
      // cmdk `value` is the row's identity AND its filter key — the label rides `keywords` so
      // filtering matches on words, never on the encoded target.
      value: `local|${r.id}|${r.action.kind === "navigate" || r.action.kind === "sheet" ? r.action.path : ""}`,
      label: r.pinned ? `${r.label} · ${COPY.ide.palette.nextStep}` : r.label,
      keywords: [r.label, s.label],
      disabled: r.action.kind === "disabled",
    })),
  }));
}

export function GlobalPalette(props: {
  readonly initial?: string;
  readonly onClose: () => void;
}): ReactNode {
  const { onClose, initial } = props;
  const router = useRouter();
  const pathname = useLocation({ select: (l) => l.pathname });
  const slug = projectSlugFor(pathname);
  const [scopeAll, setScopeAll] = useState(false);
  const scoped = slug != null && !scopeAll;
  const [query, setQuery] = useState(initial ?? "");
  const [hits, setHits] = useState<WorkspaceSearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const go = useCallback(
    (path: string) => {
      onClose();
      if (path === "") return;
      router.history.push(path);
    },
    [onClose, router],
  );

  // ---- mount: remember the opener, seed the query, focus; unmount returns focus (REQ-UX-7) ----
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const n = initial?.length ?? 0;
    inputRef.current?.setSelectionRange(n, n);
    return () => {
      const trig = triggerRef.current;
      if (trig?.isConnected) trig.focus();
    };
    // mount-only: the opener is remembered and focus returns on unmount.
  }, []);

  // ---- Esc closes (one layer); ⌘K is handled by the shell's toggle dispatch ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ---- the debounced search read (GET only, 180 ms — the island's own cadence) ----
  const q = query.trim();
  useEffect(() => {
    if (q === "" || q.startsWith("/")) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q });
      if (scoped && slug) qs.set("project", slug);
      void bffFetch<WorkspaceSearchTwinResponse>(`/bff/search?${qs.toString()}`)
        .then((body) => {
          setHits([
            ...body.results.projects,
            ...body.results.drafts,
            ...body.results.letters,
            ...body.results.voices,
          ]);
        })
        .catch(() => setHits([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q, scoped, slug]);

  // ---- groups: local commands (project scope) + workspace commands + search hits ----
  const local = useMemo(() => (scoped && slug ? embeddedPalette() : null), [scoped, slug]);
  const commandMode = q.startsWith("/") && scoped && local != null;

  const groups = useMemo((): CommandGroupView[] => {
    const out: CommandGroupView[] = [];
    if (local && scoped) out.push(...localGroups(local, slug!));
    out.push(...workspaceGroups());
    if (hits.length > 0) {
      const hitItem = (h: WorkspaceSearchResult): CommandItemView => ({
        value: `hit|${h.path}`,
        // snippet rides the label node — React text, never HTML (a planted <b> is inert).
        label: h.snippet ? (
          <>
            {h.label}
            <span className="app-palette-snippet" data-palette-snippet>
              {h.snippet}
            </span>
          </>
        ) : (
          h.label
        ),
        keywords: [h.label, q, h.kind, ...(h.snippet ? [h.snippet] : [])],
      });
      for (const [kind, heading] of [
        ["project", COPY.palette.groupProjects],
        ["draft", COPY.palette.groupDrafts],
        ["letter", COPY.palette.groupLetters],
        ["voice", COPY.palette.groupVoices],
      ] as const) {
        const rows = hits.filter((h) => h.kind === kind);
        if (rows.length > 0) out.push({ heading, items: rows.map(hitItem) });
      }
    }
    return out;
  }, [local, scoped, slug, q, hits]);

  const onSelect = useCallback(
    (value: string) => {
      if (value.startsWith("theme:")) {
        // the shell's own theme seam — identical to its account-menu item (the palette issues
        // no write; the shell applies + persists through its existing POST).
        window.dispatchEvent(new CustomEvent(APP_THEME_EVENT, { detail: { pref: value.slice(6) } }));
        onClose();
        return;
      }
      const path = value.includes("|") ? value.split("|").pop()! : "";
      go(path.startsWith("/") ? path : "");
    },
    [go, onClose],
  );

  const commandRow =
    commandMode && local && slug
      ? paletteModel({ ...local, projectSlug: slug }, q).commandRow
      : undefined;

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && commandRow?.ok === true) {
        const r = commandRow.resolution;
        if (r && (r.kind === "sheet" || r.kind === "navigate")) {
          e.preventDefault();
          go(r.path);
        }
      }
    },
    [commandRow, go],
  );

  return (
    <div
      className="app-palette"
      data-app-palette
      data-palette-scope={scoped ? "project" : "workspace"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Command className="app-palette-card" label={COPY.palette.dialogLabel}>
        <div className="app-palette-input-row">
          <Command.Input
            ref={inputRef}
            data-palette-input
            aria-label={COPY.palette.inputLabel}
            placeholder={scoped ? COPY.palette.placeholderScoped : COPY.palette.placeholder}
            value={query}
            onValueChange={setQuery}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {scoped ? <span className="app-palette-scope-tag">{slug}</span> : null}
        </div>
        {commandRow != null ? (
          <div className="app-palette-cmd" data-palette-cmd>
            <div className="app-palette-chips">
              {(commandRow.ok && commandRow.chips.length === 0 ? [commandRow.raw] : [...commandRow.chips]).map((chip) => (
                <span key={chip} className="app-palette-chip">
                  {chip}
                </span>
              ))}
            </div>
            {!commandRow.ok ? (
              <p className="app-palette-cmd-error">
                {commandRow.suggestions?.length
                  ? `${commandRow.error ?? ""} Try: ${commandRow.suggestions.join(", ")}`
                  : commandRow.error}
              </p>
            ) : commandRow.resolution?.kind === "disabled" ? (
              <p className="app-palette-cmd-error">{commandRow.resolution.reason}</p>
            ) : null}
          </div>
        ) : (
          <div data-palette-results>
            <PaletteList
              groups={groups}
              emptyLabel={<EmptyState title={COPY.palette.emptyLabel} data-palette-empty />}
              onSelect={onSelect}
            />
            {scoped ? (
              <button
                type="button"
                className="app-palette-widen"
                data-palette-search-all
                onClick={() => setScopeAll(true)}
              >
                {COPY.palette.searchAllProjects}
              </button>
            ) : null}
          </div>
        )}
      </Command>
    </div>
  );
}

export default GlobalPalette;
