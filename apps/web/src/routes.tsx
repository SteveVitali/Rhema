import type { ReactNode } from "react";
import { matchRoutes } from "react-router";
import { InvitePage, LoginPage, ProjectsPage, ProjectPage, NewProjectPage, ImportPage, ImportPreviewPage, RunSheetPage, DossierPage, RevisionPage, EditorPage, PagePage, ComparePage, ExportPage, VoicesPage, VoiceNewPage, VoiceDetailPage, VoiceReseedPage, ObligationNewPage, SettingsPage, ProjectSettingsPage, UsagePage, RunReportPage, OutlinePage, OutlinePromotePage, FiguresPanePage, FigureCardPage, VisualizePage, BillingPage, BillingReturnPage, ProjectUsagePage, InboxPage, NotFoundPage } from "./pages.js";
import { LandingPage, PricingPage, SignupPage, ShowcasePage } from "./marketing.js";

// The canonical route manifest (§4.2). The beta uses the `/p/:project` shapes so nothing is thrown away when
// the full IDE arrives. P1.17 lands the public funnel: `/` is the §15.1 landing, `/pricing` renders
// `pricing.json`, `/signup` carries the funnel intent, and the invite machinery keeps `/invite`
// (partner cohorts still use it). `public` marks the routes reachable without a session;
// everything else is auth-gated (redirects to /login).

