// SPA.15 — the `project-home` surface's React twin (REQ-SEQ-9, REQ-BFF-1/2/9, REQ-DAT-4,
// REQ-TST-2, REQ-UX-6/16; design/22 §2 `app` row; §5.2). `ProjectHomeSurface` ports pages.tsx
// `ProjectsPage` verbatim — the same `<Shell>`/`<PageTitle>` chrome, the same controls bar
// (New project / search / Group-by / Protocol / Sort / Archived / Deleted toggles), the same
// Voice chips, the same group/search/archived/deleted sections — on data read through
// `projectHomeQuery` instead of `usePageData()`. Every hook literal resolves to dom-contract.ts.
//
// Port notes (the places a React mount CANNOT be a byte-copy):
//   • the twin ships RAW DTOs (`rows`, `voices`, `groupBy`, `balance`, `protocols`,
//     `deletedRows`, `search`) — the filter/sort/split/map/group derivation runs client-side
//     off the SHARED `state-map.ts` seam (`toProjectRowView`/`groupByAttention`/`groupByVoice`),
//     so the row anatomy can never drift from the SSR's (design/22 F10: one mapper, both
//     renderers; the api's derived state is mapped, never recomputed).
//   • GET forms (search + the filter bar) keep their SSR markup verbatim but `onSubmit` builds
//     the same `/app?…` URL and in-router `navigate`s — the display filters never hit the BFF;
//     `?q=`/`?deleted=1` ride the twin's key and refetch.
//   • POST forms (`/app/grouping`, the row-menu `/p/:slug/{archive,unarchive,duplicate,delete}`,
//     the deleted section's `/restore`, the menu's `/p/:slug/voice` select) ride the delegated
//     submit + the JSON envelope: `redirect` navigates in-router (an unflipped target — the
//     `/p/:slug` editor family — takes `SsrHandoff`'s document nav by itself); the settle
//     invalidates `["bff"]` so the list repaints from the server, never optimistic mirroring.
//     `aria-busy` + disabled controls mark the in-flight form (REQ-UX-16) and release on settle.
//   • `/logout` is deliberately NOT intercepted — the session teardown stays a native document
//     POST (design/22 §1: `/logout` is never a fetch).
//   • `?verified=1`/showcase/held precedence never reaches this component — the document's fixed
//     handler order consumed them before the shell was served (REQ-BFF-20).

import { useMemo, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  BalanceChip,
  Chip,
  PageTitle,
  ProjectGroupList,
  ProjectRow,
  Shell,
  VoiceGroupList,
} from "@rhema/ui";
import type { ProjectRow as ApiProjectRow } from "@rhema/api-client";
import { COPY } from "../../copy.js";
import { groupByAttention, groupByVoice, toProjectRowView } from "../../state-map.js";
import { bffFetch } from "../bff.js";
import type { BffAppHomeTwin } from "../queries.js";


/** `{key}`-template substitution — the local twin of pages.tsx's `fmt` (one helper, both renderers). */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// ---- the shared mutation plumbing (the voices/onboarding grammar, verbatim) -------------------

interface FormField {
  readonly name: string;
  readonly value: string;
}

/** `new FormData(form)`'s field grammar, collected explicitly BEFORE the busy pass. */
function collectFields(form: HTMLFormElement): FormField[] {
  const out: FormField[] = [];
  for (const el of form.querySelectorAll("input, select, textarea")) {
    const name = el.getAttribute("name");
    if (name == null || name === "") continue;
    if (el instanceof HTMLInputElement) {
      if (el.disabled) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) out.push({ name, value: el.value === "" ? "on" : el.value });
        continue;
      }
      out.push({ name, value: el.value });
      continue;
    }
    if ((el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && !el.disabled) {
      out.push({ name, value: el.value });
    }
  }
  return out;
}

/** REQ-UX-16's in-flight affordance — `aria-busy` on the form + disabled controls. */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

/** The mutation success envelope the JSON branches answer (`{ok:true, redirect}`). */
interface MutationReply {
  readonly ok: true;
  readonly redirect?: string;
}

interface FormPost {
  readonly form: HTMLFormElement;
  readonly action: string;
  readonly fields: readonly FormField[];
}

/**
 * The §5.2 list's live search params — the leaf's validated search (`?voice`/`?protocol`/`?sort`
 * are display filters; `?archived`/`?deleted` toggle the two sections; `?q` selects the search
 * read). All optional; `undefined`/absent is the SSR's unset semantic.
 */
export interface ProjectHomeParams {
  readonly q?: string;
  readonly voice?: string;
  readonly protocol?: string;
  readonly sort?: string;
  readonly archived?: string;
  readonly deleted?: string;
}

