// REQ-WRITE-8 (239; B15) — the paper policy must hold BEFORE first paint on SPA navigations,
// not just on hard loads. The shell's boot script resolves `data-paper` once per document; an
// in-app client navigation into `/p/:slug` needs the same pre-paint resolution, or the paper
// flashes dark→light (B15's exact symptom). The localStorage mirror is the offline source; the
// twin's `paperTheme` reconciles the server truth afterwards (and rewrites the mirror).

import { parsePaperTheme, paperStorageKey, type PaperTheme } from "@rhema/ide";

/** `/p/<slug>/…` or `/demo/<essay>/…` → slug (the demo alias maps to `demo~<essay>`), else null. */
export function projectSlugForPath(pathname: string): string | null {
  const segs = pathname.split("/").filter((s) => s !== "");
  if (segs[0] === "p" && segs[1] != null) return segs[1];
  if (segs[0] === "demo" && segs[1] != null) return `demo~${segs[1]}`;
  return null;
}

/** private-mode-safe localStorage access (a denied write degrades the pref to session-only). */
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* session-only */
    }
  },
};

/**
 * Pre-paint paper resolution for a navigation target (REQ-WRITE-8): mirror exists ⇒ stored
 * policy; else the project default `light` (the twin reconciles only on a real difference).
 * A non-project path clears both attributes — no project context, no paper policy.
 */
export function applyPaperForPath(pathname: string): void {
  const doc = document.documentElement;
  const slug = projectSlugForPath(pathname);
  if (slug == null) {
    doc.removeAttribute("data-project");
    doc.removeAttribute("data-paper");
    return;
  }
  doc.setAttribute("data-project", slug);
  const stored = store.get(paperStorageKey(slug));
  doc.setAttribute("data-paper", stored != null ? parsePaperTheme(stored) : "light");
}

/** Reconcile the server truth when the project twin lands — only on a real difference (the
 *  mirror arm already painted the right value, so there is no second paper state). */
export function reconcilePaperTheme(slug: string, policy: PaperTheme | string | null | undefined): void {
  if (policy == null) return;
  const resolved = parsePaperTheme(policy);
  const doc = document.documentElement;
  if (doc.getAttribute("data-paper") !== resolved) doc.setAttribute("data-paper", resolved);
  store.set(paperStorageKey(slug), resolved);
}
