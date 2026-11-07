// R7RO.1 (REQ-DWEB-14; spec §3.3 S-3, RV-19) — the read-only mechanism's census. The ticket's
// rule: under `demo`/`showcase` every write control on the census is hidden or disabled BEFORE
// any request, with a reason tooltip; under `run_lock` the doc-write family withholds while the
// run's own lifecycle controls (comments→Guidance, gates, decisions, Cancel) stay live — a
// waiting gate still holds its lock, so withholding them would deadlock the run. And the ONE
// notice per reason mounts in the page header area.
//
// A listed affordance that renders ENABLED under a reason fails the table — that is the
// removal-detecting pin the ticket asks for.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COPY } from "./copy.js";
import { readSpaBoot, setSpaBoot, getSpaBoot } from "./spa/boot.js";
import {
  readOnlyProjectFor,
  ReadOnlyNotice,
} from "./spa/read-only.js";
import { gateCardFor } from "./gate-card.js";
import { findingControlsFor } from "./dossier-view.js";
import { DecisionsList, PageEditor, PageStrip, VersionRail } from "@rhema/ui";
import { pageLabels, railLabels } from "./page-chrome.js";
import type { GateCardDto } from "@rhema/api-client";

describe("R7RO.1 — the ReadOnlyProject carrier + derive", () => {
  it("the twin fact wins; the boot slot is slug-scoped; unknowns never assert", () => {
    const boot = {
      theme: {},
      deviceClass: "desktop" as const,
      surfaces: {},
      project: { slug: "demo-project" },
      readOnlyProject: { reason: "showcase" as const },
    };
    // twin carrier beats the boot slot on the same project.
    expect(
      readOnlyProjectFor(boot, { project: { slug: "demo-project", readOnlyProject: { reason: "run_lock" } } }),
    ).toEqual({ reason: "run_lock" });
    // the boot slot applies only to the slug that served the shell — an in-app hop to another
    // project never inherits a stale stamp.
    expect(
      readOnlyProjectFor(boot, { project: { slug: "other-project", readOnlyProject: null } }),
    ).toBeNull();
    expect(
      readOnlyProjectFor(boot, { project: { slug: "demo-project", readOnlyProject: null } }),
    ).toEqual({ reason: "showcase" });
    // a route-param caller (the beforeLoad handoff guard) scopes by slug the same way.
    expect(readOnlyProjectFor(boot, null, "demo-project")).toEqual({ reason: "showcase" });
    expect(readOnlyProjectFor(boot, null, "other-project")).toBeNull();
    expect(readOnlyProjectFor(null, null)).toBeNull();
    expect(readOnlyProjectFor(boot, { project: { readOnlyProject: { reason: "frozen" } as never } })).toBeNull();
  });

  it("the boot parser carries readOnlyProject verbatim and fails closed", () => {
    const doc = document.implementation.createHTMLDocument("boot");
    const el = doc.createElement("script");
    el.setAttribute("type", "application/json");
    el.setAttribute("data-spa-boot", "true");
    el.textContent = JSON.stringify({
      deviceClass: "desktop",
      surfaces: {},
      readOnlyProject: { reason: "demo" },
    });
    doc.body.appendChild(el);
    expect(readSpaBoot(doc)?.readOnlyProject).toEqual({ reason: "demo" });
    el.textContent = JSON.stringify({ deviceClass: "desktop", surfaces: {}, readOnlyProject: { reason: "frozen" } });
    expect(readSpaBoot(doc)?.readOnlyProject).toBeUndefined();
  });
});

describe("R7RO.1 — one notice per reason, in the page header area", () => {
  it("demo carries the spec's sentence verbatim", () => {
    const { container } = render(<ReadOnlyNotice reason="demo" />);
    const notice = container.querySelector("[data-readonly-notice='demo']");
    expect(notice).not.toBeNull();
    // the notice is an ARIA `note` — screen readers announce it as a comment aside.
    expect(container.querySelector('[role="note"]')).toBe(notice);
    expect(notice?.textContent).toContain(
      "A read-only demo of a real essay's editorial record. Start your own project to use these tools.",
    );
  });

  it("showcase carries the existing banner copy + a styled primary Duplicate button", () => {
    const { container } = render(<ReadOnlyNotice reason="showcase" slug="demo-project" />);
    const notice = container.querySelector("[data-readonly-notice='showcase']");
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain(COPY.showcase.bannerTitle);
    expect(notice?.textContent).toContain("read-only");
    const cta = container.querySelector("button[data-readonly-duplicate]") as HTMLButtonElement;
    expect(cta).not.toBeNull();
    expect(cta.disabled).toBe(false);
    expect(cta.closest("form")?.getAttribute("action")).toBe("/p/demo-project/duplicate");
    // C10 — the button is styled (filled primary), not a bare native button.
    const style = cta.getAttribute("style") ?? "";
    expect(style).toContain("background");
  });

  it("run_lock renders nothing — the Page's §5.4 lock banner IS the notice", () => {
    const { container } = render(<ReadOnlyNotice reason="run_lock" />);
    expect(container.querySelector("[data-readonly-notice]")).toBeNull();
  });
});

