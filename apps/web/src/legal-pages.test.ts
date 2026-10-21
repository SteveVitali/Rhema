import { describe, it, expect } from "vitest";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";
import {
  LEGAL_DETAIL_KEYS,
  LEGAL_DETAILS,
  LEGAL_PAGES,
  LEGAL_PLACEHOLDER_RE,
  REFUND_WINDOW_DAYS,
  USER_REFUNDABLE_RUN_STATES,
  legalApprovalViolations,
  legalPlaceholdersFor,
} from "@rhema/contracts";
import { COPY } from "./copy.js";
import { LEGAL_COPY_KEY } from "./legal.js";

// R6LGL.1 (REQ-LCH-1; GD-LEGAL.R6 / GD-LEGAL-DETAILS.R6; ADR-118) — the legal/trust documents'
// contract: five public SSR routes, the shared legal footer on every public page, the
// `approved ⇒ no placeholder remains` invariant, and the placeholder↔approved coupling the
// HUMAN-H11 flip will rely on. Driven through `createWebApp` + `app.request` like
// server.test.ts (no network).

/** A legal page needs no dataSource calls — the deps carry a session oracle for the
 *  "signed-in reader still gets the document" leg. */
function makeDeps(session: WebDeps["session"] = () => null): WebDeps {
  return {
    dataSource: { checkSession: async () => true } as unknown as DataSource,
    session,
  };
}

const PUBLIC_PATHS = ["/", "/invite", "/pricing", "/signup", "/login", "/showcase"] as const;

