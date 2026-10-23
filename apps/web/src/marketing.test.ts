import { describe, it, expect, vi } from "vitest";
import type { ProjectRow } from "@rhema/api-client";
import { buildPricingPageData, HERO_HEADLINE } from "@rhema/contracts";
import { surfacePricer } from "@rhema/run-sheet";
import { createWebApp, type WebDeps, type AuthOutcome } from "./server.js";
import type { DataSource, SignupIntent } from "./data.js";

// P1.17 — the public funnel surfaces, driven via Hono's app.request with an in-memory DataSource:
//   §15.1  the landing's twelve sections in v0.3 order + the locked hero + the drop-zone hold affordance
//   §15.2  /pricing renders ONLY derived figures (the test recomputes from PRICING — a hand-edited
//          rendered number fails)
//   §15.3  /signup carries the intent (entry/src/held); the OAuth redirect threads ?held=1&entry=;
//          /app precedence: a carried file beats the Showcase-first default
//   §15.4  the unopened-only-child Showcase opens on finding 1; otherwise it is just a row

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_pv",
    slug: "the-politics-of-visibility",
    title: "The Politics of Visibility",
    state: { key: "edited_by_you", pill: "Edited by you", overlay: null, suggested: { action: "revise_using_edits", label: "Revise using your edits" } },
  },
];

const SHOWCASE_ROW: ProjectRow = {
  id: "prj_showcase",
  slug: "showcase",
  title: "Showcase — a worked example",
  showcase: true,
  state: { key: "edited_by_you", pill: "Edited by you", overlay: null, suggested: { action: "none", label: null } },
} as ProjectRow;

const SHOWCASE_ENTRY = {
  showcase: {
    slug: "showcase",
    projectId: "prj_showcase",
    reviewRunId: "run_sc",
    firstFindingId: "f_1",
    opened: false,
    archived: false,
  },
  intent: null,
};

function makeDeps(over: Partial<WebDeps> = {}, dsOver: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => PROJECTS,
      checkInvite: async (code) => (code === "GOOD" ? { ok: true } : { ok: false, reason: "unknown" }),
      signup: async () => ({ ok: true as const, created: true }),
      getBillingBalance: async () => ({ spendableCredits: 100, suspended: false, clawbackDebt: 0 }),
      ...dsOver,
    } as DataSource,
    session: () => null,
    ...over,
  };
}

const form = (fields: Record<string, string>) => ({
  body: new URLSearchParams(fields).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded" },
});

