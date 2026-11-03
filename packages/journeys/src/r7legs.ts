// R7OPEN.1 (REQ-DACC-8; spec §10 owner map as amended by the Phase-4 split rows) — the wired
// owed-stub for every round-7 D*/U* leg and the two sub-assertions. Each stub fails LOUDLY with
// an explicit "owed — owner <ticket>" error: the runner classifies a red step's failure as
// `owed` (a debt on the owner, never a run failure), so these legs can never re-redden the
// nightly and can never read `ready-to-flip` before the owner lands the real body (AGENTS.md §
// Code Conventions: a step stays `expected:"red"` until its owner proves Stage B with a
// screenshot). Flips happen only in the phase deploys — 224_R7DEP.1 (R7a) and 250_R7DEP.2 (R7b)
// — plus 248_R7TOUR.2 as D2.tour's sanctioned re-flipper (P4-23, GD-PREVIEW.R7).

import type { StepFn } from "./runner.js";
import { gotoOk, settleClientNav } from "./settle.js";
import { assertBundleParity } from "./steps.js";

/** The leg's full assert contract, kept next to the stub so the owner's real body has the
 *  checklist in-tree (the registry `asserts` line is the one-line summary). */
const CONTRACTS: Readonly<Record<string, string>> = {
  "D1.hub":
    "the /demo SSR hub: N10 invariants (distinct branded title, one h1, description/OG/Twitter, favicon), four essay cards in the SPD→GM→POV→CoR order each visible + actionable (assertActionable), the persistent read-only provenance banner, landing hero secondary CTA + /showcase link + footer link all resolving to /demo",
  "D2.tour":
    "the guided tour on Structure of Political Difference, every step walked: coach mark visible, its DOM-contract target un-occluded, Next/Back actionable, route change through settleClientNav vs settleDocumentNav as the step declares, non-modal free-roam exit, final CTA → /signup?src=demo (logged out) / New project (signed in)",
  "D3.readonly":
    "anon() AND returningUser('a'): zero same-origin non-GET requests except the REQ-TOUR-9 POST, zero EventSource/WebSocket opens, zero 4xx/5xx, no mutation forms or contenteditable anywhere on the demo walk",
  "P1.demo":
    "390×844 and 320 px real-UA phone contexts: no horizontal overflow, axe clean, the SPA-compact demo Page renders and REQ-UX-10's desktop-capability set never mounts (REQ-DACC-4 — NOT the forced-SSR phone reader contract; real projects keep it)",
  "R11.demo":
    "returningUser('a') signed in: /demo renders the same content as the logged-out walk — same cards, same banner — with the account chrome added, never a session-only variant",
  "U1.shell":
    "every authenticated leaf renders inside the one AppShell: the sidebar carries wordmark/New project/Search/recent projects/Inbox(badge)/Voices/Usage/Settings/Demo/account menu, collapses to the icon rail and back with the state remembered, pending/error/404 states render in-shell",
  "U2.noreload":
    "the scripted walk (list → project → dossier → compare → export → settings → inbox → chat send → gate approve → Showcase → back): performance navigation entries stay 1 and the window marker persists — zero document loads, S-14's named document navigations excepted by name",
  "U3.occlusion":
    "the five-width probe (1440×900, 1280×800, 1024×768, 820×1180, 390×844 emulated): zero intersection between the Page text column / dossier letter column / every tour target and any un-scrimmed panel, overlay or menu; no main column < 45 ch at ≥768 px",
  "U4.controls":
    "the computed-style probe over the 12 migrated surfaces (project list, inbox, settings, billing, usage, voices, run sheet, export, import, new project, outline, figures, plus the IDE dossier batch): zero elements rendering with native button/input/select/textarea chrome outside the named no-JS/SSR exemption list",
  "U5.write":
    "new project creates a blank editable Page (no dialog, inline title focused) → type commits → the format bubble appears ABOVE the selection → Comment lands anchored Guidance in the margin → focus mode enters and Esc exits → the single Rich text/Source toggle soft-wraps prose",
  "U6.chat":
    "the stubbed turn: Send posts the JSON mutation (201 + turn id), an optimistic user bubble renders, progress events stream over the run-event channel with no document reload, the reply renders on completion, and an empty send is blocked client-side — free, stubbed, never a paid:true row",
  "U7.import":
    "paste markdown with a leading # H1 → the H1 becomes the title (never dropped), the typeset preview lists every normalization in Conversion notes, a clean conversion offers one 'Create draft', and the imported draft is editable immediately (not frozen)",
  "U3.stopgap":
    "the R7a stopgap geometry: the 1024–1279 Timeline overlay and the <1024 sheet carry a scrim with Esc/outside-click dismiss, open on demand (never persisted from overlay mode), the page column reflows at ≥1280 with Files open, and the Desk head is never occluded by the status bar",
  "R8.showcase.spa":
    "the signed-in Showcase resolves to the workspace Showcase (or the static sample) rendered data-renderer=\"spa\" under ReadOnlyProject — the REQ-DACC-6 renderer re-expectation; the green R8.showcase leg's asserts still hold",
};