/** Every ⟦KEY⟧ token across one page's lede + sections, as (key, occurrence) pairs. */
function pagePlaceholderKeys(routeId: keyof typeof LEGAL_COPY_KEY): string[] {
  const copy = COPY.legal[LEGAL_COPY_KEY[routeId]];
  const text = [copy.lede, ...copy.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join("\n");
  return [...text.matchAll(LEGAL_PLACEHOLDER_RE)].map((m) => m[1]!);
}

describe("the five legal/trust routes (REQ-LCH-1)", () => {
  const app = createWebApp(makeDeps());

  it("every census row serves a 200 SSR document carrying its own data-route + hooks", async () => {
    for (const page of LEGAL_PAGES) {
      const res = await app.request(page.routeId);
      expect(res.status, page.routeId).toBe(200);
      const html = await res.text();
      // the settle/renderer vocabulary every SSR document stamps (REQ-VFY-3)
      expect(html, page.routeId).toContain('data-renderer="ssr"');
      expect(html, page.routeId).toContain(`data-route="${page.routeId}"`);
      expect(html, page.routeId).toContain("data-nav-count=\"0\"");
      // the page's own hooks (dom-contract `public` rows)
      expect(html, page.routeId).toContain(`data-legal-page="${page.routeId}"`);
      // "&" renders escaped — the expected title is the HTML-encoded form.
      const titleHtml = page.title.replace(/&/g, "&amp;");
      expect(html, page.routeId).toContain(`<title>${titleHtml} · Rhēma</title>`);
      expect(html, page.routeId).toContain(`<h1`);
      expect(html, page.routeId).toContain(`>${titleHtml}<`);
    }
  });

  it("a signed-in reader still gets the document — legal pages never redirect to /app", async () => {
    const authed = createWebApp(
      makeDeps(() => ({ cookie: "__Host-rhema.session_token=tok.sig" })),
    );
    for (const page of LEGAL_PAGES) {
      const res = await authed.request(page.routeId);
      expect(res.status, page.routeId).toBe(200);
      expect(await res.text(), page.routeId).toContain(`data-legal-page="${page.routeId}"`);
    }
  });

  it("every page renders the draft banner + marks while approved:false rides LEGAL_PAGES", async () => {
    for (const page of LEGAL_PAGES) {
      const html = await (await app.request(page.routeId)).text();
      if (page.approved) {
        expect(html).not.toContain("data-legal-draft");
      } else {
        expect(html, page.routeId).toContain("data-legal-draft");
        // HTML-escaping: assert the escape-free prefix, not the apostrophe-bearing tail.
        expect(html, page.routeId).toContain(
          COPY.legal.draftBanner.split("'")[0]!.replace(/[<>&"']/g, ""),
        );
        expect(html, page.routeId).toContain("Draft — the operator has not yet approved");
      }
    }
  });

  it("the footer nav links all five documents on every legal page", async () => {
    for (const page of LEGAL_PAGES) {
      const html = await (await app.request(page.routeId)).text();
      expect(html, page.routeId).toContain("data-legal-nav");
      for (const link of LEGAL_PAGES) {
        expect(html, page.routeId).toContain(`href="${link.routeId}"`);
        expect(html, page.routeId).toContain(`>${link.navLabel}<`);
      }
    }
  });
});

describe("the legal footer on every public page (REQ-LCH-1)", () => {
  const app = createWebApp(makeDeps());
  for (const path of PUBLIC_PATHS) {
    it(`${path} carries the five legal links in its footer`, async () => {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      const html = await res.text();
      const footer = html.slice(html.indexOf("<footer"));
      expect(footer, path).toContain("data-legal-nav");
      for (const link of LEGAL_PAGES) expect(footer, `${path} → ${link.routeId}`).toContain(`href="${link.routeId}"`);
    });
  }
});

describe("the approved ⇐ no-placeholder invariant (GD-LEGAL.R6 / -DETAILS.R6)", () => {
  it("fails if any page ships approved:true while a placeholder remains", () => {
    // THE check GATE-LAUNCH relies on: a true flag with unfilled details is a violation — and
    // the shipped set carries zero violations only because every row is approved:false.
    expect(legalApprovalViolations(LEGAL_PAGES)).toEqual([]);
    for (const page of LEGAL_PAGES) {
      if (!page.approved) continue;
      expect(legalPlaceholdersFor(page), `${page.routeId} approved with placeholders`).toEqual([]);
    }
  });

  it("every page's declared details are exactly the keys its text references", () => {
    for (const page of LEGAL_PAGES) {
      const referenced = new Set(pagePlaceholderKeys(page.routeId));
      // every declared detail appears in the text; every ⟦KEY⟧ token in the text is declared
      expect(new Set(page.details), page.routeId).toEqual(referenced);
      for (const k of referenced) {
        expect(LEGAL_DETAIL_KEYS as readonly string[], `${page.routeId} ⟦${k}⟧`).toContain(k);
      }
    }
  });

  it("the rendered page marks exactly the unfilled ⟦KEY⟧ occurrences", async () => {
    const app = createWebApp(makeDeps());
    for (const page of LEGAL_PAGES) {
      const html = await (await app.request(page.routeId)).text();
      const expected = pagePlaceholderKeys(page.routeId).filter(
        (k) => LEGAL_DETAILS[k as keyof typeof LEGAL_DETAILS] == null,
      ).length;
      const marks = html.match(/data-legal-placeholder/g)?.length ?? 0;
      expect(marks, `${page.routeId} placeholder marks`).toBe(expected);
      // while everything is unfilled (GD-LEGAL-DETAILS.R6) the ⟦KEY⟧ tokens are visible
      if (!page.approved) expect(html, page.routeId).toContain("⟦");
    }
  });

  it("the privacy page's training posture is the §14.7 Settings › Data sentence verbatim", () => {
    // Single-source pin: the privacy page must restate the shipped posture word-for-word.
    const paragraph = COPY.legal.privacy.sections
      .find((s) => s.heading === "What happens to your words")!
      .paragraphs.join("\n");
    expect(paragraph).toContain(COPY.settings.trainingPosture);
  });
});

// R6MNY.1 (REQ-LCH-5c) — the refund-policy copy must match the §14.4 math ADR-071 encodes. Every
// figure the page states is asserted against its contract constant — a hand-edited window or
// allowance fails here, and a constants change that forgets the copy fails too.
describe("the refund-policy copy matches the §14.4 math (REQ-LCH-5c)", () => {
  const text = [
    COPY.legal.refunds.lede,
    ...COPY.legal.refunds.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
  ].join("\n");

  it("the ask-window figure is REFUND_WINDOW_DAYS — never a typed literal", () => {
    // §14.4/ADR-071: the user window is `REFUND_WINDOW_DAYS` days anchored at runs.ended_at; the
    // copy must carry exactly that derived figure, no other day count.
    expect(text).toContain(`within ${REFUND_WINDOW_DAYS} days`);
    const otherDays = [...text.matchAll(/(\d+)\s*days/g)]
      .map((m) => m[1]!)
      .filter((d) => d !== String(REFUND_WINDOW_DAYS));
    expect(otherDays, `stale day figure(s): ${otherDays}`).toEqual([]);
  });

  it("the quarterly allowance reads 'one refund per quarter' — the auto_allowance rule", () => {
    // §14.4: one automatic refund per billing account per UTC calendar quarter; the copy must
    // not promise more (or fewer) than the window grants.
    expect(text).toMatch(/one refund per quarter/i);
    expect(text).not.toMatch(/\b(?:two|three|unlimited)\b[^.]*refund/i);
  });

  it("the charge model matches the hold/commit semantics — hold at cap, debits as phases complete", () => {
    expect(text).toContain("estimate and a cap before it starts");
    expect(text).toMatch(/holds the cap/i);
    expect(text).toMatch(/debit/i);
    // the hard invariant: a run can never cost more than the cap (Σ debits − refunds ≤ cap).
    expect(text).toMatch(/not charged for the excess/i);
  });

  it("the refundable classes are the §14.4 ones — failed/cancelled-by-us refund, user-stop pays partials", () => {
    // `failed` stays OUT of the user's window (platform-fault class, USER_REFUNDABLE_RUN_STATES);
    // the copy attributes failed/refused/platform-cancelled refunds to the platform paths, and a
    // user-cancelled run refunds through the window.
    expect(USER_REFUNDABLE_RUN_STATES).not.toContain("failed");
    expect(text).toMatch(/fails, is refused, or is cancelled by us/i);
    expect(text).toMatch(/stop a run yourself, you pay for the completed phases/i);
  });

  it("refunds restore credits — the copy promises no card reversal the code never performs", () => {
    expect(text).toMatch(/restore credits to your Rh[eē]ma balance/i);
    // card-charge errors route to contact, never a promised automatic Stripe reversal.
    expect(text).toMatch(/card charge itself is incorrect/i);
  });
});