describe("§15.1 — the landing page", () => {
  it("renders the twelve sections in the v0.3 order with the locked hero headline", async () => {
    const res = await createWebApp(makeDeps()).request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(HERO_HEADLINE);
    const order = [...html.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([
      "hero", "dossier", "workflow", "seat", "voices", "runs",
      "models", "proof", "pricing", "changelog", "faq", "final-cta",
    ]);
    // dark-default theme, no flash (data-theme stamped on the SSR root)
    expect(html).toContain('data-theme="dark"');
    // the drop-zone hold affordance + its island
    expect(html).toContain("data-dropzone");
    expect(html).toContain("/assets/landing.js");
    // the landing is static SSR — no reveal/motion scaffolding to over-run the ≤200ms budget
    expect(html).not.toContain("data-reveal");
  });

  it("the landing's pricing teaser derives its figure (the Essay card's Review range)", async () => {
    const html = await (await createWebApp(makeDeps()).request("/")).text();
    const data = buildPricingPageData(undefined, surfacePricer());
    const card = data.cards[0]!;
    const review = card.rows.find((r) => r.key === "review")!;
    expect(html).toContain(`${review.range.low.toLocaleString("en-US")} – ${review.range.high.toLocaleString("en-US")}`);
  });
});

describe("§15.2 — /pricing renders only derived figures", () => {
  it("monthly ladder + cost cards + matrix + FAQ all read from PRICING", async () => {
    const res = await createWebApp(makeDeps()).request("/pricing");
    expect(res.status).toBe(200);
    const html = await res.text();
    const data = buildPricingPageData(undefined, surfacePricer());
    for (const p of data.plans) {
      // the card head renders `>$40<span>/mo` (the unit is a span) — the contiguous `$x/mo`
      // string lives in the matrix's "Price (monthly)" row instead.
      expect(html).toContain(`>$${p.monthlyUsd}<`);
      if (p.tier !== "free") {
        expect(html).toContain(`$${p.monthlyUsd}${p.perSeat ? "/seat" : ""}/mo`);
      }
    }
    // the Essay card leads (the §15.2 ordering rule) and every figure is a range
    const firstCard = html.indexOf('data-cost-card="');
    const essayIdx = data.cards[0]!.key;
    expect(html.slice(firstCard)).toContain(`data-cost-card="${essayIdx}"`);
    expect(html.indexOf(`data-cost-card="${essayIdx}"`)).toBe(firstCard);
    const card = data.cards[0]!;
    for (const row of card.rows) {
      expect(html).toContain(`${row.range.low.toLocaleString("en-US")} – ${row.range.high.toLocaleString("en-US")}`);
    }
    // the FAQ's 8,000-word figure is the computed one
    expect(html).toContain(data.faq[0]!.q);
    // top-up packs render from the publication
    for (const t of data.topUpPacks) expect(html).toContain(`$${t.usd}`);
  });

  it("the annual cycle shows the 15% saving in dollars on each paid card", async () => {
    const res = await createWebApp(makeDeps()).request("/pricing?cycle=annual");
    const html = await res.text();
    const data = buildPricingPageData(undefined, surfacePricer());
    const writer = data.plans.find((p) => p.tier === "writer")!;
    expect(html).toContain(`>$${writer.annualMonthlyUsd}<`);
    expect(html).toContain(`Save $${writer.annualSavingsUsdPerYear}/yr`);
    // monthly prices are gone from the CARD HEADS under the annual cycle — the matrix's
    // "Price (monthly)" row still lists them by design, so scope the check to the cards.
    const cardsRegion = html.slice(0, html.indexOf("Price (monthly)"));
    expect(cardsRegion).not.toContain(`>$${writer.monthlyUsd}<`);
  });
});

describe("§15.3 — signup intent + the precedence redirect", () => {
  it("GET /signup renders the intent-carrying form (?entry=draft&src=hero&held=1)", async () => {
    const res = await createWebApp(makeDeps()).request("/signup?entry=draft&src=hero&held=1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="entry" value="draft"');
    expect(html).toContain('name="src" value="hero"');
    expect(html).toContain('name="held" value="1"');
    expect(html).toContain("Your held file is ready");
  });

  it("POST /signup persists {entry,src,held} into the api intent and threads the auth callback's next", async () => {
    const calls: SignupIntent[] = [];
    const signup: DataSource["signup"] = async (req) => {
      calls.push(req.intent ?? {});
      return { ok: true as const, created: true };
    };
    const beginAuth = vi.fn(async (method: string) =>
      (method === "google" ? { redirect: "/auth/google/start" } : { sent: true }) as AuthOutcome,
    );
    const app = createWebApp(makeDeps({ beginAuth, signupMode: "open" }, { signup }));

    // magic_link: the account admission call carries the intent into the api's POST /signup
    const sent = await app.request("/signup", {
      method: "POST",
      ...form({ email: "a@b.com", method: "magic_link", entry: "draft", src: "hero", held: "1" }),
    });
    expect(sent.status).toBe(200);
    expect(calls).toEqual([{ entry: "draft", src: "hero", held: true }]);

    // google: no account exists to persist onto yet — the intent rides the callbackURL's `next`
    // (/app's ?entry&held&src fallback applies the precedence on landing).
    const res = await app.request("/signup", {
      method: "POST",
      ...form({ email: "a@b.com", method: "google", entry: "draft", src: "hero", held: "1" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/google/start");
    const next = (beginAuth.mock.calls.at(-1)?.[1] as { next?: string }).next ?? "";
    expect(next).toContain("entry=draft");
    expect(next).toContain("held=1");
  });

  it("/app precedence — an unopened only-child Showcase deep-links to finding 1", async () => {
    const deps = makeDeps(
      { session: () => ({}) },
      {
        listProjects: async () => [SHOWCASE_ROW],
        getShowcaseEntry: async () => SHOWCASE_ENTRY,
      },
    );
    const res = await createWebApp(deps).request("/app");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/showcase/review/run_sc#finding-f_1");
  });

  it("/app precedence — a carried-file intent (draft/outline) wins over the Showcase", async () => {
    const deps = makeDeps(
      { session: () => ({}) },
      {
        listProjects: async () => [SHOWCASE_ROW],
        getShowcaseEntry: async () => ({ ...SHOWCASE_ENTRY, intent: { entry: "draft" as const, held: true } }),
      },
    );
    const res = await createWebApp(deps).request("/app");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app/new?entry=draft&held=1");
  });

  it("/app precedence — the auth-redirect query is the fallback source (?entry=outline&held=1)", async () => {
    const deps = makeDeps(
      { session: () => ({}) },
      {
        listProjects: async () => [SHOWCASE_ROW],
        getShowcaseEntry: async () => ({ ...SHOWCASE_ENTRY, intent: null }),
      },
    );
    const res = await createWebApp(deps).request("/app?entry=outline&held=1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app/new?entry=outline&held=1");
  });

  it("/app precedence — an opened or archived Showcase is just a row (no redirect)", async () => {
    const deps = makeDeps(
      { session: () => ({}) },
      {
        listProjects: async () => [SHOWCASE_ROW],
        getShowcaseEntry: async () => ({
          showcase: { ...SHOWCASE_ENTRY.showcase, opened: true },
          intent: null,
        }),
      },
    );
    const res = await createWebApp(deps).request("/app");
    expect(res.status).toBe(200);
    // SPA.27 — the list is leaf paint now; the surviving contract is NO redirect to the Showcase
    // walkthrough + the shell mount (the row itself rides the /bff/app list).
    expect(await res.text()).toContain('id="spa-root"');
    const twin = await (await createWebApp(deps).request("/bff/app")).json() as { rows: { slug: string; title: string }[] };
    expect(twin.rows.map((r) => r.title)).toContain("Showcase — a worked example");
  });

  it("GET /app?verified=1 mints email.verified through the acquisition channel", async () => {
    const events: { event: string; props?: Record<string, unknown> }[] = [];
    const deps = makeDeps(
      { session: () => ({}) },
      {
        postAcquisitionEvent: async (_s, req) => {
          events.push(req as { event: string });
          return { ok: true, recorded: true };
        },
      } as Partial<DataSource>,
    );
    const res = await createWebApp(deps).request("/app?verified=1");
    expect(res.status).toBe(200);
    // fire-and-forget — give the void promise a tick
    await new Promise((r) => setTimeout(r, 20));
    expect(events.some((e) => e.event === "email.verified")).toBe(true);
  });
});

// UX.1 (ADR-062) — the public /showcase route: signed-out renders the static sample; signed-in
// resolves to the workspace's own Showcase (never another tenant's); a signed-in account with no
// Showcase gets the static sample with app-flavored chrome.
describe("UX.1 — GET /showcase", () => {
  it("signed-out renders the static read-only sample dossier with its own document meta", async () => {
    const res = await createWebApp(makeDeps()).request("/showcase");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<title>Showcase · Rhēma</title>");
    expect(html).toContain("The Extinction of Man");
    expect(html).toContain('meta name="description"');
    expect(html.match(/<h1[\s>]/g)!.length).toBe(1);
    expect(html).not.toContain("private beta");
  });

  it("signed-in with a Showcase project 302s onto the dossier (the showcase artifact)", async () => {
    const deps = makeDeps(
      { session: () => ({}) },
      { getShowcaseEntry: async () => SHOWCASE_ENTRY },
    );
    const res = await createWebApp(deps).request("/showcase", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/showcase/review/run_sc");
  });

  it("signed-in with a Showcase that has no review run yet lands on the project page", async () => {
    const deps = makeDeps(
      { session: () => ({}) },
      {
        getShowcaseEntry: async () => ({
          showcase: { ...SHOWCASE_ENTRY.showcase, reviewRunId: null },
          intent: null,
        }),
      },
    );
    const res = await createWebApp(deps).request("/showcase", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/showcase");
  });

  it("signed-in with NO Showcase entry renders the static sample with app-flavored chrome — never a 404", async () => {
    const deps = makeDeps(
      { session: () => ({}) },
      { getShowcaseEntry: async () => ({ showcase: null, intent: null }) },
    );
    const res = await createWebApp(deps).request("/showcase");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("The Extinction of Man");
  });
});
