// SPA.9 — the React IDE chrome (REQ-ISL-9/10/14/15, REQ-NAV-8, REQ-UX-7/8/16, REQ-SEQ-2/11/12).
// The layout every IDE-framed leaf mounts inside: the same `<IdeShell>` DOM the SSR chrome emits
// (manifest vocabulary unchanged — REQ-TST-2 parity), enhanced by `useIdeChromeController` (the
// island's non-document logic) and `useIdeFeed` (the §5.5 SSE tail bound to Query). Surface
// leaves publish their prop bag through `useIdeChromeData` — the seam the SSR `ideContext`
// assembled — and `IdeProjectLayout` mounts the chrome iff the current leaf is IDE-framed AND
// its boot-map verdict is "spa" (SPA.28: the map is static truth now — "ssr" survives only for
// phone `pageMount` and server-owned routes, whose leaves take `SsrHandoff` and never reach
// this layout unframed).

import { useMemo, useRef, type ReactNode } from "react";
import { Outlet, useLocation, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SPA_IDE_FRAMED_ROUTES, spaRouteFor } from "@rhema/contracts";
import { IdeShell } from "@rhema/ui";
import { COPY, IDE_CHROME_LABELS, IDE_FEED_LABELS } from "../../copy.js";
import { getSpaBoot, isSpaEnabled } from "../boot.js";
import { DemoBanner } from "../demo-banner.js";
import { DemoEffects } from "../demo-effects.js";
import { feedLabelsQuery, sessionQuery } from "../queries.js";
import { IdeChromeDataProvider, useIdeChromePublished } from "./chrome-data.js";
import { useIdeChromeController, type IdeChromeNav } from "./controller.js";
import { useIdeFeed } from "./feed.js";

const FRAMED: ReadonlySet<string> = new Set(SPA_IDE_FRAMED_ROUTES);

/**
 * The `p.$project` layout component. Mounts `<IdeChrome>` when the matched leaf is IDE-framed
 * and boot-map "spa"; a bare `<Outlet>` otherwise (a "ssr"-verdict leaf takes `SsrHandoff`;
 * an unframed leaf renders without the chrome). The provider wraps both branches — a leaf
 * publishing into an unframed shell is a no-op.
 */
export function IdeProjectLayout({ project }: { project: string }): ReactNode {
  const pathname = useLocation({ select: (l) => l.pathname });
  const { routeId } = spaRouteFor(pathname);
  const boot = getSpaBoot();
  const demo = boot?.demo ?? null;
  const framed = routeId != null && FRAMED.has(routeId) && isSpaEnabled(boot, routeId);
  return (
    <IdeChromeDataProvider>
      {framed ? (
        <IdeChrome slug={project} banner={demo != null ? <DemoBanner demo={demo} /> : undefined}>
          {/* R7DEM.5 — the write backstop + lazy tour seam mount once per demo document. */}
          {demo != null ? <DemoEffects /> : null}
          <Outlet />
        </IdeChrome>
      ) : (
        <>
          {/* R7DEM.4b — the unframed demo leaves (figures) carry the banner in flow; framed
              leaves receive it through IdeShell's `banner` slot inside `.ide`. */}
          {demo != null ? <DemoBanner demo={demo} /> : null}
          {demo != null ? <DemoEffects /> : null}
          <Outlet />
        </>
      )}
    </IdeChromeDataProvider>
  );
}

/**
 * The chrome itself: skip link (REQ-UX-16 — before the rail, targets `#ide-page`) + the shared
 * shell + the controller/feed effects. `slug` is the route param; the surface-published bag
 * supplies everything else.
 */
