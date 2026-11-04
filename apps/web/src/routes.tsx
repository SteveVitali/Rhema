import type { ReactNode } from "react";
import { matchRoutes } from "react-router";
import { InvitePage, LoginPage, ProjectPage, RevisionPage, PagePage, ComparePage, NotFoundPage } from "./pages.js";
import { LandingPage, PricingPage, SignupPage, ShowcasePage } from "./marketing.js";
import { legalElements } from "./legal.js";
import { DemoHubPage, DemoReadOnlyPage } from "./demo-page.js";

// The canonical route manifest (§4.2). The beta uses the `/p/:project` shapes so nothing is thrown away when
// the full IDE arrives. P1.17 lands the public funnel: `/` is the §15.1 landing, `/pricing` renders
// `pricing.json`, `/signup` carries the funnel intent, and the invite machinery keeps `/invite`
// (partner cohorts still use it). `public` marks the routes reachable without a session;
// everything else is auth-gated (redirects to /login).
//
// SPA.28 (the SSR deletion wave + override removal) — `element` is now null on every flipped
// surface: the route stays in the manifest (path grammar + `public` remain the census of record,
// `matchAppRoute` still resolves it) but NO SSR document exists for it — the handler serves the SPA
// shell and the leaf owns composition off the /bff twins. The surviving elements are exactly the
// surfaces a server document still answers: the public funnel + the R6LGL.1 legal/trust
// documents (forever SSR — REQ-BND-1/REQ-LCH-1), the Page family's forced-SSR documents
// (phone/showcase only — REQ-ED-12; the `?ssr=1` escape is gone), and the not-found document
// (every POST refusal + the catch-all's non-SPA arm). Re-adding an element to a flipped row does
// NOT restore a render — the handlers no longer render elements at all for flipped routes.

export interface AppRoute {
  readonly path: string;
  readonly public: boolean;
  /** The SSR document — `null` on every flipped surface (SPA.27: the leaf owns the render). */
  readonly element: ReactNode;
}

export const inviteElement = <InvitePage />;
export const loginElement = <LoginPage />;
// P1.17 — the public funnel elements (§15.1 landing, §15.2 pricing, §15.3 signup-with-intent).
export const landingElement = <LandingPage />;
export const pricingElement = <PricingPage />;
export const signupElement = <SignupPage />;
// UX.1 — the public Showcase surface (manifest invariant 13: signed-out = static sample; a signed-in
// viewer WITHOUT a showcase project renders the same static sample with app-flavored chrome).
export const showcaseElement = <ShowcasePage />;
export const showcaseSignedInElement = <ShowcasePage signedIn />;
// R7DEM.4 (REQ-DWEB-9/2) — the public demo hub frame + the terminal read-only notice a demo
// write gets when the caller is not a JSON client.
export const demoHubElement = <DemoHubPage />;
export const demoReadOnlyElement = <DemoReadOnlyPage />;
export const projectElement = <ProjectPage />;
// P1.08 — the §5.8 generalized compare (/p/:project/v/:n/diff/:m; three read-only layouts).
export const compareElement = <ComparePage />;
// P1.02 — the Page (the schema-first editor surface; /p/:project/v/:v, /v/working).
export const pageElement = <PagePage />;
export const revisionElement = <RevisionPage />;
export const notFoundElement = <NotFoundPage />;

// SPA.27 — a flipped row's element is null: `SPA_ONLY` reads "no SSR document — the shell answers".
const SPA_ONLY = null;

