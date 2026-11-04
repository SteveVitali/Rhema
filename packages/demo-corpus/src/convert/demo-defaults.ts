// The REQ-CONV-16 demo defaults — the operator's accepted "Accept all defaults" ruling
// (GD-DEMO-CONV.R7; R2 § Open questions 1, 2, 4) as ONE declared constant set. This module owns
// the set: 217's response rows, 218's raw-table view and 218a's dossier import it, never restate
// it (ticket 216 Notes).

import type { FindingKind, Severity } from "@rhema/contracts";
import type { LETTER_SECTIONS } from "@rhema/contracts";

type LetterSection = (typeof LETTER_SECTIONS.options)[number];

export const DEMO_DEFAULTS = {
  /**
   * R2 open question 1 (recommended, accepted): the letter's "the one thing" finding is
   * `severity: "major"` under `letterSection: "one_thing"` — the corpus never uses "blocking"
   * (grep: 0 occurrences), so the demo invents none.
   */
  oneThing: {
    severity: "major" as Severity,
    letterSection: "one_thing" as LetterSection,
  },
  /**
   * R2 open question 2 (recommended, accepted): letter strengths are emitted as `note` rows
   * under `letterSection: "strength"` (the dossier's letter-section refs and the tour's
   * "protect these" beat need them; REQ-COPY-4's count rule already counts them as strengths).
   */
  strength: {
    kind: "craft" as FindingKind,
    severity: "note" as Severity,
    letterSection: "strength" as LetterSection,
  },
  /** No `blocking` severity is ever emitted into demo data — asserted in tests, not just
   *  documented. */
  blockingPermitted: false,
  /**
   * R2 open question 4 (recommended, accepted): response-ledger rows that answer dossier notes
   * (ledger, discourse, argument and craft notes, self — sources with no finding) appear only in
   * the raw ledger table; no findings are synthesized for them. 217 reads this; it never
   * restates it.
   */
  unrepresentedResponseRows: "raw_table_only",
} as const;
