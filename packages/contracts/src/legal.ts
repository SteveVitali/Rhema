// R6LGL.1 (REQ-LCH-1; GD-LEGAL.R6 "Agent drafts, you approve" + GD-LEGAL-DETAILS.R6
// "Placeholders now"; ADR-118) — the legal/trust pages' flag + placeholder census of record.
//
// THE OWNED SHARED DECISION (the ticket owns it; GATE-LAUNCH + R6CNT.2 consume it):
//   • `LEGAL_PAGES` — one row per public legal document: `routeId` (== its `data-route` /
//     `spaRouteFor` id and its `SPA_PUBLIC_ROUTES`/`SPA_DOCUMENT_ROUTES` census entry), the
//     display `title`, the footer `navLabel`, the committed `approved` flag, and `details` —
//     the `LEGAL_DETAILS` keys the page's drafted text references.
//   • `LEGAL_DETAILS` — the operator-fill slots (GD-LEGAL-DETAILS.R6): `null` ⇒ the page
//     renders a clearly-marked `⟦KEY⟧` placeholder; a string ⇒ R6CNT.2 has filled it with
//     the HUMAN-H11-recorded value.
//   • `approved` flips to `true` only when the operator approves the page's text verbatim
//     (GD-LEGAL.R6) AND every detail it references is filled. GATE-LAUNCH reads
//     "REQ-LCH-1 `approved: true` on every page" from this table; `legalApprovalViolations`
//     is the machine check that an approved page can never still carry a placeholder —
//     the web's legal tests + `check:dom-contract` pin it at CI.
//
// Browser-safe by construction: pure data + pure functions, no imports — the SSR renderer,
// the SPA stubs and any gate tooling all read the same table.

/** The operator-fill detail slots (GD-LEGAL-DETAILS.R6). */
export const LEGAL_DETAIL_KEYS = [
  "OPERATING_ENTITY",
  "GOVERNING_LAW",
  "CONTACT_EMAIL",
  "CONTACT_ADDRESS",
] as const;
export type LegalDetailKey = (typeof LEGAL_DETAIL_KEYS)[number];

/**
 * The operator-fill values — filled verbatim by R6CNT.2 from HUMAN-H11's recorded A1 values
 * (entity "Rhema Labs", jurisdiction "NY, NY", contact "contact@rhema.tools"). A `null`
 * detail renders its `⟦KEY⟧` placeholder mark on every page that references it.
 * `CONTACT_ADDRESS` stays `null` — the operator recorded no postal address and the generated
 * copy no longer references the slot (the approval covers the generated text; an unregistered
 * trade name has no registered-agent address to state). If the operator later supplies a
 * postal address, fill the slot AND re-add it to a page's `details` + copy in the same diff.
 */
export const LEGAL_DETAILS: Record<LegalDetailKey, string | null> = {
  OPERATING_ENTITY: "Rhema Labs",
  GOVERNING_LAW: "NY, NY",
  CONTACT_EMAIL: "contact@rhema.tools",
  CONTACT_ADDRESS: null,
};

/** The human-readable label a placeholder mark carries (the `⟦KEY⟧` text is the key itself). */
export const LEGAL_DETAIL_LABELS: Record<LegalDetailKey, string> = {
  OPERATING_ENTITY: "the operating entity",
  GOVERNING_LAW: "the governing-law jurisdiction",
  CONTACT_EMAIL: "the contact email",
  CONTACT_ADDRESS: "the contact address",
};

export type LegalRouteId = "/terms" | "/privacy" | "/refunds" | "/acceptable-use" | "/contact";

export interface LegalPageRow {
  /** The route id — the served path, the census id, and the emitted `data-route`. */
  readonly routeId: LegalRouteId;
  /** The document title (SSR `<title>` + page `<h1>`). */
  readonly title: string;
  /** The footer link's short label. */
  readonly navLabel: string;
  /**
   * The REQ-LCH-1 flag — `false` until the operator approves the page's text verbatim
   * (GD-LEGAL.R6). GATE-LAUNCH requires `true` on every row. A `true` row with a detail
   * still unfilled is a defect `legalApprovalViolations` (and CI) flags.
   */
  readonly approved: boolean;
  /** The `LEGAL_DETAILS` keys the page's drafted text references. */
  readonly details: readonly LegalDetailKey[];
}

/** The five legal/trust documents (REQ-LCH-1) — every row `approved: true` under HUMAN-H11's
 *  recorded A1 pre-approval ("I pre-approve whatever text you generate now", 2026-10-23): the
 *  generated text IS the approved text, and every referenced detail is filled. */
export const LEGAL_PAGES: readonly LegalPageRow[] = [
  {
    routeId: "/terms",
    title: "Terms of Service",
    navLabel: "Terms",
    approved: true,
    details: ["OPERATING_ENTITY", "GOVERNING_LAW", "CONTACT_EMAIL"],
  },
  {
    routeId: "/privacy",
    title: "Privacy Policy",
    navLabel: "Privacy",
    approved: true,
    details: ["OPERATING_ENTITY", "CONTACT_EMAIL"],
  },
  {
    routeId: "/refunds",
    title: "Refund Policy",
    navLabel: "Refunds",
    approved: true,
    details: ["OPERATING_ENTITY", "CONTACT_EMAIL"],
  },
  {
    routeId: "/acceptable-use",
    title: "Acceptable Use Policy",
    navLabel: "Acceptable use",
    approved: true,
    details: ["OPERATING_ENTITY", "CONTACT_EMAIL"],
  },
  {
    routeId: "/contact",
    title: "Contact & Support",
    navLabel: "Contact",
    approved: true,
    details: ["OPERATING_ENTITY", "CONTACT_EMAIL"],
  },
];

/** The route ids in census order (footer enumeration + server registration). */
export const LEGAL_ROUTE_IDS: readonly LegalRouteId[] = LEGAL_PAGES.map((p) => p.routeId);

/** The placeholder-token grammar inside legal copy: `⟦KEY⟧` (matching a LEGAL_DETAIL_KEYS name). */
export const LEGAL_PLACEHOLDER_RE = /⟦([A-Z][A-Z0-9_]*)⟧/g;

/** The page row for a path, or undefined for a non-legal path. */
export function legalPageFor(routeId: string): LegalPageRow | undefined {
  return LEGAL_PAGES.find((p) => p.routeId === routeId);
}

/**
 * The detail keys a page still renders as placeholders — its referenced keys whose
 * `LEGAL_DETAILS` slot is still `null`.
 */
export function legalPlaceholdersFor(page: LegalPageRow): readonly LegalDetailKey[] {
  return page.details.filter((k) => LEGAL_DETAILS[k] == null);
}

/**
 * The REQ-LCH-1 invariant, machine-readable: every page with `approved: true` whose
 * placeholders are not all filled is a violation. GATE-LAUNCH's "approved on every page"
 * read + the web tests + CI consume this — a `true` flag can never ride remaining
 * placeholders.
 */
export function legalApprovalViolations(
  pages: readonly LegalPageRow[] = LEGAL_PAGES,
): readonly { routeId: LegalRouteId; unfilled: readonly LegalDetailKey[] }[] {
  return pages
    .filter((p) => p.approved)
    .map((p) => ({ routeId: p.routeId, unfilled: legalPlaceholdersFor(p) }))
    .filter((v) => v.unfilled.length > 0);
}