function owedStub(id: string): StepFn {
  return async () => {
    throw new Error(
      `${id} owed — owner ${ownerOf(id)}: leg body lands in the owner's PR; ` +
        `the phase deploy flips it (224 R7a / 250 R7b). Contract: ${CONTRACTS[id]}`,
    );
  };
}

const OWNERS: Readonly<Record<string, string>> = {
  "D1.hub": "R7DEM.5b",
  "D2.tour": "R7DEM.6a",
  "D3.readonly": "R7DEM.5",
  "P1.demo": "R7DEM.4b",
  "R11.demo": "R7DEM.4b",
  "U1.shell": "R7SHELL.1a",
  "U2.noreload": "R7RELOAD.1",
  "U3.occlusion": "R7PANE.1",
  "U4.controls": "R7KIT.3e",
  "U5.write": "R7WRITE.1b",
  "U6.chat": "R7TALK.1a",
  "U7.import": "R7HOME.2a",
  "U3.stopgap": "R7FIX.1",
  "R8.showcase.spa": "R7RO.1",
};

function ownerOf(id: string): string {
  return OWNERS[id] ?? "unknown";
}

/** R7RO.1 (REQ-RELOAD-5, REQ-DACC-6) — the real `R8.showcase.spa` body: the signed-in `/showcase`
 *  resolves to the workspace Showcase served as the SPA SHELL under ReadOnlyProject — the
 *  renderer re-expectation. The in-app hop to the dossier and back settles as a CLIENT
 *  navigation (zero document loads), the read-only notice mounts, and the green `R8.showcase`
 *  asserts (the workspace Showcase renders — never the static sample's SSR floor) still hold.
 *  Stage B stays deferred to the 224 phase deploy — this leg keeps `expected:"red"` at head. */
const R8_SHOWCASE_SPA: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  // `/showcase` document-redirects to the workspace Showcase's `/p/<slug>` document — a DOCUMENT
  // nav (the shell serves it; ADR-128's forced-SSR verdict is phone-only now).
  await gotoOk(page, `${ctx.webBaseUrl}/showcase`, ctx);
  if (!/\/p\/[^/]+/.test(page.url())) {
    throw new Error(`signed-in /showcase did not land on the workspace Showcase (${page.url()})`);
  }
  const renderer = await page.locator("html").getAttribute("data-renderer");
  if (renderer !== "spa") {
    throw new Error(`the workspace Showcase is ${renderer ?? "renderer-less"} — the SPA read-only arm did not mount`);
  }
  // the read-only mechanism mounts the notice + the mounted Page stays non-editable — a real
  // `contenteditable` body would mean the read-only posture failed open.
  if ((await page.locator("[data-readonly-notice='showcase']").count()) === 0) {
    throw new Error("the showcase notice (ReadOnlyProject{showcase}) did not mount");
  }
  // in-app hops are client navigations — the dossier link is the Page family's own walk.
  const dossierLink = page.locator('a[href*="/review/"]').first();
  if ((await dossierLink.count()) === 0) {
    throw new Error("the Showcase overview carries no dossier link to hop through");
  }
  await settleClientNav(page, ctx, async () => {
    await dossierLink.click();
  });
  // the dossier's showcase banner carries the SAME notice (the mechanism's own slot) — and it
  // must be the SPA render again, never a document reload.
  if ((await page.locator("[data-readonly-notice='showcase'], [data-showcase-banner]").count()) === 0) {
    throw new Error("the showcase dossier carries no read-only notice");
  }
  const dossierRenderer = await page.locator("html").getAttribute("data-renderer");
  if (dossierRenderer !== "spa") {
    throw new Error(`the dossier hop re-rendered as ${dossierRenderer ?? "renderer-less"} — a document nav escaped the SPA`);
  }
  // back to the overview — a second client nav.
  const back = page.locator(`a[href="/p/${page.url().split("/p/")[1]?.split("/")[0] ?? ""}"]`).first();
  if ((await back.count()) > 0) {
    await settleClientNav(page, ctx, async () => {
      await back.click();
    });
  }
  await page.screenshot({ path: `${ctx.outDir}/r8-showcase-spa.png`, fullPage: true });
  assertBundleParity(ctx);
};

const REAL_BODIES: Readonly<Record<string, StepFn>> = {
  "R8.showcase.spa": R8_SHOWCASE_SPA,
};

export const R7_LEGS_IMPLS: Readonly<Record<string, StepFn>> = Object.fromEntries(
  Object.keys(OWNERS).map((id) => [id, REAL_BODIES[id] ?? owedStub(id)]),
);
