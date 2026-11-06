// R7HOME.1 (REQ-HOME-1; ADR-128; REQ-KIT-3 batch c1; REQ-GUARD-1; REQ-BFF-1/2/9, REQ-DAT-4,
// REQ-UX-6/16). `/app` is the flat, always-expanded projects list sorted by last edit: "Waiting
// on you" and "Running" pin above it only when non-empty; "QUIET", "Unfiled" and "Sheet" never
// render. One compact toolbar applies filters instantly (search TextField + Filter/Sort/Group-by
// DropdownMenus — no Apply buttons; the no-JS submits stay inside <noscript>); only non-default
// params reach the URL. Row actions: one hover Open + a ⋯ DropdownMenu; paid items show the
// shared estimator's figure and open the run sheet (the only run creator); lifecycle actions
// are optimistic with an Undo toast, and invalidation is scoped to `["bff","app"]`.
//
// Port notes:
//   • the twin ships RAW DTOs — filter/sort/group/attention derivation runs client-side off the
//     SHARED `state-map.ts` seam (`toProjectRowView`/`attentionSections`/`flatRows`/`groupByVoice`),
//     the same source of truth as the api's derived state.
//   • lifecycle posts ride `bffFetch`'s JSON branch with optimistic cache updates on every
//     `["bff","app"]` query entry; a failure rolls the snapshot back and raises an error toast;
//     Undo posts the inverse verb through the same seam.
//   • `data-*` hooks resolve to dom-contract.ts — `data-menu-action`/`data-menu-form` survive on
//     the Radix menu items verbatim.

import { useMemo, type ReactNode } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  EmptyState,
  ProjectHomeList,
  ProjectRow,
  TextField,
  ToastProvider,
  useToast,
  VoiceGroupList,
  type RowActionView,
} from "@rhema/ui";
import type { ProjectRow as ApiProjectRow } from "@rhema/api-client";
import { COPY } from "../../copy.js";
import { attentionSections, groupByVoice, sortByLastEdit, toProjectRowView } from "../../state-map.js";
import { bffFetch } from "../bff.js";
import { PageBody, PageHeader } from "../page-header.js";
import type { BffAppHomeTwin } from "../queries.js";

/** The §5.2 list's live search params — display filters only; `?q`/`?deleted` ride the twin's key. */
export interface ProjectHomeParams {
  readonly q?: string;
  readonly voice?: string;
  readonly protocol?: string;
  readonly sort?: string;
  readonly archived?: string;
  readonly deleted?: string;
}

type LifecycleVerb = "archive" | "unarchive" | "duplicate" | "delete" | "restore";

const UNDO_OF: Record<LifecycleVerb, LifecycleVerb> = {
  archive: "unarchive",
  unarchive: "archive",
  duplicate: "delete",
  delete: "restore",
  restore: "delete",
};

const TOAST_OF: Record<LifecycleVerb, string> = {
  get archive() {
    return COPY.projectHome.toastArchived;
  },
  get unarchive() {
    return COPY.projectHome.toastUnarchived;
  },
  get duplicate() {
    return COPY.projectHome.toastDuplicated;
  },
  get delete() {
    return COPY.projectHome.toastDeleted;
  },
  get restore() {
    return COPY.projectHome.toastRestored;
  },
};

interface MutationReply {
  readonly ok: true;
  readonly redirect?: string;
}

interface LifecycleVars {
  readonly verb: LifecycleVerb;
  readonly slug: string;
  /** the duplicate undo target — the new slug the envelope's redirect names. */
  undoSlug?: string;
}

/** `/app` — REQ-HOME-1's flat home. `compact` is the §10.1 phone verdict. */
export function ProjectHomeSurface(props: {
  readonly twin: BffAppHomeTwin;
  readonly params: ProjectHomeParams;
  readonly compact: boolean;
}): ReactNode {
  return (
    <ToastProvider dismissLabel={COPY.projectHome.undoLabel} viewportLabel={COPY.projects.heading}>
      <ProjectHomeInner {...props} />
    </ToastProvider>
  );
}