/**
 * `/app` — the §5.2 workspace home: the controls bar, the Voice chips, then the attention or
 * voice groups (or the `?q=` search hits), then the archived/deleted sections — verbatim from
 * `ProjectsPage`. `compact` is the §10.1 phone verdict (new-project affordance withheld).
 */
export function ProjectHomeSurface({
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
  const voiceFilter = params.voice || null;
  const protocolFilter = params.protocol || null;
  const sort = params.sort === "title" ? ("title" as const) : ("recent" as const);
  const showArchived = params.archived === "1";
  const showDeleted = params.deleted === "1";
  const { rows, voices, groupBy, balance, protocols, deletedRows } = twin;
  const search = twin.search;

  /**
   * The SSR handler's filter → split → map → group derivation (server.ts's /app compose), run
   * client-side off the same `state-map.ts` helpers — Needs-you keeps its deadline order under
   * `sort=title` because the sort happens on the flat list before grouping (§5.2).
   */
  const view = useMemo(() => {
    let filtered = voiceFilter
      ? rows.filter((r) => (voiceFilter === "unfiled" ? r.voice == null : r.voice?.personaId === voiceFilter))
      : rows;
    if (protocolFilter) filtered = filtered.filter((r) => r.protocolId === protocolFilter);
    if (sort === "title") filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    const activeRows = filtered.filter((r) => r.archivedAt == null);
    const ctx = { voices };
    const toViews = (list: readonly ApiProjectRow[]) => list.map((r) => toProjectRowView(r, ctx));
    return {
      attentionGroups: groupByAttention(activeRows).map((g) => ({ ...g, rows: toViews(g.rows) })),
      voiceGroups: groupByVoice(activeRows).map((g) => ({ ...g, rows: toViews(g.rows) })),
      archivedRows: toViews(filtered.filter((r) => r.archivedAt != null)),
      deletedRows: toViews(deletedRows),
    };
  }, [rows, voices, deletedRows, voiceFilter, protocolFilter, sort]);

  /** the controls' hrefs keep the live query while swapping one facet (the SSR builder verbatim). */
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
    const archived = opts.archived === undefined ? showArchived : opts.archived;
    const deleted = opts.deleted === undefined ? showDeleted : opts.deleted;
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

  const mutation = useMutation<MutationReply, unknown, FormPost>({
    mutationFn: ({ action, fields }) => {
      const json: Record<string, string | string[]> = {};
      for (const f of fields) {
        const prev = json[f.name];
        if (prev === undefined) json[f.name] = f.value;
        else if (Array.isArray(prev)) prev.push(f.value);
        else json[f.name] = [prev, f.value];
      }
      return bffFetch(action, { method: "POST", json });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env) => {
      // The envelope's redirect is the 302's target verbatim. In-router navigate: a same-surface
      // target (`/app…`) refetches through the leaf; an unflipped `/p/…` target resolves through
      // SsrHandoff's document nav on its own.
      if (env.redirect != null) void router.navigate({ href: env.redirect });
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
    },
  });

  /**
   * Delegated submit on the surface root — the forms keep their SSR markup (the no-JS post is
   * the same element) but the SPA intercepts: GET forms (search + the filter bar) become an
   * in-router navigate to the same `/app?…` URL the form would have built; POST forms on the
   * surface's mutation paths ride the JSON branch. Anything else (`/logout`) submits natively.
   */
  const onSubmit = (e: FormEvent<HTMLElement>) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const action = form.getAttribute("action") ?? "";
    const method = (form.getAttribute("method") ?? "get").toLowerCase();
    if (method === "get") {
      if (action !== "/app") return;
      e.preventDefault();
      const p = new URLSearchParams();
      for (const f of collectFields(form)) p.set(f.name, f.value);
      const s = p.toString();
      void router.navigate({ href: s ? `/app?${s}` : "/app" });
      return;
    }
    // The surface's POST paths: /app/grouping + the row-menu /p/:slug/* actions. `/logout` (and
    // anything else) keeps its native document POST.
    if (!action.startsWith("/app") && !action.startsWith("/p/")) return;
    e.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    mutation.mutate({ form, action, fields: collectFields(form) });
  };

  return (
    <div data-spa-surface onSubmit={onSubmit}>
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
            {/* the session teardown stays a native document POST — never a fetch (design/22 §1). */}
            <form method="post" action="/logout" style={{ margin: 0 }}>
              <button type="submit" style={{ background: "none", border: "none", color: "var(--shell-fg-muted)", cursor: "pointer", fontSize: "13px" }}>
                {COPY.projects.signOut}
              </button>
            </form>
          </span>
        }
        footer={<span>{COPY.footer}</span>}
      >
        <PageTitle>{COPY.projects.heading}</PageTitle>
        {/* the controls bar: search, Group-by (persisted), the Voice filter chips, the Archived
            affordance — the SSR markup verbatim; submits ride the delegated handler. */}
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
            {showArchived ? <input type="hidden" name="archived" value="1" /> : null}
            {showDeleted ? <input type="hidden" name="deleted" value="1" /> : null}
            <input
              type="search"
              name="q"
              key={search?.q ?? ""}
              defaultValue={search?.q ?? ""}
              placeholder={COPY.projectHome.searchPlaceholder}
              aria-label={COPY.projectHome.searchPlaceholder}
              style={{ padding: "5px 10px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-surface)", color: "var(--shell-fg)", fontSize: "13px", minWidth: "220px" }}
            />
            <button type="submit" style={{ fontSize: "13px" }}>{COPY.projectHome.searchSubmit}</button>
          </form>
          <form method="post" action="/app/grouping" style={{ display: "flex", gap: "6px", alignItems: "center", margin: 0 }} data-group-by="true">
            <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>{COPY.projectHome.groupByLabel}</label>
            <select name="groupBy" key={groupBy} defaultValue={groupBy} aria-label={COPY.projectHome.groupByLabel} style={{ fontSize: "12px" }}>
              <option value="attention">{COPY.projectHome.groupAttention}</option>
              <option value="voice">{COPY.projectHome.groupVoice}</option>
            </select>
            <button type="submit" style={{ fontSize: "12px" }}>{COPY.projectHome.applyLabel}</button>
          </form>
          {/* the Protocol filter + Sort dropdowns (§5.2's bar) — a GET keeps every other live param. */}
          <form method="get" action="/app" style={{ display: "flex", gap: "6px", alignItems: "center", margin: 0 }} data-filter-form="true">
            {search?.q ? <input type="hidden" name="q" value={search.q} /> : null}
            {voiceFilter ? <input type="hidden" name="voice" value={voiceFilter} /> : null}
            {showArchived ? <input type="hidden" name="archived" value="1" /> : null}
            {showDeleted ? <input type="hidden" name="deleted" value="1" /> : null}
            <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>{COPY.projectHome.protocolFilterLabel}</label>
            <select name="protocol" key={protocolFilter ?? ""} defaultValue={protocolFilter ?? ""} aria-label={COPY.projectHome.protocolFilterLabel} style={{ fontSize: "12px" }}>
              <option value="">{COPY.projectHome.protocolAll}</option>
              {protocols.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>{COPY.projectHome.sortLabel}</label>
            <select name="sort" key={sort} defaultValue={sort} aria-label={COPY.projectHome.sortLabel} style={{ fontSize: "12px" }}>
              <option value="recent">{COPY.projectHome.sortRecent}</option>
              <option value="title">{COPY.projectHome.sortTitle}</option>
            </select>
            <button type="submit" style={{ fontSize: "12px" }}>{COPY.projectHome.applyLabel}</button>
          </form>
          {/* the Archived + Recently-deleted affordances — links keep the other live params. */}
          <a href={homeHref({ archived: !showArchived })}
             data-archived-toggle="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {showArchived ? COPY.projectHome.archivedHide : COPY.projectHome.archivedShow}
          </a>
          <a href={homeHref({ deleted: !showDeleted })}
             data-deleted-toggle="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {showDeleted ? COPY.projectHome.deletedHide : COPY.projectHome.deletedShow}
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
          <VoiceGroupList groups={view.voiceGroups} emptyLabel={COPY.projects.empty} />
        ) : (
          <ProjectGroupList groups={view.attentionGroups} emptyLabel={COPY.projects.empty} />
        )}
        {showArchived && view.archivedRows.length > 0 ? (
          <details data-archived-section="true" style={{ marginTop: "18px" }} open>
            <summary style={{ fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--shell-fg-muted)", cursor: "pointer", listStyle: "none" }}>
              {COPY.projectHome.archivedHeading} · {view.archivedRows.length}
            </summary>
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, border: "1px solid var(--shell-border)", borderRadius: "12px", overflow: "hidden", background: "var(--shell-surface)" }}>
              {view.archivedRows.map((row) => (
                <ProjectRow key={row.id} row={row} />
              ))}
            </ul>
          </details>
        ) : null}
        {/* the 30-day restore window (§5.2's soft delete) — the ONLY surface that reads deleted rows. */}
        {showDeleted ? (
          <section data-deleted-section="true" style={{ marginTop: "18px" }}>
            <h2 style={{ fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>
              {COPY.projectHome.deletedHeading} · {view.deletedRows.length}
            </h2>
            <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 6px" }}>{COPY.projectHome.deletedNote}</p>
            {view.deletedRows.length > 0 ? (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid var(--shell-border)", borderRadius: "12px", overflow: "hidden", background: "var(--shell-surface)" }}>
                {view.deletedRows.map((row) => (
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
    </div>
  );
}
