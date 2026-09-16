import type { ReactNode } from "react";
import { matchRoutes } from "react-router";
import { InvitePage, LoginPage, ProjectsPage, ProjectPage, ImportPage, ImportPreviewPage, RunSheetPage, DossierPage, RevisionPage, NotFoundPage } from "./pages.js";

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
export const importElement = <ImportPage />;
export const importPreviewElement = <ImportPreviewPage />;
export const runSheetElement = <RunSheetPage />;
export const dossierElement = <DossierPage />;
export const revisionElement = <RevisionPage />;
export const notFoundElement = <NotFoundPage />;

export const routes: readonly AppRoute[] = [
  { path: "/", public: true, element: inviteElement },
  { path: "/invite", public: true, element: inviteElement },
  { path: "/login", public: true, element: loginElement },
  { path: "/app", public: false, element: projectsElement },
  { path: "/p/:project", public: false, element: projectElement },
  { path: "/p/:project/import", public: false, element: importElement },
  { path: "/p/:project/run", public: false, element: runSheetElement },
  { path: "/p/:project/review/:runId", public: false, element: dossierElement },
  { path: "/p/:project/revisions/:cid", public: false, element: revisionElement },
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
