// Progressive disclosure (§5.1; REQ-IDE-7/8): every control lands in one of three tiers.
//   default    — reads, writes, runs, answers.
//   on_demand  — inspects or configures (the pane/menus carry these; they need no unlock).
//   advanced   — mechanism-level; hidden until the Advanced toggle (⌘⇧M) is on, and it persists
//                per project.
// This table IS the mechanism the ticket ships; it is the single list the shell's gating reads and the
// test asserts against §5.1's named members.

export type DisclosureTier = "default" | "on_demand" | "advanced";

export const CONTROL_DISCLOSURE: Readonly<Record<string, DisclosureTier>> = {
  // ---- default — read / write / run / answer ----
  "page.read": "default",
  "page.write": "default",
  "timeline.next-step": "default",
  "timeline.verb.draft": "default",
  "timeline.verb.review": "default",
  "timeline.verb.revise": "default",
  "approval.answer": "default",
  "margin.findings": "default",
  "status-bar": "default",
  // ---- on demand — inspect / configure ----
  "files.pane": "on_demand",
  "desk.chat": "on_demand",
  "desk.feed": "on_demand",
  "desk.findings": "on_demand",
  "desk.claims": "on_demand",
  "run.report": "on_demand",
  "rigor.notch": "on_demand",
  "approval.policy": "on_demand",
  "diff.view": "on_demand",
  "view.menu": "on_demand",
  "pane.toggles": "on_demand",
  "theme.control": "on_demand",
  "paper.control": "on_demand",
  "font.preset": "on_demand",
  "reader.stepper": "on_demand",
  // ---- advanced — mechanism (⌘⇧M; §5.1 lists these verbatim) ----
  "view.source": "advanced",
  // P1.02 — the Page's block-level Authorship overlay is a View-menu (Advanced) toggle (REQ-POS-8).
  "view.authorship": "advanced",
  "raw.tokens": "advanced",
  "model.tier": "advanced",
  "model.names": "advanced",
  "memory.files": "advanced",
  "restore.old": "advanced",
  "feed.verbose": "advanced",
};

/** Is a control rendered? Only 'advanced' tier controls are gated — by the persisted Advanced toggle. */
export function controlVisible(controlId: string, advanced: boolean): boolean {
  const tier = CONTROL_DISCLOSURE[controlId];
  if (tier === undefined) return true; // unclassified controls render (the table is an opt-in gate)
  return tier !== "advanced" || advanced;
}
