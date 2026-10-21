// SPA.4 (REQ-BND-8) — `docMetaFor` extracted out of render.tsx into a browser-safe leaf so the SPA's
// client head manager produces the SAME `<title>`/`description` strings the SSR document stamps
// (doc/22's head-parity contract; the titles here are the verbatim render.tsx table, moved not
// re-derived). Browser-safe by construction: the only import is the pure COPY table — no
// react-dom/server, no page-data, no node builtins — so tsconfig.spa compiles this file unchanged.
// `data` is the STRUCTURAL slice docMetaFor reads (project title + voice persona name); the SSR
// caller passes the full PageData, the SPA passes its boot/loader fields.

import { COPY } from "./copy.js";
import { legalPageFor, type LegalRouteId } from "@rhema/contracts";

/** R6LGL.1 — the legal documents' meta descriptions, keyed by census routeId. */
const LEGAL_META: Record<LegalRouteId, string> = {
  "/terms": COPY.meta.terms,
  "/privacy": COPY.meta.privacy,
  "/refunds": COPY.meta.refunds,
  "/acceptable-use": COPY.meta.acceptableUse,
  "/contact": COPY.meta.contact,
};

/** The slice of the page read the title table consults — `PageData` satisfies it structurally. */
export interface DocMetaData {
  readonly project?: { readonly title?: string | null } | null;
  readonly voice?: {
    readonly detail?: {
      readonly persona?: { readonly display_name?: string | null } | null;
    } | null;
  } | null;
}

// UX.1 — route-aware document meta: every route gets a distinct `<page> · Rhēma` title; public
// routes additionally carry meta description + Open Graph + Twitter tags (REQ-SPEC-2 vocabulary;
// descriptions live in copy.ts so the one public-string lint covers them). Project surfaces prefix
// the project title.
export const SITE = "Rhēma";
const pageTitle = (page: string): string => `${page} · ${SITE}`;

/** The §14.7 settings section → title word (a section the nav hides still gets its own title). */
const SETTINGS_TITLES: Record<string, string> = {
  account: "Account",
  preferences: "Preferences",
  notifications: "Notifications",
  integrations: "Integrations",
  billing: "Billing",
  data: "Your data",
  team: "Team",
};

/** The title/metadoc convention shared by the SSR document, the SPA shell, and the SPA head manager. */
export function docMetaFor(pathname: string, data: DocMetaData = {}): {
  title: string;
  description?: string;
} {
  const p = (pathname.replace(/\/+$/, "") || "/").split("?")[0]!;
  // ---- public routes (signed-out reachable; description + social tags) ----
  if (p === "/") return { title: `${SITE} — ${COPY.tagline}`, description: COPY.meta.landing };
  if (p === "/invite") return { title: pageTitle("Welcome"), description: COPY.meta.landing };
  if (p === "/pricing") return { title: pageTitle("Pricing"), description: COPY.meta.pricing };
  if (p === "/signup") return { title: pageTitle("Create your account"), description: COPY.meta.signup };
  if (p === "/login") return { title: pageTitle("Sign in"), description: COPY.meta.signIn };
  if (p === "/showcase") return { title: pageTitle("Showcase"), description: COPY.meta.showcase };
  // R6LGL.1 (REQ-LCH-1) — the legal/trust documents (public SSR; the title is the census row's
  // verbatim so `<title>`, the footer label, and the page <h1> can never drift).
  const legal = legalPageFor(p);
  if (legal) return { title: pageTitle(legal.title), description: LEGAL_META[legal.routeId] };
  // ---- authenticated app routes ----
  if (p === "/app") return { title: pageTitle("Projects") };
  if (p === "/app/new") return { title: pageTitle("New project") };
  if (p === "/app/inbox") return { title: pageTitle("Inbox") };
  if (p === "/usage") return { title: pageTitle("Usage") };
  if (p === "/billing/return" || p === "/settings/billing" || p === "/app/settings/billing") {
    return { title: pageTitle("Billing") };
  }
  if (p === "/voices") return { title: pageTitle("Voices") };
  if (p === "/voices/new") return { title: pageTitle("New voice") };
  const settings = /^\/(?:app\/)?settings(?:\/([a-z]+))?$/.exec(p);
  if (settings) return { title: pageTitle(SETTINGS_TITLES[settings[1] ?? ""] ?? "Settings") };
  const persona = /^\/v\/([^/]+)$/.exec(p);
  if (persona) return { title: pageTitle(data.voice?.detail?.persona?.display_name ?? "Voice") };
  // ---- project surfaces — "/p/<slug>/…" — the project title prefixes when the read carried it ----
  const pt = data.project?.title;
  const inProject = (page: string): string => (pt ? `${page} — ${pt} · ${SITE}` : pageTitle(page));
  const pm = /^\/p\/[^/]+(?:\/(.+))?$/.exec(p);
  if (pm) {
    const sub = pm[1] ?? "";
    if (sub === "") return { title: pt ? `${pt} · ${SITE}` : pageTitle("Project") };
    if (sub === "import") return { title: inProject("Import") };
    if (sub === "run") return { title: inProject("Run") };
    if (/^review\//.test(sub)) return { title: inProject("Dossier") };
    if (/^r\//.test(sub)) return { title: inProject("Run report") };
    if (/^revisions\//.test(sub)) return { title: inProject("Revision") };
    if (/^edit\//.test(sub)) return { title: inProject("Edit") };
    if (sub === "outline") return { title: inProject("Outline") };
    if (sub === "outline/promote") return { title: inProject("Promote outline") };
    if (sub === "figures") return { title: inProject("Figures") };
    if (/^figures\//.test(sub)) return { title: inProject("Figure") };
    if (sub === "visualize") return { title: inProject("Visualize") };
    if (sub === "obligations/new") return { title: inProject("New obligation") };
    if (sub === "settings") return { title: inProject("Project settings") };
    if (sub === "export") return { title: inProject("Export") };
    if (sub === "usage") return { title: inProject("Usage") };
    if (/^v\/[^/]+\/diff\//.test(sub)) return { title: inProject("Compare") };
    if (/^[va]\//.test(sub)) return { title: inProject("Page") };
    if (sub === "voice/reseed") return { title: inProject("Voice") };
    return { title: pt ? `${pt} · ${SITE}` : pageTitle("Project") };
  }
  return { title: pageTitle("Not found") };
}
