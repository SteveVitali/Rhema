import type { ReactNode } from "react";
import { matchRoutes } from "react-router";
import { InvitePage, LoginPage, ProjectsPage, ProjectPage, NewProjectPage, ImportPage, ImportPreviewPage, RunSheetPage, DossierPage, RevisionPage, EditorPage, PagePage, ComparePage, ExportPage, VoicesPage, VoiceNewPage, VoiceDetailPage, ObligationNewPage, SettingsPage, UsagePage, RunReportPage, OutlinePage, OutlinePromotePage, FiguresPanePage, FigureCardPage, VisualizePage, NotFoundPage } from "./pages.js";

// The canonical route manifest (§4.2). The beta uses the `/p/:project` shapes so nothing is thrown away when
// the full IDE arrives. There is deliberately NO /pricing, /plans, /signup or /billing route — the beta is
// private and capped (REQ-BETA-19); AC5 asserts this. `public` marks the routes reachable without a session;
// everything else is auth-gated (redirects to /login).

export interface AppRoute {
  readonly path: string;
  readonly public: boolean;
  readonly element: ReactNode;
}

export const inviteElement = <InvitePage />;
export const loginElement = <LoginPage />;
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
// P1.07 — the palette's free-form obligation form (REQ-OBJ-10).
export const obligationNewElement = <ObligationNewPage />;
// PRB.12 — the Settings privacy toggle + the §14.5 usage glance.
export const settingsElement = <SettingsPage />;
export const usageElement = <UsagePage />;
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
  { path: "/", public: true, element: inviteElement },
  { path: "/invite", public: true, element: inviteElement },
  { path: "/login", public: true, element: loginElement },
  { path: "/app", public: false, element: projectsElement },
  // P1.04 — the new-project sheet (§5.3): ?entry=scratch|outline|draft picks the entry.
  { path: "/app/new", public: false, element: newProjectElement },
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
  // PRB.11 — the export dialog (format choice, the never-blocking obligation line, the AI-use attach
  // toggle + statement preview; §13.4, §8.4, §11.7).
  { path: "/p/:project/export", public: false, element: exportElement },
  // PRB.10 — the voice surface (§9.2–§9.6): the library, the creation sheet, the detail page.
  { path: "/voices", public: false, element: voicesElement },
  { path: "/voices/new", public: false, element: voiceNewElement },
  { path: "/v/:persona", public: false, element: voiceDetailElement },
  // PRB.12 — the privacy toggle (REQ-PROD-15) + the usage glance (§14.5 level 1).
  { path: "/settings", public: false, element: settingsElement },
  { path: "/usage", public: false, element: usageElement },
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