// -------------------------------------------------------------------------------------------------------------------
// The write-control census — REQ-DWEB-14's per-affordance table. `reason: any` rows withhold under
// demo/showcase/run_lock; `reason: "run_lock-keeps"` rows stay live under run_lock only.
// -------------------------------------------------------------------------------------------------------------------

const GATE: GateCardDto = {
  id: "gate_1",
  runId: "run_9",
  kind: "approve_triage",
  workflow: "revise",
  openedAt: "2026-09-16T10:00:00Z",
  pausedWhileReading: false,
  held: false,
  blocking: true,
  onExpiry: "wait",
  spentCredits: 120,
  capCredits: 840,
};

describe("R7RO.1 — the write-control census withholds before any request", () => {
  beforeEach(() => {
    setSpaBoot(null);
  });
  afterEach(() => cleanup());

  it("gate cards: demo/showcase → disabled fieldset + reason tooltip (run_lock is never fed)", () => {
    const { container } = render(
      <>{gateCardFor(GATE, "demo-project", false, undefined, { readOnlyTitle: COPY.readOnly.reason.showcase })}</>,
    );
    const fieldset = container.querySelector("fieldset[disabled]") as HTMLElement | null;
    expect(fieldset).not.toBeNull();
    expect(fieldset?.getAttribute("title")).toBe(COPY.readOnly.reason.showcase);
    // the card renders (read stays) but its decide form is inside the disabled fieldset.
    expect(fieldset?.querySelector("[data-gate-card]")).not.toBeNull();
    expect(fieldset?.querySelector('form[action="/p/demo-project/gates/gate_1"]')).not.toBeNull();
    // without the flag the form posts (control arm).
    const live = renderToStaticMarkup(gateCardFor(GATE, "demo-project", false));
    expect(live).not.toContain("<fieldset");
  });

  it("DecisionsList: disabledTitle ⇒ every answer button disabled + tooltip, never a submit", () => {
    const { container } = render(
      <DecisionsList
        items={[{ id: "dcr_1", projectId: "p", obligationId: "o", text: "Escalated finding.", options: ["decide", "dismiss"], createdAt: null }]}
        formActionFor={(id) => `/p/demo-project/decisions/${id}`}
        labels={{ heading: "Decisions", emptyLabel: "Nothing pending", optionLabel: (o) => o }}
        disabledTitle={COPY.readOnly.reason.demo}
      />,
    );
    const buttons = container.querySelectorAll("[data-decision-option]");
    expect(buttons.length).toBe(2);
    for (const b of buttons) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute("title")).toBe(COPY.readOnly.reason.demo);
      expect(b.getAttribute("type")).toBe("button");
    }
  });

  it("PageStrip: proposals + Revise disable under any reason; the note form follows the reason", () => {
    // R7WRITE.1a — the proposals/banners live in the header strip (`PageStrip`); the note form
    // stays in `PageEditor` inside `.paper`. This test renders both halves of the surface.
    const stripBase = {
      crumbs: [{ label: "Demo", href: "/p/demo-project" }, { label: "Page" }],
      draftN: 1,
      baseDraftN: null,
      origin: "human_revision" as const,
      state: "open",
      lock: null,
      proposals: [
        {
          id: "prop_1",
          label: "Swap it",
          description: "d",
          markdown: "m",
          kind: "replace" as const,
          from: 0,
          to: 0,
          origin: "agent:x",
        },
      ],
      reviseUrl: "/p/demo-project/edit/d_1/revise",
      cancelUrl: "/p/demo-project/edit/d_1/cancel-run",
      labels: pageLabels,
      stripLabels: {
        breadcrumbAria: "Breadcrumb",
        separator: "›",
        workingBadge: "working",
        frozenBadge: "frozen",
        runLabel: "Run",
        moreLabel: "More actions",
      },
    };
    const editorBase = {
      docJson: { type: "doc", content: [] },
      docUrl: "/p/demo-project/edit/d_1/doc",
      draftId: "d_1",
      draftN: 1,
      markdown: "x",
      sha256: "s",
      findings: [],
      provenance: null,
      proposals: [],
      origin: "human_revision" as const,
      versionLabel: "v1",
      versionNote: "",
      danglingCites: [],
      labels: pageLabels,
    };
    // showcase: proposals disabled w/ tooltip; the version banner — Revise included — is withheld
    // entirely (page.readOnly posture); the note form is withheld too.
    const { container } = render(
      <>
        <PageStrip {...stripBase} readOnly readOnlyReason="showcase" readOnlyTooltip={COPY.readOnly.reason.showcase} />
        <PageEditor {...editorBase} readOnly readOnlyReason="showcase" readOnlyTooltip={COPY.readOnly.reason.showcase} />
      </>,
    );
    for (const hook of ["data-proposal-accept", "data-proposal-reject"]) {
      const b = container.querySelector(`[${hook}]`) as HTMLButtonElement | null;
      expect(b, hook).not.toBeNull();
      expect(b?.disabled).toBe(true);
      expect(b?.getAttribute("title")).toBe(COPY.readOnly.reason.showcase);
    }
    expect(container.querySelector('form[action="/p/demo-project/edit/d_1/revise"]')).toBeNull();
    expect(container.textContent).not.toContain("Revise using your edits");
    expect(container.querySelector('form[action="/p/demo-project/edit/d_1/note"]')).toBeNull();
    // the read-only banner is emitted (it IS the version-posture line).
    expect(container.querySelector("[data-page-banner='readonly']")).not.toBeNull();
  });

  it("the Page under run_lock keeps comments + Cancel (DS §5.4) while Revise withholds", () => {
    const { container } = render(
      <>
        <PageStrip
          crumbs={[{ label: "Demo", href: "/p/demo-project" }, { label: "Page" }]}
          draftN={1}
          baseDraftN={0}
          origin="human_revision"
          state="open"
          lock={{ runId: "run_1", kind: "reader", workflow: "review" }}
          proposals={[]}
          reviseUrl="/p/demo-project/edit/d_1/revise"
          cancelUrl="/p/demo-project/edit/d_1/cancel-run"
          labels={pageLabels}
          stripLabels={{
            breadcrumbAria: "Breadcrumb",
            separator: "›",
            workingBadge: "working",
            frozenBadge: "frozen",
            runLabel: "Run",
            moreLabel: "More actions",
          }}
          readOnlyReason="run_lock"
          readOnlyTooltip={COPY.readOnly.reason.run_lock}
        />
        <PageEditor
          docJson={{ type: "doc", content: [] }}
          docUrl="/p/demo-project/edit/d_1/doc"
          noteUrl="/p/demo-project/edit/d_1/note"
          draftId="d_1"
          draftN={1}
          markdown="x"
          sha256="s"
          findings={[]}
          provenance={null}
          proposals={[]}
          origin="human_revision"
          baseDraftN={0}
          versionLabel="v1"
          versionNote=""
          danglingCites={[]}
          labels={pageLabels}
          lock={{ runId: "run_1", kind: "reader", workflow: "review" }}
          readOnlyReason="run_lock"
          readOnlyTooltip={COPY.readOnly.reason.run_lock}
        />
      </>,
    );
    // §5.4: the lock banner + Cancel-run exit stay; the note field stays (comments are live).
    expect(container.querySelector("[data-page-banner='lock']")).not.toBeNull();
    expect(container.querySelector('form[action="/p/demo-project/edit/d_1/note"]')).not.toBeNull();
    expect(container.textContent).toContain("Cancel run to edit");
    // but the Revise verb is a doc write — disabled with the reason tooltip before any request.
    const revise = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Revise using your edits") as HTMLButtonElement | undefined;
    expect(revise?.disabled).toBe(true);
    expect(revise?.getAttribute("title")).toBe(COPY.readOnly.reason.run_lock);
  });

  it("VersionRail: no restoreAction ⇒ the apply button renders disabled + tooltip", () => {
    const { container } = render(
      <VersionRail
        versions={[]}
        currentN={1}
        labels={railLabels}
        hrefs={{ version: () => "#", diff: () => "#", restorePreview: () => "#" }}
        restore={{
          points: [],
          disabledTitle: COPY.readOnly.reason.showcase,
          preview: {
            point: { id: "rp_1", label: "auto", createdAt: "t", wordCount: 1, kind: "auto" },
            view: { strip: { totals: { moves: 0, unlinked: 0, rebutted: 0 }, label: "v0 → v1" }, moves: [], unlinked: { hunks: [], entries: [] }, rebutted: [] },
          },
        }}
      />,
    );
    const apply = container.querySelector("[data-restore-apply]") as HTMLButtonElement | null;
    expect(apply).not.toBeNull();
    expect(apply?.disabled).toBe(true);
    expect(apply?.getAttribute("title")).toBe(COPY.readOnly.reason.showcase);
    expect(apply?.closest("form")).toBeNull();
  });

  it("dossier finding controls: opts.readOnly ⇒ a tooltip'd marker, never the apply/disposition forms", () => {
    const view = {
      id: "f_1",
      ordinal: 1,
      title: "A finding.",
      severity: "major",
      kind: "evidence",
      status: "open",
      dispositions: [],
      applyCandidates: [{ nodeId: "n_1" }],
      canApply: true,
      canDismiss: true,
    } as never;
    const { container } = render(
      <>{findingControlsFor(view, "demo-project", "run_1", false, undefined, { hasObligation: false, readOnly: COPY.readOnly.reason.showcase })}</>,
    );
    const marker = container.querySelector("[data-readonly-controls='f_1']");
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute("title")).toBe(COPY.readOnly.reason.showcase);
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("R7RO.1 — request recorder: no non-GET is ever issued from a withheld control", () => {
  beforeEach(() => {
    setSpaBoot(null);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("clicks/submits on withheld census controls fire zero requests", async () => {
    const calls: { method: string; url: string }[] = [];
    const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ method: init?.method ?? "GET", url });
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", spy);
    const user = userEvent.setup();

    const { container } = render(
      <>
        {gateCardFor(GATE, "demo-project", false, undefined, { readOnlyTitle: COPY.readOnly.reason.showcase })}
        <DecisionsList
          items={[{ id: "dcr_1", projectId: "p", obligationId: "o", text: "Escalated finding.", options: ["decide", "dismiss"], createdAt: null }]}
          formActionFor={(id) => `/p/demo-project/decisions/${id}`}
          labels={{ heading: "Decisions", emptyLabel: "Nothing pending", optionLabel: (o) => o }}
          disabledTitle={COPY.readOnly.reason.showcase}
        />
      </>,
    );

    // every census control a user could reach — disabled or inside the disabled fieldset.
    const controls = Array.from(container.querySelectorAll("button")).filter((b) => b.closest("fieldset[disabled]") || b.disabled);
    expect(controls.length).toBeGreaterThan(0);
    for (const b of controls) {
      await user.click(b as HTMLElement);
    }
    // also try a programmatic submit on the gate form inside the disabled fieldset — the
    // fieldset withholds it; the surface's own submit handler never sees a send.
    const form = container.querySelector("form");
    if (form) {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
    const nonGet = calls.filter((c) => c.method !== "GET");
    expect(nonGet, `expected zero non-GET requests, got ${JSON.stringify(nonGet)}`).toEqual([]);
    expect(getSpaBoot()).toBeNull();
  });
});

// -------------------------------------------------------------------------------------------------------------------
// The code-level census pins — the affordances whose DOM mount needs a live twin get a source pin
// instead (removal-detecting, same as renderer-overrides.test.ts): delete the withhold and the
// scan fails. Each row names the site's file + the withhold marker that must exist.
// -------------------------------------------------------------------------------------------------------------------

describe("R7RO.1 — the source-level census pins every remaining write affordance", () => {
  const pins: { file: string; pattern: RegExp; affordance: string }[] = [
    { file: "src/spa/surfaces/run-report.tsx", pattern: /roTip == null \? \(\s*<form[^]*data-refund-form/, affordance: "run-report refund form" },
    { file: "src/spa/surfaces/dossier.tsx", pattern: /readOnly: roTip|readOnlyTitle=\{roTip\}/, affordance: "dossier surfaces + timeline gate card" },
    { file: "src/spa/surfaces/editor.tsx", pattern: /commentFormAction/, affordance: "hunk-comment forms (kept only under run_lock)" },
    { file: "src/spa/surfaces/editor.tsx", pattern: /readOnlyReason: ro\.reason/, affordance: "Page/rail doc-write family" },
    { file: "src/chat-pane.tsx", pattern: /readOnlyTitle/, affordance: "chat composer + pane writes" },
    { file: "src/page-chrome.tsx", pattern: /withhold = props\.readOnly === "demo" \|\| props\.readOnly === "showcase"/, affordance: "overview rename/actions/approvals/voice/gates/decisions" },
    { file: "src/spa/page-mount.tsx", pattern: /if \(wire == null\) return;/, affordance: "⌘S restore-point mint without a wire" },
    { file: "src/spa/routes/_authenticated/p.$project.index.tsx", pattern: /readOnlyProjectFor\(context\.boot, null, params\.project\)/, affordance: "the loader's concurrent handoff POST (REQ-SPEED-1)" },
  ];
  const root = join(process.cwd(), "apps/web");
  for (const { file, pattern, affordance } of pins) {
    it(`the ${affordance} consults the read-only withhold`, () => {
      const text = readFileSync(join(root, file), "utf8");
      expect(pattern.test(text), `${affordance} lost its read-only withhold in ${file}`).toBe(true);
    });
  }
});
