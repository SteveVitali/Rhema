// 243a_R7KIT.3e (REQ-GUARD-1, REQ-DACC-7) — the shared `U4.controls` computed-style probe.
// The deployed leg (r7legs.ts `U4_CONTROLS`) walks the 12 migrated surfaces under
// `returningUser('a')`; the Stage-A local test (u4-controls.local.test.ts) calls the SAME
// `u4ProbePage` over the surfaces a local build can serve — one probe body, one source of truth.
//
// What the probe catches: any VISIBLE `button|input|select|textarea` that is neither (a) a kit
// primitive carrier (an element whose own class carries `ui-*`/`cmdk-*`, or a Radix hidden form
// carrier), nor (b) inside one of the named no-JS/SSR exemption containers from
// tools/eslint-plugin-rhema/rules/no-raw-controls-exemptions.js. The failure report carries the
// element's computed-style signature (radius/appearance/background) so a native-chrome finding is
// inspectable evidence, not a selector-count claim.

import type { Page } from "playwright";

/** One probed surface: the route the leg walks and the named exemption containers on it. */
export interface U4Surface {
  readonly id: string;
  /** the deployed path — `:p`/`:runId` placeholders resolve from the returningUser project. */
  readonly path: string;
  /**
   * CSS selectors naming the DOM containers that hold the file's NAMED no-JS/SSR exemptions
   * (mirrors the lint-level {file, component} list — an exempt control lives inside one of
   * these). Controls matching `[type=hidden]`, `aria-hidden` carriers, or disabled task marks
   * are globally skipped regardless of surface.
   */
  readonly exempt?: readonly string[];
}

/**
 * REQ-DACC-7 — the 12 migrated surfaces, one per KIT-3 batch surface plus the IDE Page, the
 * right panel and the dossier (the new-project/import flow shares the `/app/new` sheet).
 * The path grammar names the SURFACE; the deployed leg resolves concrete values per project.
 */
export const U4_SURFACES: readonly U4Surface[] = [
  { id: "project-list", path: "/app" },
  { id: "inbox", path: "/app/inbox" },
  // batch a — the approvals/guidance forms on the settings card post natively (PolicyRadio /
  // OverrideSelect / HiddenField), so the whole no-JS form is the named container.
  {
    id: "settings",
    path: "/app/settings",
    exempt: ['form[action*="/settings/approvals"]', 'form[action*="/guidance"]'],
  },
  { id: "billing", path: "/app/settings/billing" },
  { id: "usage", path: "/app/usage" },
  { id: "voices", path: "/app/voices" },
  { id: "new-project", path: "/app/new" },
  // the IDE Page + the right panel — the gate card's native arm (GateCheck/GateSelect), the
  // findings filter bar (FilterSelect) and the document's task marks are the named natives.
  {
    id: "ide-page-panel",
    path: "/p/:p",
    exempt: [
      "[data-gate-card]",
      "[data-findings-filters] select",
      "input[type='checkbox'][disabled][readonly]",
      ".ide-palette input",
    ],
  },
  // batch b — the run sheet's whole form is the named no-JS fallback (RunSheet/RunButton/AskButton);
  // a Radix control is inert without client JS on the document GET.
  { id: "run-sheet", path: "/p/:p/run", exempt: ["form[data-run-sheet]"] },
  { id: "export", path: "/p/:p/export" },
  // batch c2 — outline + figures ride the same sheet family; figures' rows keep the migrated kit.
  { id: "outline-figures", path: "/p/:p/outline" },
  // batch d — the dossier: the findings live in the right panel's Findings tab; the bulk preview's
  // `only[]` carriers (BulkOnlyCheck) are the named natives.
  { id: "dossier", path: "/p/:p/review/:runId", exempt: ["[data-bulk-preview] input[type='checkbox']"] },
];

const CONTROL_SEL = "button, input, select, textarea";

export interface U4NativeFinding {
  readonly tag: string;
  readonly name: string | null;
  readonly type: string | null;
  readonly snippet: string;
  /** the computed-style signature that makes the chrome inspectable. */
  readonly signature: string;
}

/**
 * The per-page probe: zero elements rendering as native-styled controls outside the named
 * exemption list. Returns the violations (empty = pass) so the caller throws with context —
 * the same shape u3ProbePage uses.
 */
export async function u4ProbePage(page: Page, surface?: U4Surface): Promise<U4NativeFinding[]> {
  const exempt = surface?.exempt ?? [];
  return page.evaluate(
    ({ controlSel, exemptSel }) => {
      const findings: U4NativeFinding[] = [];
      const inExempt = (el: Element): boolean =>
        exemptSel.some((sel) => el.matches(sel) || el.closest(sel) != null);
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(controlSel))) {
        // (0) invisible / hidden carriers — Radix BubbleSelect + command carriers render real
        // elements that never paint; the probe only governs rendered chrome.
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || el.hidden) continue;
        if (
          el.getAttribute("type") === "hidden" ||
          el.getAttribute("aria-hidden") === "true" ||
          el.closest('[aria-hidden="true"]') != null
        ) {
          continue;
        }
        // (1) a kit primitive carrier — every 225/225a primitive stamps a `ui-*` class on the
        // rendered element; the cmdk palette input carries its `cmdk-*` attribute.
        const cls = typeof el.className === "string" ? el.className : "";
        const isPrimitive =
          /\bui-/.test(cls) ||
          Array.from(el.attributes).some((a) => a.name.startsWith("cmdk-"));
        if (isPrimitive) continue;
        // (2) the named no-JS/SSR exemption containers for this surface.
        if (inExempt(el)) continue;
        // (3) document-content marks — the page editor's task markers are disabled+readOnly
        // native checkboxes (TaskMark, a named exemption) even when a container selector missed.
        if (
          el.tagName === "INPUT" &&
          el.getAttribute("type") === "checkbox" &&
          el.hasAttribute("disabled") &&
          el.hasAttribute("readonly")
        ) {
          continue;
        }
        findings.push({
          tag: el.tagName.toLowerCase(),
          name: el.getAttribute("name"),
          type: el.getAttribute("type"),
          snippet: el.outerHTML.slice(0, 160),
          signature: `radius=${cs.borderTopLeftRadius} appearance=${cs.appearance} bg=${cs.backgroundColor} color=${cs.color}`,
        });
      }
      return findings;
    },
    { controlSel: CONTROL_SEL, exemptSel: exempt },
  );
}

/** Throws the leg-style error when the probe found native-styled controls. */
export function assertU4Clean(where: string, findings: readonly U4NativeFinding[]): void {
  if (findings.length === 0) return;
  const lines = findings.map(
    (f) => `  <${f.tag} name=${f.name ?? "-"} type=${f.type ?? "-"}> ${f.signature} — ${f.snippet}`,
  );
  throw new Error(
    `U4.controls — ${findings.length} native-styled control(s) on ${where}:\n${lines.join("\n")}`,
  );
}
