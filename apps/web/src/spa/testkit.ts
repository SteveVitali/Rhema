// apps/web/src/spa/testkit.ts — the SPA.7 component-test substrate (REQ-VFY-1/2/6, REQ-TST-2/6/10;
// design/27 F2). Two helpers every per-surface parity spec consumes:
//
//   expectManifestEmission(markupOrEl, entries) — "the parity spec mounts the component, asserts
//       the manifest's required hooks are present". Entries come straight from DOM_CONTRACT /
//       hooksForSurface(surface) so the test is manifest-driven, not a second selector list.
//   axeCheck(el) — component-level axe for the manifest's INTERACTIVE subset. happy-dom has no
//       real layout/canvas, so the layout-dependent rules the design names (color-contrast) are
//       disabled; journey axe stays the authoritative WCAG 2.2 AA gate (REQ-VFY-6).
//
// The file holds no literal data-* selector strings (the lint scans src/spa: every hook literal
// must resolve to the manifest) — hooks always arrive via DomContractEntry values.

import { expect } from "vitest";
import axe from "axe-core";
import type { DomContractEntry, DomContractSurface } from "../dom-contract.js";
import { hooksForSurface } from "../dom-contract.js";

/**
 * Interactive manifest subset for component-level axe (design/27: "the manifest's interactive
 * components — the approval cards, chat composer, palette, menus"). Each token is itself a
 * manifest `attr` hook; the spec asserts `AXE_INTERACTIVE ⊆ manifest` so the subset can't drift.
 */
export const AXE_INTERACTIVE = [
  "data-gate-card",
  "data-chat-composer",
  "data-ide-palette",
  "data-ide-menu",
  "data-ide-view-menu",
  "data-ide-theme-menu",
  "data-ide-cheatsheet",
] as const;

const esc = (s: string) => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");

/** Implicit-role element selectors — a bare `<button>` satisfies the `button` role entry. */
const ROLE_TAGS: Record<string, string> = {
  button: "<button[\\s>]",
  heading: "<h[1-6][\\s>]",
  link: "<a[\\s>]",
  navigation: "<nav[\\s>]",
  main: "<main[\\s>]",
  list: "<(?:ul|ol)[\\s>]",
  listitem: "<li[\\s>]",
  table: "<table[\\s>]",
  img: "<img[\\s>]",
  dialog: "<dialog[\\s>]",
  region: "<section[\\s>][^>]*aria-label",
};

function hookRegex(entry: DomContractEntry): RegExp | null {
  const { hook, kind } = entry;
  switch (kind) {
    case "attr":
      return new RegExp(`\\b${esc(hook)}(?:[\\s=>/]|$)`);
    case "attr-prefix":
      return new RegExp(`\\b${esc(hook)}[\\w-]`);
    case "field":
      return new RegExp(`\\bname=["']${esc(hook)}["']`);
    case "field-prefix":
      return new RegExp(`\\bname=["'\`]${esc(hook)}`);
    case "role":
      return new RegExp(`\\brole=["']${esc(hook)}["']|${ROLE_TAGS[hook] ?? "(?!)"}`);
    case "urlparam":
    case "urlparam-prefix":
      return null; // URL state isn't DOM — parity specs assert params on the location, not markup.
  }
}

function markupOf(scope: Element | Document | string): string {
  if (typeof scope === "string") return scope;
  if ("documentElement" in scope) return scope.documentElement.outerHTML;
  return scope.outerHTML;
}

/**
 * Assert every given manifest entry is emitted inside `scope` (an Element, Document, or a markup
 * string — `renderToStaticMarkup` output or `app.request` HTML both work). `urlparam` entries are
 * skipped (a DOM scan can't see them — the journey's URL assertions own them). Returns the hooks
 * checked, so a spec can assert it didn't vacuously pass zero entries.
 */
export function expectManifestEmission(
  scope: Element | Document | string,
  entries: readonly DomContractEntry[],
): string[] {
  const html = markupOf(scope);
  const checked: string[] = [];
  for (const entry of entries) {
    const re = hookRegex(entry);
    if (!re) continue;
    checked.push(entry.hook);
    expect(
      re.test(html),
      `manifest hook ${entry.hook} (${entry.kind}) must be emitted by ${entry.emittedBy}`,
    ).toBe(true);
  }
  expect(checked.length, "parity spec must not assert a vacuous (empty) hook set").toBeGreaterThan(
    0,
  );
  return checked;
}

/**
 * The per-surface parity leg: every `required` manifest hook for `surface` (plus `extra` entries
 * the spec has fixtured the state for) is emitted in `scope`. Conditional hooks are opt-in via
 * `extra` because they only render under specific state (design/27 F2 — the parity spec exercises
 * the flipped legs explicitly).
 */
export function expectSurfaceHooks(
  scope: Element | Document | string,
  surface: DomContractSurface,
  opts: { extra?: readonly DomContractEntry[] } = {},
): string[] {
  const required = hooksForSurface(surface).filter((e) => e.role === "required");
  return expectManifestEmission(scope, [...required, ...(opts.extra ?? [])]);
}

/**
 * Component axe for the interactive manifest subset (REQ-VFY-6). happy-dom has no layout engine,
 * so the rules that need one — `color-contrast` per the design note — are disabled; every other
 * rule (names, roles, ARIA, keyboard-actionable structure) still runs. Journey-level axe remains
 * the authoritative WCAG 2.2 AA gate — this is the component pre-check that catches the same class
 * of violation before a surface's journey flip.
 */
export async function axeCheck(scope: Element | Document = document): Promise<void> {
  const results = await axe.run(scope as axe.ElementContext, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  expect(
    results.violations.map((v) => v.id),
    `axe violations: ${results.violations
      .map((v) => `${v.id} (${v.nodes.length} node(s))`)
      .join(", ")}`,
  ).toEqual([]);
}