export const routes: readonly AppRoute[] = [
  // P1.17 — `/` is the §15.1 landing now; the invite machinery keeps `/invite` (the Notes rule:
  // the landing replaces the invite page at the apex, partner cohorts keep their route).
  { path: "/", public: true, element: landingElement },
  { path: "/invite", public: true, element: inviteElement },
  { path: "/pricing", public: true, element: pricingElement },
  { path: "/signup", public: true, element: signupElement },
  { path: "/login", public: true, element: loginElement },
  { path: "/showcase", public: true, element: showcaseElement },
  // R7DEM.4 (REQ-DWEB-9) — the public demo hub: SSR forever like the funnel; `/demo/<essay>/…`
  // documents are the demo guard's business (the demo shell), not manifest rows.
  { path: "/demo", public: true, element: demoHubElement },
  // R6LGL.1 (REQ-LCH-1) — the legal/trust documents: public SSR forever like the rest of the
  // funnel (REQ-BND-5). Elements come from `legalElements` so the census row + the emitted
  // element can never drift apart; `approved: false` rides `LEGAL_PAGES` until HUMAN-H11.
  { path: "/terms", public: true, element: legalElements["/terms"] },
  { path: "/privacy", public: true, element: legalElements["/privacy"] },
  { path: "/refunds", public: true, element: legalElements["/refunds"] },
  { path: "/acceptable-use", public: true, element: legalElements["/acceptable-use"] },
  { path: "/contact", public: true, element: legalElements["/contact"] },
  { path: "/app", public: false, element: SPA_ONLY },
  // P1.04 — the new-project sheet (§5.3): ?entry=scratch|outline|draft picks the entry.
  { path: "/app/new", public: false, element: SPA_ONLY },
  // P1.19 — the §5.11 Inbox (REQ-IDE-2 amended): blocked-on-you → unread events → stale voices.
  { path: "/app/inbox", public: false, element: SPA_ONLY },
  { path: "/p/:project", public: false, element: projectElement },
  { path: "/p/:project/import", public: false, element: SPA_ONLY },
  { path: "/p/:project/run", public: false, element: SPA_ONLY },
  { path: "/p/:project/review/:runId", public: false, element: SPA_ONLY },
  // P1.05 — the canonical run surface (§4.2): the §14.5 report at #report.
  { path: "/p/:project/r/:runId", public: false, element: SPA_ONLY },
  { path: "/p/:project/revisions/:cid", public: false, element: revisionElement },
  // SPA.24 (REQ-ED-16) — `/p/:project/edit/:draftId` keeps NO manifest row: its GET has 302'd to
  // `/v/:n` since P1.02 (the source-editor surface it rendered is retired) and the
  // `/edit/:draftId/{doc,note,cancel-run,revise}` transport endpoints stay live server-side.
  // P1.02 — the Page routes: /v/working (the editable head), /v/:n (a versioned draft), and
  // /a/:artifactId (a non-draft artifact rendered read-only).
  { path: "/p/:project/v/:v", public: false, element: pageElement },
  // P1.08 — the §5.8 compare route (deeper than /v/:v — no ambiguity; ?layout=side|inline|moves).
  { path: "/p/:project/v/:n/diff/:m", public: false, element: compareElement },
  { path: "/p/:project/a/:artifactId", public: false, element: pageElement },
  // P1.12 — the outline surface (§7.3): the durable editor + the promotion sheet (the Promote click
  // is the consent — it creates the `outline` run; the chat `/outline` verb lands here too).
  { path: "/p/:project/outline", public: false, element: SPA_ONLY },
  { path: "/p/:project/outline/promote", public: false, element: SPA_ONLY },
  // P1.13 — the Figures surface (§7.5): the pane, the card (preview + disclosures + the
  // insert-as-proposal surface), and the /visualize sheet — every entry point's run starts here.
  { path: "/p/:project/figures", public: false, element: SPA_ONLY },
  { path: "/p/:project/figures/:figureId", public: false, element: SPA_ONLY },
  { path: "/p/:project/visualize", public: false, element: SPA_ONLY },
  // P1.07 — the palette's free-form obligation (REQ-OBJ-10): the row-creation path.
  { path: "/p/:project/obligations/new", public: false, element: SPA_ONLY },
  // P1.20 — the §4.2 project-settings page (safe protocol fields + approval policy + guidance).
  { path: "/p/:project/settings", public: false, element: SPA_ONLY },
  // PRB.11 — the export dialog (format choice, the never-blocking obligation line, the AI-use attach
  // toggle + statement preview; §13.4, §8.4, §11.7).
  { path: "/p/:project/export", public: false, element: SPA_ONLY },
  // PRB.10 — the voice surface (§9.2–§9.6): the library, the creation sheet, the detail page.
  { path: "/voices", public: false, element: SPA_ONLY },
  { path: "/voices/new", public: false, element: SPA_ONLY },
  { path: "/v/:persona", public: false, element: SPA_ONLY },
  // P1.14 — the project voice hatches: the reseed-diff preview the adopt dialog shows (§9.6).
  { path: "/p/:project/voice/reseed", public: false, element: SPA_ONLY },
  // P1.20 — the §14.7 settings tree at the §4.2 paths (the beta's `/settings` migrated — the server
  // 302s the legacy paths onto these). Team stays hidden until roles ship.
  { path: "/settings", public: false, element: SPA_ONLY },
  { path: "/app/settings", public: false, element: SPA_ONLY },
  { path: "/app/settings/account", public: false, element: SPA_ONLY },
  { path: "/app/settings/preferences", public: false, element: SPA_ONLY },
  { path: "/app/settings/notifications", public: false, element: SPA_ONLY },
  { path: "/app/settings/integrations", public: false, element: SPA_ONLY },
  { path: "/app/settings/data", public: false, element: SPA_ONLY },
  { path: "/usage", public: false, element: SPA_ONLY },
  // P1.16 — billing, full (§14.2/14.3/14.5/14.6): the plan card + Checkout/portal/auto-reload forms,
  // the checkout-return poll (REQ-BILL-14), and the level-2 project usage rollup. All auth-gated.
  // P1.20 — the Billing section's canonical path is /app/settings/billing; /settings/billing stays
  // mounted as the legacy alias so existing form posts + deep links keep working.
  { path: "/app/settings/billing", public: false, element: SPA_ONLY },
  { path: "/settings/billing", public: false, element: SPA_ONLY },
  { path: "/billing/return", public: false, element: SPA_ONLY },
  { path: "/p/:project/usage", public: false, element: SPA_ONLY },
];

/** Resolve a pathname to its route (React Router param matching). Undefined ⇒ 404. */
export function matchAppRoute(
  pathname: string,
): { route: AppRoute; params: Readonly<Record<string, string | undefined>> } | undefined {
  const matched = matchRoutes(
    routes.map((r) => ({ path: r.path })),
    pathname,
  );
  if (!matched || matched.length === 0) return undefined;
  const last = matched[matched.length - 1]!;
  const route = routes.find((r) => r.path === last.route.path);
  return route ? { route, params: last.params } : undefined;
}