export function IdeChrome({ slug, children, banner }: { slug: string; children?: ReactNode; banner?: ReactNode }): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const loc = useLocation();
  const boot = getSpaBoot();
  // R7DEM.4b (R3 P3) — the session read is DISABLED in a demo boot (a `/session` GET is one of
  // the three /login breakers); the demo principal is cosmetic — `userId` reads "demo".
  const demo = boot?.demo != null;
  const session = useQuery({ ...sessionQuery, enabled: !demo });
  const maps = useQuery(feedLabelsQuery);
  const { data, published } = useIdeChromePublished();

  const userId = demo ? "demo" : (session.data?.userId ?? boot?.principal?.userId ?? "local");
  const projectId = data.projectId ?? slug;
  const hasFindings =
    (data.findings?.length ?? 0) > 0 || data.marginBody != null || data.deskFindingsBody != null;

  const nav = useMemo<IdeChromeNav>(() => {
    const searchStr = loc.searchStr
      ? loc.searchStr.startsWith("?")
        ? loc.searchStr
        : `?${loc.searchStr}`
      : "";
    return {
      pathname: loc.pathname,
      searchStr,
      hash: loc.hash,
      push: (href, opts) => {
        // `#finding-x` keeps the current path+search (the island's `location.assign("#x")`).
        const target = href.startsWith("#") ? `${loc.pathname}${searchStr}${href}` : href;
        // `history.push` carries no scroll options — the REQ-NAVC-16 scroll-preserving arms
        // (version stepping, `?triage`) commit through `navigate({href})` instead.
        if (opts?.resetScroll === false) void router.navigate({ href: target, resetScroll: false });
        else router.history.push(target);
      },
      replace: (href, opts) => {
        if (opts?.resetScroll === false) {
          void router.navigate({ href, replace: true, resetScroll: false });
        } else {
          router.history.replace(href);
        }
      },
    };
  }, [router, loc]);

  useIdeChromeController({
    hostRef,
    slug,
    userId,
    projectId,
    hasFindings,
    ready: published,
    ...(data.palette != null ? { palette: data.palette } : {}),
    ...(data.paletteSearchUrl != null ? { paletteSearchUrl: data.paletteSearchUrl } : {}),
    nav,
  });
  useIdeFeed({ hostRef, ...(data.feed != null ? { feed: data.feed } : {}), ...(maps.data != null ? { maps: maps.data } : {}), queryClient });

  const feed =
    data.feed != null && maps.data != null
      ? { ...data.feed, labels: IDE_FEED_LABELS, labelMaps: JSON.stringify(maps.data) }
      : undefined;

  return (
    <>
      <a
        className="ide-skip"
        href="#ide-page"
        data-skip-link
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("ide-page")?.focus();
        }}
      >
        {COPY.ide.skipToPage}
      </a>
      <div ref={hostRef} style={{ display: "contents" }}>
        <IdeShell
          project={{
            slug,
            title: data.projectTitle ?? slug,
            ...(data.projectPill != null ? { pill: data.projectPill } : {}),
          }}
          userId={userId}
          projectId={projectId}
          paperTheme={data.paperTheme ?? boot?.theme?.paperTheme ?? "light"}
          appTheme={data.appTheme ?? boot?.theme?.appTheme ?? "dark"}
          {...(data.initialView != null ? { initialView: data.initialView } : {})}
          {...(data.sourceHref != null ? { sourceHref: data.sourceHref } : {})}
          {...(data.findings != null ? { findings: data.findings, hasFindings: true } : {})}
          {...(data.filesBody != null ? { filesBody: data.filesBody } : {})}
          {...(data.marginBody != null ? { marginBody: data.marginBody } : {})}
          {...(data.deskFindingsBody != null ? { deskFindingsBody: data.deskFindingsBody } : {})}
          {...(data.chatBody != null ? { chatBody: data.chatBody } : {})}
          {...(data.timeline != null ? { timeline: data.timeline } : {})}
          {...(data.timelineView != null
            ? {
                timelineView: data.timelineView,
                ...(data.timelineLabels != null ? { timelineLabels: data.timelineLabels } : {}),
                ...(data.timelineCardLabels != null ? { timelineCardLabels: data.timelineCardLabels } : {}),
                ...(data.timelineHrefs != null ? { timelineHrefs: data.timelineHrefs } : {}),
                ...(data.renderGateCard != null ? { renderGateCard: data.renderGateCard } : {}),
              }
            : {})}
          {...(data.activeRun != null ? { activeRun: data.activeRun } : {})}
          {...(feed != null ? { feed } : {})}
          {...(data.runNextHref != null ? { runNextHref: data.runNextHref } : {})}
          {...(data.palette != null ? { palette: JSON.stringify(data.palette) } : {})}
          paletteSearchUrl={data.paletteSearchUrl ?? `/p/${slug}/palette-search`}
          themeUrl="/ide/theme"
          paperThemeUrl={`/p/${slug}/paper-theme`}
          {...(data.inboxCount != null ? { inboxCount: data.inboxCount } : {})}
          {...(data.status != null ? { status: data.status } : {})}
          {...(banner != null ? { banner } : {})}
          labels={IDE_CHROME_LABELS}
        >
          {children}
        </IdeShell>
      </div>
    </>
  );
}
