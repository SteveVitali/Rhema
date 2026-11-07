// SPA.11 — the `inbox` surface's React twin (REQ-SEQ-9, REQ-BFF-1/2/9, REQ-DAT-4, REQ-TST-2;
// design/22 §2 `inbox` row; §5.11). `InboxSurface` ports pages.tsx `InboxPage` verbatim — the same
// `<Shell>`/`<PageTitle>` chrome, the same section order (blocked → unread → read → voices), the
// same `data-inbox-*` vocabulary — on data read through `inboxQuery` instead of `usePageData()`.
// Every hook literal resolves to dom-contract.ts; nothing unmanifested is invented.
//
// Port notes (the places a React mount CANNOT be a byte-copy):
//   • gate cards come from the shared `gateCardFor` (../gate-card.js) — one composition, both
//     renderers — rendered with `presenceScript:false` because an innerHTML `<script>` never
//     executes inside React; `useGatePresence` (../gate-presence.ts) mounts the equivalent pings.
//   • the mark-read forms keep their SSR markup verbatim (`method="post"`, the `item` field, the
//     `data-inbox-*` hooks — the no-JS fallback is the same element) but `onSubmit` intercepts:
//     the SPA posts the JSON branch (`bffFetch` → `wantsJson` server-side) and invalidates
//     `["bff","app","inbox"]` instead of full-navigating through the 302. A mutation failure
//     settles like the SSR's swallowed write — the refetch shows the row still unread, which is
//     the truth — while `disabled`/`aria-busy` mark the in-flight control (REQ-UX-16).
//   • `compact` comes from the boot's `deviceClass` (the same `isPhoneRequest` verdict the SSR
//     reads) so the phone-width gate-card input set survives the flip.

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, DecisionsList, MarkdownProse } from "@rhema/ui";
import type { GateCardDto, InboxItemDto } from "@rhema/api-client";
import { COPY } from "../../copy.js";
import { decisionsLabels, gateCardFor, gateCardModel } from "../../gate-card.js";
import { bffFetch } from "../bff.js";
import { useGatePresence } from "../gate-presence.js";
import { PageBody, PageHeader } from "../page-header.js";
import { inboxQuery, type BffInboxTwin } from "../queries.js";

const { inbox: IN } = COPY;

/** `{key}`-template substitution — the local twin of pages.tsx's `fmt` (one helper, both renderers). */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** UX.1 — every row names its project; account-level rows legitimately carry none. */
function projectMeta(it: { projectTitle?: string | null }): ReactNode {
  return it.projectTitle ? (
    <p className="ui-inbox-meta" data-inbox-project="true">
      {it.projectTitle}
    </p>
  ) : null;
}

