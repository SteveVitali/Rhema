// NAVC.1 (REQ-NAVM-1/2/3/4/6/8; post-spa-disposition spec §2) — the delegated same-origin
// click interceptor. ONE bubble-phase `click` listener on `document`, installed by
// `mountSpa` — NEVER `createSpaRouter` (that keeps the router-direct dom suites
// un-intercepted, and interception is a mount contract, not a router-construction one).
//
// The §2.1 ordered pipeline is normative verbatim — guard order is the contract:
//   closest("a[href]") → e.defaultPrevented → button!==0 → modifier keys →
//   contenteditable ancestor → target (absent-or-"_self" — Link parity, O2-F21) /
//   download / data-spa-native → new URL origin test (fail closed) → hash-only
//   same-path+same-search skip (native fragment nav — MUST NOT re-fire beforeLoad) →
//   router.getMatchedRoutes(pathname) in-tree (with the `**` predicate) →
//   RELOAD_STUB_IDS membership → preventDefault + router.navigate({href}).
//
// Rulings: clicks always push (doc-nav parity — the interceptor never emits `replace`);
// `resetScroll` is never overridden (router defaults + `scrollRestoration` own it);
// `e.isTrusted` is never checked (synthesized `.click()`s are ordinary activations);
// interception is unconditional once in-tree — no boot `surfaces`/`deviceClass`/
// `twinForcesSsr`/`spaRouteFor` consult (leaf pipelines own every renderer verdict,
// REQ-NAVM-6 — a device pre-check would skip the `postProjectHandoff` beforeLoad POST).

import type { AnyRouter } from "@tanstack/react-router";
import { demoInternalPath, isDemoNamespacePath } from "@rhema/contracts";
import { getSpaBoot } from "./boot.js";
import { navigateDocument } from "./dom.js";

/**
 * REQ-NAVM-4 — the server-owned redirect GETs, matched by GENERATED route id (the full
 * `/_authenticated/` prefix — routeTree.gen.ts:804/818/825). Their `beforeLoad` throws a
 * `reloadDocument` redirect; the interceptor short-circuits them straight to
 * `navigateDocument` so the server's canonical 302 answers without a client commit first.
 * `spaRouteFor` is NEVER consulted here — its prefix fallback would misclassify
 * `/settings` and `/app/settings` (client redirects that resolve in-router) into doc-navs.
 */
export const RELOAD_STUB_IDS: ReadonlySet<string> = new Set([
  "/_authenticated/app/usage/r/$runId",
  "/_authenticated/p/$project/edit/$draftId",
  "/_authenticated/p/$project/f/$fid",
]);

/**
 * The §2.1 pipeline — one delegated bubble-phase handler. Exported so the guard-table
 * suite can drive it directly; production reaches it only through
 * `installSpaClickInterceptor`.
 */
