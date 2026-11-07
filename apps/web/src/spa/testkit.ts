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

import { expect, vi } from "vitest";
import axe from "axe-core";
import { UI_LABELS } from "@rhema/contracts";
import type { DomContractEntry, DomContractSurface } from "../dom-contract.js";
import { hooksForSurface } from "../dom-contract.js";
import { spaRuntime } from "./dom.js";

/**
 * Interactive manifest subset for component-level axe (design/27: "the manifest's interactive
 * components — the approval cards, chat composer, palette, menus"). Each token is itself a
 * manifest `attr` hook; the spec asserts `AXE_INTERACTIVE ⊆ manifest` so the subset can't drift.
 */
export const AXE_INTERACTIVE = [
  "data-gate-card",
  "data-chat-composer",
  "data-app-palette",
  "data-ide-menu",
  "data-ide-view-menu",
  "data-ide-theme-menu",
  "data-ide-cheatsheet",
] as const;

const esc = (s: string) => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");

/**
 * The ONE observable document-navigation seam (REQ-NAVM-5 / O2-F10): installs a single spy on
 * BOTH `spaRuntime` arms (`assign` + `replace`) so a spec asserts "a document nav happened"
 * without caring which history mode carried it — and can never stub `assign` alone while a
 * `replace`-arm nav (SsrHandoff) escapes unobserved. `assign`/`replace` are the whole
 * `window.location` doc-nav vocabulary, so the shared spy is complete coverage. Returns the
 * spy; pair with `restoreDocumentNav` in `afterEach`.
 */
export function stubDocumentNav(): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  spaRuntime.assign = spy;
  spaRuntime.replace = spy;
  return spy;
}

/** Restores the production `spaRuntime` arms after a `stubDocumentNav` install. */
export function restoreDocumentNav(): void {
  spaRuntime.assign = (href) => window.location.assign(href);
  spaRuntime.replace = (href) => window.location.replace(href);
}

/** REQ-ENG-1 — the settle budget. `vi.waitFor`'s 1s default flaked under CI CPU contention
 *  (the leaf's post-stamp query repaint can legitimately postdate it); 4s is headroom, not a
 *  semantic — a settle is eventual, not scheduled. */
export const SETTLE_TIMEOUT = 4000;

/**
 * REQ-ENG-1 — a mounted/settled lookup: poll until the element exists, then return it. The
 * replacement for bare `querySelector(...)!` post-mount access — the wait, not the caller,
 * owns the settle. `data-mounted` marks the router's match RESOLUTION; a leaf's own
 * query/mutation repaint can postdate it (the BL-87 mount-settle flake class — a bare `!`
 * lookup between stamp and repaint reads null), so an interaction target waits on itself.
 * Lookups nested inside an already-settled element stay bare — a settled subtree commits
 * atomically with its parent. On timeout the error carries a DOM excerpt so a flake capture
 * is self-describing (which arm rendered is the question, not just that it missed).
 */
export async function settled<T extends Element = Element>(
  selector: string,
  scope: ParentNode = document,
  opts: { timeout?: number } = {},
): Promise<T> {
  let found: T | null = null;
  try {
    await vi.waitFor(
      () => {
        found = scope.querySelector<T>(selector);
        expect(found, `selector ${selector} settles`).not.toBeNull();
      },
      { timeout: opts.timeout ?? SETTLE_TIMEOUT },
    );
  } catch (err) {
    const html =
      scope === document
        ? document.body.innerHTML
        : (scope as Element).outerHTML;
    throw new Error(
      `settled("${selector}") timed out — live DOM (first 2000 chars):\n${html.slice(0, 2000)}`,
      { cause: err },
    );
  }
  return found!;
}

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
  // REQ-GUARD-2(b) — Element/Document scopes get the no-internal-keys guard on every parity leg
  // (markup strings may carry essay/data text; spec prose surfaces apply expectNoInternalKeys
  // directly on the mounted element).
  if (typeof scope !== "string") expectNoInternalKeys(scope);
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
// ---- REQ-GUARD-2(b) (R7COPY.1a) — the no-snake_case-keys DOM guard ----
//
// Every internal key the UI must label instead of render: the union of all `UI_LABELS` map keys
// that contain an underscore (workflow / phase / kind / enum keys — `chat_turn`, `research_burst`,
// `draft_ledger`, `second_read`, `waiting_gate`…). Single-word keys are indistinguishable from
// words, so the copy lint owns those; this guard catches the machine-token class verbatim.
const INTERNAL_KEYS: readonly string[] = [
  ...new Set(
    Object.values(UI_LABELS).flatMap((m) => Object.keys(m)).filter((k) => k.includes("_")),
  ),
];
const INTERNAL_KEY_RE = new RegExp(
  `\\b(${INTERNAL_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
);

/** Subtrees whose text is DATA, not chrome: essay prose (data-pm-host) and any element a spec
 *  marks `data-copy-guard-exclude` (fixture essay/quota content). */
const COPY_GUARD_EXCLUDE = "[data-pm-host], [data-copy-guard-exclude], script, style, template";

/**
 * REQ-GUARD-2(b): assert no `snake_case` workflow/phase/kind key appears in the rendered TEXT of
 * `scope`. Element/Document scopes are scanned on their text — attributes (data-*) never enter
 * textContent, so "outside data-*" holds by construction; essay content is data and excluded via
 * `COPY_GUARD_EXCLUDE` (+ `opts.exclude`). Wired into `expectManifestEmission` for Element|Document
 * scopes, so every SPA surface render parity leg runs it; a seeded `chat_turn` in a fixture's
 * rendered text fails.
 */
export function expectNoInternalKeys(
  scope: Element | Document,
  opts: { extraExcludes?: readonly string[] } = {},
): void {
  const root = (scope === document ? document.documentElement : scope) as Element;
  const clone = root.cloneNode(true) as Element;
  const selector =
    COPY_GUARD_EXCLUDE +
    (opts.extraExcludes?.length ? ", " + opts.extraExcludes.join(", ") : "");
  for (const el of clone.querySelectorAll(selector)) el.remove();
  const text = clone.textContent ?? "";
  const hits = [...new Set([...text.matchAll(new RegExp(INTERNAL_KEY_RE, "g"))].map((m) => m[1]))];
  expect(
    hits,
    `REQ-GUARD-2: snake_case internal keys leaked into rendered text: ${hits.join(", ")}`,
  ).toEqual([]);
}

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