/** `/p/<slug>/…` → slug — the same regex the SSR rows run to find the gate's project. */
function slugOf(href: string): string | null {
  const m = /^\/p\/([^/#?]+)/.exec(href);
  return m?.[1] ?? null;
}

/**
 * A blocked gate row: `<details>` is the side-sheet (§5.11 — the expand IS the read). When the
 * aggregate joined the gate's real card the row mounts it through `gateCardFor` (`presenceScript`
 * off — `useGatePresence` carries the REQ-SPEC-18 pings); a missed join degrades to the deep link,
 * which lands the card on the artifact page itself.
 */
function InboxGateRow({
  item,
  card,
  slug,
  compact,
}: {
  readonly item: InboxItemDto;
  readonly card: GateCardDto | undefined;
  readonly slug: string | null;
  readonly compact: boolean;
}): ReactNode {
  // The presence pings mount only where the SSR would have emitted its script — an auto-proceed
  // card (`buildGateCard` decides `autoProceed` once, both renderers). `gateCardModel` is pure and
  // cheap; gateCardFor rebuilds the same model internally for the render.
  const autoProceed = card != null && slug != null ? gateCardModel(card, compact).autoProceed : false;
  const presenceRef = useGatePresence<HTMLDetailsElement>(
    autoProceed && slug != null && card != null ? `/p/${slug}/gates/${card.id}/activity` : null,
  );
  return (
    <details ref={presenceRef} data-inbox-row={item.id} data-inbox-kind="gate" className="ui-inbox-row">
      <summary className="ui-inbox-title">
        {item.title}
      </summary>
      {projectMeta(item)}
      <div className="ui-inbox-card">
        {item.body ? <MarkdownProse text={item.body} className="ui-inbox-body" /> : null}
        {item.gate ? (
          <p className="ui-inbox-meta">
            {item.gate.kind.replace(/_/g, " ")} · {item.gate.workflow.replace(/_/g, " ")}
            {item.gate.deadlineAt ? ` · ${IN.detailsCta} ${item.gate.deadlineAt.slice(0, 16).replace("T", " ")} UTC` : ""}
          </p>
        ) : null}
        {card != null && slug != null ? (
          <div data-inbox-gate-card={item.gate?.gateId} className="ui-inbox-card">
            {gateCardFor(card, slug, compact, undefined, { presenceScript: false })}
          </div>
        ) : (
          <p className="ui-inbox-meta">{IN.decideNote}</p>
        )}
        <a href={item.href} data-inbox-open="true" className="ui-inbox-open">{IN.openCta}</a>
      </div>
    </details>
  );
}

/** The mutation success envelope the JSON branch answers (`{ok:true, redirect}`). */
interface MutationReply {
  readonly ok: true;
  readonly redirect?: string;
}

/** The one POST leg — `bffFetch`'s json init sets the `wantsJson` headers server-side sees. */
function postInbox(path: "/app/inbox/read" | "/app/inbox/read-all", json: unknown): Promise<MutationReply> {
  return bffFetch(path, { method: "POST", json });
}

/**
 * `/app/inbox` — the §5.11 Inbox: blocked-on-you → unread → earlier → voices, verbatim from
 * `InboxPage`. The displayed badge IS the rendered blocked-row count (`blocked.length`), never the
 * raw api number — the two can disagree on degraded reads and the count of what you see wins.
 */
export function InboxSurface({
  inbox,
  compact,
}: {
  readonly inbox: BffInboxTwin;
  readonly compact: boolean;
}): ReactNode {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | "all" | null>(null);
  const invalidate = {
    onSettled: () => {
      setBusy(null);
      // Server-truth repaint — never optimistic mirroring (a refused mark leaves the row unread).
      void queryClient.invalidateQueries({ queryKey: inboxQuery.queryKey });
    },
  };
  const markRead = useMutation({
    ...invalidate,
    mutationFn: (item: string) => postInbox("/app/inbox/read", { item }),
  });
  const markAll = useMutation({
    ...invalidate,
    mutationFn: () => postInbox("/app/inbox/read-all", {}),
  });
  // The forms keep their SSR attributes (the no-JS post is the same element); the SPA intercepts
  // submit and rides the JSON branch + invalidate instead of the document nav. `e`'s type is the
  // JSX prop context's own — annotations aren't needed (and REQ-SAFE-10's source scan keys on them).

  const items = inbox.items;
  const blocked = items.filter((i) => i.kind === "blocked");
  const unread = items.filter((i) => i.kind === "event" && i.unread);
  const read = items.filter((i) => i.kind === "event" && !i.unread);
  const voices = items.filter((i) => i.kind === "voice");
  return (
    <div data-spa-surface>
      <PageBody>
        {/* R7SHELL.1b / UXC-12 — the leaf header (and its stray Billing link) is gone; the
            sidebar carries every nav item now. */}
        <PageHeader title={IN.heading} />
        {/* UX.1 — the count IS the rendered waiting rows. The api's badge count stays the nav
            badge's semantics; it can never disagree with this line because this line IS
            `blocked.length`. */}
        <p className="ui-inbox-badge-line" data-inbox-badge="true">
          {fmt(IN.badgeLine, { n: blocked.length })}
        </p>
        {items.length === 0 ? (
          <p data-inbox-empty="true" className="ui-inbox-empty">
            {IN.empty}
          </p>
        ) : null}
        {unread.length > 0 || read.length > 0 ? (
          <form
            method="post"
            action="/app/inbox/read-all"
            className="ui-inbox-card"
            aria-busy={busy === "all"}
            onSubmit={(e) => {
              e.preventDefault();
              if (busy != null) return;
              setBusy("all");
              markAll.mutate();
            }}
          >
            <Button type="submit" size="sm" data-inbox-read-all="true" disabled={busy != null}>
              {IN.markAllRead}
            </Button>
          </form>
        ) : null}

        {blocked.length > 0 ? (
          <section data-inbox-section="blocked" className="ui-inbox-section">
            <h2 className="ui-inbox-heading">{IN.needsYouHeading}</h2>
            {blocked.map((it) => {
              const slug = slugOf(it.href);
              if (it.gate) {
                return (
                  <InboxGateRow
                    key={it.id}
                    item={it}
                    card={inbox.gateCards[it.id]}
                    slug={slug}
                    compact={compact}
                  />
                );
              }
              if (it.decision && slug) {
                return (
                  <div key={it.id} data-inbox-row={it.id} data-inbox-kind="decision" className="ui-inbox-row">
                    <p className="ui-inbox-title">{it.title}</p>
                    {projectMeta(it)}
                    <MarkdownProse text={it.decision.text} className="ui-inbox-body" />
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
                <div key={it.id} data-inbox-row={it.id} className="ui-inbox-row">
                  <p className="ui-inbox-title">{it.title}</p>
                  {projectMeta(it)}
                  <a href={it.href} className="ui-inbox-open">{IN.openCta}</a>
                </div>
              );
            })}
          </section>
        ) : null}

        {unread.length > 0 ? (
          <section data-inbox-section="unread" className="ui-inbox-section">
            <h2 className="ui-inbox-heading">{IN.unreadHeading}</h2>
            {unread.map((it) => (
              <div key={it.id} data-inbox-row={it.id} data-inbox-type={it.type} className="ui-inbox-row ui-inbox-row--unread">
                <p className="ui-inbox-title">{it.title}</p>
                {projectMeta(it)}
                {it.body ? <MarkdownProse text={it.body} className="ui-inbox-body" /> : null}
                {/* The form is the flex <p>'s sibling (matching the corrected SSR source — `form`
                    is a p-closing tag, so nesting it would produce a different DOM than served). */}
                <p className="ui-inbox-actions">
                  <a href={it.href} data-inbox-open="true" className="ui-inbox-open">{IN.openCta}</a>
                </p>
                <form
                  method="post"
                  action="/app/inbox/read"
                  className="ui-inbox-card"
                  aria-busy={busy === it.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (busy != null) return;
                    setBusy(it.id);
                    markRead.mutate(it.id);
                  }}
                >
                  <input type="hidden" name="item" value={it.id} />
                  <Button type="submit" variant="ghost" size="sm" data-inbox-mark-read="true" disabled={busy != null}>
                    {IN.markReadCta}
                  </Button>
                </form>
              </div>
            ))}
          </section>
        ) : null}

        {read.length > 0 ? (
          <section data-inbox-section="read" className="ui-inbox-section">
            <h2 className="ui-inbox-heading">{IN.readHeading}</h2>
            {read.map((it) => (
              <div key={it.id} data-inbox-row={it.id} data-inbox-type={it.type} className="ui-inbox-row ui-inbox-row--read">
                <p className="ui-inbox-title ui-inbox-title--read">{it.title}</p>
                {projectMeta(it)}
                {it.body ? <MarkdownProse text={it.body} className="ui-inbox-body ui-inbox-body--faint" /> : null}
                <a href={it.href} data-inbox-open="true" className="ui-inbox-open">{IN.openCta}</a>
              </div>
            ))}
          </section>
        ) : null}

        {voices.length > 0 ? (
          <section data-inbox-section="voices" className="ui-inbox-section">
            <h2 className="ui-inbox-heading">{IN.voicesHeading}</h2>
            {voices.map((it) => (
              <div key={it.id} data-inbox-row={it.id} data-inbox-type="voice_stale" className="ui-inbox-row">
                <p className="ui-inbox-title">{it.title}</p>
                {projectMeta(it)}
                {it.body ? <MarkdownProse text={it.body} className="ui-inbox-body" /> : null}
                <a href={it.href} className="ui-inbox-open">{IN.openCta}</a>
              </div>
            ))}
          </section>
        ) : null}
      </PageBody>
    </div>
  );
}