export function handleSpaClick(e: MouseEvent, router: AnyRouter): void {
  // 1. resolve the anchor the click lands inside (any depth — spans/icons inside <a>).
  const target = e.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a[href]");
  if (anchor == null) return;

  // 2. a handler below us already claimed the event (e.g. the onboarding entry cards'
  //    preventDefault + router.navigate — delegated interception is a no-op there).
  if (e.defaultPrevented) return;

  // 3. primary-button activations only.
  if (e.button !== 0) return;

  // 4. modifier chords mean a new browsing context (new tab/window) — never intercept.
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;

  // 5. anchors inside a contenteditable region are editing-surface content (PM link
  //    marks) — the editor owns their click semantics. `contenteditable="false"`
  //    islands inside an editable host keep native/link behavior.
  const editableHost = anchor.closest("[contenteditable]");
  if (editableHost != null && editableHost.getAttribute("contenteditable") !== "false") return;

  // 6. `target` absent-or-`_self` (Link parity), `download`, and the explicit opt-out
  //    hook `data-spa-native` (REQ-NAVM-8 — the three non-document GETs carry it).
  const anchorTarget = anchor.getAttribute("target");
  if (anchorTarget != null && anchorTarget !== "_self") return;
  if (anchor.hasAttribute("download")) return;
  if (anchor.hasAttribute("data-spa-native")) return;

  // 7. same-origin URL parse — FAIL CLOSED: a malformed href, a foreign origin, an
  //    opaque-origin scheme (`javascript:`/`data:`/`mailto:`), or a protocol-relative
  //    external URL all stay native.
  let url: URL;
  try {
    url = new URL(anchor.getAttribute("href") ?? "", window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;

  // 8. hash-only same-path+same-search → native fragment navigation. Intercepting would
  //    re-fire `beforeLoad`+loaders for what the platform handles as a same-document
  //    scroll; `#report`/`#finding-*`/`#` must stay native (A1-F8).
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash !== window.location.hash
  ) {
    return;
  }

  // 8b. the S-14 demo boundary (R7DEM.4b; REQ-DWEB-11/16) — crossing the demo namespace is a
  //     DOCUMENT navigation BY PREDICATE, whichever side it originates on: an href into
  //     `/demo*` or `/p/demo~*` from a non-demo boot must load a fresh document (the demo
  //     never shares the workspace QueryClient), and a non-demo href inside a demo boot is
  //     an exit (the demo QueryClient never carries into the workspace). Prefix-scoped —
  //     an unregistered `demo~zzz` still counts as demo-space so the server's terminal 404
  //     answers it. Entry links may additionally carry `data-spa-native` (step 6), but the
  //     predicate stands alone so NO entry link can slip the boundary.
  const demoHref = isDemoNamespacePath(url.pathname);
  if ((getSpaBoot()?.demo != null) !== demoHref) return;

  // 9. in-tree test — the router's own matcher ONLY (`spaRouteFor` is never consulted:
  //    REQ-NAVC-7, its prefix fallback misclaims non-document GETs). The `**` predicate
  //    mirrors router-core's own not-found rule (`matchRoutesInternal`): a fuzzy match
  //    leaves the unmatched remainder in `rawParams["**"]` (`/p/:p/export/ai-use/md`
  //    fuzzy-matches `/p/$project/export` with `**="ai-use/md"` — NOT in-tree → the
  //    download survives). The `foundRoute.path === "/"` exception is the index-route
  //    case (e.g. `/p/$project/`); a `null` foundRoute never intercepts.
  // R7DEM.4b — `getMatchedRoutes` is rewrite-agnostic (R3 P7's open question, answered): it
  // matches the RAW pathname, so a public-form `/demo/<essay>/…` href is in-tree-tested in its
  // input-rewritten internal form (`/p/demo~<essay>/…`). `router.navigate({href})` below still
  // receives the original href — `buildLocation` applies the input rewrite itself.
  const [, rawParams, foundRoute] = router.getMatchedRoutes(
    demoInternalPath(url.pathname) ?? url.pathname,
  );
  if (foundRoute == null || (foundRoute.path !== "/" && rawParams["**"] != null)) return;

  // 10. the three server-owned redirect stubs short-circuit to a document navigation —
  //    the server's canonical 302 answers, matched by generated route id (REQ-NAVM-4).
  //    preventDefault keeps the anchor's own nav suppressed so the seam is the sole
  //    initiator.
  const href = url.pathname + url.search + url.hash;
  e.preventDefault();
  if (RELOAD_STUB_IDS.has(foundRoute.id)) {
    navigateDocument(href);
    return;
  }

  // 11. the intercepted commit — push-only (REQ-NAVM-3); `pathname+search+hash` verbatim
  //     (REQ-NAVC-12). `resetScroll`/`hashScrollIntoView`/`viewTransition` are never
  //     overridden — router defaults + scrollRestoration own them (O2-F22).
  // R7FIX.2 — the identical-location arm: `router.navigate` dedupes an href equal to the
  //     current location into a silent `load()` (router-core `isSameLocation` — compared
  //     against `latestLocation.href`, the same value used here), which commits NO transition —
  //     the click dies after `preventDefault` (a dead self-link: 224's `R8.showcase.spa` owed on
  //     exactly this — the run card's "Dossier" link on the dossier itself). Native semantics
  //     are a reload; the SPA's in-document twin is a committed same-location transition —
  //     `history.push` mints the new location key `data-nav-count` counts, and the route's
  //     loaders revalidate. Any OTHER href still goes through `router.navigate`.
  if (href === router.latestLocation.href) {
    router.history.push(href);
    return;
  }
  void router.navigate({ href });
}

/**
 * Install the interceptor — one bubble-phase listener on `document`. Called by
 * `mountSpa` (never by `createSpaRouter`). Returns the disposer; the SPA root lives for
 * the document's lifetime so production never calls it, but tests do.
 */
export function installSpaClickInterceptor(router: AnyRouter): () => void {
  const onClick = (e: MouseEvent): void => handleSpaClick(e, router);
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
