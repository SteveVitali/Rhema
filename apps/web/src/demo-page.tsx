// R7DEM.4 (REQ-DWEB-9 server half; REQ-DWEB-2) — the two demo SSR documents: the `/demo` hub
// (220's frame, filled by 221a R7DEM.5b) and the terminal read-only notice a non-GET demo write
// renders when the caller is not a JSON client. Both are plain public documents — they ride
// `renderDocument`'s N10 head contract and the single CSP nonce like every SSR page.
//
// 221a (REQ-TOUR-1/3/8; P4-6) — the filled hub: four essay cards in `DEMO_HUB_ESSAYS` order
// (SPD hero, GM, POV, CoR), every displayed fact and count coming from 218a's `demoCardFacts`
// snapshot DTO verbatim — this file FORMATS structured numbers and interpolates copy slots; it
// never recomputes a count (the demo-hub grep test pins that). "What to look at" bullets are
// COPY leaves paired positionally with the LOOK_AT deep-link table; corpus text arrives as data.

import type { CSSProperties, ReactNode } from "react";
import { DEMO_HUB_ESSAYS, DEMO_TOUR_ENTRY_HREF, demoDeepLink } from "@rhema/contracts";
import type { DemoCardFactsDto } from "@rhema/api-client";
import { COPY } from "./copy.js";

/** `{slot}` interpolation for COPY fmt leaves — a formatter only (never a count). */
function fill(template: string, vars: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}

/** Display a data-carried subtitle — the record stores markdown emphasis (`*…*`); strip it. */
function displaySubtitle(subtitle: string): string {
  return subtitle.replace(/^\*+|\*+$/g, "");
}

/** The "What to look at" deep-link table — each bullet's `{route, hook}` pairs positionally
 *  with `COPY.demo.cards.lookAt[essay]`. `route` is the essay-relative path ("" = the essay
 *  root); `hook` is a declared DOM-contract hook the `#fragment` names. The equality of the two
 *  tables and every link's allowlist+hook resolution are pinned in demo-hub.test.ts. */
export const LOOK_AT: Readonly<Record<string, readonly { route: string; hook: string }[]>> = {
  "the-governable-mind": [
    { route: "/review/v2-review", hook: "data-letter-view" },
    { route: "/review/v2-review", hook: "data-claim" },
    { route: "/a/correspondence--v2-response.md", hook: "data-demo-markers" },
    { route: "/a/agents--author--ledgers--v2-response-ledger.md", hook: "data-demo-escalation" },
    { route: "/a/correspondence--v2-response.md", hook: "data-demo-markers" },
  ],
  "the-politics-of-visibility": [
    { route: "/review/v1-review", hook: "data-letter-view" },
    { route: "/review/v1-review", hook: "data-finding" },
    { route: "/review/v1-review", hook: "data-claim" },
    { route: "/a/agents--author--ledgers--v1-response-ledger.md", hook: "data-demo-markers" },
  ],
  "constitution-of-reason": [
    { route: "/a/agents--author--ledgers--v2-response-ledger.md", hook: "data-demo-escalation" },
    { route: "/review/v2-review", hook: "data-letter-view" },
    { route: "/a/correspondence--v2-review--04-craft-notes.md", hook: "data-demo-markers" },
    { route: "", hook: "data-files-pane" },
  ],
};

/** The interpolated value set a card's own facts supply to its copy slots. */
function cardSlots(card: DemoCardFactsDto): Record<string, string> {
  return {
    n: String(card.words),
    major: String(card.counts.major),
    minor: String(card.counts.minor),
    strengths: String(card.counts.strengths),
    claimsChecked: String(card.counts.claimsChecked),
    words: String(card.words),
  };
}

const chipRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  alignItems: "center",
  padding: 0,
  margin: "10px 0",
  listStyle: "none",
};
const chip: CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: "999px",
  padding: "2px 10px",
  fontSize: "12px",
  color: "var(--shell-fg-muted)",
};

function ArcStep({ step }: { step: DemoCardFactsDto["arc"][number] }) {
  const label =
    step.kind === "draft"
      ? step.draftId === "published"
        ? COPY.demo.hub.arcPublished
        : `v${step.n}`
      : fill(COPY.demo.hub.arcReview, { n: String(step.subjectN) });
  return <li style={chip}>{label}</li>;
}