export interface AppRoute {
  readonly path: string;
  readonly public: boolean;
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
export const projectsElement = <ProjectsPage />;
export const projectElement = <ProjectPage />;
// P1.04 — the §5.3 new-project sheet (three entries: scratch / outline / draft).
export const newProjectElement = <NewProjectPage />;
export const importElement = <ImportPage />;
export const importPreviewElement = <ImportPreviewPage />;
export const runSheetElement = <RunSheetPage />;
export const dossierElement = <DossierPage />;
export const revisionElement = <RevisionPage />;
export const editorElement = <EditorPage />;
// P1.02 — the Page (the schema-first editor surface; /p/:project/v/:v, /v/working).
export const pageElement = <PagePage />;
// P1.08 — the §5.8 generalized compare (/p/:project/v/:n/diff/:m; three read-only layouts).
export const compareElement = <ComparePage />;
export const exportElement = <ExportPage />;
export const voicesElement = <VoicesPage />;
export const voiceNewElement = <VoiceNewPage />;
export const voiceDetailElement = <VoiceDetailPage />;
// P1.14 — the adopt dialog's charter-diff preview (§9.6 "shows the diff before commit").
export const voiceReseedElement = <VoiceReseedPage />;
// P1.07 — the palette's free-form obligation form (REQ-OBJ-10).
export const obligationNewElement = <ObligationNewPage />;
// P1.20 — the §14.7 settings tree (one element; the active section comes from PageData).
export const settingsElement = <SettingsPage />;
/** P1.20 — `/p/:project/settings` (§4.2): the safe protocol fields + approvals + standing guidance. */
export const projectSettingsElement = <ProjectSettingsPage />;
export const usageElement = <UsagePage />;
// P1.16 — billing, full: the plan card, the checkout-return poll, the level-2 project rollup.
export const billingElement = <BillingPage />;
export const billingReturnElement = <BillingReturnPage />;
export const projectUsageElement = <ProjectUsagePage />;
// P1.19 — the §5.11 Inbox (REQ-IDE-2 amended; the Rail's global surface).
export const inboxElement = <InboxPage />;
// P1.05 — the run report (§14.5 levels 3–4; the Timeline card's "Run report" link lands here).
export const runReportElement = <RunReportPage />;
// P1.12 — the unlocked outline editor + the promotion sheet (§7.3).
export const outlineElement = <OutlinePage />;
export const outlinePromoteElement = <OutlinePromotePage />;
// P1.13 — the Figures pane, the figure card, and the /visualize sheet (§7.5).
export const figuresElement = <FiguresPanePage />;
export const figureCardElement = <FigureCardPage />;
export const visualizeElement = <VisualizePage />;
export const notFoundElement = <NotFoundPage />;

export const routes: readonly AppRoute[] = [
  // P1.17 — `/` is the §15.1 landing now; the invite machinery keeps `/invite` (the Notes rule:
  // the landing replaces the invite page at the apex, partner cohorts keep their route).
  { path: "/", public: true, element: landingElement },
  { path: "/invite", public: true, element: inviteElement },
  { path: "/pricing", public: true, element: pricingElement },
  { path: "/signup", public: true, element: signupElement },
  { path: "/login", public: true, element: loginElement },
  { path: "/showcase", public: true, element: showcaseElement },
  { path: "/app", public: false, element: projectsElement },
  // P1.04 — the new-project sheet (§5.3): ?entry=scratch|outline|draft picks the entry.
  { path: "/app/new", public: false, element: newProjectElement },
  // P1.19 — the §5.11 Inbox (REQ-IDE-2 amended): blocked-on-you → unread events → stale voices.
  { path: "/app/inbox", public: false, element: inboxElement },
  { path: "/p/:project", public: false, element: projectElement },
  { path: "/p/:project/import", public: false, element: importElement },
  { path: "/p/:project/run", public: false, element: runSheetElement },
  { path: "/p/:project/review/:runId", public: false, element: dossierElement },
  // P1.05 — the canonical run surface (§4.2): the §14.5 report at #report.
  { path: "/p/:project/r/:runId", public: false, element: runReportElement },
  { path: "/p/:project/revisions/:cid", public: false, element: revisionElement },
  { path: "/p/:project/edit/:draftId", public: false, element: editorElement },
  // P1.02 — the Page routes: /v/working (the editable head), /v/:n (a versioned draft), and
  // /a/:artifactId (a non-draft artifact rendered read-only).
  { path: "/p/:project/v/:v", public: false, element: pageElement },
  // P1.08 — the §5.8 compare route (deeper than /v/:v — no ambiguity; ?layout=side|inline|moves).
  { path: "/p/:project/v/:n/diff/:m", public: false, element: compareElement },
  { path: "/p/:project/a/:artifactId", public: false, element: pageElement },
  // P1.12 — the outline surface (§7.3): the durable editor + the promotion sheet (the Promote click
  // is the consent — it creates the `outline` run; the chat `/outline` verb lands here too).
  { path: "/p/:project/outline", public: false, element: outlineElement },
  { path: "/p/:project/outline/promote", public: false, element: outlinePromoteElement },
  // P1.13 — the Figures surface (§7.5): the pane, the card (preview + disclosures + the
  // insert-as-proposal surface), and the /visualize sheet — every entry point's run starts here.
  { path: "/p/:project/figures", public: false, element: figuresElement },
  { path: "/p/:project/figures/:figureId", public: false, element: figureCardElement },
  { path: "/p/:project/visualize", public: false, element: visualizeElement },
  // P1.07 — the palette's free-form obligation (REQ-OBJ-10): the row-creation path.
  { path: "/p/:project/obligations/new", public: false, element: obligationNewElement },
  // P1.20 — the §4.2 project-settings page (safe protocol fields + approval policy + guidance).
  { path: "/p/:project/settings", public: false, element: projectSettingsElement },
  // PRB.11 — the export dialog (format choice, the never-blocking obligation line, the AI-use attach
  // toggle + statement preview; §13.4, §8.4, §11.7).
  { path: "/p/:project/export", public: false, element: exportElement },
  // PRB.10 — the voice surface (§9.2–§9.6): the library, the creation sheet, the detail page.
  { path: "/voices", public: false, element: voicesElement },
  { path: "/voices/new", public: false, element: voiceNewElement },
  { path: "/v/:persona", public: false, element: voiceDetailElement },
  // P1.14 — the project voice hatches: the reseed-diff preview the adopt dialog shows (§9.6).
  { path: "/p/:project/voice/reseed", public: false, element: voiceReseedElement },
  // P1.20 — the §14.7 settings tree at the §4.2 paths (the beta's `/settings` migrated — the server
  // 302s the legacy paths onto these). Team stays hidden until roles ship.
  { path: "/settings", public: false, element: settingsElement },
  { path: "/app/settings", public: false, element: settingsElement },
  { path: "/app/settings/account", public: false, element: settingsElement },
  { path: "/app/settings/preferences", public: false, element: settingsElement },
  { path: "/app/settings/notifications", public: false, element: settingsElement },
  { path: "/app/settings/integrations", public: false, element: settingsElement },
  { path: "/app/settings/data", public: false, element: settingsElement },
  { path: "/usage", public: false, element: usageElement },
  // P1.16 — billing, full (§14.2/14.3/14.5/14.6): the plan card + Checkout/portal/auto-reload forms,
  // the checkout-return poll (REQ-BILL-14), and the level-2 project usage rollup. All auth-gated.
  // P1.20 — the Billing section's canonical path is /app/settings/billing; /settings/billing stays
  // mounted as the legacy alias so existing form posts + deep links keep working.
  { path: "/app/settings/billing", public: false, element: billingElement },
  { path: "/settings/billing", public: false, element: billingElement },
  { path: "/billing/return", public: false, element: billingReturnElement },
  { path: "/p/:project/usage", public: false, element: projectUsageElement },
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