function ProjectHomeInner({
  twin,
  params,
  compact,
}: {
  readonly twin: BffAppHomeTwin;
  readonly params: ProjectHomeParams;
  readonly compact: boolean;
}): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const voiceFilter = params.voice || null;
  const protocolFilter = params.protocol || null;
  const sort = params.sort === "title" ? ("title" as const) : ("recent" as const);
  const showArchived = String(params.archived ?? "") === "1";
  const showDeleted = String(params.deleted ?? "") === "1";
  const { rows, voices, groupBy, protocols, deletedRows } = twin;
  const search = twin.search;

  const view = useMemo(() => {
    let filtered = voiceFilter
      ? rows.filter((r) => (voiceFilter === "unfiled" ? r.voice == null : r.voice?.personaId === voiceFilter))
      : rows;
    if (protocolFilter) filtered = filtered.filter((r) => r.protocolId === protocolFilter);
    const active = filtered.filter((r) => r.archivedAt == null);
    const ctx = { protocols, voices };
    const toViews = (list: readonly ApiProjectRow[]) => list.map((r) => toProjectRowView(r, ctx));
    const flat = active.filter((r) => r.group !== "needs_you" && r.group !== "running");
    return {
      sections: attentionSections(active).map((s) => ({ ...s, rows: toViews(s.rows) })),
      flat: toViews(sort === "title" ? [...flat].sort((a, b) => a.title.localeCompare(b.title)) : sortByLastEdit(flat)),
      voiceGroups: groupByVoice(active).map((g) => ({ ...g, rows: toViews(g.rows) })),
      archivedRows: toViews(filtered.filter((r) => r.archivedAt != null)),
      deletedRows: toViews(deletedRows),
    };
  }, [rows, voices, protocols, deletedRows, voiceFilter, protocolFilter, sort]);

  /** Only non-default params reach the URL — `?archived`/`?deleted` encode as clean `=1` flags. */
  const navigateHome = (opts: {
    q?: string | null;
    voice?: string | null;
    protocol?: string | null;
    sort?: "recent" | "title";
    archived?: boolean;
    deleted?: boolean;
    groupBy?: string;
  }) => {
    const p = new URLSearchParams();
    const q = opts.q === undefined ? params.q : opts.q;
    const voice = opts.voice === undefined ? voiceFilter : opts.voice;
    const protocol = opts.protocol === undefined ? protocolFilter : opts.protocol;
    const s = opts.sort === undefined ? sort : opts.sort;
    const archived = opts.archived === undefined ? showArchived : opts.archived;
    const deleted = opts.deleted === undefined ? showDeleted : opts.deleted;
    if (q) p.set("q", q);
    if (voice) p.set("voice", voice);
    if (protocol) p.set("protocol", protocol);
    if (s === "title") p.set("sort", "title");
    if (archived) p.set("archived", "1");
    if (deleted) p.set("deleted", "1");
    const qs = p.toString();
    void router.navigate({ href: qs ? `/app?${qs}` : "/app" });
  };

  // ---- optimistic lifecycle mutations (scoped `["bff","app"]` invalidation, never `["bff"]`) ----

  const patchTwinRows = (slug: string, patch: (row: ApiProjectRow) => ApiProjectRow | null) => {
    for (const [key, data] of queryClient.getQueriesData<BffAppHomeTwin>({ queryKey: ["bff", "app"] })) {
      if (data == null) continue;
      queryClient.setQueryData(key as QueryKey, {
        ...data,
        rows: data.rows.map((r) => (r.slug === slug ? patch(r) : r)).filter((r): r is ApiProjectRow => r != null),
        deletedRows: data.deletedRows
          .map((r) => (r.slug === slug ? patch(r) : r))
          .filter((r): r is ApiProjectRow => r != null),
      });
    }
  };

  const lifecycle = useMutation<MutationReply, unknown, LifecycleVars, Map<QueryKey, BffAppHomeTwin | undefined>>({
    mutationFn: ({ verb, slug }) =>
      bffFetch(`/p/${slug}/${verb}`, { method: "POST", json: {} }) as Promise<MutationReply>,
    onMutate: (vars) => {
      const snapshot = new Map(queryClient.getQueriesData<BffAppHomeTwin>({ queryKey: ["bff", "app"] }));
      const now = new Date().toISOString();
      if (vars.verb === "archive") patchTwinRows(vars.slug, (r) => ({ ...r, archivedAt: now }));
      else if (vars.verb === "unarchive") patchTwinRows(vars.slug, (r) => ({ ...r, archivedAt: null }));
      else if (vars.verb === "delete") patchTwinRows(vars.slug, (r) => (r.archivedAt == null ? null : r));
      else if (vars.verb === "restore")
        patchTwinRows(vars.slug, (r) => (r.deletedAt != null ? null : r));
      return snapshot;
    },
    onError: (_err, vars, ctx) => {
      // Failed mutation → roll the snapshot back and say so; the list shows the truth.
      if (ctx) for (const [key, data] of ctx) queryClient.setQueryData(key, data);
      toast.push({ title: COPY.projectHome.toastFailed, tone: "danger" });
    },
    onSuccess: (env, vars) => {
      const undoSlug = vars.verb === "duplicate" && env.redirect != null
        ? /^\/p\/([^/?]+)/.exec(env.redirect)?.[1]
        : vars.slug;
      const title = TOAST_OF[vars.verb];
      toast.push({
        title,
        tone: "ok",
        durationMs: 8000,
        action: (
          <Button
            size="sm"
            variant="ghost"
            data-undo={vars.verb}
            onClick={() => lifecycle.mutate({ verb: UNDO_OF[vars.verb], slug: undoSlug ?? vars.slug })}
          >
            {COPY.projectHome.undoLabel}
          </Button>
        ),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["bff", "app"] });
    },
  });

  /** The remembered Group-by preference — POSTs `/app/grouping` (the same JSON branch the old
   *  form used) then repaints; the pick persists server-side. */
  const setGrouping = useMutation({
    mutationFn: (groupBy: "attention" | "voice") =>
      bffFetch("/app/grouping", { method: "POST", json: { groupBy } }) as Promise<MutationReply>,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["bff", "app"] });
    },
  });

  /** The ⋯ menu's post items — href items navigate through the link itself. */
  const onMenuAction = (item: RowActionView, _row: unknown): void => {
    if (item.formAction == null) return;
    const m = /^\/p\/([^/]+)\/(archive|unarchive|duplicate|delete|restore)$/.exec(item.formAction);
    if (m == null) return;
    lifecycle.mutate({ verb: m[2] as LifecycleVerb, slug: m[1]! });
  };

  const filtersActive =
    voiceFilter != null || protocolFilter != null || sort === "title" || showArchived || showDeleted;

  return (
    <div data-spa-surface>
      <PageBody>
        <PageHeader title={COPY.projects.heading} />
        {/* the one compact toolbar — instant apply; only non-default params reach the URL. */}
        <div className="ui-toolbar" data-home-toolbar="true">
          {compact === true ? null : (
            <Button
              variant="primary"
              size="sm"
              data-new-project="true"
              onClick={() => void router.navigate({ href: "/app/new" })}
            >
              {COPY.projectHome.newProject}
            </Button>
          )}
          <form
            method="get"
            action="/app"
            className="ui-toolbar-search"
            data-search-form="true"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const q = typeof fd.get("q") === "string" ? String(fd.get("q")).trim() : "";
              navigateHome({ q: q === "" ? null : q });
            }}
          >
            <TextField
              type="search"
              name="q"
              key={search?.q ?? ""}
              defaultValue={search?.q ?? ""}
              placeholder={COPY.projectHome.searchPlaceholder}
              aria-label={COPY.projectHome.searchPlaceholder}
              data-search-field="true"
            />
            <noscript>
              <button type="submit">{COPY.projectHome.searchSubmit}</button>
            </noscript>
          </form>
          <DropdownMenu
            trigger={
              <Button variant="secondary" size="sm" data-filter-menu="true">
                {COPY.projectHome.filterMenu}
                {filtersActive ? " ●" : ""}
              </Button>
            }
          >
            <DropdownMenuLabel>{COPY.projectHome.protocolFilterLabel}</DropdownMenuLabel>
            <DropdownMenuItem data-filter-choice="protocol:" onSelect={() => navigateHome({ protocol: null })}>
              {COPY.projectHome.protocolAll}
            </DropdownMenuItem>
            {protocols.map((p) => (
              <DropdownMenuItem
                key={p.id}
                data-filter-choice={`protocol:${p.id}`}
                onSelect={() => navigateHome({ protocol: p.id })}
              >
                {p.name}
                {protocolFilter === p.id ? " ✓" : ""}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{COPY.projectHome.voiceFilterLabel}</DropdownMenuLabel>
            <DropdownMenuItem data-filter-choice="voice:" onSelect={() => navigateHome({ voice: null })}>
              {COPY.projectHome.filterAll}
            </DropdownMenuItem>
            {voices.map((v) => (
              <DropdownMenuItem
                key={v.personaId}
                data-filter-choice={`voice:${v.personaId}`}
                onSelect={() => navigateHome({ voice: v.personaId })}
              >
                {v.name ?? v.personaId}
                {voiceFilter === v.personaId ? " ✓" : ""}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem data-filter-choice="voice:unfiled" onSelect={() => navigateHome({ voice: "unfiled" })}>
              {COPY.projectHome.unfiled}
              {voiceFilter === "unfiled" ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-filter-choice="archived" data-archived-toggle="true" onSelect={() => navigateHome({ archived: !showArchived })}>
              {showArchived ? COPY.projectHome.archivedHide : COPY.projectHome.archivedShow}
            </DropdownMenuItem>
            <DropdownMenuItem data-filter-choice="deleted" data-deleted-toggle="true" onSelect={() => navigateHome({ deleted: !showDeleted })}>
              {showDeleted ? COPY.projectHome.deletedHide : COPY.projectHome.deletedShow}
            </DropdownMenuItem>
            {filtersActive ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-filter-choice="clear" onSelect={() => navigateHome({ voice: null, protocol: null, sort: "recent", archived: false, deleted: false })}>
                  {COPY.projectHome.clearFilters}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenu>
          <DropdownMenu
            trigger={
              <Button variant="secondary" size="sm" data-sort-menu="true">
                {COPY.projectHome.sortMenu}: {sort === "title" ? COPY.projectHome.sortTitle : COPY.projectHome.sortRecent}
              </Button>
            }
          >
            <DropdownMenuItem data-sort-choice="recent" onSelect={() => navigateHome({ sort: "recent" })}>
              {COPY.projectHome.sortRecent}
              {sort === "recent" ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem data-sort-choice="title" onSelect={() => navigateHome({ sort: "title" })}>
              {COPY.projectHome.sortTitle}
              {sort === "title" ? " ✓" : ""}
            </DropdownMenuItem>
          </DropdownMenu>
          <DropdownMenu
            trigger={
              <Button variant="secondary" size="sm" data-group-by="true">
                {COPY.projectHome.groupByMenu}: {groupBy === "voice" ? COPY.projectHome.groupVoice : COPY.projectHome.groupNone}
              </Button>
            }
          >
            <DropdownMenuItem data-group-choice="attention" onSelect={() => setGrouping.mutate("attention")}>
              {COPY.projectHome.groupNone}
              {groupBy !== "voice" ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem data-group-choice="voice" onSelect={() => setGrouping.mutate("voice")}>
              {COPY.projectHome.groupVoice}
              {groupBy === "voice" ? " ✓" : ""}
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
        {search ? (
          <section data-search-results="true">
            <h2 className="ui-prow-heading">
              {COPY.projectHome.searchResults} · {search.results.length}
            </h2>
            {search.results.length === 0 ? (
              <EmptyState title={COPY.projects.empty} data-project-empty="true" />
            ) : (
              <ul className="ui-prow-list">
                {search.results.map((h) => (
                  <li key={`${h.kind}:${h.projectId}`} className="ui-prow">
                    <span className="ui-prow-main">
                      <a href={`/p/${h.slug}`} className="ui-prow-title">
                        {h.title}
                      </a>
                      <span className="ui-prow-version">{h.kind}</span>
                      <span className="ui-prow-status">{h.snippet}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : groupBy === "voice" ? (
          <VoiceGroupList groups={view.voiceGroups} emptyTitle={COPY.projects.empty} onMenuAction={onMenuAction} />
        ) : (
          <ProjectHomeList
            sections={view.sections}
            rows={view.flat}
            emptyTitle={COPY.projects.empty}
            onMenuAction={onMenuAction}
          />
        )}
        {showArchived && view.archivedRows.length > 0 ? (
          <section data-archived-section="true" className="ui-prow-section">
            <h2 className="ui-prow-heading">
              {COPY.projectHome.archivedHeading} · {view.archivedRows.length}
            </h2>
            <ul className="ui-prow-list">
              {view.archivedRows.map((row) => (
                <ProjectRow key={row.id} row={row} onMenuAction={onMenuAction} />
              ))}
            </ul>
          </section>
        ) : null}
        {showDeleted ? (
          <section data-deleted-section="true" className="ui-prow-section">
            <h2 className="ui-prow-heading">
              {COPY.projectHome.deletedHeading} · {view.deletedRows.length}
            </h2>
            <p className="ui-inbox-meta">{COPY.projectHome.deletedNote}</p>
            {view.deletedRows.length > 0 ? (
              <ul className="ui-prow-list">
                {view.deletedRows.map((row) => (
                  <li key={row.id} data-deleted-row={row.id} className="ui-prow">
                    <span className="ui-prow-title">{row.title}</span>
                    <Button
                      size="sm"
                      data-restore-form="true"
                      onClick={() => lifecycle.mutate({ verb: "restore", slug: row.href.replace("/p/", "") })}
                    >
                      {COPY.projectHome.actionRestore}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </PageBody>
    </div>
  );
}