function EssayCard({ card, hero = false }: { card: DemoCardFactsDto; hero?: boolean }) {
  const slots = cardSlots(card);
  const bullets = COPY.demo.cards.lookAt[card.essay as keyof typeof COPY.demo.cards.lookAt];
  const links = LOOK_AT[card.essay];
  const reviewColor = "var(--accent)";
  return (
    <li
      data-demo-essay-card={card.essay}
      className="ui-t-r3 ui-t-p1820 ui-t-m04 ui-d-sev"
      style={
        {
          border: "1px solid var(--shell-border)",
          "--d-sev": hero ? "var(--shell-raised)" : "transparent",
        } as CSSProperties
      }
    >
      <h2 className="ui-t-f20 ui-t-m01">{card.title}</h2>
      {card.subtitle != null ? (
        <p className="ui-t-mut ui-d-it ui-t-m01">{displaySubtitle(card.subtitle)}</p>
      ) : null}
      {card.retitle != null ? (
        <p className="ui-t-dim ui-d-fs ui-t-m01">
          {fill(COPY.demo.hub.retitleFmt, {
            from: card.retitle.from,
            atLabel: card.retitle.atLabel,
          })}
        </p>
      ) : null}
      {card.publishedLabel != null ? (
        <p className="ui-t-dim ui-d-fs ui-c2-m0">{card.publishedLabel}</p>
      ) : null}
      <p className="ui-t-dim ui-d-fs ui-t-m10">
        {fill(COPY.demo.hub.wordsFmt, { n: String(card.words) })}
      </p>
      <ol data-demo-card-arc style={chipRow}>
        {card.arc.map((step, i) => (
          <ArcStep key={`${step.kind}-${i}`} step={step} />
        ))}
      </ol>
      <p className="ui-d-fd ui-c2-mb">{fill(COPY.demo.hub.countsFmt, slots)}</p>
      {bullets != null && links != null ? (
        <div className="ui-t-m80">
          <h3 className="ui-d-fd ui-t-m06 ui-t-mut">{COPY.demo.hub.lookAtHeading}</h3>
          <ul className="ui-c2-m0 ui-t-pl18">
            {bullets.map((text, i) => {
              const link = links[i];
              if (link == null) return null;
              return (
                <li key={i} className="ui-d-fd ui-t-lh5">
                  <a
                    data-demo-look-at
                    data-spa-native
                    href={demoDeepLink(card.essay, link.route, link.hook)}
                    className="ui-d-sc"
                    style={{ "--d-sev": reviewColor } as CSSProperties}
                  >
                    {fill(text, slots)}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="ui-t-g14 ui-t-ma00" style={{ display: "flex", flexWrap: "wrap" }}>
        {card.publishedUrl != null ? (
          <a href={card.publishedUrl} rel="noreferrer" className="ui-t-acc">
            {COPY.demo.hub.readOnSubstack}
          </a>
        ) : null}
        <a href={demoDeepLink(card.essay)} data-spa-native className="ui-t-acc">
          {COPY.demo.hub.openInRhema}
        </a>
        {hero ? (
          <a
            href={DEMO_TOUR_ENTRY_HREF}
            data-spa-native
            data-demo-tour-entry
            className="ui-t-acc ui-d-b"
          >
            {COPY.demo.hub.heroTourCta}
          </a>
        ) : null}
      </p>
    </li>
  );
}

/** The `/demo` hub — `data-demo-root` is the mount marker the DOM contract pins. `cards` is the
 *  ordered `demoCardFacts` set `demoHubCards` read off the snapshots (empty on the synthetic
 *  fixture — the hub frame still serves, honestly card-free). */
export function DemoHubPage({ cards = [] }: { cards?: readonly DemoCardFactsDto[] }) {
  const hero = cards.find((c) => c.essay === DEMO_HUB_ESSAYS[0]) ?? cards[0];
  const rest = cards.filter((c) => c !== hero);
  return (
    <main data-demo-root data-page-root>
      <section data-demo-hub className="ui-t-mw720 ui-t-m0a ui-t-p7224">
        <h1 className="ui-t-f32 ui-t-mb12">{COPY.demo.hubTitle}</h1>
        <p className="ui-t-dim ui-t-lh6">{COPY.demo.hubLede}</p>
        <ol className="ui-t-m280 ui-d-p0" style={{ listStyle: "none" }}>
          {hero != null ? <EssayCard card={hero} hero /> : null}
          {rest.map((card) => (
            <EssayCard key={card.essay} card={card} />
          ))}
        </ol>
        <div data-demo-provenance className="ui-set-sec">
          <p className="ui-t-dim ui-t-lh6 ui-d-fd">
            {COPY.demo.hub.provenanceLead}
            <a
              href="https://github.com/SteveVitali/agent-discourse"
              rel="noreferrer"
              className="ui-t-acc"
            >
              {COPY.demo.hub.agentDiscourseLink}
            </a>
            {COPY.demo.hub.provenanceMid}
          </p>
          <p className="ui-t-dim ui-t-lh6 ui-d-fd">{COPY.demo.hub.provenanceRoles}</p>
          <p className="ui-t-mut ui-d-fd">{COPY.demo.hub.byline}</p>
        </div>
      </section>
    </main>
  );
}

/** The element the guard's hub arm renders (demo.ts is .ts — the JSX lives here). */
export function demoHubDocument(cards: readonly DemoCardFactsDto[]): ReactNode {
  return (
    <>
      <DemoHubPage cards={cards} />
      {/* 223 R7DEM.6b (REQ-TOUR-9) — the anonymous `demo.hub_viewed` beacon. Inline script is
       *  CSP-nonced by the middleware; sendBeacon only, ≤ 256 B, `src` from the URL. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            `(function(){try{var s=new URLSearchParams(location.search).get("src");` +
            `var b={event:"demo.hub_viewed"};if(s){b.src=s.slice(0,40);}` +
            `navigator.sendBeacon("/a/demo",new Blob([JSON.stringify(b)],{type:"text/plain"}));` +
            `}catch(e){}})();`,
        }}
      />
    </>
  );
}

/**
 * The terminal notice for a demo write (REQ-DWEB-2): a form poster lands here at 405 — an honest
 * "this is a read-only demo" page, never the shell and never a silent failure.
 */
export function DemoReadOnlyPage() {
  return (
    <main data-demo-readonly-notice data-page-root>
      <section className="ui-set-main ui-t-m0a ui-t-p9624">
        <h1 className="ui-t-f24 ui-t-mb12">{COPY.demo.readOnlyTitle}</h1>
        <p className="ui-t-dim ui-t-lh6">{COPY.demo.readOnlyBody}</p>
      </section>
    </main>
  );
}
